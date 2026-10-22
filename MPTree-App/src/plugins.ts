import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Song } from "./types";
import { AudioPlayerWeb } from "./web/AudioPlayerWeb";
import { MusicScannerWeb } from "./web/MusicScannerWeb";

// ─── PLUGINS ─────────────────────────────────────────────────────────────────
//
// Resolved here, once, and imported everywhere else.
//
// The platform is switched on explicitly rather than handed to registerPlugin's
// `web` option. That option is only consulted for the FIRST registration of a
// given name — later ones just warn and hand back the original proxy — which
// made whether the browser build worked depend on module evaluation order.
// Choosing here is deterministic and says plainly what runs where.
//
// In a browser the stand-ins below run: they are what makes the playable demo
// on the website work. On Android the real native plugins are used and the
// stand-ins, though bundled, are never constructed.

export type MusicScannerPlugin = {
  scan(): Promise<{ songs: Song[] }>;
  /** Whether reading audio files is already allowed. Never prompts. */
  hasAccess(): Promise<{ granted: boolean }>;
  scanFolder(options: { path: string }): Promise<void>;
  // Permanently deletes an audio file from the device via MediaStore.
  // Resolves { deleted: true } on success, { deleted: false } if the user
  // declined the system confirmation dialog (Android 11+).
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
  /** Many at once, with at most one system question. */
  deleteFiles(options: { paths: string[] }): Promise<{ deleted: string[] }>;
  // Losslessly exports a segment [startMs, endMs] of an audio file to a real
  // file in Music/MPTree and registers it with MediaStore. Rejects with code
  // "UNSUPPORTED_FORMAT" when the source codec can't be muxed losslessly.
  cutTrack(options: { path: string; startMs: number; endMs: number; name: string }):
    Promise<{ uri: string; path: string | null; contentUri?: string; title: string; duration: number }>;
  // Opens this app's system settings page (App info), where the user can grant
  // the media permission after having denied it with "Don't ask again".
  openAppSettings(): Promise<void>;
  // Makes this track the device ringtone. Android gates writing system settings
  // behind a switch on its own Settings screen rather than a permission dialog,
  // so this can come back ok:false with needsPermission:true after opening that
  // screen, meaning "ask again once they have flipped it".
  setAsRingtone(options: { path: string }):
    Promise<{ ok: boolean; needsPermission?: boolean; reason?: string }>;
  // Lyrics from a sidecar file next to the audio (song.lrc / song.txt). Always
  // local: see the note in MusicScannerPlugin.getLyrics.
  getLyrics(options: { path: string }): Promise<{ lyrics: string; source?: string }>;
};

