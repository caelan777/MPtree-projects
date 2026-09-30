import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { App as CapApp } from "@capacitor/app";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Account, Sync, System, MusicScanner } from "../plugins";
import { collectShared, restoreShared } from "../storage";
import { hasPro, subscribePro } from "../pro";
import { findSuspects } from "../cleanup";
import type { Song, SongMeta, Playlist } from "../types";
import { openDrive, type Drive, type DriveFile } from "./drive";
import {
  buildLocal, merge, apply, missingFrom, coverRefs, same, fileOf, songSig, sigsOf, isCopy, namesOf,
  markDeleted, markRestored, deletedBy,
  type LibDoc, type Applied, type Inventory,
} from "./model";
import { startOffer, answerOffer, acceptAnswer, opened, close, runTransfer, type Session } from "./rtc";

// ─── THE MPTREE ACCOUNT ──────────────────────────────────────────────────────
//
// Part of MPTree Pro. Sign in with Google on up to three phones, and they share
// one library: playlists, likes, names, the bin, cut tracks and settings are
// the same on all of them. It is saved in the person's own Drive app folder
// (model.ts). Language, text size, the equalizer and the app icon stay with
// each phone (storage.ts, collectShared).
//
// The songs themselves are not saved in the account. They go from phone to
// phone so every phone has them all: straight across when both have MPTree
// open (rtc.ts), otherwise left in the app folder by the one that has a song,
// taken by the one that needs it, and deleted from Drive once it arrived. Songs
// from another phone land in Music/MPTree.
//
// Deleting a song for good takes the file off this phone only. The other
// phones keep it, in the bin; this phone lists it in the bin under
// "Permanently deleted" and can bring it back from another phone. A song no
// phone has any more is gone.
//
// Voice notes, recordings and clips under a minute (cleanup.ts) stay on the
// phone they are on.
//
// Files in the app folder:
//   devices.json          the phones on the account, three at most
//   library.json          the shared library (model.ts)
//   covers.json           its cover pictures, by hash
//   inv-<phone>.json      the songs that phone has
//   peer-<phone>.json     "I am open now", and the WebRTC offer or answer
//   relay-<to>-<fp>       a song waiting for phone <to>
//
// Nothing runs while the app is in the background: Android freezes the WebView
// there, which is fine, because both phones being open is the point.

const MAX_DEVICES = 3;
const DEVICES = "devices.json";
const LIB = "library.json";
const COVERS = "covers.json";
const inv = (id: string) => `inv-${id}.json`;
const peer = (id: string) => `peer-${id}.json`;
const relayPrefix = (to: string) => `relay-${to}-`;

const KEY_ACCOUNT = "mptree_account";
/** What this phone and the account last agreed on, for merging. */
const KEY_BASE = "mptree_sync_base";
/** When the first change not yet saved to the account was made. */
const KEY_DIRTY = "mptree_sync_dirty";
/** Songs deleted or restored here that the account has not heard yet. */
const KEY_PENDING = "mptree_sync_pending";
/** Songs that came from other phones, fp -> path. */
const KEY_RECEIVED = "mptree_sync_received";
/** What is known about songs deleted for good here, for the list of them. */
const KEY_GONE = "mptree_sync_gone";
/** Songs this phone does not want, not even as a deletion to tell the others
 *  about: second copies it threw out. */
const KEY_SKIP = "mptree_sync_skip";
/** A song that arrived under another fingerprint than it was sent with:
 *  what this phone reads -> what the account knows it as. */
const KEY_ALIAS = "mptree_sync_alias";
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
/** A phone of the same model this quiet is taken to be this one from before. */
const QUIET_DEVICE = 15 * 60_000;
/** A song gone from every phone leaves the list of deleted songs after this. */
const GONE_SHOWN = 30 * 24 * 60 * 60_000;

// ── State, for the UI ─────────────────────────────────────────────────────────

export type Device = { id: string; name: string; addedAt: number; lastActive?: number; test?: boolean };

export type Moving = { dir: "in" | "out"; name: string; done: number; total: number; via: "direct" | "drive"; peer: string };

/** A song of another phone that is not on this one yet, shown greyed out. */
export type Absent = { fp: string; title: string; artist: string };

/** A song deleted for good on this phone. */
export type Deleted = {
  fp: string; title: string; artist: string; at: number;
  /** Another phone still has it, so it can come back. */
  canRestore: boolean;
  /** Asked to come back, on its way. */
  restoring: boolean;
};

export type SyncState = {
  /** off: signed out. joining: signing in. limit: three phones already, take
   *  one off. on: signed in. removed: taken off the account from another
   *  phone, or the account was emptied. */
  phase: "off" | "joining" | "limit" | "on" | "removed";
  removedWhy?: "phone" | "emptied";
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
    /** Voice notes and short clips, which stay on this phone. */
    notShared: number;
    /** Came from other phones; can go when signing out. */
    received: number;
    /** Other phones' songs not on this one yet. */
    absent: Absent[];
    /** Songs from other phones that this one had already: the extra copies. */
    doubles: string[];
  };
  deleted: Deleted[];
  mobileData: boolean;
};

