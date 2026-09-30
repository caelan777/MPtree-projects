import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { Account, Sync, System } from "../plugins";
import { collectSettings, restoreSettings } from "../storage";
import { hasPro, subscribePro } from "../pro";
import { findSuspects } from "../cleanup";
import type { Song, SongMeta, Playlist } from "../types";
import { openDrive, type Drive, type DriveFile } from "./drive";
import {
  buildLocal, merge, apply, missingFrom, coverRefs, same, fileOf, songSig, sigsOf,
  DEFAULT_JOIN, type LibDoc, type Applied, type Inventory, type JoinChoice,
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
// Not every song travels. Voice notes, recordings and clips under a minute
// (cleanup.ts) stay on the phone they are on, and so do songs someone chose to
// keep on one phone, or deleted there themselves.
//
// Files in the app folder:
//   devices.json          the phones on the account, three at most
//   library.json          the account itself
//   covers.json           cover pictures, by hash
//   inv-<phone>.json      the songs that phone shares, and the ones it threw out
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
/** What this phone and the account last agreed on. Kept when signing out, so
 *  signing in again carries on instead of starting over. */
const KEY_BASE = "mptree_sync_base";
/** Songs kept on this phone only. */
const KEY_LOCAL = "mptree_sync_local";
/** Songs deleted on this phone outside MPTree: not fetched again. */
const KEY_SKIP = "mptree_sync_skip";
/** Songs that came from other phones, for "remove them when signing out". */
const KEY_RECEIVED = "mptree_sync_received";
/** Songs deleted for good here that the account has not heard of yet. */
const KEY_FORGOT = "mptree_sync_forgot";
/** When the oldest change not yet in the account was made. */
const KEY_DIRTY = "mptree_sync_dirty";
/** The account signed in last, to notice a different one. */
const KEY_LAST_EMAIL = "mptree_sync_last_email";
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

/** What a phone about to join is asked. */
export type JoinQuestion = {
  email: string;
  /** Songs here that the account's phones do not have. */
  newSongs: number;
  newBytes: number;
  /** This phone has playlists, likes or names of its own. */
  hasLibrary: boolean;
  /** Another account was signed in on this phone before. */
  otherAccount?: string;
};

export type SyncState = {
  /** off: signed out. joining: signing in. choose: answer the join questions.
   *  limit: three phones already, take one off. on: signed in. removed: taken
   *  off the account from another phone, or the account was emptied. */
  phase: "off" | "joining" | "choose" | "limit" | "on" | "removed";
  removedWhy?: "phone" | "emptied";
  join?: JoinQuestion;
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
    note?: "wifi" | "drive-full" | "phone-full" | "mobile-limit" | null;
    /** With note phone-full: what the missing songs need, and what is free. */
    needBytes?: number;
    freeBytes?: number;
    /** Songs waiting in Drive, for any phone. */
    inDrive: { count: number; bytes: number };
    /** Kept on this phone only. */
    localOnly: number;
    /** Voice notes and short clips, which stay where they are. */
    notShared: number;
    /** Deleted here outside MPTree, so not fetched again. */
    skipped: number;
    /** Deleted for good on another phone, still in the bin here. */
    goneHere: number;
    /** Came from other phones; can go when signing out. */
    received: number;
  };
  mobileData: boolean;
};

const initialSongs: SyncState["songs"] = {
  here: 0, missing: 0, theyMiss: 0, arrived: 0, waitingOn: [],
  inDrive: { count: 0, bytes: 0 }, localOnly: 0, notShared: 0, skipped: 0, goneHere: 0, received: 0,
};
const initial: SyncState = { phase: "off", devices: [], pausedNoPro: false, saving: false, songs: initialSongs, mobileData: false };

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
  snapshot(): { songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[] };
  /** Put the account's version in place, and save it. */
  apply(a: Applied): Promise<void>;
  /** Songs arrived in Music/MPTree: scan again. */
  rescan(): Promise<void>;
  /** Settings came in from another phone and are stored: show them. */
  settings(): Promise<void>;
  /** Deletes these files from the phone, and the songs from the library and
   *  the bin. Resolves how many went. */
  deleteFiles(paths: string[]): Promise<number>;
};

