import { Preferences } from "@capacitor/preferences";

// ─── DISCOVER: FREE MUSIC ────────────────────────────────────────────────────
// Two sources, both of which offer the files for download themselves and allow
// that in an app with Pro and ads. See docs/discover-sources.md.
//
// Audius: only tracks the artist chose to offer for download, with no gate in
// front (no purchase, no follow). Those come with Audius' Open Music License
// for music players.
//
// The Internet Archive: netlabel albums and Musopen's classical recordings,
// and only items whose licence allows any use with credit: CC BY, CC BY-SA,
// CC0 or the Public Domain Mark. Never NC or ND; the licence is checked in the
// search and again on the item itself.
//
// Nothing is streamed into the library: a song plays from its source, and
// Download saves the file itself into Music/MPTree.

const API = "https://api.audius.co/v1";
const APP = "MPTree";
const IA = "https://archive.org";

export type Source = "audius" | "archive";

export type FreeTrack = {
  /** Audius' id, or "ia:<item>/<file>" for the Internet Archive. */
  id: string;
  source: Source;
  title: string;
  artist: string;
  genre: string;
  /** Seconds. */
  duration: number;
  art: string | null;
  /** Other hosts that serve the same cover, for when `art`'s host is down. */
  mirrors: string[];
  /** The licence, e.g. "CC BY 3.0" or what the artist put on it. "" when nothing. */
  license: string;
  /** The file name as uploaded, which says what format arrives. */
  fileName: string;
  /** Where the song lives, for the credit. */
  permalink: string;
  /** What plays, and what is saved. */
  stream: string;
  file: string;
  /** Audius only: the artist's account, picture and followers, for Popular artists. */
  artistId?: string;
  artistPic?: string | null;
  followers?: number;
};

export type Artist = { id: string; name: string; pic: string | null; mirrors: string[]; followers: number };

export type Shelf = {
  key: string;
  label: string;
  source: Source;
  /** Audius' own genre spelling. */
  genre?: string;
  /** The Internet Archive search, before the licence filter is added. */
  ia?: string;
  /** How many songs one album may give the row; the rest is under See all. */
  perAlbum?: number;
};

/** The rows on the page, in order. */
export const SHELVES: Shelf[] = [
  { key: "Lo-Fi",       label: "Lo-fi",      source: "audius", genre: "Lo-Fi" },
  { key: "Electronic",  label: "Electronic", source: "audius", genre: "Electronic" },
  { key: "Hip-Hop/Rap", label: "Hip-hop",    source: "audius", genre: "Hip-Hop/Rap" },
  { key: "Pop",         label: "Pop",        source: "audius", genre: "Pop" },
  { key: "Rock",        label: "Rock",       source: "audius", genre: "Rock" },
  { key: "ia-netlabels", label: "Netlabels", source: "archive", ia: "collection:netlabels", perAlbum: 2 },
  { key: "R&B/Soul",    label: "R&B",        source: "audius", genre: "R&B/Soul" },
  { key: "Ambient",     label: "Ambient",    source: "audius", genre: "Ambient" },
  { key: "Acoustic",    label: "Acoustic",   source: "audius", genre: "Acoustic" },
  { key: "Jazz",        label: "Jazz",       source: "audius", genre: "Jazz" },
  { key: "Classical",   label: "Classical",  source: "audius", genre: "Classical" },
  { key: "ia-musopen",  label: "Classical, public domain", source: "archive", ia: "(collection:musopen OR subject:musopen)", perAlbum: 6 },
];

// Formats MPTree plays. Anything else (aif, a zip of stems) is left out.
const PLAYABLE = /\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i;

// Producers share loops, sample packs and stems as free downloads too. Those
// are building blocks, not songs, so they stay off the page, as do clips.
const NOT_A_SONG = /\b(loops?|samples?|sample pack|stems?|drum ?kit|type beat|acapella|preset|midi)\b/i;
const MIN_SECONDS = 60;

