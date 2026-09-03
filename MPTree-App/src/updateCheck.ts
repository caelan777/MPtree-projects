import { Preferences } from "@capacitor/preferences";

// ─── UPDATE CHECK ────────────────────────────────────────────────────────────
// Tells someone running an older build that a newer one is on the website.
//
// IMPORTANT — this is deliberately limited to the build that the website hands
// out. Google Play forbids an app distributed through Play from pointing users
// at another download channel for its own updates, which is why the in-app
// download feature was removed in the first place. `__DISTRIBUTION__` comes
// from the build mode (see vite.config.ts): `npm run build:play` and
// `npm run build:demo` make it something other than "web", and this function
// then returns before touching the network at all.
//
// Everything else about MPTree stays offline: this is one small GET of a static
// JSON file, only when the app is opened, at most once a day, and nothing about
// the device or its library is sent.

const MANIFEST_URL = "https://mp-tree.net/version.json";
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY = "mptree_update_last_check";
const DISMISSED_KEY  = "mptree_update_dismissed";

export type UpdateInfo = {
  version: string;
  date?: string;
  /** Short "what changed" lines, if the manifest carries them. */
  notes?: string[];
  /** Where to send the user. Always a page, never a file. */
  url: string;
};

/** "0.2.0" > "0.1.11" — numeric, segment by segment, missing segments are 0. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => String(v).split(".").map(n => parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Resolves to the newer release when there is one worth mentioning, else null.
 * Never throws: no network, a rejected fetch and a malformed manifest all just
 * mean "nothing to report".
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  if (__DISTRIBUTION__ !== "web") return null;

  try {
    const [{ value: lastCheck }, { value: dismissed }] = await Promise.all([
      Preferences.get({ key: LAST_CHECK_KEY }),
      Preferences.get({ key: DISMISSED_KEY }),
    ]);

    const last = Number(lastCheck ?? 0);
    if (Number.isFinite(last) && Date.now() - last < CHECK_EVERY_MS) return null;

    // Timed out by hand: a phone with no connection would otherwise leave the
    // promise hanging until the OS gives up, minutes later.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(MANIFEST_URL, { signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;

    const data = await res.json() as { latest?: string; date?: string; notes?: string[]; url?: string };
    // Recorded only after a successful read, so a failed check retries next
    // launch instead of going quiet for a day.
    await Preferences.set({ key: LAST_CHECK_KEY, value: String(Date.now()) }).catch(() => {});

    const latest = typeof data.latest === "string" ? data.latest.trim() : "";
    if (!latest || !isNewer(latest, currentVersion)) return null;
    if (dismissed === latest) return null;

    return {
      version: latest,
      date: typeof data.date === "string" ? data.date : undefined,
      notes: Array.isArray(data.notes) ? data.notes.filter(n => typeof n === "string").slice(0, 4) : undefined,
      url: typeof data.url === "string" && data.url ? data.url : "https://mp-tree.net/download.html",
    };
  } catch {
    return null;
  }
}

/** Remember that this exact version was waved away, so it stays waved away. */
export function dismissUpdate(version: string): void {
  Preferences.set({ key: DISMISSED_KEY, value: version }).catch(() => {});
}
