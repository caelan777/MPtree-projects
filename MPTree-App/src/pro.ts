import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { Billing, System } from "./plugins";
import { resetLook } from "./look";
import { t } from "./i18n";

// ─── PRO ─────────────────────────────────────────────────────────────────────
// MPTree Pro is one payment, once. Nothing that is free today moves behind it;
// it only adds things.
//
// Where the money goes through depends on the build (see vite.config.ts):
//
//   play   Google Play Billing, product "mptree_pro". Play keeps the receipt,
//          so a reinstall or a new phone on the same Google account gets it
//          back with "Restore purchase".
//   free   The test build handed out on mp-tree.net/test and the in-browser
//          demo. Pro unlocks with a tap and costs nothing, so every part of
//          it can be tried before anything is on sale.
//   none   The APK from the website. Play Billing only works in an app Play
//          installed, so Pro is not sold there (yet).
//
// Owning Pro is also written to Preferences. MPTree is an offline app, and a
// person who paid must keep Pro on a plane; Play is asked again whenever it
// can be reached, and only a definite "not owned" from Play takes it away.
//
// Every build also has a free week: all of Pro for seven days, once, started
// from the Pro page. No payment details are asked, so nothing is ever charged;
// it simply stops. It is kept on the phone, so a reinstall starts afresh.

export const PRODUCT_ID = "mptree_pro";

export type ProMode = "play" | "free" | "none";
export const PRO_MODE: ProMode =
  __DISTRIBUTION__ === "play" ? "play"
  : __PRO_TEST__ || __DISTRIBUTION__ === "demo" ? "free"
  : "none";

type Stored = { owned: boolean; via: "play" | "free"; since: number };
const KEY = "mptree_pro";

/** The free week: not started, running until `until`, or over. `notice` is
 *  true once it has ended and the "your week is over" note has not been seen. */
export type Trial =
  | { state: "unused" }
  | { state: "live"; from: number; until: number }
  | { state: "over"; notice: boolean };

let owned = false;
let trial: Trial = { state: "unused" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => owned || trial.state === "live";
const ownedSnapshot = () => owned;
const trialSnapshot = () => trial;

/** Pro is on: bought, or the free week running. */
export function usePro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Bought, as opposed to the free week. */
export function useOwnsPro(): boolean {
  return useSyncExternalStore(subscribe, ownedSnapshot, ownedSnapshot);
}
export function useTrial(): Trial {
  return useSyncExternalStore(subscribe, trialSnapshot, trialSnapshot);
}
export function hasPro(): boolean { return snapshot(); }
/** For code outside React that needs to know when Pro comes or goes. */
export const subscribePro = subscribe;

/** Back to the free look, and the launcher icon with it: an icon picked with
 *  Pro is a change to the home screen, which resetLook cannot undo. */
function dropProLook() {
  resetLook();
  System.setAppIcon({ icon: "classic" }).catch(() => {});
}

function setOwned(next: boolean, via: Stored["via"]) {
  const was = owned;
  owned = next;
  if (next) {
    Preferences.set({ key: KEY, value: JSON.stringify({ owned: true, via, since: Date.now() } satisfies Stored) }).catch(() => {});
  } else {
    Preferences.remove({ key: KEY }).catch(() => {});
    if (was && trial.state !== "live") dropProLook();
  }
  if (was !== next) emit();
}

// ─── FREE WEEK ───────────────────────────────────────────────────────────────

const TRIAL_KEY = "mptree_trial";
const WEEK = 7 * 24 * 60 * 60 * 1000;
type StoredTrial = { from: number; until: number; noticed?: boolean };

let trialTimer: ReturnType<typeof setTimeout> | undefined;

function saveTrial(s: StoredTrial) {
  Preferences.set({ key: TRIAL_KEY, value: JSON.stringify(s) }).catch(() => {});
}

function runTrial(from: number, until: number) {
  trial = { state: "live", from, until };
  clearTimeout(trialTimer);
  // setTimeout cannot wait a whole week (it overflows past about 24 days, but
  // a frozen app never gets there anyway); checking hourly and on every return
  // to the app is enough.
  trialTimer = setTimeout(checkTrial, Math.min(until - Date.now() + 500, 60 * 60 * 1000));
  emit();
}

/** Ends the week once its time is up. A clock turned back past the start ends
 *  it too, or winding the clock would make it last forever. */
function checkTrial() {
  if (trial.state !== "live") return;
  const now = Date.now();
  if (now < trial.until && now >= trial.from) { runTrial(trial.from, trial.until); return; }
  endTrial(true);
}

function endTrial(notice: boolean) {
  clearTimeout(trialTimer);
  if (trial.state !== "live") return;
  saveTrial({ from: trial.from, until: Math.min(trial.until, Date.now()), noticed: !notice });
  trial = { state: "over", notice };
  if (!owned) dropProLook();
  emit();
}

// Android freezes the app in the background and its timers with it, so the
// week is also checked whenever MPTree comes back.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkTrial(); });
}