export type AudioPlayerPlugin = {
  /** cutFrom and cutTo: only this part of the file is played (a cut that is
   *  not a file of its own). The service starts and ends there by itself. */
  play(options: { path: string; title?: string; artist?: string; cutFrom?: number; cutTo?: number }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getCurrentPosition(): Promise<{ position: number }>;
  getDuration(): Promise<{ duration: number }>;
  getState(): Promise<{ position: number; duration: number }>;
  getCurrentSong(): Promise<{ path: string; isPlaying: boolean }>;
  seekTo(options: { milliseconds: number }): Promise<void>;
  addListener(event: "trackComplete", handler: () => void): Promise<{ remove(): void }>;
  addListener(event: "stateChange", handler: (data: { isPlaying: boolean; path: string; index?: number }) => void): Promise<{ remove(): void }>;
  setQueue(options: { tracks: { path: string; title: string; artist: string; isCut?: boolean; cutFrom?: number; cutTo?: number }[]; currentIndex: number }): Promise<void>;
  setPlayMode(options: { mode: string }): Promise<void>;
  setCrossfadeDuration(options: { milliseconds: number }): Promise<void>;
  setPlaybackSpeed(options: { speed: number }): Promise<void>;
  getPlaybackSpeed(): Promise<{ speed: number }>;
  getAlbumArt(options: { path: string }): Promise<{ art: string }>;
  /** A small JPEG of the embedded cover, for list rows. "" when there is none.
   *  ready is false when the playback service had not bound yet, meaning "ask
   *  again", not "this file has no cover". */
  getAlbumArtThumb(options: { path: string; albumId?: number; maxPx?: number }): Promise<{ art: string; ready?: boolean }>;
  /** Hand native the user's chosen cover for one track, so the lock screen shows
   *  it. dataUrl null clears it. */
  setTrackArt(options: { path: string; dataUrl: string | null }): Promise<void>;
  setEqualizerEnabled(options: { enabled: boolean }): Promise<void>;
  setEqualizerBandLevels(options: { levels: number[] }): Promise<void>;
  getEqualizerInfo(): Promise<{ available: boolean; bandFreqsHz: number[]; minMillibel: number; maxMillibel: number }>;
  /** mix: keep playing when another app starts sound. duck: also ask Android to
   *  lower that app, until it asks for the sound back. */
  setMixMode(options: { mix: boolean; duck: boolean }): Promise<void>;
};

export type SystemPlugin = {
  getDeviceInfo(): Promise<{ manufacturer: string; model: string; androidVersion: string; sdk: number }>;
  /** 0.9, 1 or 1.15, on top of the phone's own font size. */
  setTextZoom(options: { factor: number }): Promise<void>;
  /** mailto:, market: or https:. Rejects with code NO_HANDLER when nothing on
   *  the phone can open it. */
  openExternal(options: { url: string }): Promise<void>;
  checkPlayUpdate(): Promise<{ available: boolean; versionCode?: number }>;
  startPlayUpdate(): Promise<void>;
  /** Which launcher icon is switched on: "classic", "light", "vinyl" or "stamp". */
  getAppIcon(): Promise<{ icon: string }>;
  /** Google Play's own review card, over the app. Resolves whether Play
   *  could be asked; whether the card was shown, or what was given, is not
   *  told (Play keeps that to itself). */
  askReview(): Promise<{ asked: boolean }>;
  /** Switches the launcher icon. Android ends the app's window when it does,
   *  so the switch waits until MPTree leaves the screen; with restart: true
   *  MPTree closes itself right away to make it. Some launchers then move the
   *  icon off the home screen, to the app list. */
  setAppIcon(options: { icon: string; restart?: boolean }): Promise<void>;
  /** Asks the launcher to pin an extra MPTree shortcut with this picture on
   *  it. Resolves supported:false when the launcher cannot pin shortcuts. The
   *  launcher shows its own confirmation; this does not wait for it. */
  pinPhotoShortcut(options: { dataUrl: string; label: string }): Promise<{ supported: boolean }>;
};

/** Google Play Billing, for MPTree Pro. Only works in a build Play installed. */
export type BillingPlugin = {
  /** price is Play's own formatted price in the person's currency. */
  getProduct(options: { productId: string }): Promise<{ price: string }>;
  /** Opens Play's purchase sheet. Resolves when the person has finished with it.
   *  accountTag ties the purchase to an MPTree account; tag is the one it has. */
  purchase(options: { productId: string; accountTag?: string }): Promise<{ owned: boolean; pending?: boolean; cancelled?: boolean; tag?: string }>;
  /** What this Google account already owns. ok:false means Play could not be reached. */
  restore(options: { productId: string }): Promise<{ ok: boolean; owned: boolean; tag?: string }>;
};

/** Rewarded video ads (AdMob), for a day of Pro. See AdsPlugin.java. */
export type AdsPlugin = {
  /** Asks the consent question first where the law wants one. reason, when
   *  not rewarded: offline, consent, none (no ad to show), closed or failed. */
  showRewarded(options: { adUnitId: string }): Promise<{ rewarded: boolean; reason?: string }>;
  /** Whether Settings must offer a way to change the consent answer. */
  privacyOptions(): Promise<{ required: boolean }>;
  showPrivacyOptions(): Promise<void>;
};

/** Sign in with Google, for the MPTree account. See AccountPlugin.java. */
export type AccountPlugin = {
  signIn(): Promise<{ token?: string; cancelled?: boolean }>;
  /** Rejects with code NEEDS_SIGN_IN when the grant is gone. */
  getToken(options: { email?: string }): Promise<{ token: string }>;
  clearToken(options: { token: string }): Promise<void>;
  signOut(options: { email?: string; token?: string }): Promise<void>;
};

/** Files for the MPTree account: fingerprints, and songs moving in and out.
 *  See SyncPlugin.java. Chunks are base64. */
export type SyncPlugin = {
  /** `fresh`: the first start of this install. */
  deviceId(): Promise<{ id: string; fresh?: boolean }>;
  network(): Promise<{ online: boolean; unmetered: boolean }>;
  /** Bytes free where songs go; -1 when unknown. */
  freeSpace(): Promise<{ bytes: number }>;
  keepScreenOn(options: { on: boolean }): Promise<void>;
  fingerprints(options: { paths: string[] }): Promise<{ items: { path: string; size: number; fp: string }[] }>;
  /** For each path, in order: "here" (the file is there), "gone" (it is not,
   *  but the storage it was on is) or "away" (that storage is not there now). */
  pathStates(options: { paths: string[] }): Promise<{ states: string[] }>;
  readChunk(options: { path: string; offset: number; length: number }): Promise<{ data: string; size: number }>;
  beginFile(options: { tid: string }): Promise<void>;
  appendChunk(options: { tid: string; data: string }): Promise<void>;
  /** Publishes into Music/MPTree. Rejects with INCOMPLETE when size is given
   *  and the file is not that size, and with FULL when the phone is full. */
  finishFile(options: { tid: string; name: string; size?: number }): Promise<{ path: string | null; uri: string }>;
  abortFile(options: { tid: string }): Promise<void>;
  driveUpload(options: { token: string; path: string; name: string; tid?: string; appProperties: Record<string, string> }): Promise<{ id: string }>;
  driveDownload(options: { token: string; fileId: string; tid: string; size?: number }): Promise<{ size: number }>;
  addListener(event: "progress", handler: (p: { tid: string; done: number; total: number }) => void): Promise<{ remove(): void }>;
};

// The browser has none of this. The stand-in answers the way a phone with
// nothing special about it would, so the demo and the dev server run the same
// code paths.
const SystemWeb: SystemPlugin = {
  getDeviceInfo: async () => ({ manufacturer: "browser", model: navigator.userAgent.slice(0, 60), androidVersion: "", sdk: 0 }),
  setTextZoom:   async () => {},
  openExternal:  async ({ url }) => { window.open(url, "_blank", "noopener"); },
  checkPlayUpdate:   async () => ({ available: false }),
  startPlayUpdate:   async () => {},
  getAppIcon:        async () => ({ icon: "classic" }),
  askReview:         async () => ({ asked: false }),
  setAppIcon:        async () => {},
  pinPhotoShortcut:  async () => ({ supported: false }),
};

const BillingWeb: BillingPlugin = {
  getProduct: async () => { throw new Error("Play Billing is not available here"); },
  purchase:   async () => { throw new Error("Play Billing is not available here"); },
  restore:    async () => ({ ok: false, owned: false }),
};

// No ads in a browser: the demo unlocks Pro with a tap instead.
const AdsWeb: AdsPlugin = {
  showRewarded:       async () => ({ rewarded: false, reason: "failed" }),
  privacyOptions:     async () => ({ required: false }),
  showPrivacyOptions: async () => {},
};

// No Google sign-in in a browser. On the dev server a stand-in account can be
// switched on with localStorage.mptree_dev_account = "1": it keeps the "Drive"
// in localStorage too (see sync/drive.ts), so two tabs act as two phones.
const devAccount = () => { try { return import.meta.env.DEV && localStorage.getItem("mptree_dev_account") === "1"; } catch { return false; } };
const unavailable = () => Promise.reject(Object.assign(new Error("Only in the app"), { code: "UNAVAILABLE" }));
const AccountWeb: AccountPlugin = {
  signIn:     async () => devAccount() ? { token: "dev" } : unavailable(),
  getToken:   async () => devAccount() ? { token: "dev" } : unavailable(),
  clearToken: async () => {},
  signOut:    async () => {},
};
const SyncWeb: SyncPlugin = {
  deviceId: async () => {
    let id = sessionStorage.getItem("mptree_dev_device");
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("mptree_dev_device", id); }
    return { id };
  },
  network:      async () => ({ online: navigator.onLine, unmetered: true }),
  freeSpace:    async () => ({ bytes: -1 }),
  keepScreenOn: async () => {},
  // The demo songs are the same in every tab, so a name is fingerprint enough.
  fingerprints: async ({ paths }) => ({ items: paths.map(p => ({ path: p, size: 0, fp: "web-" + p.split("/").pop() })) }),
  pathStates:   async ({ paths }) => ({ states: paths.map(() => "gone") }),
  readChunk:    unavailable,
  beginFile:    unavailable,
  appendChunk:  unavailable,
  finishFile:   unavailable,
  abortFile:    async () => {},
  driveUpload:  unavailable,
  driveDownload: unavailable,
  addListener:  async () => ({ remove() {} }),
};

