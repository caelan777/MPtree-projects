import { Preferences } from "@capacitor/preferences";

// ─── HALLOWEEN ───────────────────────────────────────────────────────────────
// From 28 October to 1 November, the first tap on Settings plays a short
// scare (HalloweenScare), and then "Happy Halloween" with a treat: a day of
// Pro, or 24 hours on top of a day that is running (pro.ts giveDay). Once per
// phone per year, by the phone's own date, so it needs no internet.
//
// A test build has Halloween every day, once per start of the app, so it can
// be tried before the 28th and again without reinstalling.

const TEST = __PRO_TEST__ || import.meta.env.DEV;
const keyFor = (year: number) => `mptree_halloween_${year}`;
let shownThisRun = false;

/** Whether today is in the Halloween days. */
export function isHalloween(now = new Date()): boolean {
  if (TEST) return true;
  const m = now.getMonth(), d = now.getDate();
  return (m === 9 && d >= 28) || (m === 10 && d === 1);
}

/** Whether the scare is still to come on this phone. */
export async function halloweenDue(): Promise<boolean> {
  if (!isHalloween() || shownThisRun) return false;
  if (TEST) return true;
  try {
    return (await Preferences.get({ key: keyFor(new Date().getFullYear()) })).value !== "1";
  } catch {
    return false;
  }
}

/** The scare has been played: not again this year. */
export function markHalloweenDone(): void {
  shownThisRun = true;
  if (TEST) return;
  Preferences.set({ key: keyFor(new Date().getFullYear()), value: "1" }).catch(() => {});
}
