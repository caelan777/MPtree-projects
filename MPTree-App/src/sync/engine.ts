import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { Account, Sync, System } from "../plugins";
import { collectSettings, restoreSettings } from "../storage";
import { hasPro, subscribePro } from "../pro";
import type { Song, SongMeta, Playlist } from "../types";
import { openDrive, type Drive, type DriveFile } from "./drive";
import {
  buildLocal, merge, apply, missingFrom, coverRefs, same, fileOf,
  type LibDoc, type Applied, type Inventory,
} from "./model";
import { startOffer, answerOffer, acceptAnswer, opened, close, runTransfer, type Session } from "./rtc";

// ─── THE MPTREE ACCOUNT ──────────────────────────────────────────────────────
//
// Part of MPTree Pro. Sign in with Google, and on up to three phones:
//
//   saved in the account   everything a person made or set: playlists, likes,
//                          play counts, names, lyrics, covers, the bin, cut
//                          tracks, settings and look. One file, library.json,
//                          in their own Drive's app folder (model.ts).
//   not saved in it        the songs. Those go from phone to phone, so every
//                          phone ends up with all of them. Straight across when
//                          both phones have MPTree open (rtc.ts); otherwise the
//                          one that has a song leaves it in the app folder, the
//                          one that needs it takes it, and it is deleted from
//                          Drive the moment it has arrived.
//
// Files in the app folder:
//   devices.json          the phones on the account, three at most
//   library.json          the account itself
//   covers.json           cover pictures, by hash
//   inv-<phone>.json      the song files on that phone
//   peer-<phone>.json     "I am open now", and the WebRTC offer or answer
//   relay-<to>-<fp>       a song waiting for phone <to>
//
// Nothing runs while the app is in the background: Android freezes the WebView
// there, which is fine, because both phones being open is the point.

const MAX_DEVICES = 3;
const LIB = "library.json", DEVICES = "devices.json", COVERS = "covers.json";
const inv = (id: string) => `inv-${id}.json`;
const peer = (id: string) => `peer-${id}.json`;
const relayPrefix = (to: string) => `relay-${to}-`;

const KEY_ACCOUNT = "mptree_account";
const KEY_BASE = "mptree_sync_base";

/** A phone counts as open when it said so this recently. */
const ONLINE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
const LIBRARY_EVERY = 60_000;
const SONGS_EVERY = 5_000;
/** How often to look when no other phone is open. */
const SONGS_IDLE = 30_000;
/** How much may wait in Drive for one phone at a time. */
const RELAY_BUDGET = 1024 * 1024 * 1024;
/** After a direct connection fails, use Drive for this long. */
const DIRECT_PAUSE = 10 * 60_000;

// ── State, for the UI ─────────────────────────────────────────────────────────

export type Device = { id: string; name: string; addedAt: number };

export type Moving = { dir: "in" | "out"; name: string; done: number; total: number; via: "direct" | "drive"; peer: string };

export type SyncState = {
  /** off: signed out. joining: signing in. limit: three phones already, pick one
   *  to take off. on: signed in. removed: another phone took this one off. */
  phase: "off" | "joining" | "limit" | "on" | "removed";
  account?: { email: string; name: string; photo?: string };
  deviceId?: string;
  devices: Device[];
  /** Signed in, but Pro ran out (the free week ended). Nothing moves. */
  pausedNoPro: boolean;
  saving: boolean;
  lastSaved?: number;
  /** Something went wrong on the last try, in plain words. */
  problem?: "offline" | "drive" | "signin" | null;
  songs: {
    here: number;
    /** On other phones and not on this one. */
    missing: number;
    /** On this phone and not on at least one other. */
    theyMiss: number;
    moving?: Moving;
    /** Songs that came in since the app opened. */
    arrived: number;
    /** Phones that have songs this one needs but are not open right now. */
    waitingOn: string[];
    note?: "wifi" | "drive-full" | "phone-full" | null;
  };
  mobileData: boolean;
};

const initial: SyncState = {
  phase: "off", devices: [], pausedNoPro: false, saving: false,
  songs: { here: 0, missing: 0, theyMiss: 0, arrived: 0, waitingOn: [] },
  mobileData: false,
};

let state: SyncState = initial;
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const setSongs = (patch: Partial<SyncState["songs"]>) => set({ songs: { ...state.songs, ...patch } });
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snap = () => state;

