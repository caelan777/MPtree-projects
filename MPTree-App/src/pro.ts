import { useSyncExternalStore } from "react";
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
// The day pass is the other way in: one rewarded ad, then all of Pro for 24
// hours. It is offered wherever there is an ad unit to show (see AD_UNIT).

export const PRODUCT_ID = "mptree_pro";

export type ProMode = "play" | "free" | "none";
export const PRO_MODE: ProMode =
  __DISTRIBUTION__ === "play" ? "play"
  : __PRO_TEST__ || __DISTRIBUTION__ === "demo" ? "free"
  : "none";

type Stored = { owned: boolean; via: "play" | "free"; since: number };
const KEY = "mptree_pro";

let owned = false;
/** When the day pass ends; 0 without one. */
let passUntil = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => owned || passUntil > 0;
const passSnapshot = () => (owned ? 0 : passUntil);
const ownedSnapshot = () => owned;

/** Pro is on: bought, or a day pass running. */
export function usePro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Bought, as opposed to a day pass. */
export function useOwnsPro(): boolean {
  return useSyncExternalStore(subscribe, ownedSnapshot, ownedSnapshot);
}
/** When the day pass ends, or 0 when there is none (or Pro is bought). */
export function useDayPass(): number {
  return useSyncExternalStore(subscribe, passSnapshot, passSnapshot);
}
export function hasPro(): boolean { return snapshot(); }

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
    if (was && !passUntil) dropProLook();
  }
  if (was !== next) emit();
}

// ─── DAY PASS ────────────────────────────────────────────────────────────────

const PASS_KEY = "mptree_daypass";
const DAY = 24 * 60 * 60 * 1000;
type StoredPass = { from: number; until: number };

// Google's test unit: always a test ad, never paid, safe to tap. Real ad units
// must never be used for testing, or AdMob closes the account.
const TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";
// MPTree's own rewarded unit, from AdMob. Empty until that account exists, and
// until then the Play build does not offer the day pass.
const PLAY_REWARDED = "";
const AD_UNIT = PRO_MODE === "free" ? TEST_REWARDED : PRO_MODE === "play" ? PLAY_REWARDED : "";
export const PASS_OFFERED = AD_UNIT !== "";

let passFrom = 0;
let passTimer: ReturnType<typeof setTimeout> | undefined;

/** Ends the pass once its time is up. A clock turned back past the start
 *  ends it too, or winding the clock would make it last forever. */
function checkPass() {
  if (!passUntil) return;
  const now = Date.now();
  if (now < passUntil && now >= passFrom) return;
  endPass();
}

function endPass() {
  clearTimeout(passTimer);
  if (!passUntil) return;
  passUntil = 0;
  Preferences.remove({ key: PASS_KEY }).catch(() => {});
  if (!owned) dropProLook();
  emit();
}

function startPass(from: number, until: number) {
  passFrom = from;
  passUntil = until;
  clearTimeout(passTimer);
  passTimer = setTimeout(checkPass, until - Date.now() + 500);
  emit();
}

// Android freezes the app in the background and its timers with it, so the
// pass is also checked whenever MPTree comes back.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkPass(); });
}

/** "14 h" or "35 min": what is left of a day pass. */
export function passTimeLeft(until: number): string {
  const ms = until - Date.now();
  return ms >= 3_600_000 ? t("{n} h", { n: Math.ceil(ms / 3_600_000) }) : t("{n} min", { n: Math.max(1, Math.ceil(ms / 60_000)) });
}

/** What to tell someone after the ad. */
export function passMessage(r: PassResult): string {
  return r === "granted" ? t("Pro is on for the next 24 hours")
    : r === "closed" ? t("The day pass needs the whole ad")
    : r === "offline" ? t("The ad needs an internet connection")
    : r === "nofill" ? t("No ad right now. Try again later.")
    : t("The ad could not load. Try again later.");
}

export type PassResult = "granted" | "closed" | "consent" | "nofill" | "offline" | "error";

/** Shows the ad; a watched one starts 24 hours of Pro. */
export async function watchAdForPass(): Promise<PassResult> {
  if (!PASS_OFFERED) return "error";
  try {
    const r = await Ads.showRewarded({ adUnitId: AD_UNIT });
    if (!r.rewarded) return r.reason ?? "error";
    const now = Date.now();
    Preferences.set({ key: PASS_KEY, value: JSON.stringify({ from: now, until: now + DAY } satisfies StoredPass) }).catch(() => {});
    startPass(now, now + DAY);
    return "granted";
  } catch {
    return "error";
  }
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
    const { value } = await Preferences.get({ key: PASS_KEY });
    const p = value ? (JSON.parse(value) as StoredPass) : null;
    const now = Date.now();
    if (p && now < p.until && now >= p.from) startPass(p.from, p.until);
    else if (p) Preferences.remove({ key: PASS_KEY }).catch(() => {});
  } catch { /* no pass */ }
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
  endPass();
  setOwned(false, "free");
}
