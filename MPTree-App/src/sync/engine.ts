import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { Account, Sync, System, MusicScanner } from "../plugins";
import { collectSettings, restoreSettings, loadOwnLibrary, saveOwnLibrary, setLibraryScope } from "../storage";
import { hasPro, subscribePro } from "../pro";
import { findSuspects } from "../cleanup";
import type { Song, SongMeta, Playlist } from "../types";
import { openDrive, type Drive, type DriveFile } from "./drive";
import {
  buildLocal, merge, apply, missingFrom, coverRefs, same, fileOf, songSig, sigsOf,
  overlay, applyEdit, combine, spread, summarize, isEmptySummary,
  type LibDoc, type LocalDoc, type Applied, type Inventory, type Summary, type Combined,
} from "./model";
import { startOffer, answerOffer, acceptAnswer, opened, close, runTransfer, type Session } from "./rtc";

// ─── THE MPTREE ACCOUNT ──────────────────────────────────────────────────────
//
// Part of MPTree Pro. Sign in with Google on up to three phones. Every phone
// stays exactly as it is: its own playlists, likes, names, bin and settings.
// Nothing is merged, so signing in asks nothing.
//
//   saved in the account   each phone's library, as that phone has it, in the
//                          person's own Drive app folder. Under the header
//                          card the list can show another phone's library, or
//                          all of them laid over each other (model.ts).
//   not saved in it        the songs. Those go from phone to phone, so every
//                          phone ends up with all of them. Straight across when
//                          both phones have MPTree open (rtc.ts); otherwise the
//                          one that has a song leaves it in the app folder, the
//                          one that needs it takes it, and it is deleted from
//                          Drive the moment it has arrived.
//
// A change made while looking at another phone is a proposal. Everyone sees it
// straight away; the next time that phone opens MPTree its owner is asked, and
// declining puts it back everywhere.
//
// Voice notes, recordings and clips under a minute (cleanup.ts) stay on the
// phone they are on, and a song deleted on a phone outside MPTree is not sent
// back to it.
//
// Files in the app folder:
//   devices.json          the phones on the account, three at most
//   lib-<phone>.json      that phone's library; stays when the phone leaves,
//                         so it can be taken over by a new phone
//   covers-<phone>.json   its cover pictures, by hash
//   prop-<to>-<from>.json changes <from> proposes to <to>'s library
//   inv-<phone>.json      the songs that phone shares, and the ones it threw out
//   peer-<phone>.json     "I am open now", and the WebRTC offer or answer
//   relay-<to>-<fp>       a song waiting for phone <to>
//
// Nothing runs while the app is in the background: Android freezes the WebView
// there, which is fine, because both phones being open is the point.

const MAX_DEVICES = 3;
const DEVICES = "devices.json";
const lib = (id: string) => `lib-${id}.json`;
const coversOf = (id: string) => `covers-${id}.json`;
const prop = (to: string, from: string) => `prop-${to}-${from}.json`;
const inv = (id: string) => `inv-${id}.json`;
const peer = (id: string) => `peer-${id}.json`;
const relayPrefix = (to: string) => `relay-${to}-`;

const KEY_ACCOUNT = "mptree_account";
/** The song files on this phone last round, to notice one deleted outside MPTree. */
const KEY_FILES = "mptree_sync_files";
/** Songs deleted on this phone outside MPTree: not fetched again. */
const KEY_SKIP = "mptree_sync_skip";
/** Songs that came from other phones, for "remove them when signing out". */
const KEY_RECEIVED = "mptree_sync_received";
/** Songs moved over mobile data today. */
const KEY_MOBILE = "mptree_sync_mobile";

/** A phone counts as open when it said so this recently. */
const ONLINE_MS = 60_000;
const HEARTBEAT_MS = 20_000;
/** Every phone says "still here" at least this often, for "last used". */
const ALIVE_MS = 6 * 60 * 60_000;
const LIBRARY_EVERY = 60_000;
const SONGS_EVERY = 5_000;
/** How often to look when no other phone is open. */
const SONGS_IDLE = 30_000;
/** How much may wait in Drive for one phone at a time. */
const RELAY_BUDGET = 1024 * 1024 * 1024;
/** A song left in Drive this long is deleted from it, taken or not. */
const RELAY_MAX_AGE = 30 * 24 * 60 * 60_000;
/** After a direct connection fails, use Drive for this long. */
const DIRECT_PAUSE = 10 * 60_000;
/** Always left free on a phone. */
const ROOM_MARGIN = 500 * 1024 * 1024;
/** At most this much over mobile data a day, when that is allowed at all. */
export const MOBILE_DAILY = 500 * 1024 * 1024;
/** A phone of the same name not used for this long is replaced on joining. */
const STALE_DEVICE = 30 * 24 * 60 * 60_000;

// ── State, for the UI ─────────────────────────────────────────────────────────

export type Device = { id: string; name: string; addedAt: number; lastActive?: number };

export type Moving = { dir: "in" | "out"; name: string; done: number; total: number; via: "direct" | "drive"; peer: string };

/** Changes another phone proposed to this one's library. */
export type Incoming = { from: string; fromName: string; at: number; summary: Summary };

/** "me", another phone's id, or "all". */
export type View = string;

