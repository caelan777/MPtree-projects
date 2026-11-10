import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

// ─── THE ANONYMOUS COUNTER ───────────────────────────────────────────────────
//
// At a few moments the app opens an empty address on mp-tree.net,
// /a/<platform>/<event>, and that is all. Cloudflare counts the requests per
// path, day and country; nothing else is kept (functions/a, and "The anonymous
// counter" on the privacy page). No id, no cookie, nothing about the songs.
//
// "Once a day" events remember the date they last went out, so a day's count
// of "open" is how many phones opened MPTree that day. Test builds count as
// android-test, so Caelan's own tapping stays out of the real numbers. Nothing
// is sent from the browser demo.

export type CountEvent = "open" | "tab-songs" | "tab-playlists" | "pro-open" | "pro-buy" | "ad-start" | "ad-done" | "ad-missing"
  | "discover" | "discover-play" | "discover-download";

const BASE = "https://mp-tree.net/a/";
const platform = Capacitor.getPlatform();
const where = platform === "web" ? null : __PRO_TEST__ ? `${platform}-test` : platform;

export function count(event: CountEvent): void {
  if (!where) return;
  fetch(`${BASE}${where}/${event}`, { cache: "no-store", credentials: "omit" }).catch(() => {});
}

const today = () => new Date().toISOString().slice(0, 10);
const sentOn = new Map<CountEvent, string>();

/** Once a day per phone, whatever the number of calls. */
export function countDaily(event: "open" | "tab-songs" | "tab-playlists" | "discover"): void {
  if (!where || sentOn.get(event) === today()) return;
  sentOn.set(event, today());
  const key = `mptree_count_${event}`;
  Preferences.get({ key }).then(r => {
    if (r.value === today()) return;
    count(event);
    return Preferences.set({ key, value: today() });
  }).catch(() => {});
}
