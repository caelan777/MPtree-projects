import React, { useEffect, useState, useRef, useCallback } from "react";
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
import { SongMenuSheet } from "./components/SongMenuSheet";
import { AddToPlaylistSheet } from "./components/AddToPlaylistSheet";
import { BulkEditSheet, type BulkEdit } from "./components/BulkEditSheet";
import { LyricsSheet } from "./components/LyricsSheet";
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
import { planPlayNext, mergePins } from "./queue";
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

import { MusicScanner, AudioPlayer } from "./plugins";
import { checkForUpdate, dismissUpdate, type UpdateInfo } from "./updateCheck";


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
  // Narrow the list to one artist. Separate from `filter` because it is a
  // different question: filter says how to order, this says what to include, and
  // you routinely want both (this artist, newest first).
  const [artistFilter,   setArtistFilter]  = useState<string | null>(null);
  const [filterOpen,     setFilterOpen]    = useState(false);
  const [settingsOpen,   setSettingsOpen]  = useState(false);
  const [binOpen,        setBinOpen]       = useState(false);
  const [theme,          setTheme]         = useState<Theme>("dark");
  // The song whose "⋮" action sheet is open (null = closed). This replaced
  // `activeMenu`, which expanded the row inline on long-press.
  const [menuSong,       setMenuSong]      = useState<Song | null>(null);
  const [editSong,       setEditSong]      = useState<Song | null>(null);
  // "Photo" in the song menu is the same edit sheet, opened straight onto the
  // picker. One sheet rather than two that would drift apart.
  const [editFocusPhoto, setEditFocusPhoto] = useState(false);
  const [bulkEditOpen,  setBulkEditOpen]  = useState(false);
  const [lyricsSong,    setLyricsSong]    = useState<Song | null>(null);

  // The songs the open sheet applies to. Both pages fill this before opening,
  // so BulkEditSheet and AddToPlaylistSheet do not need to know which selection
  // they came from.
  const [multiIds,      setMultiIds]      = useState<string[]>([]);
  const [removeSong,     setRemoveSong]    = useState<Song | null>(null);
  const [cutSong,        setCutSong]       = useState<Song | null>(null);
  const [cutDuration,    setCutDuration]   = useState(0);
  const [playerExpanded, setPlayerExpanded]= useState(false);
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
  // The card's own height is animated between "collapsed" and "expanded", so it
  // cannot be measured directly. `headerInnerRef` wraps the real content and
  // keeps its natural height at all times, which is what the expanded card
  // animates to. `headerCardRef` is still observed for `topInset`: a height
  // transition is a real layout change, so ResizeObserver fires every frame and
  // the list's top padding glides along with the card.
  const headerCardRef  = useRef<HTMLDivElement | null>(null);
  const headerInnerRef = useRef<HTMLDivElement | null>(null);
  const [topInset, setTopInset]     = useState(176);
  const [expandedH, setExpandedH]   = useState(150);
  useEffect(() => {
    const card  = headerCardRef.current;
    const inner = headerInnerRef.current;
    if (!card || !inner) return;
    const update = () => {
      setTopInset(Math.round(card.getBoundingClientRect().bottom) + 14);
      setExpandedH(Math.round(inner.getBoundingClientRect().height));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(card);
    ro.observe(inner);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  // ── Collapsing chrome ─────────────────────────────────────────────────────
  // Scrolling DOWN the Songs list folds the header card (tabs, search, sort)
  // and the mini-player away, leaving just the round MPTree logo top-left, so
  // the list gets the whole screen. Scrolling back to the very top restores
  // them, tapping the logo toggles manually, and holding it turns the automatic
  // part off entirely.
  //
  // A manual toggle wins over the scroll rule until you reach the top again —
  // otherwise tapping the logo to peek at the controls would be undone by the
  // very next scroll event. `null` means "no override, follow the scroll".
  const [chromeOpen, setChromeOpen] = useState(true);
  // Options panel opened by holding the logo. Declared here with the rest of
  // the chrome state so the Back handler, defined further down, can see it.
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false);
  const chromeManualRef = useRef<boolean | null>(null);
  // Collapsing must be caused by the user dragging the list downward. Comparing
  // against the previous offset keeps incidental scroll events — the ones that
  // fire when the mini-player appears or the list re-renders after shuffle or a
  // track change — from folding the chrome away while sitting at the top.
  // One ref per scroller: Songs and Playlists scroll independently, and sharing
  // a single "previous offset" would read the jump between them as a drag.
  const lastScrollTopRef         = useRef(0);
  const lastPlaylistScrollTopRef = useRef(0);
  // A brief "tap the logo to bring them back" pill, shown the first few times
  // the chrome folds itself away. Without it the header and player simply
  // vanish and nothing says the round logo is now a button.
  const [collapseHint, setCollapseHint] = useState(false);
  const collapseHintsLeft = useRef(0);
  const collapseHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HINT_TIMES = 3;
  useEffect(() => {
    Preferences.get({ key: "mptree_collapse_hint_shown" })
      .then(({ value }) => { collapseHintsLeft.current = Math.max(0, HINT_TIMES - Number(value ?? 0)); })
      .catch(() => { collapseHintsLeft.current = HINT_TIMES; });
  }, []);
  const showCollapseHint = useCallback(() => {
    if (collapseHintsLeft.current <= 0) return;
    const used = HINT_TIMES - collapseHintsLeft.current + 1;
    collapseHintsLeft.current -= 1;
    Preferences.set({ key: "mptree_collapse_hint_shown", value: String(used) }).catch(() => {});
    setCollapseHint(true);
    if (collapseHintTimer.current) clearTimeout(collapseHintTimer.current);
    collapseHintTimer.current = setTimeout(() => setCollapseHint(false), 3200);
  }, []);
  // Animate the fold by default; suppressed for the scroll-to-top button, which
  // should just be there when you arrive.
  const [chromeAnimate, setChromeAnimate] = useState(true);
  // When off, only the logo toggles the chrome; scrolling leaves it alone.
  const [autoCollapse, setAutoCollapse] = useState(true);
  const autoCollapseRef = useRef(true);
  useEffect(() => { autoCollapseRef.current = autoCollapse; }, [autoCollapse]);
  useEffect(() => {
    Preferences.get({ key: "mptree_auto_collapse" })
      .then(({ value }) => { if (value === "0") { setAutoCollapse(false); autoCollapseRef.current = false; } })
      .catch(() => {});
  }, []);
  const CHROME_COLLAPSE_AT = 80;
  // Scrolls the app performs itself (jumping to the playing track, the
  // scroll-to-top button) must not be mistaken for the user dragging the list.
  // Smooth scrolling has no completion event, so the flag is simply held for
  // comfortably longer than the animation lasts.
  const programmaticScrollRef   = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const beginProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => { programmaticScrollRef.current = false; }, 800);
  }, []);

  // Bring the chrome back. Playing something — tapping a song, hitting shuffle
  // — should never leave you looking at a folded-away player, so those paths
  // call this. The manual override is cleared too, otherwise a later scroll
  // down would be ignored.
  const openChrome = useCallback(() => {
    chromeManualRef.current = null;
    setChromeAnimate(true);
    setChromeOpen(true);
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

  // ── "A newer version is on the website" ───────────────────────────────────
  // Only ever set in the build the website hands out; the Play build compiles
  // the check away. See src/updateCheck.ts for why.
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    // Held until the library is up, so the very first launch is not competing
    // with the scan and the permission dialog.
    if (!libraryReady) return;
    let cancelled = false;
    const t = setTimeout(() => {
      checkForUpdate(__APP_VERSION__).then(info => { if (!cancelled) setUpdateInfo(info); });
    }, 4000);
    return () => { cancelled = true; clearTimeout(t); };
  }, [libraryReady]);

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
  // Playlist picker opened from the multi-select bar.
  const [multiAddOpen,  setMultiAddOpen]  = useState(false);
  const [page, setPage] = useState<"songs" | "playlists">("songs");
  // Bumped by the Back handler to ask PlaylistsView to pop one level of its own
  // nested navigation (detail → list, add-songs → detail, close a menu, …).
  const [playlistBackSignal, setPlaylistBackSignal] = useState(0);

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
  /** Whether meta has changed since it was last written. See the sync effect. */
  const metaDirtyRef = useRef(false);
  const removedRef   = useRef<Song[]>([]);
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
  // Song meta is the one thing worth writing lazily. It holds cover photos as
  // base64 data URLs, so serialising it is measured in megabytes, and the
  // session flush below runs every 2.5 seconds while a track plays. Writing it
  // on every one of those stalled the main thread on a timer, which is what the
  // spinning record kept catching. Mark it dirty on change; write it only then.
  useEffect(() => { metaRef.current = meta; metaDirtyRef.current = true; }, [meta]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { crossfadeMsRef.current  = crossfadeMs;  }, [crossfadeMs]);
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
  const dispGenre  = (s: Song) => getMeta(s).customGenre || s.genre || "";
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
      if (metaDirtyRef.current) {
        metaDirtyRef.current = false;
        saveMetaNow(metaRef.current);
      }
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
      // Dismiss the per-song action sheet across a background/foreground
      // transition, so returning to the app never lands on a stale menu for a
      // song you have since scrolled away from.
      setMenuSong(null);
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

  // ── Sync user-picked covers to native ─────────────────────────────────────
  // applyEdit pushes a cover to native as it is set, but that only covers edits
  // made from now on. Photos set before this existed, or brought in by a backup
  // restore, are unknown to native until we tell it. We keep the list of ids we
  // have pushed so a restore is picked up too, and so a launch with nothing new
  // does no work at all.
  useEffect(() => {
    if (isInitializing) return;
    let cancelled = false;
    (async () => {
      try {
        const { value } = await Preferences.get({ key: "mptree_track_art_pushed" });
        const pushed: string[] = value ? JSON.parse(value) : [];
        if (cancelled) return;

        const pushedSet = new Set(pushed);
        const withPhoto = Object.keys(metaRef.current).filter(id => metaRef.current[id]?.customPhoto);
        const withPhotoSet = new Set(withPhoto);

        const toAdd   = withPhoto.filter(id => !pushedSet.has(id));
        const toClear = pushed.filter(id => !withPhotoSet.has(id));
        if (!toAdd.length && !toClear.length) return;

        // Only tick off what actually landed. setTrackArt rejects while the
        // playback service is still binding, and recording a push that never
        // happened would leave that cover missing from the lock screen forever.
        const landed = new Set(pushed.filter(id => withPhotoSet.has(id)));
        for (const id of toAdd) {
          if (cancelled) return;
          try {
            await AudioPlayer.setTrackArt({ path: id, dataUrl: metaRef.current[id]!.customPhoto! });
            landed.add(id);
          } catch { /* try again next launch */ }
        }
        for (const id of toClear) {
          if (cancelled) return;
          try {
            await AudioPlayer.setTrackArt({ path: id, dataUrl: null });
            landed.delete(id);
          } catch { /* still ours to clear next launch */ landed.add(id); }
        }
        if (cancelled) return;
        await Preferences.set({ key: "mptree_track_art_pushed", value: JSON.stringify([...landed]) });
      } catch {
        // Nothing here is worth bothering the user about: the lock screen just
        // falls back to embedded art or the logo, exactly as it did before.
      }
    })();
    return () => { cancelled = true; };
  }, [isInitializing]);

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

  // Bring the playing track into view whenever it changes. This is the app
  // scrolling, not the user, so it is flagged for the duration: without that
  // the header would fold away every time you hit shuffle or skip, because the
  // resulting jump looks exactly like a downward drag.
  useEffect(() => {
    if (!currentSong) return;
    // Armed here, up front, rather than only next to the scroll call: the list
    // can settle and emit scroll events before this effect's timer fires, and
    // any of those arriving unguarded would fold the header away.
    beginProgrammaticScroll();
    const t = setTimeout(() => {
      // Re-armed so the window covers the smooth scroll that starts now.
      beginProgrammaticScroll();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Every artist actually present, counted. Built from dispArtist, so an artist
  // typed into Edit shows up here exactly like one that came from the file.
  const artistList = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of songs) {
      const a = dispArtist(s);
      if (!a || isMissingArtist(a)) continue;
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((x, y) => x.name.localeCompare(y.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, meta]);

  // An artist can vanish underneath the filter: renamed in Edit, or its last
  // song removed. Derived rather than corrected in an effect, so the list can
  // never be left filtered to nothing by a name that is no longer there.
  const activeArtist = artistFilter && artistList.some(a => a.name === artistFilter)
    ? artistFilter
    : null;

  const isFavFilter = filter === "favorites";
  const displayList: Song[] = React.useMemo(() => {
    const processed = songs.filter(s =>
      (dispName(s).toLowerCase().includes(search.toLowerCase()) || dispArtist(s).toLowerCase().includes(search.toLowerCase())) &&
      (!isFavFilter || isLiked(s)) &&
      (!activeArtist || dispArtist(s) === activeArtist)
    ).slice().sort((a, b) => {
      if (filter === "favorites" || filter === "newest") return (b.dateAdded || 0) - (a.dateAdded || 0);
      if (filter === "oldest")       return (a.dateAdded || 0) - (b.dateAdded || 0);
      if (filter === "alphabetical") return dispName(a).localeCompare(dispName(b));
      if (filter === "artist")       return (dispArtist(a) || "zzz").localeCompare(dispArtist(b) || "zzz");
      return 0;
    });
    return isFavFilter ? [...processed.filter(isLiked), ...processed.filter(s => !isLiked(s))] : processed;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, search, filter, meta, activeArtist]);
  displayListRef.current = displayList;


  // ── Playback ──────────────────────────────────────────────────────────────
  const playSong = async (s: Song, q: Song[], titleOverride?: string, artistOverride?: string) => {
    // Starting a track makes the app scroll to it. Flag that here, in the click
    // handler itself, rather than relying on the effect that performs the
    // scroll: effects run after paint and can be delayed, and a scroll event
    // arriving in that gap would read as the user dragging the list down.
    beginProgrammaticScroll();
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
  // The queue is the single source of play order in EVERY mode. It used to be
  // consulted only in shuffle mode, with sequential mode walking displayList
  // instead — which is why a Play-Next pin was ignored unless shuffle was on.
  // handlePlayNext now splices the pinned track into the queue directly, so
  // both modes just step through the queue and pins are honoured either way.
  const skip = async (dir: -1 | 1) => {
    if (!currentSong) return;
    const q = queue.length ? queue : displayList;
    const idx = q.findIndex(s => s.id === currentSong.id);
    if (idx === -1) return;
    const nxt = q[idx + dir];
    if (!nxt) return;
    if (q !== queue) setQueue(q);
    playSong(nxt, q);
  };

  // ── Play Next ─────────────────────────────────────────────────────────────
  // Recording the id in playNextQueue only feeds the "Up Next" list; it does
  // NOT change what plays. The native service advances on its own from the
  // queue it was handed, so the pinned track has to be physically moved into
  // the queue (here and natively) or it never actually plays next.
  const handlePlayNext = useCallback((song: Song) => {
    setMenuSong(null);
    const cur = curRef.current;

    // Nothing playing: there is no "next" to sit after, so just start it.
    if (!cur) {
      const q = [song];
      setQueue(q);
      playSong(song, q);
      return;
    }
    if (song.id === cur.id) { showToast("Already playing"); return; }

    const base = queueRef.current.length ? queueRef.current : displayListRef.current;
    // Drop any existing copy first so re-pinning moves it instead of duplicating.
    const without = base.filter(s => s.id !== song.id);
    const curIdx = without.findIndex(s => s.id === cur.id);
    if (curIdx === -1) return;

    // Land after the current track AND after any pins already queued behind it,
    // so repeated Play Next taps keep their tap order.
    const pinned = playNextQueueRef.current;
    let insertAt = curIdx + 1;
    while (insertAt < without.length && pinned.includes(without[insertAt].id)) insertAt++;

    const newQ = [...without.slice(0, insertAt), song, ...without.slice(insertAt)];
    setQueue(newQ);
    AudioPlayer.setQueue({
      tracks: newQ.map(toNativeTrack),
      currentIndex: newQ.findIndex(s => s.id === cur.id),
    }).catch(() => {});

    setPlayNextQueue(prev => mergePins(prev, [song.id]));
    showToast(`"${dispName(song)}" plays next`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, toNativeTrack]);

  // The multi-select version. Same rules as handlePlayNext, applied to a whole
  // selection at once: the songs land together, directly after the current
  // track, in the order they appear in the list rather than the order they were
  // ticked. Splicing into the queue (not just recording ids) matters for the
  // reason given above: native advances on its own and never reads playNextQueue.
  const handlePlayManyNext = useCallback((ids: string[]) => {
    const chosen = displayListRef.current.filter(s => ids.includes(s.id));
    if (!chosen.length) return;

    const cur = curRef.current;
    if (!cur) {
      setQueue(chosen);
      playSong(chosen[0], chosen);
      return;
    }

    const toPin = chosen.filter(s => s.id !== cur.id);
    if (!toPin.length) { showToast("Already playing"); return; }

    const base = queueRef.current.length ? queueRef.current : displayListRef.current;
    const newQ = planPlayNext(base, cur.id, toPin, playNextQueueRef.current);
    if (!newQ) return;
    setQueue(newQ);
    AudioPlayer.setQueue({
      tracks: newQ.map(toNativeTrack),
      currentIndex: newQ.findIndex(s => s.id === cur.id),
    }).catch(() => {});

    setPlayNextQueue(prev => mergePins(prev, toPin.map(s => s.id)));
    showToast(toPin.length === 1 ? `"${dispName(toPin[0])}" plays next` : `${toPin.length} songs play next`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, toNativeTrack]);

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
    openChrome();
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

  // Expanded-player mode button: cycles off → shuffle → repeat → off.
  const cyclePlayerMode = () => {
    hapticImpact("light");
    if (playMode === "off") {
      if (!currentSong) return;
      const rest = buildShuffleQ(displayList.filter(s => s.id !== currentSong.id));
      const q = [currentSong, ...rest]; setPlayMode("shuffle"); setQueue(q);
      AudioPlayer.setQueue({ tracks: q.map(toNativeTrack), currentIndex: 0 }).catch(() => {});
      showToast("Shuffle on");
    } else if (playMode === "shuffle") {
      setPlayMode("repeat"); showToast("Repeat on");
    } else {
      setPlayMode("off"); showToast("Repeat off");
    }
  };

  // ── Mini-player swipe: gesture-driven expand (up) / skip (left-right) ──────
  // Vertical drags open the full player LIVE — the sheet follows the finger,
  // exactly like the horizontal Songs↔Playlists page swipe but vertical.
  // On release past ~25% it springs open; below that it settles back down.
  const [expandDrag, setExpandDrag]     = useState<number | null>(null); // 0..1 while dragging
  const [expandSettling, setExpandSettling] = useState(false);           // animating back down
  // Horizontal swipe feedback for the mini-player's track text: it follows the
  // finger, then the incoming track slides in from the side you swiped toward,
  // so skipping reads as moving through a strip of songs rather than a blink.
  const [titleDragX, setTitleDragX] = useState(0);
  const [titleDir,   setTitleDir]   = useState<1 | -1>(1);
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
    // Damped so the text trails the finger instead of racing it.
    if (playerAxisRef.current === "h") setTitleDragX(dx * 0.45);
  };
  const onPlayerSwipeEnd = (clientX: number, clientY: number) => {
    if (playerSwipeStartY.current === null || playerSwipeStartX.current === null) return;
    const deltaY = playerSwipeStartY.current - clientY;
    const deltaX = clientX - playerSwipeStartX.current;
    playerSwipeStartY.current = null;
    playerSwipeStartX.current = null;
    const axis = playerAxisRef.current;
    playerAxisRef.current = null;

    if (axis === "h") {
      setTitleDragX(0);
      if (Math.abs(deltaX) > 55) {
        hapticImpact("light");
        // Swiping left (negative dx) advances, so the next track should enter
        // from the right; swiping right does the mirror.
        setTitleDir(deltaX < 0 ? 1 : -1);
        skip(deltaX < 0 ? 1 : -1);
        setExpandDrag(null);
        return;
      }
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
    activeMenu: menuSong?.id ?? null,
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
    // Single tap plays immediately. Liking is done via the heart button only
    // (double-tap-to-like was removed — it forced a 250ms delay on every play
    // and made tapping a song feel laggy).
    // Starting something to listen to means you want the player, so a folded
    // chrome unfolds. Otherwise tapping a song from a collapsed list plays it
    // with no visible transport at all.
    openChrome();
    // Honour shuffle. This used to always queue displayList in order, so with
    // shuffle already on (typically restored from the previous session) tapping
    // a song silently played the library sequentially from that point.
    if (playMode === "shuffle") {
      const q = [song, ...buildShuffleQ(displayList.filter(s => s.id !== song.id))];
      setQueue(q); playSong(song, q);
      return;
    }
    setQueue(displayList); playSong(song, displayList);
  };

  const onPressStart = (id: string, clientX: number, clientY: number) => {
    pressStartX.current = clientX;
    pressStartY.current = clientY;
    // Long-press now starts multi-select, the standard Android gesture. The
    // per-song actions moved to the "⋮" button, so this no longer has to
    // double as a hidden menu trigger.
    pressTimer.current = setTimeout(() => {
      hapticImpact("medium");
      setSelectMode(true);
      setSelected(prev => { const next = new Set(prev); next.add(id); return next; });
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
    // Hand the cover to native too, or the lock screen and notification keep
    // showing the logo for exactly the songs the user bothered to set art on.
    // Native stores it on disk, so it survives the WebView being frozen and
    // still applies when the service advances tracks by itself.
    if (u.customPhoto !== undefined) {
      AudioPlayer.setTrackArt({ path: s.uri, dataUrl: u.customPhoto ?? null }).catch(() => {});
    }
    setEditSong(null); setMenuSong(null);
  };

  // Id-taking versions of the multi-select actions, so the Playlists page can
  // drive the same selection bar. The Songs page keeps using its own
  // selection-scoped handlers, which already existed.
  const likeMany = useCallback((ids: string[], like: boolean) => {
    setMeta(prev => {
      const next = { ...prev };
      for (const id of ids) next[id] = { ...(next[id] || {}), liked: like };
      return next;
    });
    showToast(like ? `${ids.length} liked` : `${ids.length} removed from favorites`);
  }, []);

  const shuffleMany = useCallback((ids: string[]) => {
    const chosen = songs.filter(s => ids.includes(s.id));
    if (!chosen.length) return;
    const shuffled = [...chosen].sort(() => Math.random() - 0.5);
    setPlayMode("shuffle");
    setQueue(shuffled);
    playSong(shuffled[0], shuffled);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  // ── Bulk edit ─────────────────────────────────────────────────────────────
  // One pass over the selection, applying only the fields the sheet actually
  // returned. null means the user asked to clear that field, which is why this
  // cannot simply spread the payload: `undefined` has to erase the stored value
  // rather than be written as a literal.
  const applyBulkEdit = (ids: string[], u: BulkEdit) => {
    const changedPhoto = u.customPhoto !== undefined;
    setMeta(prev => {
      const next = { ...prev };
      for (const id of ids) {
        const cur = { ...(next[id] || {}) };
        if (u.customArtist !== undefined) {
          if (u.customArtist === null) delete cur.customArtist; else cur.customArtist = u.customArtist;
        }
        if (u.customGenre !== undefined) {
          if (u.customGenre === null) delete cur.customGenre; else cur.customGenre = u.customGenre;
        }
        if (changedPhoto) {
          if (u.customPhoto === null) delete cur.customPhoto; else cur.customPhoto = u.customPhoto!;
        }
        next[id] = cur;
      }
      return next;
    });

    // Covers also live natively, for the lock screen. Push each change so the
    // notification does not keep showing the old art (or the logo).
    if (changedPhoto) {
      for (const id of ids) {
        AudioPlayer.setTrackArt({ path: id, dataUrl: u.customPhoto ?? null }).catch(() => {});
      }
    }
    showToast(`${ids.length} song${ids.length === 1 ? "" : "s"} updated`);
  };

  // ── Lyrics ────────────────────────────────────────────────────────────────
  // Stored with the song, read and edited in one sheet. MPTree does not fetch
  // lyrics itself: "Search online" hands the search to the user's own browser,
  // which keeps that request, and the choice to make it, on their side.
  const openLyricsSheet = (s: Song) => setLyricsSong(s);

  const searchLyricsOnline = (s: Song) => {
    const q = [dispName(s), dispArtist(s), "lyrics"].filter(Boolean).join(" ");
    Browser.open({ url: "https://duckduckgo.com/?q=" + encodeURIComponent(q) }).catch(() => {});
  };

  const saveLyrics = (s: Song, lyrics: string | null) => {
    setMeta(prev => {
      const cur = { ...(prev[s.id] || {}) };
      if (lyrics === null) delete cur.customLyrics; else cur.customLyrics = lyrics;
      return { ...prev, [s.id]: cur };
    });
    setLyricsSong(null);
    showToast(lyrics === null ? "Lyrics removed" : "Lyrics saved");
  };


  // ── Set as ringtone ───────────────────────────────────────────────────────
  // Three outcomes worth telling apart, because "nothing happened" is the worst
  // possible feedback: it worked, Android wants the user to flip a switch first
  // (we have just opened that screen for them), or the file is not in MediaStore
  // so there is no ringtone URI to point at.
  const setSongAsRingtone = async (s: Song) => {
    try {
      const res = await MusicScanner.setAsRingtone({ path: s.uri });
      if (res.ok) {
        showToast("Ringtone set");
      } else if (res.needsPermission) {
        showToast("Allow MPTree to change system settings, then try again");
      } else if (res.reason === "notIndexed") {
        showToast("This track is not in the device library yet");
      } else {
        showToast("Could not set that as a ringtone");
      }
    } catch (e) {
      showError("Ringtone failed: " + e);
    }
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
    setRemoveSong(null); setMenuSong(null); setPlayerExpanded(false);
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
    setCutDuration(dur); setCutSong(song); setMenuSong(null);
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

  /** Append a song to an existing playlist, from the "⋮" menu. */
  const handleAddToPlaylist = useCallback((playlistId: string, song: Song) => {
    setPlaylists(prev => {
      const updated = prev.map(pl =>
        pl.id === playlistId && !pl.songIds.includes(song.id)
          ? { ...pl, songIds: [...pl.songIds, song.id] }
          : pl,
      );
      savePlaylists(updated);
      const target = updated.find(pl => pl.id === playlistId);
      if (target) showToast(`Added to "${target.name}"`);
      return updated;
    });
    setMenuSong(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Add every selected song to an existing playlist, from multi-select. */
  const handleAddManyToPlaylist = useCallback((playlistId: string, ids: string[]) => {
    setPlaylists(prev => {
      const updated = prev.map(pl => {
        if (pl.id !== playlistId) return pl;
        const have = new Set(pl.songIds);
        const toAdd = ids.filter(id => !have.has(id));
        return toAdd.length ? { ...pl, songIds: [...pl.songIds, ...toAdd] } : pl;
      });
      savePlaylists(updated);
      const target = updated.find(pl => pl.id === playlistId);
      if (target) showToast(`Added ${ids.length} to "${target.name}"`);
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Create a brand-new playlist holding exactly the selected songs. */
  const handleCreatePlaylistWithSongs = useCallback((name: string, ids: string[]) => {
    const playlist: Playlist = { id: Date.now().toString(), name, songIds: [...ids], createdAt: Date.now() };
    setPlaylists(prev => {
      const updated = [...prev, playlist];
      savePlaylists(updated);
      return updated;
    });
    showToast(`Created "${name}" with ${ids.length} songs`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Create a brand-new playlist that starts with this one song. */
  const handleCreatePlaylistWithSong = useCallback((name: string, song: Song) => {
    const playlist: Playlist = {
      id: Date.now().toString(),
      name,
      songIds: [song.id],
      createdAt: Date.now(),
    };
    setPlaylists(prev => {
      const updated = [...prev, playlist];
      savePlaylists(updated);
      return updated;
    });
    showToast(`Created "${name}"`);
    setMenuSong(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayPlaylist = useCallback((playlistSongs: Song[], shuffle: boolean) => {
    if (!playlistSongs.length) return;
    openChrome();
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

  // ── Android hardware / gesture Back ───────────────────────────────────────
  // Without a handler, Back closes the whole app from anywhere, even with a
  // sheet open. This walks ONE layer of UI at a time, topmost first, and only
  // exits from the root Songs list. The handler lives in a ref that is
  // refreshed every render, so the native listener is registered exactly once
  // but always sees current state.
  const backHandlerRef = useRef<() => void>(() => {});
  useEffect(() => {
    backHandlerRef.current = () => {
      // Topmost layers first. Each branch returns after handling one level.
      if (backupSheet.kind !== "closed") {
        // Never interrupt an in-flight backup/restore; those sheets drive a
        // long native job and dismissing mid-way would orphan it. Every other
        // state is either a prompt or a finished result, so Back dismisses it.
        const busy = backupSheet.kind === "exportProgress"
          || backupSheet.kind === "importProgress"
          || backupSheet.kind === "sharing";
        if (!busy) setBackupSheet({ kind: "closed" });
        return;
      }
      if (showOnboarding)      { finishOnboarding(); return; }
      if (eqOpen)              { setEqOpen(false); return; }
      if (binOpen)             { setBinOpen(false); return; }
      if (settingsOpen)        { setSettingsOpen(false); return; }
      if (cutSong)             { setCutSong(null); return; }
      if (removeSong)          { setRemoveSong(null); return; }
      if (removeMultiConfirm)  { setRemoveMultiConfirm(false); return; }
      if (editSong)            { setEditSong(null); return; }
      if (playerExpanded)      { setPlayerExpanded(false); openedByDragRef.current = false; return; }
      if (updateInfo)          { const v = updateInfo.version; setUpdateInfo(null); dismissUpdate(v); return; }
      if (filterOpen)          { setFilterOpen(false); return; }
      if (chromeMenuOpen)      { setChromeMenuOpen(false); return; }
      if (menuSong)            { setMenuSong(null); return; }
      if (multiAddOpen)        { setMultiAddOpen(false); return; }
      if (selectMode)          { exitSelectMode(); return; }
      if (page === "playlists") {
        // PlaylistsView owns its own nested navigation, so hand Back to it and
        // let it pop one level. It reports back through onDetailChange when it
        // has nothing left to pop, at which point we leave the tab.
        if (playlistDetailOpen) { setPlaylistBackSignal(n => n + 1); return; }
        setPage("songs");
        return;
      }
      // Root of the app: let Android close it.
      CapApp.exitApp().catch(() => {});
    };
  });
  useEffect(() => {
    let sub: { remove(): void } | null = null;
    CapApp.addListener("backButton", () => backHandlerRef.current())
      .then(l => { sub = l; })
      .catch(() => {});
    return () => { sub?.remove(); };
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  // Mini-player height: 20px handle padding + slider row + controls + 26px
  // bottom padding. Keep in sync with the bottom-player padding — the shuffle
  // FAB and list padding are offset by this.
  // Distance from the bottom of the screen to the TOP edge of the floating
  // mini-player card: 18px bottom offset + ~140px card height. Anything that
  // sits "just above the player" offsets from this, so the gaps stay exact.
  // Both tabs collapse — the Playlists grid runs off the bottom of the screen
  // just as readily as the song list does. Multi-select is the one exception:
  // it needs its own bar and the header's count visible.
  const chromeCollapsed = !selectMode && !chromeOpen;

  // ONE definition of how the fold moves, used by every piece that moves with
  // it: the header card, the mini-player, the list's bottom padding, the two
  // floating buttons, and the Playlists insets. They used to be written out
  // separately and had drifted apart — the shuffle and scroll-to-top buttons
  // carried no transition at all, so they snapped to their new position while
  // the player was still sliding underneath them.
  //
  // `chromeMotion` is empty when the fold is not being animated (the
  // scroll-to-top button jumps deliberately, so arriving at the top does not
  // play a third of a second of unfolding while the list races past).
  const CHROME_MOTION = "0.34s cubic-bezier(0.22, 1, 0.36, 1)";
  const move = (...props: string[]) =>
    chromeAnimate ? props.map(pr => `${pr} ${CHROME_MOTION}`).join(", ") : "none";

  // The collapse rule itself, shared by the Songs list and the Playlists body
  // so both tabs behave identically. `lastRef` is that scroller's own previous
  // offset — see the note where those refs are declared.
  // Deliberately NOT memoised: both call sites are inline arrows re-created on
  // every render anyway, so there is nothing to save, and closing over `page`
  // directly beats mirroring it into yet another ref.
  const handleChromeScroll = (top: number, lastRef: React.MutableRefObject<number>, from: "songs" | "playlists") => {
    // Both pages stay mounted, one sliding over the other, so BOTH scrollers
    // keep firing. Folding the chrome changes the top inset, which relays out
    // the page underneath, and a relayout on a scroller can emit a scroll event
    // of its own — which would land in the "back at the top, show the chrome
    // again" branch and undo the fold. Only the page you are looking at gets a
    // say in whether the header is folded.
    if (from !== page) return;
    const prev = lastRef.current;
    lastRef.current = top;
    // A scroll the app started (jumping to the playing track after shuffle or
    // skip) is not the user asking for more list room.
    if (programmaticScrollRef.current) return;
    // With automatic collapsing off, scrolling never touches the chrome at all,
    // not even to restore it at the top.
    if (!autoCollapseRef.current) return;
    if (top <= 4) {
      chromeManualRef.current = null;
      setChromeOpen(true);
      return;
    }
    if (chromeManualRef.current !== null) return;
    // Only a genuine downward drag folds it away. Scrolling back up leaves the
    // chrome hidden until you actually reach the top, which is what keeps the
    // list from flickering mid-scroll.
    if (top > prev + 2 && top > CHROME_COLLAPSE_AT) {
      // Only hint on the transition, not on every scroll event while folded.
      if (chromeOpen) showCollapseHint();
      setChromeOpen(false);
    }
  };

  const toggleChrome = () => {
    hapticImpact("light");
    setChromeAnimate(true);
    const next = !chromeOpen;
    chromeManualRef.current = next;
    setChromeOpen(next);
  };

  // Logo: tap toggles the chrome, hold opens a little panel with a switch for
  // automatic collapsing — flipping a setting blind on a long-press gives no
  // hint that the setting exists or which way it now sits.
  const setAutoCollapseEnabled = (next: boolean) => {
    autoCollapseRef.current = next;
    setAutoCollapse(next);
    // Re-enabling hands control back to the scroll position, so forget any
    // override the user set while it was off.
    if (next) chromeManualRef.current = null;
    Preferences.set({ key: "mptree_auto_collapse", value: next ? "1" : "0" }).catch(() => {});
  };

  const logoPressTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoLongPressed  = useRef(false);
  const onLogoPressStart = () => {
    logoLongPressed.current = false;
    logoPressTimer.current = setTimeout(() => {
      logoLongPressed.current = true;
      hapticImpact("medium");
      setChromeMenuOpen(true);
    }, 500);
  };
  const onLogoPressEnd = () => {
    if (logoPressTimer.current) { clearTimeout(logoPressTimer.current); logoPressTimer.current = null; }
  };
  const onLogoClick = () => {
    // Swallow the click that follows a long-press, or holding would also toggle.
    if (logoLongPressed.current) { logoLongPressed.current = false; return; }
    toggleChrome();
  };

  // 18px bottom offset + the card's own measured height (95px). The card lost
  // 45px when the timeline moved out of it, so this came down from 158; the
  // shuffle FAB, the scroll-to-top button and the list's bottom padding all
  // offset from here, and a stale number leaves a visible gap under the player.
  const playerH    = currentSong && !selectMode && !chromeCollapsed ? 113 : 0;
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
  // Virtualization assumes a uniform ROW_H. That used to be broken by the
  // long-press menu expanding a row inline, hence an `!activeMenu` guard here;
  // the menu is a sheet now, so every row is the same height at all times.
  const virtualize = displayList.length > VIRT_THRESHOLD;
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
        /* Mini-player track text: the incoming song slides in from whichever
           side the swipe came from. "backwards", not "both", so the finished
           animation hands the transform back to the drag-follow inline style. */
        @keyframes mpTitleFromR { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes mpTitleFromL { from { transform: translateX(-30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .mp-title-r { animation: mpTitleFromR 0.26s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        .mp-title-l { animation: mpTitleFromL 0.26s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        @media (prefers-reduced-motion: reduce) { .mp-title-r, .mp-title-l { animation: none; } }
        .pulse { animation:pulse 1s ease-in-out infinite; }
        /* Bars on the album art of the track that is playing. Defined here
           rather than in AlbumArt so a single rule serves every list that
           renders one (Songs, playlists, the bin). */
        @keyframes mpEq { 0%,100% { height: 22%; } 50% { height: 92%; } }
        .mp-eqbar { height: 40%; animation: mpEq 0.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .mp-eqbar { animation: none; height: 60%; } }
        /* The "tap the logo" pill shown the first few automatic collapses. */
        @keyframes mpHintIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        .mp-hint { animation: mpHintIn 0.22s ease both; }
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
            position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 2px)", left: 12, zIndex: 60,
            background: TH.playerBg, border: `1px solid ${TH.border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            boxSizing: "border-box", overflow: "hidden",
            // Animating requires real numbers on both ends, so the expanded
            // height is measured from the inner wrapper rather than left auto.
            // +2 covers the card's own top and bottom border.
            width:  chromeCollapsed ? 54 : "calc(100% - 24px)",
            height: chromeCollapsed ? 54 : expandedH + 2,
            borderRadius: chromeCollapsed ? "50%" : 22,
            transition: move("width", "height", "border-radius"),
          }}
        >
          {/* Full header. Kept mounted and at its natural width while collapsed
              (just clipped) so it never reflows — a reflow would corrupt the
              measured height the card animates to. */}
          <div
            ref={headerInnerRef}
            style={{
              boxSizing: "border-box", width: "calc(100vw - 26px)", padding: "8px 14px 12px",
              opacity: chromeCollapsed ? 0 : 1,
              pointerEvents: chromeCollapsed ? "none" : "auto",
              // Deliberately NOT the shared CHROME_MOTION timing: the two
              // logos (this one at 48px, the collapsed one at 30px) overlap
              // during the swap, and fading them over a third of a second
              // reads as a ghosted double image. This is a cross-fade, not a
              // movement, so it gets its own short duration.
              transition: chromeAnimate ? "opacity 0.15s ease" : "none",
            }}
          >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <button
              onClick={onLogoClick}
              onTouchStart={onLogoPressStart} onTouchEnd={onLogoPressEnd} onTouchCancel={onLogoPressEnd}
              onMouseDown={onLogoPressStart} onMouseUp={onLogoPressEnd} onMouseLeave={onLogoPressEnd}
              aria-label="Collapse header"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", color: TH.text }}
            >
              <Logo size={48} color={TH.text} />
            </button>
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
            {/* In select mode the count gives way to Remove. It is the only action
                in this mode that destroys anything, so it sits up here on its own
                rather than in a row of four harmless chips where a mis-tap is easy.
                The count is still shown, in the bar at the bottom. The confirm
                sheet behind removeMultiConfirm is what actually guards it. */}
            {selectMode && (
              <button
                onClick={selected.size === 0 ? undefined : () => setRemoveMultiConfirm(true)}
                aria-label="Remove selected songs"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: selected.size > 0 ? TH.binBg : "transparent",
                  border: "1px solid " + (selected.size > 0 ? TH.binBorder : TH.border),
                  color: selected.size > 0 ? "#e8445a" : TH.muted,
                  borderRadius: 20, padding: "6px 12px",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  cursor: selected.size > 0 ? "pointer" : "default",
                  opacity: selected.size > 0 ? 1 : 0.5,
                }}
              >
                <IC.Trash />Remove
              </button>
            )}
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: TH.muted, flexShrink: 0 }}>{displayList.length} songs</span>
                  {/* An active artist filter has to be visible and undoable from
                      here. Buried in the sort menu it reads as "my songs are
                      missing" rather than "you filtered them out". */}
                  {activeArtist && (
                    <button
                      onClick={() => setArtistFilter(null)}
                      aria-label={"Show all artists, currently showing " + activeArtist}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: 200, background: TH.violet + "22", color: TH.violet, border: "none", borderRadius: 20, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeArtist}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
                {/* Just the button. The menu itself is rendered OUTSIDE this
                    card (see "Sort menu" further down): the card clips its
                    overflow so it can animate its height, which silently cut
                    the dropdown off and made the sort options unusable. */}
                <button onClick={() => setFilterOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px 5px 13px", borderRadius: 16, border: `1px solid ${isFavFilter ? TH.heart + "88" : TH.border}`, background: isFavFilter ? TH.binBg : TH.surface, color: isFavFilter ? TH.heart : TH.chipColor, cursor: "pointer", fontSize: 13, fontWeight: "600", fontFamily: "inherit" }}>
                  <span>{filterLabel}</span><IC.Chevron />
                </button>
              </div>
            </div>
          )}
          </div>

          {/* Collapsed state: the round logo, cross-fading with the header it
              shrank into. Always mounted so both ends of the fold animate. */}
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              // Pinned left rather than centred: while the card is still wide,
              // "centre" is far from where the header's own logo sits, so the
              // mark would visibly sweep inward as the card shrinks. Held here
              // it simply stays put and the card closes around it.
              justifyContent: "flex-start", paddingLeft: 11,
              opacity: chromeCollapsed ? 1 : 0,
              pointerEvents: chromeCollapsed ? "auto" : "none",
              transition: chromeAnimate ? "opacity 0.15s ease" : "none",
            }}
          >
            <button
              onClick={onLogoClick}
              onTouchStart={onLogoPressStart} onTouchEnd={onLogoPressEnd} onTouchCancel={onLogoPressEnd}
              onMouseDown={onLogoPressStart} onMouseUp={onLogoPressEnd} onMouseLeave={onLogoPressEnd}
              aria-label="Show search and player"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", color: TH.text }}
            >
              <Logo size={30} color={TH.text} />
            </button>
          </div>
        </div>

        {/* ── Collapse hint ────────────────────────────────────────────────
            The first few times the chrome folds itself away, say so. Without
            this the header and player just disappear on a scroll and nothing
            suggests the little round logo is the way back. Shown three times
            total (counted in Preferences), then never again. */}
        {chromeCollapsed && collapseHint && (
          <div
            className="mp-hint"
            onClick={() => { setCollapseHint(false); toggleChrome(); }}
            style={{
              position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 16px)", left: 74, zIndex: 61,
              display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              background: TH.sheetBg, border: `1px solid ${TH.border}`, borderRadius: 18,
              padding: "6px 13px 6px 10px", boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
              fontSize: 12.5, color: TH.textSub, whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "flex", transform: "rotate(180deg)", color: TH.muted }}><IC.ChevronR /></span>
            Tap the logo to bring these back
          </div>
        )}

        {/* ── Update notice ────────────────────────────────────────────────
            Someone on an older build has no other way to find out that a fix
            shipped: the app is offline by design and the website is the only
            channel. Sits under the header rather than at the bottom, where it
            would land on top of the shuffle button and the mini-player, and
            dismisses per version so saying "Later" once means later for good. */}
        {updateInfo && (
          <div style={{
            position: "absolute", top: topInset, left: 12, right: 12, zIndex: 120,
            background: TH.sheetBg, border: `1px solid ${TH.border}`, borderRadius: 16,
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)", padding: "14px 16px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ display: "flex", color: TH.text }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" /><polyline points="5 12 12 5 19 12" />
                </svg>
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: TH.text }}>
                MPTree {updateInfo.version} is out
              </span>
            </div>
            {updateInfo.notes && updateInfo.notes.length > 0 && (
              <ul style={{ margin: "8px 0 0", padding: "0 0 0 18px", color: TH.textSub, fontSize: 13, lineHeight: 1.55 }}>
                {updateInfo.notes.slice(0, 2).map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => { const v = updateInfo.version; setUpdateInfo(null); dismissUpdate(v); }}
                style={{ flex: 1, padding: 11, background: TH.dim, color: TH.text, border: "none", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Later
              </button>
              <button
                onClick={() => {
                  const info = updateInfo;
                  setUpdateInfo(null);
                  dismissUpdate(info.version);
                  Browser.open({ url: info.url }).catch(() => {});
                }}
                style={{ flex: 1, padding: 11, background: TH.accent, color: TH.playBtnFg, border: "none", borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                Get it
              </button>
            </div>
          </div>
        )}

        {/* ── Sort menu ────────────────────────────────────────────────────
            A sibling of the header card, not a child of it. The card sets
            overflow:hidden so its fold animation has something to clip, and
            an absolutely-positioned dropdown inside it was clipped along with
            everything else — the menu opened and was simply invisible. Anchored
            here to `topInset`, which already tracks the card's bottom edge. */}
        {filterOpen && page === "songs" && !chromeCollapsed && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setFilterOpen(false)} />
            <div style={{ position: "absolute", right: 18, top: topInset - 8, background: TH.sheetBg, borderRadius: 14, border: `1px solid ${TH.border}`, minWidth: 205, maxWidth: 280, maxHeight: "60vh", overflowY: "auto", zIndex: 200, boxShadow: "0 10px 36px rgba(0,0,0,0.3)" }}>
              {FILTER_OPTIONS.map((opt: { id: FilterId; label: string }) => (
                <button key={opt.id} onClick={() => { setFilter(opt.id); setFilterOpen(false); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "13px 16px", background: "transparent", border: "none", borderBottom: `1px solid ${TH.dim}`, color: filter === opt.id ? TH.text : TH.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: filter === opt.id ? "700" : "400" }}>
                  <span>{opt.label}</span>{filter === opt.id && IC.Check(TH.accent)}
                </button>
              ))}

              {/* ── Artists ───────────────────────────────────────────────
                  Ordering and narrowing are different questions, so an artist
                  can be picked alongside any sort above rather than replacing
                  it. The list is whatever artists the library actually has,
                  including ones typed in by hand, so it grows on its own. */}
              {artistList.length > 0 && (
                <>
                  <div style={{ padding: "10px 16px 6px", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: TH.muted, fontWeight: 700, borderBottom: `1px solid ${TH.dim}`, background: TH.dim }}>
                    Artists
                  </div>
                  {activeArtist && (
                    <button onClick={() => { setArtistFilter(null); setFilterOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "11px 16px", background: "transparent", border: "none", borderBottom: `1px solid ${TH.dim}`, color: TH.violet, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                      <IC.Close />All artists
                    </button>
                  )}
                  {artistList.map(a => (
                    <button key={a.name} onClick={() => { setArtistFilter(a.name === activeArtist ? null : a.name); setFilterOpen(false); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, width: "100%", padding: "11px 16px", background: "transparent", border: "none", borderBottom: `1px solid ${TH.dim}`, color: a.name === activeArtist ? TH.text : TH.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: a.name === activeArtist ? "700" : "400", textAlign: "left" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.name}</span>
                      {a.name === activeArtist
                        ? IC.Check(TH.accent)
                        : <span style={{ fontSize: 11, color: TH.muted, flexShrink: 0 }}>{a.count}</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {/* ── Header options, from holding the logo ───────────────────────── */}
        {chromeMenuOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setChromeMenuOpen(false)} />
            <div
              style={{
                position: "absolute", top: topInset, left: 12, zIndex: 200,
                background: TH.sheetBg, border: `1px solid ${TH.border}`, borderRadius: 16,
                boxShadow: "0 12px 40px rgba(0,0,0,0.45)", padding: "6px 6px 10px", width: 268,
              }}
            >
              <button
                onClick={() => { hapticImpact("light"); setAutoCollapseEnabled(!autoCollapse); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  width: "100%", background: "transparent", border: "none", cursor: "pointer",
                  padding: "12px 12px 10px", color: TH.text, fontFamily: "inherit", fontSize: 15, textAlign: "left",
                }}
              >
                <span>Auto-collapse</span>
                <span style={{ width: 46, height: 26, borderRadius: 13, background: autoCollapse ? TH.accent : TH.border, position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: autoCollapse ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                </span>
              </button>
              <div style={{ padding: "0 12px", fontSize: 12, color: TH.muted, lineHeight: 1.5 }}>
                {autoCollapse
                  ? "The header and player fold away as you scroll down."
                  : "They only fold when you tap the logo."}
              </div>
            </div>
          </>
        )}

        {/* ═══ SWIPEABLE PAGE AREA ═════════════════════════════════════════ */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>

          {/* ── SONGS PAGE ──────────────────────────────────────────────── */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", pointerEvents: page === "playlists" && !pageDragging ? "none" : "auto" }}>

            {/* ═══ SONG LIST ═══════════════════════════════════════════════ */}
            <main
              ref={scrollRef}
              style={{
                flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y",
                paddingTop: topInset, paddingBottom: bottomH + 64 + 12,
                // Only the bottom is transitioned: paddingTop already glides,
                // driven per-frame by the ResizeObserver on the folding header.
                transition: move("padding-bottom"),
              }}
              data-tour="songs"
              onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
              onScroll={() => {
                const top = scrollRef.current?.scrollTop ?? 0;
                setListScrollTop(top);
                handleChromeScroll(top, lastScrollTopRef, "songs");
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
                  {visibleSongs.map((song) => {
                    const isActive   = currentSong?.id === song.id;
                    const liked      = isLiked(song);
                    const isSelected = selected.has(song.id);
                    const m          = getMeta(song);
                    const name       = dispName(song);
                    const artist     = dispArtist(song);
                    return (
                      <div key={song.id} ref={el => { if (el) songRowRefs.current.set(song.id, el); else songRowRefs.current.delete(song.id); }}>
                        {(
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
                              // The playing row used to be marked only by a
                              // slightly lighter background, which is easy to
                              // miss. It now also carries the accent bar down
                              // its left edge and animated bars on its art.
                              borderLeft: isSelected ? `3px solid ${TH.violet}`
                                        : isActive   ? `3px solid ${TH.accent}`
                                        : "3px solid transparent",
                            }}>
                            {selectMode && (
                              <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `2px solid ${isSelected ? TH.violet : TH.border}`, background: isSelected ? TH.violet : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                                {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                            )}
                            <AlbumArt title={name} size={48} active={isActive && !selectMode} playing={isActive && isPlaying && !selectMode} customPhoto={m.customPhoto} songPath={song.uri} albumId={song.albumId} T={TH} />
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ fontSize: 15, fontWeight: isActive ? "700" : "600", color: isActive ? TH.accent : TH.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
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
                            {!selectMode && (
                              <button
                                onClick={e => { e.stopPropagation(); setMenuSong(song); }}
                                onTouchStart={e => e.stopPropagation()}
                                onMouseDown={e => e.stopPropagation()}
                                aria-label={`More options for ${name}`}
                                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 2px 6px 6px", display: "flex", flexShrink: 0, color: TH.muted }}
                              >
                                <IC.Dots />
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
              style={{
                position: "absolute", left: "50%", bottom: bottomH + 10, zIndex: 90,
                // The .stt class animates the show/hide; `bottom` is added here
                // so the button rides the mini-player down as it folds away.
                transition: chromeAnimate
                  ? `opacity 0.25s ease, transform 0.25s ease, bottom ${CHROME_MOTION}`
                  : "opacity 0.25s ease, transform 0.25s ease",
              }}
            >
              <button
                onClick={() => {
                  // Jumping to the top should simply arrive with the chrome
                  // already there — folding it back open over a third of a
                  // second while the list races past reads as a glitch.
                  setChromeAnimate(false);
                  chromeManualRef.current = null;
                  setChromeOpen(true);
                  beginProgrammaticScroll();
                  scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  window.setTimeout(() => setChromeAnimate(true), 600);
                }}
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
                style={{
                  position: "absolute", right: 18, bottom: playerH + 10, zIndex: 90,
                  // As above: .fabw owns the page-swipe fade, `bottom` is added
                  // so the button tracks the folding player.
                  transition: chromeAnimate
                    ? `opacity 0.2s ease, transform 0.2s ease, bottom ${CHROME_MOTION}`
                    : "opacity 0.2s ease, transform 0.2s ease",
                }}>
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
              backSignal={playlistBackSignal}
              playlists={playlists}
              smartPlaylists={smartPlaylists}
              songs={songs}
              meta={meta}
              onPlaylistsChange={handlePlaylistsChange}
              onPlayPlaylist={handlePlayPlaylist}
              onPlaySong={(song, list) => { openChrome(); setPlayMode("off"); playSong(song, list); }}
              currentSongId={currentSong?.id ?? null}
              isPlaying={isPlaying}
              onToggleLike={(song) => { hapticImpact("light"); setMeta(prev => { const cur = prev[song.id] || {}; const nowLiked = !cur.liked; showToast(nowLiked ? "Liked ❤️" : "Removed from favorites"); return { ...prev, [song.id]: { ...cur, liked: nowLiked } }; }); }}
              onPlayNext={handlePlayNext}
              onEditSong={(song) => { setEditFocusPhoto(false); setEditSong(song); }}
              onChangePhoto={(song) => { setEditFocusPhoto(true); setEditSong(song); }}
              onSetRingtone={(song) => setSongAsRingtone(song)}
              onEditLyrics={(song) => openLyricsSheet(song)}
              onLikeMany={likeMany}
              onShuffleMany={shuffleMany}
              onPlayManyNext={handlePlayManyNext}
              onAddManyToPlaylist={ids => { setMultiIds(ids); setMultiAddOpen(true); }}
              onBulkEditMany={ids => { setMultiIds(ids); setBulkEditOpen(true); }}
              onCutSong={(song) => openCutSheet(song)}
              onShareSong={(song) => shareSong(song)}
              onRemoveSong={(song) => setRemoveSong(song)}
              isLiked={isLiked}
              onHaptic={() => hapticImpact("medium")}
              onDetailChange={setPlaylistDetailOpen}
              onBodyScroll={top => handleChromeScroll(top, lastPlaylistScrollTopRef, "playlists")}
              animateInsets={chromeAnimate}
              onClose={() => setPage("songs")}
              T={TH}
            />
          </div>
        </div>

        {/* ═══ BOTTOM PLAYER ═══════════════════════════════════════════════ */}
        {currentSong && !selectMode && (() => {
          const tint = nowPlayingColor && nowPlayingColor.id === currentSong.id ? nowPlayingColor.rgb : null;
          const miniPlayerBg = tint
            ? `linear-gradient(180deg, ${tint.replace("rgb(", "rgba(").replace(")", ", 0.22)")} 0%, ${TH.playerBg} 65%)`
            : TH.playerBg;
          return (
            <div
              style={{
                position: "fixed", bottom: 18, left: 12, right: 12, background: miniPlayerBg,
                border: `1px solid ${TH.border}`, borderRadius: 22, padding: "32px 16px 20px",
                zIndex: 100, boxShadow: "0 10px 36px rgba(0,0,0,0.5)", overflow: "hidden",
                // Kept mounted while collapsed and slid off the bottom instead,
                // so it glides back up with the header rather than popping in.
                transform: chromeCollapsed ? "translateY(calc(100% + 26px))" : "translateY(0)",
                opacity: chromeCollapsed ? 0 : 1,
                pointerEvents: chromeCollapsed ? "none" : "auto",
                transition: chromeAnimate
                  ? `${move("transform", "opacity")}, background 0.4s ease`
                  : "background 0.4s ease",
              }}
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
              {/* No timeline here. Seeking is a deliberate act that wants room
                  and both hands' worth of precision, so the scrubber lives in
                  the expanded player only. Down here it crowded the card and
                  ate horizontal swipes meant for skipping tracks. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div
                  onClick={() => setPlayerExpanded(true)}
                  style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1, cursor: "pointer" }}>
                  <AlbumArt title={dispName(currentSong)} size={40} active customPhoto={nowPlayingPhoto(currentSong)} T={TH} />
                  {/* Keyed on the song so every track change remounts this and
                      replays the slide-in; the inline transform handles the
                      live drag between those animations. */}
                  <div
                    key={currentSong.id}
                    className={titleDir === 1 ? "mp-title-r" : "mp-title-l"}
                    style={{
                      minWidth: 0,
                      transform: titleDragX ? `translateX(${titleDragX}px)` : undefined,
                      transition: titleDragX ? "none" : "transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  >
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
            onShuffleSelection={multiShuffleSelection}
            onPlayNext={() => { handlePlayManyNext([...selected]); exitSelectMode(); }}
            onBulkEdit={() => { setMultiIds([...selected]); setBulkEditOpen(true); }}
            onAddToPlaylist={() => { setMultiIds([...selected]); setMultiAddOpen(true); }}
            onSelectAll={() => setSelected(new Set(displayList.map(s => s.id)))} onClearAll={() => setSelected(new Set())}
            onClose={exitSelectMode} T={TH} />
        )}

        {lyricsSong && (
          <LyricsSheet
            dispName={dispName(lyricsSong)}
            dispArtist={dispArtist(lyricsSong)}
            current={getMeta(lyricsSong).customLyrics}
            onSave={l => saveLyrics(lyricsSong, l)}
            onSearchOnline={() => searchLyricsOnline(lyricsSong)}
            onClose={() => setLyricsSong(null)}
            T={TH}
          />
        )}

        {bulkEditOpen && (
          <BulkEditSheet
            count={multiIds.length}
            onSave={u => { applyBulkEdit(multiIds, u); setBulkEditOpen(false); exitSelectMode(); }}
            onClose={() => setBulkEditOpen(false)}
            T={TH}
          />
        )}

        {multiAddOpen && (
          <AddToPlaylistSheet
            count={multiIds.length}
            playlists={playlists}
            onAddToPlaylist={id => { handleAddManyToPlaylist(id, multiIds); setMultiAddOpen(false); exitSelectMode(); }}
            onCreatePlaylist={name => { handleCreatePlaylistWithSongs(name, multiIds); setMultiAddOpen(false); exitSelectMode(); }}
            onClose={() => setMultiAddOpen(false)}
            T={TH}
          />
        )}

        {/* ═══ SHEETS ══════════════════════════════════════════════════════ */}
        {menuSong && (
          <SongMenuSheet
            song={menuSong}
            dispName={dispName(menuSong)}
            dispArtist={dispArtist(menuSong)}
            customPhoto={getMeta(menuSong).customPhoto}
            isLiked={isLiked(menuSong)}
            playlists={playlists}
            onPlay={() => { const s = menuSong; setMenuSong(null); handleTap(s); }}
            onPlayNext={() => handlePlayNext(menuSong)}
            onAddToPlaylist={id => handleAddToPlaylist(id, menuSong)}
            onCreatePlaylistWithSong={name => handleCreatePlaylistWithSong(name, menuSong)}
            onEdit={() => { const s = menuSong; setMenuSong(null); setEditFocusPhoto(false); setEditSong(s); }}
            onChangePhoto={() => { const s = menuSong; setMenuSong(null); setEditFocusPhoto(true); setEditSong(s); }}
            onSetRingtone={() => { const s = menuSong; setMenuSong(null); setSongAsRingtone(s); }}
            onEditLyrics={() => { const s = menuSong; setMenuSong(null); openLyricsSheet(s); }}
            onCut={() => { const s = menuSong; setMenuSong(null); openCutSheet(s); }}
            onToggleLike={() => {
              hapticImpact("light");
              const s = menuSong;
              setMeta(prev => {
                const cur = prev[s.id] || {};
                const nowLiked = !cur.liked;
                showToast(nowLiked ? "Liked ❤️" : "Removed from favorites");
                return { ...prev, [s.id]: { ...cur, liked: nowLiked } };
              });
              setMenuSong(null);
            }}
            onShare={() => { const s = menuSong; setMenuSong(null); shareSong(s); }}
            onRemove={() => { const s = menuSong; setMenuSong(null); setRemoveSong(s); }}
            onClose={() => setMenuSong(null)}
            T={TH}
          />
        )}
        {editSong && <EditSheet name={dispName(editSong)} artist={dispArtist(editSong)} genre={dispGenre(editSong)} currentPhoto={getMeta(editSong).customPhoto} focusPhoto={editFocusPhoto} onSave={u => applyEdit(editSong, u)} onClose={() => { setEditSong(null); setEditFocusPhoto(false); }} T={TH} />}
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
              onCycleMode={cyclePlayerMode}
              onSeek={ms => setCurrentTime(ms)}
              onSeekStart={() => setDragging(true)}
              onSeekEnd={async ms => { setDragging(false); await seekTo(ms); }}
              onToggleLike={() => { hapticImpact("light"); setMeta(prev => { const cur = prev[currentSong.id] || {}; const nowLiked = !cur.liked; showToast(nowLiked ? "Liked ❤️" : "Removed from favorites"); return { ...prev, [currentSong.id]: { ...cur, liked: nowLiked } }; }); }}
              onRemove={() => { setPlayerExpanded(false); setRemoveSong(currentSong); }}
              onShare={() => shareSong(currentSong)}
              lyrics={getMeta(currentSong).customLyrics}
              onAddLyrics={() => openLyricsSheet(currentSong)}
              onPlayNextReorder={newQ => { setPlayNextQueue(newQ); playNextQueueRef.current = newQ; }}
              onSkipCurrentUpNext={handleSkipCurrentUpNext}
              onOpenMenu={() => { setPlayerExpanded(false); openedByDragRef.current = false; setMenuSong(currentSong); }}
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