// ─── EMBEDDED COVER ART, FOR LISTS ───────────────────────────────────────────
//
// Songs that carry a cover inside the file used to show the grey note anyway,
// everywhere except the player: the only artwork the lists knew about was a
// photo the user had picked by hand.
//
// Fetching it is not free, so this module does three things:
//
//  1. Asks native for a THUMBNAIL, not the picture. AudioPlayer.getAlbumArt
//     returns the embedded image at its original size, which is right for the
//     one now-playing track and ruinous for a list: covers are routinely
//     1000x1000, and a few hundred of those as base64 would be tens of
//     megabytes on the JS heap. getAlbumArtThumb returns a few KB instead.
//
//  2. Caches every answer for the session, including "this file has none", so
//     a song is probed at most once no matter how often it scrolls past.
//
//  3. Runs at most MAX_IN_FLIGHT requests at a time. The songs list is
//     virtualized and only asks for rows near the viewport, but PlaylistsView
//     is not: opening a 200-song playlist mounts every row at once. Without a
//     cap that is 200 simultaneous calls across the bridge.
//
// Deliberately in memory only. Keeping thumbnails in Preferences would put
// megabytes into a store meant for small values, and a re-probe on next launch
// is cheap.

import { AudioPlayer } from "./plugins";

const THUMB_PX = 96;
const MAX_IN_FLIGHT = 3;
// The playback service binds a moment after launch, and until it does the
// plugin cannot read anything. Those answers come back ready:false and must be
// retried rather than remembered, or a row that lost that race would show the
// grey note for the rest of the session.
const RETRY_MS = 300;
const MAX_RETRIES = 20;

/** path -> data URL, or null for "checked, this file has no cover". */
const cache = new Map<string, string | null>();
/** Paths waiting for a slot, newest first: what just scrolled into view matters
 *  more than what was queued a screen ago. */
const pending: string[] = [];
const queued = new Set<string>();
const retries = new Map<string, number>();
/** Paths with a request already in the air. Between leaving the queue and
 *  landing in the cache a path is in neither, so without this a remount could
 *  ask for the same cover twice. */
const active = new Set<string>();
const subscribers = new Map<string, Set<() => void>>();
let inFlight = 0;

function notify(path: string) {
  const subs = subscribers.get(path);
  if (subs) subs.forEach(fn => fn());
}

function pump() {
  while (inFlight < MAX_IN_FLIGHT && pending.length) {
    const path = pending.pop()!;
    queued.delete(path);
    if (cache.has(path) || active.has(path)) continue;
    active.add(path);
    inFlight++;
    AudioPlayer.getAlbumArtThumb({ path, maxPx: THUMB_PX })
      .then(({ art, ready }) => {
        if (ready === false) {
          // Not "no cover": nothing could look yet. Try again shortly, but not
          // forever, so a permanently unbound service settles instead of spinning.
          const n = (retries.get(path) ?? 0) + 1;
          if (n <= MAX_RETRIES) {
            retries.set(path, n);
            setTimeout(() => { requestArt(path); }, RETRY_MS);
            return;
          }
        }
        retries.delete(path);
        cache.set(path, art ? `data:image/jpeg;base64,${art}` : null);
      })
      .catch(() => {
        // A file that cannot be read is treated as having no cover. Retrying
        // would just fail again on every scroll past the same row.
        cache.set(path, null);
      })
      .finally(() => {
        active.delete(path);
        inFlight--;
        notify(path);
        pump();
      });
  }
}

/** The cover if we already have it, undefined if we have not looked yet. */
export function peekArt(path: string): string | null | undefined {
  return cache.get(path);
}

/** Ask for a cover, if it is not cached or already queued. */
export function requestArt(path: string): void {
  if (!path || cache.has(path) || queued.has(path) || active.has(path)) return;
  queued.add(path);
  pending.push(path);
  pump();
}

export function subscribeArt(path: string, fn: () => void): () => void {
  let subs = subscribers.get(path);
  if (!subs) { subs = new Set(); subscribers.set(path, subs); }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) subscribers.delete(path);
  };
}

/** Forget one entry, so the next request re-reads the file. Used when a song's
 *  own bytes change under it, i.e. after a cut is saved. */
export function invalidateArt(path: string): void {
  cache.delete(path);
  notify(path);
}
