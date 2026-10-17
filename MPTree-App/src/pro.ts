import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Ads, Billing, System } from "./plugins";
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
// Pro also comes with the MPTree account: a device that bought it says so in
// the account (see sync/engine.ts), and any device signed in to that account
// has Pro too, for as long as it stays signed in. So Pro bought on one Google
// Play account reaches a device that uses another one. A purchase belongs to
// one MPTree account: the one signed in when it was bought (Play keeps a tag
// for it), so signing in to other accounts does not hand Pro to those too.
//
// Pro can also be had for a day by watching one ad: a rewarded video, which
// only counts when watched to the end. It is offered when someone without Pro
// taps something Pro, as often as they like. The day is kept on the device.
// (Until 1.2.5 this was a free week, once; a week still running when the app
// is updated runs out the same way.)

export const PRODUCT_ID = "mptree_pro";

export type ProMode = "play" | "free" | "none";
export const PRO_MODE: ProMode =
  __DISTRIBUTION__ === "play" ? "play"
  : __PRO_TEST__ || __DISTRIBUTION__ === "demo" ? "free"
  : "none";

/** `tag`: the MPTree account the purchase belongs to (see accountTag). */
type Stored = { owned: boolean; via: "play" | "free"; since: number; tag?: string | null };
const KEY = "mptree_pro";

/** A day of Pro for an ad: running until `until`, or not. */
export type AdDay =
  | { state: "off" }
  | { state: "live"; from: number; until: number };

let owned = false;
/** Which MPTree account the Pro bought here belongs to; null when Play has
 *  no tag for it (bought before tags existed). */
let ownedTag: string | null = null;
/** Pro from the MPTree account this device is signed in to. */
let fromAccount = false;
let adDay: AdDay = { state: "off" };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => owned || fromAccount || adDay.state === "live";
const ownedSnapshot = () => owned;
const accountSnapshot = () => fromAccount && !owned;
const adDaySnapshot = () => adDay;

/** Pro is on: bought, from the account, or a day for an ad running. */
export function usePro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Bought, as opposed to a day for an ad. */
export function useOwnsPro(): boolean {
  return useSyncExternalStore(subscribe, ownedSnapshot, ownedSnapshot);
}
/** Pro only because the signed in account has it. */
export function useAccountPro(): boolean {
  return useSyncExternalStore(subscribe, accountSnapshot, accountSnapshot);
}
export function useAdDay(): AdDay {
  return useSyncExternalStore(subscribe, adDaySnapshot, adDaySnapshot);
}
export function hasPro(): boolean { return snapshot(); }
/** Bought on this device (or unlocked in a test build), not a day or the account. */
export function ownsPro(): boolean { return owned; }
/** Pro only because the signed in account has it. */
export function proFromAccountOnly(): boolean { return fromAccount && !owned && adDay.state !== "live"; }

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
    if (!owned && adDay.state !== "live") dropProLook();
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
    if (was && !fromAccount && adDay.state !== "live") dropProLook();
  }
  if (was !== next) emit();
}

// ─── A DAY FOR AN AD ─────────────────────────────────────────────────────────

const AD_DAY_KEY = "mptree_ad_day";
/** Where the free week was kept, read once so a week still running ends as it would have. */
const OLD_TRIAL_KEY = "mptree_trial";
const DAY = 24 * 60 * 60 * 1000;
type StoredDay = { from: number; until: number };

/** The rewarded ad unit: Google's test unit in a test build (watching our own
 *  real ads would break AdMob's rules), MPTree's own unit "Dagpas" in the Play
 *  build (AdMob > Apps > MPTree > Ad units). Empty means no ads in that build. */
const AD_UNIT =
  PRO_MODE === "free" ? "ca-app-pub-3940256099942544/5224354917"
  : PRO_MODE === "play" ? "ca-app-pub-3909703327280410/3472642383"
  : "";
/** Whether this build can show the ad at all (not in a browser). */
export const ADS_ON = AD_UNIT !== "" && Capacitor.getPlatform() === "android";

let dayTimer: ReturnType<typeof setTimeout> | undefined;

function runDay(from: number, until: number) {
  adDay = { state: "live", from, until };
  clearTimeout(dayTimer);
  // Checked hourly and on every return to the app: Android freezes timers in
  // the background anyway.
  dayTimer = setTimeout(checkDay, Math.min(until - Date.now() + 500, 60 * 60 * 1000));
  emit();
}

/** Ends the day once its time is up. A clock turned back past the start ends
 *  it too, or winding the clock would make it last forever. */
function checkDay() {
  if (adDay.state !== "live") return;
  const now = Date.now();
  if (now < adDay.until && now >= adDay.from) { runDay(adDay.from, adDay.until); return; }
  endDay();
}

function endDay() {
  clearTimeout(dayTimer);
  if (adDay.state !== "live") return;
  Preferences.remove({ key: AD_DAY_KEY }).catch(() => {});
  adDay = { state: "off" };
  if (!owned && !fromAccount) dropProLook();
  emit();
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDay(); });
}

export type AdResult = "pro" | "offline" | "closed" | "none" | "consent" | "failed";

/** Shows one ad. Watched to the end, Pro is on for 24 hours from now. */
export async function watchAdForPro(): Promise<AdResult> {
  if (!ADS_ON) return "failed";
  try {
    const r = await Ads.showRewarded({ adUnitId: AD_UNIT });
    if (!r.rewarded) {
      const why = r.reason;
      return why === "offline" || why === "closed" || why === "none" || why === "consent" ? why : "failed";
    }
  } catch {
    return "failed";
  }
  const now = Date.now();
  const day: StoredDay = { from: now, until: now + DAY };
  Preferences.set({ key: AD_DAY_KEY, value: JSON.stringify(day) }).catch(() => {});
  runDay(day.from, day.until);
  return "pro";
}

/** "23 h 12 min" or "12 min": what is left of the day. */
export function adDayTimeLeft(until: number): string {
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
    let { value } = await Preferences.get({ key: AD_DAY_KEY });
    if (!value) {
      // A free week from before 1.2.5, if it is still running.
      const old = (await Preferences.get({ key: OLD_TRIAL_KEY })).value;
      const week = old ? (JSON.parse(old) as StoredDay) : null;
      if (week && Date.now() < week.until) {
        value = JSON.stringify({ from: week.from, until: week.until } satisfies StoredDay);
        await Preferences.set({ key: AD_DAY_KEY, value });
      }
    }
    await Preferences.remove({ key: OLD_TRIAL_KEY });
    const s = value ? (JSON.parse(value) as StoredDay) : null;
    if (s) {
      // Ended while MPTree was closed: endDay puts the look back now.
      adDay = { state: "live", from: s.from, until: s.until };
      checkDay();
    }
  } catch { /* no day */ }
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

/** Test builds only: the day for an ad ends now. */
export function endAdDayForTesting(): void {
  if (PRO_MODE === "free") endDay();
}