const initialSongs: SyncState["songs"] = {
  here: 0, missing: 0, theyMiss: 0, arrived: 0, waitingOn: [],
  inDrive: { count: 0, bytes: 0 }, notShared: 0, received: 0, absent: [], doubles: [],
};
const initial: SyncState = {
  phase: "off", devices: [], pausedNoPro: false, saving: false,
  songs: initialSongs, deleted: [], mobileData: false,
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

/** Signed in and syncing. */
const accountOn = () => state.phase === "on" && !state.pausedNoPro;

// ── The app, as the engine sees it ────────────────────────────────────────────

export type Host = {
  /** What the list shows now. */
  snapshot(): { songs: Song[]; removed: Song[]; meta: Record<string, SongMeta>; playlists: Playlist[] };
  /** Put the account's version on screen, and save it. */
  apply(a: Applied): Promise<void>;
  /** Songs arrived in Music/MPTree: scan again. */
  rescan(): Promise<void>;
  /** Settings were changed from outside: show them. */
  settings(): Promise<void>;
  /** Deletes these files from the phone, and the songs from the list and the
   *  bin. Resolves how many went. */
  deleteFiles(paths: string[]): Promise<number>;
};

let host: Host | null = null;

// ── Stored on the phone ───────────────────────────────────────────────────────

type StoredAccount = { email: string; name: string; photo?: string; since: number; mobileData?: boolean };
type Base = { deviceId: string; email: string; doc: LibDoc; keys: string[]; files: Record<string, string> };
type Pending = { del: Record<string, number>; restore: string[] };
type GoneInfo = { title: string; artist: string; at: number; restoring?: boolean };

async function readJson<T>(key: string): Promise<T | null> {
  try { const { value } = await Preferences.get({ key }); return value ? JSON.parse(value) as T : null; } catch { return null; }
}
const writeJson = (key: string, v: unknown) => Preferences.set({ key, value: JSON.stringify(v) }).catch(() => {});

let stored: StoredAccount | null = null;
let deviceId = "";
let receivedPaths = new Map<string, string>(); // fp -> path
let gone: Record<string, GoneInfo> = {};
let pending: Pending = { del: {}, restore: [] };
let dirtySince = 0;
let skip = new Set<string>();
let alias: Record<string, string> = {};

const saveReceived = () => writeJson(KEY_RECEIVED, Object.fromEntries(receivedPaths));
const saveGone = () => writeJson(KEY_GONE, gone);
const savePending = () => writeJson(KEY_PENDING, pending);
const saveSkip = () => writeJson(KEY_SKIP, [...skip]);
const saveAlias = () => writeJson(KEY_ALIAS, alias);

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
  // Oldest first, so the newest of two files with one name is the one kept.
  all.sort((a, b) => Date.parse(a.modifiedTime) - Date.parse(b.modifiedTime));
  files = new Map(all.map(f => [f.name, f]));
  // Two phones creating a file at the same moment can leave two of it. The
  // phones are joined into one list; of anything else the newest stays.
  const twice = all.filter(f => files.get(f.name) !== f);
  if (twice.length) await foldDuplicates(twice);
  return files;
}

async function foldDuplicates(extra: DriveFile[]) {
  const d = connect();
  const lists: Device[][] = [];
  for (const f of extra) {
    if (f.name === DEVICES) lists.push((await d.read<{ devices: Device[] }>(f.id).catch(() => null))?.devices ?? []);
    await d.remove(f.id).catch(() => {});
  }
  if (lists.length) {
    const kept = (await readFile<{ devices: Device[] }>(DEVICES))?.devices ?? [];
    const all = [...kept];
    for (const list of lists) for (const dev of list) if (!all.some(x => x.id === dev.id)) all.push(dev);
    if (all.length !== kept.length) await saveDevices(all);
  }
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
  const list = ((await readFile<{ devices: Device[] }>(DEVICES))?.devices ?? [])
    .filter((d, i, all) => all.findIndex(x => x.id === d.id) === i);
  return list.map(d => {
    const f = files.get(peer(d.id));
    return { ...d, lastActive: f ? Date.parse(f.modifiedTime) || d.addedAt : d.addedAt };
  });
}
const saveDevices = (list: Device[]) =>
  writeFile(DEVICES, { devices: list.map(d => ({ id: d.id, name: d.name, addedAt: d.addedAt, ...(d.test ? { test: true } : {}) })) });

/** What a phone has. A test phone (see testPhone) is sent nothing. */
type InvFile = { fps: Inventory; test?: boolean };

// ── Starting up ───────────────────────────────────────────────────────────────

/** Before the app reads its library. Called once, first thing. */
export async function prepareSync(): Promise<void> {
  deviceId = (await Sync.deviceId().catch(() => ({ id: "" }))).id;
  stored = await readJson<StoredAccount>(KEY_ACCOUNT);
  await leaveTwoLibraries();
  receivedPaths = new Map(Object.entries(await readJson<Record<string, string>>(KEY_RECEIVED) ?? {}));
  gone = await readJson<Record<string, GoneInfo>>(KEY_GONE) ?? {};
  pending = { del: {}, restore: [], ...(await readJson<Pending>(KEY_PENDING) ?? {}) };
  dirtySince = await readJson<number>(KEY_DIRTY) ?? 0;
  skip = new Set(await readJson<string[]>(KEY_SKIP) ?? []);
  alias = await readJson<Record<string, string>>(KEY_ALIAS) ?? {};
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
}

