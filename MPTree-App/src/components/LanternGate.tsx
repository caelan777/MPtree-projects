import { useEffect, useRef, useState } from "react";
import { t, tn } from "../i18n";
import { LANTERN_GREEN } from "../lantern";
import { speakLanternVoice } from "../lanternVoice";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// The first time someone with Pro puts Lantern on, the screen goes dark and a
// voice asks one thing. A green light in the dark swells with the voice, the
// question is written under it, and then the two answers come. "No" is the way
// in: the Lantern page opens out of the light from where they tapped. "Yes"
// puts the light out and shuts Lantern for a week, and says so.
//
// There was a ring here; it is gone. The voice is a clip made for this
// (lanternVoice.ts); the light is a gradient, made bigger and brighter by the
// voice's loudness every frame. Only opacity and transform change, so the
// phone moves it without drawing it again.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

const STYLE = `
  @keyframes lgDark   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lgBreathe { 0%, 100% { opacity: 0.45; transform: scale(0.92); } 50% { opacity: 0.75; transform: scale(1.04); } }
  @keyframes lgSay    { from { opacity: 0; transform: translateY(14px); letter-spacing: 0.12em; } to { opacity: 1; transform: none; letter-spacing: 0.01em; } }
  @keyframes lgUp     { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .lg-a { animation: none !important; } }
`;

type LanternGateProps = {
  /** "I am afraid". Shuts Lantern and says for how many days. */
  onYes: () => number;
  /** "I am not", and where on the screen that was said. */
  onNo: (at: { x: number; y: number }) => void;
  /** Away, after a yes. */
  onDone: () => void;
};

export function LanternGate({ onYes, onNo, onDone }: LanternGateProps) {
  const [shut, setShut] = useState<number | null>(null);
  // The answers wait until the voice has finished asking.
  const [asked, setAsked] = useState(false);
  const light = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = () => {};
    // A moment of dark first, then the voice.
    const start = setTimeout(() => {
      stop = speakLanternVoice(v => {
        const l = light.current, c = core.current;
        if (l) { l.style.opacity = String(0.5 + v * 0.5); l.style.transform = `scale(${(0.9 + v * 0.55).toFixed(3)})`; }
        if (c) { c.style.opacity = String(0.35 + v * 0.65); c.style.transform = `scale(${(0.8 + v * 0.7).toFixed(3)})`; }
      }, () => setTimeout(() => setAsked(true), 250));
    }, 650);
    // Whatever the sound does (a phone can keep it from starting at all), the
    // answers come: the question is written as well as spoken.
    const anyway = setTimeout(() => setAsked(true), 3400);
    return () => { clearTimeout(start); clearTimeout(anyway); stop(); };
  }, []);

  const btn: React.CSSProperties = {
    width: 132, height: 52, borderRadius: 26, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
  };
  const out = shut !== null;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} className="lg-a" style={{
      position: "fixed", inset: 0, zIndex: 480, background: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24, overflow: "hidden",
      animation: "lgDark 0.6s ease both",
    }}>
      <style>{STYLE}</style>

      {/* The light: a wide glow and a bright heart, both led by the voice
          while it speaks, breathing on their own once it has stopped. */}
      <div aria-hidden="true" style={{ position: "relative", width: 300, height: 300, flexShrink: 0 }}>
        <div ref={light} className="lg-a" style={{
          position: "absolute", inset: 0, borderRadius: "50%", willChange: "transform, opacity",
          background: `radial-gradient(circle, ${G}aa 0%, ${G}3a 34%, ${G}10 55%, transparent 70%)`,
          opacity: out ? 0 : 0.5, transition: out ? "opacity 1.6s ease, transform 1.6s ease" : "none",
          animation: asked && !out ? "lgBreathe 3.4s ease-in-out infinite" : "none",
        }} />
        <div ref={core} className="lg-a" style={{
          position: "absolute", left: 105, top: 105, width: 90, height: 90, borderRadius: "50%", willChange: "transform, opacity",
          background: `radial-gradient(circle, #ffffff 0%, ${PALE} 22%, ${G} 52%, transparent 72%)`,
          opacity: out ? 0 : 0.35, transition: out ? "opacity 1.2s ease, transform 1.2s ease" : "none",
          animation: asked && !out ? "lgBreathe 3.4s ease-in-out infinite" : "none",
        }} />
      </div>

      {!out ? (
        <>
          <div className="lg-a" style={{
            fontSize: 30, fontWeight: 800, color: PALE, textAlign: "center", textShadow: `0 0 20px ${G}88`,
            marginTop: -60, animation: "lgSay 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.75s both",
          }}>
            {t("Are you afraid?")}
          </div>
          <div style={{ display: "flex", gap: 14, height: 52, opacity: asked ? 1 : 0, transform: asked ? "none" : "translateY(12px)", transition: "opacity 0.6s ease, transform 0.6s ease", pointerEvents: asked ? "auto" : "none" }}>
            <button onClick={() => setShut(onYes())} style={{ ...btn, background: "transparent", color: PALE, border: `1.5px solid ${G}88` }}>{t("Yes")}</button>
            <button onClick={e => onNo({ x: e.clientX, y: e.clientY })} style={{ ...btn, background: G, color: "#04140b", border: "none" }}>{t("No")}</button>
          </div>
        </>
      ) : (
        <>
          <div className="lg-a" style={{ textAlign: "center", marginTop: -60, animation: "lgUp 0.8s ease 0.7s both" }}>
            <div style={{ fontSize: 25, fontWeight: 800, color: PALE }}>
              {tn(shut, "Lantern is locked for {n} day.", "Lantern is locked for {n} days.")}
            </div>
            <div style={{ fontSize: 15, color: "#8fb3a1", marginTop: 8 }}>{t("Come back when you are not afraid.")}</div>
          </div>
          <div className="lg-a" style={{ animation: "lgUp 0.6s ease 1.3s both" }}>
            <button onClick={onDone} style={{ ...btn, background: "transparent", color: PALE, border: "1.5px solid #3c5248" }}>{t("OK")}</button>
          </div>
        </>
      )}
    </div>
  );
}
