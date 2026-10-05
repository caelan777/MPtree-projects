import { invoke } from "@tauri-apps/api/core";
import type { BillingPlugin } from "../plugins";

// ─── PRO ON WINDOWS ──────────────────────────────────────────────────────────
// There is no Google Play here, so Pro is paid for in a web checkout, in the
// person's own browser. It stands where Play Billing stands on Android, and
// answers the same three questions, so src/pro.ts does not know the difference.
//
// How a purchase finds its way back: the checkout is opened with the MPTree
// account's tag (the hash from accountTag, never the email). The payment
// service reports the paid order to mp-tree.net/api/pay, which writes the tag
// down; this file asks mp-tree.net/api/pro whether the tag is there. Nobody
// types a code. See functions/api/ (at the repository root) and Website/README.md.

/** The product's checkout link at the payment service, from VITE_CHECKOUT_URL
 *  at build time (Desktop/.env.local, which is not in the repository). Built
 *  without it, Pro is not sold on Windows, and src/pro.ts says so: that is
 *  how a public build is made while the shop is not open yet. */
export const CHECKOUT_URL: string = import.meta.env.VITE_CHECKOUT_URL ?? "";

const API = "https://mp-tree.net/api/pro";
/** Shown on the button. The checkout shows the real price, with tax. */
const PRICE = "€2,99";
/** The account the last purchase or check was for, so a refund is noticed on
 *  the next start without waiting for the sign-in. */
const TAG_KEY = "mptree_desktop_pro_tag";

const WAIT_FOR = 15 * 60 * 1000;
const ASK_EVERY = 4000;

/** true or false as the server says; null when it could not be asked. */
async function ask(tag: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${API}?tag=${tag}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json() as { owned?: boolean };
    return typeof body.owned === "boolean" ? body.owned : null;
  } catch {
    return null;
  }
}

/** The account MPTree is signed in to now: the one restore() asks about. */
export const billingAccount = (tag: string) => remember(tag);
const remember = (tag: string) => { try { localStorage.setItem(TAG_KEY, tag); } catch { /* private mode */ } };
const remembered = () => { try { return localStorage.getItem(TAG_KEY) || ""; } catch { return ""; } };

export const BillingDesktop: BillingPlugin = {
  async getProduct() { return { price: PRICE }; },

  /** Opens the checkout, then waits for the payment to arrive. Resolves owned
   *  as soon as it does; cancelled when a quarter of an hour passes without. */
  async purchase({ accountTag }) {
    if (!CHECKOUT_URL || !accountTag) return { owned: false };
    remember(accountTag);
    // Bought before, on this account: nothing to pay again.
    if (await ask(accountTag)) return { owned: true, tag: accountTag };

    const join = CHECKOUT_URL.includes("?") ? "&" : "?";
    await invoke("open_external", { url: `${CHECKOUT_URL}${join}checkout[custom][tag]=${accountTag}` });

    const until = Date.now() + WAIT_FOR;
    while (Date.now() < until) {
      await new Promise(r => setTimeout(r, ASK_EVERY));
      if (await ask(accountTag)) return { owned: true, tag: accountTag };
    }
    return { owned: false, cancelled: true };
  },

  async restore() {
    const tag = remembered();
    if (!CHECKOUT_URL || !tag) return { ok: false, owned: false };
    const owned = await ask(tag);
    return owned === null ? { ok: false, owned: false } : { ok: true, owned, tag };
  },
};
