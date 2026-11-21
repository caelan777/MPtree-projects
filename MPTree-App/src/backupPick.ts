import type { Playlist } from "./types";
import type { BackupData, BackupParts } from "./storage";
import type { CloudApp } from "./plugins";
import { t, tn } from "./i18n";

// ─── WHAT A BACKUP HOLDS ─────────────────────────────────────────────────────
//
// In Backup the person picks tiles: All songs, and any of their playlists
// (BackupPage). Likes, covers, names and settings always go along with the
// songs; the bin never does. These two turn a pick into what goes into a
// backup, and into what comes back out of one.

export type BackupPick = {
  /** Every song, not only those in the playlists picked. */
  all: boolean;
  /** The playlists picked, by id. */
  playlists: string[];
};

export const nothingPicked = (p: BackupPick) => !p.all && p.playlists.length === 0;

/** The file a song plays: a cut's id is its file's path with "__cut__..." on it. */
export const fileOf = (id: string) => id.split("__cut__")[0];

/** Which songs (ids) a backup made with `pick` takes. */
export function songIdsFor(pick: BackupPick, songIds: string[], playlists: Playlist[]): Set<string> {
  if (pick.all) return new Set(songIds);
  const picked = new Set(pick.playlists);
  const ids = new Set<string>();
  for (const p of playlists) if (picked.has(p.id)) for (const id of p.songIds) ids.add(id);
  return ids;
}

/** A backup cut down to what was picked to come back: the playlists picked,
 *  and the songs of All songs or of those playlists, with their likes, covers
 *  and names. `files`: the original paths of the songs to unpack. */
export function restoreOf(data: BackupData, pick: BackupPick): { data: BackupData; files: string[] } {
  const picked = new Set(pick.playlists);
  const playlists = (data.playlists ?? []).filter(p => picked.has(p.id));
  const wanted = new Set<string>();
  for (const p of playlists) for (const s of p.songs) wanted.add(fileOf(s.path));
  const keep = (key: string) => pick.all || wanted.has(fileOf(key));
  const meta: BackupData["meta"] = {};
  for (const [key, value] of Object.entries(data.meta ?? {})) if (keep(key)) meta[key] = value;
  const files = (data.musicFiles ?? []).filter(keep);
  const was: BackupParts = data.parts ?? { playlists: true, covers: true, details: true, bin: true, settings: false };
  return {
    data: {
      ...data,
      playlists,
      meta,
      liked: (data.liked ?? []).filter(keep),
      cutTracks: (data.cutTracks ?? []).filter(c => keep(c.path)),
      removedSongs: [],
      musicFiles: files,
      // No playlist picked: the playlists here are left as they are.
      parts: { ...was, playlists: playlists.length > 0, bin: false },
    },
    files,
  };
}

/** About how big a set of songs is, from their length: 256 kbps, and 4 MB
 *  for a song whose length is not known. */
export function bytesOf(durationsMs: (number | undefined)[]): number {
  let n = 0;
  for (const d of durationsMs) n += d && d > 0 ? (d / 1000) * 32_000 : 4_000_000;
  return n;
}

/** For tests and logs; the pages use fmtBytes. */
export function sizeText(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

// ── The steps of the Backup pages (components/BackupPage.tsx) ──────────────

export type BackupStep =
  | { kind: "home" }
  | { kind: "pick"; initial?: BackupPick }
  | { kind: "where"; pick: BackupPick }
  | { kind: "busy"; title: string; line: string; done: number; total: number; unit: "songs" | "bytes" | "none"; stop?: boolean }
  | { kind: "made"; app: CloudApp; what: string }
  | { kind: "from" }
  | { kind: "restorePick"; data: BackupData }
  | { kind: "restored"; songs: number; playlists: number }
  | { kind: "error"; message: string; back: "home" | "from" };

export const CLOUD_NAME: Record<CloudApp, string> = { drive: "Google Drive", onedrive: "OneDrive", dropbox: "Dropbox" };

/** Where the back arrow (and Android's back) goes from a step; null leaves
 *  Backup, "stay" is a step that cannot be left halfway. */
export function backOf(s: BackupStep): BackupStep | null | "stay" {
  switch (s.kind) {
    case "home": return null;
    case "pick": return { kind: "home" };
    case "where": return { kind: "pick", initial: s.pick };
    case "busy": return "stay";
    case "made": case "restored": return null;
    case "from": return { kind: "home" };
    case "restorePick": return { kind: "from" };
    case "error": return { kind: s.back };
  }
}

/** "All songs, 2 playlists", "3 playlists", "All songs". */
export function pickText(pick: BackupPick, total: number): string {
  const lists = pick.playlists.length;
  if (pick.all && lists > 0 && lists === total) return t("Everything");
  if (pick.all && lists > 0) return `${t("All songs")}, ${tn(lists, "{n} playlist", "{n} playlists")}`;
  if (pick.all) return t("All songs");
  return tn(lists, "{n} playlist", "{n} playlists");
}
