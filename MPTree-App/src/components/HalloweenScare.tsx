import { useEffect, useState } from "react";
import { makeSH, type T } from "../themes";
import { t, getLang } from "../i18n";

// ─── HALLOWEEN ───────────────────────────────────────────────────────────────
// The scare and what comes after it (see halloween.ts). The screen goes black,
// two eyes and a grin come out of the dark, and a second later it is over. No
// sound, so whatever is playing just carries on. With reduced motion on in
// Android the eyes fade in instead of appearing at once.

/** How long the dark lasts before the eyes, and how long they stay. */
const DARK_MS = 350;
const EYES_MS = 900;

export function HalloweenScare({ onBoo, onDone }: { onBoo: () => void; onDone: () => void }) {
  const [eyes, setEyes] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => { setEyes(true); onBoo(); }, DARK_MS);
    const b = setTimeout(onDone, DARK_MS + EYES_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  // Once, when it starts: the parent's callbacks are new on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 650, background: "#000" }}>
      <style>{`
        .hw-eyes { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .hw-eyes { animation: hwFade 0.4s ease backwards; } }
        @keyframes hwFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {eyes && (
        <svg className="hw-eyes" width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <filter id="hw-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
          </defs>
          <g filter="url(#hw-glow)" opacity="0.75">
            <path d="M118 380 Q146 352 172 384 Q146 396 118 380 Z" fill="#fff" />
            <path d="M272 380 Q244 352 218 384 Q244 396 272 380 Z" fill="#fff" />
          </g>
          <path d="M118 380 Q146 352 172 384 Q146 396 118 380 Z" fill="#fff" />
          <path d="M272 380 Q244 352 218 384 Q244 396 272 380 Z" fill="#fff" />
          <circle cx="147" cy="379" r="4" fill="#000" />
          <circle cx="243" cy="379" r="4" fill="#000" />
          <path d="M128 470 Q195 520 262 470" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

/** After the scare. `treat`: what pro.ts giveDay gave, null for someone who
 *  has Pro for good. */
export function HalloweenSheet({ treat, onClose, T }: {
  treat: { kind: "day" | "added"; until: number } | null;
  onClose: () => void;
  T: T;
}) {
  const sh = makeSH(T);
  const until = treat
    ? new Date(treat.until).toLocaleString({ en: "en-GB", nl: "nl-NL", es: "es-ES" }[getLang()], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";
  const body = !treat ? t("Sorry for the scare. You have Pro already, so this one is just to say thank you.")
    : treat.kind === "day" ? t("A treat to make up for the scare: 24 hours of Pro, no ad needed.")
    : t("A treat to make up for the scare: 24 more hours of Pro.");

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div style={sh.sheet} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={{ padding: "22px 20px 0" }}>
          <svg width="64" height="34" viewBox="0 0 64 34" fill="none" stroke={T.text} strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
            <ellipse cx="32" cy="17" rx="14" ry="11" />
            <path d="M18 17 L4 6 L6 17 L4 28 Z" />
            <path d="M46 17 L60 6 L58 17 L60 28 Z" />
            <path d="M26 8 Q32 17 26 26" strokeWidth="2" />
            <path d="M33 7 Q39 17 33 27" strokeWidth="2" />
          </svg>
          <div style={{ fontSize: 28, fontWeight: 900, color: T.text, marginTop: 14 }}>{t("Happy Halloween")}</div>
          <p style={{ color: T.textSub, fontSize: 15, lineHeight: 1.55, margin: "8px 0 14px" }}>{body}</p>
          {treat && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: T.dim, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: T.textSub }}>{t("Pro runs until")}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{until}</span>
            </div>
          )}
          <button onClick={onClose} style={{ ...sh.saveBtn, fontFamily: "inherit", marginTop: 14 }}>{t("Thanks")}</button>
        </div>
      </div>
    </div>
  );
}