// ── Audius ──────────────────────────────────────────────────────────────────
type Raw = {
  id: string; title: string; genre?: string; duration?: number; license?: string | null;
  orig_filename?: string | null; permalink?: string;
  is_downloadable?: boolean; is_download_gated?: boolean; is_delete?: boolean; is_available?: boolean;
  artwork?: { mirrors?: string[] } & Record<string, unknown> | null;
  user?: { id?: string; name?: string; handle?: string; follower_count?: number; profile_picture?: { mirrors?: string[] } & Record<string, unknown> | null };
};

function toTrack(r: Raw): FreeTrack | null {
  if (!r.is_downloadable || r.is_download_gated || r.is_delete || r.is_available === false) return null;
  const fileName = r.orig_filename ?? "";
  if (!PLAYABLE.test(fileName)) return null;
  if (NOT_A_SONG.test(r.title ?? "") || (r.duration ?? 0) < MIN_SECONDS) return null;
  const id = encodeURIComponent(r.id);
  return {
    id: r.id,
    source: "audius",
    title: (r.title ?? "").trim() || "Untitled",
    artist: (r.user?.name ?? r.user?.handle ?? "").trim(),
    genre: r.genre ?? "",
    duration: r.duration ?? 0,
    art: (r.artwork?.["480x480"] ?? r.artwork?.["150x150"] ?? null) as string | null,
    mirrors: Array.isArray(r.artwork?.mirrors) ? r.artwork!.mirrors!.filter(m => m.startsWith("https://")) : [],
    license: (r.license ?? "").trim(),
    fileName,
    permalink: r.permalink ? "https://audius.co" + r.permalink : "https://audius.co",
    stream: `${API}/tracks/${id}/stream?app_name=${APP}`,
    file: `${API}/tracks/${id}/download?app_name=${APP}`,
    artistId: r.user?.id,
    artistPic: (r.user?.profile_picture?.["480x480"] ?? r.user?.profile_picture?.["150x150"] ?? null) as string | null,
    followers: r.user?.follower_count ?? 0,
  };
}