export function useSync(): SyncState { return useSyncExternalStore(subscribe, snap, snap); }
export function getSync(): SyncState { return state; }

// ── The app, as the engine sees it ────────────────────────────────────────────

export type Host = {
  snapshot(): { songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[] };
  /** Put the account's version in place, and save it. */
  apply(a: Applied): Promise<void>;
  /** Songs arrived in Music/MPTree: scan again. */
  rescan(): Promise<void>;
  /** Settings came in from another phone and are stored: show them. */
  settings(): Promise<void>;
};

let host: Host | null = null;

// ── Stored on the phone ───────────────────────────────────────────────────────

type StoredAccount = { email: string; name: string; photo?: string; since: number; mobileData?: boolean };
type Base = { deviceId: string; email: string; doc: LibDoc; keys: string[]; inv?: string };

async function readJson<T>(key: string): Promise<T | null> {
  try { const { value } = await Preferences.get({ key }); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
const writeJson = (key: string, v: unknown) => Preferences.set({ key, value: JSON.stringify(v) }).catch(() => {});

let stored: StoredAccount | null = null;
let deviceId = "";

// ── Drive, with tokens ────────────────────────────────────────────────────────

let token: { value: string; at: number } | null = null;
let drive: Drive | null = null;
const isDev = () => token?.value === "dev";

async function getToken(): Promise<string> {
  if (token && Date.now() - token.at < 40 * 60_000) return token.value;
  const r = await Account.getToken({ email: stored?.email });
  token = { value: r.token, at: Date.now() };
  return r.token;
}

function connect(): Drive {
  drive ??= openDrive({
    get: getToken,
    renew: async bad => {
      token = null;
      await Account.clearToken({ token: bad }).catch(() => {});
      return getToken();
    },
  }, isDev());
  return drive;
}

/** Latest listing of the app folder, by name. */
let files = new Map<string, DriveFile>();
async function listFiles(): Promise<Map<string, DriveFile>> {
  const all = await connect().list();
  files = new Map(all.map(f => [f.name, f]));
  return files;
}

/** Reads a JSON file, from a cache when Drive says it has not changed. */
const cache = new Map<string, { at: string; body: unknown }>();
async function readFile<T>(name: string): Promise<T | null> {
  const f = files.get(name);
  if (!f) return null;
  const hit = cache.get(name);
  if (hit && hit.at === f.modifiedTime) return hit.body as T;
  const body = await connect().read<T>(f.id);
  cache.set(name, { at: f.modifiedTime, body });
  return body;
}
async function writeFile(name: string, body: unknown): Promise<void> {
  const id = await connect().write(name, body, files.get(name)?.id);
  const f = { id, name, modifiedTime: new Date().toISOString() };
  files.set(name, f);
  cache.delete(name);
}
async function removeFile(name: string): Promise<void> {
  const f = files.get(name);
  if (!f) return;
  await connect().remove(f.id);
  files.delete(name);
}

async function readDevices(): Promise<Device[]> {
  return (await readFile<{ devices: Device[] }>(DEVICES))?.devices ?? [];
}

// ── Starting up ───────────────────────────────────────────────────────────────

export async function initSync(h: Host): Promise<void> {
  host = h;
  deviceId = (await Sync.deviceId().catch(() => ({ id: "" }))).id;
  stored = await readJson<StoredAccount>(KEY_ACCOUNT);
  if (stored) {
    set({
      phase: "on", deviceId,
      account: { email: stored.email, name: stored.name, photo: stored.photo },
      mobileData: !!stored.mobileData,
    });
    if (import.meta.env.DEV) try { if (localStorage.getItem("mptree_dev_account") === "1") token = { value: "dev", at: Date.now() }; } catch { /* no storage */ }
  }
  subscribePro(() => { refreshPro(); });
  keepChecking();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mptreeSync = { state: () => state, run: () => libraryCycle() };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(1500); });
  CapApp.addListener("resume", () => kick(1500)).catch(() => {});
  refreshPro();
}

function refreshPro() {
  const paused = !hasPro();
  if (paused !== state.pausedNoPro) set({ pausedNoPro: paused });
  if (!paused) kick(2000);
}

const active = () => state.phase === "on" && !state.pausedNoPro && !!host && document.visibilityState === "visible";

// ── Signing in and out ────────────────────────────────────────────────────────

let pendingJoin: StoredAccount | null = null;

