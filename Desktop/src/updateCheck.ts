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

/** Inside the Tauri window on Windows. */
const IS_WINDOWS = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const MANIFEST_URL = "https://mp-tree.net/version.json";
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const LAST_CHECK_KEY = "mptree_update_last_check";
const DISMISSED_KEY  = "mptree_update_dismissed";
/** The "Update notices" switch in Settings. Absent means on. */
export const NOTICES_KEY = "mptree_update_notices";

export type UpdateInfo = {
  version: string;
  date?: string;
  /** Short "what changed" lines, if the manifest carries them. */
  notes?: string[];
  /** Where to send the user. Always a page, never a file. */
  url: string;
  /** Came from Google Play rather than the website. There is no version name
   *  (Play only reports a version code), and "Get it" hands over to Play's own
   *  update screen instead of opening a page. */
  play?: boolean;
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
    const [{ value: lastCheck }, { value: dismissed }, { value: notices }] = await Promise.all([
      Preferences.get({ key: LAST_CHECK_KEY }),
      Preferences.get({ key: DISMISSED_KEY }),
      Preferences.get({ key: NOTICES_KEY }),
    ]);
    // Switched off: not even the request is made.
    if (notices === "0") return null;

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

    type Manifest = { latest?: string; date?: string; notes?: string[]; url?: string };
    const whole = await res.json() as Manifest & { windows?: Manifest };
    // Windows has releases of its own, in a block of its own. Without that
    // block there is nothing to say: the top one is the Android app.
    const data: Manifest = IS_WINDOWS ? whole.windows ?? {} : whole;
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
      url: typeof data.url === "string" && data.url ? data.url : IS_WINDOWS ? "https://mp-tree.net/windows.html" : "https://mp-tree.net/download.html",
    };
  } catch {
    return null;
  }
}

/**
 * The Play build's version of the same thing. It asks the Play Store app on the
 * phone, through Google's In-App Updates library, which is the one route Play
 * allows for this. Same once-a-day limit and the same switch. A dismissal is
 * remembered by version code, which is all Play reports.
 */
export async function checkForPlayUpdate(
  ask: () => Promise<{ available: boolean; versionCode?: number }>,
): Promise<UpdateInfo | null> {
  if (__DISTRIBUTION__ !== "play") return null;
  try {
    const [{ value: lastCheck }, { value: dismissed }, { value: notices }] = await Promise.all([
      Preferences.get({ key: LAST_CHECK_KEY }),
      Preferences.get({ key: DISMISSED_KEY }),
      Preferences.get({ key: NOTICES_KEY }),
    ]);
    if (notices === "0") return null;
    const last = Number(lastCheck ?? 0);
    if (Number.isFinite(last) && Date.now() - last < CHECK_EVERY_MS) return null;
    const r = await ask();
    await Preferences.set({ key: LAST_CHECK_KEY, value: String(Date.now()) }).catch(() => {});
    if (!r.available) return null;
    const code = String(r.versionCode ?? "");
    if (dismissed === code) return null;
    return { version: code, url: "", play: true };
  } catch {
    return null;
  }
}

/** Remember that this exact version was waved away, so it stays waved away. */
export function dismissUpdate(version: string): void {
  Preferences.set({ key: DISMISSED_KEY, value: version }).catch(() => {});
}
