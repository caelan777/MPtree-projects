import { useEffect, useState } from "react";
import { t, tn } from "../i18n";
import { LANTERN_GREEN } from "../lantern";
import { speakLanternVoice, VOICE_STEP } from "../lanternVoice";
import { lanternFigure, FIGURE_RATIO } from "../lanternFigure";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// The first time someone with Pro puts Lantern on, the screen goes dark and a
// voice asks one thing. A man stands in the dark with green light on his
// shoulders (lanternFigure.ts); the light swells with the voice, the question
// is written under him, and then the two answers come. "No" is the way
// in: the Lantern page opens out of the light from where they tapped. "Yes"
// puts the light out and shuts Lantern for a week, and says so.
//
// There was a ring here, and then a green light on its own; the figure took
// their place. The voice is a clip made for this (lanternVoice.ts); the light
// on the figure is its own picture over him, made brighter by the voice's
// loudness. That loudness is measured before the clip plays and given
// to the light as one animation, so the GPU runs it from start to end and the
// page's main thread has nothing to do while it speaks. Only opacity and
// transform change, so the phone moves it without drawing it again.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

const STYLE = `
  @keyframes lgDark   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lgBreatheL { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.72; } }
  @keyframes lgRise   { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
  @keyframes lgSay    { from { opacity: 0; transform: translateY(14px) scale(1.06); } to { opacity: 1; transform: none; } }
  @keyframes lgUp     { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .lg-a { animation: none !important; } }
`;
// Only opacity and transform move here, the two a phone can animate without
// laying out or drawing anything again. The question used to close up its
// letter spacing as it came in, which is a new layout on every frame.

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
  // The light's animation while the voice speaks, made from its loudness.
  const [voice, setVoice] = useState<{ css: string; ms: number } | null>(null);
  const figure = lanternFigure();

  useEffect(() => {
    let stop = () => {};
    // A moment of dark first, then the voice.
    const start = setTimeout(() => {
      stop = speakLanternVoice(levels => {
        const n = levels.length - 1;
        const frames = (f: (v: number) => string) =>
          levels.map((v, i) => `${((i / n) * 100).toFixed(2)}% { ${f(v)} }`).join(" ");
        setVoice({
          ms: n * VOICE_STEP,
          css: `@keyframes lgVoiceL { ${frames(v => `opacity: ${(0.4 + v * 0.6).toFixed(3)};`)} }`,
        });
      }, () => setTimeout(() => setAsked(true), 250));
    }, 650);
    // Whatever the sound does (a phone can keep it from starting at all), the
    // answers come: the question is written as well as spoken.
    const anyway = setTimeout(() => setAsked(true), 4500);
    return () => { clearTimeout(start); clearTimeout(anyway); stop(); };
  }, []);

  const btn: React.CSSProperties = {
    width: 132, height: 52, borderRadius: 26, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
  };
  const out = shut !== null;
  // While it speaks, the voice leads the light; after, it breathes on its own.
  // Both start and end where nothing is said, so one hands over to the other
  // without a jump.
  const lead = (own: string, breathe: string) =>
    out ? "none" : asked ? `${breathe} 3.4s ease-in-out infinite` : voice ? `${own} ${voice.ms}ms linear forwards` : "none";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} className="lg-a" style={{
      position: "fixed", inset: 0, zIndex: 480, background: "#000",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24, overflow: "hidden",
      animation: "lgDark 0.6s ease both",
    }}>
      <style>{STYLE + (voice?.css ?? "")}</style>

      {/* The man in the dark, and the light on his shoulders over him: led
          by the voice while it speaks, breathing on its own once it has
          stopped, and put out by a yes. */}
      <div aria-hidden="true" className="lg-a" style={{
        position: "relative", width: "min(100vw, 540px)", aspectRatio: String(FIGURE_RATIO), flexShrink: 0,
        animation: "lgRise 1.4s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both",
      }}>
        <img src={figure.body} alt="" draggable={false} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          opacity: out ? 0.35 : 1, transition: "opacity 1.6s ease",
        }} />
        <img src={figure.light} alt="" draggable={false} className="lg-a" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "opacity",
          opacity: out ? 0 : 0.4, transition: out ? "opacity 1.6s ease" : "none",
          animation: lead("lgVoiceL", "lgBreatheL"),
        }} />
      </div>

      {!out ? (
        <>
          <div className="lg-a" style={{
            fontSize: 30, fontWeight: 800, color: PALE, textAlign: "center", textShadow: `0 0 20px ${G}88`,
            marginTop: -70, animation: "lgSay 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.75s both",
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
          <div className="lg-a" style={{ textAlign: "center", marginTop: -70, animation: "lgUp 0.8s ease 0.7s both" }}>
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
