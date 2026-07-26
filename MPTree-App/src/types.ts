// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Song = {
  id: string;
  title: string;
  artist: string;
  /** Absolute on-disk file path, e.g. `/storage/emulated/0/Music/song.mp3`. Exported as `path` in backups. */
  uri: string;
  dateAdded: number;
  duration?: number;    // milliseconds from MediaStore — undefined on cut tracks
  isCut?: boolean;
  cutFrom?: number;
  cutTo?: number;
};

export function makeCutId(uri: string, cutFrom: number, cutTo: number): string {
  return `${uri}__cut__${cutFrom}__${cutTo}__${Date.now()}`;
}



export type SongMeta = {
  customName?: string;
  customArtist?: string;
  customPhoto?: string;
  liked?: boolean;
  /** Timestamp (ms) of the most recent time this song was played — drives the "Recently Played" smart playlist. */
  lastPlayedAt?: number;
  /** Total number of times this song has been played — drives the "Most Played" smart playlist. */
  playCount?: number;
};

export type PlayMode = "off" | "shuffle" | "repeat";

// "artist-desc" removed — it existed in the type but was never exposed in the
// sort menu. The type now matches what's actually reachable.
export type FilterId = "newest" | "oldest" | "alphabetical" | "artist" | "favorites";

export type Theme = "dark" | "light";

export type SessionState = {
  filter?: FilterId;
  playMode?: PlayMode;
  currentId?: string;
  queueIds?: string[];
  positionMs?: number;
  isPlaying?: boolean;
  playNextQueue?: string[];
};

// ─── Playlists ────────────────────────────────────────────────────────────────

export type Playlist = {
  /** Unique stable ID — Date.now().toString() at creation time */
  id: string;
  name: string;
  /** Ordered list of song IDs. Songs that no longer exist are silently skipped on render. */
  songIds: string[];
  createdAt: number;
  /** Optional user-picked cover image, stored as a base64 data URL (same pattern as SongMeta.customPhoto). */
  coverPhoto?: string;
};

/** Stable identifiers for the four built-in, auto-generated playlists.
 *  These are never persisted to storage — they're recomputed live from
 *  `songs` + `meta` every render, so they can't go stale or be deleted. */
export type SmartPlaylistId = "favorites" | "recentlyPlayed" | "mostPlayed" | "lastAdded";

export type SmartPlaylist = {
  id: SmartPlaylistId;
  name: string;
  songIds: string[];
};