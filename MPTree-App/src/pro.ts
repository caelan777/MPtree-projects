import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { Billing, System } from "./plugins";
import { resetLook } from "./look";

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

export const PRODUCT_ID = "mptree_pro";

export type ProMode = "play" | "free" | "none";
export const PRO_MODE: ProMode =
  __DISTRIBUTION__ === "play" ? "play"
  : __PRO_TEST__ || __DISTRIBUTION__ === "demo" ? "free"
  : "none";

type Stored = { owned: boolean; via: "play" | "free"; since: number };
const KEY = "mptree_pro";

let owned = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => owned;

export function usePro(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function hasPro(): boolean { return owned; }

function setOwned(next: boolean, via: Stored["via"]) {
  const was = owned;
  owned = next;
  if (next) {
    Preferences.set({ key: KEY, value: JSON.stringify({ owned: true, via, since: Date.now() } satisfies Stored) }).catch(() => {});
  } else {
    Preferences.remove({ key: KEY }).catch(() => {});
    // Back to the free look, and the launcher icon with it: an icon picked
    // with Pro is a change to the home screen, which resetLook cannot undo.
    if (was) { resetLook(); System.setAppIcon({ icon: "classic" }).catch(() => {}); }
  }
  if (was !== next) emit();
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
  if (PRO_MODE === "free") setOwned(false, "free");
}
