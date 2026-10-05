import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { Billing, System, isDesktop } from "./plugins";
import { CHECKOUT_URL, billingAccount } from "./desktop/BillingDesktop";
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
// Windows is "play" too, once it has a shop: a web checkout stands where Play
// Billing stands (desktop/BillingDesktop.ts), and keeps the receipt the same
// way. Until the checkout link is filled in there, Windows is "none".
//
// Owning Pro is also written to Preferences. MPTree is an offline app, and a
// person who paid must keep Pro on a plane; Play is asked again whenever it
// can be reached, and only a definite "not owned" from Play takes it away.
//
// Pro also comes with the MPTree account: a device that bought it says so in
// the account (see sync/engine.ts), and any device signed in to that account
// has Pro too, for as long as it stays signed in. So Pro bought on one Google
// Play account reaches a device that uses another one. A purchase belongs to
// one MPTree account: the one signed in when it was bought (Play keeps a tag
// for it), so signing in to other accounts does not hand Pro to those too.
//
// Every build also has a free week: all of Pro for seven days, once, started
// from the Pro page. No payment details are asked, so nothing is ever charged;
// it simply stops. It is kept on the phone, so a reinstall starts afresh.

export const PRODUCT_ID = "mptree_pro";

export type ProMode = "play" | "free" | "none";
export const PRO_MODE: ProMode =
  __DISTRIBUTION__ === "play" || (isDesktop && !!CHECKOUT_URL) ? "play"
  : __PRO_TEST__ || __DISTRIBUTION__ === "demo" ? "free"
  : "none";

/** `tag`: the MPTree account the purchase belongs to (see accountTag). */
type Stored = { owned: boolean; via: "play" | "free"; since: number; tag?: string | null };
const KEY = "mptree_pro";

/** The free week: not started, running until `until`, or over. `notice` is
 *  true once it has ended and the "your week is over" note has not been seen. */
export type Trial =
  | { state: "unused" }
  | { state: "live"; from: number; until: number }
  | { state: "over"; notice: boolean };

let owned = false;
/** Which MPTree account the Pro bought here belongs to; null when Play has
 *  no tag for it (bought before tags existed). */
