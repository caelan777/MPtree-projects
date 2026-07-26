import { useState, useCallback, type Dispatch, type SetStateAction } from "react";
import type { Song, SongMeta, PlayMode } from "../types";
import { saveCutTracksToStorage } from "../storage";
// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultiSelectDeps {
  displayList:     Song[];
  songs:           Song[];
  removedSongs:    Song[];
  meta:            Record<string, SongMeta>;
  currentSong:     Song | null;
  queue:           Song[];
  playMode:        PlayMode;
  onSongsChange:   (updater: (prev: Song[]) => Song[]) => void;
  onRemovedChange: (updated: Song[]) => void;
  onPlaySong:      (song: Song, queue: Song[]) => void;
  onSetCurrent:    (song: Song | null) => void;
  onSetPlaying:    (playing: boolean) => void;
  onSetPlayMode:   (mode: PlayMode) => void;
  onShowToast:     (msg: string, action?: { label: string; onClick: () => void }) => void;
  onRestoreSongs:  (songs: Song[]) => void;
  onRescan:        (removedList?: Song[]) => Promise<Song[]>;
}

export interface MultiSelectReturn {
  selected:              Set<string>;
  selectMode:            boolean;
  removeMultiConfirm:    boolean;
  setSelected:           Dispatch<SetStateAction<Set<string>>>;
setSelectMode:         Dispatch<SetStateAction<boolean>>;
setRemoveMultiConfirm: Dispatch<SetStateAction<boolean>>;
  exitSelectMode:        () => void;
  multiLike:             (like: boolean) => void;
  multiShuffleSelection: () => void;
  multiRemove:           () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Note: `meta`, `queue`, and `playMode` stay in MultiSelectDeps because App.tsx's
// call site still passes them in (removing them there would require touching
// App.tsx). They're just not destructured below since nothing in this hook
// currently reads them — `meta`/`isLiked` were dead after multiLikeWithMeta
// in App.tsx took over the like/unlike-meta update, and `queue`/`playMode`
// were never read at all.

export function useMultiSelect({
  displayList,
  songs,
  removedSongs,
  currentSong,
  onSongsChange,
  onRemovedChange,
  onPlaySong,
  onSetCurrent,
  onSetPlaying,
  onSetPlayMode,
  onShowToast,
  onRestoreSongs,
  onRescan,
}: MultiSelectDeps): MultiSelectReturn {
  const [selected,           setSelected]          = useState<Set<string>>(new Set());
  const [selectMode,         setSelectMode]        = useState(false);
  const [removeMultiConfirm, setRemoveMultiConfirm]= useState(false);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  // Meta (liked/unliked) updates happen in App.tsx via multiLikeWithMeta,
  // which wraps this function and patches `meta` before/after calling it.
  const multiLike = useCallback((like: boolean) => {
    onShowToast(like ? `Liked ${selected.size} songs` : `Unliked ${selected.size} songs`);
    exitSelectMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, onShowToast, exitSelectMode]);

  const multiShuffleSelection = useCallback(() => {
    const sel = displayList.filter(s => selected.has(s.id));
    if (!sel.length) return;
    const q = [...sel].sort(() => Math.random() - 0.5);
    onSetPlayMode("shuffle");
    onPlaySong(q[0], q);
    onShowToast(`Shuffling ${q.length} songs`);
    exitSelectMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, displayList, onSetPlayMode, onPlaySong, onShowToast, exitSelectMode]);

  const multiRemove = useCallback(() => {
    const toRemove = songs.filter(s => selected.has(s.id));
    const wasPlayingRemoved = currentSong && selected.has(currentSong.id);
    const updated = [...toRemove, ...removedSongs];
    onRemovedChange(updated);
    onSongsChange(prev => {
      const next = prev.filter(s => !selected.has(s.id));
      saveCutTracksToStorage(next.filter(s => s.isCut));
      return next;
    });
    if (wasPlayingRemoved) {
      const remaining = displayList.filter(s => !selected.has(s.id));
      const idx = displayList.findIndex(s => s.id === currentSong!.id);
      const nxt = remaining[idx] ?? remaining[idx - 1];
      if (nxt) {
        onPlaySong(nxt, remaining);
      } else {
        onSetCurrent(null);
        onSetPlaying(false);
      }
    }
    onShowToast(`${toRemove.length} songs moved to bin`, {
      label: "Undo",
      onClick: () => onRestoreSongs(toRemove),
    });
    setRemoveMultiConfirm(false);
    exitSelectMode();
    onRescan(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, songs, removedSongs, currentSong, displayList, onRemovedChange, onSongsChange, onPlaySong, onSetCurrent, onSetPlaying, onShowToast, onRestoreSongs, onRescan, exitSelectMode]);

  return {
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
  };
}