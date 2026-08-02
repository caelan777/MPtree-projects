import React, { useEffect, useState, useRef, useCallback } from "react";
import { registerPlugin } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Preferences } from "@capacitor/preferences";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Logo } from "./components/Logo";

import type { Song, SongMeta, PlayMode, FilterId, Theme } from "./types";
import { makeCutId } from "./types";
import { DARK, LIGHT, FILTER_OPTIONS } from "./themes";
import { IC } from "./components/Icons";
import { AlbumArt } from "./components/AlbumArt";
import { Toast, type ToastAction } from "./components/Toast";
import { EditSheet } from "./components/EditSheet";
import { ExpandedSongRow } from "./components/ExpandedSongRow";
import { PlayerExpandSheet } from "./components/PlayerExpandSheet";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { CutTrackSheet } from "./components/CutTrackSheet";
import { SettingsSheet } from "./components/SettingsSheet";
import { BinView } from "./components/BinView";
import { MultiSelectBar } from "./components/MultiSelectBar";
import { EQSheet } from "./components/EQSheet";
import { LoadingScreen } from "./components/LoadingScreen";
import { OnboardingOverlay } from "./components/OnboardingOverlay";
import { isMissingArtist, extractDominantColor }  from "./utils";
import { PlaylistsView }    from "./components/PlaylistsView";
import { BackupSheet }      from "./components/BackupSheet";
import type { BackupSheetState } from "./components/BackupSheet";
import type { Playlist, SmartPlaylist } from "./types";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { usePageSwipe } from "./hooks/usePageSwipe";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import {
  loadCutTracks, saveCutTracksToStorage,
  loadRemovedTracks, saveRemovedTracksToStorage,
  loadSession, saveSession,
  loadMeta, saveMeta, saveMetaNow,
  loadPlaylists, savePlaylists,
  exportBackup, parseBackup, importBackup, scanBackupFolder, zipBackupFolder,
} from "./storage";
import type { BackupData } from "./storage";

// ─── PLUGINS ─────────────────────────────────────────────────────────────────