async function get(path: string, params: Record<string, string | number>): Promise<Raw[]> {
  const q = new URLSearchParams({ app_name: APP, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const r = await fetch(`${API}${path}?${q}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json() as { data?: Raw[] };
  return j.data ?? [];
}

/** Free tracks on Audius, most played first. With a genre, only that genre;
 *  with a query, a search. Audius filters on downloadable; the gate and the
 *  format are checked here, so a page can hold fewer than `limit`. */
export async function findFree(o: { genre?: string; query?: string; offset?: number; limit?: number }): Promise<FreeTrack[]> {
  const raw = await get("/tracks/search", {
    query: o.query ?? "",
    is_downloadable: "true",
    sort_method: "popular",
    limit: o.limit ?? 40,
    offset: o.offset ?? 0,
    ...(o.genre ? { genre: o.genre } : {}),
  });
  const seen = new Set<string>();
  return raw.map(toTrack).filter((t): t is FreeTrack => !!t && !seen.has(t.id) && !!seen.add(t.id));
}

// ── The Internet Archive ────────────────────────────────────────────────────
// Its search cannot take a wildcard at the front of a licence URL, so every
// allowed licence is spelled out. Netlabels used the 2.0 to 4.0 versions.
const OPEN_LICENCES: string[] = (() => {
  const out: string[] = [];
  for (const p of ["http", "https"]) {
    for (const k of ["by", "by-sa"]) for (const v of ["2.0", "2.5", "3.0", "4.0"]) out.push(`${p}://creativecommons.org/licenses/${k}/${v}/`);
    out.push(`${p}://creativecommons.org/publicdomain/zero/1.0/`, `${p}://creativecommons.org/publicdomain/mark/1.0/`);
  }
  return out;
})();

/** "CC BY 3.0", "CC BY-SA 2.5", "CC0", "Public domain"; null when not one MPTree may offer. */
export function openLicence(url: string | undefined): string | null {
  const u = (url ?? "").trim();
  if (/publicdomain\/zero/i.test(u)) return "CC0";
  if (/publicdomain\/mark/i.test(u)) return "Public domain";
  const m = u.match(/creativecommons\.org\/licenses\/(by|by-sa)\/(\d\.\d)/i);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : null;
}

// Talk, not music.
const NOT_MUSIC = 'NOT subject:(poetry OR "spoken word" OR audiobook OR podcast OR reading OR lecture OR interview OR radio OR speech)';

type IaDoc = { identifier: string };
type IaFile = { name: string; format?: string; source?: string; title?: string; creator?: string; length?: string; track?: string };
type IaItem = { metadata?: { title?: string; creator?: string | string[]; licenseurl?: string; subject?: string | string[] }; files?: IaFile[] };

async function iaSearch(base: string, offset: number, rows: number): Promise<string[]> {
  const q = `${base} AND mediatype:audio AND (${OPEN_LICENCES.map(l => `licenseurl:"${l}"`).join(" OR ")}) AND ${NOT_MUSIC}`;
  const p = new URLSearchParams({ q, rows: String(rows), page: String(Math.floor(offset / rows) + 1), output: "json" });
  p.append("fl[]", "identifier");
  p.append("sort[]", "downloads desc");
  const r = await fetch(`${IA}/advancedsearch.php?${p}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json() as { response?: { docs?: IaDoc[] } };
  return (j.response?.docs ?? []).map(d => d.identifier);
}

const seconds = (len: string | undefined) => {
  if (!len) return 0;
  if (len.includes(":")) return len.split(":").reduce((a, x) => a * 60 + Number(x || 0), 0);
  return Number(len) || 0;
};
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fileUrl = (item: string, name: string) => `${IA}/download/${encodeURIComponent(item)}/${name.split("/").map(encodeURIComponent).join("/")}`;
const titleFromName = (name: string) =>
  (name.split("/").pop() ?? name).replace(PLAYABLE, "").replace(/^\d+[\s._-]+/, "").replace(/_/g, " ").trim();

/** The songs of one item: its MP3s, one per piece (an item often has the
 *  same piece as VBR and as 64kb), in track order. */
async function iaTracks(item: string, genre: string, max: number): Promise<FreeTrack[]> {
  const r = await fetch(`${IA}/metadata/${encodeURIComponent(item)}`);
  if (!r.ok) return [];
  const j = await r.json() as IaItem;
  const licence = openLicence(j.metadata?.licenseurl);
  if (!licence || !j.files) return [];
  const albumArtist = first(j.metadata?.creator).trim();
  // The cover: a picture the uploader put there, else the Archive's own tile.
  const pic = j.files.find(f => /\.(jpe?g|png)$/i.test(f.name) && f.source === "original" && !/spectrogram|thumb|__ia_thumb/i.test(f.name));
  const art = pic ? fileUrl(item, pic.name) : `${IA}/services/img/${encodeURIComponent(item)}`;
  const seen = new Set<string>();
  const out: FreeTrack[] = [];
  const mp3s = j.files
    .filter(f => /\.mp3$/i.test(f.name) && !/_64kb\.mp3$/i.test(f.name) && /mp3/i.test(f.format ?? ""))
    .sort((a, b) => (Number(a.track) || 0) - (Number(b.track) || 0) || a.name.localeCompare(b.name));
  for (const f of mp3s) {
    // "track vbr", "track_vbr": the encoder's name, not part of the title.
    const title = ((f.title ?? "").trim() || titleFromName(f.name)).replace(/[\s_-]+vbr$/i, "").trim();
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const duration = seconds(f.length);
    if (duration < MIN_SECONDS || NOT_A_SONG.test(title)) continue;
    const url = fileUrl(item, f.name);
    out.push({
      id: `ia:${item}/${f.name}`,
      source: "archive",
      title,
      artist: (f.creator ?? "").trim() || albumArtist,
      genre,
      duration,
      art,
      mirrors: [],
      license: licence,
      fileName: f.name.split("/").pop() ?? f.name,
      permalink: `${IA}/details/${encodeURIComponent(item)}`,
      stream: url,
      file: url,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** The Archive's part of a search: songs from the albums that match, the
 *  ones whose own title or artist matches first. Only the two collections on
 *  the page, so the licence and the kind of music stay the same. */
const IA_MUSIC = "(collection:netlabels OR collection:musopen OR subject:musopen)";
export async function iaFind(query: string, page: number): Promise<FreeTrack[]> {
  // Words only: the Archive's search has its own syntax, which a title can trip.
  const words = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const q = `(${words.map(w => `"${w}"`).join(" AND ")}) AND ${IA_MUSIC}`;
  const ids = await iaSearch(q, page * 8, 8);
  const lists = await Promise.all(ids.map(id => iaTracks(id, "", 8).catch(() => [])));
  const all = lists.flat();
  const hit = (t: FreeTrack) => words.every(w => (t.title + " " + t.artist).toLowerCase().includes(w));
  return [...all.filter(hit), ...all.filter(t => !hit(t))];
}

/** A search over both sources: Audius first, then the Archive. `page` from 0. */
export async function searchAll(query: string, page: number): Promise<FreeTrack[]> {
  const [a, b] = await Promise.all([
    findFree({ query, limit: 60, offset: page * 60 }).catch(() => null),
    iaFind(query, page).catch(() => null),
  ]);
  if (!a && !b) throw new Error("offline");
  return [...(a ?? []), ...(b ?? [])];
}

/** Songs from the Archive: `perAlbum` from each of the most downloaded items. */
async function iaShelf(shelf: Shelf, offset: number, albums: number, perAlbum: number): Promise<FreeTrack[]> {
  const ids = await iaSearch(shelf.ia!, offset, albums);
  const lists = await Promise.all(ids.map(id => iaTracks(id, shelf.label, perAlbum).catch(() => [])));
  // Round robin, so one big album does not fill the start of the row.
  const out: FreeTrack[] = [];
  for (let i = 0; i < perAlbum; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** A row's full list, a page at a time (See all). */
export async function listShelf(shelf: Shelf, offset: number): Promise<FreeTrack[]> {
  if (shelf.source === "archive") return iaShelf(shelf, offset, 12, Math.max(4, shelf.perAlbum ?? 2));
  return findFree({ genre: shelf.genre, limit: 60, offset });
}
/** How far a page of listShelf moves `offset` on. */
export const pageSize = (shelf: Shelf) => (shelf.source === "archive" ? 12 : 60);

// A shelf is kept for a day, so opening the page again costs nothing.
const DAY = 24 * 60 * 60 * 1000;
const shelfKey = (key: string) => "mptree_discover5_" + key;

export async function loadShelf(shelf: Shelf): Promise<FreeTrack[]> {
  try {
    const v = (await Preferences.get({ key: shelfKey(shelf.key) })).value;
    if (v) {
      const c = JSON.parse(v) as { at: number; tracks: FreeTrack[] };
      if (Date.now() - c.at < DAY && c.tracks.length) return c.tracks;
    }
  } catch { /* nothing cached */ }
  const tracks = shelf.source === "archive"
    // A different handful of albums each day, from the 60 most downloaded.
    ? (await iaShelf(shelf, (Math.floor(Date.now() / DAY) % 5) * 12, 12, shelf.perAlbum ?? 2)).slice(0, 20)
    // Most downloadable tracks are gated or loops, so ask for more than a shelf.
    : (await findFree({ genre: shelf.genre, limit: 80 })).slice(0, 20);
  Preferences.set({ key: shelfKey(shelf.key), value: JSON.stringify({ at: Date.now(), tracks }) }).catch(() => {});
  return tracks;
}

/** Popular songs: the most played free songs on Audius, all genres. */
export const POPULAR: Shelf = { key: "popular", label: "Popular songs", source: "audius" };

/** The artists behind the songs on the page, most followed first. */
export function artistsOf(tracks: FreeTrack[], max = 16): Artist[] {
  const by = new Map<string, Artist>();
  for (const t of tracks) {
    if (!t.artistId || !t.artistPic || by.has(t.artistId)) continue;
    const path = t.artistPic.replace(/^https:\/\/[^/]+/, "");
    by.set(t.artistId, { id: t.artistId, name: t.artist, pic: t.artistPic, mirrors: t.mirrors.map(m => m.replace(/\/$/, "") + path), followers: t.followers ?? 0 });
  }
  return [...by.values()].sort((a, b) => b.followers - a.followers).slice(0, max);
}

/** An artist's free songs on Audius, most played first. */
export async function artistTracks(id: string): Promise<FreeTrack[]> {
  const raw = await get(`/users/${encodeURIComponent(id)}/tracks`, { sort_method: "plays", limit: 100 });
  const seen = new Set<string>();
  return raw.map(toTrack).filter((t): t is FreeTrack => !!t && !seen.has(t.id) && !!seen.add(t.id));
}

/** "Artist - Title.mp3", in the format the artist uploaded. */
export function saveName(t: FreeTrack): string {
  const ext = (t.fileName.match(PLAYABLE)?.[1] ?? "mp3").toLowerCase();
  const base = (t.artist ? `${t.artist} - ${t.title}` : t.title).replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${base.slice(0, 110)}.${ext}`;
}

/** The licence as a short chip: "CC BY", "CC BY-SA", or "OML" when the
 *  artist set nothing, since Audius' own licence then applies. */
export function licenceChip(license: string): string {
  if (/^CC0\b|publicdomain\/zero/i.test(license)) return "CC0";
  const cc = license.match(/CC[ -]?(BY|0)[A-Z-]*/i);
  if (cc) return cc[0].toUpperCase().replace(/^CC(?=[A-Z0-9])/, "CC ");
  if (/public domain/i.test(license)) return "PD";
  return "OML";
}

// ── Which tracks are already in Songs ───────────────────────────────────────
// Audius id → the path it was saved to, so the tile can say "In your Songs".
const SAVED = "mptree_discover_saved";

export async function loadSaved(): Promise<Record<string, string>> {
  try { return JSON.parse((await Preferences.get({ key: SAVED })).value ?? "{}"); } catch { return {}; }
}

export async function markSaved(id: string, path: string): Promise<void> {
  const all = await loadSaved();
  all[id] = path;
  await Preferences.set({ key: SAVED, value: JSON.stringify(all) }).catch(() => {});
}

/** The file name at the end of a path, which is what a scan and a save agree on. */
export const baseName = (p: string) => p.split("/").pop() ?? p;

const savedListeners = new Set<() => void>();
/** Called when songs are forgotten, so an open Discover page can reload. */
export function onSavedChange(cb: () => void): () => void {
  savedListeners.add(cb);
  return () => { savedListeners.delete(cb); };
}

/** Files that were deleted for good: their tracks can be downloaded again. */
export async function forgetSaved(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const names = new Set(paths.map(baseName));
  const all = await loadSaved();
  let changed = false;
  for (const [id, p] of Object.entries(all)) {
    if (names.has(baseName(p))) { delete all[id]; changed = true; }
  }
  if (!changed) return;
  await Preferences.set({ key: SAVED, value: JSON.stringify(all) }).catch(() => {});
  savedListeners.forEach(cb => cb());
}

/** The cover on its own host, then on each mirror. */
export function artUrls(t: FreeTrack): string[] {
  if (!t.art) return [];
  const path = t.art.replace(/^https:\/\/[^/]+/, "");
  return [t.art, ...(t.mirrors ?? []).map(m => m.replace(/\/$/, "") + path)];
}

/** For an <img>: when a cover fails, the next mirror; when all fail, nothing. */
export function nextArt(t: FreeTrack, img: HTMLImageElement): void {
  const urls = artUrls(t);
  const i = Number(img.dataset.try ?? 0) + 1;
  if (i < urls.length) { img.dataset.try = String(i); img.src = urls[i]; }
  else img.style.visibility = "hidden";
}

/** The cover as a data URL, for the song's photo in MPTree. Null when it
 *  cannot be had; the song then simply has no photo. */
export async function artDataUrl(t: FreeTrack): Promise<string | null> {
  for (const url of artUrls(t)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const b = await r.blob();
      if (!b.type.startsWith("image/") || b.size > 600_000) return null;
      return await new Promise<string | null>(res => {
        const fr = new FileReader();
        fr.onload = () => res(typeof fr.result === "string" ? fr.result : null);
        fr.onerror = () => res(null);
        fr.readAsDataURL(b);
      });
    } catch { /* the next host */ }
  }
  return null;
}