const platform = Capacitor.getPlatform();
const isWeb = platform === "web";

/** The iPhone version. Its Swift plugins (ios/App/App/) arrive one at a time;
 *  until one is in, the stand-in answers for it, as in the browser. Android
 *  has every plugin. */
export const IS_IOS = platform === "ios";
const native = (name: string) => platform === "android" || (IS_IOS && Capacitor.isPluginAvailable(name));

/** Whether signing in to an MPTree account can work here: the native Google
 *  sign-in, or the dev server's stand-in account. */
export const SIGN_IN_HERE = isWeb ? import.meta.env.DEV : native("Account");

export const MusicScanner: MusicScannerPlugin = native("MusicScanner")
  ? registerPlugin<MusicScannerPlugin>("MusicScanner")
  : (new MusicScannerWeb() as unknown as MusicScannerPlugin);

export const AudioPlayer: AudioPlayerPlugin = native("AudioPlayer")
  ? registerPlugin<AudioPlayerPlugin>("AudioPlayer")
  : (new AudioPlayerWeb() as unknown as AudioPlayerPlugin);

export const System: SystemPlugin = native("System")
  ? registerPlugin<SystemPlugin>("System")
  : SystemWeb;

export const Billing: BillingPlugin = native("Billing")
  ? registerPlugin<BillingPlugin>("Billing")
  : BillingWeb;

export const Ads: AdsPlugin = native("Ads")
  ? registerPlugin<AdsPlugin>("Ads")
  : AdsWeb;

export const Account: AccountPlugin = native("Account")
  ? registerPlugin<AccountPlugin>("Account")
  : AccountWeb;

export const Sync: SyncPlugin = native("Sync")
  ? registerPlugin<SyncPlugin>("Sync")
  : SyncWeb;