export async function signIn(): Promise<"ok" | "cancelled" | "limit" | "failed"> {
  if (!hasPro()) return "failed";
  set({ phase: "joining", problem: null });
  try {
    const r = await Account.signIn();
    if (r.cancelled || !r.token) { set({ phase: "off" }); return "cancelled"; }
    token = { value: r.token, at: Date.now() };
    drive = null;
    const me = await connect().about();
    stored = { email: me.email, name: me.name, photo: me.photo, since: Date.now(), mobileData: false };
    set({ account: { email: me.email, name: me.name, photo: me.photo }, deviceId });
    await listFiles();
    const devices = await readDevices();
    set({ devices });
    if (!devices.some(d => d.id === deviceId) && devices.length >= MAX_DEVICES) {
      pendingJoin = stored;
      set({ phase: "limit" });
      return "limit";
    }
    return await finishJoin();
  } catch {
    set({ phase: "off", problem: "signin" });
    return "failed";
  }
}

async function phoneName(): Promise<string> {
  try {
    const d = await System.getDeviceInfo();
    const brand = d.manufacturer ? d.manufacturer[0].toUpperCase() + d.manufacturer.slice(1) : "";
    return d.model.toLowerCase().startsWith(brand.toLowerCase()) ? d.model : `${brand} ${d.model}`.trim();
  } catch { return "Phone"; }
}

async function finishJoin(): Promise<"ok" | "failed"> {
  const acc = pendingJoin ?? stored;
  pendingJoin = null;
  if (!acc) return "failed";
  const devices = await readDevices();
  if (!devices.some(d => d.id === deviceId)) {
    devices.push({ id: deviceId, name: await phoneName(), addedAt: Date.now() });
    await writeFile(DEVICES, { devices });
  }
  stored = acc;
  await writeJson(KEY_ACCOUNT, acc);
  // A base from an earlier sign-in, maybe to another account, says nothing.
  await Preferences.remove({ key: KEY_BASE }).catch(() => {});
  set({ phase: "on", devices, account: { email: acc.email, name: acc.name, photo: acc.photo } });
  await libraryCycle();
  return "ok";
}

/** Takes a phone off the account. Its songs stay on it; it just stops syncing. */
export async function removeDevice(id: string): Promise<void> {
  await listFiles();
  const devices = (await readDevices()).filter(d => d.id !== id);
  await writeFile(DEVICES, { devices });
  await forgetPhoneFiles(id);
  set({ devices });
  if (state.phase === "limit" && devices.length < MAX_DEVICES) await finishJoin();
}

async function forgetPhoneFiles(id: string) {
  for (const name of [...files.keys()]) {
    if (name === inv(id) || name === peer(id) || name.startsWith(relayPrefix(id))) await removeFile(name).catch(() => {});
  }
}

/** Signing out frees this phone's place on the account. Everything stays on
 *  the phone as it is. */
