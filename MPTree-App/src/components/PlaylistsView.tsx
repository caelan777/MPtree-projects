import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { Song, SongMeta, Playlist, SmartPlaylist, SmartPlaylistId } from "../types";
import { isMissingArtist, readCoverPhoto, CROP_SOURCE_PX } from "../utils";
import { CropSheet } from "./CropSheet";
import { AlbumArt, PlayingBars } from "./AlbumArt";
import { SongMenuSheet } from "./SongMenuSheet";
import { MultiSelectBar, SelectCheck } from "./MultiSelectBar";
import { floatCard, roundBtn as cardCloseBtn } from "./cardStyles";
import { ConfirmSheet } from "./ConfirmSheet";
import { SpinningDisc } from "./SpinningDisc";
import { IC } from "./Icons";
import type { T } from "../themes";
import { useVinyl } from "../look";
import { t as tr, tn } from "../i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "list" | "detail" | "smartDetail" | "addSongs";

interface Props {
  /** Height of the floating header card above — content starts below it. */
  topInset?:          number;
  /** Row height from the Size setting. Album art is this minus 20. */
  rowH?:              number;
  playlists:          Playlist[];
  /** Built-in, auto-generated playlists (Favorites, Recently Played, Most Played, Last Added).
   *  Computed live by App from songs+meta — read-only here, never passed through onPlaylistsChange. */
  smartPlaylists:     SmartPlaylist[];
  songs:              Song[];
  meta:               Record<string, SongMeta>;
  onPlaylistsChange:  (updated: Playlist[]) => void;
  /** Called when user taps Play All or Shuffle — wire to App's playSong + setPlayMode.
   *  `source` names the playlist: "pl:<id>", or "smart:<id>" for an auto one. */
  onPlayPlaylist:     (playlistSongs: Song[], shuffle: boolean, source: string) => void;
  /** Play a single tapped song, using the surrounding list as the queue. */
  onPlaySong:         (song: Song, listSongs: Song[], source: string) => void;
  /** The playlist the music is playing from, in the same "pl:"/"smart:" form,
   *  or null when it plays from the Songs page. Its cover gets the playing
   *  bars, and only its own list marks the song that is on. */
  playingFrom?:       string | null;
  /** id of the currently-playing song, to highlight it in the lists. */
  currentSongId?:     string | null;
  /** Whether the current song is playing (for the play/pause indicator). */
  isPlaying?:         boolean;
  /** Toggle like on a song (long-press action). */
  onToggleLike:       (song: Song) => void;
  /** Queue a song to play right after the current one (long-press action). */
  onPlayNext:         (song: Song) => void;
  /** Long-press actions, shared with the Songs page so the menu is identical. */
  onEditSong:         (song: Song) => void;
  /** Same edit sheet, opened onto the cover photo. */
  onChangePhoto:      (song: Song) => void;
  /** Makes the song the device ringtone. */
  onSetRingtone:      (song: Song) => void;
  onEditLyrics:       (song: Song) => void;
  /** Multi-select actions, shared with the Songs page so the selection bar is
   *  literally the same component rather than a lookalike. */
  onLikeMany:            (ids: string[], liked: boolean) => void;
  onShuffleMany:         (ids: string[]) => void;
  onPlayManyNext:        (ids: string[]) => void;
  onShareMany:           (ids: string[]) => void;
  /** Picking songs in a playlist starts or ends: App hides its header card. */
  onSelectingChange?:    (on: boolean) => void;
  onAddManyToPlaylist:   (ids: string[]) => void;
  onBulkEditMany:        (ids: string[]) => void;
  onCutSong:          (song: Song) => void;
  onShareSong:        (song: Song) => void;
  onRemoveSong:       (song: Song) => void;
  /** Several picked songs to the bin. App asks first. */
  onBinMany:          (ids: string[]) => void;
  /** Whether a song is liked, for the long-press menu label. */
  isLiked:            (song: Song) => boolean;
  /** Optional light haptic on long-press. */
  onHaptic?:          () => void;
  /** Reports whether a playlist/smart-playlist DETAIL view is open, so App can
   *  block the horizontal page swipe there (it shouldn't jump back to Songs). */
  onDetailChange?:    (isDetail: boolean) => void;
  /** Bottom padding for detail lists so the floating player never covers the
   *  last few songs. */
  bottomInset?:       number;
  /** When true (App switched to the Songs tab), collapse any open detail view
   *  back to the playlist list — otherwise the page-swipe stays disabled. */
  resetToListSignal?: boolean;
  /** Incremented by App when Android's Back is pressed on the Playlists tab.
   *  Each bump pops exactly one level of this component's own navigation. */
  backSignal?: number;
  /** Reports this view's scroll offset so App can fold the floating header away
   *  on the Playlists tab exactly as it does on the Songs list. */
  onBodyScroll?:      (top: number) => void;
  /** Called just before this view moves its own scroll position to make up
   *  for the header folding or unfolding, so App does not read that scroll as
   *  the finger's and fold the header straight back (the flicker). */
  onInsetJump?:       () => void;
  /** Mirrors App's `chromeAnimate`: whether the fold is being animated right
   *  now, or jumped (the scroll-to-top button). The insets here have to follow
   *  the same rule as the Songs list or the two tabs fold differently. */
  animateInsets?:     boolean;
  /** The name of the playlist that is open, or null on the list. App shows
   *  it in its tabs: "Playlists › name". */
  onOpenName?:        (name: string | null) => void;
  /** Bumped when "Playlists" is tapped in App's tabs inside a playlist:
   *  straight back to the list. */
  listSignal?:        number;
  /** Called when the user backs out of the root "list" view — App treats this as "go to Songs page" */
  onClose:            () => void;
  T:                  T;
}

/** Shared icon tile: playlist list rows, the detail header, and the fallback
 *  when a playlist has no cover photo. Top level, so it keeps its identity
 *  across renders instead of being rebuilt as a new type each time. */
function PlaylistArt({ photo, size, iconSize, onClick, playing, T: t }: {
  photo?: string; size: number; iconSize?: number; onClick?: () => void;
  /** The music is playing from this playlist: "on" moves the bars, "paused"
   *  holds them still. Left out for every other playlist. */
  playing?: "on" | "paused";
  T: T;
}) {
  return (
    <div
      onClick={onClick}
      aria-label={playing ? tr("Playing from this playlist") : undefined}
      style={{
        position: "relative",
        width: size, height: size, borderRadius: size >= 80 ? 16 : 12, flexShrink: 0,
        background: photo ? `center/cover no-repeat url(${photo})` : t.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: onClick ? "pointer" : "default", overflow: "hidden",
        boxShadow: playing ? `0 0 0 2px ${t.accent}` : "none",
      }}
    >
      {playing && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PlayingBars size={size} color="#ffffff" still={playing === "paused"} />
        </div>
      )}
      {!photo && !playing && (
        <svg width={iconSize ?? 22} height={iconSize ?? 22} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      )}
    </div>
  );
}

