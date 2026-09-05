import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Song, SongMeta, Playlist, SmartPlaylist, SmartPlaylistId } from "../types";
import { isMissingArtist } from "../utils";
import { AlbumArt } from "./AlbumArt";
import { SongMenuSheet } from "./SongMenuSheet";
import { IC } from "./Icons";
import type { T } from "../themes";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "list" | "detail" | "smartDetail" | "addSongs";

interface Props {
  /** Height of the floating header card above — content starts below it. */
  topInset?:          number;
  playlists:          Playlist[];
  /** Built-in, auto-generated playlists (Favorites, Recently Played, Most Played, Last Added).
   *  Computed live by App from songs+meta — read-only here, never passed through onPlaylistsChange. */
  smartPlaylists:     SmartPlaylist[];
  songs:              Song[];
  meta:               Record<string, SongMeta>;
  onPlaylistsChange:  (updated: Playlist[]) => void;
  /** Called when user taps Play All or Shuffle — wire to App's playSong + setPlayMode */
  onPlayPlaylist:     (playlistSongs: Song[], shuffle: boolean) => void;
  /** Play a single tapped song, using the surrounding list as the queue. */
  onPlaySong:         (song: Song, listSongs: Song[]) => void;
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
  onCutSong:          (song: Song) => void;
  onShareSong:        (song: Song) => void;
  onRemoveSong:       (song: Song) => void;
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
  /** Mirrors App's `chromeAnimate`: whether the fold is being animated right
   *  now, or jumped (the scroll-to-top button). The insets here have to follow
   *  the same rule as the Songs list or the two tabs fold differently. */
  animateInsets?:     boolean;
  /** Called when the user backs out of the root "list" view — App treats this as "go to Songs page" */
  onClose:            () => void;
  T:                  T;
}