let host: Host | null = null;

// ── Stored on the phone ───────────────────────────────────────────────────────

type StoredAccount = { email: string; name: string; photo?: string; since: number; mobileData?: boolean };
type Base = { deviceId: string; email: string; doc: LibDoc; keys: string[]; inv?: string; files?: string[] };

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
const localOnly = storedSet(KEY_LOCAL);
const skipped = storedSet(KEY_SKIP);
const received = storedSet(KEY_RECEIVED);
const forgot = storedSet(KEY_FORGOT);

let stored: StoredAccount | null = null;
let deviceId = "";
/** When the oldest change not yet in the account was made; 0 when none. */
let dirtySince = 0;

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

// ── Starting up ───────────────────────────────────────────────────────────────

export async function initSync(h: Host): Promise<void> {
  host = h;
  deviceId = (await Sync.deviceId().catch(() => ({ id: "" }))).id;
  stored = await readJson<StoredAccount>(KEY_ACCOUNT);
  await Promise.all([localOnly.load(), skipped.load(), received.load(), forgot.load()]);
  dirtySince = (await readJson<number>(KEY_DIRTY)) ?? 0;
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
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mptreeSync = { state: () => state, run: () => libraryCycle() };
  refreshPro();
}

function refreshPro() {
  const paused = !hasPro();
  if (paused !== state.pausedNoPro) set({ pausedNoPro: paused });
  if (!paused) kick(2000);
}

const active = () => state.phase === "on" && !state.pausedNoPro && !!host && document.visibilityState === "visible";

// ── Signing in ────────────────────────────────────────────────────────────────

let pendingJoin: StoredAccount | null = null;