export async function signOut(): Promise<void> {
  stopTransfers();
  const email = stored?.email;
  try {
    if (state.phase === "on") {
      await listFiles();
      const devices = (await readDevices()).filter(d => d.id !== deviceId);
      await writeFile(DEVICES, { devices });
      await forgetPhoneFiles(deviceId);
    }
  } catch { /* offline: the place frees when another phone removes it */ }
  await Account.signOut({ email }).catch(() => {});
  await forget();
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

export function cancelJoin(): void {
  pendingJoin = null;
  void Account.signOut({ email: stored?.email }).catch(() => {});
  void forget();
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

async function forget() {
  stored = null; token = null; drive = null; files = new Map(); cache.clear();
  await Preferences.remove({ key: KEY_ACCOUNT }).catch(() => {});
  await Preferences.remove({ key: KEY_BASE }).catch(() => {});
}

export function dismissRemoved(): void {
  if (state.phase === "removed") set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

export async function setMobileData(on: boolean): Promise<void> {
  set({ mobileData: on });
  if (stored) { stored = { ...stored, mobileData: on }; await writeJson(KEY_ACCOUNT, stored); }
  kick(500);
}

// ── Scheduling ────────────────────────────────────────────────────────────────

let libTimer: ReturnType<typeof setTimeout> | undefined;
let everyTimer: ReturnType<typeof setInterval> | undefined;

let libDue = 0;
/** Runs a library round within `ms`. A round already due sooner stays, so a
 *  stream of small changes cannot keep pushing the save further away. */
function kick(ms: number) {
  if (!active()) return;
  const due = Date.now() + ms;
  if (libDue > Date.now() && libDue <= due) return;
  clearTimeout(libTimer);
  libDue = due;
  libTimer = setTimeout(() => { libDue = 0; void libraryCycle(); }, ms);
}

/** A round every minute while the app is open and signed in, so a change made
 *  on another phone shows up here without anyone doing anything. */
function keepChecking() {
  everyTimer ??= setInterval(() => { if (active()) void libraryCycle(); }, LIBRARY_EVERY);
}

/** The app calls this whenever something that is saved to the account changed. */
export function syncChanged(): void { kick(6000); }

// ── One round of the account ──────────────────────────────────────────────────

let running = false, again = false;
let fpByPath = new Map<string, string>();
let pathByFp = new Map<string, string>();
let myInv: Inventory = {};
let doc: LibDoc | null = null;

async function libraryCycle(): Promise<void> {
  if (!host || state.phase !== "on" || state.pausedNoPro) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const net = await Sync.network();
    if (!net.online) { set({ problem: "offline" }); return; }
    set({ saving: true });
    await listFiles();

    const devices = await readDevices();
    if (!devices.some(d => d.id === deviceId)) {
      // Another phone took this one off the account.
      stopTransfers();
      await forget();
      set({ ...initial, phase: "removed", deviceId, pausedNoPro: state.pausedNoPro });
      return;
    }
    set({ devices });

    const snapshot = host.snapshot();
    await fingerprint(snapshot.songs, snapshot.removed);
    const settings = await collectSettings();
    const local = buildLocal({ ...snapshot, settings, fpOf: p => fpByPath.get(p) });

    const base = await readJson<Base>(KEY_BASE);
    const usable = base && base.deviceId === deviceId && base.email === stored?.email ? base : null;
    const fresh = new Set<string>();
    if (usable) { const had = new Set(usable.keys); for (const k of local.speaks) if (!had.has(k)) fresh.add(k); }

    const remote = await readFile<LibDoc>(LIB);
    const merged = merge(usable?.doc ?? null, local, remote, fresh);

    // Covers: send up the ones the account lacks, fetch the ones this phone lacks.
    const refs = coverRefs(merged);
    const inAccount = new Set(remote?.covers ?? []);
    let accountCovers: Record<string, string> | null = null;
    const loadCovers = async () => accountCovers ??= (await readFile<Record<string, string>>(COVERS)) ?? {};
    const toSend = [...refs].filter(h => !inAccount.has(h) && local.covers.has(h));
    if (toSend.length || [...inAccount].some(h => !refs.has(h))) {
      const all = await loadCovers();
      const next: Record<string, string> = {};
      for (const h of refs) { const pic = all[h] ?? local.covers.get(h); if (pic) next[h] = pic; }
      await writeFile(COVERS, next);
      accountCovers = next;
      merged.covers = Object.keys(next);
    } else {
      merged.covers = [...refs].filter(h => inAccount.has(h));
    }
    if ([...refs].some(h => !local.covers.has(h))) await loadCovers();

    if (!remote || !same(merged, remote)) await writeFile(LIB, merged);
    set({ lastSaved: Date.now(), problem: null });

    // Put the account's version in place, unless the person changed something
    // meanwhile: then keep the old base and try again, so neither side is lost.
    const now = host.snapshot();
    const untouched = now.songs === snapshot.songs && now.removed === snapshot.removed
      && now.meta === snapshot.meta && now.playlists === snapshot.playlists;
    if (untouched) {
      const out = apply(merged, {
        ...snapshot, settings,
        fpOf: p => fpByPath.get(p), pathOf: fp => pathByFp.get(fp),
        coverOf: h => local.covers.get(h) ?? accountCovers?.[h],
      });
      if (out.changed.songs || out.changed.removed || out.changed.meta || out.changed.playlists) await host.apply(out);
      if (out.settings) { await restoreSettings(out.settings); await host.settings(); }
      const invHash = await sendInventory(usable?.inv);
      await writeJson(KEY_BASE, { deviceId, email: stored!.email, doc: merged, keys: [...local.speaks], inv: invHash } satisfies Base);
    } else {
      again = true;
    }
    doc = merged;
    setSongs({ here: Object.keys(myInv).filter(fp => !merged.songs[fp]?.bin).length });
    await songsCycle();
  } catch (e) {
    set({ problem: (e as { code?: string })?.code === "NEEDS_SIGN_IN" ? "signin" : "drive" });
  } finally {
    running = false;
    set({ saving: false });
    if (again) { again = false; kick(3000); }
  }
}

async function fingerprint(songs: Song[], removed: Song[]) {
  const paths = new Set<string>();
  for (const s of [...songs, ...removed]) paths.add(s.uri);
  const { items } = await Sync.fingerprints({ paths: [...paths] });
  fpByPath = new Map();
  pathByFp = new Map();
  myInv = {};
  for (const it of items) {
    fpByPath.set(it.path, it.fp);
    if (!pathByFp.has(it.fp)) pathByFp.set(it.fp, it.path);
    myInv[it.fp] = [it.size, it.path.split("/").pop() ?? "song.mp3"];
  }
}

/** Writes this phone's song list when it changed. Resolves its hash. */
async function sendInventory(last?: string): Promise<string> {
  const keys = Object.keys(myInv).sort();
  const h = keys.join(",");
  const hash = `${keys.length}:${h.length}:${h.slice(0, 64)}:${h.slice(-64)}`;
  if (hash !== last || !files.has(inv(deviceId))) await writeFile(inv(deviceId), { fps: myInv });
  return hash;
}

// ── Songs ─────────────────────────────────────────────────────────────────────

type PeerNote = { seen: number; offer?: { to: string; sid: string; sdp: string }; answer?: { to: string; sid: string; sdp: string } };

let songTimer: ReturnType<typeof setTimeout> | undefined;
let lastBeat = 0;
let myNote: PeerNote = { seen: 0 };
const directPaused = new Map<string, number>();
let session: { peer: string; s: Session; sid: string; stop?: () => void } | null = null;
let answeredSid = "";
/** Set while a direct connection is being set up, before session exists. */
let connecting = false;
/** Songs on the other phones, from their lists: fp -> [size, name]. */
const elsewhere = new Map<string, [number, string]>();
let relaying = false;

function stopTransfers() {
  clearTimeout(songTimer);
  if (session) { session.stop?.(); close(session.s); session = null; }
  setSongs({ moving: undefined });
}

function scheduleSongs(ms = SONGS_EVERY) {
  clearTimeout(songTimer);
  songTimer = setTimeout(() => { void songsCycle(true); }, ms);
}

const nameOf = (id: string) => state.devices.find(d => d.id === id)?.name ?? "";

async function songsCycle(relist = false): Promise<void> {
  if (!active() || !doc || isDev()) return;
  const others = state.devices.filter(d => d.id !== deviceId);
  if (!others.length) { setSongs({ missing: 0, theyMiss: 0, waitingOn: [], note: null }); return; }
  try {
    if (relist) {
      await listFiles();
      // Another phone saved the account meanwhile: take it in now.
      const lib = files.get(LIB);
      if (lib && lib.modifiedTime !== cache.get(LIB)?.at) kick(500);
    }
    const invs = new Map<string, Inventory>();
    const notes = new Map<string, PeerNote>();
    for (const d of others) {
      invs.set(d.id, (await readFile<{ fps: Inventory }>(inv(d.id)))?.fps ?? {});
      const n = await readFile<PeerNote>(peer(d.id));
      if (n) notes.set(d.id, n);
    }
    for (const i of invs.values()) for (const [fp, v] of Object.entries(i)) elsewhere.set(fp, v);
    const isOpen = (id: string) => (notes.get(id)?.seen ?? 0) > Date.now() - ONLINE_MS;

    const need = missingFrom(myInv, [...invs.values()], doc);
    const theyNeed = new Map<string, Inventory>();
    for (const d of others) theyNeed.set(d.id, missingFrom(invs.get(d.id)!, [myInv], doc));
    const theyMiss = new Set<string>();
    for (const m of theyNeed.values()) for (const fp of Object.keys(m)) theyMiss.add(fp);

    const net = await Sync.network();
    const canMove = net.unmetered || state.mobileData;
    const waitingOn = others.filter(d => !isOpen(d.id) && Object.keys(need).some(fp => invs.get(d.id)![fp])).map(d => d.name);
    setSongs({
      missing: Object.keys(need).length, theyMiss: theyMiss.size, waitingOn,
      note: (Object.keys(need).length || theyMiss.size) && !canMove ? "wifi" : state.songs.note === "wifi" ? null : state.songs.note,
    });

    const pending = Object.keys(need).length > 0 || theyMiss.size > 0 || [...files.keys()].some(n => n.startsWith(relayPrefix(deviceId)));
    if (!pending) { if (myNote.offer || myNote.answer) { myNote = { seen: Date.now() }; await writeFile(peer(deviceId), myNote); } return; }

    // "I am open", so the other phone knows to go direct.
    if (Date.now() - lastBeat > HEARTBEAT_MS) {
      myNote = { ...myNote, seen: Date.now() };
      await writeFile(peer(deviceId), myNote);
      lastBeat = Date.now();
    }
    if (!canMove) { scheduleSongs(SONGS_IDLE); return; }

    // Direct. The phone with the lower id offers; the other answers any offer
    // meant for it, even if its own lists say there is nothing to swap: the
    // other phone may know better.
    const wantFrom = (id: string) => Object.keys(need).filter(fp => invs.get(id)![fp]);
    if (!session && !connecting) {
      for (const d of others) {
        const note = notes.get(d.id);
        if (isOpen(d.id) && note?.offer?.to === deviceId && note.offer.sid !== answeredSid) {
          void answer(d.id, note.offer.sid, note.offer.sdp, wantFrom(d.id));
          break;
        }
      }
    }
    if (!session && !connecting) {
      for (const d of others) {
        const swap = wantFrom(d.id).length > 0 || Object.keys(theyNeed.get(d.id)!).length > 0;
        if (!swap || !isOpen(d.id) || deviceId > d.id || (directPaused.get(d.id) ?? 0) > Date.now()) continue;
        void offer(d.id, wantFrom(d.id));
        break;
      }
    }

    // Through Drive: take what waits here, leave what closed phones need.
    if (!relaying) {
      relaying = true;
      try {
        await takeRelayed();
        for (const d of others) {
          const direct = isOpen(d.id) && (directPaused.get(d.id) ?? 0) <= Date.now();
          if (!direct) await leaveFor(d.id, theyNeed.get(d.id)!);
        }
      } finally { relaying = false; }
    }
    if (active()) scheduleSongs(others.some(d => isOpen(d.id)) ? SONGS_EVERY : SONGS_IDLE);
    return;
  } catch { /* next round */ }
  if (active()) scheduleSongs(SONGS_IDLE);
}

// ── Direct ──

const find = (fp: string) => {
  const path = pathByFp.get(fp);
  const v = myInv[fp];
  return path && v ? { fp, path, size: v[0], name: v[1] } : null;
};

function hooksFor(peerId: string, want: string[]) {
  let arrived = 0;
  return {
    want,
    find,
    onSaved: (fp: string, path: string | null) => {
      arrived++;
      // Known here at once, so the next round does not ask for it again.
      const v = elsewhere.get(fp);
      if (path) { myInv[fp] = [v?.[0] ?? 0, path.split("/").pop() ?? "song.mp3"]; pathByFp.set(fp, path); }
      setSongs({ arrived: state.songs.arrived + 1 });
    },
    onProgress: (p: { dir: "in" | "out"; name: string; done: number; total: number }) =>
      setSongs({ moving: { ...p, via: "direct", peer: nameOf(peerId) } }),
    onEnd: (r: { received: number; sent: number; error?: string }) => {
      session = null;
      setSongs({ moving: undefined });
      // A short pause either way, so both phones can update their lists first.
      directPaused.set(peerId, Date.now() + (r.error && r.received + r.sent === 0 ? DIRECT_PAUSE : 15_000));
      if (arrived) void host?.rescan().then(() => kick(1000)); else kick(5000);
    },
  };
}

async function waitForNote(peerId: string, test: (n: PeerNote) => boolean, ms: number): Promise<PeerNote | null> {
  const until = Date.now() + ms;
  while (Date.now() < until && active()) {
    await new Promise(r => setTimeout(r, 3000));
    await listFiles();
    const n = await readFile<PeerNote>(peer(peerId));
    if (n && test(n)) return n;
  }
  return null;
}

async function offer(peerId: string, want: string[]) {
  const sid = Math.random().toString(36).slice(2, 10);
  let s: Session | null = null;
  connecting = true;
  try {
    const o = await startOffer();
    s = o.session;
    session = { peer: peerId, s, sid };
    myNote = { seen: Date.now(), offer: { to: peerId, sid, sdp: o.offer } };
    await writeFile(peer(deviceId), myNote);
    const n = await waitForNote(peerId, x => x.answer?.to === deviceId && x.answer.sid === sid, 45_000);
    if (!n?.answer) throw new Error("no answer");
    await acceptAnswer(s, n.answer.sdp);
    const dc = await opened(s, 20_000);
    session.stop = runTransfer(dc, s, hooksFor(peerId, want));
  } catch {
    close(s);
    session = null;
    directPaused.set(peerId, Date.now() + DIRECT_PAUSE);
  } finally {
    connecting = false;
    myNote = { seen: Date.now() };
    await writeFile(peer(deviceId), myNote).catch(() => {});
  }
}

async function answer(peerId: string, sid: string, sdp: string, want: string[]) {
  answeredSid = sid;
  let s: Session | null = null;
  connecting = true;
  try {
    const a = await answerOffer(sdp);
    s = a.session;
    session = { peer: peerId, s, sid };
    myNote = { seen: Date.now(), answer: { to: peerId, sid, sdp: a.answer } };
    await writeFile(peer(deviceId), myNote);
    const dc = await opened(s, 30_000);
    session.stop = runTransfer(dc, s, hooksFor(peerId, want));
  } catch {
    close(s);
    session = null;
    directPaused.set(peerId, Date.now() + DIRECT_PAUSE);
  } finally {
    connecting = false;
  }
}

// ── Through Drive ──

async function takeRelayed() {
  const waiting = [...files.values()].filter(f => f.name.startsWith(relayPrefix(deviceId)));
  let arrived = 0;
  for (const f of waiting) {
    if (!active()) break;
    const fp = f.appProperties?.fp ?? "";
    if (!fp || myInv[fp]) { await removeFile(f.name).catch(() => {}); continue; }
    const name = f.appProperties?.name ?? "song.mp3";
    const size = Number(f.size ?? -1);
    const tid = "relay-" + fp;
    const from = nameOf(f.appProperties?.from ?? "");
    setSongs({ moving: { dir: "in", name, done: 0, total: size, via: "drive", peer: from } });
    const sub = await Sync.addListener("progress", p => {
      if (p.tid === tid) setSongs({ moving: { dir: "in", name, done: p.done, total: size, via: "drive", peer: from } });
    });
    try {
      await Sync.driveDownload({ token: await getToken(), fileId: f.id, tid, size });
      await Sync.finishFile({ tid, name, size });
      myInv[fp] = [size, name];
      arrived++;
      setSongs({ arrived: state.songs.arrived + 1 });
      await removeFile(f.name).catch(() => {});
    } catch (e) {
      if ((e as { code?: string })?.code === "FULL") { setSongs({ note: "phone-full" }); break; }
    } finally {
      sub.remove();
    }
  }
  setSongs({ moving: undefined });
  if (arrived) { await host?.rescan(); kick(1500); }
}

async function leaveFor(to: string, theirs: Inventory) {
  const prefix = relayPrefix(to);
  const waiting = [...files.values()].filter(f => f.name.startsWith(prefix));
  let used = waiting.reduce((n, f) => n + Number(f.size ?? 0), 0);
  const already = new Set(waiting.map(f => f.appProperties?.fp));
  for (const [fp] of Object.entries(theirs)) {
    if (!active() || session) break;
    if (already.has(fp)) continue;
    const song = find(fileOf(fp));
    if (!song || used + song.size > RELAY_BUDGET) continue;
    const tid = "up-" + fp;
    const to_ = nameOf(to);
    setSongs({ moving: { dir: "out", name: song.name, done: 0, total: song.size, via: "drive", peer: to_ } });
    const sub = await Sync.addListener("progress", p => {
      if (p.tid === tid) setSongs({ moving: { dir: "out", name: song.name, done: p.done, total: song.size, via: "drive", peer: to_ } });
    });
    try {
      const { id } = await Sync.driveUpload({
        token: await getToken(), path: song.path, name: prefix + fp, tid,
        appProperties: { fp, name: song.name, from: deviceId },
      });
      files.set(prefix + fp, { id, name: prefix + fp, modifiedTime: new Date().toISOString(), size: String(song.size), appProperties: { fp, name: song.name, from: deviceId } });
      used += song.size;
    } catch (e) {
      if (/storageQuotaExceeded|quota/i.test(String((e as Error)?.message))) { setSongs({ note: "drive-full" }); break; }
    } finally {
      sub.remove();
    }
  }
  setSongs({ moving: undefined });
}