/** Test build 15 had two libraries, one for the phone and one shared. The phone's
 *  own one is kept; the next round joins it with the account as on a first
 *  sign in, so nothing of either is lost. */
async function leaveTwoLibraries() {
  const mode = await readJson<string>("mptree_mode");
  if (mode === null) return;
  if (mode === "all") {
    const device = await readJson<Record<string, string>>("mptree_profile_device");
    if (device) await restoreShared(device);
  }
  for (const key of ["mptree_mode", "mptree_profile_device", "mptree_profile_all", "mptree_sync_adopted", KEY_BASE,
    "mptree_meta@all", "mptree_removed@all", "mptree_cut_tracks@all", "mptree_playlists@all"]) {
    await Preferences.remove({ key }).catch(() => {});
  }
}

export async function initSync(h: Host): Promise<void> {
  host = h;
  subscribePro(() => { refreshPro(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(1500); });
  CapApp.addListener("resume", () => kick(1500)).catch(() => {});
  keepChecking();
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mptreeSync = {
    state: () => state, run: () => libraryCycle(), signIn: () => signIn(),
    signOut: (x: boolean) => signOut(x), rename: (id: string, n: string) => renameDevice(id, n),
    remove: (id: string) => removeDevice(id), test: (step: TestStep) => testPhone(step),
    restore: (fps: string[]) => restoreDeleted(fps),
  };
  refreshPro();
}

function refreshPro() {
  const paused = !hasPro();
  if (paused !== state.pausedNoPro) set({ pausedNoPro: paused });
  if (!paused) kick(2000);
}

const active = () => accountOn() && !!host && document.visibilityState === "visible";

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
  const real = (list: Device[]) => list.filter(d => !d.test);
  if (!devices.some(d => d.id === deviceId) && real(devices).length >= MAX_DEVICES) {
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
  if (!devices.some(d => d.id === deviceId) && real(devices).length >= MAX_DEVICES) {
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
  } catch { return "Android"; }
}
/** "Pixel 8 (2)" is a Pixel 8. */
const baseName = (n: string) => n.replace(/ \(\d+\)$/, "");

async function finishJoin(): Promise<"ok" | "failed"> {
  const acc = pendingJoin ?? stored;
  if (!acc) return "failed";
  await listFiles();
  const devices = await readDevices();
  if (!devices.some(d => d.id === deviceId)) {
    const name = await phoneName();
    // A device of the same model that has not said anything for a while is
    // most likely this one from before a reinstall: it makes way.
    const before = devices.find(d => !d.test && baseName(d.name) === name && Date.now() - (d.lastActive ?? d.addedAt) > QUIET_DEVICE);
    if (before) {
      devices.splice(devices.indexOf(before), 1);
      await forgetPhoneFiles(before.id);
    }
    // Two devices of the same model get told apart: "Pixel 8", "Pixel 8 (2)".
    const taken = new Set(devices.map(d => d.name));
    let unique = name;
    for (let n = 2; taken.has(unique); n++) unique = `${name} (${n})`;
    devices.push({ id: deviceId, name: unique, addedAt: Date.now() });
    await saveDevices(devices);
  }
  if (stored?.email !== acc.email) {
    // A first time on this account: this phone's library joins the account's.
    // Nothing is asked; playlists of the same name become one.
    await Preferences.remove({ key: KEY_BASE }).catch(() => {});
    gone = {}; pending = { del: {}, restore: [] };
    await Promise.all([saveGone(), savePending()]);
  }
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
  void Account.signOut({ email, token: token?.value }).catch(() => {});
  token = null; drive = null; files = new Map(); cache.clear();
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
}

/** Takes a phone off the account. Its songs stay on it; it just stops syncing. */
export async function removeDevice(id: string): Promise<void> {
  await listFiles();
  const devices = (await readDevices()).filter(d => d.id !== id);
  await saveDevices(devices);
  await forgetPhoneFiles(id);
  set({ devices });
  if (state.phase === "limit" && devices.filter(d => !d.test).length < MAX_DEVICES) await nextJoinStep();
  else kick(500);
}

/** Gives a device on the account another name. */
export async function renameDevice(id: string, name: string): Promise<void> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 30);
  if (!clean) return;
  await exclusive(async () => {
    await listFiles();
    const devices = await readDevices();
    const d = devices.find(x => x.id === id);
    if (!d || d.name === clean) return;
    d.name = clean;
    await saveDevices(devices);
    set({ devices });
  });
}

async function forgetPhoneFiles(id: string) {
  for (const name of [...files.keys()]) {
    if (name === inv(id) || name === peer(id) || name.startsWith(relayPrefix(id))) await removeFile(name).catch(() => {});
  }
}

// ── Signing out ───────────────────────────────────────────────────────────────