// ─── Add-songs sorting ────────────────────────────────────────────────────────
// The "Add songs" picker used to be search-only, in library order, which made
// finding anything in a large library a scroll. These mirror the Songs page's
// own sort options so the two lists can be reasoned about the same way.
type AddSortId = "newest" | "oldest" | "alphabetical" | "artist" | "favorites";
const ADD_SORTS: { id: AddSortId; label: string }[] = [
  { id: "newest",       label: "Newest"    },
  { id: "oldest",       label: "Oldest"    },
  { id: "alphabetical", label: "A–Z"       },
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
    icon: (size) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21s-7.46-4.51-9.5-9.04C1.18 8.4 2.6 4.5 6.5 4.5c2.02 0 3.36 1.06 3.7 2.13.34-1.07 1.68-2.13 3.7-2.13 3.9 0 5.32 3.9 4 7.46C19.46 16.49 12 21 12 21z"/>
      </svg>
    ),
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
  playlists, smartPlaylists, songs, meta, onPlaylistsChange, onPlayPlaylist,
  onPlaySong, currentSongId, isPlaying = false, onToggleLike, onPlayNext,
  onEditSong, onCutSong, onShareSong, onRemoveSong,
  isLiked, onHaptic, onDetailChange, bottomInset = 0, resetToListSignal, backSignal = 0,
  onBodyScroll, animateInsets = true, onClose, T,
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
    }
  }, [resetToListSignal]);
  const [creating,        setCreating]       = useState(false);
  const [newName,         setNewName]        = useState("");
  const [renamingId,      setRenamingId]     = useState<string | null>(null);
  const [renameDraft,     setRenameDraft]    = useState("");
  const [confirmDeleteId, setConfirmDeleteId]= useState<string | null>(null);
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
  // The scrollable body + the currently-playing row, so we can (a) cancel a
  // pending long-press the instant the list scrolls — touching a momentum
  // scroll to stop it used to register as a long-press and open select/edit —
  // and (b) scroll the playing song into view.
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const currentRowRef = useRef<HTMLDivElement>(null);
  const cancelPress = useCallback(() => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }, []);

  // ── Multi-select (playlist detail only) ─────────────────────────────────────
  // Long-pressing a row enters select mode; tapping rows toggles them; a bottom
  // bar removes all selected songs from the playlist at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const exitSelect = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); }, []);
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  // Leaving the detail view (or App switching to Songs) cancels selection.
  useEffect(() => { if (view === "list") exitSelect(); }, [view, exitSelect]);

  // Scroll the currently-playing song into view when it changes (or when a
  // detail view opens on the song that is already playing). Small delay so the
  // row has mounted first.
  useEffect(() => {
    if (view !== "detail" && view !== "smartDetail") return;
    if (!currentSongId) return;
    const t = setTimeout(() => {
      currentRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [currentSongId, view]);
  useEffect(() => { if (resetToListSignal) exitSelect(); }, [resetToListSignal, exitSelect]);

  // ── Depth reporting ───────────────────────────────────────────────────────
  // True whenever we have something of our own to back out of. App uses this
  // twice: to disable the horizontal page swipe (swiping inside a playlist
  // should not jump back to Songs), and to decide whether Android's Back
  // belongs to us or should leave the tab.
  const canPop = view !== "list" || selectMode || !!menuSong
    || creating || !!renamingId || !!confirmDeleteId;
  useEffect(() => { onDetailChange?.(canPop); }, [canPop, onDetailChange]);

  // ── Android Back, delegated from App ──────────────────────────────────────
  // Pops exactly one level per bump, topmost first. The first render is not a
  // bump, hence seeding the ref with the incoming value.
  const lastBackSignalRef = useRef(backSignal);
  useEffect(() => {
    if (backSignal === lastBackSignalRef.current) return;
    lastBackSignalRef.current = backSignal;
    if (menuSong)         { setMenuSong(null); return; }
    if (confirmDeleteId)  { setConfirmDeleteId(null); return; }
    if (renamingId)       { setRenamingId(null); return; }
    if (creating)         { setCreating(false); return; }
    if (selectMode)       { exitSelect(); return; }
    if (view === "addSongs") { setView("detail"); return; }
    if (view !== "list")  { setView("list"); setActiveId(null); setActiveSmartId(null); return; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backSignal]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const dispName   = (s: Song) => meta[s.id]?.customName   || s.title;
  const dispArtist = (s: Song) => meta[s.id]?.customArtist || (!isMissingArtist(s.artist) ? s.artist : "");
  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`; };

  // ── Tappable / long-pressable song row ─────────────────────────────────────
  // Shared by the playlist detail and smart-playlist detail lists. Tap plays
  // the song within its list; long-press opens an action menu.
  const SongRow: React.FC<{ song: Song; idx: number; list: Song[]; inPlaylist: boolean }> = ({ song, list, inPlaylist }) => {
    const isCurrent = currentSongId === song.id;
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
      onPlaySong(song, list);
    };

    return (
      <div
        ref={isCurrent ? currentRowRef : undefined}
        onClick={handleClick}
        onTouchStart={e => startPress(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={e => movePress(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        onMouseDown={e => startPress(e.clientX, e.clientY)}
        onMouseMove={e => movePress(e.clientX, e.clientY)}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        style={{
          display: "flex", alignItems: "center",
          padding: "10px 16px", gap: 10, cursor: "pointer",
          background: isSelected ? t.violet + "18" : isCurrent ? t.card : "transparent",
          transition: "background 0.15s",
          borderLeft: isCurrent && !isSelected ? `3px solid ${t.accent}` : "3px solid transparent",
        }}
      >
        {selectMode && inPlaylist && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            border: `2px solid ${isSelected ? t.violet : t.muted}`,
            background: isSelected ? t.violet : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isSelected && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
        )}
        <AlbumArt title={dispName(song)} size={48} active={isCurrent} playing={isCurrent && isPlaying} customPhoto={meta[song.id]?.customPhoto} songPath={song.uri} T={t} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isCurrent ? t.accent : t.text }}>{dispName(song)}</span>
            {song.isCut && <span style={{ fontSize: 10, background: t.dim, color: t.textSub, borderRadius: 4, padding: "1px 5px", fontWeight: 700, flexShrink: 0 }}>CUT</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 2, gap: 6 }}>
            {/* Track number — hidden for now (kept for future use):
            <span style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? t.accent : t.muted, flexShrink: 0 }}>{idx + 1}</span>
            */}
            <span style={{ flex: 1, fontSize: 13, color: t.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dispArtist(song) || "Unknown Artist"}</span>
            {song.duration != null && song.duration > 0 && (
              <span style={{ fontSize: 12, color: t.muted, flexShrink: 0 }}>{fmt(song.duration)}</span>
            )}
          </div>
        </div>
        {isLiked(song) && !inPlaylist && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill={t.heart} style={{ flexShrink: 0 }}><path d="M12 21s-7.46-4.51-9.5-9.04C1.18 8.4 2.6 4.5 6.5 4.5c2.02 0 3.36 1.06 3.7 2.13.34-1.07 1.68-2.13 3.7-2.13 3.9 0 5.32 3.9 4 7.46C19.46 16.49 12 21 12 21z"/></svg>
        )}
        {!selectMode && (
          <button
            onClick={e => { e.stopPropagation(); setMenuSong({ song, inPlaylist }); }}
            onTouchStart={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            aria-label={`More options for ${dispName(song)}`}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 2px 6px 6px", display: "flex", flexShrink: 0, color: t.muted }}
          >
            <IC.Dots />
          </button>
        )}
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
  const pickCoverPhoto = useCallback(() => {
    coverInputRef.current?.click();
  }, []);

  const onCoverFileChosen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !activePlaylist) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
      if (!dataUrl) return;
      onPlaylistsChange(playlists.map(p =>
        p.id === activePlaylist.id ? { ...p, coverPhoto: dataUrl } : p
      ));
    };
    reader.readAsDataURL(file);
  }, [activePlaylist, playlists, onPlaylistsChange]);

  const removeCoverPhoto = useCallback(() => {
    if (!activePlaylist) return;
    onPlaylistsChange(playlists.map(p =>
      p.id === activePlaylist.id ? { ...p, coverPhoto: undefined } : p
    ));
  }, [activePlaylist, playlists, onPlaylistsChange]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const t = T;

  // Shared icon tile — used for the playlist list rows, the detail header,
  // and as the fallback when a playlist has no cover photo set.
  const PlaylistArt: React.FC<{ photo?: string; size: number; iconSize?: number; onClick?: () => void }> = ({ photo, size, iconSize, onClick }) => (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: size >= 80 ? 16 : 12, flexShrink: 0,
        background: photo ? `center/cover no-repeat url(${photo})` : t.dim,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: onClick ? "pointer" : "default", overflow: "hidden",
      }}
    >
      {!photo && (
        <svg width={iconSize ?? 22} height={iconSize ?? 22} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2">
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      )}
    </div>
  );

  // The floating header's height, applied as a spacer INSIDE the scroller on
  // the root list and as padding OUTSIDE it everywhere else.
  //
  // It used to always be padding on this root element, which meant it could
  // never scroll away: folding the header on the Playlists tab left a band of
  // dead black across the top of the screen, where the Songs tab simply lets
  // its rows slide up under the collapsed logo. Views with their own sticky
  // header row (a playlist, an auto playlist, the add-songs picker) keep the
  // outer padding, because that header has to stay put below the floating card
  // rather than scroll under it.
  const insetOutside = view === "list" ? 0 : topInset;
  const insetInside  = view === "list" ? topInset : 0;
  const insetTransition = animateInsets
    ? "height 0.34s cubic-bezier(0.22, 1, 0.36, 1)"
    : "none";

  return (
    <div style={{
      position:   "absolute", inset: 0,
      background: t.bg, color: t.text,
      display:    "flex", flexDirection: "column",
      paddingTop: insetOutside,
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

      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* Only rendered for detail/smartDetail/addSongs — the "list" view's
          back arrow + "+ New" now live inline in the "Auto playlists" row
          below instead of their own dedicated header row. */}
      {view !== "list" && (
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

          {/* Title — tappable to rename in detail view */}
          {view === "detail" && renamingId === activeId ? (
            <input
              autoFocus
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={e => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null); }}
              style={{ flex: 1, background: "transparent", border: `none`, borderBottom: `1px solid ${t.accent}`, color: t.text, fontSize: 18, fontWeight: 700, outline: "none", padding: "2px 0" }}
            />
          ) : (
            <span
              style={{ flex: 1, fontSize: 18, fontWeight: 700 }}
              onClick={view === "detail" && activePlaylist ? () => { setRenamingId(activeId); setRenameDraft(activePlaylist.name); } : undefined}
            >
              {view === "addSongs"  ? "Add Songs"
               : view === "smartDetail" ? activeSmartPlaylist?.name ?? "Playlist"
               : activePlaylist?.name ?? "Playlist"}
            </span>
          )}

          {/* Right actions */}
          {view === "detail" && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => { setSelectedAdd(new Set()); setAddSearch(""); setView("addSongs"); }}
                style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", padding: "4px 8px", fontSize: 13, fontWeight: 600 }}
              >
                + Add
              </button>
              <button
                onClick={() => setConfirmDeleteId(activeId)}
                style={{ background: "none", border: "none", color: "#e8445a", cursor: "pointer", padding: 6, display: "flex" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          )}
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
              {selectedAdd.size > 0 ? `Add ${selectedAdd.size}` : "Add"}
            </button>
          )}
          {view === "smartDetail" && (
            <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
              Auto
            </span>
          )}
        </div>
      )}

      {/* ── Create playlist input ────────────────────────────────────────── */}
      {creating && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center",
          padding: "10px 16px", borderBottom: `1px solid ${t.border}`,
          flexShrink: 0,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createPlaylist(); if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
            placeholder="Playlist name…"
            style={{ flex: 1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "9px 12px", color: t.text, fontSize: 15, outline: "none" }}
          />
          <button onClick={createPlaylist} style={{ background: t.accent, border: "none", borderRadius: 8, color: t.playBtnFg, padding: "9px 16px", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            Create
          </button>
          <button onClick={() => { setCreating(false); setNewName(""); }} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", padding: 8, fontSize: 18 }}>
            ✕
          </button>
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
              placeholder="Search songs or artists…"
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
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: selectedAdd.size > 0 ? t.accent : t.muted, fontWeight: 600 }}>
              {selectedAdd.size > 0 ? `${selectedAdd.size} selected` : `${filteredAddSongs.length} songs`}
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
              {allAddSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div
        ref={scrollBodyRef}
        onScroll={e => { cancelPress(); onBodyScroll?.((e.target as HTMLDivElement).scrollTop); }}
        style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
      >
        {insetInside > 0 && <div style={{ height: insetInside }} aria-hidden="true" />}

        {/* ════ PLAYLIST LIST ════════════════════════════════════════════ */}
        {view === "list" && (
          <>
            {/* Smart playlists — always present, read-only — rendered as a
                2×2 grid of colorful gradient cards (fixed brand colors,
                independent of theme). Tapping a card keeps the original
                behavior: setActiveSmartId + setView("smartDetail").
                Back arrow + "+ New" now live in this same row instead of
                a separate header above it. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 4px", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={goBack}
                  style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", padding: "4px 6px 4px 0", display: "flex", alignItems: "center" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <span style={{ fontSize: 11, color: t.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Auto playlists
                </span>
              </div>
              <button
                onClick={() => { setCreating(true); setNewName(""); }}
                style={{ background: t.accent, border: "none", borderRadius: 20, color: t.playBtnFg, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                + New
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "4px 16px 8px" }}>
              {smartPlaylists.map(sp => {
                const count = sp.songIds.length;
                const cardStyle = SMART_CARD_STYLES[sp.id] ?? FALLBACK_SMART_STYLE;
                return (
                  <div
                    key={sp.id}
                    onClick={() => { setActiveSmartId(sp.id); setView("smartDetail"); }}
                    style={{
                      position: "relative", height: 160, borderRadius: 16, padding: 16,
                      background: t.card, border: `1px solid ${t.border}`,
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
                      {count} {count === 1 ? "song" : "songs"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* User playlists */}
            <div style={{ padding: "18px 16px 4px", fontSize: 11, color: t.muted, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              My playlists ({playlists.length})
            </div>
            {playlists.length === 0 && !creating ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px 60px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No playlists yet</div>
                <div style={{ fontSize: 13, marginTop: 6, opacity: 0.6 }}>Tap "+ New" to create your first one</div>
              </div>
            ) : (
              playlists.map(pl => {
                const count = pl.songIds.filter(id => songs.some(s => s.id === id)).length;
                return (
                  <div
                    key={pl.id}
                    onClick={() => { setActiveId(pl.id); setView("detail"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 16px",
                      borderBottom: `1px solid ${t.border}60`,
                      cursor: "pointer",
                    }}
                  >
                    <PlaylistArt photo={pl.coverPhoto} size={52} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</div>
                      <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>
                        {count} {count === 1 ? "song" : "songs"}
                      </div>
                    </div>

                    {/* Quick-play button */}
                    {count > 0 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          const ps = pl.songIds.map(id => songs.find(s => s.id === id)).filter((s): s is Song => !!s);
                          onPlayPlaylist(ps, false);
                        }}
                        style={{ background: t.accent, border: "none", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={t.playBtnFg}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      </button>
                    )}

                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                );
              })
            )}
            {/* The floating mini-player sits over the bottom of this list. The
                detail views already reserved room for it; the playlist list did
                not, so the last couple of playlists were unreachable unless you
                collapsed the player first. The transition matches the Songs
                list's padding-bottom so both tabs fold at the same rate. */}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
          </>
        )}

        {/* ════ PLAYLIST DETAIL (user playlist) ═══════════════════════════ */}
        {view === "detail" && activePlaylist && (
          <>
            {/* Cover photo + play/shuffle */}
            <div style={{ display: "flex", gap: 14, padding: "16px 16px 12px", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <PlaylistArt photo={activePlaylist.coverPhoto} size={84} iconSize={32} onClick={pickCoverPhoto} />
                <div
                  onClick={pickCoverPhoto}
                  style={{
                    position: "absolute", bottom: -4, right: -4,
                    width: 28, height: 28, borderRadius: "50%",
                    background: t.accent, border: `2px solid ${t.bg}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.playBtnFg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: t.muted, marginBottom: 6 }}>
                  {playlistSongs.length} {playlistSongs.length === 1 ? "song" : "songs"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={pickCoverPhoto}
                    style={{ fontSize: 12, color: t.text, background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}
                  >
                    {activePlaylist.coverPhoto ? "Change photo" : "Add photo"}
                  </button>
                  {activePlaylist.coverPhoto && (
                    <button
                      onClick={removeCoverPhoto}
                      style={{ fontSize: 12, color: t.muted, background: "none", border: "none", padding: 0, cursor: "pointer", fontWeight: 600 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Play / Shuffle */}
            <div style={{ display: "flex", gap: 10, padding: "0 16px 12px", borderBottom: `1px solid ${t.border}` }}>
              <button
                onClick={() => { onPlayPlaylist(playlistSongs, false); }}
                disabled={playlistSongs.length === 0}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: t.accent, border: "none", borderRadius: 10, padding: 11,
                  color: t.playBtnFg, fontSize: 14, fontWeight: 700,
                  cursor: playlistSongs.length ? "pointer" : "default",
                  opacity: playlistSongs.length ? 1 : 0.4,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill={t.playBtnFg}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Play All
              </button>
              <button
                onClick={() => { onPlayPlaylist(playlistSongs, true); }}
                disabled={playlistSongs.length === 0}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: t.surface, border: `1px solid ${t.border}`,
                  borderRadius: 10, padding: 11,
                  color: t.text, fontSize: 14, fontWeight: 700,
                  cursor: playlistSongs.length ? "pointer" : "default",
                  opacity: playlistSongs.length ? 1 : 0.4,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                </svg>
                Shuffle
              </button>
            </div>

            {playlistSongs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No songs yet</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>Tap "+ Add" at the top to add songs</div>
              </div>
            ) : (
              playlistSongs.map((song, idx) => (
                <SongRow key={song.id} song={song} idx={idx} list={playlistSongs} inPlaylist={true} />
              ))
            )}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
          </>
        )}

        {/* ════ SMART PLAYLIST DETAIL (read-only) ══════════════════════════ */}
        {view === "smartDetail" && activeSmartPlaylist && (
          <>
            <div style={{ display: "flex", gap: 14, padding: "16px 16px 12px", alignItems: "center" }}>
              <PlaylistArt size={84} iconSize={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: t.muted }}>
                  {smartPlaylistSongs.length} {smartPlaylistSongs.length === 1 ? "song" : "songs"}
                </div>
                <div style={{ fontSize: 12, color: t.muted, opacity: 0.7, marginTop: 4 }}>
                  Updates automatically — can't be edited or deleted
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, padding: "0 16px 12px", borderBottom: `1px solid ${t.border}` }}>
              <button
                onClick={() => { onPlayPlaylist(smartPlaylistSongs, false); }}
                disabled={smartPlaylistSongs.length === 0}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: t.accent, border: "none", borderRadius: 10, padding: 11,
                  color: t.playBtnFg, fontSize: 14, fontWeight: 700,
                  cursor: smartPlaylistSongs.length ? "pointer" : "default",
                  opacity: smartPlaylistSongs.length ? 1 : 0.4,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill={t.playBtnFg}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Play All
              </button>
              <button
                onClick={() => { onPlayPlaylist(smartPlaylistSongs, true); }}
                disabled={smartPlaylistSongs.length === 0}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: t.surface, border: `1px solid ${t.border}`,
                  borderRadius: 10, padding: 11,
                  color: t.text, fontSize: 14, fontWeight: 700,
                  cursor: smartPlaylistSongs.length ? "pointer" : "default",
                  opacity: smartPlaylistSongs.length ? 1 : 0.4,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
                </svg>
                Shuffle
              </button>
            </div>

            {smartPlaylistSongs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing here yet</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>
                  {activeSmartPlaylist.id === "favorites"      && "Double-tap a song to like it"}
                  {activeSmartPlaylist.id === "recentlyPlayed" && "Play a song and it'll show up here"}
                  {activeSmartPlaylist.id === "mostPlayed"     && "Play a song and it'll show up here"}
                  {activeSmartPlaylist.id === "lastAdded"      && "New songs will show up here"}
                </div>
              </div>
            ) : (
              smartPlaylistSongs.map((song, idx) => (
                <SongRow key={song.id} song={song} idx={idx} list={smartPlaylistSongs} inPlaylist={false} />
              ))
            )}
            <div style={{ height: bottomInset, transition: insetTransition }} aria-hidden="true" />
          </>
        )}

        {/* ════ ADD SONGS VIEW ═══════════════════════════════════════════ */}
        {view === "addSongs" && <>
          {filteredAddSongs.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", color: t.muted, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No songs found</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>Try a different search</div>
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
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 1 }}>{dispArtist(song) || "Unknown Artist"}</div>
                </div>

                {alreadyIn && <span style={{ fontSize: 11, color: t.muted, flexShrink: 0 }}>In playlist</span>}
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
      {/* ── Multi-select action bar (playlist detail) ─────────────────────── */}
      {selectMode && createPortal(
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 340,
          background: t.sheetBg, borderTop: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 12px))",
        }}>
          <button
            onClick={exitSelect}
            style={{ background: "transparent", border: "none", color: t.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Cancel
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{selectedIds.size} selected</span>
          {/* Deliberately not a red bin. Taking a song out of a playlist deletes
              nothing: the file stays, and so does the song everywhere else in the
              app. Styled like a normal chip and spelled out in full, so it cannot
              be mistaken for the Songs-page Remove that moves files to the bin. */}
          <button
            onClick={() => { const ids = selectedIds; exitSelect(); removeManyFromPlaylist(ids); }}
            disabled={selectedIds.size === 0}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              background: selectedIds.size > 0 ? t.chipBg : "transparent",
              color: selectedIds.size > 0 ? t.text : t.muted,
              border: "1px solid " + (selectedIds.size > 0 ? t.chipBorder : t.border),
              borderRadius: 10, padding: "9px 16px",
              fontSize: 14, fontWeight: 700,
              opacity: selectedIds.size > 0 ? 1 : 0.5,
              cursor: selectedIds.size > 0 ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            <IC.MinusCircle />
            Remove from playlist
          </button>
        </div>,
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
          onPlay={() => { const m = menuSong; setMenuSong(null); const list = m.inPlaylist ? playlistSongs : smartPlaylistSongs; onPlaySong(m.song, list.length ? list : [m.song]); }}
          onPlayNext={() => { onPlayNext(menuSong.song); setMenuSong(null); }}
          onAddToPlaylist={id => { addSongToPlaylist(id, menuSong.song.id); setMenuSong(null); }}
          onCreatePlaylistWithSong={name => { createPlaylistWithSong(name, menuSong.song.id); setMenuSong(null); }}
          onEdit={() => { onEditSong(menuSong.song); setMenuSong(null); }}
          onCut={() => { onCutSong(menuSong.song); setMenuSong(null); }}
          onToggleLike={() => { onToggleLike(menuSong.song); setMenuSong(null); }}
          onShare={() => { onShareSong(menuSong.song); setMenuSong(null); }}
          onRemove={() => { onRemoveSong(menuSong.song); setMenuSong(null); }}
          onRemoveFromPlaylist={menuSong.inPlaylist
            ? () => { removeFromPlaylist(menuSong.song.id); setMenuSong(null); }
            : undefined}
          onClose={() => setMenuSong(null)}
          T={t}
        />,
        document.body
      )}

      {/* ── Delete confirm overlay ───────────────────────────────────────── */}
      {confirmDeleteId && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 10 }}>
          <div style={{ background: t.sheetBg, borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete playlist?</div>
            <div style={{ fontSize: 14, color: t.muted, marginBottom: 20, lineHeight: 1.5 }}>
              "{playlists.find(p => p.id === confirmDeleteId)?.name}" will be deleted permanently. Your songs won't be affected.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, padding: 11, background: t.border, border: "none", borderRadius: 10, color: t.text, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                Cancel
              </button>
              <button
                onClick={() => deletePlaylist(confirmDeleteId)}
                style={{ flex: 1, padding: 11, background: "#e8445a", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};