import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import {
  useOwnsPro, useAccountPro, useAdDay, buyPro, restorePro, proPrice, lockProForTesting,
  watchAdForPro, adDayTimeLeft, endAdDayForTesting, ADS_ON, PRO_MODE, hasPro,
} from "../pro";
import { useSync, signIn } from "../sync/engine";
import { GoogleG } from "./AccountSheet";

// ─── MPTREE PRO ──────────────────────────────────────────────────────────────
// What Pro does, line by line, and how to get it: pay once, or watch an ad for
// a day of it. The two stand side by side as equals, however the page opened.

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
  const adDay = useAdDay();
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "buy" | "restore" | "signin" | "ad">(null);
  // The film about Pro (brag-output/pro.mp4), full screen. It ships inside the
  // app (public/pro-video.mp4), so it plays without internet too.
  const [film, setFilm] = useState(false);
  // Pro is kept in the MPTree account, so buying starts with signing in. Not
  // in a browser, where there is no signing in (the demo buys straight away).
  const needSignIn = phase !== "on" && (Capacitor.getPlatform() !== "web" || import.meta.env.DEV);
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
    else if (r === "failed") onToast(t("Google Play could not be reached. Try again in a moment."));
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
    onToast(r === null ? t("Google Play could not be reached. Try again in a moment.")
      : r ? t("Pro restored") : t("No Pro purchase found on this Google account"));
  };

  const watchAd = async () => {
    setBusy("ad");
    const r = await watchAdForPro();
    setBusy(null);
    if (r === "pro") { onToast(t("Pro is on for 24 hours")); onClose(); }
    else if (r === "offline") onToast(t("The ad needs an internet connection."));
    else if (r === "closed") onToast(t("The ad was closed early, so Pro did not turn on."));
    else if (r === "none") onToast(t("There is no ad to show right now. Try again later."));
    else if (r === "consent") onToast(t("Ads are turned off in your privacy choices."));
    else onToast(t("The ad could not be shown. Try again in a moment."));
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
  // The ad, as often as they like; it never asks for payment details.
  const showAd = ADS_ON && adDay.state !== "live";
  const adTest = PRO_MODE === "free" && adDay.state === "live" && (
    <button onClick={endAdDayForTesting} style={link}>{t("End the 24 hours (test build)")}</button>
  );

  // Two cards side by side, the same size: pay once, or a day for an ad.
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
            : busy === "buy" ? t("Opening Google Play…") : t("Get Pro")}
        </button>
      )}
    </div>
  );
  const adCard = (
    <div style={choice(false)}>
      <div style={kicker}>{t("At no cost")}</div>
      <div style={big}>{t("24 hours")}</div>
      <div style={note}>{t("Watch one ad. As often as you like.")}</div>
      <button onClick={watchAd} disabled={busy !== null}
        style={{ ...cardBtn, background: T.dim, color: T.text, opacity: busy === "ad" ? 0.7 : 1 }}>
        {busy === "ad" ? t("Loading…") : t("Watch ad")}
      </button>
    </div>
  );

  // A page of its own, the whole screen, like Account & sync. The app draws
  // edge to edge, so it steps over the status bar and the gesture bar itself.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  return (
    <div style={{ position: "fixed", inset: 0, background: T.bg, zIndex: 450, display: "flex", flexDirection: "column" }}>
        <div style={{ ...column, display: "flex", justifyContent: "flex-end", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 0", flexShrink: 0 }}>
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ ...column, padding: "0 20px 8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo size={40} color={T.text} />
              <span style={{ fontSize: 26, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>
                MPTree <span style={{ fontWeight: 800, background: T.accent, color: T.playBtnFg, borderRadius: 7, padding: "1px 7px", fontSize: 20, verticalAlign: "3px" }}>Pro</span>
              </span>
            </div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 10, lineHeight: 1.5 }}>
              {owns ? t("You have Pro. Thank you for supporting MPTree.")
                : viaAccount ? t("You have Pro through your MPTree account.")
                : adDay.state === "live" ? t("Pro for a day: {time} left.", { time: adDayTimeLeft(adDay.until) })
                : showAd ? t("Choose how you want it.")
                : t("Pay once, keep it forever. No subscription.")}
            </div>
          </div>

          <button onClick={() => setFilm(true)} aria-label={t("Watch how Pro works")}
            style={{ display: "block", width: "100%", marginTop: 18, padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span style={{ display: "block", position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 16, overflow: "hidden", border: `1px solid ${T.border}`, background: "#fff" }}>
              <img src={`${import.meta.env.BASE_URL}pro-video.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", left: "50%", top: "50%", width: 58, height: 58, marginLeft: -29, marginTop: -29, borderRadius: 29, background: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff" /></svg>
              </span>
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, padding: "0 2px" }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{t("Watch how Pro works")}</span>
              <span style={{ fontSize: 12.5, color: T.muted }}>0:44</span>
            </span>
          </button>

          <div style={{ marginTop: 14 }}>
            {features.map((f, i) => (
              <div key={f.title} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "11px 2px", borderTop: `1px solid ${T.dim}`, borderBottom: i === features.length - 1 ? `1px solid ${T.dim}` : "none" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text, width: 112, flexShrink: 0, lineHeight: 1.35 }}>{f.title}</span>
                <span style={{ fontSize: 13, color: T.textSub, lineHeight: 1.45 }}>{f.body}</span>
              </div>
            ))}
          </div>
        </div>

        </div>

        <div style={{ ...column, padding: "14px 20px calc(env(safe-area-inset-bottom, 0px) + 20px)", flexShrink: 0 }}>
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
              <div style={{ display: "grid", gridTemplateColumns: showAd ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)", gap: 10 }}>
                {buyCard}
                {showAd && adCard}
              </div>
              {needSignIn && (
                <div style={{ fontSize: 12, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.45 }}>
                  {t("Pro is kept in your MPTree account, so every device you sign in on has it.")}
                </div>
              )}
              {adTest}
              {PRO_MODE === "play" && !needSignIn && (
                <button onClick={restore} disabled={busy !== null} style={link}>
                  {busy === "restore" ? t("Checking…") : t("Restore purchase")}
                </button>
              )}
            </>
          )}
        </div>

        {film && (
          <div style={{ position: "fixed", inset: 0, zIndex: 460, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <video src={`${import.meta.env.BASE_URL}pro-video.mp4`}
              autoPlay controls playsInline onEnded={() => setFilm(false)}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            <button onClick={() => setFilm(false)} aria-label={t("Close")}
              style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 14, width: 44, height: 44, borderRadius: 22, border: "none", background: "rgba(255,255,255,0.9)", color: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <IC.Close />
            </button>
          </div>
        )}
    </div>
  );
}
