import { useState, type ReactNode } from "react";
import type { T } from "../themes";
import { t, tn, phoneLang, type LangPref } from "../i18n";
import { Logo } from "./Logo";
import { Switch } from "./Switch";
import { LanguageSheet } from "./LanguageSheet";
import { IC } from "./Icons";

export type MusicAccess = "unasked" | "asking" | "allowed" | "denied";

/**
 * First launch only, between the loading screen and the tutorial.
 *
 *   "setup"  language, music access, update notices, then Next
 *   "enter"  one button; the library opens out of the spot you tapped
 *
 * Nothing here asks Android for anything by itself. The media permission
 * prompt appears when you tap Allow, not because a screen came up, which is
 * the whole reason this page exists: a permission dialog that arrives with
 * its reason already on screen gets answered, one that arrives cold gets
 * refused.
 *
 * The opening is a mask on this page, not a clip on the app: a hole that
 * grows from the finger until there is no page left. The app underneath is
 * never touched, so nothing in it (fixed headers, the player) can be clipped
 * or thrown off by the effect.
 */
export function WelcomeScreen({
  lang, onPickLang, music, onAllowMusic, onOpenAppSettings,
  updateNotices, onSetUpdateNotices, songCount, onEnter, onEntered, T,
}: {
  lang: LangPref;
  onPickLang: (l: LangPref) => void;
  music: MusicAccess;
  onAllowMusic: () => void;
  onOpenAppSettings: () => void;
  /** null hides the row: the demo has nothing to update. */
  updateNotices: boolean | null;
  onSetUpdateNotices: (on: boolean) => void;
  songCount: number;
  /** The tap on Enter, before the opening starts. */
  onEnter: () => void;
  /** The opening has finished and the page is gone. */
  onEntered: () => void;
  T: T;
}) {
  const [stage, setStage] = useState<"setup" | "permission" | "enter">("setup");
  // The access page steps aside by itself the moment access is granted, back
  // to the welcome page, where Next now leads on.
  const shown = stage === "permission" && music === "allowed" ? "setup" : stage;
  const [langOpen, setLangOpen] = useState(false);
  const [hole, setHole] = useState<{ x: number; y: number } | null>(null);

  const langName = (lang === "auto" ? phoneLang() : lang) === "nl" ? "Nederlands" : "English";

  const card: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
    background: T.dim, border: "none", borderRadius: 14, padding: "15px 16px",
    color: T.text, fontFamily: "inherit",
  };
  const sub: React.CSSProperties = { display: "block", fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginTop: 3 };
  const primary: React.CSSProperties = {
    width: "100%", padding: 16, background: T.accent, color: T.playBtnFg, border: "none",
    borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  };
  const pill = (label: string, onClick: () => void, filled = true): ReactNode => (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, padding: "8px 14px", borderRadius: 18, cursor: "pointer", fontFamily: "inherit",
        fontSize: 13.5, fontWeight: 700,
        background: filled ? T.accent : "transparent", color: filled ? T.playBtnFg : T.text,
        border: filled ? "none" : `1px solid ${T.border}`,
      }}
    >
      {label}
    </button>
  );

  const musicRight = music === "allowed"
    ? <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.text, fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>{IC.Check(T.text)}{t("Allowed")}</span>
    : music === "asking"
      ? <span style={{ color: T.muted, fontSize: 13.5, flexShrink: 0 }}>…</span>
      : music === "denied"
        ? pill(t("Settings"), onOpenAppSettings, false)
        : pill(t("Allow"), onAllowMusic);

  const enter = (e: React.MouseEvent) => {
    setHole({ x: e.clientX, y: e.clientY });
    onEnter();
  };

  return (
    <div
      onAnimationEnd={e => { if (e.animationName === "mpReveal") onEntered(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 410, background: T.bg, color: T.text,
        display: "flex", flexDirection: "column",
        padding: "calc(env(safe-area-inset-top, 0px) + 28px) 22px calc(env(safe-area-inset-bottom, 0px) + 24px)",
        boxSizing: "border-box",
        ...(hole ? {
          "--mpx": `${hole.x}px`, "--mpy": `${hole.y}px`,
          WebkitMaskImage: "radial-gradient(circle at var(--mpx) var(--mpy), transparent var(--mpr), #000 calc(var(--mpr) + 1px))",
          maskImage: "radial-gradient(circle at var(--mpx) var(--mpy), transparent var(--mpr), #000 calc(var(--mpr) + 1px))",
          animation: "mpReveal 0.7s cubic-bezier(0.65, 0, 0.35, 1) 0.08s both",
          pointerEvents: "none",
        } as React.CSSProperties : null),
      }}
    >
      {shown === "setup" ? (
        <div key="setup" style={{ flex: 1, display: "flex", flexDirection: "column", animation: "mpFadeIn 0.3s ease both" }}>
          <Logo size={60} color={T.text} />
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 22, letterSpacing: "-0.01em" }}>{t("Welcome to MPTree")}</div>
          <div style={{ fontSize: 15, color: T.textSub, marginTop: 8, lineHeight: 1.5 }}>
            {t("A few things to set up before you start listening.")}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            <button style={{ ...card, cursor: "pointer" }} onClick={() => setLangOpen(true)}>
              <span style={{ flex: 1, fontSize: 15.5, fontWeight: 600 }}>{t("Language")}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.muted, fontSize: 14 }}>{langName}<IC.ChevronR /></span>
            </button>

            <div style={card}>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 15.5, fontWeight: 600 }}>{t("Your music")}</span>
                <span style={sub}>
                  {music === "denied"
                    ? t("Not allowed yet. Open Settings, then Permissions > Music and audio > Allow.")
                    : t("MPTree needs to read the audio files on your phone. Nothing leaves it.")}
                </span>
              </span>
              {musicRight}
            </div>

            {updateNotices !== null && (
              <button style={{ ...card, cursor: "pointer" }} onClick={() => onSetUpdateNotices(!updateNotices)} aria-pressed={updateNotices}>
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 600 }}>{t("Update notices")}</span>
                  <span style={sub}>{t("Tell me when a new version of MPTree is out.")}</span>
                </span>
                <Switch on={updateNotices} T={T} />
              </button>
            )}
          </div>

          <div style={{ flex: 1 }} />
          {/* Without music access there is nothing to enter into, so Next
              goes to the page that says so, not past it. */}
          <button style={primary} onClick={() => setStage(music === "allowed" ? "enter" : "permission")}>{t("Next")}</button>
        </div>
      ) : shown === "permission" ? (
        <div
          key="permission"
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            textAlign: "center", animation: "mpFadeIn 0.3s ease backwards",
          }}
        >
          <div style={{ width: 76, height: 76, borderRadius: 22, background: T.dim, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 24 }}>{t("Music access needed")}</div>
          <div style={{ fontSize: 15, color: T.textSub, marginTop: 10, lineHeight: 1.55, maxWidth: 330 }}>
            {t("MPTree plays the songs on your device, so it needs permission to read your audio files. It never uploads or shares anything. Everything stays on your phone.")}
          </div>
          <div style={{ width: "100%", maxWidth: 330, marginTop: 28 }}>
            {music === "denied" ? (
              <>
                <button style={primary} onClick={onOpenAppSettings}>{t("Open app settings")}</button>
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
                  {t("Tap \"Open app settings\", then Permissions > Music and audio > Allow.")}
                </div>
              </>
            ) : (
              <button
                style={{ ...primary, opacity: music === "asking" ? 0.5 : 1 }}
                disabled={music === "asking"}
                onClick={onAllowMusic}
              >
                {t("Allow")}
              </button>
            )}
          </div>
          <button
            onClick={() => setStage("setup")}
            style={{ marginTop: 14, background: "transparent", border: "none", color: T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 8 }}
          >
            {t("Back")}
          </button>
        </div>
      ) : (
        <div
          key="enter"
          style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            // "backwards", not "both": a fill that holds the last frame would
            // hold opacity at 1 and the fade-out on Enter would never show.
            textAlign: "center", animation: "mpFadeIn 0.3s ease backwards",
            opacity: hole ? 0 : 1, transition: "opacity 0.16s ease",
          }}
        >
          <Logo size={96} color={T.text} />
          <div style={{ fontSize: 15, color: T.muted, marginTop: 26, minHeight: 22 }}>
            {music === "allowed" && songCount > 0 ? tn(songCount, "{n} song is ready.", "{n} songs are ready.") : t("You're all set.")}
          </div>
          <button style={{ ...primary, width: "auto", padding: "16px 34px", borderRadius: 30, marginTop: 18 }} onClick={enter}>
            {t("Enter MPTree")}
          </button>
          <button
            onClick={() => setStage("setup")}
            style={{ marginTop: 14, background: "transparent", border: "none", color: T.muted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 8 }}
          >
            {t("Back")}
          </button>
        </div>
      )}

      {langOpen && (
        <LanguageSheet value={lang} onPick={l => { onPickLang(l); setLangOpen(false); }} onClose={() => setLangOpen(false)} T={T} />
      )}
    </div>
  );
}
