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
  scanFolder(options: { path: string }): Promise<void>;
  // Permanently deletes an audio file from the device via MediaStore.
  // Resolves { deleted: true } on success, { deleted: false } if the user
  // declined the system confirmation dialog (Android 11+).
  deleteFile(options: { path: string }): Promise<{ deleted: boolean }>;
  // Losslessly exports a segment [startMs, endMs] of an audio file to a real
  // file in Music/MPTree and registers it with MediaStore. Rejects with code
  // "UNSUPPORTED_FORMAT" when the source codec can't be muxed losslessly.
  cutTrack(options: { path: string; startMs: number; endMs: number; name: string }):
    Promise<{ uri: string; path: string | null; contentUri?: string; title: string; duration: number }>;
  // Opens this app's system settings page (App info), where the user can grant
  // the media permission after having denied it with "Don't ask again".
  openAppSettings(): Promise<void>;
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
  getAlbumArtThumb(options: { path: string; maxPx?: number }): Promise<{ art: string; ready?: boolean }>;
  /** Hand native the user's chosen cover for one track, so the lock screen shows
   *  it. dataUrl null clears it. */
  setTrackArt(options: { path: string; dataUrl: string | null }): Promise<void>;
  setEqualizerEnabled(options: { enabled: boolean }): Promise<void>;
  setEqualizerBandLevels(options: { levels: number[] }): Promise<void>;
  getEqualizerInfo(): Promise<{ available: boolean; bandFreqsHz: number[]; minMillibel: number; maxMillibel: number }>;
};

const isWeb = Capacitor.getPlatform() === "web";

export const MusicScanner: MusicScannerPlugin = isWeb
  ? (new MusicScannerWeb() as unknown as MusicScannerPlugin)
  : registerPlugin<MusicScannerPlugin>("MusicScanner");

export const AudioPlayer: AudioPlayerPlugin = isWeb
  ? (new AudioPlayerWeb() as unknown as AudioPlayerPlugin)
  : registerPlugin<AudioPlayerPlugin>("AudioPlayer");