type MusicScannerPlugin = {
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
type AudioPlayerPlugin = {
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
  setEqualizerEnabled(options: { enabled: boolean }): Promise<void>;
  setEqualizerBandLevels(options: { levels: number[] }): Promise<void>;
  getEqualizerInfo(): Promise<{ available: boolean; bandFreqsHz: number[]; minMillibel: number; maxMillibel: number }>;
};
const MusicScanner = registerPlugin<MusicScannerPlugin>("MusicScanner");
const AudioPlayer  = registerPlugin<AudioPlayerPlugin>("AudioPlayer");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDateTag(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function estimateMB(songs: Song[]): number {
  // Estimate from each track's known duration assuming a ~256 kbps average
  // (256_000 bits/s ÷ 8 = 32_000 bytes/s). This is far closer than the old
  // flat 4 MB/song guess for both short clips and long FLAC/live tracks.
  // Songs with no known duration fall back to the 4 MB heuristic.
  const BYTES_PER_SEC = 32_000;
  let totalBytes = 0;
  for (const s of songs) {
    if (s.duration && s.duration > 0) {
      totalBytes += (s.duration / 1000) * BYTES_PER_SEC;
    } else {
      totalBytes += 4 * 1024 * 1024;
    }
  }
  return Math.max(1, Math.round(totalBytes / (1024 * 1024)));
}

// MusicScanner returns raw absolute paths (no scheme). Filesystem and Share
// both require a `file://` URI, so normalize once and reuse everywhere.
function toFileUri(uri: string): string {
  return uri.startsWith("file://") ? uri : `file://${uri}`;
}

// Fire-and-forget haptic feedback. Wrapped so every call site can use it
// without a .catch() — devices/browsers without haptics support (or a plain
// web preview) just silently no-op instead of throwing.
function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
  const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
  Haptics.impact({ style: map[style] }).catch(() => {});
}

async function deleteFileAtUri(uri: string): Promise<boolean> {
  // Deletes the file from the device via MediaStore (native). On Android 10+
  // a plain filesystem delete can't remove shared-storage files the app didn't
  // create — it silently fails, leaving the file on the phone. The native
  // MediaScanner.deleteFile goes through the MediaStore ContentResolver, which
  // is the supported way and (on Android 11+) shows the system confirm dialog.
  // Returns true if the file was actually deleted, false if the user declined.
  try {
    const res = await MusicScanner.deleteFile({ path: uri });
    return !!res.deleted;
  } catch (e) {
    console.warn("Native delete failed, attempting filesystem fallback:", e);
    // Fallback for older devices / edge cases.
    try {
      const path = uri.startsWith("file://") ? uri : `file://${uri}`;
      await Filesystem.deleteFile({ path });
      return true;
    } catch (e2) {
      console.warn("Filesystem fallback also failed:", e2);
      return false;
    }
  }
}

// ─── APP ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [songs,          setSongs]         = useState<Song[]>([]);
  const [removedSongs,   setRemovedSongs]  = useState<Song[]>([]);
  const [meta,           setMeta]          = useState<Record<string, SongMeta>>({});
  const [queue,          setQueue]         = useState<Song[]>([]);
  const [currentSong,    setCurrent]       = useState<Song | null>(null);
  const [isPlaying,      setPlaying]       = useState(false);
  const [playMode,       setPlayMode]      = useState<PlayMode>("off");
  const [search,         setSearch]        = useState("");
  const [filter,         setFilter]        = useState<FilterId>("newest");
  const [filterOpen,     setFilterOpen]    = useState(false);
  const [settingsOpen,   setSettingsOpen]  = useState(false);
  const [binOpen,        setBinOpen]       = useState(false);
  const [theme,          setTheme]         = useState<Theme>("dark");
  const [activeMenu,     setActiveMenu]    = useState<string | null>(null);
  const [editSong,       setEditSong]      = useState<Song | null>(null);
  const [removeSong,     setRemoveSong]    = useState<Song | null>(null);
  const [cutSong,        setCutSong]       = useState<Song | null>(null);
  const [cutDuration,    setCutDuration]   = useState(0);
  const [playerExpanded, setPlayerExpanded]= useState(false);
  const [editFromPlayer, setEditFromPlayer]= useState(false);
  const [toast,          setToast]         = useState<{ msg: string; action?: ToastAction } | null>(null);
  const [currentTime,    setCurrentTime]   = useState(0);
  const [duration,       setDuration]      = useState(0);
  const [dragging,       setDragging]      = useState(false);
  const [listScrollTop,  setListScrollTop] = useState(0);
  // Height of the scroll viewport, measured for list virtualization. Updated on
  // mount and resize. Falls back to a sensible default before first measure.
  const [listViewportH,  setListViewportH] = useState(0);

  // ── Floating header inset ─────────────────────────────────────────────────
  // Height of the floating header card (+ its top offset and a gap), measured
  // live so the list content always starts just below it — even when the card
  // grows/shrinks (search row hidden on the playlists page, select mode, etc.)
  const headerCardRef = useRef<HTMLDivElement | null>(null);
  const [topInset, setTopInset] = useState(176);
  useEffect(() => {
    const el = headerCardRef.current;
    if (!el) return;
    const update = () => setTopInset(Math.round(el.getBoundingClientRect().bottom) + 14);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  // ── Initial load / loading screen ─────────────────────────────────────────
  const [isInitializing, setIsInitializing] = useState(true);
  // True once the music scan has finished (which is also when the Android
  // media-permission prompt has been answered).
  const [libraryReady, setLibraryReady] = useState(false);
  // Holds the "scan the library" step so it can be fired AFTER the loading
  // screen has fully disappeared — that's when Android shows its permission
  // dialog, and we don't want that popping up behind the splash.
  const runLibraryScanRef = useRef<null | (() => void)>(null);
  // True while a playlist/smart-playlist detail view is open in PlaylistsView.
  const [playlistDetailOpen, setPlaylistDetailOpen] = useState(false);
  // True when the user denied the media-access permission — shows a recovery
  // screen with Retry / Open Settings instead of a silent empty library.
  const [permissionDenied, setPermissionDenied] = useState(false);

  // ── First-launch onboarding guide ─────────────────────────────────────────
  // Shown once, after the loading screen. A "seen" flag in Preferences keeps
  // it from ever appearing again.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    // Key is versioned: v2 = the spotlight tour. Bumping the key makes the new
    // tour show once even for users who completed the old card-based one.
    Preferences.get({ key: "mptree_onboarded_v2" })
      .then(({ value }) => { if (!value) setShowOnboarding(true); })
      .catch(() => {});
  }, []);
  const finishOnboarding = useCallback(() => {
    setShowOnboarding(false);
    Preferences.set({ key: "mptree_onboarded_v2", value: "1" }).catch(() => {});
  }, []);

  // ── Embedded album art for the now-playing surfaces ───────────────────────
  // Fetched from native (MediaMetadataRetriever) whenever the current song
  // changes, and only used as a fallback when the song has no user-set photo.
  // Keyed by song id so a stale async result for a previous track is ignored.
  const [nowPlayingArt, setNowPlayingArt] = useState<{ id: string; url: string } | null>(null);

  // Dominant color pulled from whatever art is currently showing (custom photo
  // or embedded art). Used to tint the mini-player and blur the expanded-player
  // backdrop instead of a flat theme color. Null while unresolved / no art.
  const [nowPlayingColor, setNowPlayingColor] = useState<{ id: string; rgb: string } | null>(null);
  const lastColorUrlRef = useRef<string | null>(null);

  // ── Play Next queue ───────────────────────────────────────────────────────
  const [playNextQueue,    setPlayNextQueue]  = useState<string[]>([]);
  const playNextQueueRef = useRef<string[]>([]);
  useEffect(() => { playNextQueueRef.current = playNextQueue; }, [playNextQueue]);

  // ── Audio effects ─────────────────────────────────────────────────────────
  const [crossfadeMs,  setCrossfadeMs]  = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [eqEnabled,    setEqEnabled]    = useState(false);
  const [eqBandLevels, setEqBandLevels] = useState<number[]>([]);
  const [eqInfo,       setEqInfo]       = useState<{
    available: boolean; bandFreqsHz: number[]; minMillibel: number; maxMillibel: number;
  } | null>(null);
  const [eqOpen, setEqOpen] = useState(false);

  // ── Sleep timer ─────────────────────────────────────────────────────────
  // `sleepUntil` is an absolute epoch-ms deadline (null = off). When it's a
  // "end of current track" timer instead of a fixed clock, sleepEndOfTrack is
  // true and sleepUntil is null. We keep both a state (for UI) and a ref (so
  // the interval/trackComplete callbacks can read the latest without re-binding).
  const [sleepUntil,      setSleepUntil]      = useState<number | null>(null);
  const [sleepEndOfTrack, setSleepEndOfTrack] = useState(false);
  const sleepUntilRef      = useRef<number | null>(null);
  const sleepEndOfTrackRef = useRef(false);
  useEffect(() => { sleepUntilRef.current      = sleepUntil;      }, [sleepUntil]);
  useEffect(() => { sleepEndOfTrackRef.current = sleepEndOfTrack; }, [sleepEndOfTrack]);

  // ── Backup / Restore sheet state machine ──────────────────────────────────
  const [backupSheet, setBackupSheet] = useState<BackupSheetState>({ kind: "closed" });
  const backupCancelRef = useRef(false);
  // Holds the JSON file URI after a successful export (for sharing)
  const exportJsonUriRef = useRef<string>("");
  const exportFolderNameRef = useRef<string>("");
  // Hidden file input for picking the backup JSON
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // ── Playlists ─────────────────────────────────────────────────────────────
  const [playlists,     setPlaylists]     = useState<Playlist[]>([]);
  const [page, setPage] = useState<"songs" | "playlists">("songs");

  const scrollRef    = useRef<HTMLDivElement>(null);
  const songRowRefs  = useRef<Map<string, HTMLDivElement>>(new Map());
  const queueRef     = useRef<Song[]>([]);
  const curRef       = useRef<Song | null>(null);
  const playModeRef  = useRef<PlayMode>("off");
  const filterRef    = useRef<FilterId>("newest");
  const currentTimeRef  = useRef<number>(0);
  const sessionReadyRef = useRef(false);
  const loadedRef    = useRef(false);
  const displayListRef  = useRef<Song[]>([]);
  const isPlayingRef = useRef(false);
  const metaRef      = useRef<Record<string, SongMeta>>({});
  const removedRef   = useRef<Song[]>([]);
  const activeMenuRef = useRef<string | null>(null);
  const pressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartX  = useRef(0);
  const pressStartY  = useRef<number>(0);
  const shufflePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Audio effects refs ────────────────────────────────────────────────────
  const crossfadeMsRef  = useRef(0);
  const playbackSpeedRef = useRef(1);
  const eqEnabledRef    = useRef(false);
  const eqBandLevelsRef = useRef<number[]>([]);

  // ── Theme ref ─────────────────────────────────────────────────────────────
  const themeRef       = useRef<Theme>("dark");

  // ── Player swipe-up ref ───────────────────────────────────────────────────
  const playerSwipeStartY = useRef<number | null>(null);
  const playerSwipeStartX = useRef<number | null>(null);

  // ── Sync refs ─────────────────────────────────────────────────────────────
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { curRef.current = currentSong; }, [currentSong]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  useEffect(() => { removedRef.current = removedSongs; }, [removedSongs]);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { crossfadeMsRef.current  = crossfadeMs;  }, [crossfadeMs]);
  useEffect(() => { activeMenuRef.current   = activeMenu;   }, [activeMenu]);
  useEffect(() => { playbackSpeedRef.current = playbackSpeed; }, [playbackSpeed]);
  useEffect(() => { eqEnabledRef.current    = eqEnabled;    }, [eqEnabled]);
  useEffect(() => { eqBandLevelsRef.current = eqBandLevels; }, [eqBandLevels]);
  useEffect(() => { themeRef.current        = theme;        }, [theme]);

  // Keep the WebView below the Android status bar. CSS env(safe-area-inset-top)
  // is unreliable on Capacitor Android (often reports 0), so we explicitly turn
  // off overlay and colour the bar to match the theme. No-ops on web.
  useEffect(() => {
    const dark = theme === "dark";
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: dark ? "#000000" : "#FFFFFF" }).catch(() => {});
  }, [theme]);

  const TH = theme === "dark" ? DARK : LIGHT;

  const getMeta    = (s: Song) => meta[s.id] || {};
  const dispName   = (s: Song) => getMeta(s).customName   || s.title;
  const dispArtist = (s: Song) =>
    getMeta(s).customArtist || (!isMissingArtist(s.artist) ? s.artist : "");
  const isLiked    = (s: Song) => !!getMeta(s).liked;
  const showToast  = (m: string, action?: ToastAction) => setToast({ msg: m, action });
  const showError  = useCallback((m: string) => setToast({ msg: "⚠ " + m }), []);
  const fmt        = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };

  const toNativeTrack = useCallback((t: Song) => ({
    path:   t.uri,
    title:  metaRef.current[t.id]?.customName ?? t.title,
    artist: metaRef.current[t.id]?.customArtist ?? (!isMissingArtist(t.artist) ? t.artist : "Unknown"),
    isCut:  !!t.isCut,
  }), []);

  // ── flushSession ──────────────────────────────────────────────────────────
  const flushSessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSession = useCallback(() => {
    if (flushSessionTimer.current) return;
    flushSessionTimer.current = setTimeout(() => {
      flushSessionTimer.current = null;
      saveMetaNow(metaRef.current);
      saveSession({
        filter:       filterRef.current,
        playMode:     playModeRef.current,
        currentId:    curRef.current?.id,
        queueIds:     playModeRef.current === "shuffle"
                        ? queueRef.current.map(s => s.id)
                        : undefined,
        positionMs:   currentTimeRef.current,
        isPlaying:    isPlayingRef.current,
        crossfadeMs:  crossfadeMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
        eqEnabled:    eqEnabledRef.current,
        eqBandLevels: eqBandLevelsRef.current,
        theme:        themeRef.current,
        playNextQueue: playNextQueueRef.current,
      });
    }, 0);
  }, []);

  // ── Scan ──────────────────────────────────────────────────────────────────
  const scanMusic = useCallback(async (removedList?: Song[]): Promise<Song[]> => {
    try {
      const [r, persistedCuts] = await Promise.all([MusicScanner.scan(), loadCutTracks()]);
      setPermissionDenied(false);
      const scannedWithIds: Song[] = r.songs.map((s: Song) => ({ ...s, id: s.uri }));
      const currentRemoved = removedList ?? removedRef.current;
      const blocked = new Set(currentRemoved.map((s: Song) => s.id));
      const sorted = [...scannedWithIds].filter((s: Song) => !blocked.has(s.id)).sort((a: Song, b: Song) => (b.dateAdded || 0) - (a.dateAdded || 0));
      const cutIds = new Set(persistedCuts.filter((s: Song) => !blocked.has(s.id)).map((s: Song) => s.id));
      const result = [...persistedCuts.filter((s: Song) => cutIds.has(s.id)), ...sorted];
      setSongs(() => result);

      return result;
    } catch (e) {
      // Permission denied is an expected outcome, not a crash — show a clear
      // recovery screen instead of a toast that vanishes and an empty list.
      const msg = String((e as { message?: string })?.message ?? e ?? "");
      if (/permission/i.test(msg) && /deni/i.test(msg)) {
        setPermissionDenied(true);
      } else {
        showError("Scan failed: " + e);
      }
      return [];
    }
  }, [showError]);

  const openAppSettings = useCallback(() => {
    MusicScanner.openAppSettings().catch(() => {});
  }, []);

  const resyncFromNative = async (scanned: Song[]) => {
    try {
      const native = await AudioPlayer.getCurrentSong();
      if (!native?.path) return false;
      const match = scanned.find(s => s.uri === native.path);
      if (!match) return false;
      const [{ position }, { duration: dur }] = await Promise.all([AudioPlayer.getCurrentPosition(), AudioPlayer.getDuration()]);
      setCurrent(match); setCurrentTime(position); currentTimeRef.current = position;
      if (dur > 0) setDuration(dur);
      setPlaying(native.isPlaying); loadedRef.current = true;
      setQueue(prev => prev.some(s => s.id === match.id) ? prev : [match]);
      return true;
    } catch { return false; }
  };

  useEffect(() => {
    // ── Two-phase startup ────────────────────────────────────────────────
    // Phase 1 (here) only touches local app data — no permission prompts —
    // so the loading screen can finish cleanly. Phase 2 (runLibraryScan)
    // does the actual music scan, which is what makes Android show its
    // media-access dialog; it fires once the loading screen is GONE.
    let pendingBin: Song[] = [];
    let pendingSession: Awaited<ReturnType<typeof loadSession>> = {};
    let scanStarted = false;

    const runLibraryScan = async () => {
      if (scanStarted) return;
      scanStarted = true;
      try {
        const scanned = await scanMusic(pendingBin);
        const session = pendingSession;

        const resynced = await resyncFromNative(scanned);
        if (!resynced && session.currentId) {
          const found = scanned.find(s => s.id === session.currentId);
          if (found) {
            const restoredQueue = (session.playMode === "shuffle" && session.queueIds)
              ? session.queueIds.map((id: string) => scanned.find((s: Song) => s.id === id)).filter((s): s is Song => !!s)
              : [found];
            setQueue(restoredQueue); setCurrent(found); setCurrentTime(session.positionMs ?? 0);
            currentTimeRef.current = session.positionMs ?? 0; setPlaying(false); loadedRef.current = false;
          }
        }
      } finally {
        setLibraryReady(true);
        setTimeout(() => { sessionReadyRef.current = true; }, 0);
      }
    };
    runLibraryScanRef.current = () => { void runLibraryScan(); };

    const initialize = async () => {
      try {
        const storedBin = await loadRemovedTracks();
        pendingBin = storedBin;
        setRemovedSongs(storedBin);
        const storedMeta = await loadMeta();
        metaRef.current = storedMeta; setMeta(storedMeta);

        const storedPlaylists = await loadPlaylists();
        setPlaylists(storedPlaylists);

        const session = await loadSession();
        pendingSession = session;

        if (session.filter)   setFilter(session.filter);
        if (session.playMode) setPlayMode(session.playMode);
        if (session.crossfadeMs != null) {
          setCrossfadeMs(session.crossfadeMs);
          crossfadeMsRef.current = session.crossfadeMs;
        }
        if (session.playbackSpeed != null && session.playbackSpeed > 0) {
          setPlaybackSpeed(session.playbackSpeed);
          playbackSpeedRef.current = session.playbackSpeed;
        }
        if (session.eqEnabled != null) {
          setEqEnabled(session.eqEnabled);
          eqEnabledRef.current = session.eqEnabled;
        }
        if (Array.isArray(session.eqBandLevels) && session.eqBandLevels.length) {
          setEqBandLevels(session.eqBandLevels);
          eqBandLevelsRef.current = session.eqBandLevels;
        }
        if (session.theme) {
          setTheme(session.theme);
          themeRef.current = session.theme;
        }
        if (Array.isArray(session.playNextQueue) && session.playNextQueue.length) {
          setPlayNextQueue(session.playNextQueue);
          playNextQueueRef.current = session.playNextQueue;
        }

        AudioPlayer.setPlayMode({ mode: session.playMode ?? "off" }).catch(() => {});
        if (session.crossfadeMs)  AudioPlayer.setCrossfadeDuration({ milliseconds: session.crossfadeMs }).catch(() => {});
        if (session.playbackSpeed && session.playbackSpeed !== 1) AudioPlayer.setPlaybackSpeed({ speed: session.playbackSpeed }).catch(() => {});
        if (session.eqEnabled)    AudioPlayer.setEqualizerEnabled({ enabled: true }).catch(() => {});
        if (Array.isArray(session.eqBandLevels) && session.eqBandLevels.length)
          AudioPlayer.setEqualizerBandLevels({ levels: session.eqBandLevels }).catch(() => {});

      } finally {
        // Always clear the loading screen, even if something above threw —
        // otherwise the app would be stuck behind it forever.
        setIsInitializing(false);
      }
    };
    initialize();
    const sub = CapApp.addListener("appStateChange", ({ isActive }) => {
      // Close any open long-press menu across an app background/foreground
      // transition. Fixes being stuck in the menu after accidentally leaving
      // and returning to the app — you're no longer scrolled to that song, so
      // the row's own close button might not even be visible.
      if (activeMenuRef.current) setActiveMenu(null);
      if (isActive) {
        scanMusic().then(fs => resyncFromNative(fs).then(ok => {
          if (!ok) Promise.all([AudioPlayer.getCurrentPosition(), AudioPlayer.getDuration()])
            .then(([{ position }, { duration: dur }]) => { setCurrentTime(position); currentTimeRef.current = position; if (dur > 0) setDuration(dur); })
            .catch(() => {});
        }));
      } else { flushSession(); }
    });
    const pauseSub = CapApp.addListener("pause" as any, () => flushSession());
    const onVis = () => { if (document.visibilityState === "hidden") flushSession(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flushSession);
    return () => {
      sub.then(s => s.remove());
      pauseSub.then(s => s.remove()).catch(() => {});
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flushSession);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    flushSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, playMode, currentSong, queue, crossfadeMs, playbackSpeed, eqEnabled, eqBandLevels, playNextQueue, theme]);

  useEffect(() => { if (!sessionReadyRef.current) return; saveMeta(meta); }, [meta]);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    AudioPlayer.setPlayMode({ mode: playMode }).catch(() => {});
  }, [playMode]);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    AudioPlayer.setCrossfadeDuration({ milliseconds: crossfadeMs }).catch(() => {});
  }, [crossfadeMs]);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    AudioPlayer.setPlaybackSpeed({ speed: playbackSpeed }).catch(() => {});
  }, [playbackSpeed]);

  // ── Sleep timer: fixed-clock countdown ────────────────────────────────────
  // When sleepUntil is set, tick once a second and pause playback the moment
  // the deadline is reached. (End-of-track mode is handled separately, in the
  // native-advance sync path.) Not persisted across app restarts on purpose —
  // a sleep timer surviving a relaunch would be surprising.
  useEffect(() => {
    if (sleepUntil == null) return;
    const check = () => {
      if (sleepUntilRef.current == null) return;
      if (Date.now() >= sleepUntilRef.current) {
        AudioPlayer.pause().catch(() => {});
        setPlaying(false);
        setSleepUntil(null);
        sleepUntilRef.current = null;
        showToast("Sleep timer: playback paused");
      }
    };
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepUntil]);

  const setSleepTimer = useCallback((minutes: number | "endOfTrack" | null) => {
    if (minutes === null) {
      setSleepUntil(null); sleepUntilRef.current = null;
      setSleepEndOfTrack(false); sleepEndOfTrackRef.current = false;
      showToast("Sleep timer off");
      return;
    }
    if (minutes === "endOfTrack") {
      setSleepEndOfTrack(true); sleepEndOfTrackRef.current = true;
      setSleepUntil(null); sleepUntilRef.current = null;
      showToast("Will pause at end of track");
      return;
    }
    const until = Date.now() + minutes * 60_000;
    setSleepUntil(until); sleepUntilRef.current = until;
    setSleepEndOfTrack(false); sleepEndOfTrackRef.current = false;
    showToast(`Sleep timer set for ${minutes} min`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    AudioPlayer.setEqualizerEnabled({ enabled: eqEnabled }).catch(() => {});
  }, [eqEnabled]);

  useEffect(() => {
    if (!sessionReadyRef.current || !eqBandLevels.length) return;
    AudioPlayer.setEqualizerBandLevels({ levels: eqBandLevels }).catch(() => {});
  }, [eqBandLevels]);

  useEffect(() => {
    if (!currentSong) { setNowPlayingArt(null); return; }
    const id = currentSong.id;
    // Skip the native round-trip if the user already set a custom photo.
    if (metaRef.current[id]?.customPhoto) { setNowPlayingArt(null); return; }
    let cancelled = false;
    AudioPlayer.getAlbumArt({ path: currentSong.uri })
      .then(({ art }) => {
        if (cancelled) return;
        setNowPlayingArt(art ? { id, url: `data:image/jpeg;base64,${art}` } : null);
      })
      .catch(() => { if (!cancelled) setNowPlayingArt(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong]);

  // Dominant-color extraction for the mini-player tint / expanded-player blur
  // backdrop. Mirrors the art-source logic above directly (rather than calling
  // the later-defined nowPlayingPhoto helper) to avoid any ordering ambiguity.
  useEffect(() => {
    if (!currentSong) { setNowPlayingColor(null); lastColorUrlRef.current = null; return; }
    const custom = metaRef.current[currentSong.id]?.customPhoto;
    const url = custom || (nowPlayingArt && nowPlayingArt.id === currentSong.id ? nowPlayingArt.url : null) || null;
    if (url === lastColorUrlRef.current) return; // same art already processed
    lastColorUrlRef.current = url;
    if (!url) { setNowPlayingColor(null); return; }
    let cancelled = false;
    extractDominantColor(url).then(rgb => {
      if (cancelled) return;
      setNowPlayingColor(rgb ? { id: currentSong.id, rgb } : null);
    }).catch(() => { if (!cancelled) setNowPlayingColor(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSong, nowPlayingArt]);

  // Measure the scroll viewport height for list virtualization. Re-measures on
  // resize (orientation change, keyboard) so the visible-row window stays right.
  useEffect(() => {
    const measure = () => { if (scrollRef.current) setListViewportH(scrollRef.current.clientHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (!currentSong) return;
    const t = setTimeout(() => {
      const el = songRowRefs.current.get(currentSong.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      // Virtualized: the target row isn't mounted, so scroll by computed offset
      // (uniform 64px rows + the pull spacer height, centered in the viewport).
      const list = displayListRef.current;
      const idx = list.findIndex(s => s.id === currentSong.id);
      const cont = scrollRef.current;
      if (idx < 0 || !cont) return;
      const ROW = 64;
      // topInset: rows start below the floating header's padding.
      const target = Math.max(0, topInset + idx * ROW - cont.clientHeight / 2 + ROW / 2);
      cont.scrollTo({ top: target, behavior: "smooth" });
    }, 120);
    return () => clearTimeout(t);
  }, [currentSong]);

  // ── Position polling + cut track boundary ─────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !currentSong) return;
    let tick = 0;
    const iv = setInterval(async () => {
      if (dragging || document.hidden) return;
      try {
        const { position, duration: dur } = await AudioPlayer.getState();
        setCurrentTime(position); currentTimeRef.current = position;
        if (dur > 0) setDuration(dur);
        const cs = curRef.current;
        if (cs?.isCut && cs.cutTo != null && position >= cs.cutTo - 300) {
          await AudioPlayer.pause(); setPlaying(false);
          const q = queueRef.current; const idx = q.findIndex(s => s.id === cs.id);
          if (playModeRef.current === "repeat") {
            AudioPlayer.seekTo({ milliseconds: cs.cutFrom ?? 0 }).catch(() => {});
            setCurrentTime(cs.cutFrom ?? 0);
            setTimeout(() => AudioPlayer.resume().catch(() => {}), 50); setPlaying(true);
          } else if (idx !== -1 && idx < q.length - 1) { playSong(q[idx + 1], q); }
          else { setPlaying(false); setCurrentTime(0); loadedRef.current = false; }
          return;
        }
        tick++;
        if (tick % 5 === 0) flushSession();
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSong, dragging]);

  // ── Native-authoritative playback sync (FIX: double-advance) ───────────────
  //
  // The native service is the single source of truth for what's playing and
  // for advancing tracks. JS no longer independently re-runs the "pick the
  // next song" logic on trackComplete (that caused songs to be skipped in
  // pairs / jump around). Instead:
  //
  //   • "stateChange" carries the native { isPlaying, path }. Whenever the path
  //     differs from our current song, native has advanced (auto-advance,
  //     crossfade promotion, lock-screen next, headset button) and we simply
  //     adopt that path: update currentSong, advance the queue index, and
  //     consume the Play-Next pin if it matched.
  //   • "trackComplete" now only fires when the native queue is EXHAUSTED, so
  //     it means "stop and reset the transport", never "advance".
  //
  // This keeps UI and native perfectly in lock-step without the old 800ms race
  // guard.
  const syncToNativePath = useCallback((path: string, nativeIsPlaying: boolean) => {
    const cs = curRef.current;
    // Same track still playing — just reconcile the play/pause flag.
    if (cs && path === cs.uri) {
      setPlaying(nativeIsPlaying);
      return;
    }
    // Native moved to a different track. Find it in the current queue first
    // (covers shuffle + normal), then fall back to the display list.
    const q = queueRef.current;
    let next = q.find(s => s.uri === path) ?? null;
    let sourceList = q;
    if (!next) {
      const list = displayListRef.current;
      next = list.find(s => s.uri === path) ?? null;
      sourceList = list;
    }
    if (!next) return; // unknown path (e.g. stale) — ignore

    // End-of-track sleep timer: native tried to advance, but the user asked to
    // stop when the current track finished. Pause on the freshly-started track.
    if (sleepEndOfTrackRef.current) {
      setSleepEndOfTrack(false); sleepEndOfTrackRef.current = false;
      AudioPlayer.pause().catch(() => {});
      setCurrent(next);
      setCurrentTime(next.isCut ? (next.cutFrom ?? 0) : 0);
      currentTimeRef.current = next.isCut ? (next.cutFrom ?? 0) : 0;
      setPlaying(false);
      loadedRef.current = true;
      showToast("Sleep timer: playback paused");
      return;
    }

    // Consume a matching Play-Next pin so it doesn't replay later.
    const pinned = playNextQueueRef.current;
    if (pinned.length > 0 && pinned[0] === next.id) {
      const newPinned = pinned.slice(1);
      setPlayNextQueue(newPinned);
      playNextQueueRef.current = newPinned;
    }

    // If native advanced within a list we weren't tracking as the queue
    // (normal sequential mode), adopt that list as the queue so skip/seek and
    // subsequent auto-advance stay consistent.
    if (!q.some(s => s.uri === path) && sourceList.length) {
      setQueue(sourceList);
    }

    setCurrent(next);
    setCurrentTime(next.isCut ? (next.cutFrom ?? 0) : 0);
    currentTimeRef.current = next.isCut ? (next.cutFrom ?? 0) : 0;
    setPlaying(nativeIsPlaying);
    loadedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let listener: { remove(): void } | null = null;
    let stateListener: { remove(): void } | null = null;

    // Queue exhausted natively → stop and reset transport. Never advances.
    AudioPlayer.addListener("trackComplete", () => {
      setPlaying(false);
      setCurrentTime(0);
      currentTimeRef.current = 0;
      loadedRef.current = false;
    }).then(l => { listener = l; });

    // Primary sync channel: adopt whatever native is actually playing.
    AudioPlayer.addListener("stateChange", ({ isPlaying: nip, path }) => {
      if (!path) { setPlaying(nip); return; }
      syncToNativePath(path, nip);
    }).then(l => { stateListener = l; });

    return () => { listener?.remove(); stateListener?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToNativePath]);

  // ── Display list ──────────────────────────────────────────────────────────
  const isFavFilter = filter === "favorites";
  const displayList: Song[] = React.useMemo(() => {
    const processed = songs.filter(s =>
      (dispName(s).toLowerCase().includes(search.toLowerCase()) || dispArtist(s).toLowerCase().includes(search.toLowerCase())) &&
      (!isFavFilter || isLiked(s))
    ).slice().sort((a, b) => {
      if (filter === "favorites" || filter === "newest") return (b.dateAdded || 0) - (a.dateAdded || 0);
      if (filter === "oldest")       return (a.dateAdded || 0) - (b.dateAdded || 0);
      if (filter === "alphabetical") return dispName(a).localeCompare(dispName(b));
      if (filter === "artist")       return (dispArtist(a) || "zzz").localeCompare(dispArtist(b) || "zzz");
      return 0;
    });
    return isFavFilter ? [...processed.filter(isLiked), ...processed.filter(s => !isLiked(s))] : processed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, search, filter, meta]);
  displayListRef.current = displayList;

  // ── Playback ──────────────────────────────────────────────────────────────
  const playSong = async (s: Song, q: Song[], titleOverride?: string, artistOverride?: string) => {
    try {
      setQueue(q); setCurrent(s); setCurrentTime(0); setDuration(0); setPlaying(true); loadedRef.current = true;
      const title  = titleOverride  ?? getMeta(s).customName   ?? s.title;
      const artist = artistOverride ?? getMeta(s).customArtist ?? (s.artist && s.artist.toLowerCase() !== "<unknown>" ? s.artist : "Unknown");
      await AudioPlayer.play({ path: s.uri, title, artist });
      if (s.isCut && s.cutFrom && s.cutFrom > 0) {
        await AudioPlayer.seekTo({ milliseconds: s.cutFrom }); setCurrentTime(s.cutFrom); currentTimeRef.current = s.cutFrom;
      }
      const idx = q.findIndex(x => x.id === s.id);
      AudioPlayer.setQueue({ tracks: q.map(toNativeTrack), currentIndex: idx }).catch(() => {});
      setMeta(prev => {
        const cur = prev[s.id] || {};
        return { ...prev, [s.id]: { ...cur, lastPlayedAt: Date.now(), playCount: (cur.playCount ?? 0) + 1 } };
      });
    } catch (e) { showError("Play failed: " + e); }
  };

  const togglePlay = async () => {
    if (!currentSong) return;
    try {
      if (!loadedRef.current) {
        await AudioPlayer.play({ path: currentSong.uri, title: dispName(currentSong), artist: dispArtist(currentSong) || "Unknown" });
        const seekTarget = currentSong.isCut && currentTime <= (currentSong.cutFrom ?? 0) ? (currentSong.cutFrom ?? 0) : currentTime;
        if (seekTarget > 0) await AudioPlayer.seekTo({ milliseconds: seekTarget });
        loadedRef.current = true; setPlaying(true); return;
      }
      if (isPlaying) { await AudioPlayer.pause(); setPlaying(false); }
      else { await AudioPlayer.resume(); setPlaying(true); }
    } catch (e) { showError("Player error: " + e); }
  };

  const seekTo = async (ms: number) => {
    if (!currentSong) return;
    try {
      if (!loadedRef.current) { await AudioPlayer.play({ path: currentSong.uri, title: dispName(currentSong), artist: dispArtist(currentSong) || "Unknown" }); await AudioPlayer.pause(); loadedRef.current = true; }
      await AudioPlayer.seekTo({ milliseconds: ms });
    } catch { /* ignore */ }
  };

  // ── skip ──────────────────────────────────────────────────────────────────
  const skip = async (dir: -1 | 1) => {
    if (!currentSong) return;
    if (playMode === "shuffle") {
      if (!queue.length) return;
      const idx = queue.findIndex(s => s.id === currentSong.id);

      if (dir === 1) {
        const nextQueue = playNextQueueRef.current;
        if (nextQueue.length > 0) {
          const nextId = nextQueue[0];
          const pinnedSong = queue.find(s => s.id === nextId);
          if (pinnedSong) {
            const newPinned = nextQueue.slice(1);
            setPlayNextQueue(newPinned);
            playNextQueueRef.current = newPinned;
            const newQ = [...queue];
            const pinnedIdx = newQ.findIndex(s => s.id === nextId);
            if (pinnedIdx !== -1) newQ.splice(pinnedIdx, 1);
            const adjustedIdx = pinnedIdx < idx ? idx - 1 : idx;
            newQ.splice(adjustedIdx + 1, 0, pinnedSong);
            setQueue(newQ);
            playSong(pinnedSong, newQ);
            return;
          }
        }
      }

      const nxt = queue[idx + dir];
      if (nxt) playSong(nxt, queue);
    } else {
      const idx = displayList.findIndex(s => s.id === currentSong.id);
      const nxt = displayList[idx + dir];
      if (nxt) { setQueue(displayList); playSong(nxt, displayList); }
    }
  };

  // ── Play Next ─────────────────────────────────────────────────────────────
  const handlePlayNext = useCallback((song: Song) => {
    setPlayNextQueue(prev => {
      if (prev.includes(song.id)) return prev;
      return [...prev, song.id];
    });
    showToast(`"${dispName(song)}" added to Play Next`);
    setActiveMenu(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const handleSkipCurrentUpNext = useCallback(() => {
    const q = queueRef.current;
    const cur = curRef.current;
    if (!cur || q.length === 0) return;
    const idx = q.findIndex(s => s.id === cur.id);
    const pinnedSet = new Set(playNextQueueRef.current);
    const skipTargetIdx = q.findIndex((s, i) => i > idx && !pinnedSet.has(s.id));
    if (skipTargetIdx === -1) return;
    const newQ = [...q];
    const [skipped] = newQ.splice(skipTargetIdx, 1);
    newQ.push(skipped);
    setQueue(newQ);
    AudioPlayer.setQueue({ tracks: newQ.map(toNativeTrack), currentIndex: idx }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toNativeTrack]);

  // Fisher–Yates shuffle — uniform distribution. The old
  // `sort(() => Math.random() - 0.5)` is biased (comparator isn't a consistent
  // ordering) and clusters items on some engines.
  const shuffleArray = <U,>(arr: U[]): U[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const buildShuffleQ = (base: Song[]) => {
    const withDoubles = isFavFilter ? base.flatMap(s => isLiked(s) ? [s, s] : [s]) : base;
    return shuffleArray(withDoubles);
  };

  // ── Shuffle FAB ───────────────────────────────────────────────────────────
  const onShufflePressStart = () => { shufflePressTimer.current = setTimeout(() => { hapticImpact("medium"); setPlayMode(prev => { const next: PlayMode = prev === "repeat" ? "off" : "repeat"; showToast(next === "repeat" ? "Repeat on" : "Repeat off"); return next; }); }, 600); };
  const onShufflePressEnd   = () => { if (shufflePressTimer.current) clearTimeout(shufflePressTimer.current); };
  const onShuffleClick = () => {
    hapticImpact("light");
    if (playMode === "repeat") { setPlayMode("off"); showToast("Repeat off"); return; }
    if (!displayList.length) return;
    const q = buildShuffleQ(displayList); setPlayMode("shuffle"); playSong(q[0], q);
    showToast(isFavFilter ? "Shuffling favorites" : "Shuffling all songs");
  };

  const toggleShuffleFromPlayer = () => {
    if (playMode === "shuffle") {
      setPlayMode("off");
      setPlayNextQueue([]);
      playNextQueueRef.current = [];
      if (currentSong) {
        const idx = displayList.findIndex(s => s.id === currentSong.id);
        const orderedQ = idx >= 0 ? displayList.slice(idx) : displayList;
        setQueue(orderedQ);
        AudioPlayer.setQueue({ tracks: orderedQ.map(toNativeTrack), currentIndex: 0 }).catch(() => {});
      }
      showToast("Shuffle off, continuing in order"); return;
    }
    if (!currentSong) return;
    const rest = buildShuffleQ(displayList.filter(s => s.id !== currentSong.id));
    const q = [currentSong, ...rest]; setPlayMode("shuffle"); setQueue(q);
    AudioPlayer.setQueue({ tracks: q.map(toNativeTrack), currentIndex: 0 }).catch(() => {});
    showToast("Shuffle on");
  };

  // ── Mini-player swipe: gesture-driven expand (up) / skip (left-right) ──────
  // Vertical drags open the full player LIVE — the sheet follows the finger,
  // exactly like the horizontal Songs↔Playlists page swipe but vertical.
  // On release past ~25% it springs open; below that it settles back down.
  const [expandDrag, setExpandDrag]     = useState<number | null>(null); // 0..1 while dragging
  const [expandSettling, setExpandSettling] = useState(false);           // animating back down
  const openedByDragRef = useRef(false);   // skip the enter keyframe when drag already brought it up
  const playerAxisRef   = useRef<"h" | "v" | null>(null); // gesture axis lock

  const onPlayerSwipeStart = (clientX: number, clientY: number) => {
    // Ignore touches that begin in the system gesture zone at the very bottom
    // of the screen — that's the Android nav-bar reveal swipe, not a player
    // gesture. Without this, swiping up for the nav bar also expanded the player.
    const vh = window.innerHeight || 800;
    if (clientY > vh - 24) { playerSwipeStartX.current = null; playerSwipeStartY.current = null; playerAxisRef.current = "h"; return; }
    playerSwipeStartX.current = clientX;
    playerSwipeStartY.current = clientY;
    playerAxisRef.current = null;
  };
  const onPlayerSwipeMove = (clientX: number, clientY: number) => {
    if (playerSwipeStartY.current === null || playerSwipeStartX.current === null) return;
    const dx = clientX - playerSwipeStartX.current;
    const dy = playerSwipeStartY.current - clientY; // positive = up
    if (playerAxisRef.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      playerAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (playerAxisRef.current === "v" && dy > 0) {
      const vh = window.innerHeight || 800;
      setExpandDrag(Math.min(1, dy / (vh * 0.45)));
    }
  };
  const onPlayerSwipeEnd = (clientX: number, clientY: number) => {
    if (playerSwipeStartY.current === null || playerSwipeStartX.current === null) return;
    const deltaY = playerSwipeStartY.current - clientY;
    const deltaX = clientX - playerSwipeStartX.current;
    playerSwipeStartY.current = null;
    playerSwipeStartX.current = null;
    const axis = playerAxisRef.current;
    playerAxisRef.current = null;

    if (axis === "h" && Math.abs(deltaX) > 55) {
      hapticImpact("light");
      skip(deltaX < 0 ? 1 : -1);
      setExpandDrag(null);
      return;
    }
    if (expandDrag !== null) {
      if (expandDrag > 0.25 || deltaY > 160) {
        // Committed: hand over to the fully-open sheet without re-animating.
        openedByDragRef.current = true;
        hapticImpact("light");
        setPlayerExpanded(true);
        setExpandDrag(null);
      } else {
        // Not far enough: settle back down smoothly, then unmount.
        setExpandSettling(true);
        setExpandDrag(0);
        window.setTimeout(() => { setExpandSettling(false); setExpandDrag(null); }, 280);
      }
    }
  };

  // ── EQ / Audio effects sheet ──────────────────────────────────────────────
  const openEQSheet = useCallback(async () => {
    let info = eqInfo;
    if (!info) {
      try {
        info = await AudioPlayer.getEqualizerInfo();
        setEqInfo(info);
      } catch (e) {
        showError("Could not load equalizer info: " + e);
        return;
      }
    }
    setSettingsOpen(false);
    setEqOpen(true);
  }, [eqInfo, showError]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── EXPORT FLOW ───────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  /** Called when user taps "Export backup" in SettingsSheet */
  const handleExportOpen = useCallback(() => {
    const allSongs = [...songs, ...removedSongs];
    setBackupSheet({
      kind:        "exportInfo",
      songCount:   allSongs.length,
      estimatedMB: estimateMB(allSongs),
    });
  }, [songs, removedSongs]);

  /** Called when user taps "Start backup" in ExportInfoSheet */
  const doExport = useCallback(async (backupName: string) => {
    backupCancelRef.current = false;

    const now = Date.now();

    const backupData: BackupData = {
      version:    1,
      exportedAt: now,
      playlists: playlists.map(pl => ({
        id:         pl.id,
        name:       pl.name,
        createdAt:  pl.createdAt,
        coverPhoto: pl.coverPhoto,
        songs:      pl.songIds
          .map(id => songs.find(s => s.id === id))
          .filter((s): s is Song => s != null)
          .map(s => ({
            id:       s.id,
            title:    metaRef.current[s.id]?.customName   ?? s.title,
            artist:   metaRef.current[s.id]?.customArtist ?? s.artist,
            path:     s.uri,
            duration: s.duration,
          })),
      })),
      meta: metaRef.current,
      removedSongs: removedSongs.map(s => ({
        id:        s.id,
        title:     s.title,
        artist:    s.artist,
        path:      s.uri,
        dateAdded: s.dateAdded,
      })),
      cutTracks: songs
        .filter(s => s.isCut)
        .map(s => ({
          id:      s.id,
          title:   metaRef.current[s.id]?.customName   ?? s.title,
          artist:  metaRef.current[s.id]?.customArtist ?? s.artist,
          path:    s.uri,
          cutFrom: s.cutFrom,
          cutTo:   s.cutTo,
        })),
      liked: songs
        .filter(s => metaRef.current[s.id]?.liked)
        .map(s => s.uri),
    };

    const allPathSet = new Set<string>();
    for (const s of songs)        allPathSet.add(s.uri);
    for (const s of removedSongs) allPathSet.add(s.uri);
    const songPaths = [...allPathSet];
    const total     = songPaths.length;

    // Show progress sheet immediately
    setBackupSheet({ kind: "exportProgress", done: 0, total, cancelled: false });

    try {
      const result = await exportBackup(
        backupData,
        songPaths,
        backupName,
        (done, tot) => {
          if (backupCancelRef.current) return;
          setBackupSheet({ kind: "exportProgress", done, total: tot, cancelled: false });
        },
        backupCancelRef,
      );

      if (backupCancelRef.current) {
        setBackupSheet({ kind: "closed" });
        showToast("Backup cancelled");
        return;
      }

      exportJsonUriRef.current = result.jsonUri;
      exportFolderNameRef.current = result.folderName;
      setBackupSheet({
        kind:        "exportSuccess",
        folderName:  result.folderName,
        jsonUri:     result.jsonUri,
        failedCount: result.failedCount > 0 ? result.failedCount : undefined,
      });
    } catch (e: any) {
      if (e?.isStorageFull) {
        exportJsonUriRef.current = e.jsonUri ?? "";
        setBackupSheet({
          kind:         "exportError",
          message:      `Not enough storage space. Free up space and try again.`,
          copiedCount:  e.copiedCount ?? 0,
        });
      } else {
        setBackupSheet({
          kind:         "exportError",
          message:      `Export failed: ${e}`,
          copiedCount:  0,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, songs, removedSongs]);

  /** Share the whole backup folder (JSON + music) as a zip via Android share sheet */
  const handleShareBackup = useCallback(async () => {
    const folderName = exportFolderNameRef.current;
    if (!folderName) { showToast("Nothing to share"); return; }

    setBackupSheet({ kind: "sharing" });
    try {
      const { zipUri } = await zipBackupFolder(folderName);
      await Share.share({
        title: "MPTree backup",
        files: [zipUri],
        dialogTitle: "Share backup",
      });
      // Restore the success sheet so the user can still tap "Done".
      setBackupSheet({ kind: "exportSuccess", folderName });
    } catch (e) {
      showToast("Couldn't prepare backup for sharing");
      setBackupSheet({ kind: "exportSuccess", folderName });
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ── IMPORT FLOW ───────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  /** Called when user taps "Restore backup" in SettingsSheet */
  const handleImportOpen = useCallback(() => {
    setBackupSheet({ kind: "importInfo" });
  }, []);

  /** Called from ImportInfoSheet — opens the hidden file picker */
  const handleOpenImportPicker = useCallback(() => {
    importFileInputRef.current?.click();
  }, []);

  /** Processes the selected JSON file */
  const handleImportFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importFileInputRef.current) importFileInputRef.current.value = "";

    // Move to progress state before parsing
    setBackupSheet({ kind: "importProgress", phase: "Reading backup…" });

    const json = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = ev => resolve(ev.target?.result as string);
      reader.onerror = ()  => reject(new Error("Could not read file"));
      reader.readAsText(file);
    }).catch(() => null);

    if (!json) {
      setBackupSheet({ kind: "importError", message: "File not recognized. Could not read the file." });
      return;
    }

    let data: BackupData;
    try {
      data = parseBackup(json);
    } catch {
      setBackupSheet({ kind: "importError", message: "File not recognized. This doesn't look like an MPTree backup." });
      return;
    }

    // Check version compatibility
    if (data.version > 1) {
      setBackupSheet({ kind: "importError", message: "Backup is from a newer version of MPTree. Please update the app." });
      return;
    }

    try {
      let pathRemap: Map<string, string> | undefined;

      if (data.includeMusic && data.musicDir) {
        setBackupSheet({ kind: "importProgress", phase: "Indexing music…" });

        const { uri: musicAbsUri } = await Filesystem.getUri({
          directory: Directory.ExternalStorage,
          path: `${data.musicDir}/music`,
        });
        const musicAbsDir = musicAbsUri.replace(/^file:\/\//, "");

        pathRemap = new Map<string, string>();
        const allBackupPaths = new Set<string>();
        for (const pl of data.playlists)    for (const s of pl.songs)   allBackupPaths.add(s.path);
        for (const s  of data.removedSongs)                              allBackupPaths.add(s.path);
        for (const s  of data.cutTracks)                                 allBackupPaths.add(s.path);
        for (const p  of data.liked)                                     allBackupPaths.add(p);
        for (const key of Object.keys(data.meta))                        allBackupPaths.add(key);

        for (const origPath of allBackupPaths) {
          const filename = origPath.split("/").pop();
          if (filename) {
            pathRemap.set(origPath, `${musicAbsDir}/${filename}`);
          }
        }

        await scanBackupFolder(musicAbsDir);
      }

      setBackupSheet({ kind: "importProgress", phase: "Restoring playlists…" });

      const { playlists: pl, meta: m, removedSongs: rs, cutTracks: ct } =
        await importBackup(data, pathRemap);

      setPlaylists(pl);
      setMeta(m);
      metaRef.current = m;
      setRemovedSongs(rs);
      removedRef.current = rs;

      if (data.includeMusic) {
        await scanMusic(rs);
      }

      if (ct.length > 0) {
        setSongs(prev => {
          const cutIds = new Set(ct.map(s => s.id));
          return [...ct, ...prev.filter(s => !cutIds.has(s.id))];
        });
      }

      // Count total song references for the success screen
      const songCount = new Set([
        ...pl.flatMap(p => p.songIds),
        ...rs.map(s => s.id),
      ]).size;

      setBackupSheet({
        kind:          "importSuccess",
        playlistCount: pl.length,
        songCount,
      });
    } catch (e: any) {
      const msg = String(e);
      if (msg.includes("permission") || msg.includes("Permission")) {
        setBackupSheet({ kind: "importError", message: "Storage permission needed. Please grant file access and try again." });
      } else {
        setBackupSheet({ kind: "importError", message: "Restore failed. The backup may be incomplete or corrupted." });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMusic]);

  const closeBackupSheet = useCallback(() => {
    backupCancelRef.current = true;
    setBackupSheet({ kind: "closed" });
  }, []);

  const doneBackupSheet = useCallback(() => {
    setBackupSheet({ kind: "closed" });
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  // Stale-safe restore: uses functional setState so it works correctly even
  // when called later from an Undo button (bin state may have changed since).
  // Defined before useMultiSelect so it can be passed in as onRestoreSongs.
  const restoreSongs = useCallback((toRestore: Song[]) => {
    const ids = new Set(toRestore.map(s => s.id));
    setRemovedSongs(prev => {
      const updated = prev.filter(x => !ids.has(x.id));
      saveRemovedTracksToStorage(updated);
      return updated;
    });
    setSongs(prev => {
      const withoutDupes = prev.filter(x => !ids.has(x.id));
      const next = [...toRestore, ...withoutDupes];
      saveCutTracksToStorage(next.filter(x => x.isCut));
      return next;
    });
    scanMusic();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    selected,
    selectMode,
    removeMultiConfirm,
    setSelected,
    setSelectMode,
    setRemoveMultiConfirm,
    exitSelectMode,
    multiLike,
    multiShuffleSelection,
    multiRemove,
  } = useMultiSelect({
    displayList,
    songs,
    removedSongs,
    meta,
    currentSong,
    queue,
    playMode,
    onSongsChange:   setSongs,
    onRemovedChange: (updated) => { setRemovedSongs(updated); saveRemovedTracksToStorage(updated); },
    onPlaySong:      playSong,
    onSetCurrent:    setCurrent,
    onSetPlaying:    setPlaying,
    onSetPlayMode:   setPlayMode,
    onShowToast:     showToast,
    onRestoreSongs:  restoreSongs,
    onRescan:        scanMusic,
  });

  const multiLikeWithMeta = useCallback((like: boolean) => {
    setMeta(prev => {
      const next = { ...prev };
      for (const id of selected) next[id] = { ...(next[id] || {}), liked: like };
      return next;
    });
    multiLike(like);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, multiLike]);

  const {
    pageDragging,
    panelTransform,
    panelTransition,
    pageSwipeLocked,
    onPageTouchStart,
    onPageTouchMove,
    onPageTouchEnd,
  } = usePageSwipe({
    page,
    setPage,
    activeMenu,
    selectMode,
    filterOpen,
    // Inside a playlist detail, a horizontal swipe must not teleport back to
    // the Songs page — the user is one level deeper and expects the back arrow.
    swipeDisabled: playlistDetailOpen,
  });

  const {
    pullDist,
    refreshing,
    onTouchStart: onTS,
    onTouchMove:  onTM,
    onTouchEnd:   onTE,
  } = usePullToRefresh({
    scrollRef,
    pageSwipeLocked,
    onRefresh: scanMusic,
    onPageTouchStart,
    onPageTouchMove,
    onPageTouchEnd,
  });

  // ── Select mode tap handler ───────────────────────────────────────────────
  const handleTap = (song: Song) => {
    if (selectMode) {
      setSelected(prev => { const next = new Set(prev); if (next.has(song.id)) next.delete(song.id); else next.add(song.id); return next; });
      return;
    }
    if (activeMenu && activeMenu !== song.id) {
      setSelectMode(true);
      setSelected(new Set([activeMenu, song.id]));
      setActiveMenu(null);
      return;
    }
    // Single tap plays immediately. Liking is done via the heart button only
    // (double-tap-to-like was removed — it forced a 250ms delay on every play
    // and made tapping a song feel laggy).
    setActiveMenu(null); setQueue(displayList); playSong(song, displayList);
  };

  const onPressStart = (id: string, clientX: number, clientY: number) => {
    pressStartX.current = clientX;
    pressStartY.current = clientY;
    pressTimer.current = setTimeout(() => {
      hapticImpact("medium");
      setActiveMenu(prev => prev === id ? null : id);
      if (selectMode) setSelected(prev => { const next = new Set(prev); next.add(id); return next; });
    }, 500);
  };
  // Cancels on movement along EITHER axis: horizontal page swipes travel in X,
  // so checking only Y let a Playlists→Songs swipe ride out the 500ms timer
  // and pop a long-press menu mid-swipe.
  const onPressMove = (clientX: number, clientY: number) => {
    if (Math.abs(clientY - pressStartY.current) > 8 || Math.abs(clientX - pressStartX.current) > 8) {
      if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    }
  };
  const onPressEnd  = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const applyEdit = (s: Song, u: { customName?: string; customArtist?: string; customPhoto?: string | null }) => {
    setMeta(prev => {
      const existing = prev[s.id] || {};
      return { ...prev, [s.id]: { ...existing, ...(u.customName !== undefined ? { customName: u.customName } : {}), ...(u.customArtist !== undefined ? { customArtist: u.customArtist } : {}), ...(u.customPhoto !== undefined ? { customPhoto: u.customPhoto ?? undefined } : {}) } };
    });
    setEditSong(null); setActiveMenu(null);
    if (editFromPlayer) { setEditFromPlayer(false); setPlayerExpanded(true); }
  };

  // ── Remove to bin ─────────────────────────────────────────────────────────
  const doRemove = (s: Song) => {
    const wasPlaying = currentSong?.id === s.id;
    const updated = [s, ...removedSongs];
    setRemovedSongs(updated); saveRemovedTracksToStorage(updated);
    setSongs(prev => { const next = prev.filter(x => x.id !== s.id); saveCutTracksToStorage(next.filter(x => x.isCut)); return next; });
    if (wasPlaying) {
      if (playMode === "shuffle") { const idx = queue.findIndex(x => x.id === s.id); const rq = queue.filter(x => x.id !== s.id); setQueue(rq); const nxt = rq[idx] ?? rq[0]; if (nxt) playSong(nxt, rq); else { setCurrent(null); setPlaying(false); } }
      else { const rl = displayList.filter(x => x.id !== s.id); const idx = displayList.findIndex(x => x.id === s.id); const nxt = rl[idx] ?? rl[idx - 1]; if (nxt) { setQueue(rl); playSong(nxt, rl); } else { setCurrent(null); setPlaying(false); } }
    }
    setRemoveSong(null); setActiveMenu(null); setPlayerExpanded(false);
    showToast("Moved to bin", { label: "Undo", onClick: () => restoreSongs([s]) });
    scanMusic(updated);
  };

  const doRestore = (s: Song) => {
    restoreSongs([s]);
    showToast("Song restored");
  };

  // ── Permanent delete (bin) ─────────────────────────────────────────────────
  const handleDeleteForever = useCallback(async (s: Song) => {
    // Ask the device to actually delete the file. On Android 11+ this shows a
    // system confirmation dialog; if the user declines, keep the song in the bin.
    const deleted = await deleteFileAtUri(s.uri);
    if (!deleted) {
      showToast("Delete cancelled");
      return;
    }
    setRemovedSongs(prev => {
      const updated = prev.filter(x => x.id !== s.id);
      saveRemovedTracksToStorage(updated);
      return updated;
    });
    setMeta(prev => {
      if (!(s.id in prev)) return prev;
      const next = { ...prev };
      delete next[s.id];
      return next;
    });
    showToast(`"${s.title}" deleted from device`);
  }, []);

  const handleEmptyBin = useCallback(async () => {
    const toDelete = removedRef.current;
    // Delete each file from the device. Track which actually got removed so a
    // cancelled confirmation leaves that song in the bin.
    const results = await Promise.all(
      toDelete.map(async s => ({ s, ok: await deleteFileAtUri(s.uri) }))
    );
    const deletedIds = new Set(results.filter(r => r.ok).map(r => r.s.id));
    const remaining = toDelete.filter(s => !deletedIds.has(s.id));

    setRemovedSongs(remaining);
    saveRemovedTracksToStorage(remaining);
    setMeta(prev => {
      const next = { ...prev };
      for (const id of deletedIds) delete next[id];
      return next;
    });
    showToast(remaining.length === 0
      ? "Bin emptied"
      : `Deleted ${deletedIds.size}, ${remaining.length} kept`);
  }, []);

  // ── Cut track ─────────────────────────────────────────────────────────────
  const openCutSheet = async (song: Song) => {
    let dur = song.duration ?? 0;
    if (!dur) {
      try {
        if (currentSong?.id === song.id) { const d = await AudioPlayer.getDuration(); dur = d.duration; }
        else { await AudioPlayer.play({ path: song.uri }); await AudioPlayer.pause(); const d = await AudioPlayer.getDuration(); dur = d.duration; }
      } catch { /* ignore */ }
    }
    setCutDuration(dur); setCutSong(song); setActiveMenu(null);
  };

  const saveCutTrack = async (song: Song, startMs: number, endMs: number, newName: string) => {
    // Integer milliseconds only, and a sane range. This is defensive: the
    // native side expects ints, and a zero-or-negative span used to surface as
    // a cryptic "Invalid cut range". Catch it here with a clear message instead.
    const start = Math.max(0, Math.round(startMs));
    const end   = Math.round(endMs);
    if (end - start < 1000) {
      showError("Cut must be at least 1 second long.");
      return;
    }
    setCutSong(null);
    // Try to export a REAL trimmed audio file to the device (Music/MPTree) and
    // add it to the library as a normal song. If the source codec can't be
    // losslessly clipped, fall back to the in-app metadata-only "cut" (which
    // plays the original file between the two markers).
    showToast(`Saving "${newName}"…`);
    try {
      const res = await MusicScanner.cutTrack({ path: song.uri, startMs: start, endMs: end, name: newName });
      // A real file now exists on the device. Add it as a normal (non-cut) song.
      const realSong: Song = {
        uri: res.uri,
        title: res.title || newName,
        artist: song.artist,
        duration: res.duration || (endMs - startMs),
        dateAdded: Date.now(),
        id: res.uri,          // real file → use its path as the stable id
        isCut: false,
      };
      setSongs(prev => {
        // Avoid a duplicate if a rescan already picked it up.
        if (prev.some(s => s.uri === realSong.uri)) return prev;
        return [realSong, ...prev];
      });
      showToast(`"${newName}" saved to your library`);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      const code = String(e?.code ?? "");
      if (code === "UNSUPPORTED_FORMAT" || /UNSUPPORTED_FORMAT/i.test(msg)) {
        // Fall back to the original in-app cut behaviour for this format.
        const cutVersion: Song = { ...song, title: newName, id: makeCutId(song.uri, startMs, endMs), dateAdded: Date.now(), isCut: true, cutFrom: startMs, cutTo: endMs };
        setSongs(prev => { const next = [cutVersion, ...prev]; saveCutTracksToStorage(next.filter(s => s.isCut)); return next; });
        showToast(`"${newName}" saved (in-app cut — format can't be exported)`);
      } else {
        showError("Cut failed: " + msg);
      }
    }
  };

  // ── Share ─────────────────────────────────────────────────────────────────
  const shareSong = useCallback(async (s: Song | null) => {
    if (!s) return;
    try {
      await Share.share({
        title: dispName(s),
        files: [toFileUri(s.uri)],
        dialogTitle: "Share song",
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!/cancel/i.test(msg)) showError("Share failed: " + msg); // negeer een simpele annulering
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  // ── Playlists ─────────────────────────────────────────────────────────────
  const handlePlaylistsChange = useCallback((updated: Playlist[]) => {
    setPlaylists(updated);
    savePlaylists(updated);
  }, []);

  const handlePlayPlaylist = useCallback((playlistSongs: Song[], shuffle: boolean) => {
    if (!playlistSongs.length) return;
    // Stay on the Playlists tab. The queue is set to the playlist's songs below,
    // so playback and skip stay inside the playlist; there is no reason to yank
    // the user back to the Songs tab.
    if (shuffle) {
      const q = shuffleArray(playlistSongs);
      setPlayMode("shuffle");
      playSong(q[0], q);
    } else {
      setPlayMode("off");
      playSong(playlistSongs[0], playlistSongs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Smart (built-in) playlists ────────────────────────────────────────────
  const likedKey = React.useMemo(
    () => songs.map(s => meta[s.id]?.liked ? "1" : "0").join(""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, meta],
  );
  const lastPlayedKey = React.useMemo(
    () => songs.map(s => meta[s.id]?.lastPlayedAt ?? 0).join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, meta],
  );
  const playCountKey = React.useMemo(
    () => songs.map(s => meta[s.id]?.playCount ?? 0).join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, meta],
  );

  const smartPlaylists: SmartPlaylist[] = React.useMemo(() => {
    const favoriteIds = songs.filter(s => !!meta[s.id]?.liked).map(s => s.id);
    const recentlyPlayedIds = songs
      .filter(s => (meta[s.id]?.lastPlayedAt ?? 0) > 0)
      .sort((a, b) => (meta[b.id]?.lastPlayedAt ?? 0) - (meta[a.id]?.lastPlayedAt ?? 0))
      .slice(0, 50).map(s => s.id);
    const mostPlayedIds = songs
      .filter(s => (meta[s.id]?.playCount ?? 0) > 0)
      .sort((a, b) => (meta[b.id]?.playCount ?? 0) - (meta[a.id]?.playCount ?? 0))
      .slice(0, 50).map(s => s.id);
    const lastAddedIds = [...songs]
      .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
      .slice(0, 50).map(s => s.id);
    return [
      { id: "favorites",      name: "My Favorites",    songIds: favoriteIds },
      { id: "recentlyPlayed", name: "Recently Played", songIds: recentlyPlayedIds },
      { id: "mostPlayed",     name: "Most Played",     songIds: mostPlayedIds },
      { id: "lastAdded",      name: "Last Added",      songIds: lastAddedIds },
    ];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, likedKey, lastPlayedKey, playCountKey]);

  // ── Layout ────────────────────────────────────────────────────────────────
  // Mini-player height: 20px handle padding + slider row + controls + 26px
  // bottom padding. Keep in sync with the bottom-player padding — the shuffle
  // FAB and list padding are offset by this.
  // Distance from the bottom of the screen to the TOP edge of the floating
  // mini-player card: 18px bottom offset + ~140px card height. Anything that
  // sits "just above the player" offsets from this, so the gaps stay exact.
  const playerH    = currentSong && !selectMode ? 158 : 0;
  const selectBarH = selectMode ? 100 : 0;
  const bottomH    = playerH + selectBarH;
  const modeBg     = playMode === "shuffle" ? TH.violet : playMode === "repeat" ? TH.repeat : TH.dim;
  const modeShadow = playMode === "shuffle" ? "0 0 16px rgba(124,58,237,0.45)" : playMode === "repeat" ? "0 0 16px rgba(14,165,233,0.4)" : "none";
  const filterLabel = FILTER_OPTIONS.find((o: { id: FilterId; label: string }) => o.id === filter)?.label ?? "Sort";
  const selectedSongs = displayList.filter(s => selected.has(s.id));
  const allSelectedLiked = selectedSongs.length > 0 && selectedSongs.every(s => isLiked(s));

  // Default backup name (date-based)
  const defaultBackupName = `MPTree_Backup_${makeDateTag()}`;

  // Measure the scroll viewport height for virtualization. Re-measures on
  // window resize / orientation change. cheap and runs rarely.
  useEffect(() => {
    const measure = () => {
      const h = scrollRef.current?.clientHeight ?? 0;
      if (h > 0) setListViewportH(h);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isInitializing]);

  // Resolve the artwork for the now-playing surfaces: user photo wins, then
  // embedded art fetched from native, then AlbumArt's initials fallback.
  const nowPlayingPhoto = (s: Song): string | undefined => {
    const custom = getMeta(s).customPhoto;
    if (custom) return custom;
    if (nowPlayingArt && nowPlayingArt.id === s.id) return nowPlayingArt.url;
    return undefined;
  };


  // ── List virtualization ───────────────────────────────────────────────────
  // Render only the rows near the viewport (plus a buffer), with spacer divs
  // above and below to preserve the true scroll height. Keeps scrolling smooth
  // and memory low on large libraries instead of mounting every row.
  //
  // Only enabled when: there are enough rows to matter, and no long-press menu
  // is open (an expanded row has a different height, which would break the
  // uniform-height math — with a menu open we render everything, which is fine
  // because you can't scroll a large distance in that transient state).
  const ROW_H = 64;               // uniform row height (8 + 48 art + 8 padding)
  const VIRT_BUFFER = 8;          // extra rows rendered above/below the viewport
  const VIRT_THRESHOLD = 80;      // don't bother virtualizing small lists
  const pullOffset = refreshing ? 46 : pullDist;
  const virtualize = !activeMenu && displayList.length > VIRT_THRESHOLD;
  const vpH = listViewportH || 640;

  let virtStart = 0;
  let virtEnd = displayList.length;
  if (virtualize) {
    // listScrollTop includes the pull spacer; subtract it so index math aligns
    // with the row area. Clamp to valid bounds.
    // Content order inside the scroller: topInset padding (under the
    // floating header) → pull spacer → rows. Subtract both so row math is 0-based.
    const scrolled = Math.max(0, listScrollTop - pullOffset - topInset);
    virtStart = Math.max(0, Math.floor(scrolled / ROW_H) - VIRT_BUFFER);
    const visibleCount = Math.ceil(vpH / ROW_H) + VIRT_BUFFER * 2;
    virtEnd = Math.min(displayList.length, virtStart + visibleCount);
  }
  const virtTopPad = virtualize ? virtStart * ROW_H : 0;
  const virtBottomPad = virtualize ? (displayList.length - virtEnd) * ROW_H : 0;
  const visibleSongs = virtualize ? displayList.slice(virtStart, virtEnd) : displayList;


  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        body { margin:0; background:${TH.bg}; }
        ::placeholder { color:${TH.muted}; opacity:0.6; }
        input { -webkit-appearance:none; }
        .slider { -webkit-appearance:none; width:100%; height:3px; border-radius:2px; background:${TH.sliderBg}; outline:none; margin:0 8px; }
        .slider::-webkit-slider-thumb { -webkit-appearance:none; width:13px; height:13px; border-radius:50%; background:${TH.text}; cursor:pointer; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        /* Gentle upward nudge on the mini-player handle: "you can swipe this up".
           Small travel + long pauses so it hints without being distracting. */
        @keyframes swipeHint {
          0%, 70%, 100% { transform: translateY(0); opacity: 0.85; }
          78%           { transform: translateY(-4px); opacity: 1; }
          86%           { transform: translateY(0); opacity: 0.85; }
        }
        .swipe-hint { animation: swipeHint 3.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .swipe-hint { animation: none; } }
        /* Scroll-to-top: fade + rise in, fade + sink out. */
        .stt { transition: opacity 0.25s ease, transform 0.25s ease; }
        .stt-show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
        .stt-hide { opacity: 0; transform: translateX(-50%) translateY(12px); pointer-events: none; }
        /* Shuffle FAB: fades out when the Playlists page slides over. */
        .fabw { transition: opacity 0.2s ease, transform 0.2s ease; }
        .fabw-show { opacity: 1; transform: scale(1); pointer-events: auto; }
        .fabw-hide { opacity: 0; transform: scale(0.85); pointer-events: none; }
        .pulse { animation:pulse 1s ease-in-out infinite; }
        .chip { display:inline-flex; align-items:center; gap:5px; padding:8px 14px; border-radius:20px; border:1px solid ${TH.chipBorder}; background:${TH.chipBg}; color:${TH.chipColor}; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; font-family:inherit; }
        .chip.red { color:#e8445a; border-color:${TH.binBorder}; background:${TH.binBg}; }
      `}</style>
      <div style={{ background: TH.bg, color: TH.text, minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", userSelect: "none", overflow: "hidden", position: "relative" }}>

        {/* ═══ FLOATING HEADER CARD ════════════════════════════════════════ */}
        {/* Everything up top lives in one rounded card that floats ABOVE the
            list — the songs scroll underneath it. Its height is measured via
            ResizeObserver into `topInset`, which pads the scroll content so
            the first rows start below the card. The card's top offset adds
            env(safe-area-inset-top) so it sits below the status bar instead
            of underneath it — the WebView renders edge-to-edge, so without
            this the status bar icons overlap the Songs/Playlists toggle. */}
        <div
          ref={headerCardRef}
          style={{
            position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 2px)", left: 12, right: 12, zIndex: 60,
            background: TH.playerBg, border: `1px solid ${TH.border}`,
            borderRadius: 22, boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            padding: "8px 14px 12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <Logo size={48} color={TH.text} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 2, background: TH.surface, borderRadius: 20, padding: 3, border: `1px solid ${TH.border}` }}>
            <button
              onClick={() => setPage("songs")}
              style={{
                padding: "6px 14px", borderRadius: 17, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                background: page === "songs" ? TH.accent : "transparent",
                color: page === "songs" ? TH.playBtnFg : TH.muted,
                transition: "background 0.2s, color 0.2s",
              }}
            >
              Songs
            </button>
            <button
              data-tour="playlists"
              onClick={() => setPage("playlists")}
              style={{
                padding: "6px 14px", borderRadius: 17, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                background: page === "playlists" ? TH.accent : "transparent",
                color: page === "playlists" ? TH.playBtnFg : TH.muted,
                transition: "background 0.2s, color 0.2s",
              }}
            >
              Playlists
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {selectMode && <span style={{ fontSize: 13, color: TH.violet, fontWeight: 700 }}>{selected.size} selected</span>}
            <button data-tour="settings" onClick={() => setSettingsOpen(true)} style={{ background: "transparent", border: "none", color: TH.muted, cursor: "pointer", padding: 8, display: "flex", alignItems: "center", borderRadius: 8 }}>
              <IC.Settings />
            </button>
          </div>
          </div>

          {/* Search + count/filter — part of the floating card, songs page only. */}
          {page === "songs" && (
            <div style={{ paddingTop: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div data-tour="search" style={{ flex: 1, display: "flex", alignItems: "center", background: TH.surface, borderRadius: 10, padding: "0 12px", height: 40, gap: 8, border: `1px solid ${TH.border}` }}>
                  {IC.Search(TH.muted)}
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search songs or artists…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: TH.text, fontSize: 15, minWidth: 0 }} />
                  {search.length > 0 && (
                    <button
                      onClick={() => { setSearch(""); hapticImpact("light"); }}
                      aria-label="Clear search"
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0, color: TH.muted }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" fill={TH.dim} stroke="none"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: TH.muted }}>{displayList.length} songs</span>
                <div style={{ position: "relative" }}>
                  <button onClick={() => setFilterOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px 5px 13px", borderRadius: 16, border: `1px solid ${isFavFilter ? TH.heart + "88" : TH.border}`, background: isFavFilter ? TH.binBg : TH.surface, color: isFavFilter ? TH.heart : TH.chipColor, cursor: "pointer", fontSize: 13, fontWeight: "600", fontFamily: "inherit" }}>
                    <span>{filterLabel}</span><IC.Chevron />
                  </button>
                  {filterOpen && (
                    <>
                      <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setFilterOpen(false)} />
                      <div style={{ position: "absolute", right: 0, top: "110%", background: TH.sheetBg, borderRadius: 14, border: `1px solid ${TH.border}`, minWidth: 185, zIndex: 200, boxShadow: "0 10px 36px rgba(0,0,0,0.3)", overflow: "hidden" }}>
                        {FILTER_OPTIONS.map((opt: { id: FilterId; label: string }) => (
                          <button key={opt.id} onClick={() => { setFilter(opt.id); setFilterOpen(false); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "13px 16px", background: "transparent", border: "none", borderBottom: `1px solid ${TH.dim}`, color: filter === opt.id ? TH.text : TH.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === opt.id ? "700" : "400" }}>
                            <span>{opt.label}</span>{filter === opt.id && IC.Check(TH.accent)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ SWIPEABLE PAGE AREA ═════════════════════════════════════════ */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

          {/* ── SONGS PAGE ──────────────────────────────────────────────── */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pointerEvents: page === "playlists" && !pageDragging ? "none" : "auto" }}>

            {/* ═══ SONG LIST ═══════════════════════════════════════════════ */}
            <main
              ref={scrollRef}
              style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", paddingTop: topInset, paddingBottom: bottomH + 64 + 12 }}
              data-tour="songs"
              onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
              onScroll={() => {
                const top = scrollRef.current?.scrollTop ?? 0;
                setListScrollTop(top);
                // Close the long-press menu ONLY when its row has scrolled
                // entirely out of view — small scrolls (peeking at neighbors)
                // keep it open. Off-screen it's unreachable, so it closes to
                // avoid the "stuck in the menu" trap.
                if (activeMenuRef.current) {
                  const el = songRowRefs.current.get(activeMenuRef.current);
                  const cont = scrollRef.current;
                  if (el && cont) {
                    const er = el.getBoundingClientRect();
                    const cr = cont.getBoundingClientRect();
                    const fullyAbove = er.bottom <= cr.top;
                    const fullyBelow = er.top >= cr.bottom;
                    if (fullyAbove || fullyBelow) setActiveMenu(null);
                  } else {
                    // Row unmounted entirely (e.g. list changed) — close.
                    setActiveMenu(null);
                  }
                }
              }}
            >
              <div style={{ height: refreshing ? 46 : `${pullDist}px`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", transition: refreshing ? "height 0.2s ease" : "none" }}>
                {(pullDist > 10 || refreshing) && <span className={refreshing ? "pulse" : ""} style={{ color: TH.muted, fontSize: 12, fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase" }}>{refreshing ? "Refreshing…" : pullDist > 55 ? "Release to refresh" : "Pull to refresh"}</span>}
              </div>

              {displayList.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", color: TH.muted }}>
                  <IC.Heart filled={false} size={28} />
                  <div style={{ marginTop: 12 }}>No songs found</div>
                  <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>{isFavFilter ? "Like songs by double-tapping them" : "Pull down to refresh"}</div>
                </div>
              ) : (
                <>
                  {virtTopPad > 0 && <div style={{ height: virtTopPad }} aria-hidden="true" />}
                  {visibleSongs.map((song, i) => {
                    const idx        = virtualize ? virtStart + i : i;
                    const isActive   = currentSong?.id === song.id;
                    const liked      = isLiked(song);
                    const showMenu   = activeMenu === song.id;
                    const isSelected = selected.has(song.id);
                    const m          = getMeta(song);
                    const name       = dispName(song);
                    const artist     = dispArtist(song);
                    return (
                      <div key={song.id} ref={el => { if (el) songRowRefs.current.set(song.id, el); else songRowRefs.current.delete(song.id); }}>
                        {showMenu ? (
                          <ExpandedSongRow
                            song={song} dispName={name} dispArtist={artist} customPhoto={m.customPhoto}
                            isActive={isActive} idx={idx} isLiked={liked}
                            onPlay={() => { setActiveMenu(null); setQueue(displayList); playSong(song, displayList); }}
                            onEdit={() => { setActiveMenu(null); setEditSong(song); }}
                            onCut={() => openCutSheet(song)}
                            onRemove={() => { setActiveMenu(null); setRemoveSong(song); }}
                            onToggleLike={() => { hapticImpact("light"); setMeta(prev => { const cur = prev[song.id] || {}; const nowLiked = !cur.liked; showToast(nowLiked ? "Liked ❤️" : "Removed from favorites"); return { ...prev, [song.id]: { ...cur, liked: nowLiked } }; }); }}
                            onShare={() => shareSong(song)}
                            onPlayNext={() => handlePlayNext(song)}
                            onClose={() => setActiveMenu(null)}
                            T={TH} />
                        ) : (
                          <div
                            data-song-row=""
                            onTouchStart={e => onPressStart(song.id, e.touches[0].clientX, e.touches[0].clientY)}
                            onTouchMove={e => onPressMove(e.touches[0].clientX, e.touches[0].clientY)}
                            onTouchEnd={onPressEnd} onTouchCancel={onPressEnd}
                            onMouseDown={e => onPressStart(song.id, e.clientX, e.clientY)}
                            onMouseMove={e => onPressMove(e.clientX, e.clientY)}
                            onMouseUp={onPressEnd} onMouseLeave={onPressEnd}
                            onClick={() => handleTap(song)}
                            style={{
                              display: "flex", alignItems: "center", padding: "10px 16px", gap: 10, cursor: "pointer",
                              background: isSelected ? TH.violet + "18" : isActive ? TH.card : "transparent",
                              transition: "background 0.15s",
                              borderLeft: isSelected ? `3px solid ${TH.violet}` : "3px solid transparent",
                            }}>
                            {(selectMode || (activeMenu && activeMenu !== song.id)) && (
                              <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `2px solid ${isSelected ? TH.violet : TH.border}`, background: isSelected ? TH.violet : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                                {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            )}
                            <AlbumArt title={name} size={48} active={isActive && !selectMode} customPhoto={m.customPhoto} T={TH} />
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ fontSize: 15, fontWeight: "600", color: isActive ? TH.accent : TH.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                                {song.isCut && <span style={{ fontSize: 10, background: TH.dim, color: TH.textSub, borderRadius: 4, padding: "1px 5px", fontWeight: "700", flexShrink: 0 }}>CUT</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", marginTop: 2, gap: 6 }}>
                                {/* Track number — hidden for now (kept for future use):
                                <span style={{ fontSize: 12, fontWeight: "600", color: isActive ? TH.accent : TH.muted, flexShrink: 0 }}>{idx + 1}</span>
                                */}
                                <span style={{ flex: 1, fontSize: 13, color: TH.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist || "Unknown Artist"}</span>
                                {song.duration != null && song.duration > 0 && <span style={{ fontSize: 12, color: TH.muted, flexShrink: 0 }}>{fmt(song.duration)}</span>}
                              </div>
                            </div>
                            {!selectMode && liked && (
                              <button onClick={e => { e.stopPropagation(); hapticImpact("light"); setMeta(prev => ({ ...prev, [song.id]: { ...(prev[song.id] || {}), liked: false } })); showToast("Removed from favorites"); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 6, display: "flex", flexShrink: 0 }}>
                                <IC.Heart filled={true} size={16} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {virtBottomPad > 0 && <div style={{ height: virtBottomPad }} aria-hidden="true" />}
                </>
              )}
            </main>

            {/* ═══ SCROLL TO TOP (floating circle above the mini player) ═══ */}
            {/* Always mounted; visibility toggled via CSS classes so it fades
                and slides in/out smoothly instead of popping. Centered above
                the player with a fixed gap; when nothing is playing it sits
                near the bottom edge instead. */}
            <div
              className={page === "songs" && !selectMode && displayList.length > 0 && listScrollTop > topInset ? "stt stt-show" : "stt stt-hide"}
              style={{ position: "absolute", left: "50%", bottom: bottomH + 10, zIndex: 90 }}
            >
              <button
                onClick={() => { scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                aria-label="Scroll to top"
                style={{ width: 46, height: 46, borderRadius: "50%", background: TH.surface, border: `1px solid ${TH.border}`, color: TH.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.4)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
            </div>

            {/* ═══ SHUFFLE FAB ═════════════════════════════════════════════ */}
            {/* Songs page only. The songs page sits UNDER the playlists panel
                but the FAB's z-index used to lift it above, so it stayed
                visible over Playlists — hence the explicit page check plus a
                fade so it leaves smoothly during the swipe. */}
            {!selectMode && (
              <div
                className={page === "songs" ? "fabw fabw-show" : "fabw fabw-hide"}
                style={{ position: "absolute", right: 18, bottom: playerH + 10, zIndex: 90 }}>
                <button
                  data-tour="shuffle"
                  onTouchStart={onShufflePressStart} onTouchEnd={onShufflePressEnd} onTouchCancel={onShufflePressEnd}
                  onMouseDown={onShufflePressStart} onMouseUp={onShufflePressEnd}
                  onMouseLeave={() => { if (shufflePressTimer.current) clearTimeout(shufflePressTimer.current); }}
                  onClick={onShuffleClick}
                  style={{ width: 52, height: 52, borderRadius: "50%", background: modeBg, border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: modeShadow || "0 4px 18px rgba(0,0,0,0.3)", transition: "background 0.25s, box-shadow 0.25s" }}>
                  {playMode === "repeat" ? <IC.Repeat /> : <IC.Shuffle />}
                </button>
              </div>
            )}
          </div>

          {/* ── PLAYLISTS PANEL ──────────────────────────────────────────── */}
          <div
            style={{
              position: "absolute", inset: 0,
              transform: panelTransform,
              transition: panelTransition,
              willChange: "transform",
              zIndex: 10,
              boxShadow: page === "playlists" || pageDragging ? "-8px 0 24px rgba(0,0,0,0.25)" : "none",
              background: TH.bg,
            }}
            onTouchStart={onPageTouchStart}
            onTouchMove={onPageTouchMove}
            onTouchEnd={onPageTouchEnd}
          >
            <PlaylistsView
              topInset={topInset}
              bottomInset={bottomH + 12}
              resetToListSignal={page === "songs"}
              playlists={playlists}
              smartPlaylists={smartPlaylists}
              songs={songs}
              meta={meta}
              onPlaylistsChange={handlePlaylistsChange}
              onPlayPlaylist={handlePlayPlaylist}
              onPlaySong={(song, list) => { setPlayMode("off"); playSong(song, list); }}
              currentSongId={currentSong?.id ?? null}
              isPlaying={isPlaying}
              onToggleLike={(song) => { hapticImpact("light"); setMeta(prev => { const cur = prev[song.id] || {}; const nowLiked = !cur.liked; showToast(nowLiked ? "Liked ❤️" : "Removed from favorites"); return { ...prev, [song.id]: { ...cur, liked: nowLiked } }; }); }}
              onPlayNext={handlePlayNext}
              onEditSong={(song) => setEditSong(song)}
              onCutSong={(song) => openCutSheet(song)}
              onShareSong={(song) => shareSong(song)}
              onRemoveSong={(song) => setRemoveSong(song)}
              isLiked={isLiked}
              onHaptic={() => hapticImpact("medium")}
              onDetailChange={setPlaylistDetailOpen}
              onClose={() => setPage("songs")}
              T={TH}
            />
          </div>
        </div>

        {/* ═══ BOTTOM PLAYER ═══════════════════════════════════════════════ */}
        {currentSong && !selectMode && (() => {
          const sliderMin = currentSong.isCut ? (currentSong.cutFrom ?? 0) : 0;
          const sliderMax = currentSong.isCut ? (currentSong.cutTo ?? duration) : (duration || 100);
          const tint = nowPlayingColor && nowPlayingColor.id === currentSong.id ? nowPlayingColor.rgb : null;
          const miniPlayerBg = tint
            ? `linear-gradient(180deg, ${tint.replace("rgb(", "rgba(").replace(")", ", 0.22)")} 0%, ${TH.playerBg} 65%)`
            : TH.playerBg;
          return (
            <div
              style={{ position: "fixed", bottom: 18, left: 12, right: 12, background: miniPlayerBg, border: `1px solid ${TH.border}`, borderRadius: 22, padding: "32px 16px 20px", zIndex: 100, transition: "background 0.4s ease", boxShadow: "0 10px 36px rgba(0,0,0,0.5)", overflow: "hidden" }}
              onTouchStart={e => onPlayerSwipeStart(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchMove={e => onPlayerSwipeMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={e => onPlayerSwipeEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
            >
              {/* Swipe-up handle: the same horizontal pill as the expanded
                  player's sheet handle, with a gentle upward "swipe me" nudge
                  animation. Tapping it also expands. */}
              <div
                onClick={() => setPlayerExpanded(true)}
                aria-label="Expand player"
                style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 64, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <div className="swipe-hint" style={{ width: 36, height: 4, borderRadius: 2, background: TH.dim }} />
              </div>
              <div
                style={{ display: "flex", alignItems: "center", marginBottom: 10 }}
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
              >
                <span style={{ fontSize: 11, color: TH.muted, width: 34 }}>{fmt(currentTime)}</span>
                <input className="slider" type="range" min={sliderMin} max={sliderMax} value={currentTime}
                  onMouseDown={e => { e.stopPropagation(); setDragging(true); }}
                  onTouchStart={e => { e.stopPropagation(); setDragging(true); }}
                  onChange={e => setCurrentTime(Number(e.target.value))}
                  onMouseUp={async e => { setDragging(false); await seekTo(Number((e.target as HTMLInputElement).value)); }}
                  onTouchEnd={async e => { setDragging(false); await seekTo(Number((e.target as HTMLInputElement).value)); }} />
                <span style={{ fontSize: 11, color: TH.muted, width: 34, textAlign: "right" }}>
                  {currentSong.isCut && currentSong.cutTo ? fmt(currentSong.cutTo) : fmt(duration)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div
                  onClick={() => setPlayerExpanded(true)}
                  style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, cursor: "pointer" }}>
                  <AlbumArt title={dispName(currentSong)} size={40} active customPhoto={nowPlayingPhoto(currentSong)} T={TH} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: "700", color: TH.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>{dispName(currentSong)}</div>
                    <div style={{ fontSize: 12, color: TH.muted, marginTop: 1 }}>{dispArtist(currentSong) || "Unknown Artist"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <button onClick={e => { e.stopPropagation(); toggleShuffleFromPlayer(); }} style={{ background: "transparent", border: "none", color: playMode === "shuffle" ? TH.violet : TH.muted, cursor: "pointer", padding: 6, display: "flex", position: "relative" }}>
                    <IC.Shuffle />
                    {playMode === "shuffle" && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: TH.violet }} />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); skip(-1); }} style={{ background: "transparent", border: "none", color: TH.muted, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipB /></button>
                  <button onClick={e => { e.stopPropagation(); togglePlay(); }} style={{ background: TH.playBtnBg, border: "none", color: TH.playBtnFg, width: 42, height: 42, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    {isPlaying ? <IC.Pause /> : <IC.Play />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); skip(1); }} style={{ background: "transparent", border: "none", color: TH.muted, cursor: "pointer", padding: 6, display: "flex" }}><IC.SkipF /></button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══ MULTI-SELECT BAR ════════════════════════════════════════════ */}
        {selectMode && (
          <MultiSelectBar
            count={selected.size} totalCount={displayList.length} allLiked={allSelectedLiked}
            onLikeAll={() => multiLikeWithMeta(true)} onUnlikeAll={() => multiLikeWithMeta(false)}
            onShuffleSelection={multiShuffleSelection} onRemoveAll={() => setRemoveMultiConfirm(true)}
            onSelectAll={() => setSelected(new Set(displayList.map(s => s.id)))} onClearAll={() => setSelected(new Set())}
            onClose={exitSelectMode} T={TH} />
        )}

        {/* ═══ SHEETS ══════════════════════════════════════════════════════ */}
        {editSong && <EditSheet name={dispName(editSong)} artist={dispArtist(editSong)} currentPhoto={getMeta(editSong).customPhoto} onSave={u => applyEdit(editSong, u)} onClose={() => { setEditSong(null); if (editFromPlayer) { setEditFromPlayer(false); setPlayerExpanded(true); } }} T={TH} />}
        {removeSong && <ConfirmSheet title="Remove song" body={`"${dispName(removeSong)}" will be moved to the bin. You can restore it from Settings.`} confirmLabel="Move to Bin" onConfirm={() => doRemove(removeSong)} onCancel={() => setRemoveSong(null)} T={TH} />}
        {removeMultiConfirm && <ConfirmSheet title={`Remove ${selected.size} songs`} body={`${selected.size} songs will be moved to the bin. You can restore them from Settings.`} confirmLabel={`Move ${selected.size} to Bin`} onConfirm={multiRemove} onCancel={() => setRemoveMultiConfirm(false)} T={TH} />}
        {cutSong && <CutTrackSheet song={cutSong} totalMs={cutDuration} onSave={(start, end, name) => saveCutTrack(cutSong, start, end, name)} onClose={() => setCutSong(null)} T={TH} />}
        {settingsOpen && (
          <SettingsSheet
            theme={theme} binCount={removedSongs.length}
            onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
            onViewBin={() => { setSettingsOpen(false); setBinOpen(true); }}
            onOpenAudioEffects={openEQSheet}
            onShowTutorial={() => { setSettingsOpen(false); setShowOnboarding(true); }}
            onExport={handleExportOpen}
            onImportOpen={handleImportOpen}
            onSupport={() => { Browser.open({ url: "https://paypal.me/MPTreeApp" }).catch(() => {}); }}
            sleepUntil={sleepUntil}
            sleepEndOfTrack={sleepEndOfTrack}
            hasCurrentSong={!!currentSong}
            onSetSleepTimer={setSleepTimer}
            onClose={() => setSettingsOpen(false)}
            T={TH} />
        )}

        {binOpen && (
          <BinView
            removedSongs={removedSongs}
            meta={meta}
            onRestore={doRestore}
            onDeleteForever={handleDeleteForever}
            onEmptyBin={handleEmptyBin}
            onPlaySong={(song, list) => { setPlayMode("off"); playSong(song, list); }}
            onTogglePlay={togglePlay}
            currentSongId={currentSong?.id ?? null}
            isPlaying={isPlaying}
            onClose={() => setBinOpen(false)}
            T={TH}
          />
        )}

        {/* ═══ BACKUP SHEET ════════════════════════════════════════════════ */}
        <BackupSheet
          state={backupSheet}
          defaultBackupName={defaultBackupName}
          onStartBackup={doExport}
          onCancelBackup={closeBackupSheet}
          onShare={handleShareBackup}
          onDone={doneBackupSheet}
          onOpenImportPicker={handleOpenImportPicker}
          onClose={closeBackupSheet}
          T={TH}
        />

        {/* Hidden file input for import — outside BackupSheet so it persists */}
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: "none" }}
          onChange={handleImportFileChange}
        />

        {(playerExpanded || expandDrag !== null) && currentSong && (() => {
          return (
            <PlayerExpandSheet
              song={currentSong}
              dispName={dispName(currentSong)}
              dispArtist={dispArtist(currentSong)}
              customPhoto={nowPlayingPhoto(currentSong)}
              backdropPhoto={nowPlayingPhoto(currentSong)}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              playMode={playMode}
              isLiked={isLiked(currentSong)}
              playbackSpeed={playbackSpeed}
              onPlaybackSpeedChange={setPlaybackSpeed}
              upNextQueue={queue}
              playNextQueue={playNextQueue}
              getDispName={dispName}
              getDispArtist={dispArtist}
              getCustomPhoto={s => getMeta(s).customPhoto}
              onTogglePlay={togglePlay}
              onSkip={skip}
              onToggleShuffle={toggleShuffleFromPlayer}
              onSeek={ms => setCurrentTime(ms)}
              onSeekStart={() => setDragging(true)}
              onSeekEnd={async ms => { setDragging(false); await seekTo(ms); }}
              onEdit={() => { setPlayerExpanded(false); setEditFromPlayer(true); setEditSong(currentSong); }}
              onCut={() => { setPlayerExpanded(false); openCutSheet(currentSong); }}
              onToggleLike={() => { hapticImpact("light"); setMeta(prev => { const cur = prev[currentSong.id] || {}; const nowLiked = !cur.liked; showToast(nowLiked ? "Liked ❤️" : "Removed from favorites"); return { ...prev, [currentSong.id]: { ...cur, liked: nowLiked } }; }); }}
              onRemove={() => { setPlayerExpanded(false); setRemoveSong(currentSong); }}
              onShare={() => shareSong(currentSong)}
              onPlayNextReorder={newQ => { setPlayNextQueue(newQ); playNextQueueRef.current = newQ; }}
              onSkipCurrentUpNext={handleSkipCurrentUpNext}
              onClose={() => { setPlayerExpanded(false); openedByDragRef.current = false; }}
              dragProgress={playerExpanded ? null : expandDrag}
              dragSettling={expandSettling}
              skipEnter={openedByDragRef.current}
              T={TH}
            />
          );
        })()}

        {eqOpen && (
          <EQSheet
            eqInfo={eqInfo}
            eqEnabled={eqEnabled}
            bandLevels={eqBandLevels}
            crossfadeMs={crossfadeMs}
            onToggleEnabled={setEqEnabled}
            onLevelsChange={setEqBandLevels}
            onCrossfadeChange={setCrossfadeMs}
            onClose={() => setEqOpen(false)}
            T={TH} />
        )}

        {toast && <Toast msg={toast.msg} action={toast.action} onDone={() => setToast(null)} T={TH} />}
        {!isInitializing && libraryReady && showOnboarding && <OnboardingOverlay onDone={finishOnboarding} T={TH} />}

        {/* ═══ LOADING SCREEN ══════════════════════════════════════════════
            Overlays everything above while initialize() is still running,
            so the empty/incomplete list never flashes on screen. Fades out
            and unmounts itself once isInitializing becomes false. */}
        <LoadingScreen theme={theme} visible={isInitializing} onHidden={() => runLibraryScanRef.current?.()} />

        {permissionDenied && !isInitializing && (
          <div style={{ position: "fixed", inset: 0, zIndex: 850, background: TH.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 28px", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: TH.surface, border: `1px solid ${TH.border}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={TH.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: TH.text, marginBottom: 10 }}>Music access needed</div>
            <div style={{ fontSize: 15, color: TH.textSub, lineHeight: 1.55, maxWidth: 320, marginBottom: 28 }}>
              MPTree plays the songs on your device, so it needs permission to read your audio files. It never uploads or shares anything. Everything stays on your phone.
            </div>
            <button
              onClick={openAppSettings}
              style={{ width: "100%", maxWidth: 300, padding: 15, background: TH.playBtnBg, color: TH.playBtnFg, border: "none", borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Open app settings
            </button>
            <div style={{ fontSize: 12.5, color: TH.muted, marginTop: 20, maxWidth: 300, lineHeight: 1.5 }}>
              Tap "Open app settings", then Permissions → Music and audio → Allow.
            </div>
          </div>
        )}
      </div>
    </>
  );
}