export async function signIn(): Promise<"ok" | "cancelled" | "limit" | "choose" | "failed"> {
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

/** Room on the account, then the questions, then in. */
async function nextJoinStep(): Promise<"ok" | "limit" | "choose" | "failed"> {
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

  // Signed in here with this account before: carry on where it left off.
  const base = await readJson<Base>(KEY_BASE);
  if (base && base.deviceId === deviceId && base.email === pendingJoin?.email) return finishJoin(DEFAULT_JOIN, "share");

  const question = await joinQuestion();
  if (!question) return finishJoin({ settings: "phone", library: "merge" }, "share");
  set({ phase: "choose", join: question });
  return "choose";
}

/** What to ask a phone joining an account that already has things in it, or
 *  null when there is nothing to ask. */
async function joinQuestion(): Promise<JoinQuestion | null> {
  if (!host || !pendingJoin) return null;
  const remote = await readFile<LibDoc>(LIB);
  const devices = await readDevices();
  const others = devices.filter(d => d.id !== deviceId);
  const accountHasThings = !!remote && (Object.keys(remote.playlists).length > 0 || Object.keys(remote.songs).length > 0 || others.length > 0);
  if (!accountHasThings) return null;

  const snap = host.snapshot();
  await fingerprint(snap.songs, snap.removed);
  const theirs = new Set<string>();
  for (const d of others) for (const fp of Object.keys((await readFile<InvFile>(inv(d.id)))?.fps ?? {})) theirs.add(fp);
  const shared = sharedInventory(snap.songs);
  let newSongs = 0, newBytes = 0;
  for (const [fp, v] of Object.entries(shared)) if (!theirs.has(fp)) { newSongs++; newBytes += v[0]; }
  const hasLibrary = snap.playlists.length > 0 || Object.keys(snap.meta).length > 0 || snap.removed.length > 0;
  const last = await readJson<string>(KEY_LAST_EMAIL);
  return {
    email: pendingJoin.email, newSongs, newBytes, hasLibrary,
    otherAccount: last && last !== pendingJoin.email ? last : undefined,
  };
}

/** The answers to the join questions. songs: "share" sends this phone's songs
 *  to the others, "local" keeps the ones they do not have on this phone. */
export async function answerJoin(choice: JoinChoice, songs: "share" | "local"): Promise<void> {
  set({ phase: "joining" });
  try { await finishJoin(choice, songs); } catch { set({ phase: "off", problem: "drive" }); }
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

async function finishJoin(choice: JoinChoice, songs: "share" | "local"): Promise<"ok" | "failed"> {
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
  // A base from another account, or none: this is a first join.
  const base = await readJson<Base>(KEY_BASE);
  const again = !!base && base.deviceId === deviceId && base.email === acc.email;
  if (!again) {
    await Preferences.remove({ key: KEY_BASE }).catch(() => {});
    await Promise.all([received.save(new Set()), forgot.save(new Set()), skipped.save(new Set())]);
    // Keep on this phone only: what the account's phones do not have yet.
    if (songs === "local" && host) {
      const theirs = new Set<string>();
      for (const d of devices) if (d.id !== deviceId) for (const fp of Object.keys((await readFile<InvFile>(inv(d.id)))?.fps ?? {})) theirs.add(fp);
      const snap = host.snapshot();
      await fingerprint(snap.songs, snap.removed);
      await localOnly.save(new Set(Object.keys(myInv).filter(fp => !theirs.has(fp))));
    } else {
      await localOnly.save(new Set());
    }
  }
  pendingJoin = null;
  stored = acc;
  await writeJson(KEY_ACCOUNT, acc);
  await writeJson(KEY_LAST_EMAIL, acc.email);
  set({ phase: "on", join: undefined, devices, account: { email: acc.email, name: acc.name, photo: acc.photo } });
  await libraryCycle(again ? undefined : choice);
  return "ok";
}

export function cancelJoin(): void {
  const email = pendingJoin?.email;
  pendingJoin = null;
  token = null; drive = null; files = new Map(); cache.clear();
  void Account.signOut({ email }).catch(() => {});
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

/** Takes a phone off the account. Its songs stay on it; it just stops syncing. */
export async function removeDevice(id: string): Promise<void> {
  await listFiles();
  const devices = (await readDevices()).filter(d => d.id !== id);
  await saveDevices(devices);
  await forgetPhoneFiles(id);
  set({ devices });
  if (state.phase === "limit" && devices.length < MAX_DEVICES) await nextJoinStep();
}

async function forgetPhoneFiles(id: string) {
  for (const name of [...files.keys()]) {
    if (name === inv(id) || name === peer(id) || name.startsWith(relayPrefix(id))) await removeFile(name).catch(() => {});
  }
}

// ── Signing out ───────────────────────────────────────────────────────────────

/** Signing out frees this phone's place on the account. Everything stays on
 *  the phone, unless removeReceived: then the songs that came from the other
 *  phones go. What was agreed with the account is kept, so signing in again
 *  carries on rather than bringing back what was deleted in between. */
export async function signOut(removeReceived = false): Promise<number> {
  stopTransfers();
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

/** Forgets the sign-in. The base stays; it is tied to the account's email. */
async function forget() {
  stored = null; token = null; drive = null; files = new Map(); cache.clear();
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

// ── Choices about songs, from the account page ────────────────────────────────

/** Songs kept on this phone only go to the other phones after all. */
export async function shareLocalOnly(): Promise<void> {
  await localOnly.save(new Set());
  setSongs({ localOnly: 0 });
  kick(500);
}

/** Songs deleted here are fetched again. */
export async function fetchSkippedAgain(): Promise<void> {
  await skipped.save(new Set());
  setSongs({ skipped: 0 });
  kick(500);
}

/** Deletes from this phone the songs another phone deleted for good. */
export async function deleteGoneHere(): Promise<number> {
  if (!host || !doc) return 0;
  const d = doc;
  const paths = host.snapshot().removed
    .filter(s => !s.isCut && d.songs[fpByPath.get(s.uri) ?? ""]?.gone)
    .map(s => s.uri);
  const n = await host.deleteFiles(paths);
  kick(500);
  return n;
}

/** The app calls this when songs are deleted for good from the bin here, so
 *  the other phones can offer the same. */
export async function songsDeletedForGood(paths: string[]): Promise<void> {
  const next = new Set(forgot.get());
  for (const p of paths) { const fp = fpByPath.get(p); if (fp) next.add(fp); }
  await forgot.save(next);
  syncChanged();
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
export function syncChanged(): void {
  // Remembered across restarts: a change made with no internet still counts
  // from when it was made, not from when the phone got back online.
  if (!dirtySince && state.phase === "on") { dirtySince = Date.now(); void writeJson(KEY_DIRTY, dirtySince); }
  kick(6000);
}

// ── One round of the account ──────────────────────────────────────────────────

let running = false, again = false;
let fpByPath = new Map<string, string>();
let pathByFp = new Map<string, string>();
/** Every song file on this phone. */
let myInv: Inventory = {};
let doc: LibDoc | null = null;

/** The songs this phone offers the others: not the ones kept here, and not
 *  voice notes, recordings or short clips. */
let notSharedFps = new Set<string>();
function sharedInventory(songs: Song[]): Inventory {
  notSharedFps = new Set(findSuspects(songs).map(x => fpByPath.get(x.song.uri)).filter((x): x is string => !!x));
  const out: Inventory = {};
  for (const [fp, v] of Object.entries(myInv)) {
    if (localOnly.get().has(fp) || notSharedFps.has(fp)) continue;
    out[fp] = v;
  }
  return out;
}

async function libraryCycle(join?: JoinChoice): Promise<void> {
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
      await forget();
      await Preferences.remove({ key: KEY_BASE }).catch(() => {});
      set({ ...initial, phase: "removed", removedWhy: "emptied", deviceId, pausedNoPro: state.pausedNoPro });
      return;
    }
    const devices = await readDevices();
    if (!devices.some(d => d.id === deviceId)) {
      stopTransfers();
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

    const snapshot = host.snapshot();
    await fingerprint(snapshot.songs, snapshot.removed);
    const settings = await collectSettings();
    const local = buildLocal({ ...snapshot, settings, fpOf: p => fpByPath.get(p) });

    const base = await readJson<Base>(KEY_BASE);
    const usable = base && base.deviceId === deviceId && base.email === stored?.email ? base : null;
    const fresh = new Set<string>();
    if (usable) { const had = new Set(usable.keys); for (const k of local.speaks) if (!had.has(k)) fresh.add(k); }

    // Songs deleted for good here: the account hears it, keeping what it knew.
    const remote = await readFile<LibDoc>(LIB);
    for (const fp of forgot.get()) {
      if (myInv[fp]) continue;
      local.doc.songs[fp] = { ...(remote?.songs[fp] ?? usable?.doc.songs[fp] ?? {}), bin: true, gone: true };
      local.speaks.add(fp);
      fresh.delete(fp);
    }

    // A file that was here last round and is gone now, without MPTree deleting
    // it: someone deleted it on purpose. It is not fetched back.
    if (usable?.files) {
      const next = new Set(skipped.get());
      for (const fp of usable.files) if (!myInv[fp] && !forgot.get().has(fp)) next.add(fp);
      for (const fp of next) if (myInv[fp]) next.delete(fp);
      if (next.size !== skipped.get().size || [...next].some(x => !skipped.get().has(x))) await skipped.save(next);
    }
    const rec = new Set([...received.get()].filter(fp => myInv[fp]));
    if (rec.size !== received.get().size) await received.save(rec);

    const merged = merge(usable?.doc ?? null, local, remote, {
      fresh, stamp: dirtySince || Date.now(), join: usable ? undefined : (join ?? DEFAULT_JOIN),
    });

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
      const invHash = await sendInventory(snapshot.songs, usable?.inv);
      await writeJson(KEY_BASE, {
        deviceId, email: stored!.email, doc: merged, keys: [...local.speaks], inv: invHash, files: Object.keys(myInv),
      } satisfies Base);
      await forgot.save(new Set());
      dirtySince = 0;
      await Preferences.remove({ key: KEY_DIRTY }).catch(() => {});
    } else {
      again = true;
    }
    doc = merged;
    const removedNow = host.snapshot().removed;
    setSongs({
      here: Object.keys(myInv).filter(fp => !merged.songs[fp]?.bin).length,
      localOnly: [...localOnly.get()].filter(fp => myInv[fp]).length,
      notShared: notSharedFps.size,
      skipped: skipped.get().size,
      received: received.get().size,
      goneHere: removedNow.filter(s => !s.isCut && merged.songs[fpByPath.get(s.uri) ?? ""]?.gone).length,
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

/** Writes what this phone shares, and what it threw out, when that changed.
 *  Resolves its hash. */
async function sendInventory(songs: Song[], last?: string): Promise<string> {
  const shared = sharedInventory(songs);
  const keys = Object.keys(shared).sort();
  const skip = [...skipped.get()].sort();
  const h = keys.join(",") + "|" + skip.join(",");
  const hash = `${keys.length}:${skip.length}:${h.length}:${h.slice(0, 64)}:${h.slice(-64)}`;
  if (hash !== last || !files.has(inv(deviceId))) await writeFile(inv(deviceId), { fps: shared, skip } satisfies InvFile);
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
  if (!active() || !doc || isDev()) return;
  const others = state.devices.filter(d => d.id !== deviceId);
  if (!others.length) { setSongs({ missing: 0, theyMiss: 0, waitingOn: [], note: null, inDrive: { count: 0, bytes: 0 } }); return; }
  try {
    if (relist) {
      await listFiles();
      // Another phone saved the account meanwhile: take it in now.
      const lib = files.get(LIB);
      if (lib && lib.modifiedTime !== cache.get(LIB)?.at) kick(500);
    }
    const invs = new Map<string, InvFile>();
    const notes = new Map<string, PeerNote>();
    for (const d of others) {
      invs.set(d.id, (await readFile<InvFile>(inv(d.id))) ?? { fps: {} });
      const n = await readFile<PeerNote>(peer(d.id));
      if (n) notes.set(d.id, n);
    }
    for (const i of invs.values()) for (const [fp, v] of Object.entries(i.fps)) elsewhere.set(fp, v);
    const isOpen = (id: string) => (notes.get(id)?.seen ?? 0) > Date.now() - ONLINE_MS;

    // Songs a month or more old in Drive: whoever they were for, they go.
    const relays = [...files.values()].filter(f => f.name.startsWith("relay-"));
    for (const f of relays) {
      if (Date.now() - Date.parse(f.modifiedTime) > RELAY_MAX_AGE) await removeFile(f.name).catch(() => {});
    }
    const waiting = [...files.values()].filter(f => f.name.startsWith("relay-"));
    const inDrive = { count: waiting.length, bytes: waiting.reduce((n, f) => n + Number(f.size ?? 0), 0) };

    const mySigs = sigsOf(myInv);
    const need = missingFrom(myInv, [...invs.values()].map(i => i.fps), doc, { skip: skipped.get(), sigs: mySigs });
    const shared = sharedInventory(host!.snapshot().songs);
    const theyNeed = new Map<string, Inventory>();
    for (const d of others) {
      const theirs = invs.get(d.id)!;
      // What they have includes what they keep to themselves, which they do
      // not list; a song that is theirs already by title is skipped too.
      theyNeed.set(d.id, missingFrom(theirs.fps, [shared], doc, { skip: new Set(theirs.skip ?? []) }));
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
  if (localOnly.get().has(fp) || notSharedFps.has(fp)) return null;
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
    // Here already, thrown out here, or in the bin: not wanted, so gone.
    if (!fp || myInv[fp] || skipped.get().has(fp) || doc?.songs[fp]?.bin) { await removeFile(f.name).catch(() => {}); continue; }
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