export type SyncState = {
  /** off: signed out. joining: signing in. limit: three phones already, take
   *  one off. on: signed in. removed: taken off the account from another
   *  phone, or the account was emptied. */
  phase: "off" | "joining" | "limit" | "on" | "removed";
  removedWhy?: "phone" | "emptied";
  account?: { email: string; name: string; photo?: string };
  deviceId?: string;
  devices: Device[];
  /** Phones that left the account; their libraries can still be taken over. */
  oldPhones: { id: string; name: string; at: number }[];
  /** Whose library the list shows. */
  view: View;
  incoming: Incoming[];
  /** Phones this one proposed changes to that have not answered yet. */
  waitingFor: string[];
  /** The latest answer to a proposal from this phone, for a note. */
  answer?: { name: string; accepted: boolean; at: number };
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
    note?: "wifi" | "drive-full" | "phone-full" | "mobile-limit" | null;
    /** With note phone-full: what the missing songs need, and what is free. */
    needBytes?: number;
    freeBytes?: number;
    /** Songs waiting in Drive, for any phone. */
    inDrive: { count: number; bytes: number };
    /** Voice notes and short clips, which stay where they are. */
    notShared: number;
    /** Deleted here outside MPTree, so not fetched again. */
    skipped: number;
    /** Came from other phones; can go when signing out. */
    received: number;
    /** In the list of the phone being looked at, not on this phone yet. */
    notHereInView: number;
  };
  mobileData: boolean;
};

const initialSongs: SyncState["songs"] = {
  here: 0, missing: 0, theyMiss: 0, arrived: 0, waitingOn: [],
  inDrive: { count: 0, bytes: 0 }, notShared: 0, skipped: 0, received: 0, notHereInView: 0,
};
const initial: SyncState = {
  phase: "off", devices: [], oldPhones: [], view: "me", incoming: [], waitingFor: [],
  pausedNoPro: false, saving: false, songs: initialSongs, mobileData: false,
};

