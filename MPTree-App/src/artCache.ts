// ─── COVER ART, FOR LISTS ────────────────────────────────────────────────────
//
// Songs that carry a cover used to show the grey note anyway everywhere except
// the player: the only artwork the lists knew about was a photo the user had
// picked by hand.
//
// Four things make this cheap enough to run on every visible row:
//
//  1. Lookups are keyed by ALBUM where MediaStore gave us an album id, and by
//     file path only as a fallback. That is the whole performance story: every
//     song on an album shares one entry and one lookup, so a 500-song library
//     across 40 albums does 40 reads instead of 500. Native prefers the system's
//     cached album thumbnail for those, which is far cheaper than opening the
//     file and parsing its tags.
//
//  2. Native returns a THUMBNAIL, not the picture. getAlbumArt hands back the
//     embedded image at original size, which is right for the one now-playing
//     track and ruinous for a list: covers are routinely 1000x1000, and a few
//     hundred of those as base64 is tens of megabytes on the JS heap.
//
//  3. Every answer is cached for the session, including "there is no cover", so
//     nothing is looked up twice however often it scrolls past.
//
//  4. At most MAX_IN_FLIGHT requests run at once. The songs list is virtualized
//     and only asks for rows near the viewport, but PlaylistsView is not, so
//     opening a 200-song playlist mounts every row at once.
//
// Deliberately in memory only. Keeping thumbnails in Preferences would put
// megabytes into a store meant for small values, and re-reading them on the next
// launch is cheap.

import { AudioPlayer } from "./plugins";

const THUMB_PX = 96;
const MAX_IN_FLIGHT = 3;
// The playback service binds a moment after launch, and until it does the plugin
// cannot read anything. Those answers come back ready:false and must be retried
// rather than remembered, or a row that lost that race would show the grey note
// for the rest of the session.
const RETRY_MS = 300;
const MAX_RETRIES = 20;

/** The cache key for a song: its album when known, else its own file. */
export function artKey(songPath: string, albumId?: number): string {
  return albumId && albumId > 0 ? `album:${albumId}` : `path:${songPath}`;
}

/** key -> data URL, or null for "checked, there is no cover". */
const cache = new Map<string, string | null>();
/** Keys waiting for a slot, newest first: what just scrolled into view matters
 *  more than what was queued a screen ago. */
const pending: string[] = [];
const queued = new Set<string>();
const retries = new Map<string, number>();
/** Keys with a request already in the air. Between leaving the queue and landing
 *  in the cache a key is in neither, so without this a remount could ask twice. */
const active = new Set<string>();
/** key -> a file to read if the album route finds nothing. */
const keyPath = new Map<string, string>();
const subscribers = new Map<string, Set<() => void>>();
let inFlight = 0;

function notify(key: string) {
  const subs = subscribers.get(key);
  if (subs) subs.forEach(fn => fn());
}

function pump() {
  while (inFlight < MAX_IN_FLIGHT && pending.length) {
    const key = pending.pop()!;
    queued.delete(key);
    if (cache.has(key) || active.has(key)) continue;
    active.add(key);
    inFlight++;

    const sep = key.indexOf(":");
    const kind = key.slice(0, sep);
    const rest = key.slice(sep + 1);

    AudioPlayer.getAlbumArtThumb({
      path: keyPath.get(key) ?? (kind === "path" ? rest : ""),
      albumId: kind === "album" ? Number(rest) : 0,
      maxPx: THUMB_PX,
    })
      .then(({ art, ready }) => {
        if (ready === false) {
          // Not "no cover": nothing could look yet. Try again shortly, but not
          // forever, so a permanently unbound service settles instead of spinning.
          const n = (retries.get(key) ?? 0) + 1;
          if (n <= MAX_RETRIES) {
            retries.set(key, n);
            setTimeout(() => { requestArt(key); }, RETRY_MS);
            return;
          }
        }
        retries.delete(key);
        cache.set(key, art ? `data:image/jpeg;base64,${art}` : null);
      })
      .catch(() => {
        // A file that cannot be read is treated as having no cover. Retrying
        // would just fail again on every scroll past the same row.
        cache.set(key, null);
      })
      .finally(() => {
        active.delete(key);
        inFlight--;
        notify(key);
        pump();
      });
  }
}

/** The cover if we already have it, undefined if we have not looked yet. */
export function peekArt(key: string): string | null | undefined {
  return cache.get(key);
}

/** Ask for a cover. filePath is the fallback to read when an album lookup misses. */
export function requestArt(key: string, filePath?: string): void {
  if (filePath && !keyPath.has(key)) keyPath.set(key, filePath);
  if (!key || cache.has(key) || queued.has(key) || active.has(key)) return;
  queued.add(key);
  pending.push(key);
  pump();
}

export function subscribeArt(key: string, fn: () => void): () => void {
  let subs = subscribers.get(key);
  if (!subs) { subs = new Set(); subscribers.set(key, subs); }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) subscribers.delete(key);
  };
}

/** Forget one entry, so the next request re-reads it. Used when a song's own
 *  bytes change under it, i.e. after a cut is saved. */
export function invalidateArt(key: string): void {
  cache.delete(key);
  notify(key);
}