/** Starts the free week. Once only. */
export function startTrial(): boolean {
  if (trial.state !== "unused") return false;
  const now = Date.now();
  saveTrial({ from: now, until: now + WEEK });
  runTrial(now, now + WEEK);
  return true;
}

/** The "your free week is over" note has been seen. */
export function dismissTrialNotice(): void {
  if (trial.state !== "over" || !trial.notice) return;
  trial = { state: "over", notice: false };
  Preferences.get({ key: TRIAL_KEY }).then(({ value }) => {
    if (value) saveTrial({ ...(JSON.parse(value) as StoredTrial), noticed: true });
  }).catch(() => {});
  emit();
}

/** "6 d 23 h", "5 h 12 min" or "12 min": what is left of the free week. */
export function trialTimeLeft(until: number): string {
  const min = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d > 0 ? t("{d} d {h} h", { d, h })
    : h > 0 ? t("{h} h {m} min", { h, m })
    : t("{n} min", { n: m });
}

/** Reads what this phone remembers, then, on Play, asks Play. */
export async function loadPro(): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    const s = value ? (JSON.parse(value) as Stored) : null;
    // A "free" unlock from a test build does not carry over into a Play build
    // installed on top of it, and the other way round.
    if (s?.owned && s.via === (PRO_MODE === "play" ? "play" : "free")) { owned = true; emit(); }
  } catch { /* nothing stored */ }
  try {
    const { value } = await Preferences.get({ key: TRIAL_KEY });
    const s = value ? (JSON.parse(value) as StoredTrial) : null;
    if (s) {
      const now = Date.now();
      if (now < s.until && now >= s.from) runTrial(s.from, s.until);
      else {
        // Ended while MPTree was closed: the look goes back now.
        trial = { state: "live", from: s.from, until: s.until };
        if (s.noticed) { trial = { state: "over", notice: false }; emit(); }
        else endTrial(true);
      }
    }
  } catch { /* no trial */ }
  if (PRO_MODE === "play") restorePro().catch(() => {});
}

export type BuyResult = "owned" | "pending" | "cancelled" | "failed";

export async function buyPro(): Promise<BuyResult> {
  if (PRO_MODE === "free") { setOwned(true, "free"); return "owned"; }
  if (PRO_MODE !== "play") return "failed";
  try {
    const r = await Billing.purchase({ productId: PRODUCT_ID });
    if (r.owned) { setOwned(true, "play"); return "owned"; }
    return r.pending ? "pending" : r.cancelled ? "cancelled" : "failed";
  } catch {
    return "failed";
  }
}

/** Asks Play what this Google account owns. Resolves whether Pro is owned
 *  now, or null when Play could not be reached (and nothing changed). */
export async function restorePro(): Promise<boolean | null> {
  if (PRO_MODE !== "play") return owned;
  try {
    const r = await Billing.restore({ productId: PRODUCT_ID });
    if (!r.ok) return null;
    setOwned(r.owned, "play");
    return r.owned;
  } catch {
    return null;
  }
}

/** The price as Play shows it in the person's own currency, e.g. "€ 2,99". */
export async function proPrice(): Promise<string | null> {
  if (PRO_MODE !== "play") return null;
  try {
    const r = await Billing.getProduct({ productId: PRODUCT_ID });
    return r.price || null;
  } catch {
    return null;
  }
}

/** Test builds only: back to free, to try the locked side again. */
export function lockProForTesting(): void {
  if (PRO_MODE !== "free") return;
  setOwned(false, "free");
}

/** Test builds only: the free week ends now, note and all. */
export function endTrialForTesting(): void {
  if (PRO_MODE === "free") endTrial(true);
}

/** Test builds only: the free week can be started again. */
export function resetTrialForTesting(): void {
  if (PRO_MODE !== "free") return;
  clearTimeout(trialTimer);
  Preferences.remove({ key: TRIAL_KEY }).catch(() => {});
  trial = { state: "unused" };
  emit();
}