/** Signing out frees this phone's place on the account. The library stays on
 *  the phone as it is. The songs that came from the other phones stay too,
 *  unless removeReceived: then they go. */
export async function signOut(removeReceived = false): Promise<number> {
  stopTransfers();
  const email = stored?.email;
  const tok = token?.value;
  const wasOn = state.phase === "on";
  const d = wasOn ? connect() : null;
  // Signed out on screen straight away; nothing waits for a round to end.
  set({ ...initial, deviceId, pausedNoPro: state.pausedNoPro });
  const removed = await leave(removeReceived);
  // Then this phone makes room on the account. Offline, the place frees when
  // another phone removes it.
  void (async () => {
    if (d) {
      const listed = await d.list();
      const devFile = listed.find(f => f.name === DEVICES);
      if (devFile) {
        const list = (await d.read<{ devices: Device[] }>(devFile.id)).devices ?? [];
        await d.write(DEVICES, { devices: list.filter(x => x.id !== deviceId) }, devFile.id);
      }
      for (const f of listed) {
        if (f.name === inv(deviceId) || f.name === peer(deviceId) || f.name.startsWith(relayPrefix(deviceId))) await d.remove(f.id).catch(() => {});
      }
    }
  })().catch(() => {}).finally(() => { void Account.signOut({ email, token: tok }).catch(() => {}); });
  return removed;
}

/** Off the account: signed out, or taken off. Signing in again later joins
 *  this phone's library with the account's afresh. */
async function leave(removeReceived: boolean): Promise<number> {
  let removed = 0;
  if (removeReceived && host) removed = await host.deleteFiles([...receivedPaths.values()]).catch(() => 0);
  receivedPaths = new Map(); gone = {}; pending = { del: {}, restore: [] }; skip = new Set(); alias = {};
  await Promise.all([saveReceived(), saveGone(), savePending(), saveSkip(), saveAlias()]);
  stored = null; token = null; drive = null; files = new Map(); cache.clear(); doc = null;
  await Preferences.remove({ key: KEY_ACCOUNT }).catch(() => {});
  await Preferences.remove({ key: KEY_BASE }).catch(() => {});
  await Preferences.remove({ key: KEY_DIRTY }).catch(() => {});
  return removed;
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

/** The app calls this whenever something in the library changed. */
export function syncChanged(): void {
  if (!accountOn()) return;
  if (!dirtySince) {
    // Remembered across restarts: a change made with no internet still counts
    // from when it was made, not from when the phone got back online.
    dirtySince = Date.now();
    void writeJson(KEY_DIRTY, dirtySince);
  }
  kick(6000);
}

let running = false, again = false;
const idleWaiters: (() => void)[] = [];
function whenIdle(): Promise<void> {
  if (!running) return Promise.resolve();
  return new Promise(r => idleWaiters.push(r));
}
function done() {
  running = false;
  idleWaiters.splice(0).forEach(r => r());
  if (again) { again = false; kick(3000); }
}
/** Runs fn with no round running alongside it. */
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (running) await whenIdle();
  running = true;
  try { return await fn(); } finally { done(); }
}

// ── One round of the account ──────────────────────────────────────────────────

let fpByPath = new Map<string, string>();
let pathByFp = new Map<string, string>();
/** Every song file on this phone. */
let myInv: Inventory = {};
/** The library, as last agreed with the account. */
let doc: LibDoc | null = null;
/** Other phones' song lists, by phone. */
const invs = new Map<string, InvFile>();
/** The songs this phone offers the others. */
let shared: Inventory = {};
let notSharedFps = new Set<string>();

/** Every song file on the phone, scanned. */
async function scanAll(): Promise<Song[]> {
  const { songs } = await MusicScanner.scan();
  return songs.map(s => ({ ...s, id: s.uri }));
}