// ─── Record sleeve ────────────────────────────────────────────────────────────
// The top of a playlist: its photo as a record sleeve, with the record half
// out of it. The record is the one picked under Personalise, with the photo on
// its label, and it turns while the music plays from this playlist. Playing,
// it also slides a little further out of the sleeve.
//
// Without a photo the sleeve shows `icon` (the note, or an auto playlist's own
// icon). `onPick` makes the sleeve a button for choosing the photo, with a
// camera badge on it; auto playlists have no photo to choose.
function RecordSleeve({ photo, icon, size, playing, spinning, onPick, T: t }: {
  photo?: string; icon: React.ReactNode; size: number;
  /** The music is playing from this playlist (paused or not). */
  playing: boolean;
  spinning: boolean;
  onPick?: () => void;
  T: T;
}) {
  const vinyl = useVinyl();
  const disc = Math.round(size * 0.94);
  return (
    <div style={{ position: "relative", width: size + disc / 2, height: size, margin: "0 auto" }}>
      <div style={{
        position: "absolute", top: (size - disc) / 2, left: size - disc / 2,
        transform: playing ? `translateX(${Math.round(size * 0.1)}px)` : "none",
        transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
      }}>
        <div data-disc>
          <SpinningDisc size={disc} spinning={spinning} customPhoto={photo} skin={vinyl} />
        </div>
      </div>
      <div
        data-sleeve
        onClick={onPick}
        role={onPick ? "button" : undefined}
        aria-label={onPick ? (photo ? tr("Change photo") : tr("Add photo")) : undefined}
        style={{
          position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: 14,
          background: photo ? `center/cover no-repeat url(${photo})` : t.dim,
          boxShadow: "0 12px 30px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.muted, cursor: onPick ? "pointer" : "default",
        }}
      >
        {!photo && icon}
        {onPick && (
          <span style={{
            position: "absolute", left: 10, bottom: 10, width: 30, height: 30, borderRadius: "50%",
            background: t.accent, color: t.playBtnFg, display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Add-songs sorting ────────────────────────────────────────────────────────
// The "Add songs" picker used to be search-only, in library order, which made
// finding anything in a large library a scroll. These mirror the Songs page's
// own sort options so the two lists can be reasoned about the same way.
type AddSortId = "newest" | "oldest" | "alphabetical" | "artist" | "favorites";
const ADD_SORTS: { id: AddSortId; label: string }[] = [
  { id: "newest",       label: "Newest"    },
  { id: "oldest",       label: "Oldest"    },
  { id: "alphabetical", label: "A-Z"       },
  { id: "artist",       label: "Artist"    },
  { id: "favorites",    label: "Favorites" },
];

// ─── Smart playlist card styling ───────────────────────────────────────────────
// Mapped by id (not name) so a renamed SmartPlaylist still gets the right icon.

type SmartCardStyle = {
  icon: (size: number) => React.ReactNode;
};

// These four cards used to be coloured gradients (rose, violet, orange, sky).
// Per the brand system in Branding/README.md, MPTree is black and white and
// colour is reserved for functional state, so the cards are now plain surfaces
// and the ICON is what tells them apart. Every icon paints with currentColor
// so it follows the theme.
const SMART_CARD_STYLES: Record<SmartPlaylistId, SmartCardStyle> = {
  favorites: {
    // The same heart as everywhere else. This card used to draw its own,
    // fuller one, so the Favourites card and the mark on a liked song were
    // two different silhouettes.
    icon: (size) => <IC.Heart filled={true} size={size} />,
  },
  recentlyPlayed: {
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>
      </svg>
    ),
  },
  mostPlayed: {
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>
      </svg>
    ),
  },
  lastAdded: {
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    ),
  },
};

// Defensive fallback, only reached if a SmartPlaylist with an unrecognized
// id ever shows up (shouldn't happen given SmartPlaylistId, but keeps this
// component from rendering a blank/broken card if that ever changes).
const FALLBACK_SMART_STYLE: SmartCardStyle = {
  icon: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  ),
};

// ─── PlaylistsView ────────────────────────────────────────────────────────────
// NOTE: this component no longer owns its own fixed-position full-screen
// overlay. It's rendered inside a sliding panel (see App.tsx) that handles
// positioning, the slide transform, and swipe gestures. This component only
// needs to fill 100% of that panel and manage its own internal navigation
// between the list / detail / smartDetail / addSongs sub-views.

export const PlaylistsView: React.FC<Props> = ({
  topInset = 0,
  rowH = 68,
  playlists, smartPlaylists, songs, meta, onPlaylistsChange, onPlayPlaylist,
  onPlaySong, playingFrom = null, currentSongId, isPlaying = false, onToggleLike, onPlayNext,
  onEditSong, onChangePhoto, onSetRingtone, onEditLyrics, onCutSong, onShareSong, onRemoveSong, onBinMany,
  onLikeMany, onShuffleMany, onPlayManyNext, onShareMany, onSelectingChange, onAddManyToPlaylist, onBulkEditMany,
  isLiked, onHaptic, onDetailChange, bottomInset = 0, resetToListSignal, backSignal = 0,
  onBodyScroll, onInsetJump, animateInsets = true, onOpenName, listSignal = 0, onClose, T,
}) => {
  const [view,            setView]           = useState<View>("list");
  // NOTE: the effect that reports our depth to App lives further down, after
  // every piece of state it reads has been declared — a dependency array is
  // evaluated during render, so it cannot sit above those declarations.
  const [activeId,        setActiveId]       = useState<string | null>(null);
  const [activeSmartId,   setActiveSmartId]  = useState<SmartPlaylistId | null>(null);

  // When App switches to the Songs tab while a detail view is open, collapse
  // back to the playlist list. Without this the detail stays "open" in the
  // background, keeping the page-swipe disabled even on the Songs page.
  useEffect(() => {
    if (resetToListSignal) {
      setView("list");
      setActiveId(null);
      setActiveSmartId(null);
      setMenuSong(null);
      setReordering(false);
    }
  }, [resetToListSignal]);
  const [creating,        setCreating]       = useState(false);
  const [newName,         setNewName]        = useState("");
  const [renamingId,      setRenamingId]     = useState<string | null>(null);
  const [renameDraft,     setRenameDraft]    = useState("");
  const [confirmDeleteId, setConfirmDeleteId]= useState<string | null>(null);
  // Moving playlists: on from "Reorder", or by holding a playlist. Each row
  // then has a handle; dragging it moves the playlist, and the order is kept.
  const [reordering,      setReordering]     = useState(false);
  const [plDrag,          setPlDrag]         = useState<{ from: number; over: number } | null>(null);
  const plRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const plPress   = useRef<{ timer: ReturnType<typeof setTimeout> | null; x: number; y: number; held: boolean }>({ timer: null, x: 0, y: 0, held: false });
  const [selectedAdd,     setSelectedAdd]    = useState<Set<string>>(new Set());
  const [addSearch,       setAddSearch]      = useState("");
  const [addSort,         setAddSort]        = useState<AddSortId>("newest");

  const coverInputRef = useRef<HTMLInputElement>(null);

  // Long-press action menu: which song is open, plus the list it belongs to
  // (so its actions like "remove from playlist" know the context).
  const [menuSong, setMenuSong] = useState<{ song: Song; inPlaylist: boolean } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartX = useRef(0);
  const pressStartY = useRef(0);
  const longPressed = useRef(false);
  // A finger is followed by mouse events the browser makes up for it. Those
  // would restart the press and let the click after a long press toggle a row
  // (another one, once the page has moved up for the selection bar).
  const lastTouchAt = useRef(0);
  // The scrollable body + the currently-playing row, so we can (a) cancel a
  // pending long-press the instant the list scrolls — touching a momentum
  // scroll to stop it used to register as a long-press and open select/edit —
  // and (b) scroll the playing song into view.
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLDivElement>(null);
  const cancelPress = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);

  // ── Opening the "new playlist" field ──────────────────────────────────────
  // The field lives at the top of the scrolled content, which in the list view
  // is the one place it can be seen: the list view carries no top padding on
  // purpose, so anything outside the scroller lands underneath the floating
  // header card and the status bar, where this field used to be invisible.
  // Sending the body back to the top guarantees it is on screen whatever the
  // list was doing, and also brings the header back down through App's
  // "at the top, show the chrome" rule, so the layout is where it expects.
  //
  // The focus is taken by hand with preventScroll rather than with autoFocus.
  // Focusing an element the browser thinks is off screen makes it scroll every
  // ancestor that can scroll until the element is visible, and one of those is
  // the swipeable page area: overflow:hidden does not stop a programmatic
  // scroll. Opening this field mid-swipe therefore shoved both pages sideways by
  // a few hundred pixels and left them there, since nothing else ever touches
  // that element's scrollLeft.
  const createInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!creating) return;
    createInputRef.current?.focus({ preventScroll: true });
  }, [creating]);
  // Only ever over the list: opening anything closes it.
  useEffect(() => { if (view !== "list") setCreating(false); }, [view]);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);

  // ── Multi-select (playlist detail only) ─────────────────────────────────────
  // Long-pressing a row enters select mode; tapping rows toggles them; a bottom
  // bar removes all selected songs from the playlist at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const exitSelect = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, [setSelectMode, setSelectedIds]);
  useEffect(() => { onSelectingChange?.(selectMode); }, [selectMode, onSelectingChange]);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [setSelectedIds]);
  // Leaving the detail view (or App switching to Songs) cancels selection.
  useEffect(() => { if (view === "list") exitSelect(); }, [view, exitSelect]);

  // Scroll the currently-playing song into view when it changes (or when a
  // detail view opens on the song that is already playing). Small delay so the
  // row has mounted first.
  useEffect(() => {
    if (view !== "detail" && view !== "smartDetail") return;
    if (!currentSongId) return;
    const open = view === "detail" ? `pl:${activeId}` : `smart:${activeSmartId}`;
    if (playingFrom !== open) return;
    const t = setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [currentSongId, view, playingFrom, activeId, activeSmartId]);
  useEffect(() => { if (resetToListSignal) exitSelect(); }, [resetToListSignal, exitSelect]);

  // ── Depth reporting ───────────────────────────────────────────────────────
  // True whenever we have something of our own to back out of. App uses this
  // twice: to disable the horizontal page swipe (swiping inside a playlist
  // should not jump back to Songs), and to decide whether Android's Back
  // belongs to us or should leave the tab.
  const canPop = view !== "list" || selectMode || !!menuSong
    || creating || !!renamingId || !!confirmDeleteId || confirmRemovePhoto || reordering;
  useEffect(() => { onDetailChange?.(canPop); }, [canPop, onDetailChange]);

  // ── Android Back, delegated from App ──────────────────────────────────────
  // Pops exactly one level per bump, topmost first. The first render is not a
  // bump, hence seeding the ref with the incoming value.
  const lastBackSignalRef = useRef(backSignal);
  useEffect(() => {
    if (backSignal === lastBackSignalRef.current) return;
    lastBackSignalRef.current = backSignal;
    if (menuSong)         { setMenuSong(null); return; }
    if (reordering)       { setReordering(false); return; }
    if (confirmDeleteId)  { setConfirmDeleteId(null); return; }
    if (confirmRemovePhoto) { setConfirmRemovePhoto(false); return; }
    if (renamingId)       { setRenamingId(null); return; }
    if (creating)         { setCreating(false); return; }
    if (selectMode)       { exitSelect(); return; }
    if (view === "addSongs") { setView("detail"); return; }
    if (view !== "list")  { setView("list"); setActiveId(null); setActiveSmartId(null); return; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backSignal]);

  // ── Moving playlists ──────────────────────────────────────────────────────
  // Holding a playlist turns moving on, the same as the Reorder button. Any
  // movement first cancels the hold, so a scroll or a page swipe never does.
  const plPressStart = (x: number, y: number) => {
    if (reordering) return;
    const p = plPress.current;
    p.x = x; p.y = y; p.held = false;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => { p.timer = null; p.held = true; onHaptic?.(); setReordering(true); }, 500);
  };
  const plPressMove = (x: number, y: number) => {
    const p = plPress.current;
    if (p.timer && (Math.abs(x - p.x) > 8 || Math.abs(y - p.y) > 8)) { clearTimeout(p.timer); p.timer = null; }
  };
  const plPressEnd = () => {
    const p = plPress.current;
    if (p.timer) { clearTimeout(p.timer); p.timer = null; }
  };
  const plDragMove = (e: React.TouchEvent) => {
    if (!plDrag) return;
    e.stopPropagation();
    const y = e.touches[0].clientY;
    for (let j = 0; j < playlists.length; j++) {
      const el = plRowRefs.current[j];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) { if (j !== plDrag.over) setPlDrag({ ...plDrag, over: j }); break; }
    }
  };
  const plDragEnd = (e: React.TouchEvent) => {
    if (!plDrag) return;
    e.stopPropagation();
    const { from, over } = plDrag;
    setPlDrag(null);
    if (from === over) return;
    const next = [...playlists];
    const [moved] = next.splice(from, 1);
    next.splice(over, 0, moved);
    onPlaylistsChange(next);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const dispName   = (s: Song) => meta[s.id]?.customName   || s.title;
  const dispArtist = (s: Song) => meta[s.id]?.customArtist || (!isMissingArtist(s.artist) ? s.artist : "");
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };

  // ── Tappable / long-pressable song row ─────────────────────────────────────
  // Shared by the playlist detail and smart-playlist detail lists. Tap plays
  // the song within its list; long-press opens an action menu.
  // Deliberately a render function, NOT a component.
  //
  // Declared inside the parent, a component is a brand new type on every render,
  // so React unmounts and rebuilds every row rather than updating it. With the
  // position ticker firing twice a second that happened constantly: the playing
  // bars restarted mid-animation (the glitch), and each row's artwork lost its
  // cover lookup and its accent border along with it.
  //
  // Called as a function, the JSX it returns simply becomes part of this
  // component's tree and reconciles by key like any other element.
  const renderSongRow = ({ song, list, inPlaylist }: { song: Song; idx: number; list: Song[]; inPlaylist: boolean }) => {
    const source = inPlaylist ? `pl:${activeId}` : `smart:${activeSmartId}`;
    // Marked only in the list it is playing from.
    const isCurrent = currentSongId === song.id && playingFrom === source;
    const isSelected = selectedIds.has(song.id);
    const startPress = (x: number, y: number) => {
      pressStartX.current = x;
      pressStartY.current = y;
      longPressed.current = false;
      // Long-press starts multi-select, matching the Songs page. Per-song
      // actions live on the "⋮" button now. Smart playlists are read-only, so
      // there is nothing to select there and the press does nothing.
      if (!inPlaylist) return;
      pressTimer.current = setTimeout(() => {
        longPressed.current = true;
        onHaptic?.();
        setSelectMode(true);
        setSelectedIds(prev => new Set(prev).add(song.id));
      }, 500);
    };
    // Any movement — X included — kills the timer, so horizontal page swipes
    // passing over a row can never trigger its long-press.
    const movePress = (x: number, y: number) => {
      if ((Math.abs(y - pressStartY.current) > 8 || Math.abs(x - pressStartX.current) > 8) && pressTimer.current) {
        clearTimeout(pressTimer.current); pressTimer.current = null;
      }
    };
    const endPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };

    const handleClick = () => {
      if (longPressed.current) return;
      // While selecting, a tap toggles the row instead of playing it.
      if (selectMode && inPlaylist) { toggleSelect(song.id); return; }
      onPlaySong(song, list, source);
    };

    return (
      <div
        ref={isCurrent ? currentRowRef : undefined}
        onClick={handleClick}
        onTouchStart={e => { lastTouchAt.current = Date.now(); startPress(e.touches[0].clientX, e.touches[0].clientY); }}
        onTouchMove={e => movePress(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onMouseDown={e => { if (Date.now() - lastTouchAt.current > 1500) startPress(e.clientX, e.clientY); }}
        onMouseMove={e => movePress(e.clientX, e.clientY)}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        style={{
          display: "flex", alignItems: "center",
          padding: "0 8px", margin: "0 8px", gap: 10, cursor: "pointer",
          height: rowH, boxSizing: "border-box",
          // The playing row is a rounded tile, as on the Songs page.
          borderRadius: 14,
          background: isSelected ? t.violet + "18" : isCurrent ? t.card : "transparent",
          boxShadow: isSelected ? `inset 0 0 0 1.5px ${t.violet}55` : isCurrent ? `inset 0 0 0 1px ${t.border}` : "none",
          transition: "background 0.15s, box-shadow 0.15s",
        }}
      >
        <AlbumArt title={dispName(song)} size={rowH - 20} active={isCurrent} playing={isCurrent && isPlaying} customPhoto={meta[song.id]?.customPhoto} songPath={song.uri} albumId={song.albumId} T={t} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isCurrent ? t.accent : t.text }}>{dispName(song)}</span>
            {song.isCut && <span style={{ fontSize: 10, background: t.dim, color: t.textSub, borderRadius: 4, padding: "1px 5px", fontWeight: 700, flexShrink: 0 }}>CUT</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 2, gap: 6 }}>
            {/* Track number — hidden for now (kept for future use):
            <span style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? t.accent : t.muted, flexShrink: 0 }}>{idx + 1}</span>
            */}
            <span style={{ flex: 1, fontSize: 13, color: t.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispArtist(song)}</span>
            {song.duration != null && song.duration > 0 && (
              <span style={{ fontSize: 12, color: t.muted, flexShrink: 0 }}>{fmt(song.duration)}</span>
            )}
          </div>
        </div>
        {/* This used to be a hand-drawn heart with a different path from the one
            in Icons.tsx, so the same "liked" mark had two shapes depending on
            which screen you were looking at. One icon now. */}
        {isLiked(song) && !inPlaylist && (
          <span style={{ display: "flex", flexShrink: 0, color: t.accent }}>
            <IC.Heart filled={true} size={16} />
          </span>
        )}
        {!selectMode && (
          <button
            onClick={e => { e.stopPropagation(); setMenuSong({ song, inPlaylist }); }}
            onTouchStart={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            aria-label={tr("More options for {name}", { name: dispName(song) })}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 2px 6px 6px", display: "flex", flexShrink: 0, color: t.muted }}
          >
            <IC.Dots />
          </button>
        )}
        {selectMode && inPlaylist && <span style={{ display: "flex", padding: "0 4px 0 6px" }}><SelectCheck on={isSelected} T={t} /></span>}
      </div>
    );
  };

  const activePlaylist = useMemo(
    () => playlists.find(p => p.id === activeId) ?? null,
    [playlists, activeId]
  );

  const activeSmartPlaylist = useMemo(
    () => smartPlaylists.find(p => p.id === activeSmartId) ?? null,
    [smartPlaylists, activeSmartId]
  );

  const playlistSongs = useMemo(() => {
    if (!activePlaylist) return [];
    return activePlaylist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter((s): s is Song => !!s);
  }, [activePlaylist, songs]);

  const smartPlaylistSongs = useMemo(() => {
    if (!activeSmartPlaylist) return [];
    return activeSmartPlaylist.songIds
      .map(id => songs.find(s => s.id === id))
      .filter((s): s is Song => !!s);
  }, [activeSmartPlaylist, songs]);

  // What "Select all" covers: whichever detail list is open. Smart playlists are
  // computed, so songs cannot be pulled out of one, but every other action in
  // the bar still applies to them.
  // What App's tabs say inside a playlist.
  const openName = view === "smartDetail" ? activeSmartPlaylist?.name ?? null
    : view === "detail" || view === "addSongs" ? activePlaylist?.name ?? null
    : null;
  useEffect(() => { onOpenName?.(openName); }, [openName, onOpenName]);

  const selectableIds = useMemo(
    () => (activePlaylist ? playlistSongs : smartPlaylistSongs).map(s => s.id),
    [activePlaylist, playlistSongs, smartPlaylistSongs],
  );

  const filteredAddSongs = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    const matched = q
      ? songs.filter(s => dispName(s).toLowerCase().includes(q) || dispArtist(s).toLowerCase().includes(q))
      : songs;
    const sorted = [...matched].sort((a, b) => {
      if (addSort === "oldest")       return (a.dateAdded || 0) - (b.dateAdded || 0);
      if (addSort === "alphabetical") return dispName(a).localeCompare(dispName(b));
      if (addSort === "artist")       return (dispArtist(a) || "zzz").localeCompare(dispArtist(b) || "zzz");
      return (b.dateAdded || 0) - (a.dateAdded || 0); // newest, and the base order for favorites
    });
    // "Favorites" is a float-to-top rather than a filter, matching the Songs
    // page: you still see everything, the liked tracks just come first.
    return addSort === "favorites"
      ? [...sorted.filter(isLiked), ...sorted.filter(s => !isLiked(s))]
      : sorted;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, meta, addSearch, addSort]);

  /** The rows in the picker that can actually be ticked (not already added). */
  const addSelectableIds = useMemo(
    () => filteredAddSongs.filter(s => !(activePlaylist?.songIds ?? []).includes(s.id)).map(s => s.id),
    [filteredAddSongs, activePlaylist],
  );
  const allAddSelected = addSelectableIds.length > 0 && addSelectableIds.every(id => selectedAdd.has(id));

  const inPlaylistSet = useMemo(
    () => new Set(activePlaylist?.songIds ?? []),
    [activePlaylist]
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  // Back button always steps inward→outward through the sub-views first;
  // only once we're already at the root "list" view does it hand control
  // back to App (which slides the whole panel away to the Songs page).
  const goBack = useCallback(() => {
    // If we're picking songs, the back arrow cancels selection first.
    if (selectMode) { exitSelect(); return; }
    if (view === "addSongs") {
      setSelectedAdd(new Set());
      setAddSearch("");
      setView("detail");
    } else if (view === "detail") {
      setActiveId(null);
      setView("list");
    } else if (view === "smartDetail") {
      setActiveSmartId(null);
      setView("list");
    } else {
      onClose();
    }
  }, [view, onClose, selectMode, exitSelect]);

  /** Straight to the list of playlists, from however deep: App's
   *  "Playlists" tab inside a playlist, and a playlist swiped away. */
  const leaveToList = () => {
    exitSelect(); setMenuSong(null); setRenamingId(null); setCreating(false);
    setSelectedAdd(new Set()); setAddSearch("");
    setActiveId(null); setActiveSmartId(null); setView("list");
  };
  const lastListSignal = useRef(listSignal);
  useEffect(() => {
    if (listSignal === lastListSignal.current) return;
    lastListSignal.current = listSignal;
    leaveToList();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSignal]);

  // ── Playlist CRUD ─────────────────────────────────────────────────────────
  const createPlaylist = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    const newPl: Playlist = {
      id:        Date.now().toString(),
      name,
      songIds:   [],
      createdAt: Date.now(),
    };
    onPlaylistsChange([...playlists, newPl]);
    setNewName("");
    setCreating(false);
    // Straight into it: the next thing anyone does with a new playlist is
    // put songs in it, and "+ Add" is on its card.
    openFreshRef.current = true;
    setActiveId(newPl.id);
    setView("detail");
  }, [newName, playlists, onPlaylistsChange]);

  const confirmRename = useCallback(() => {
    const name = renameDraft.trim();
    if (!name || !renamingId) { setRenamingId(null); return; }
    onPlaylistsChange(playlists.map(p =>
      p.id === renamingId ? { ...p, name } : p
    ));
    setRenamingId(null);
  }, [renameDraft, renamingId, playlists, onPlaylistsChange]);

  const deletePlaylist = useCallback((id: string) => {
    onPlaylistsChange(playlists.filter(p => p.id !== id));
    if (activeId === id) { setView("list"); setActiveId(null); }
    setConfirmDeleteId(null);
  }, [playlists, activeId, onPlaylistsChange]);

  /** "Add to playlist" from a row's ⋮ menu. Silently ignores duplicates. */
  const addSongToPlaylist = useCallback((playlistId: string, songId: string) => {
    onPlaylistsChange(playlists.map(p =>
      p.id === playlistId && !p.songIds.includes(songId)
        ? { ...p, songIds: [...p.songIds, songId] }
        : p
    ));
  }, [playlists, onPlaylistsChange]);

  /** "New playlist" from a row's ⋮ menu — starts with just this song. */
  const createPlaylistWithSong = useCallback((name: string, songId: string) => {
    onPlaylistsChange([...playlists, {
      id:        Date.now().toString(),
      name,
      songIds:   [songId],
      createdAt: Date.now(),
    }]);
  }, [playlists, onPlaylistsChange]);

  const removeFromPlaylist = useCallback((songId: string) => {
    if (!activePlaylist) return;
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id
        ? { ...p, songIds: p.songIds.filter(id => id !== songId) }
        : p
    ));
  }, [activePlaylist, playlists, onPlaylistsChange]);

  const removeManyFromPlaylist = useCallback((ids: Set<string>) => {
    if (!activePlaylist || ids.size === 0) return;
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id
        ? { ...p, songIds: p.songIds.filter(id => !ids.has(id)) }
        : p
    ));
  }, [activePlaylist, playlists, onPlaylistsChange]);

  const addSelectedSongs = useCallback(() => {
    if (!activePlaylist) return;
    const existing = new Set(activePlaylist.songIds);
    const toAdd = [...selectedAdd].filter(id => !existing.has(id));
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id
        ? { ...p, songIds: [...p.songIds, ...toAdd] }
        : p
    ));
    setSelectedAdd(new Set());
    setAddSearch("");
    setView("detail");
  }, [activePlaylist, selectedAdd, playlists, onPlaylistsChange]);

  const toggleAddSelection = useCallback((songId: string) => {
    setSelectedAdd(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId); else next.add(songId);
      return next;
    });
  }, []);

  // ── Cover photo ───────────────────────────────────────────────────────────
  // The picked photo waits here until it has been cropped.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const pickCoverPhoto = useCallback(() => {
    coverInputRef.current?.click();
  }, []);

  const onCoverFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !activePlaylist) return;
    readCoverPhoto(file, CROP_SOURCE_PX).then(setCropSrc).catch(() => {});
  }, [activePlaylist]);

  const keepCroppedCover = (dataUrl: string) => {
    setCropSrc(null);
    if (!activePlaylist) return;
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id ? { ...p, coverPhoto: dataUrl } : p
    ));
  };

  const removeCoverPhoto = useCallback(() => {
    if (!activePlaylist) return;
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id ? { ...p, coverPhoto: undefined } : p
    ));
  }, [activePlaylist, playlists, onPlaylistsChange]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const t = T;


  // The floating header's height, applied as a spacer INSIDE the scroller on
  // the list and in a playlist, and as padding OUTSIDE it in the add-songs
  // picker.
  //
  // It used to always be padding on this root element, which meant it could
  // never scroll away: folding the header on the Playlists tab left a band of
  // dead black across the top of the screen, where the Songs tab simply lets
  // its rows slide up under the collapsed logo. A playlist's card scrolls with
  // its songs, so it goes inside too. Only the add-songs picker keeps a sticky
  // header row (its search), which has to stay put below the floating card.
  const sticky       = view === "addSongs";
  const insetOutside = sticky ? topInset : 0;
  const insetInside  = sticky ? 0 : topInset;
  // One motion for everything the fold moves, matching CHROME_MOTION in App.
  // The root padding used to have no transition at all, so in a playlist the
  // whole view snapped to its new offset while the logo was still folding: that
  // was the glitchy jump. Spacers animate height, the root animates padding,
  // both on the same curve as the header itself.
  const FOLD_MOTION = "0.34s cubic-bezier(0.22, 1, 0.36, 1)";
  const insetTransition = animateInsets ? `height ${FOLD_MOTION}` : "none";
  // Scrolled down, the fold does not move the rows: the spacer changes at once
  // and the scroll position makes up for it. App is told first. That scroll is
  // the app's own, and read as the finger's it was a drag of the full fold:
  // unfolding folded the header again, which unfolded it again, and the screen
  // flickered between the two.
  const [bodyScrolled, setBodyScrolled] = useState(false);
  const prevInside = useRef(insetInside);
  useLayoutEffect(() => {
    const el = scrollBodyRef.current;
    const delta = insetInside - prevInside.current;
    prevInside.current = insetInside;
    if (!el || !delta || sticky || el.scrollTop <= 0) return;
    onInsetJump?.();
    el.scrollTop += delta;
  }, [insetInside, sticky, onInsetJump]);
  // Each view starts at its top. They share one scroller, so a playlist
  // opened from far down the list used to open scrolled down as far.
  useLayoutEffect(() => {
    const el = scrollBodyRef.current;
    if (el && el.scrollTop > 0) el.scrollTop = 0;
  }, [view, activeId, activeSmartId]);
  const rootTransition  = animateInsets ? `padding-top ${FOLD_MOTION}` : "none";

  // ── Opening a playlist ────────────────────────────────────────────────────
  // The card grows out of what was tapped (a playlist's row, an auto
  // playlist's card): drawn where it ends up, clipped to where the row was,
  // and the clip opens. The row's cover flies to the sleeve, the record
  // slides out of it, and the songs come up one after another. Measured here
  // and played with the Web Animations API, so none of it re-renders.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openFromRef = useRef<{ box: DOMRect; thumb: DOMRect | null } | null>(null);
  /** A playlist just made: there is no row yet, so its card comes up instead. */
  const openFreshRef = useRef(false);
  const openFrom = (row: Element, thumb?: Element | null) => {
    openFromRef.current = { box: row.getBoundingClientRect(), thumb: thumb?.getBoundingClientRect() ?? null };
  };
  useLayoutEffect(() => {
    const from = openFromRef.current;
    const fresh = openFreshRef.current;
    openFromRef.current = null;
    openFreshRef.current = false;
    const card = cardRef.current;
    if ((!from && !fresh) || !card || (view !== "detail" && view !== "smartDetail")) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
    if (!from) {
      card.animate([{ opacity: 0, transform: "translateY(28px) scale(0.97)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: ease });
      const d = card.querySelector<HTMLElement>("[data-disc]");
      if (d) d.animate([{ transform: `translateX(-${Math.round(d.offsetWidth / 2)}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, delay: 260, easing: ease, fill: "backwards" });
      return;
    }
    const c = card.getBoundingClientRect();
    const top = Math.min(Math.max(0, from.box.top - c.top), c.height - 48);
    const bottom = Math.max(0, c.bottom - from.box.bottom);
    const left = Math.max(0, from.box.left - c.left);
    const right = Math.max(0, c.right - from.box.right);
    card.animate(
      [{ clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 14px)` }, { clipPath: "inset(0px 0px 0px 0px round 26px)" }],
      { duration: 420, easing: ease },
    );
    for (const el of Array.from(card.children) as HTMLElement[]) {
      if (el.querySelector("[data-sleeve]")) continue;
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 140, easing: "ease", fill: "backwards" });
    }
    const sleeve = card.querySelector<HTMLElement>("[data-sleeve]");
    if (sleeve && from.thumb && from.thumb.width > 0) {
      const sb = sleeve.getBoundingClientRect();
      const k = from.thumb.width / sb.width;
      sleeve.animate([
        { transform: `translate(${from.thumb.left - sb.left}px, ${from.thumb.top - sb.top}px) scale(${k})`, transformOrigin: "0 0" },
        { transform: "none", transformOrigin: "0 0" },
      ], { duration: 420, easing: ease });
    } else if (sleeve) {
      sleeve.animate([{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 80, easing: ease, fill: "backwards" });
    }
    const disc = card.querySelector<HTMLElement>("[data-disc]");
    if (disc) disc.animate(
      [{ transform: `translateX(-${Math.round(disc.offsetWidth / 2)}px)`, opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 420, delay: 300, easing: ease, fill: "backwards" },
    );
    let row = card.nextElementSibling as HTMLElement | null;
    for (let i = 0; row && i < 10; i++, row = row.nextElementSibling as HTMLElement | null) {
      row.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 340, delay: 180 + i * 35, easing: ease, fill: "backwards" });
    }
  }, [view, activeId, activeSmartId]);

  // ── Swiping a playlist away ───────────────────────────────────────────────
  // In a playlist a drag to the right takes it off to the right and the list
  // of playlists comes back from under it, the way App's page swipe goes
  // between Songs and Playlists. While it is dragged the list is drawn behind
  // it, still and untouchable, so there is something under the finger.
  const [swipeX, setSwipeX] = useState(0);
  const [swipeAnim, setSwipeAnim] = useState(false);
  const swipeRef = useRef<{ x: number; y: number; t: number; lock: "h" | "v" | null } | null>(null);
  const canSwipeBack = (view === "detail" || view === "smartDetail") && !selectMode && !menuSong && !renamingId && !confirmDeleteId;
  const onSwipeStart = (e: React.TouchEvent) => {
    if (!canSwipeBack || swipeAnim) return;
    const p = e.touches[0];
    swipeRef.current = { x: p.clientX, y: p.clientY, t: Date.now(), lock: null };
  };
  const onSwipeMove = (e: React.TouchEvent) => {
    const g = swipeRef.current;
    if (!g) return;
    const p = e.touches[0];
    const dx = p.clientX - g.x, dy = p.clientY - g.y;
    if (!g.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.lock = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.3 ? "h" : "v";
      if (g.lock === "h") cancelPress();
    }
    if (g.lock === "h") setSwipeX(Math.max(0, dx));
  };
  const onSwipeEnd = () => {
    const g = swipeRef.current;
    swipeRef.current = null;
    if (!g || g.lock !== "h") return;
    const w = window.innerWidth;
    const fast = swipeX / Math.max(1, Date.now() - g.t) > 0.5;
    setSwipeAnim(true);
    if (swipeX > w * 0.3 || (fast && swipeX > 40)) {
      setSwipeX(w);
      setTimeout(() => { leaveToList(); setSwipeX(0); setSwipeAnim(false); }, 230);
    } else {
      setSwipeX(0);
      setTimeout(() => setSwipeAnim(false), 230);
    }
  };
  const vw = typeof window !== "undefined" ? window.innerWidth : 400;
  const swipeMotion = swipeAnim ? "0.23s cubic-bezier(0.22, 1, 0.36, 1)" : "0s";

  // ── The playlist's card ───────────────────────────────────────────────────
  // Everything above the songs in one card: the way back, the sleeve with its
  // record, the name, how many songs, Play all and Shuffle, and for a playlist
  // of your own, adding songs and deleting it. App's header (logo, tabs,
  // settings) floats above it on its own. The card scrolls away with the
  // songs. A render function rather than a component, like renderSongRow.
  const roundBtn: React.CSSProperties = {
    width: 38, height: 38, borderRadius: "50%", border: "none", background: t.dim, color: t.text,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
  };
  const renderCard = ({ source, name, photo, icon, list, own }: {
    source: string; name: string; photo?: string; icon: React.ReactNode; list: Song[];
    /** A playlist of your own: a photo to pick, a name to change, songs to add, and delete. */
    own: boolean;
  }) => {
    const here = playingFrom === source;
    const empty = list.length === 0;
    const bigBtn = (primary: boolean): React.CSSProperties => ({
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      height: 48, borderRadius: 16, fontSize: 15, fontWeight: 700, fontFamily: "inherit",
      background: primary ? t.accent : "transparent", color: primary ? t.playBtnFg : t.text,
      border: primary ? "none" : `1.5px solid ${t.border}`,
      cursor: empty ? "default" : "pointer", opacity: empty ? 0.4 : 1,
    });
    return (
      <div ref={cardRef} style={{
        margin: "4px 12px 8px", padding: "12px 14px 16px", borderRadius: 26,
        background: t.card, border: `1px solid ${t.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={goBack} aria-label={tr("Back")} style={roundBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ flex: 1 }} />
          {own && (
            <>
              <button
                onClick={() => { setSelectedAdd(new Set()); setAddSearch(""); setView("addSongs"); }}
                style={{ ...roundBtn, width: "auto", borderRadius: 19, padding: "0 14px", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit" }}
              >
                {tr("+ Add")}
              </button>
              <button onClick={() => setConfirmDeleteId(activeId)} aria-label={tr("Delete")} style={{ ...roundBtn, color: "#e8445a" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <RecordSleeve
            photo={photo} icon={icon} size={148} T={t}
            playing={here} spinning={here && isPlaying}
            onPick={own ? pickCoverPhoto : undefined}
          />
        </div>

        <div style={{ textAlign: "center", marginTop: 18, padding: "0 6px" }}>
          {own && renamingId === activeId ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null); }}
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", background: "transparent", border: "none", borderBottom: `1.5px solid ${t.accent}`, color: t.text, fontSize: 22, fontWeight: 800, outline: "none", padding: "2px 0", fontFamily: "inherit" }}
            />
          ) : (
            <div
              onClick={own ? () => { setRenamingId(activeId); setRenameDraft(name); } : undefined}
              style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: "-0.01em", color: t.text, overflowWrap: "anywhere", cursor: own ? "text" : "default" }}
            >
              {name}
            </div>
          )}
          <div style={{ fontSize: 13, color: t.muted, marginTop: 5, display: "flex", justifyContent: "center", gap: 8 }}>
            <span>{tn(list.length, "{n} song", "{n} songs")}</span>
            {own && photo && (
              <button onClick={() => setConfirmRemovePhoto(true)} style={{ background: "none", border: "none", padding: 0, color: t.muted, fontSize: 13, fontWeight: 600, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                {tr("Remove photo")}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => { if (!empty) onPlayPlaylist(list, false, source); }} disabled={empty} style={bigBtn(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            {tr("Play All")}
          </button>
          <button onClick={() => { if (!empty) onPlayPlaylist(list, true, source); }} disabled={empty} style={bigBtn(false)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
            </svg>
            {tr("Shuffle")}
          </button>
        </div>
      </div>
    );
  };
  const noteIcon = (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );

  // The list of playlists. A function so it can also be drawn, still and
  // untouchable, behind a playlist being swiped away (`ghost`).
  const renderList = (ghost: boolean) => (
    <>
            {/* Auto playlists: always there, read-only, a 2×2 grid of cards.
                No heading and no row of buttons above them any more: the
                cards say what they are, Songs is a tap or a swipe away, and
                making a playlist sits with My playlists, where it lands. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px 8px" }}>
              {smartPlaylists.map(sp => {
                const count = sp.songIds.length;
                const cardStyle = SMART_CARD_STYLES[sp.id] ?? FALLBACK_SMART_STYLE;
                const playingHere = playingFrom === `smart:${sp.id}`;
                return (
                  <div
                    key={sp.id}
                    onClick={e => { openFrom(e.currentTarget); setActiveSmartId(sp.id); setView("smartDetail"); }}
                    style={{
                      position: "relative", height: 160, borderRadius: 16, padding: 16,
                      background: t.card, border: `1px solid ${playingHere ? t.accent : t.border}`,
                      color: t.text,
                      display: "flex", flexDirection: "column", justifyContent: "space-between",
                      cursor: "pointer", overflow: "hidden",
                    }}
                  >
                    {/* The icon is what distinguishes each card now that they
                        no longer carry a colour. */}
                    <div style={{ position: "absolute", top: 14, right: 14, opacity: 0.16, lineHeight: 0 }}>
                      {cardStyle.icon(64)}
                    </div>

                    <div style={{ position: "relative", fontSize: 16, fontWeight: 700, color: t.text, paddingRight: 46, lineHeight: 1.25 }}>
                      {sp.name}
                    </div>
                    <div style={{ position: "relative", fontSize: 12, fontWeight: 500, color: t.muted }}>
                      {tn(count, "{n} song", "{n} songs")}
                    </div>
                    {/* Playing from here: the same bars a playlist cover gets. */}
                    {playingHere && (
                      <div aria-label={tr("Playing from this playlist")} style={{
                        position: "absolute", right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17,
                        background: t.accent, display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <PlayingBars size={34} color={t.playBtnFg} still={!isPlaying} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* User playlists */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 16px 4px" }}>
              <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {tr("My playlists ({n})", { n: playlists.length })}
              </span>
              {/* Making a playlist, where Reorder used to be. Moving them is
                  still a hold on a playlist; while that is on, this is Done. */}
              <button
                onClick={() => {
                  if (reordering) { onHaptic?.(); setReordering(false); return; }
                  setCreating(true); setNewName("");
                }}
                style={{
                  background: t.accent, color: t.playBtnFg, border: "none", borderRadius: 16, padding: "6px 14px",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", flexShrink: 0,
                }}
              >
                {reordering ? tr("Done") : tr("+ New playlist")}
              </button>
            </div>
            {playlists.length === 0 && !creating ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px 60px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tr("No playlists yet")}</div>
                <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>{tr("Tap \"+ New playlist\" to make your first one")}</div>
              </div>
            ) : (
              <div
                onTouchMove={plDrag ? plDragMove : undefined}
                onTouchEnd={plDrag ? plDragEnd : undefined}
                onTouchCancel={plDrag ? plDragEnd : undefined}
              >
              {playlists.map((pl, i) => {
                const count = pl.songIds.filter(id => songs.some(s => s.id === id)).length;
                const isDragging = plDrag?.from === i;
                const isOver = !!plDrag && plDrag.over === i && plDrag.from !== i;
                return (
                  <div
                    key={pl.id}
                    ref={ghost ? undefined : el => { plRowRefs.current[i] = el; }}
                    onClick={e => {
                      if (plPress.current.held) { plPress.current.held = false; return; }
                      if (reordering) return;
                      openFrom(e.currentTarget, e.currentTarget.querySelector(":scope > div"));
                      setActiveId(pl.id); setView("detail");
                    }}
                    onTouchStart={e => plPressStart(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchMove={e => plPressMove(e.touches[0].clientX, e.touches[0].clientY)}
                    onTouchEnd={plPressEnd}
                    onMouseDown={e => plPressStart(e.clientX, e.clientY)}
                    onMouseMove={e => plPressMove(e.clientX, e.clientY)}
                    onMouseUp={plPressEnd}
                    onMouseLeave={plPressEnd}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: reordering ? "12px 16px 12px 4px" : "12px 16px",
                      borderBottom: `1px solid ${t.border}60`,
                      cursor: reordering ? "default" : "pointer",
                      opacity: isDragging ? 0.4 : 1,
                      boxShadow: isOver ? `inset 0 ${plDrag!.from < i ? -2 : 2}px 0 ${t.accent}` : "none",
                      userSelect: "none",
                    }}
                  >
                    {reordering && (
                      <div
                        onTouchStart={e => { e.stopPropagation(); plPressEnd(); setPlDrag({ from: i, over: i }); }}
                        aria-label={tr("Drag to move")}
                        style={{ color: t.muted, display: "flex", flexShrink: 0, padding: "12px 4px 12px 12px", touchAction: "none", cursor: "grab" }}
                      >
                        <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
                          <circle cx="3.5" cy="3" r="1.7"/><circle cx="10.5" cy="3" r="1.7"/>
                          <circle cx="3.5" cy="9" r="1.7"/><circle cx="10.5" cy="9" r="1.7"/>
                          <circle cx="3.5" cy="15" r="1.7"/><circle cx="10.5" cy="15" r="1.7"/>
                        </svg>
                      </div>
                    )}
                    <PlaylistArt photo={pl.coverPhoto} size={rowH - 16} playing={playingFrom === `pl:${pl.id}` ? (isPlaying ? "on" : "paused") : undefined} T={t} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</div>
                      <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                        {tn(count, "{n} song", "{n} songs")}
                      </div>
                    </div>

                    {/* Quick-play button */}
                    {count > 0 && !reordering && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          const ps = pl.songIds.map(id => songs.find(s => s.id === id)).filter((s): s is Song => !!s);
                          onPlayPlaylist(ps, false, `pl:${pl.id}`);
                        }}
                        style={{ background: t.accent, border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={t.playBtnFg}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </button>
                    )}

                    {!reordering && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>}
                  </div>
                );
              })}
              </div>
            )}
            {/* The floating mini-player sits over the bottom of this list. The
                detail views already reserved room for it; the playlist list did
                not, so the last couple of playlists were unreachable unless you
                collapsed the player first. The transition matches the Songs
                list's padding-bottom so both tabs fold at the same rate. */}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
    </>
  );

  return (
    <div style={{
      position:   "absolute", inset: 0,
      background: t.bg, color: t.text,
      display:    "flex", flexDirection: "column",
      paddingTop: insetOutside,
      transition: rootTransition,
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      userSelect: "none",
    }}>

      {/* Hidden file input for cover photo selection — triggered by pickCoverPhoto() */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={onCoverFileChosen}
        style={{ display: "none" }}
      />
      {/* On the page itself rather than in here: this view slides, and a
          fixed layer inside something that moves would move with it. */}
      {cropSrc && createPortal(
        <CropSheet src={cropSrc} T={t} onCancel={() => setCropSrc(null)} onUse={keepCroppedCover} />,
        document.body,
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* The add-songs picker only. A playlist carries its back arrow, name
          and buttons in its own card, which scrolls with the songs, and the
          list of playlists needs none. */}
      {view === "addSongs" && !selectMode && (
        <div style={{
          display: "flex", alignItems: "center",
          padding: "14px 16px",
          borderBottom: `1px solid ${t.border}`,
          gap: 10, flexShrink: 0,
        }}>
          {/* Back / close */}
          <button
            onClick={goBack}
            style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", padding: "4px 8px 4px 0", display: "flex", alignItems: "center", gap: 4 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{tr("Add songs")}</span>

          {view === "addSongs" && (
            <button
              onClick={addSelectedSongs}
              disabled={selectedAdd.size === 0}
              style={{
                background: selectedAdd.size > 0 ? t.accent : t.border,
                border: "none", borderRadius: 20,
                color: t.playBtnFg, padding: "6px 14px",
                fontSize: 13, fontWeight: 600,
                cursor: selectedAdd.size > 0 ? "pointer" : "default",
                flexShrink: 0, transition: "background 0.15s",
              }}
            >
              {selectedAdd.size > 0 ? tr("Add {n}", { n: selectedAdd.size }) : tr("Add")}
            </button>
          )}
        </div>
      )}

      {/* ── Search bar (add-songs view only) ────────────────────────────── */}
      {view === "addSongs" && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", background: t.surface, borderRadius: 10, padding: "0 12px", height: 38, gap: 8, border: `1px solid ${t.border}` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              autoFocus
              value={addSearch}
              onChange={e => setAddSearch(e.target.value)}
              placeholder={tr("Search songs or artists…")}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: t.text, fontSize: 14 }}
            />
            {addSearch && (
              <button onClick={() => setAddSearch("")} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", padding: 2 }}>✕</button>
            )}
          </div>

          {/* Sort chips. A horizontal strip rather than a dropdown: there are
              only five, and one tap beats open-then-pick when you are hunting
              for songs to add. */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            {ADD_SORTS.map(opt => {
              const on = addSort === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAddSort(opt.id)}
                  style={{
                    flexShrink: 0, padding: "5px 12px", borderRadius: 16,
                    border: `1px solid ${on ? t.accent : t.border}`,
                    background: on ? t.accent : t.surface,
                    color: on ? t.playBtnFg : t.chipColor,
                    fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", whiteSpace: "nowrap",
                  }}
                >
                  {tr(opt.label)}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: selectedAdd.size > 0 ? t.accent : t.muted, fontWeight: 600 }}>
              {selectedAdd.size > 0 ? tr("{n} selected", { n: selectedAdd.size }) : tn(filteredAddSongs.length, "{n} song", "{n} songs")}
            </span>
            <button
              onClick={() => setSelectedAdd(allAddSelected ? new Set() : new Set(addSelectableIds))}
              disabled={addSelectableIds.length === 0}
              style={{
                background: "none", border: "none", padding: "2px 0", fontFamily: "inherit",
                color: addSelectableIds.length === 0 ? t.muted : t.violet,
                fontSize: 12.5, fontWeight: 700,
                cursor: addSelectableIds.length === 0 ? "default" : "pointer",
                opacity: addSelectableIds.length === 0 ? 0.5 : 1,
              }}
            >
              {allAddSelected ? tr("Deselect all") : tr("Select all")}
            </button>
          </div>
        </div>
      )}

      {/* The list, behind a playlist being swiped away. */}
      {swipeX > 0 && (
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
          transform: `translateX(${Math.round((swipeX / vw - 1) * 90)}px)`, transition: `transform ${swipeMotion}`,
        }}>
          <div style={{ height: topInset }} />
          {renderList(true)}
          <div style={{ position: "absolute", inset: 0, background: "#000", opacity: 0.35 * (1 - swipeX / vw), transition: `opacity ${swipeMotion}` }} />
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div
        ref={scrollBodyRef}
        onScroll={e => {
          cancelPress();
          const top = (e.target as HTMLDivElement).scrollTop;
          if ((top > 0) !== bodyScrolled) setBodyScrolled(top > 0);
          onBodyScroll?.(top);
        }}
        onTouchStart={onSwipeStart}
        onTouchMove={onSwipeMove}
        onTouchEnd={onSwipeEnd}
        onTouchCancel={onSwipeEnd}
        style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", overflowAnchor: "none",
          position: "relative", zIndex: 1,
          ...(swipeX > 0 ? { background: t.bg, transform: `translateX(${swipeX}px)`, boxShadow: "-14px 0 32px rgba(0,0,0,0.35)" } : null),
          transition: `transform ${swipeMotion}`,
        }}
      >
        {/* The header's height as a spacer INSIDE the scroller, so rows scroll up
            under the collapsed logo instead of leaving a dead band. Rendered
            unconditionally, even at height 0: a height transition cannot run on a
            node that is being removed, so unmounting it on a view change snapped
            this to zero while the root's padding was still easing in, which read
            as a double jump. */}
        <div style={{ height: insetInside, transition: bodyScrolled && !sticky ? "none" : insetTransition }} aria-hidden="true" />

        {/* ════ PLAYLIST LIST ════════════════════════════════════════════ */}
        {view === "list" && renderList(false)}

        {/* ════ PLAYLIST DETAIL (user playlist) ═══════════════════════════ */}
        {view === "detail" && activePlaylist && (
          <>
            {/* The card. Away while picking songs, so the page is the bar,
                the rows and the actions, as on Songs. */}
            {!selectMode && renderCard({
              source: `pl:${activePlaylist.id}`, name: activePlaylist.name, photo: activePlaylist.coverPhoto,
              icon: noteIcon, list: playlistSongs, own: true,
            })}

            {playlistSongs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tr("No songs yet")}</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>{tr("Tap \"+ Add\" at the top to add songs")}</div>
              </div>
            ) : (
              playlistSongs.map((song, idx) => (
                <React.Fragment key={song.id}>{renderSongRow({ song, idx, list: playlistSongs, inPlaylist: true })}</React.Fragment>
              ))
            )}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
          </>
        )}

        {/* ════ SMART PLAYLIST DETAIL (read-only) ══════════════════════════ */}
        {view === "smartDetail" && activeSmartPlaylist && (
          <>
            {!selectMode && renderCard({
              source: `smart:${activeSmartPlaylist.id}`, name: activeSmartPlaylist.name,
              icon: (SMART_CARD_STYLES[activeSmartPlaylist.id] ?? FALLBACK_SMART_STYLE).icon(52),
              list: smartPlaylistSongs, own: false,
            })}

            {smartPlaylistSongs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tr("Nothing here yet")}</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>
                  {activeSmartPlaylist.id === "favorites"      && tr("Double-tap a song to like it")}
                  {activeSmartPlaylist.id === "recentlyPlayed" && tr("Play a song and it'll show up here")}
                  {activeSmartPlaylist.id === "mostPlayed"     && tr("Play a song and it'll show up here")}
                  {activeSmartPlaylist.id === "lastAdded"      && tr("New songs will show up here")}
                </div>
              </div>
            ) : (
              smartPlaylistSongs.map((song, idx) => (
                <React.Fragment key={song.id}>{renderSongRow({ song, idx, list: smartPlaylistSongs, inPlaylist: false })}</React.Fragment>
              ))
            )}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
          </>
        )}

        {/* ════ ADD SONGS VIEW ═══════════════════════════════════════════ */}
        {view === "addSongs" && <>
          {filteredAddSongs.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{tr("No songs found")}</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>{tr("Try a different search")}</div>
            </div>
          )}
          {filteredAddSongs.map(song => {
            const alreadyIn = inPlaylistSet.has(song.id);
            const isSelected = selectedAdd.has(song.id);
            return (
              <div
                key={song.id}
                onClick={() => { if (!alreadyIn) toggleAddSelection(song.id); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px",
                  background: isSelected ? t.violet + "18" : "transparent",
                  borderLeft: isSelected ? `3px solid ${t.violet}` : "3px solid transparent",
                  cursor: alreadyIn ? "default" : "pointer",
                  opacity: alreadyIn ? 0.45 : 1,
                  transition: "background 0.1s",
                }}
              >
                {/* Checkbox circle */}
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${isSelected ? t.violet : alreadyIn ? t.muted : t.border}`,
                  background: isSelected ? t.violet : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.12s",
                }}>
                  {isSelected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                  {alreadyIn && !isSelected && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill={t.muted}><circle cx="12" cy="12" r="10"/></svg>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.text }}>{dispName(song)}</div>
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{dispArtist(song)}</div>
                </div>

                {alreadyIn && <span style={{ fontSize: 11, color: t.muted, flexShrink: 0 }}>{tr("In playlist")}</span>}
              </div>
            );
          })}
          {/* Same reason as the playlist list: the mini-player floats over the
              bottom of this one too. */}
          <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
        </>}
      </div>

      {/* ── Long-press song action menu ──────────────────────────────────── */}
      {/* Rendered via a PORTAL to document.body. The playlists panel animates
          with a CSS transform, and a transformed ancestor hijacks position:
          fixed — descendants get positioned relative to the panel and trapped
          in its stacking context, which sits BELOW the mini-player. No z-index
          can fix that from inside; the menu must escape the panel's DOM. */}
      {/* ── Multi-select action bar (playlist detail) ───────────────────────
          The very same bar the Songs page uses, not a second one that looks
          similar. It previously offered exactly one action, which meant the
          gesture taught on one page did nothing familiar on the other. The two
          extra props are the difference a playlist actually justifies: pulling
          songs out of it, and the library removal that on the Songs page lives
          up in the header (there is no header button in here to carry it). */}
      {selectMode && createPortal(
        <MultiSelectBar
          count={selectedIds.size}
          totalCount={selectableIds.length}
          allLiked={selectedIds.size > 0 && [...selectedIds].every(id => {
            const song = songs.find(x => x.id === id);
            return song ? isLiked(song) : false;
          })}
          onLikeAll={() => { onLikeMany([...selectedIds], true); }}
          onUnlikeAll={() => { onLikeMany([...selectedIds], false); }}
          onShuffleSelection={() => { const ids = [...selectedIds]; exitSelect(); onShuffleMany(ids); }}
          onAddToPlaylist={() => { onAddManyToPlaylist([...selectedIds]); }}
          onPlayNext={() => { const ids = [...selectedIds]; exitSelect(); onPlayManyNext(ids); }}
          onShare={() => { onShareMany([...selectedIds]); }}
          onBulkEdit={() => { onBulkEditMany([...selectedIds]); }}
          onRemoveFromPlaylist={activePlaylist
            ? () => { const ids = selectedIds; exitSelect(); removeManyFromPlaylist(ids); }
            : undefined}
          onDelete={() => { const ids = [...selectedIds]; exitSelect(); onBinMany(ids); }}
          single={(() => {
            // One song picked: everything its "⋮" menu has.
            const s = selectedIds.size === 1 ? songs.find(x => selectedIds.has(x.id)) : undefined;
            if (!s) return null;
            const leave = (then: () => void) => () => { exitSelect(); then(); };
            const list = activePlaylist ? playlistSongs : smartPlaylistSongs;
            const source = activePlaylist ? `pl:${activeId}` : `smart:${activeSmartId}`;
            return {
              isLiked: isLiked(s),
              onPlay: leave(() => onPlaySong(s, list.length ? list : [s], source)),
              onPlayNext: leave(() => onPlayNext(s)),
              onAddToPlaylist: () => onAddManyToPlaylist([s.id]),
              onToggleLike: () => onToggleLike(s),
              onShare: () => onShareSong(s),
              onEditLyrics: leave(() => onEditLyrics(s)),
              onCut: leave(() => onCutSong(s)),
              onSetRingtone: leave(() => onSetRingtone(s)),
              onChangePhoto: leave(() => onChangePhoto(s)),
              onEdit: leave(() => onEditSong(s)),
              onRemoveFromPlaylist: activePlaylist ? leave(() => removeFromPlaylist(s.id)) : undefined,
              onBin: leave(() => onRemoveSong(s)),
            };
          })()}
          onSelectAll={() => setSelectedIds(new Set(selectableIds))}
          onClearAll={() => setSelectedIds(new Set())}
          onClose={exitSelect}
          T={t}
        />,
        document.body
      )}

      {/* ── Per-song action menu ──────────────────────────────────────────
          The same sheet the Songs page uses, plus "Remove from playlist" when
          the row belongs to a real (editable) playlist. Portalled to body so
          it always sits above the floating mini-player. */}
      {menuSong && createPortal(
        <SongMenuSheet
          song={menuSong.song}
          dispName={dispName(menuSong.song)}
          dispArtist={dispArtist(menuSong.song)}
          customPhoto={meta[menuSong.song.id]?.customPhoto}
          isLiked={isLiked(menuSong.song)}
          playlists={playlists}
          onPlay={() => { const m = menuSong; setMenuSong(null); const list = m.inPlaylist ? playlistSongs : smartPlaylistSongs; onPlaySong(m.song, list.length ? list : [m.song], m.inPlaylist ? `pl:${activeId}` : `smart:${activeSmartId}`); }}
          onPlayNext={() => { onPlayNext(menuSong.song); setMenuSong(null); }}
          onAddToPlaylist={id => { addSongToPlaylist(id, menuSong.song.id); setMenuSong(null); }}
          onCreatePlaylistWithSong={name => { createPlaylistWithSong(name, menuSong.song.id); setMenuSong(null); }}
          onEdit={() => { onEditSong(menuSong.song); setMenuSong(null); }}
          onChangePhoto={() => { onChangePhoto(menuSong.song); setMenuSong(null); }}
          onSetRingtone={() => { onSetRingtone(menuSong.song); setMenuSong(null); }}
          onEditLyrics={() => { onEditLyrics(menuSong.song); setMenuSong(null); }}
          onCut={() => { onCutSong(menuSong.song); setMenuSong(null); }}
          onToggleLike={() => { onToggleLike(menuSong.song); setMenuSong(null); }}
          onShare={() => { onShareSong(menuSong.song); setMenuSong(null); }}
          onRemove={() => { onRemoveSong(menuSong.song); setMenuSong(null); }}
          onRemoveFromPlaylist={menuSong.inPlaylist
            ? () => { removeFromPlaylist(menuSong.song.id); setMenuSong(null); }
            : undefined}
          inPlaylistName={menuSong.inPlaylist ? activePlaylist?.name : undefined}
          onClose={() => setMenuSong(null)}
          T={t}
        />,
        document.body
      )}

      {/* ── New playlist ──────────────────────────────────────────────────
          The floating card every other choice comes up in, along the bottom,
          over the list. The field has a line of its own and the buttons sit
          under it, so with large text on a wide phone nothing goes off the
          edge, as Create and the cross did when all three shared a row. */}
      {creating && createPortal(
        <div
          onClick={() => { setCreating(false); setNewName(""); }}
          style={{ position: "fixed", inset: 0, background: t.overlayBg, zIndex: 400, display: "flex", alignItems: "flex-end", padding: "0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", boxSizing: "border-box" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ ...floatCard(t), width: "100%", padding: 16, animation: "mpCardUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ minWidth: 0, fontSize: 19, fontWeight: 800, color: t.text, letterSpacing: "-0.01em" }}>{tr("New playlist")}</span>
              <button onClick={() => { setCreating(false); setNewName(""); }} aria-label={tr("Close")} style={cardCloseBtn(t)}><IC.Close /></button>
            </div>
            <input
              ref={createInputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createPlaylist(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
              placeholder={tr("Playlist name…")}
              style={{ display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", marginTop: 14, background: t.inputBg, border: "none", borderRadius: 14, padding: "14px 16px", color: t.text, fontSize: 16, outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => { setCreating(false); setNewName(""); }}
                style={{ flex: "1 1 120px", minHeight: 48, padding: "12px 10px", border: "none", borderRadius: 16, background: t.dim, color: t.text, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                {tr("Cancel")}
              </button>
              <button
                onClick={createPlaylist}
                disabled={!newName.trim()}
                style={{ flex: "1 1 120px", minHeight: 48, padding: "12px 10px", border: "none", borderRadius: 16, background: t.accent, color: t.playBtnFg, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default", opacity: newName.trim() ? 1 : 0.45, fontFamily: "inherit" }}
              >
                {tr("Create")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Remove photo: asks first. It went at a tap before. */}
      {confirmRemovePhoto && activePlaylist?.coverPhoto && createPortal(
        <ConfirmSheet
          title={tr("Remove photo?")}
          body={tr("\"{name}\" gets its plain cover back. The photo itself stays on your phone.", { name: activePlaylist.name })}
          confirmLabel={tr("Remove photo")}
          onConfirm={() => { removeCoverPhoto(); setConfirmRemovePhoto(false); }}
          onCancel={() => setConfirmRemovePhoto(false)}
          preview={
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ width: 48, height: 48, borderRadius: 10, background: `center/cover no-repeat url(${activePlaylist.coverPhoto})` }} />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              <span style={{ width: 48, height: 48, borderRadius: 10, background: t.dim, color: t.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </span>
            </span>
          }
          T={t}
        />,
        document.body
      )}

      {/* ── Delete playlist: asks first, in the same card as every other
          "are you sure?". Portalled: the panel is transformed, which would
          trap a fixed overlay inside it. */}
      {confirmDeleteId && createPortal(
        <ConfirmSheet
          title={tr("Delete playlist?")}
          body={tr("\"{name}\" will be deleted permanently. Your songs won't be affected.", { name: playlists.find(p => p.id === confirmDeleteId)?.name ?? "" })}
          confirmLabel={tr("Delete")}
          onConfirm={() => deletePlaylist(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
          T={t}
        />,
        document.body
      )}
    </div>
  );
};