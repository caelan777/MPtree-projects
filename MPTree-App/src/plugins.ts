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
  play(options: { path: string; title?: string; artist?: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getCurrentPosition(): Promise<{ position: number }>;
  getDuration(): Promise<{ duration: number }>;
  getState(): Promise<{ position: number; duration: number }>;
  getCurrentSong(): Promise<{ path: string; isPlaying: boolean }>;
  seekTo(options: { milliseconds: number }): Promise<void>;
  addListener(event: "trackComplete", handler: () => void): Promise<{ remove(): void }>;
  addListener(event: "stateChange", handler: (data: { isPlaying: boolean; path: string }) => void): Promise<{ remove(): void }>;
  setQueue(options: { tracks: { path: string; title: string; artist: string; isCut?: boolean }[]; currentIndex: number }): Promise<void>;
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
  /** Switches the launcher icon. Android may take a few seconds to redraw the
   *  home screen, and some launchers move the icon to the app drawer. */
  setAppIcon(options: { icon: string }): Promise<void>;
  /** Asks the launcher to pin an extra MPTree shortcut with this picture on
   *  it. Resolves supported:false when the launcher cannot pin shortcuts. The
   *  launcher shows its own confirmation; this does not wait for it. */
  pinPhotoShortcut(options: { dataUrl: string; label: string }): Promise<{ supported: boolean }>;
};

/** Google Play Billing, for MPTree Pro. Only works in a build Play installed. */
export type BillingPlugin = {
  /** price is Play's own formatted price in the person's currency. */
  getProduct(options: { productId: string }): Promise<{ price: string }>;
  /** Opens Play's purchase sheet. Resolves when the person has finished with it. */
  purchase(options: { productId: string }): Promise<{ owned: boolean; pending?: boolean; cancelled?: boolean }>;
  /** What this Google account already owns. ok:false means Play could not be reached. */
  restore(options: { productId: string }): Promise<{ ok: boolean; owned: boolean }>;
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
  deviceId(): Promise<{ id: string }>;
  network(): Promise<{ online: boolean; unmetered: boolean }>;
  /** Bytes free where songs go; -1 when unknown. */
  freeSpace(): Promise<{ bytes: number }>;
  keepScreenOn(options: { on: boolean }): Promise<void>;
  fingerprints(options: { paths: string[] }): Promise<{ items: { path: string; size: number; fp: string }[] }>;
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
  setAppIcon:        async () => {},
  pinPhotoShortcut:  async () => ({ supported: false }),
};

const BillingWeb: BillingPlugin = {
  getProduct: async () => { throw new Error("Play Billing is not available here"); },
  purchase:   async () => { throw new Error("Play Billing is not available here"); },
  restore:    async () => ({ ok: false, owned: false }),
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
  readChunk:    unavailable,
  beginFile:    unavailable,
  appendChunk:  unavailable,
  finishFile:   unavailable,
  abortFile:    async () => {},
  driveUpload:  unavailable,
  driveDownload: unavailable,
  addListener:  async () => ({ remove() {} }),
};

const isWeb = Capacitor.getPlatform() === "web";

export const MusicScanner: MusicScannerPlugin = isWeb
  ? (new MusicScannerWeb() as unknown as MusicScannerPlugin)
  : registerPlugin<MusicScannerPlugin>("MusicScanner");

export const AudioPlayer: AudioPlayerPlugin = isWeb
  ? (new AudioPlayerWeb() as unknown as AudioPlayerPlugin)
  : registerPlugin<AudioPlayerPlugin>("AudioPlayer");

export const System: SystemPlugin = isWeb
  ? SystemWeb
  : registerPlugin<SystemPlugin>("System");

export const Billing: BillingPlugin = isWeb
  ? BillingWeb
  : registerPlugin<BillingPlugin>("Billing");

export const Account: AccountPlugin = isWeb
  ? AccountWeb
  : registerPlugin<AccountPlugin>("Account");

export const Sync: SyncPlugin = isWeb
  ? SyncWeb
  : registerPlugin<SyncPlugin>("Sync");
