import { Preferences } from "@capacitor/preferences";

// ─── DISCOVER: FREE MUSIC FROM AUDIUS ────────────────────────────────────────
// Only tracks the artist chose to offer for download, and only the ones with
// no gate in front (no purchase, no follow). Those come with Audius' Open Music
// License for music players. Nothing is streamed into the library: a preview
// plays from Audius, and Download saves the artist's own file into
// Music/MPTree. See docs/discover-sources.md.

const API = "https://api.audius.co/v1";
const APP = "MPTree";

export type FreeTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  /** Seconds. */
  duration: number;
  art: string | null;
  /** What the artist put on it, e.g. "Attribution CC BY". "" when nothing. */
  license: string;
  /** The file name the artist uploaded, which says what format arrives. */
  fileName: string;
  permalink: string;
};

/** The shelves on the page, in order. `genre` is Audius' own spelling. */
export const SHELVES: { genre: string; label: string }[] = [
  { genre: "Lo-Fi",        label: "Lo-fi" },
  { genre: "Electronic",   label: "Electronic" },
  { genre: "Hip-Hop/Rap",  label: "Hip-hop" },
  { genre: "Pop",          label: "Pop" },
  { genre: "Rock",         label: "Rock" },
  { genre: "R&B/Soul",     label: "R&B" },
  { genre: "Ambient",      label: "Ambient" },
  { genre: "Acoustic",     label: "Acoustic" },
  { genre: "Jazz",         label: "Jazz" },
  { genre: "Classical",    label: "Classical" },
];

// Formats MPTree plays. Anything else (aif, a zip of stems) is left out.
const PLAYABLE = /\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i;

// Producers share loops, sample packs and stems as free downloads too. Those
// are building blocks, not songs, so they stay off the page, as do clips.
const NOT_A_SONG = /\b(loops?|samples?|sample pack|stems?|drum ?kit|type beat|acapella|preset|midi)\b/i;
const MIN_SECONDS = 60;

type Raw = {
  id: string; title: string; genre?: string; duration?: number; license?: string | null;
  orig_filename?: string | null; permalink?: string;
  is_downloadable?: boolean; is_download_gated?: boolean; is_delete?: boolean; is_available?: boolean;
  artwork?: Record<string, string> | null;
  user?: { name?: string; handle?: string };
};

function toTrack(r: Raw): FreeTrack | null {
  if (!r.is_downloadable || r.is_download_gated || r.is_delete || r.is_available === false) return null;
  const fileName = r.orig_filename ?? "";
  if (!PLAYABLE.test(fileName)) return null;
  if (NOT_A_SONG.test(r.title ?? "") || (r.duration ?? 0) < MIN_SECONDS) return null;
  return {
    id: r.id,
    title: (r.title ?? "").trim() || "Untitled",
    artist: (r.user?.name ?? r.user?.handle ?? "").trim(),
    genre: r.genre ?? "",
    duration: r.duration ?? 0,
    art: r.artwork?.["480x480"] ?? r.artwork?.["150x150"] ?? null,
    license: (r.license ?? "").trim(),
    fileName,
    permalink: r.permalink ? "https://audius.co" + r.permalink : "https://audius.co",
  };
}

async function get(path: string, params: Record<string, string | number>): Promise<Raw[]> {
  const q = new URLSearchParams({ app_name: APP, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const r = await fetch(`${API}${path}?${q}`);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const j = await r.json() as { data?: Raw[] };
  return j.data ?? [];
}

/** Free tracks, most played first. With a genre, only that genre; with a
 *  query, a search. Audius filters on downloadable; the gate and the format
 *  are checked here, so a page can hold fewer than `limit`. */
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

// A shelf is kept for a day, so opening the page again costs nothing.
const DAY = 24 * 60 * 60 * 1000;
const shelfKey = (genre: string) => "mptree_discover2_" + genre;

export async function loadShelf(genre: string): Promise<FreeTrack[]> {
  try {
    const v = (await Preferences.get({ key: shelfKey(genre) })).value;
    if (v) {
      const c = JSON.parse(v) as { at: number; tracks: FreeTrack[] };
      if (Date.now() - c.at < DAY && c.tracks.length) return c.tracks;
    }
  } catch { /* nothing cached */ }
  // Most downloadable tracks are gated or loops, so ask for more than a shelf.
  const tracks = (await findFree({ genre, limit: 80 })).slice(0, 20);
  Preferences.set({ key: shelfKey(genre), value: JSON.stringify({ at: Date.now(), tracks }) }).catch(() => {});
  return tracks;
}

export const previewUrl = (id: string) => `${API}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`;
export const downloadUrl = (id: string) => `${API}/tracks/${encodeURIComponent(id)}/download?app_name=${APP}`;

/** "Artist - Title.mp3", in the format the artist uploaded. */
export function saveName(t: FreeTrack): string {
  const ext = (t.fileName.match(PLAYABLE)?.[1] ?? "mp3").toLowerCase();
  const base = (t.artist ? `${t.artist} - ${t.title}` : t.title).replace(/[\\/:*?"<>|]/g, "_").trim();
  return `${base.slice(0, 110)}.${ext}`;
}

/** The licence as a short chip: "CC BY", "CC BY-SA", or "OML" when the
 *  artist set nothing, since Audius' own licence then applies. */
export function licenceChip(license: string): string {
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

/** The cover as a data URL, for the song's photo in MPTree. Null when it
 *  cannot be had; the song then simply has no photo. */
export async function artDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const b = await (await fetch(url)).blob();
    if (!b.type.startsWith("image/") || b.size > 600_000) return null;
    return await new Promise<string | null>(res => {
      const fr = new FileReader();
      fr.onload = () => res(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => res(null);
      fr.readAsDataURL(b);
    });
  } catch { return null; }
}
