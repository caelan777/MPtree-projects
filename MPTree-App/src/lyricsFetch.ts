// ─── LOOKING LYRICS UP ONLINE ────────────────────────────────────────────────
//
// This is the one part of MPTree that sends anything about your music anywhere,
// so it is worth being blunt about what it does.
//
// A lookup sends the track title, the artist, the album and the duration to
// lrclib.net, which answers with lyrics or nothing. It carries no device id, no
// account, no library listing, and the request arrives with your IP address the
// way any web request does. Nothing is sent unless a lookup is asked for: either
// by tapping "Search online", or by turning automatic lookups on.
//
// LRCLIB was chosen because it needs no account and no API key, so using it
// costs the user no identity, and because it returns synced .lrc, which is what
// the karaoke view wants. See Website/privacy.html, which has to keep saying the
// same thing this file does.

const ENDPOINT = "https://lrclib.net/api/get";
const SEARCH_ENDPOINT = "https://lrclib.net/api/search";
const TIMEOUT_MS = 9000;

export type LyricsHit = {
  /** Timestamped when the source had them; falls back to plain. */
  text: string;
  synced: boolean;
  title: string;
  artist: string;
};

type LrclibRecord = {
  trackName?: string;
  artistName?: string;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
};

function toHit(r: LrclibRecord): LyricsHit | null {
  if (r.instrumental) {
    return { text: "", synced: false, title: r.trackName ?? "", artist: r.artistName ?? "" };
  }
  const synced = (r.syncedLyrics ?? "").trim();
  const plain = (r.plainLyrics ?? "").trim();
  const text = synced || plain;
  if (!text) return null;
  return { text, synced: !!synced, title: r.trackName ?? "", artist: r.artistName ?? "" };
}

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Offline, blocked, slow, malformed: all the same answer here. A lyrics
    // lookup failing is never worth interrupting anyone over.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The exact match for this track, if the database has one.
 *
 * Duration matters: it is how LRCLIB tells two recordings of the same song
 * apart, and it is what stops a live version's timings being served for a studio
 * track. Seconds, rounded.
 */
export async function fetchExact(opts: {
  title: string; artist: string; album?: string; durationMs?: number;
}): Promise<LyricsHit | null> {
  const q = new URLSearchParams({
    track_name: opts.title,
    artist_name: opts.artist,
  });
  if (opts.album) q.set("album_name", opts.album);
  if (opts.durationMs && opts.durationMs > 0) {
    q.set("duration", String(Math.round(opts.durationMs / 1000)));
  }
  const data = await getJson(`${ENDPOINT}?${q.toString()}`);
  if (!data || typeof data !== "object") return null;
  return toHit(data as LrclibRecord);
}

/**
 * Candidates, for when the exact match misses: tags are often wrong or
 * incomplete, and letting someone pick beats telling them there is nothing.
 */
export async function searchLyrics(opts: {
  title: string; artist?: string;
}): Promise<LyricsHit[]> {
  const q = new URLSearchParams({ track_name: opts.title });
  if (opts.artist) q.set("artist_name", opts.artist);
  const data = await getJson(`${SEARCH_ENDPOINT}?${q.toString()}`);
  if (!Array.isArray(data)) return [];
  return (data as LrclibRecord[])
    .map(toHit)
    .filter((h): h is LyricsHit => h !== null && h.text.length > 0)
    .slice(0, 12);
}