let state: SyncState = initial;
const listeners = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
const setSongs = (patch: Partial<SyncState["songs"]>) => {
  const was = !!state.songs.moving;
  set({ songs: { ...state.songs, ...patch } });
  // The screen stays on while a song is on its way: with it off, Android
  // pauses the app and the song with it.
  const now = !!state.songs.moving;
  if (was !== now) Sync.keepScreenOn({ on: now }).catch(() => {});
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snap = () => state;

export function useSync(): SyncState { return useSyncExternalStore(subscribe, snap, snap); }
export function getSync(): SyncState { return state; }

// ── The app, as the engine sees it ────────────────────────────────────────────

export type Host = {
  /** What the list shows now: this phone's library, or another view. */
  snapshot(): { songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[] };
  /** Put this library on screen and save it (where the library scope says). */
  apply(a: Applied): Promise<void>;
  /** Load this phone's own library from storage onto the screen again. */
  showOwn(): Promise<void>;
  /** Songs arrived in Music/MPTree: scan again. */
  rescan(): Promise<void>;
  /** Settings were changed from outside: show them. */
  settings(): Promise<void>;
  /** Deletes these files from the phone, and the songs from the library and
   *  the bin. Resolves how many went. */
  deleteFiles(paths: string[]): Promise<number>;
};

let host: Host | null = null;

// ── Stored on the phone ───────────────────────────────────────────────────────

type StoredAccount = { email: string; name: string; photo?: string; since: number; mobileData?: boolean };

async function readJson<T>(key: string): Promise<T | null> {
  try { const { value } = await Preferences.get({ key }); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
const writeJson = (key: string, v: unknown) => Preferences.set({ key, value: JSON.stringify(v) }).catch(() => {});

/** A set of fingerprints kept in Preferences. */
function storedSet(key: string) {
  let cur = new Set<string>();
  return {
    async load() { cur = new Set(await readJson<string[]>(key) ?? []); return cur; },
    get: () => cur,
    async save(next: Set<string>) { cur = next; await writeJson(key, [...next]); },
  };
}
const skipped = storedSet(KEY_SKIP);
const received = storedSet(KEY_RECEIVED);
const lastFiles = storedSet(KEY_FILES);

let stored: StoredAccount | null = null;
let deviceId = "";

// ── Drive, with tokens ────────────────────────────────────────────────────────

let token: { value: string; at: number } | null = null;
let drive: Drive | null = null;
const isDev = () => token?.value === "dev";

async function getToken(): Promise<string> {
  if (token && Date.now() - token.at < 40 * 60_000) return token.value;
  const r = await Account.getToken({ email: stored?.email ?? pendingJoin?.email });
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

/** The phones on the account, each with when it was last used: the last time
 *  it said anything in its peer file. */
async function readDevices(): Promise<Device[]> {
  const list = (await readFile<{ devices: Device[] }>(DEVICES))?.devices ?? [];
  return list.map(d => {
    const f = files.get(peer(d.id));
    return { ...d, lastActive: f ? Date.parse(f.modifiedTime) || d.addedAt : d.addedAt };
  });
}
const saveDevices = (list: Device[]) =>
  writeFile(DEVICES, { devices: list.map(d => ({ id: d.id, name: d.name, addedAt: d.addedAt })) });

type InvFile = { fps: Inventory; skip?: string[] };
type LibFile = { name: string; at: number; doc: LibDoc };
type PropFile = { from: string; fromName: string; at: number; base: LibDoc; doc: LibDoc; covers?: Record<string, string> };

// ── Starting up ───────────────────────────────────────────────────────────────

export async function initSync(h: Host): Promise<void> {
  host = h;
  deviceId = (await Sync.deviceId().catch(() => ({ id: "" }))).id;
  stored = await readJson<StoredAccount>(KEY_ACCOUNT);
  await Promise.all([skipped.load(), received.load(), lastFiles.load()]);
  if (stored) {
    set({
      phase: "on", deviceId,
      account: { email: stored.email, name: stored.name, photo: stored.photo },
      mobileData: !!stored.mobileData,
    });
    if (import.meta.env.DEV) try { if (localStorage.getItem("mptree_dev_account") === "1") token = { value: "dev", at: Date.now() }; } catch { /* no storage */ }
  } else {
    set({ deviceId });
  }
  subscribePro(() => { refreshPro(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(1500); });
  CapApp.addListener("resume", () => kick(1500)).catch(() => {});
  keepChecking();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mptreeSync = { state: () => state, run: () => libraryCycle(), signIn: () => signIn(), setView: (v: string) => setView(v) };
  refreshPro();
}

function refreshPro() {
  const paused = !hasPro();
  if (paused !== state.pausedNoPro) set({ pausedNoPro: paused });
  if (paused && state.view !== "me") void setView("me");
  if (!paused) kick(2000);
}

const active = () => state.phase === "on" && !state.pausedNoPro && !!host && document.visibilityState === "visible";

// ── Signing in ────────────────────────────────────────────────────────────────

let pendingJoin: StoredAccount | null = null;

export async function signIn(): Promise<"ok" | "cancelled" | "limit" | "failed"> {
  if (!hasPro()) return "failed";
  set({ phase: "joining", problem: null, removedWhy: undefined });
  try {
    const r = await Account.signIn();
    if (r.cancelled || !r.token) { set({ phase: "off" }); return "cancelled"; }
    token = { value: r.token, at: Date.now() };
    drive = null;
    files = new Map();
    cache.clear();
    const me = await connect().about();
    pendingJoin = { email: me.email, name: me.name, photo: me.photo, since: Date.now(), mobileData: false };
    set({ account: { email: me.email, name: me.name, photo: me.photo }, deviceId });
    return await nextJoinStep();
  } catch {
    pendingJoin = null;
    set({ phase: "off", problem: "signin" });
    return "failed";
  }
}

/** Room on the account, then in. */
async function nextJoinStep(): Promise<"ok" | "limit" | "failed"> {
  await listFiles();
  let devices = await readDevices();
  if (!devices.some(d => d.id === deviceId) && devices.length >= MAX_DEVICES) {
    // This phone again, from before a factory reset or on an older build: a
    // phone of the same name nobody has used for a month makes room itself.
    const myName = await phoneName();
    const stale = devices.find(d => baseName(d.name) === myName && Date.now() - (d.lastActive ?? d.addedAt) > STALE_DEVICE);
    if (stale) {
      devices = devices.filter(d => d.id !== stale.id);
      await saveDevices(devices);
      await forgetPhoneFiles(stale.id);
    }
  }
  set({ devices });
  if (!devices.some(d => d.id === deviceId) && devices.length >= MAX_DEVICES) {
    set({ phase: "limit" });
    return "limit";
  }
  return finishJoin();
}

async function phoneName(): Promise<string> {
  try {
    const d = await System.getDeviceInfo();
    const brand = d.manufacturer ? d.manufacturer[0].toUpperCase() + d.manufacturer.slice(1) : "";
    return d.model.toLowerCase().startsWith(brand.toLowerCase()) ? d.model : `${brand} ${d.model}`.trim();
  } catch { return "Phone"; }
}
/** "Pixel 8 (2)" is a Pixel 8. */
const baseName = (n: string) => n.replace(/ \(\d+\)$/, "");

async function finishJoin(): Promise<"ok" | "failed"> {
  const acc = pendingJoin ?? stored;
  if (!acc) return "failed";
  await listFiles();
  const devices = await readDevices();
  if (!devices.some(d => d.id === deviceId)) {
    // Two phones of the same model get told apart: "Pixel 8", "Pixel 8 (2)".
    const name = await phoneName();
    const taken = new Set(devices.map(d => d.name));
    let unique = name;
    for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
    devices.push({ id: deviceId, name: unique, addedAt: Date.now() });
    await saveDevices(devices);
  }
  if (stored?.email !== acc.email) await Promise.all([received.save(new Set()), skipped.save(new Set()), lastFiles.save(new Set())]);
  pendingJoin = null;
  stored = acc;
  await writeJson(KEY_ACCOUNT, acc);
  set({ phase: "on", devices, account: { email: acc.email, name: acc.name, photo: acc.photo } });
  await libraryCycle();
  return "ok";
}

export function cancelJoin(): void {
  const email = pendingJoin?.email;
  pendingJoin = null;
  token = null; drive = null; files = new Map(); cache.clear();
  void Account.signOut({ email }).catch(() => {});
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

/** Takes a phone off the account. Its songs stay on it; it just stops syncing.
 *  Its library stays in the account, to be taken over later. */
export async function removeDevice(id: string): Promise<void> {
  await listFiles();
  const devices = (await readDevices()).filter(d => d.id !== id);
  await saveDevices(devices);
  await forgetPhoneFiles(id);
  set({ devices });
  if (state.view === id) await setView("me");
  if (state.phase === "limit" && devices.length < MAX_DEVICES) await nextJoinStep();
  else kick(500);
}

async function forgetPhoneFiles(id: string) {
  for (const name of [...files.keys()]) {
    const proposal = /^prop-(.+?)-(.+)\.json$/.exec(name);
    if (name === inv(id) || name === peer(id) || name.startsWith(relayPrefix(id)) || (proposal && (proposal[1] === id || proposal[2] === id))) {
      await removeFile(name).catch(() => {});
    }
  }
}

/** Deletes a phone that left the account from it for good: its library too. */
export async function forgetOldPhone(id: string): Promise<void> {
  await listFiles();
  await removeFile(lib(id)).catch(() => {});
  await removeFile(coversOf(id)).catch(() => {});
  set({ oldPhones: state.oldPhones.filter(p => p.id !== id) });
}

// ── Signing out ───────────────────────────────────────────────────────────────

/** Signing out frees this phone's place on the account. Everything stays on
 *  the phone, unless removeReceived: then the songs that came from the other
 *  phones go. Its library stays in the account, like any phone that left. */
export async function signOut(removeReceived = false): Promise<number> {
  stopTransfers();
  if (state.view !== "me") await setView("me");
  const email = stored?.email;
  let removed = 0;
  if (removeReceived && host) {
    const paths = [...received.get()].map(fp => pathByFp.get(fp)).filter((p): p is string => !!p);
    removed = await host.deleteFiles(paths).catch(() => 0);
    await received.save(new Set());
  }
  try {
    if (state.phase === "on") {
      await listFiles();
      const devices = (await readDevices()).filter(d => d.id !== deviceId);
      await saveDevices(devices);
      await forgetPhoneFiles(deviceId);
    }
  } catch { /* offline: the place frees when another phone removes it */ }
  await Account.signOut({ email }).catch(() => {});
  await forget();
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
  return removed;
}

async function forget() {
  stored = null; token = null; drive = null; files = new Map(); cache.clear();
  libs.clear(); props = new Map(); lastShown = null; myDoc = null;
  await Preferences.remove({ key: KEY_ACCOUNT }).catch(() => {});
}

export function dismissRemoved(): void {
  if (state.phase === "removed") set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

export async function setMobileData(on: boolean): Promise<void> {
  set({ mobileData: on });
  if (stored) { stored = { ...stored, mobileData: on }; await writeJson(KEY_ACCOUNT, stored); }
  kick(500);
}

/** Songs deleted here are fetched again. */
export async function fetchSkippedAgain(): Promise<void> {
  await skipped.save(new Set());
  setSongs({ skipped: 0 });
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

/** The app calls this whenever something in the library changed. */
export function syncChanged(): void { kick(state.view === "me" ? 6000 : 2500); }

// ── Libraries ─────────────────────────────────────────────────────────────────

let fpByPath = new Map<string, string>();
let pathByFp = new Map<string, string>();
/** Every song file on this phone. */
let myInv: Inventory = {};
/** This phone's own library, as last written. */
let myDoc: LibDoc | null = null;
/** Every other library in the account, by phone, as written there. */
const libs = new Map<string, LibFile>();
/** Proposals, by the phone they are for. */
let props = new Map<string, PropFile[]>();
/** Covers, from every phone and proposal, by hash. */
const coverStore = new Map<string, string>();
/** Each other phone's song list, for the song lists of the views. */
const invs = new Map<string, InvFile>();

/** This phone's own library and songs, whatever the list shows. */
async function ownState(): Promise<{ songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[] }> {
  if (state.view === "me" && host) return host.snapshot();
  const own = await loadOwnLibrary();
  const { songs: scanned } = await MusicScanner.scan();
  const binned = new Set(own.removed.map(s => s.id));
  const songs = [...own.cuts.filter(s => !binned.has(s.id)), ...scanned.map(s => ({ ...s, id: s.uri })).filter(s => !binned.has(s.id))];
  return { songs, removed: own.removed, meta: own.meta, playlists: own.playlists };
}

/** A phone's library with the changes proposed to it laid over. */
function viewOf(phone: string): LibDoc | null {
  const base = phone === deviceId ? myDoc : libs.get(phone)?.doc ?? null;
  if (!base) return null;
  let doc = base;
  for (const p of props.get(phone) ?? []) doc = overlay(doc, p.base, p.doc);
  return doc;
}

async function loadCovers(phone: string) {
  const c = await readFile<Record<string, string>>(coversOf(phone)).catch(() => null);
  for (const [h, pic] of Object.entries(c ?? {})) coverStore.set(h, pic);
}

// ── One round of the account ──────────────────────────────────────────────────

let running = false, again = false;

async function libraryCycle(): Promise<void> {
  if (!host || state.phase !== "on" || state.pausedNoPro) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const net = await Sync.network();
    if (!net.online) { set({ problem: "offline" }); return; }
    set({ saving: true });
    await listFiles();

    // Emptied from Google Drive's settings: that is someone deleting their
    // account data. Stop, rather than filling it straight up again.
    if (!files.has(DEVICES)) {
      stopTransfers();
      if (state.view !== "me") await setView("me");
      await forget();
      set({ ...initial, phase: "removed", removedWhy: "emptied", deviceId, pausedNoPro: state.pausedNoPro });
      return;
    }
    const devices = await readDevices();
    if (!devices.some(d => d.id === deviceId)) {
      stopTransfers();
      if (state.view !== "me") await setView("me");
      await forget();
      set({ ...initial, phase: "removed", removedWhy: "phone", deviceId, pausedNoPro: state.pausedNoPro });
      return;
    }
    set({ devices });
    // "Still here", now and then, for "last used" on the other phones.
    const mine = files.get(peer(deviceId));
    if (!mine || Date.now() - Date.parse(mine.modifiedTime) > ALIVE_MS) {
      myNote = { ...myNote, seen: Date.now() };
      await writeFile(peer(deviceId), myNote);
    }

    // ── This phone's own library ──
    const own = await ownState();
    await fingerprint(own.songs, own.removed);
    const settings = await collectSettings();
    const local = buildLocal({ ...own, settings, fpOf: p => fpByPath.get(p) });
    for (const [h, pic] of local.covers) coverStore.set(h, pic);
    const written = await readFile<LibFile>(lib(deviceId));
    const myName = devices.find(d => d.id === deviceId)?.name ?? "";
    if (!written || !same(written.doc, local.doc) || written.name !== myName) {
      await writeFile(lib(deviceId), { name: myName, at: Date.now(), doc: local.doc } satisfies LibFile);
    }
    const coverSet = Object.fromEntries(local.covers);
    const writtenCovers = await readFile<Record<string, string>>(coversOf(deviceId));
    if (!same(Object.keys(writtenCovers ?? {}).sort(), Object.keys(coverSet).sort())) await writeFile(coversOf(deviceId), coverSet);
    myDoc = local.doc;
    set({ lastSaved: Date.now(), problem: null });

    // Files that went since last round without MPTree deleting them: someone
    // deleted them on purpose. They are not fetched back.
    const before = lastFiles.get();
    if (before.size) {
      const next = new Set(skipped.get());
      for (const fp of before) if (!myInv[fp]) next.add(fp);
      for (const fp of next) if (myInv[fp]) next.delete(fp);
      if (!same([...next].sort(), [...skipped.get()].sort())) await skipped.save(next);
    }
    await lastFiles.save(new Set(Object.keys(myInv)));
    const rec = new Set([...received.get()].filter(fp => myInv[fp]));
    if (rec.size !== received.get().size) await received.save(rec);
    await sendInventory(own.songs);

    // ── Everyone else's ──
    libs.clear();
    const onAccount = new Set(devices.map(d => d.id));
    const old: SyncState["oldPhones"] = [];
    for (const name of files.keys()) {
      const m = /^lib-(.+)\.json$/.exec(name);
      if (!m || m[1] === deviceId) continue;
      const l = await readFile<LibFile>(name);
      if (!l) continue;
      libs.set(m[1], l);
      if (!onAccount.has(m[1])) old.push({ id: m[1], name: l.name, at: l.at });
    }
    invs.clear();
    for (const d of devices) if (d.id !== deviceId) invs.set(d.id, (await readFile<InvFile>(inv(d.id))) ?? { fps: {} });

    // ── Proposals ──
    const nextProps = new Map<string, PropFile[]>();
    const outgoing: string[] = [];
    for (const name of files.keys()) {
      const m = /^prop-(.+?)-(.+)\.json$/.exec(name);
      if (!m) continue;
      const p = await readFile<PropFile>(name);
      if (!p) continue;
      for (const [h, pic] of Object.entries(p.covers ?? {})) coverStore.set(h, pic);
      const list = nextProps.get(m[1]) ?? [];
      list.push(p);
      nextProps.set(m[1], list);
      if (m[2] === deviceId) outgoing.push(m[1]);
    }
    // A proposal of this phone's that is gone was answered: accepted when that
    // phone's library changed after it, declined otherwise.
    for (const to of state.waitingFor) {
      if (outgoing.includes(to)) continue;
      const mineWas = props.get(to)?.find(p => p.from === deviceId);
      const accepted = !!mineWas && (libs.get(to)?.at ?? 0) > mineWas.at;
      set({ answer: { name: devices.find(d => d.id === to)?.name ?? libs.get(to)?.name ?? "", accepted, at: Date.now() } });
    }
    props = nextProps;
    const incoming: Incoming[] = (props.get(deviceId) ?? [])
      .map(p => ({ from: p.from, fromName: p.fromName, at: p.at, summary: summarize(p.base, p.doc) }))
      .filter(x => !isEmptySummary(x.summary));
    set({ incoming, waitingFor: outgoing, oldPhones: old });

    // ── What the list shows ──
    if (state.view !== "me") await refreshView();

    setSongs({
      here: Object.keys(myInv).filter(fp => !local.doc.songs[fp]?.bin).length,
      notShared: notSharedFps.size,
      skipped: skipped.get().size,
      received: received.get().size,
    });
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
  const byPath = new Map<string, Song>();
  for (const s of [...songs, ...removed]) if (!s.isCut) byPath.set(s.uri, s);
  // A cut track's file is its source; it has to be known for the cut's key.
  for (const s of [...songs, ...removed]) if (s.isCut && !byPath.has(s.uri)) byPath.set(s.uri, s);
  const { items } = await Sync.fingerprints({ paths: [...byPath.keys()] });
  fpByPath = new Map();
  pathByFp = new Map();
  myInv = {};
  for (const it of items) {
    fpByPath.set(it.path, it.fp);
    if (!pathByFp.has(it.fp)) pathByFp.set(it.fp, it.path);
    const s = byPath.get(it.path);
    const sig = s && !s.isCut ? songSig(s.title, s.artist) : undefined;
    myInv[it.fp] = [it.size, it.path.split("/").pop() ?? "song.mp3", sig, s && !s.isCut ? s.duration : undefined];
  }
}

/** The songs this phone offers the others: not voice notes, recordings or
 *  short clips. */
let notSharedFps = new Set<string>();
function sharedInventory(songs: Song[]): Inventory {
  notSharedFps = new Set(findSuspects(songs).map(x => fpByPath.get(x.song.uri)).filter((x): x is string => !!x));
  const out: Inventory = {};
  for (const [fp, v] of Object.entries(myInv)) if (!notSharedFps.has(fp)) out[fp] = v;
  return out;
}

let lastInvHash = "";
async function sendInventory(songs: Song[]): Promise<void> {
  const shared = sharedInventory(songs);
  const keys = Object.keys(shared).sort();
  const skip = [...skipped.get()].sort();
  const h = keys.join(",") + "|" + skip.join(",");
  const hash = `${keys.length}:${skip.length}:${h.length}:${h.slice(0, 64)}:${h.slice(-64)}`;
  if (hash !== lastInvHash || !files.has(inv(deviceId))) await writeFile(inv(deviceId), { fps: shared, skip } satisfies InvFile);
  lastInvHash = hash;
}

// ── Views: another phone's library, or all of them ────────────────────────────

/** What was last put on the screen for a view, to tell an edit from nothing. */
let lastShown: { view: View; local: LocalDoc; combined?: Combined } | null = null;
/** Songs of the phone being looked at that are on this phone, by path. */
let viewPaths: Set<string> | null = null;

/** Whether a song file belongs in the list being shown. The app asks this
 *  when it scans, so a rescan keeps the view it is in. */
export function inView(path: string): boolean {
  if (!viewPaths) return true;
  return viewPaths.has(path);
}

/** Switch whose library the list shows. */
export async function setView(view: View): Promise<void> {
  if (!host || view === state.view) return;
  if (view === "me") {
    // Anything changed in the view on the way out still counts.
    if (lastShown) await refreshView().catch(() => {});
    set({ view: "me" });
    viewPaths = null;
    lastShown = null;
    setLibraryScope("");
    await host.showOwn();
    kick(500);
    return;
  }
  if (!myDoc) return;
  if (lastShown) await refreshView().catch(() => {});
  set({ view });
  setLibraryScope("view");
  lastShown = null;
  await refreshView(true);
}

/** Every song file on this phone, as songs, for building a view's list. */
async function allLocalSongs(): Promise<Song[]> {
  const { songs } = await MusicScanner.scan();
  return songs.map(s => ({ ...s, id: s.uri }));
}

function localOf(s: ReturnType<Host["snapshot"]>): LocalDoc {
  return buildLocal({ ...s, settings: {}, fpOf: p => fpByPath.get(p) });
}

/** Takes in an edit made in the view, then puts the view on screen afresh. */
async function refreshView(fresh = false): Promise<void> {
  if (!host || state.view === "me" || !myDoc) return;
  const view = state.view;

  // An edit made on screen since it was last shown goes where it belongs.
  if (!fresh && lastShown && lastShown.view === view) {
    const edited = localOf(host.snapshot());
    if (!same(edited.doc, lastShown.local.doc)) {
      for (const [h, pic] of edited.covers) coverStore.set(h, pic);
      if (view === "all") await sendAllEdit(lastShown.local, edited, lastShown.combined!);
      else await propose(view, applyEdit(viewOf(view) ?? myDoc, lastShown.local, edited), edited.covers);
    }
  }

  // Then what the view looks like now.
  let doc: LibDoc | null;
  let combined: Combined | undefined;
  let fps: Set<string> | null = null;
  if (view === "all") {
    const others = state.devices.filter(d => d.id !== deviceId)
      .map(d => ({ phone: d.id, doc: viewOf(d.id) }))
      .filter((x): x is { phone: string; doc: LibDoc } => !!x.doc);
    for (const o of others) await loadCovers(o.phone);
    combined = combine([{ phone: deviceId, doc: myDoc }, ...others], deviceId);
    doc = combined.doc;
    setSongs({ notHereInView: 0 });
  } else {
    doc = viewOf(view);
    await loadCovers(view);
    const theirs = invs.get(view)?.fps ?? {};
    fps = new Set([...Object.keys(theirs), ...Object.keys(doc?.songs ?? {})]);
    setSongs({ notHereInView: Object.keys(theirs).filter(fp => !myInv[fp]).length });
  }
  if (!doc) return;

  const everything = await allLocalSongs();
  const songs = fps ? everything.filter(s => fps!.has(fpByPath.get(s.uri) ?? "")) : everything;
  const out = apply(doc, {
    songs, removed: [], meta: {}, playlists: [], settings: {},
    fpOf: p => fpByPath.get(p), pathOf: fp => pathByFp.get(fp), coverOf: h => coverStore.get(h),
  });
  if (state.view !== view) return;
  viewPaths = new Set([...out.songs, ...out.removed].map(s => s.uri));
  await host.apply({ ...out, changed: { songs: true, removed: true, meta: true, playlists: true } });
  lastShown = { view, local: localOf({ songs: out.songs, removed: out.removed, meta: out.meta, playlists: out.playlists }), combined };
}

/** Covers a proposal needs that its phone does not have. */
function coversFor(doc: LibDoc, extra: Map<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of coverRefs(doc)) { const pic = extra.get(h) ?? coverStore.get(h); if (pic) out[h] = pic; }
  return out;
}

/** Saves a change to another phone's library as a proposal, or drops the
 *  proposal when the change was undone. */
async function propose(to: string, doc: LibDoc, covers: Map<string, string>): Promise<void> {
  const name = prop(to, deviceId);
  const existing = (props.get(to) ?? []).find(p => p.from === deviceId);
  const base = existing?.base ?? libs.get(to)?.doc;
  if (!base) return;
  if (isEmptySummary(summarize(base, doc))) {
    if (existing) await removeFile(name).catch(() => {});
    props.set(to, (props.get(to) ?? []).filter(x => x.from !== deviceId));
  } else {
    const p: PropFile = {
      from: deviceId, fromName: state.devices.find(d => d.id === deviceId)?.name ?? "",
      at: Date.now(), base, doc, covers: coversFor(doc, covers),
    };
    await writeFile(name, p);
    props.set(to, [...(props.get(to) ?? []).filter(x => x.from !== deviceId), p]);
  }
  const waiting = new Set(state.waitingFor);
  if (files.has(name)) waiting.add(to); else waiting.delete(to);
  set({ waitingFor: [...waiting] });
}

/** A change in "all phones": this phone's part straight into its own library,
 *  the rest as proposals. */
async function sendAllEdit(shown: LocalDoc, edited: LocalDoc, combined: Combined): Promise<void> {
  const current = new Map<string, LibDoc>([[deviceId, myDoc!]]);
  for (const d of state.devices) if (d.id !== deviceId) { const v = viewOf(d.id); if (v) current.set(d.id, v); }
  const changed = spread(shown, edited, current, combined.groups, deviceId);
  for (const [phone, doc] of changed) {
    if (phone === deviceId) await setOwnDoc(doc, edited.covers);
    else await propose(phone, doc, edited.covers);
  }
}

/** Puts a new version of this phone's own library in place: on screen when
 *  the list shows it, in storage otherwise. */
async function setOwnDoc(doc: LibDoc, covers: Map<string, string>): Promise<void> {
  if (!host) return;
  for (const [h, pic] of covers) coverStore.set(h, pic);
  const own = await ownState();
  const out = apply({ ...doc, settings: {} }, {
    ...own, settings: {},
    fpOf: p => fpByPath.get(p), pathOf: fp => pathByFp.get(fp), coverOf: h => coverStore.get(h),
  });
  if (state.view === "me") {
    if (out.changed.songs || out.changed.removed || out.changed.meta || out.changed.playlists) await host.apply(out);
  } else {
    await saveOwnLibrary({ meta: out.meta, removed: out.removed, cuts: out.songs.filter(s => s.isCut), playlists: out.playlists });
  }
  myDoc = doc;
}

// ── Answering a proposal ──────────────────────────────────────────────────────

export async function acceptChanges(from: string): Promise<void> {
  await listFiles();
  const p = await readFile<PropFile>(prop(deviceId, from));
  if (p && myDoc) {
    for (const [h, pic] of Object.entries(p.covers ?? {})) coverStore.set(h, pic);
    await setOwnDoc(overlay(myDoc, p.base, p.doc), new Map());
    await removeFile(prop(deviceId, from)).catch(() => {});
  }
  set({ incoming: state.incoming.filter(i => i.from !== from) });
  kick(300);
}

export async function declineChanges(from: string): Promise<void> {
  await listFiles();
  await removeFile(prop(deviceId, from)).catch(() => {});
  set({ incoming: state.incoming.filter(i => i.from !== from) });
  kick(300);
}

// ── Taking over from another phone ────────────────────────────────────────────

/** Adds a phone's playlists, likes and the rest to this phone's own library.
 *  Nothing here is lost; playlists with the same name become one. */
export async function takeOverLibrary(from: string): Promise<void> {
  const their = viewOf(from);
  if (!their || !myDoc) return;
  await loadCovers(from);
  const speaks = new Set([...Object.keys(myDoc.songs), ...Object.keys(myDoc.cuts), ...Object.keys(myInv)]);
  const joined = merge(null, { doc: myDoc, speaks, covers: new Map() }, their, { join: { settings: "phone", library: "merge" } });
  joined.settings = myDoc.settings;
  await setOwnDoc(joined, new Map());
  kick(300);
}

/** Makes this phone look like another: its look and settings. */
export async function takeOverLook(from: string): Promise<void> {
  const their = libs.get(from)?.doc;
  if (!their || !host) return;
  await restoreSettings(their.settings);
  await host.settings();
  kick(500);
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
/** Songs on the other phones, from their lists. */
const elsewhere = new Map<string, Inventory[string]>();
let relaying = false;
/** Room left for songs to come in this round. */
let roomLeft = Infinity;

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

// ── Mobile data, at most MOBILE_DAILY a day ──
let onMobile = false;
async function mobileUsed(): Promise<number> {
  const m = await readJson<{ day: string; bytes: number }>(KEY_MOBILE);
  return m && m.day === new Date().toDateString() ? m.bytes : 0;
}
async function countMobile(bytes: number) {
  if (!onMobile || !bytes) return;
  await writeJson(KEY_MOBILE, { day: new Date().toDateString(), bytes: (await mobileUsed()) + bytes });
}

/** Keeps songs coming in within the room there is. */
function fits(size: number): boolean {
  if (size > roomLeft) return false;
  roomLeft -= size;
  return true;
}

async function songsCycle(relist = false): Promise<void> {
  if (!active() || !myDoc || isDev()) return;
  const others = state.devices.filter(d => d.id !== deviceId);
  if (!others.length) { setSongs({ missing: 0, theyMiss: 0, waitingOn: [], note: null, inDrive: { count: 0, bytes: 0 } }); return; }
  try {
    if (relist) {
      await listFiles();
      // Another phone changed its library or proposed something: take it in.
      const changed = (n: string) => files.get(n)?.modifiedTime !== cache.get(n)?.at;
      if ([...files.keys()].some(n => (n.startsWith("lib-") || n.startsWith("prop-")) && changed(n))) kick(500);
    }
    const notes = new Map<string, PeerNote>();
    for (const d of others) {
      invs.set(d.id, (await readFile<InvFile>(inv(d.id))) ?? { fps: {} });
      const n = await readFile<PeerNote>(peer(d.id));
      if (n) notes.set(d.id, n);
    }
    for (const d of others) for (const [fp, v] of Object.entries(invs.get(d.id)!.fps)) elsewhere.set(fp, v);
    const isOpen = (id: string) => (notes.get(id)?.seen ?? 0) > Date.now() - ONLINE_MS;

    // Songs a month or more old in Drive: whoever they were for, they go.
    for (const f of [...files.values()].filter(f => f.name.startsWith("relay-"))) {
      if (Date.now() - Date.parse(f.modifiedTime) > RELAY_MAX_AGE) await removeFile(f.name).catch(() => {});
    }
    const waiting = [...files.values()].filter(f => f.name.startsWith("relay-"));
    const inDrive = { count: waiting.length, bytes: waiting.reduce((n, f) => n + Number(f.size ?? 0), 0) };

    const need = missingFrom(myInv, others.map(d => invs.get(d.id)!.fps), myDoc, { skip: skipped.get(), sigs: sigsOf(myInv) });
    const shared = sharedInventory((await ownState()).songs);
    const theyNeed = new Map<string, Inventory>();
    for (const d of others) {
      const theirs = invs.get(d.id)!;
      theyNeed.set(d.id, missingFrom(theirs.fps, [shared], myDoc, { skip: new Set(theirs.skip ?? []) }));
    }
    const theyMiss = new Set<string>();
    for (const m of theyNeed.values()) for (const fp of Object.keys(m)) theyMiss.add(fp);

    // How much room, and how much of what is missing fits in it.
    const needBytes = Object.values(need).reduce((n, v) => n + v[0], 0);
    const free = (await Sync.freeSpace()).bytes;
    roomLeft = free < 0 ? Infinity : Math.max(0, free - ROOM_MARGIN);
    const full = needBytes > roomLeft;

    const net = await Sync.network();
    onMobile = !net.unmetered;
    const mobileLeft = MOBILE_DAILY - (onMobile ? await mobileUsed() : 0);
    const canMove = net.unmetered || (state.mobileData && mobileLeft > 0);
    const waitingOn = others.filter(d => !isOpen(d.id) && Object.keys(need).some(fp => invs.get(d.id)!.fps[fp])).map(d => d.name);
    const anything = Object.keys(need).length > 0 || theyMiss.size > 0;
    setSongs({
      missing: Object.keys(need).length, theyMiss: theyMiss.size, waitingOn, inDrive,
      note: full && Object.keys(need).length ? "phone-full"
        : anything && !canMove ? (state.mobileData && onMobile ? "mobile-limit" : "wifi")
        : state.songs.note === "drive-full" ? "drive-full" : null,
      needBytes, freeBytes: free,
    });

    const pending = anything || waiting.some(f => f.name.startsWith(relayPrefix(deviceId)));
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
    // other phone may know better. What is asked for fits in the room there is.
    const wantFrom = (id: string) => Object.keys(need).filter(fp => invs.get(id)!.fps[fp] && fits(need[fp][0]));
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
        const swap = Object.keys(need).some(fp => invs.get(d.id)!.fps[fp]) || Object.keys(theyNeed.get(d.id)!).length > 0;
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
  if (notSharedFps.has(fp)) return null;
  return path && v ? { fp, path, size: v[0], name: v[1] } : null;
};

async function arrivedHere(fp: string, path: string | null, size: number, name: string) {
  const v = elsewhere.get(fp);
  myInv[fp] = [size, (path ?? name).split("/").pop() ?? name, v?.[2], v?.[3]];
  if (path) pathByFp.set(fp, path);
  const next = new Set(received.get()); next.add(fp);
  await received.save(next);
  await countMobile(size);
  setSongs({ arrived: state.songs.arrived + 1, received: next.size });
}

function hooksFor(peerId: string, want: string[]) {
  let arrived = 0;
  return {
    want,
    find,
    onSaved: (fp: string, path: string | null) => {
      arrived++;
      const v = elsewhere.get(fp);
      void arrivedHere(fp, path, v?.[0] ?? 0, v?.[1] ?? "song.mp3");
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
    // Here already, or thrown out here: not wanted, so gone.
    if (!fp || myInv[fp] || skipped.get().has(fp)) { await removeFile(f.name).catch(() => {}); continue; }
    const name = f.appProperties?.name ?? "song.mp3";
    const size = Number(f.size ?? -1);
    if (!fits(Math.max(0, size))) { setSongs({ note: "phone-full" }); continue; }
    const tid = "relay-" + fp;
    const from = nameOf(f.appProperties?.from ?? "");
    setSongs({ moving: { dir: "in", name, done: 0, total: size, via: "drive", peer: from } });
    const sub = await Sync.addListener("progress", p => {
      if (p.tid === tid) setSongs({ moving: { dir: "in", name, done: p.done, total: size, via: "drive", peer: from } });
    });
    try {
      await Sync.driveDownload({ token: await getToken(), fileId: f.id, tid, size });
      const saved = await Sync.finishFile({ tid, name, size });
      await arrivedHere(fp, saved.path, size, name);
      arrived++;
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
    if (onMobile && (await mobileUsed()) + song.size > MOBILE_DAILY) { setSongs({ note: "mobile-limit" }); break; }
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
      await countMobile(song.size);
    } catch (e) {
      if (/storageQuotaExceeded|quota/i.test(String((e as Error)?.message))) { setSongs({ note: "drive-full" }); break; }
    } finally {
      sub.remove();
    }
  }
  setSongs({ moving: undefined });
}