async function libraryCycle(): Promise<void> {
  if (!host || !accountOn()) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const net = await Sync.network();
    if (!net.online) { set({ problem: "offline" }); return; }
    set({ saving: true });
    await listFiles();

    // Emptied from Google Drive's settings: that is someone deleting their
    // account data. Stop, rather than filling it straight up again.
    // Signed out while this round was on its way: nothing more to do.
    if (!stored) return;
    if (!files.has(DEVICES)) {
      stopTransfers();
      await leave(false);
      set({ ...initial, phase: "removed", removedWhy: "emptied", deviceId, pausedNoPro: state.pausedNoPro });
      return;
    }
    const devices = await readDevices();
    if (!stored) return;
    if (!devices.some(d => d.id === deviceId)) {
      stopTransfers();
      await leave(false);
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
    // Build 14 kept one library per phone; those files are not used any more.
    for (const name of [...files.keys()]) if (/^(lib|covers|prop)-.+\.json$/.test(name)) await removeFile(name).catch(() => {});

    // ── The songs on this phone ──
    const lib = host.snapshot();
    const scanned = await scanAll();
    await fingerprint(scanned, lib.removed);
    const base0 = await readJson<Base>(KEY_BASE);
    const base = base0 && base0.deviceId === deviceId && base0.email === stored?.email ? base0 : null;
    await noticeVanished(base, scanned);
    buildShared(scanned);
    findDoubles();

    // ── The library ──
    const settings = await collectShared();
    const local = buildLocal({ ...lib, settings, fpOf: p => fpByPath.get(p) });
    const fresh = new Set<string>();
    if (base) { const had = new Set(base.keys); for (const k of local.speaks) if (!had.has(k)) fresh.add(k); }
    const remote = await readFile<LibDoc>(LIB);
    const known = remote ?? base?.doc ?? null;
    for (const [fp, at] of Object.entries(pending.del)) { markDeleted(local, known, [fp], deviceId, at); fresh.delete(fp); }
    markRestored(local, known, pending.restore);
    for (const fp of pending.restore) fresh.delete(fp);

    const merged = merge(base?.doc ?? null, local, remote, {
      fresh, stamp: dirtySince || Date.now(), join: base ? undefined : { settings: "account", library: "merge" },
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
    const untouched = now.songs === lib.songs && now.removed === lib.removed && now.meta === lib.meta && now.playlists === lib.playlists;
    if (untouched) {
      const out = apply(merged, {
        ...lib, settings,
        fpOf: p => fpByPath.get(p), pathOf: fp => pathByFp.get(fp),
        coverOf: h => local.covers.get(h) ?? accountCovers?.[h],
      });
      if (out.changed.songs || out.changed.removed || out.changed.meta || out.changed.playlists) await host.apply(out);
      if (out.settings) { await restoreShared(out.settings); await host.settings(); }
      await writeJson(KEY_BASE, {
        deviceId, email: stored!.email, doc: merged, keys: [...local.speaks],
        files: Object.fromEntries(Object.keys(shared).map(fp => [fp, pathByFp.get(fp) ?? ""])),
      } satisfies Base);
      pending = { del: {}, restore: [] };
      await savePending();
      dirtySince = 0;
      await Preferences.remove({ key: KEY_DIRTY }).catch(() => {});
    } else {
      again = true;
    }
    doc = merged;
    await sendInventory();
    await refreshDeleted();
    setSongs({
      here: Object.keys(myInv).filter(fp => !merged.songs[fp]?.bin).length,
      notShared: notSharedFps.size,
      received: receivedPaths.size,
    });
    await songsCycle();
  } catch (e) {
    set({ problem: (e as { code?: string })?.code === "NEEDS_SIGN_IN" ? "signin" : "drive" });
  } finally {
    set({ saving: false });
    done();
  }
}

async function fingerprint(scanned: Song[], removed: Song[]) {
  const byPath = new Map<string, Song>();
  for (const s of scanned) byPath.set(s.uri, s);
  // A cut track's file is its source; it has to be known for the cut's key.
  for (const s of removed) if (!byPath.has(s.uri)) byPath.set(s.uri, s);
  const { items } = await Sync.fingerprints({ paths: [...byPath.keys()] });
  fpByPath = new Map();
  pathByFp = new Map();
  myInv = {};
  for (const raw of items) {
    const it = alias[raw.fp] ? { ...raw, fp: alias[raw.fp] } : raw;
    fpByPath.set(it.path, it.fp);
    if (!pathByFp.has(it.fp)) pathByFp.set(it.fp, it.path);
    const s = byPath.get(it.path);
    const real = s && !s.isCut;
    myInv[it.fp] = [
      it.size, it.path.split("/").pop() ?? "song.mp3",
      real ? songSig(s.title, s.artist) : undefined, real ? s.duration : undefined,
      real ? s.title : undefined, real && s.artist && s.artist !== "<unknown>" ? s.artist : undefined,
    ];
  }
  // Songs that came here from another phone, wherever they are now.
  let moved = false;
  for (const [fp, p] of receivedPaths) {
    const now = pathByFp.get(fp);
    if (!now) { receivedPaths.delete(fp); moved = true; }
    else if (now !== p) { receivedPaths.set(fp, now); moved = true; }
  }
  if (moved) await saveReceived();
}

/** The songs this phone offers the others: not voice notes, recordings or
 *  short clips. */
function buildShared(scanned: Song[]) {
  notSharedFps = new Set(findSuspects(scanned).map(x => fpByPath.get(x.song.uri)).filter((x): x is string => !!x));
  shared = {};
  for (const [fp, v] of Object.entries(myInv)) if (!notSharedFps.has(fp)) shared[fp] = v;
}

/** A song file that was here last round and is gone now was deleted for good,
 *  whether in MPTree or not: the account hears it. */
async function noticeVanished(base: Base | null, scanned: Song[]) {
  if (!base?.files) return;
  const byPath = new Map(scanned.map(s => [s.uri, s]));
  let changed = false;
  for (const [fp, path] of Object.entries(base.files)) {
    if (myInv[fp] || pending.del[fp] || skip.has(fp) || base.doc.songs[fp]?.del?.[deviceId]) continue;
    pending.del[fp] = Date.now();
    const was = (await readFile<InvFile>(inv(deviceId)))?.fps[fp];
    gone[fp] ??= {
      title: was?.[4] ?? byPath.get(path)?.title ?? (was?.[1] ?? "").replace(/\.[^.]+$/, ""),
      artist: was?.[5] ?? "", at: Date.now(),
    };
    changed = true;
  }
  if (changed) await Promise.all([savePending(), saveGone()]);
}

/** Songs that came from another phone while this one had them already, under
 *  another name or as another file: the second copies. */
function findDoubles() {
  const rec = new Set(receivedPaths.values());
  const own: typeof myInv = {};
  const came: [string, typeof myInv[string]][] = [];
  for (const [fp, v] of Object.entries(myInv)) {
    const path = pathByFp.get(fp) ?? "";
    if (rec.has(path)) came.push([path, v]); else own[fp] = v;
  }
  const sigs = sigsOf(own), names = namesOf(own);
  const doubles = came.filter(([, v]) => isCopy(v, sigs, names)).map(([p]) => p);
  if (!same(doubles, state.songs.doubles)) setSongs({ doubles });
}

/** Deletes the second copies findDoubles found, with one question from
 *  Android. They are not fetched again, and the other phones keep theirs. */
export async function deleteDoubles(): Promise<number> {
  if (!host) return 0;
  const paths = state.songs.doubles;
  const fps = paths.map(p => fpByPath.get(p)).filter((x): x is string => !!x);
  for (const fp of fps) skip.add(fp);
  await saveSkip();
  const n = await host.deleteFiles(paths).catch(() => 0);
  setSongs({ doubles: [] });
  kick(1000);
  return n;
}

let lastInvHash = "";
async function sendInventory(): Promise<void> {
  const keys = Object.keys(shared).sort();
  const h = keys.join(",");
  const hash = `${keys.length}:${h.length}:${h.slice(0, 64)}:${h.slice(-64)}`;
  if (hash !== lastInvHash || !files.has(inv(deviceId))) await writeFile(inv(deviceId), { fps: shared } satisfies InvFile);
  lastInvHash = hash;
}

// ── Permanently deleted here ──────────────────────────────────────────────────

/** The app calls this just before it deletes files for good, so the list of
 *  deleted songs can show their names. */
export async function beforeDeleteForever(songs: Song[]): Promise<void> {
  if (!accountOn() || !host) return;
  const meta = host.snapshot().meta;
  for (const s of songs) {
    if (s.isCut) continue;
    const fp = fpByPath.get(s.uri);
    if (!fp) continue;
    gone[fp] = {
      title: meta[s.uri]?.customName || s.title,
      artist: meta[s.uri]?.customArtist || (s.artist !== "<unknown>" ? s.artist : ""),
      at: Date.now(),
    };
  }
  await saveGone();
}

/** What deleting these songs for good means, for the question asked first. */
export function deleteWarnings(songs: Song[]): { lastCopy: number; elsewhere: number } {
  const out = { lastCopy: 0, elsewhere: 0 };
  if (!accountOn()) return out;
  for (const s of songs) {
    if (s.isCut) continue;
    const fp = fpByPath.get(s.uri);
    if (!fp || notSharedFps.has(fp)) continue;
    const others = [...invs.entries()].some(([id, i]) => id !== deviceId && !i.test && i.fps[fp]);
    if (!others) out.lastCopy++; else out.elsewhere++;
  }
  return out;
}

async function refreshDeleted() {
  if (!doc) return;
  const mineGone = deletedBy(doc, deviceId);
  for (const fp of Object.keys(pending.del)) if (!mineGone.has(fp)) mineGone.set(fp, pending.del[fp]);
  const list: Deleted[] = [];
  let pruned = false;
  for (const fp of Object.keys(gone)) if (myInv[fp]) { delete gone[fp]; pruned = true; }
  for (const [fp, at] of mineGone) {
    if (myInv[fp]) continue;
    const somewhere = [...invs.entries()].some(([id, i]) => id !== deviceId && i.fps[fp]);
    const info = gone[fp];
    if (!somewhere && Date.now() - at > GONE_SHOWN) { if (info) { delete gone[fp]; pruned = true; } continue; }
    const theirs = [...invs.values()].map(i => i.fps[fp]).find(Boolean);
    list.push({
      fp, at,
      title: info?.title || theirs?.[4] || (theirs?.[1] ?? "").replace(/\.[^.]+$/, "") || "?",
      artist: info?.artist || theirs?.[5] || "",
      canRestore: somewhere,
      restoring: pending.restore.includes(fp),
    });
  }
  // Asked to come back and back in the account: waiting for the file.
  for (const fp of Object.keys(gone)) {
    if (mineGone.has(fp) || myInv[fp] || !gone[fp].restoring) continue;
    list.push({ fp, at: gone[fp].at, title: gone[fp].title, artist: gone[fp].artist, canRestore: true, restoring: true });
  }
  if (pruned) await saveGone();
  list.sort((a, b) => b.at - a.at);
  set({ deleted: list });
}

/** Brings songs deleted here back, on every phone that deleted them. */
export async function restoreDeleted(fps: string[]): Promise<void> {
  for (const fp of fps) {
    if (!pending.restore.includes(fp)) pending.restore.push(fp);
    delete pending.del[fp];
    if (gone[fp]) gone[fp].restoring = true;
  }
  await Promise.all([savePending(), saveGone()]);
  set({ deleted: state.deleted.map(d => fps.includes(d.fp) ? { ...d, restoring: true } : d) });
  kick(300);
}

// ── A test phone (test builds) ────────────────────────────────────────────────
//
// So someone with one phone can see what a second one does. The test phone is
// a phone on the account that lives in Drive only. It has three songs of its
// own, a minute or so of made-up tones, which reach this phone through Drive
// the way any other phone's songs do. It can make a playlist and like a song,
// and delete its songs for good. It does not count towards the three phones
// and is sent nothing.

export const TEST_PHONE = "test-phone";
export type TestStep = "add" | "playlist" | "delete" | "remove";

export async function testPhone(step: TestStep): Promise<void> {
  if (!accountOn()) return;
  await exclusive(async () => {
    await listFiles();
    const devices = await readDevices();
    if (step === "remove") {
      await saveDevices(devices.filter(d => d.id !== TEST_PHONE));
      for (const name of [...files.keys()]) if (name.includes(TEST_PHONE)) await removeFile(name).catch(() => {});
      return;
    }
    if (step === "add") {
      if (!devices.some(d => d.id === TEST_PHONE)) {
        await saveDevices([...devices, { id: TEST_PHONE, name: "Testapparaat", addedAt: Date.now(), test: true }]);
      }
      await writeFile(peer(TEST_PHONE), { seen: 0 });
      const fps: Inventory = {};
      for (let i = 1; i <= 3; i++) {
        const title = `MPTree testnummer ${i}`;
        const name = `${title}.wav`;
        const wav = testTone(i);
        const fp = fingerprintOf(wav);
        fps[fp] = [wav.length, name, songSig(title, ""), 70_000, title, "Testapparaat"];
        if (isDev() || files.has(relayPrefix(deviceId) + fp) || myInv[fp]) continue;
        const path = `mptree-test-${i}.wav`;
        await Filesystem.writeFile({ path, data: toBase64(wav), directory: Directory.Cache });
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        const props = { fp, name, from: TEST_PHONE };
        const { id } = await Sync.driveUpload({
          token: await getToken(), path: decodeURIComponent(uri.replace(/^file:\/\//, "")),
          name: relayPrefix(deviceId) + fp, tid: "test-" + i, appProperties: props,
        });
        files.set(relayPrefix(deviceId) + fp, { id, name: relayPrefix(deviceId) + fp, modifiedTime: new Date().toISOString(), size: String(wav.length), appProperties: props });
        await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
      }
      await writeFile(inv(TEST_PHONE), { fps, test: true } satisfies InvFile);
      return;
    }
    const theirs = (await readFile<InvFile>(inv(TEST_PHONE)))?.fps ?? {};
    const lib: LibDoc = structuredClone((await readFile<LibDoc>(LIB)) ?? { v: 1, songs: {}, playlists: {}, cuts: {}, settings: {} });
    const at = { ...(lib.at ?? {}) };
    const now = Date.now();
    if (step === "playlist") {
      const id = "pl_test_" + now.toString(36);
      lib.playlists[id] = { name: "Van het testapparaat", createdAt: now, songs: Object.keys(theirs) };
      at["p:" + id] = now;
      const first = Object.keys(theirs)[0];
      if (first) { lib.songs[first] = { ...(lib.songs[first] ?? {}), liked: true }; at["s:" + first] = now; }
    } else if (step === "delete") {
      for (const fp of Object.keys(theirs)) {
        const rec = lib.songs[fp] ?? {};
        lib.songs[fp] = { ...rec, bin: true, del: { ...(rec.del ?? {}), [TEST_PHONE]: now } };
        at["s:" + fp] = now;
      }
      await writeFile(inv(TEST_PHONE), { fps: {}, test: true } satisfies InvFile);
    }
    await writeFile(LIB, { ...lib, at });
  });
  kick(300);
}

/** A WAV of 70 seconds: a slow tune, different for each of the three. */
function testTone(n: number): Uint8Array {
  const rate = 8000, secs = 70, len = rate * secs;
  const out = new Uint8Array(44 + len);
  const v = new DataView(out.buffer);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out[o + i] = t.charCodeAt(i); };
  str(0, "RIFF"); v.setUint32(4, 36 + len, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, "data"); v.setUint32(40, len, true);
  const scale = [0, 2, 4, 5, 7, 9, 11, 12];
  const root = [220, 262, 330][n - 1] ?? 220;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const note = Math.floor(i / (rate / 2));
    const step = scale[(note * (n + 2)) % scale.length];
    const hz = root * Math.pow(2, step / 12);
    phase += (2 * Math.PI * hz) / rate;
    const inNote = (i % (rate / 2)) / (rate / 2);
    const env = Math.min(1, inNote * 20) * (1 - inNote * 0.7);
    out[44 + i] = 128 + Math.round(Math.sin(phase) * 60 * env);
  }
  return out;
}

/** The same fingerprint SyncPlugin.java makes: size, and a CRC32 of 16 KB from
 *  the middle. */
export function fingerprintOf(bytes: Uint8Array): string {
  const len = Math.min(16 * 1024, bytes.length);
  const from = Math.max(0, Math.floor(bytes.length / 2) - Math.floor(len / 2));
  let c = 0xffffffff;
  for (let i = from; i < from + len; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return bytes.length.toString(36) + "-" + ((c ^ 0xffffffff) >>> 0).toString(16);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
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
  if (!active() || !doc) return;
  const others = state.devices.filter(d => d.id !== deviceId);
  try {
    if (relist) {
      await listFiles();
      // Another phone changed the library: take it in.
      const changed = (n: string) => files.get(n)?.modifiedTime !== cache.get(n)?.at;
      if (changed(LIB)) kick(500);
    }
    const notes = new Map<string, PeerNote>();
    // Only the devices on the account now: one that left takes its list along.
    invs.clear();
    for (const d of others) {
      invs.set(d.id, (await readFile<InvFile>(inv(d.id))) ?? { fps: {} });
      const n = await readFile<PeerNote>(peer(d.id));
      if (n) notes.set(d.id, n);
    }
    for (const d of others) for (const [fp, v] of Object.entries(invs.get(d.id)!.fps)) elsewhere.set(fp, v);
    // Whether a deleted song can still come back depends on these lists.
    await refreshDeleted();
    const isOpen = (id: string) => (notes.get(id)?.seen ?? 0) > Date.now() - ONLINE_MS;

    // Songs a month or more old in Drive: whoever they were for, they go.
    for (const f of [...files.values()].filter(f => f.name.startsWith("relay-"))) {
      if (Date.now() - Date.parse(f.modifiedTime) > RELAY_MAX_AGE) await removeFile(f.name).catch(() => {});
    }
    const waiting = [...files.values()].filter(f => f.name.startsWith("relay-"));
    const inDrive = { count: waiting.length, bytes: waiting.reduce((n, f) => n + Number(f.size ?? 0), 0) };

    const need = missingFrom(myInv, others.map(d => invs.get(d.id)!.fps), doc, { me: deviceId, sigs: sigsOf(myInv), skip });
    // A song asked back is fetched even though this phone deleted it once.
    const theyNeed = new Map<string, Inventory>();
    for (const d of others) {
      const theirs = invs.get(d.id)!;
      // A device that has not said what it has yet (just signed in, or
      // leaving) is sent nothing: to this phone its list would look empty,
      // and every song would go to it, including the ones it has.
      const known = files.has(inv(d.id)) && !theirs.test;
      theyNeed.set(d.id, known ? missingFrom(theirs.fps, [shared], doc, { me: d.id }) : {});
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
    const waitingOn = others.filter(d => !isOpen(d.id) && !d.test && Object.keys(need).some(fp => invs.get(d.id)!.fps[fp])).map(d => d.name);
    const anything = Object.keys(need).length > 0 || theyMiss.size > 0;
    setSongs({
      missing: Object.keys(need).length, theyMiss: theyMiss.size, waitingOn, inDrive,
      note: full && Object.keys(need).length ? "phone-full"
        : anything && !canMove ? (state.mobileData && onMobile ? "mobile-limit" : "wifi")
        : state.songs.note === "drive-full" ? "drive-full" : null,
      needBytes, freeBytes: free,
      absent: Object.entries(need).map(([fp, v]) => ({ fp, title: v[4] || v[1].replace(/\.[^.]+$/, ""), artist: v[5] ?? "" })),
    });

    const pendingHere = anything || waiting.some(f => f.name.startsWith(relayPrefix(deviceId)));
    if (!pendingHere || isDev()) { if (myNote.offer || myNote.answer) { myNote = { seen: Date.now() }; await writeFile(peer(deviceId), myNote); } return; }

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
  myInv[fp] = [size, (path ?? name).split("/").pop() ?? name, v?.[2], v?.[3], v?.[4], v?.[5]];
  if (path) {
    pathByFp.set(fp, path);
    fpByPath.set(path, fp);
    receivedPaths.set(fp, path);
    await saveReceived();
    if (gone[fp]) { delete gone[fp]; await saveGone(); }
    // Read back as something else (a file the phone changed on saving, say),
    // it would look like a new song to everyone and travel back as a copy.
    const read = (await Sync.fingerprints({ paths: [path] }).catch(() => ({ items: [] }))).items[0]?.fp;
    if (read && read !== fp) { alias[read] = fp; await saveAlias(); }
  }
  await countMobile(size);
  setSongs({ arrived: state.songs.arrived + 1, received: receivedPaths.size });
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
    // Here already, or deleted here and not asked back: not wanted, so gone.
    if (!fp || myInv[fp] || skip.has(fp) || doc?.songs[fp]?.del?.[deviceId] || doc?.songs[fp]?.bin) { await removeFile(f.name).catch(() => {}); continue; }
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
    // Still on the account, and still wanting it? A device that signed out
    // meanwhile gets nothing more.
    await listFiles();
    if (!files.has(inv(to)) || !(await readDevices()).some(d => d.id === to)) break;
    if ((await readFile<InvFile>(inv(to)))?.fps[fp]) continue;
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

