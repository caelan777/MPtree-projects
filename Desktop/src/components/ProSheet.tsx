import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isDesktop } from "../plugins";
import { invoke } from "@tauri-apps/api/core";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import {
  useOwnsPro, useAccountPro, useTrial, buyPro, restorePro, proPrice, lockProForTesting,
  startTrial, trialTimeLeft, endTrialForTesting, resetTrialForTesting, PRO_MODE, hasPro,
} from "../pro";
import { useSync, signIn } from "../sync/engine";
import { GoogleG } from "./AccountSheet";

// ─── MPTREE PRO ──────────────────────────────────────────────────────────────
// What Pro does, line by line, and how to get it: pay once, or try it free for
// a week. The two stand side by side as equals. (On Android the second card is
// an ad for a day of Pro; Windows has no ads and keeps the free week.)

type ProSheetProps = {
  onClose: () => void;
  onToast: (msg: string) => void;
  /** Opens a store link. The sideloaded build uses it to point at Play. */
  onOpenStore: () => void;
  /** Account & sync, for when the account is on three devices already. */
  onOpenAccount: () => void;
  T: T;
};

export function ProSheet({ onClose, onToast, onOpenStore, onOpenAccount, T }: ProSheetProps) {
  const sh = makeSH(T);
  const owns = useOwnsPro();
  const viaAccount = useAccountPro();
  const sync = useSync();
  const phase = sync.phase;
  const trial = useTrial();
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "buy" | "restore" | "signin">(null);
  // Pro is kept in the MPTree account, so buying starts with signing in. Not
  // in a browser, where there is no signing in (the demo buys straight away).
  const needSignIn = phase !== "on" && (Capacitor.getPlatform() !== "web" || isDesktop || import.meta.env.DEV);
  const joining = busy === "signin" || phase === "joining";

  useEffect(() => {
    let live = true;
    proPrice().then(p => { if (live) setPrice(p); });
    return () => { live = false; };
  }, []);

  const buy = async () => {
    setBusy("buy");
    // For the account signed in: Pro goes into that account, and no other.
    const r = await buyPro(sync.phase === "on" ? sync.account?.email : undefined);
    setBusy(null);
    if (r === "owned") onToast(t("Pro unlocked. Thank you!"));
    else if (r === "pending") onToast(t("Payment pending. Pro unlocks as soon as it goes through."));
    else if (r === "failed") onToast(isDesktop ? t("The checkout could not be opened. Try again in a moment.") : t("Google Play could not be reached. Try again in a moment."));
    else if (r === "cancelled" && isDesktop) onToast(t("No payment came in. Nothing was charged."));
  };
  const join = async () => {
    setBusy("signin");
    const r = await signIn();
    setBusy(null);
    if (r === "failed") onToast(t("Could not sign in. Check your connection and try again."));
    // Three devices on the account already: the account page lets one go.
    else if (r === "limit") onOpenAccount();
    else if (r === "ok" && hasPro()) onToast(t("MPTree Pro is on, from your account"));
    else if (r === "ok" && PRO_MODE === "none") onToast(t("This account has no MPTree Pro yet."));
  };
  const restore = async () => {
    setBusy("restore");
    const r = await restorePro();
    setBusy(null);
    onToast(r === null ? (isDesktop ? t("Could not check. Try again in a moment.") : t("Google Play could not be reached. Try again in a moment."))
      : r ? t("Pro restored") : isDesktop ? t("No Pro purchase found for this account") : t("No Pro purchase found on this Google account"));
  };

  // Each line says what it does for you, not what it is called inside.
  const features: { title: string; body: string }[] = [
    { title: t("All your devices"), body: t("Your songs are synced between all your devices.") },
    { title: t("Styles"),   body: t("Give the whole app a different face: pink with flowers (Aviela) or green light in the dark (Lantern).") },
    { title: t("Records"),  body: t("Pick the record that spins in the player: smoke, marble and more.") },
    { title: t("Colours"),  body: t("Make the app yours by giving it your own colours.") },
    { title: t("Clean up"), body: t("Finds voice messages, WhatsApp audio and short clips among your songs, and bins them in one go.") },
  ];

  const priceLabel = price ?? "€2,99";

  const link = { ...sh.saveBtn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 };
  // The free week: once only, and nothing to pay; it stops by itself.
  const showWeek = trial.state === "unused" && busy !== "buy";
  const trialTest = PRO_MODE === "free" && (
    trial.state === "live" ? (
      <button onClick={endTrialForTesting} style={link}>{t("End the free week (test build)")}</button>
    ) : trial.state === "over" ? (
      <button onClick={() => { resetTrialForTesting(); onToast(t("The free week can be started again")); }} style={link}>
        {t("Reset the free week (test build)")}
      </button>
    ) : null
  );

  // Two cards side by side, the same size: pay once, or a week for free.
  const choice = (on: boolean) => ({
    border: `2px solid ${on ? T.text : T.dim}`, borderRadius: 16, padding: "16px 14px",
    display: "flex", flexDirection: "column", minWidth: 0,
  } as const);
  const kicker = { fontSize: 12, color: T.textSub, letterSpacing: "0.06em", textTransform: "uppercase" } as const;
  const big = { fontSize: 26, fontWeight: 800, color: T.text, marginTop: 6 } as const;
  const note = { fontSize: 12.5, color: T.textSub, lineHeight: 1.4, marginTop: 4, flex: 1 } as const;
  const cardBtn = { ...sh.saveBtn, marginTop: 14, padding: "12px 8px", borderRadius: 10, fontSize: 14, fontFamily: "inherit" };
  const buyCard = (
    <div style={choice(true)}>
      <div style={kicker}>{t("For good")}</div>
      <div style={big}>{priceLabel}</div>
      <div style={note}>{t("Pay once, yours for good.")}</div>
      {needSignIn ? (
        <button onClick={join} disabled={busy !== null || joining}
          style={{ ...cardBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: joining ? 0.7 : 1 }}>
          <GoogleG />{joining ? t("Signing in…") : t("Sign in")}
        </button>
      ) : (
        <button onClick={buy} disabled={busy !== null} style={{ ...cardBtn, opacity: busy ? 0.6 : 1 }}>
          {PRO_MODE === "free" ? t("Unlock (test build)")
            : busy === "buy" ? (isDesktop ? t("Waiting for the payment…") : t("Opening Google Play…")) : t("Get Pro")}
        </button>
      )}
    </div>
  );
  const weekCard = (
    <div style={choice(false)}>
      <div style={kicker}>{t("At no cost")}</div>
      <div style={big}>{t("7 days")}</div>
      <div style={note}>{t("Try all of Pro once. No payment details.")}</div>
      <button onClick={() => { if (startTrial()) onToast(t("Pro is on for 7 days")); }}
        style={{ ...cardBtn, background: T.dim, color: T.text }}>
        {t("Try it free")}
      </button>
    </div>
  );

  // A page of its own, the whole window, like Account & sync.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 450, display: "flex", flexDirection: "column" }}>
        <div style={{ ...column, display: "flex", justifyContent: "flex-end", padding: "12px 16px 0", flexShrink: 0 }}>
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ ...column, padding: "0 20px 8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo size={40} color={T.text} />
              <span style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>
                MPTree <span style={{ fontWeight: 800, background: T.accent, color: T.playBtnFg, borderRadius: 7, padding: "1px 7px", fontSize: 20, verticalAlign: "3px" }}>Pro</span>
              </span>
            </div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 10, lineHeight: 1.5 }}>
              {owns && isDesktop && sync.phase === "on" && sync.account?.email
                ? t("You have Pro, bought for {email}. Thank you for supporting MPTree.", { email: sync.account.email })
                : owns ? t("You have Pro. Thank you for supporting MPTree.")
                : viaAccount ? t("You have Pro through your MPTree account.")
                : trial.state === "live" ? t("Free week: {time} left.", { time: trialTimeLeft(trial.until) })
                : showWeek ? t("Choose how you want it.")
                : t("Pay once, keep it forever. No subscription.")}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            {features.map((f, i) => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "11px 2px", borderTop: `1px solid ${T.dim}`, borderBottom: i === features.length - 1 ? `1px solid ${T.dim}` : "none" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text, width: 112, flexShrink: 0, lineHeight: 1.35 }}>{f.title}</span>
                <span style={{ fontSize: 13, color: T.textSub, lineHeight: 1.45 }}>{f.body}</span>
              </div>
            ))}
          </div>
        </div>
        </div>

        <div style={{ ...column, padding: "14px 20px 20px", flexShrink: 0 }}>
          {owns ? (
            PRO_MODE === "free" ? (
              <button onClick={() => { lockProForTesting(); onToast(t("Pro locked again")); }}
                style={{ ...sh.saveBtn, background: T.dim, color: T.text }}>
                {t("Lock Pro again (test build)")}
              </button>
            ) : (
              <button onClick={onClose} style={sh.saveBtn}>{t("Done")}</button>
            )
          ) : viaAccount ? (
            <button onClick={onClose} style={sh.saveBtn}>{t("Done")}</button>
          ) : PRO_MODE === "none" ? (
            <>
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.5, margin: "0 0 12px", textAlign: "center" }}>
                {t("Pro is sold through Google Play. This copy of MPTree came from the website, so it cannot buy it.")}
              </div>
              <button onClick={onOpenStore} style={sh.saveBtn}>{t("Open Google Play")}</button>
              {needSignIn && (
                <button onClick={join} disabled={busy !== null || joining} style={link}>
                  {joining ? t("Signing in…") : t("Have Pro on another device? Sign in")}
                </button>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: showWeek ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: 10 }}>
                {buyCard}
                {showWeek && weekCard}
              </div>
              {isDesktop && joining && (
                <button onClick={() => { invoke("google_cancel_sign_in").catch(() => {}); }}
                  style={{ display: "block", margin: "8px auto 0", background: "transparent", border: "none", color: T.muted, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                  {t("Browser closed? Cancel and try again")}
                </button>
              )}
              {needSignIn ? (
                <div style={{ fontSize: 12, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>
                  {t("Pro is kept in your MPTree account, so every device you sign in on has it.")}
                </div>
              ) : isDesktop && PRO_MODE === "play" ? (
                <div style={{ fontSize: 12, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>
                  {busy === "buy"
                    ? t("Pay in your browser, then come back here. Pro switches on by itself.")
                    : trial.state === "live" ? t("Your free week is running. Pro is not bought yet.")
                    : t("You pay in your browser. Pro is then on every device you sign in on.")}
                </div>
              ) : null}
              {trialTest}
              {PRO_MODE === "play" && !needSignIn && (
                <button onClick={restore} disabled={busy !== null} style={link}>
                  {busy === "restore" ? t("Checking…") : t("Restore purchase")}
                </button>
              )}
            </>
          )}
        </div>
    </div>
  );
}

/** Shown once, when the free week has run out. */
export function TrialOverSheet({ onGetPro, onClose, T }: { onGetPro: () => void; onClose: () => void; T: T }) {
  const sh = makeSH(T);
  return (
    <div style={{ ...sh.overlay, zIndex: 460 }} onClick={onClose}>
      <div style={{ ...sh.sheet, paddingBottom: 28 }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={{ padding: "18px 24px 0", textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{t("Your free week is over")}</div>
          <div style={{ fontSize: 14, color: T.textSub, lineHeight: 1.5, marginTop: 8 }}>
            {t("Everything is back to how it was. Pro can be yours for good, with one payment.")}
          </div>
          <button onClick={onGetPro} style={{ ...sh.saveBtn, marginTop: 20 }}>
            {t("Get Pro")}
          </button>
          <button onClick={onClose}
            style={{ ...sh.saveBtn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 4 }}>
            {t("Not now")}
          </button>
        </div>
      </div>
    </div>
  );
}
