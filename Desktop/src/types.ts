// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Song = {
  id: string;
  title: string;
  artist: string;
  /** Absolute on-disk file path, e.g. `/storage/emulated/0/Music/song.mp3`. Exported as `path` in backups. */
  uri: string;
  dateAdded: number;
  duration?: number;    // milliseconds from MediaStore — undefined on cut tracks
  /** Album name from MediaStore. "" when the file has no album tag. */
  album?: string;
  /** MediaStore album id. Addresses the system's cached album thumbnail, which
   *  is why cover lookups cost one call per album rather than one per song. */
  albumId?: number;
  /** Position within its disc, 1-based. 0 = unknown. */
  track?: number;
  disc?: number;
  year?: number;
  /** Only populated by the scan on Android 11+. Users can always set one by
   *  hand, which is stored as SongMeta.customGenre instead. */
  genre?: string;
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
  /** Lyrics the user pasted or fetched, kept with the song rather than beside
   *  the file. Plain text, or .lrc with timestamps for the karaoke view. */
  customLyrics?: string;
  /** A genre the user typed. Wins over the scanned genre, same as customName
   *  wins over the scanned title. */
  customGenre?: string;
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