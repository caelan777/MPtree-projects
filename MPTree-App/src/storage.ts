import { Preferences } from "@capacitor/preferences";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { CapacitorZip } from "@capgo/capacitor-zip";
import type { Song, FilterId, PlayMode, Playlist, Theme } from "./types";
// Registered once in plugins.ts; see the note there.
import { MusicScanner } from "./plugins";

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEY_SESSION    = "mptree_session";
const KEY_META       = "mptree_meta";
const KEY_REMOVED    = "mptree_removed";
const KEY_CUT_TRACKS = "mptree_cut_tracks";
const KEY_PLAYLISTS  = "mptree_playlists";

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  filter?:         FilterId;
  playMode?:       PlayMode;
  currentId?:      string;
  queueIds?:       string[];
  positionMs?:     number;
  isPlaying?:      boolean;
  crossfadeMs?:    number;
  playbackSpeed?:  number;
  eqEnabled?:      boolean;
  eqBandLevels?:   number[];
  theme?:          Theme;
  playNextQueue?:  string[];
}

export async function saveSession(session: Session): Promise<void> {
  try {
    await Preferences.set({ key: KEY_SESSION, value: JSON.stringify(session) });
  } catch { /* ignore — best effort */ }
}

export async function loadSession(): Promise<Session> {
  try {
    const { value } = await Preferences.get({ key: KEY_SESSION });
    if (value) return JSON.parse(value) as Session;
  } catch { /* fall through */ }
  return {};
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export type SongMetaStore = Record<string, {
  customName?:   string;
  customArtist?: string;
  customGenre?:  string;
  customLyrics?: string;
  customPhoto?:  string;
  liked?:        boolean;
  lastPlayedAt?: number;
  playCount?:    number;
}>;

// ── Debounced meta save ───────────────────────────────────────────────────────

let _metaFlushTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingMeta:    SongMetaStore | null = null;

async function _flushMeta(): Promise<void> {
  if (!_pendingMeta) return;
  const snapshot = _pendingMeta;
  _pendingMeta       = null;
  _metaFlushTimer    = null;
  try {
    await Preferences.set({ key: KEY_META, value: JSON.stringify(snapshot) });
  } catch { /* ignore */ }
}

export function saveMeta(meta: SongMetaStore): void {
  _pendingMeta = meta;
  if (_metaFlushTimer) return;
  _metaFlushTimer = setTimeout(_flushMeta, 4_000);
}

export async function saveMetaNow(meta: SongMetaStore): Promise<void> {
  if (_metaFlushTimer) { clearTimeout(_metaFlushTimer); _metaFlushTimer = null; }
  _pendingMeta = null;
  try {
    await Preferences.set({ key: KEY_META, value: JSON.stringify(meta) });
  } catch { /* ignore */ }
}

export async function loadMeta(): Promise<SongMetaStore> {
  try {
    const { value } = await Preferences.get({ key: KEY_META });
    if (value) return JSON.parse(value) as SongMetaStore;
  } catch { /* fall through */ }
  return {};
}

// ─── Removed (bin) ────────────────────────────────────────────────────────────

export async function saveRemovedTracksToStorage(songs: Song[]): Promise<void> {
  try {
    await Preferences.set({ key: KEY_REMOVED, value: JSON.stringify(songs) });
  } catch { /* ignore */ }
}

export async function loadRemovedTracks(): Promise<Song[]> {
  try {
    const { value } = await Preferences.get({ key: KEY_REMOVED });
    if (value) return JSON.parse(value) as Song[];
  } catch { /* fall through */ }
  return [];
}

// ─── Cut tracks ───────────────────────────────────────────────────────────────

export async function saveCutTracksToStorage(songs: Song[]): Promise<void> {
  try {
    await Preferences.set({ key: KEY_CUT_TRACKS, value: JSON.stringify(songs) });
  } catch { /* ignore */ }
}

export async function loadCutTracks(): Promise<Song[]> {
  try {
    const { value } = await Preferences.get({ key: KEY_CUT_TRACKS });
    if (value) return JSON.parse(value) as Song[];
  } catch { /* fall through */ }
  return [];
}

// ─── Playlists ────────────────────────────────────────────────────────────────

export async function loadPlaylists(): Promise<Playlist[]> {
  try {
    const { value } = await Preferences.get({ key: KEY_PLAYLISTS });
    if (value) return JSON.parse(value) as Playlist[];
  } catch { /* fall through */ }
  return [];
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  try {
    await Preferences.set({ key: KEY_PLAYLISTS, value: JSON.stringify(playlists) });
  } catch { /* ignore */ }
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupSong {
  id: string;
  title: string;
  artist: string;
  path: string;
  duration?: number;
}

export interface BackupPlaylist {
  id: string;
  name: string;
  createdAt: number;
  coverPhoto?: string;
  songs: BackupSong[];
}

export interface BackupRemovedSong {
  id: string;
  title: string;
  artist: string;
  path: string;
  dateAdded?: number;
}

export interface BackupCutTrack {
  id: string;
  title: string;
  artist: string;
  path: string;
  cutFrom?: number;
  cutTo?: number;
}

export interface BackupData {
  version:      number;
  exportedAt:   number;
  playlists:    BackupPlaylist[];
  meta:         SongMetaStore;
  removedSongs: BackupRemovedSong[];
  cutTracks:    BackupCutTrack[];
  liked:        string[];
  // Music file backup fields (v1 extension — present when includeMusic=true)
  includeMusic?: boolean;
  musicDir?:     string; // e.g. "Download/MPTree_Backup_1234567890"
}

// ── Export result ─────────────────────────────────────────────────────────────

export interface ExportResult {
  /** Human-readable relative path, e.g. "MPTree_Backup_1234567890" */
  folderName: string;
  /** file:// URI of the JSON file for sharing */
  jsonUri: string;
  /** Number of audio files that failed to copy */
  failedCount: number;
}

// ── Storage-full detection ────────────────────────────────────────────────────

function isStorageFullError(e: unknown): boolean {
  const msg = String(e).toLowerCase();
  return msg.includes("enospc") || msg.includes("no space") || msg.includes("not enough space");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the filename from an absolute path. */
function basename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/**
 * Copy one audio file into the backup music subfolder.
 * Returns true on success, false if the copy failed (caller handles it).
 * Re-throws ENOSPC errors so the caller can stop the loop.
 */
async function copyAudioFile(
  srcAbsPath: string,
  destRelDir: string,
): Promise<boolean> {
  try {
    const filename = basename(srcAbsPath);
    await Filesystem.copy({
      from:          srcAbsPath,
      to:            `${destRelDir}/${filename}`,
      toDirectory:   Directory.ExternalStorage,
    });
    return true;
  } catch (e) {
    if (isStorageFullError(e)) throw e; // propagate — stop the backup
    return false; // other errors (missing file, permission) → skip silently
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export a backup (always includes music files).
 *
 * @param data        The metadata/playlist payload to serialise.
 * @param songPaths   Absolute audio file paths to copy into the backup folder.
 * @param backupName  Custom folder name (without "Download/" prefix).
 * @param onProgress  Called after each file is processed (done, total).
 * @param cancelRef   If cancelRef.current becomes true, the copy loop stops.
 * @returns           ExportResult with folder name, JSON URI, and failed count.
 */
export async function exportBackup(
  data: BackupData,
  songPaths: string[],
  backupName: string,
  onProgress?: (done: number, total: number) => void,
  cancelRef?: { current: boolean },
): Promise<ExportResult> {
  const backupFolder = `Download/${backupName}`;
  const musicSubdir  = `${backupFolder}/music`;

  // Create the music subdirectory by writing a sentinel file.
  await Filesystem.writeFile({
    path:      `${musicSubdir}/.nomedia`,
    data:      "",
    directory: Directory.ExternalStorage,
    encoding:  Encoding.UTF8,
    recursive: true,
  });

  // Write JSON first so partial backups are recoverable.
  const ts = data.exportedAt;
  const jsonFilename = `mptree_backup_${ts}.json`;
  data.includeMusic = true;
  data.musicDir     = backupFolder;

  await Filesystem.writeFile({
    path:      `${backupFolder}/${jsonFilename}`,
    data:      JSON.stringify(data, null, 2),
    directory: Directory.ExternalStorage,
    encoding:  Encoding.UTF8,
    recursive: true,
  });

  // Copy audio files one by one.
  let done        = 0;
  let failedCount = 0;
  const total     = songPaths.length;

  for (const srcPath of songPaths) {
    if (cancelRef?.current) break;

    try {
      const ok = await copyAudioFile(srcPath, musicSubdir);
      if (!ok) failedCount++;
    } catch (e) {
      // Storage full — stop and surface a clear message.
      if (isStorageFullError(e)) {
        const { uri: jsonUri } = await Filesystem.getUri({
          directory: Directory.ExternalStorage,
          path: `${backupFolder}/${jsonFilename}`,
        });
        // Throw a special object so the caller can distinguish ENOSPC.
        throw Object.assign(new Error("ENOSPC"), {
          isStorageFull: true,
          copiedCount:   done,
          jsonUri,
          folderName:    backupName,
        });
      }
      failedCount++;
    }

    done++;
    onProgress?.(done, total);
  }

  // Get the file:// URI for the JSON so the share sheet can reference it.
  const { uri: jsonUri } = await Filesystem.getUri({
    directory: Directory.ExternalStorage,
    path: `${backupFolder}/${jsonFilename}`,
  });

  return { folderName: backupName, jsonUri, failedCount };
}

// ── Zip the whole backup folder (JSON + music) for sharing ────────────────────

export interface ZipResult {
  /** file:// URI of the created .zip, ready to pass to Share.share() */
  zipUri: string;
}

/**
 * Zips the entire backup folder (JSON + music/ subfolder) into a single
 * `[backupName].zip` placed alongside it in Download/, using native zip4j
 * (no JS-bridge/base64 overhead — safe for large music libraries).
 */
export async function zipBackupFolder(backupName: string): Promise<ZipResult> {
  const backupFolder = `Download/${backupName}`;

  const { uri: folderUri } = await Filesystem.getUri({
    directory: Directory.ExternalStorage,
    path: backupFolder,
  });

  // CapacitorZip wants plain absolute paths, not file:// URIs.
  const sourcePath = folderUri.replace(/^file:\/\//, "");
  const zipFilename = `${backupName}.zip`;
  const zipRelPath  = `Download/${zipFilename}`;

  const { uri: zipFolderUri } = await Filesystem.getUri({
    directory: Directory.ExternalStorage,
    path: "Download",
  });
  const destinationPath = `${zipFolderUri.replace(/^file:\/\//, "")}/${zipFilename}`;

  await CapacitorZip.zip({
    source:      sourcePath,
    destination: destinationPath,
  });

  const { uri: zipUri } = await Filesystem.getUri({
    directory: Directory.ExternalStorage,
    path: zipRelPath,
  });

  return { zipUri };
}

// ── Scan backup music folder so Android indexes the copied files ──────────────

export async function scanBackupFolder(absoluteFolderPath: string): Promise<void> {
  try {
    await MusicScanner.scanFolder({ path: absoluteFolderPath });
  } catch {
    // Non-fatal — the user can pull-to-refresh manually.
  }
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseBackup(json: string): BackupData {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || raw["version"] !== 1) {
    throw new Error("Unsupported backup version");
  }
  return raw as unknown as BackupData;
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importBackup(
  data: BackupData,
  pathRemap?: Map<string, string>,
): Promise<{
  playlists:    Playlist[];
  meta:         SongMetaStore;
  removedSongs: Song[];
  cutTracks:    Song[];
}> {
  const remap = (p: string) => pathRemap?.get(p) ?? p;

  const playlists: Playlist[] = data.playlists.map(pl => ({
    id:         pl.id,
    name:       pl.name,
    songIds:    pl.songs.map(s => remap(s.path)),
    createdAt:  pl.createdAt,
    coverPhoto: pl.coverPhoto,
  }));

  let metaOut: SongMetaStore = { ...data.meta };
  if (pathRemap && pathRemap.size > 0) {
    metaOut = {};
    for (const [oldKey, value] of Object.entries(data.meta)) {
      const newKey = remap(oldKey);
      metaOut[newKey] = value;
    }
  }

  for (const origPath of data.liked) {
    const key = remap(origPath);
    metaOut[key] = { ...(metaOut[key] ?? {}), liked: true };
  }

  const removedSongs: Song[] = data.removedSongs.map(s => ({
    id:        remap(s.path),
    title:     s.title,
    artist:    s.artist,
    uri:       remap(s.path),
    dateAdded: s.dateAdded ?? 0,
  }));

  const cutTracks: Song[] = data.cutTracks.map(s => ({
    id:        remap(s.path),
    title:     s.title,
    artist:    s.artist,
    uri:       remap(s.path),
    dateAdded: Date.now(),
    isCut:     true as const,
    cutFrom:   s.cutFrom,
    cutTo:     s.cutTo,
  }));

  await Promise.all([
    savePlaylists(playlists),
    saveMetaNow(metaOut),
    saveRemovedTracksToStorage(removedSongs),
    saveCutTracksToStorage(cutTracks),
  ]);

  return { playlists, meta: metaOut, removedSongs, cutTracks };
}