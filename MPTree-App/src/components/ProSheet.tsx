import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LoadLine } from "./LoadLine";
import { count, type CountEvent } from "../counter";
import { Capacitor } from "@capacitor/core";
import { makeSH, pageGround, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { RecordRow } from "./ProArt";
import {
  useOwnsPro, useAccountPro, useAdDay, buyPro, restorePro, useProPrice, lockProForTesting,
  watchAdForPro, adFailText, adOkText, adDayTimeLeft, endAdDayForTesting, ADS_ON, PRO_MODE, hasPro,
} from "../pro";
import { useSync, signIn } from "../sync/engine";

// ─── MPTREE PRO ──────────────────────────────────────────────────────────────
// Show it, then one button. At the top, pictures of what Pro does that you
// swipe through (the styles, the records, every device, the film); under them
// "Pay once. Yours for good." and three short lines; at the bottom one black
// button with Play's price. The day for an ad is a quiet link under it.
//
// Buying needs no MPTree account: the purchase is on the Google account, and
// Restore finds it there. After buying, a thank-you that leads into picking a
// style, and signing in is offered there, for sync, as an extra.

export type ProFrom = "settings" | "look" | "day" | "listen" | "other";

type ProSheetProps = {
  onClose: () => void;
  onToast: (msg: string) => void;
  /** Opens a store link. The sideloaded build uses it to point at Play. */
  onOpenStore: () => void;
  /** Account & sync, for when the account is on three devices already. */
  onOpenAccount: () => void;
  /** Personalise, from the thank-you after buying. */
  onOpenLook: () => void;
  /** Where the page was opened from, for the counter. */
  from?: ProFrom;
  T: T;
};

const OPEN_EVENT: Record<ProFrom, CountEvent> = {
  settings: "pro-open-settings", look: "pro-open-look", day: "pro-open-day", listen: "pro-open-listen", other: "pro-open-other",
};

// Line icons for the three lines, in the weight of the app's own.
const ico = (d: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICON_LOOK = ico(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>);
const ICON_SYNC = ico(<><rect x="3" y="4" width="11" height="8" rx="1.5" /><rect x="15" y="9" width="6" height="11" rx="1.5" /><path d="M6 16h6" /></>);
const ICON_CLEAN = ico(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>);
const ICON_NOADS = ico(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>);

export function ProSheet({ onClose, onToast, onOpenStore, onOpenAccount, onOpenLook, from = "other", T }: ProSheetProps) {
  const sh = makeSH(T);
  const owns = useOwnsPro();
  const viaAccount = useAccountPro();
  const sync = useSync();
  const phase = sync.phase;
  const adDay = useAdDay();
  const price = useProPrice();
  const [busy, setBusy] = useState<null | "buy" | "restore" | "signin" | "ad">(null);
  // The film about Pro (brag-output/pro.mp4), full screen. It ships inside the
  // app (public/pro-video.mp4), so it plays without internet too.
  const [film, setFilm] = useState(false);
  // Just bought here: the thank-you instead of the page.
  const [bought, setBought] = useState(false);
  // Signing in is for sync and for Pro bought on another device. Not in a
  // browser, where there is no signing in.
  const canSignIn = phase !== "on" && (Capacitor.getPlatform() !== "web" || import.meta.env.DEV);
  const joining = busy === "signin" || phase === "joining";

  useEffect(() => { count("pro-open"); count(OPEN_EVENT[from]); }, [from]);

  const buy = async () => {
    count("pro-tap-buy");
    setBusy("buy");
    // Signed in: Pro goes into that account, and no other. Not signed in: it
    // is on the Google account, and the first MPTree account signed in on
    // this phone takes it (pro.ts, untagged purchases).
    const r = await buyPro(sync.phase === "on" ? sync.account?.email : undefined);
    setBusy(null);
    if (r === "owned") setBought(true);
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
    if (r === "pro" || r === "pro-free") { onToast(adOkText(r)); onClose(); }
    else onToast(adFailText(r));
  };

  // ── The pictures ─────────────────────────────────────────────────────────
  // Screenshots of the app itself (public/pro-shots), so what is shown is
  // what you get. One feature per slide: first the player in three looks
  // side by side, then no ads, every device, and the film.
  const strip = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  // As big as the screen allows with most of the page still in view; the
  // rest scrolls. 290 is the size the pictures were laid out at.
  const SLIDE_H = Math.round(Math.max(200, Math.min(350, (typeof window !== "undefined" ? window.innerHeight : 800) - 480)));
  const k = SLIDE_H / 290;
  const shot = (file: string, w: number, h: number, style?: CSSProperties) => (
    <img src={`${import.meta.env.BASE_URL}pro-shots/${file}.jpg`} alt="" draggable={false} style={{
      display: "block", width: w, height: h, objectFit: "cover", objectPosition: "top", borderRadius: 18,
      boxShadow: "0 10px 30px rgba(0,0,0,0.16)", ...style,
    }} />
  );
  const slides: { title: string; body: string; art: ReactNode }[] = [
    {
      title: t("Styles and records"), body: t("Lantern, Aviela, marble and more."),
      art: (
        <div style={{ position: "relative", width: "100%", height: SLIDE_H }}>
          {shot("aviela", 150 * k, 208 * k, { position: "absolute", left: `calc(50% - ${175 * k}px)`, top: 44 * k, opacity: 0.6 })}
          {shot("marble", 150 * k, 208 * k, { position: "absolute", left: `calc(50% + ${25 * k}px)`, top: 44 * k, opacity: 0.6 })}
          {shot("lantern", 200 * k, 278 * k, { position: "absolute", left: `calc(50% - ${100 * k}px)`, top: 6, zIndex: 1 })}
        </div>
      ),
    },
    {
      title: t("No ads"), body: t("Not in Downloads, not for a Pro day. Just your music."),
      art: (
        <div style={{ position: "relative", width: 210 * k, height: SLIDE_H, margin: "0 auto" }}>
          {shot("songs", 210 * k, 278 * k, { position: "absolute", top: 6 })}
          <span style={{
            position: "absolute", right: -14, top: 120, background: T.accent, color: T.playBtnFg, borderRadius: 16,
            padding: "7px 12px", fontSize: 13, fontWeight: 800, boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
            display: "flex", alignItems: "center", gap: 6,
          }}>{ICON_NOADS}{t("No ads")}</span>
        </div>
      ),
    },
    {
      title: t("Every device"), body: t("Your songs, playlists and likes on up to three devices."),
      art: <div style={{ height: SLIDE_H, display: "flex", justifyContent: "center", paddingTop: 6, boxSizing: "border-box" }}>{shot("devices", 210 * k, 278 * k)}</div>,
    },
    {
      title: t("Watch how Pro works"), body: "0:44",
      art: (
        <button onClick={() => setFilm(true)} aria-label={t("Watch how Pro works")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: SLIDE_H, padding: "0 20px", boxSizing: "border-box", border: "none", background: "transparent", cursor: "pointer" }}>
          <span style={{ display: "block", position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 18, overflow: "hidden", border: `1px solid ${T.border}`, background: "#fff" }}>
            <img src={`${import.meta.env.BASE_URL}pro-video.jpg`} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span style={{ position: "absolute", left: "50%", top: "50%", width: 54, height: 54, marginLeft: -27, marginTop: -27, borderRadius: 27, background: "#0b0b0d", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fff" /></svg>
            </span>
          </span>
        </button>
      ),
    },
  ];
  const onStrip = () => {
    const el = strip.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== slide) setSlide(i);
  };
  const goSlide = (i: number) => strip.current?.scrollTo({ left: i * strip.current.clientWidth, behavior: "smooth" });

  const lines: { icon: ReactNode; text: string }[] = [
    { icon: ICON_NOADS, text: t("Ad-free listening, forever") },
    { icon: ICON_LOOK, text: t("Unlock all player styles and records") },
    { icon: ICON_SYNC, text: t("Sync your music across all your devices") },
    { icon: ICON_CLEAN, text: t("Clean up voice notes and clips") },
  ];

  const link = { ...sh.saveBtn, background: "transparent", color: T.muted, fontWeight: 600, fontSize: 14, marginTop: 2, padding: "10px 14px" };
  const small = { fontSize: 12, color: T.muted, textAlign: "center", marginTop: 8, lineHeight: 1.45 } as const;
  // The day for an ad: offered as long as no day is running.
  const showAd = ADS_ON && adDay.state !== "live";
  const has = owns || viaAccount;

  // A page of its own, the whole screen, like Account & sync. The app draws
  // edge to edge, so it steps over the status bar and the gesture bar itself.
  const column = { width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" } as const;
  const top = (
    <div style={{ ...column, display: "flex", justifyContent: "flex-end", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 0", flexShrink: 0 }}>
      <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
    </div>
  );

  if (bought) return (
    <div style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column" }}>
      {top}
      <div style={{ ...column, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 26px calc(env(safe-area-inset-bottom, 0px) + 22px)" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "calc(100% + 52px)", margin: "0 -26px" }}><RecordRow size={150} /></div>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.text, marginTop: 30 }}>{t("Pro is yours.")}</div>
          <div style={{ fontSize: 14.5, color: T.textSub, marginTop: 8, lineHeight: 1.5 }}>{t("Thank you. Pick a style to start.")}</div>
          <button onClick={onOpenLook} style={{ ...sh.saveBtn, marginTop: 22, width: "auto", padding: "14px 30px", fontFamily: "inherit" }}>{t("Choose a style")}</button>
        </div>
        {canSignIn && PRO_MODE !== "none" && (
          <div style={{ width: "100%", background: T.dim, borderRadius: 14, padding: "12px 14px", textAlign: "left", fontSize: 13, lineHeight: 1.45, color: T.text }}>
            <b>{t("More than one device?")}</b><br />
            <span style={{ color: T.textSub }}>{t("Sign in to put Pro and your songs on all of them.")}</span>{" "}
            <button onClick={join} disabled={busy !== null || joining} style={{ background: "none", border: "none", padding: 0, color: T.text, fontWeight: 700, textDecoration: "underline", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              {joining ? t("Signing in…") : t("Sign in")}
            </button>
          </div>
        )}
      </div>
      <LoadLine on={joining} T={T} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 450, display: "flex", flexDirection: "column" }}>
        <LoadLine on={(busy !== null && busy !== "ad") || joining} T={T} />
        {top}

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", minHeight: 0 }}>
        <div style={{ ...column, padding: "0 20px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <Logo size={32} color={T.text} />
            <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>
              MPTree <span style={{ fontWeight: 800, background: T.accent, color: T.playBtnFg, borderRadius: 7, padding: "1px 7px", fontSize: 17, verticalAlign: "2px" }}>Pro</span>
            </span>
          </div>

          {/* The pictures, swiped sideways, with dots that can be tapped. */}
          <div ref={strip} onScroll={onStrip} data-hscroll="" style={{
            display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none",
            overscrollBehaviorX: "contain", margin: "10px -20px 0", padding: "0 0 14px",
          }}>
            {slides.map(sl => (
              <div key={sl.title} style={{ flex: "0 0 100%", scrollSnapAlign: "center", minWidth: 0, overflow: "hidden" }}>{sl.art}</div>
            ))}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{slides[slide].title}</div>
            <div style={{ fontSize: 13, color: T.textSub, marginTop: 2 }}>{slides[slide].body}</div>
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
            {slides.map((sl, i) => (
              <button key={sl.title} onClick={() => goSlide(i)} aria-label={sl.title} style={{
                width: i === slide ? 18 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, cursor: "pointer",
                background: i === slide ? T.text : T.border, transition: "width 0.2s",
              }} />
            ))}
          </div>

          <div style={{ fontSize: 23, fontWeight: 800, color: T.text, textAlign: "center", marginTop: 14, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
            {has ? t("Pro is on. Thank you.") : <>{t("Pay once. Yours for good.")}</>}
          </div>
          {(has || adDay.state === "live") && (
            <div style={{ fontSize: 14, color: T.textSub, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
              {owns ? t("You have Pro. Thank you for supporting MPTree.")
                : viaAccount ? t("You have Pro through your MPTree account.")
                : adDay.state === "live" ? t("Pro for a day: {time} left.", { time: adDayTimeLeft(adDay.until) }) : null}
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            {lines.map((l, i) => (
              <div key={l.text} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 2px", borderTop: i ? `1px solid ${T.dim}` : "none" }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: T.dim, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{l.icon}</span>
                <span style={{ fontSize: 15, color: T.text, fontWeight: 600 }}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
        </div>

        <div style={{ ...column, padding: "12px 20px calc(env(safe-area-inset-bottom, 0px) + 14px)", flexShrink: 0 }}>
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
              {canSignIn && (
                <button onClick={join} disabled={busy !== null || joining} style={link}>
                  {joining ? t("Signing in…") : t("Have Pro on another device? Sign in")}
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={buy} disabled={busy !== null} style={{ ...sh.saveBtn, padding: 16, fontSize: 16, fontFamily: "inherit", opacity: busy === "buy" ? 0.6 : 1 }}>
                {busy === "buy" ? t("Opening Google Play…")
                  : PRO_MODE === "free" ? `${t("Get Pro")} · ${price} (${t("test build")})`
                  : `${t("Get Pro")} · ${price}`}
              </button>
              <div style={small}>{t("One payment. No subscription. No account needed.")}</div>
              {showAd && (
                <button onClick={watchAd} disabled={busy !== null} style={{ ...link, color: T.text, marginTop: 6 }}>
                  {busy === "ad" ? t("Loading the ad…") : t("Or try it free for a day")}
                </button>
              )}
              {PRO_MODE === "free" && adDay.state === "live" && (
                <button onClick={endAdDayForTesting} style={link}>{t("End the 24 hours (test build)")}</button>
              )}
              <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                {PRO_MODE === "play" && (
                  <button onClick={restore} disabled={busy !== null} style={{ ...link, width: "auto", fontSize: 12.5 }}>
                    {busy === "restore" ? t("Checking…") : t("Restore purchase")}
                  </button>
                )}
                {canSignIn && (
                  <button onClick={join} disabled={busy !== null || joining} style={{ ...link, width: "auto", fontSize: 12.5 }}>
                    {joining ? t("Signing in…") : t("Have Pro on another device? Sign in")}
                  </button>
                )}
              </div>
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