let ownedTag: string | null = null;
/** Pro from the MPTree account this device is signed in to. */
let fromAccount = false;
let trial: Trial = { state: "unused" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => owned || fromAccount || trial.state === "live";
const ownedSnapshot = () => owned;
const accountSnapshot = () => fromAccount && !owned;
const trialSnapshot = () => trial;

/** Pro is on: bought, or the free week running. */
export function usePro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Bought, as opposed to the free week. */
export function useOwnsPro(): boolean {
  return useSyncExternalStore(subscribe, ownedSnapshot, ownedSnapshot);
}
/** Pro only because the signed in account has it. */
export function useAccountPro(): boolean {
  return useSyncExternalStore(subscribe, accountSnapshot, accountSnapshot);
}
export function useTrial(): Trial {
  return useSyncExternalStore(subscribe, trialSnapshot, trialSnapshot);
}
export function hasPro(): boolean { return snapshot(); }
/** Bought on this device (or unlocked in a test build), not the week or the account. */
export function ownsPro(): boolean { return owned; }
/** Pro only because the signed in account has it. */
export function proFromAccountOnly(): boolean { return fromAccount && !owned && trial.state !== "live"; }

/** An MPTree account, as Play keeps it with a purchase: a hash, so the
 *  email itself never goes to Play. */
export async function accountTag(email: string): Promise<string> {
  const bytes = new TextEncoder().encode("mptree:" + email.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** The account a purchase without a tag went to first. Kept on the device. */
const BOUND_KEY = "mptree_pro_bound";

/** Whether the Pro bought on this device is for the account `email`, and so
 *  may be put in it for its other devices. A purchase from before tags goes
 *  to the first account it is used with. */
export async function proIsFor(email: string): Promise<boolean> {
  if (!owned) return false;
  const tag = await accountTag(email);
  if (ownedTag) return ownedTag === tag;
  try {
    const { value } = await Preferences.get({ key: BOUND_KEY });
    if (value) return value === tag;
    await Preferences.set({ key: BOUND_KEY, value: tag });
    return true;
  } catch { return false; }
}

const ACCOUNT_KEY = "mptree_pro_account";
/** The engine says whether the account this device is signed in to has Pro.
 *  Remembered, so it holds with no internet. */
export function setAccountPro(on: boolean): void {
  if (on === fromAccount) return;
  fromAccount = on;
  if (on) Preferences.set({ key: ACCOUNT_KEY, value: "1" }).catch(() => {});
  else {
    Preferences.remove({ key: ACCOUNT_KEY }).catch(() => {});
    if (!owned && trial.state !== "live") dropProLook();
  }
  emit();
}
/** Pro from an account this install is not signed in to (see prepareSync). */
export async function forgetAccountPro(): Promise<void> {
  await Preferences.remove({ key: ACCOUNT_KEY }).catch(() => {});
  setAccountPro(false);
}
/** For code outside React that needs to know when Pro comes or goes. */
export const subscribePro = subscribe;

/** Back to the free look, and the launcher icon with it: an icon picked with
 *  Pro is a change to the home screen, which resetLook cannot undo. */
function dropProLook() {
  resetLook();
  System.setAppIcon({ icon: "classic" }).catch(() => {});
}

/** This device had Pro of its own and it went: refunded on Play, or locked
 *  again in a test build. Remembered, because it is what tells a device that
 *  lost Pro from one that was reinstalled and has not heard from Play yet. */
const LOST_KEY = "mptree_pro_lost";
let lost = false;
export function proLost(): boolean { return lost; }
function setLost(next: boolean) {
  if (next === lost) return;
  lost = next;
  if (next) Preferences.set({ key: LOST_KEY, value: "1" }).catch(() => {});
  else Preferences.remove({ key: LOST_KEY }).catch(() => {});
}

function setOwned(next: boolean, via: Stored["via"], tag: string | null = null) {
  const was = owned;
  owned = next;
  ownedTag = next ? tag : null;
  // Play's word is final either way; a test build only knows what it saw.
  setLost(!next && (via === "play" || was || lost));
  if (next) {
    Preferences.set({ key: KEY, value: JSON.stringify({ owned: true, via, since: Date.now(), tag } satisfies Stored) }).catch(() => {});
  } else {
    Preferences.remove({ key: KEY }).catch(() => {});
    if (was && !fromAccount && trial.state !== "live") dropProLook();
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
  if (!owned && !fromAccount) dropProLook();
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
    if (s?.owned && s.via === (PRO_MODE === "play" ? "play" : "free")) { owned = true; ownedTag = s.tag ?? null; emit(); }
  } catch { /* nothing stored */ }
  try { lost = !owned && (await Preferences.get({ key: LOST_KEY })).value === "1"; } catch { /* nothing stored */ }
  try {
    if ((await Preferences.get({ key: ACCOUNT_KEY })).value === "1") { fromAccount = true; emit(); }
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

/** `email`: the MPTree account signed in, which the purchase belongs to. */
export async function buyPro(email?: string): Promise<BuyResult> {
  const tag = email ? await accountTag(email) : undefined;
  if (PRO_MODE === "free") { setOwned(true, "free", tag ?? null); return "owned"; }
  if (PRO_MODE !== "play") return "failed";
  try {
    const r = await Billing.purchase({ productId: PRODUCT_ID, accountTag: tag });
    if (r.owned) {
      setOwned(true, "play", r.tag ?? null);
      // Owned already (bought before on this Google Play account): Play's
      // own record says which account it is for.
      if (!r.tag) await restorePro();
      return "owned";
    }
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
    setOwned(r.owned, "play", r.tag ?? null);
    return r.owned;
  } catch {
    return null;
  }
}

/**
 * Windows: MPTree is signed in to the account `email`. On a phone a purchase
 * stays with the phone's own Play account whoever signs in to MPTree; a
 * computer has no such thing, so there Pro follows the MPTree account. Signing
 * in to an account that did not buy it shows the Buy button again, rather
 * than every account on this computer seeming to have Pro.
 */
export async function proAccountIs(email: string): Promise<void> {
  if (!isDesktop || PRO_MODE !== "play") return;
  const tag = await accountTag(email);
  if (owned && ownedTag === tag) return;
  billingAccount(tag);
  try {
    const r = await Billing.restore({ productId: PRODUCT_ID });
    if (!r.ok) return;
    if (r.owned) { setOwned(true, "play", tag); return; }
  } catch { return; }
  if (!owned) return;
  // Bought here, for another account. Not "lost": nothing was refunded, and
  // the account it was for still has it.
  owned = false;
  ownedTag = null;
  Preferences.remove({ key: KEY }).catch(() => {});
  if (!fromAccount && trial.state !== "live") dropProLook();
  emit();
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
