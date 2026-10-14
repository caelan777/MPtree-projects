import { useEffect, useState } from "react";
import { t, tn } from "../i18n";
import { LANTERN_GREEN } from "../lantern";
import { speakLanternVoice, playLanternBuildUp, VOICE_STEP, BUILD_MS, BUILD_BEATS } from "../lanternVoice";
import { lanternFigure, FIGURE_RATIO } from "../lanternFigure";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// The first time someone with Pro puts Lantern on, the screen goes dark and
// something builds: a low drone that rises, a hiss, a heart that beats faster
// (lanternVoice.ts), and the dark pulses green on every beat. Then a hit, and
// he is there: a man in the dark with green light on his shoulders
// (lanternFigure.ts), the light flickering on. A moment of quiet, and a voice
// asks one thing, the words coming as it says them, the light swelling with
// it. Then the two answers. "No" is the way in: the Lantern page opens out of
// the light from where they tapped. "Yes" puts the light out and shuts
// Lantern for a week, and says so.
//
// Everything is set going at the start, on fixed times from it, as CSS
// animations with plain numbers: the GPU runs them, and the sound is laid out
// on its own clock the same way, so the two keep together without the page
// doing anything in between. Only the voice's light is made when the voice
// starts, from its loudness, and handed over as one animation too.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

/** When he appears: at the hit, the end of the build-up. */
const REVEAL = BUILD_MS;
/** When the voice asks, after a moment of quiet. */
const SPEAK = BUILD_MS + 900;
/** The words of the question come this far apart, roughly as they are said. */
const WORD_GAP = 380;

// The dark pulses on each heartbeat: up fast, down again, a little more each
// time. Keyframes made from the same beats the sound uses.
const BEAT_FRAMES = (() => {
  const pct = (ms: number) => `${Math.min(100, (ms / BUILD_MS) * 100).toFixed(2)}%`;
  let out = "0% { opacity: 0; }";
  for (const ms of BUILD_BEATS) {
    const peak = 0.12 + 0.5 * (ms / BUILD_MS);
    out += ` ${pct(ms - 10)} { opacity: 0; } ${pct(ms + 30)} { opacity: ${peak.toFixed(2)}; } ${pct(ms + 150)} { opacity: 0; }`;
  }
  return `@keyframes lgBeat { ${out} 100% { opacity: 0; } }`;
})();

// Motes of green light drifting up once he is there. Fixed, so the same each
// time: where across, how far up and sideways, how long, how late.
const MOTES = Array.from({ length: 16 }, (_, i) => {
  const r = (k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  return { left: 8 + r(1) * 84, rise: 260 + r(2) * 300, drift: (r(3) - 0.5) * 60, ms: 5200 + r(4) * 4200, delay: r(5) * 4000, size: 2 + r(6) * 3 };
});
const MOTE_FRAMES = MOTES.map((m, i) =>
  `@keyframes lgMote${i} { 0% { opacity: 0; transform: translate(0px, 0px); } 15% { opacity: 0.85; } 80% { opacity: 0.5; }` +
  ` 100% { opacity: 0; transform: translate(${m.drift.toFixed(0)}px, ${-m.rise.toFixed(0)}px); } }`).join("\n");

const STYLE = `
  @keyframes lgDark   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lgAppear { 0% { opacity: 0; transform: scale(1.08); } 12% { opacity: 0.7; } 100% { opacity: 1; transform: scale(1); } }
  @keyframes lgIgnite { 0% { opacity: 0; } 8% { opacity: 1; } 14% { opacity: 0.15; } 22% { opacity: 0.85; } 30% { opacity: 0.3; } 42% { opacity: 0.9; } 100% { opacity: 0.4; } }
  @keyframes lgFlash  { 0% { opacity: 0; } 6% { opacity: 0.55; } 100% { opacity: 0; } }
  @keyframes lgBreatheL { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.72; } }
  @keyframes lgWord   { from { opacity: 0; transform: translateY(12px) scale(1.04); } to { opacity: 1; transform: none; } }
  @keyframes lgUp     { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  ${BEAT_FRAMES}
  ${MOTE_FRAMES}
  @media (prefers-reduced-motion: reduce) { .lg-a { animation: none !important; } }
`;
// Only opacity and transform move here, the two a phone can animate without
// laying out or drawing anything again. Each element's resting style is how
// it ends, so with motion turned off everything simply shows.

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
    // The build-up starts with the dark; the sound was woken in the tap.
    const stopBuild = playLanternBuildUp();
    let stop = () => {};
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
    }, SPEAK);
    // Whatever the sound does (a phone can keep it from starting at all), the
    // answers come: the question is written as well as spoken.
    const anyway = setTimeout(() => setAsked(true), SPEAK + 3600);
    return () => { clearTimeout(start); clearTimeout(anyway); stop(); stopBuild(); };
  }, []);

  const btn: React.CSSProperties = {
    width: 138, height: 54, borderRadius: 27, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
  };
  const out = shut !== null;
  // The light on him: it flickers on at the hit, the voice leads it while it
  // speaks, and after that it breathes on its own. Each hands over to the next
  // at the same strength, so there is no jump.
  const light = out ? "none"
    : asked ? "lgBreatheL 3.4s ease-in-out infinite"
    : voice ? `lgVoiceL ${voice.ms}ms linear forwards`
    : `lgIgnite 1300ms linear ${REVEAL}ms both`;
  const words = t("Are you afraid?").split(" ");

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} className="lg-a" style={{
      position: "fixed", inset: 0, zIndex: 480, background: "#000", overflow: "hidden",
      animation: "lgDark 0.6s ease both",
    }}>
      <style>{STYLE + (voice?.css ?? "")}</style>

      {/* The dark, pulsing green with the heart while it builds. */}
      <div aria-hidden="true" className="lg-a" style={{
        position: "absolute", inset: 0, opacity: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 60% 38% at 50% 40%, ${G}55 0%, ${G}18 45%, transparent 75%)`,
        animation: `lgBeat ${BUILD_MS}ms linear both`,
      }} />

      {/* Him, and the light on his shoulders over him. */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "3vh", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div className="lg-a" style={{
          position: "relative", width: "min(118vw, 640px)", aspectRatio: String(FIGURE_RATIO), flexShrink: 0, willChange: "transform, opacity",
          animation: `lgAppear 1800ms cubic-bezier(0.16, 1, 0.3, 1) ${REVEAL}ms both`,
        }}>
          <img src={figure.body} alt="" draggable={false} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            opacity: out ? 0.25 : 1, transition: "opacity 1.6s ease",
          }} />
          <img src={figure.light} alt="" draggable={false} className="lg-a" style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "opacity", mixBlendMode: "screen",
            opacity: out ? 0 : 0.4, transition: out ? "opacity 1.6s ease" : "none",
            animation: light,
          }} />
        </div>
      </div>

      {/* The hit: a flash of green light where he appears. */}
      <div aria-hidden="true" className="lg-a" style={{
        position: "absolute", inset: 0, opacity: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 70% 45% at 50% 38%, #d8ffe9 0%, ${G}88 30%, transparent 70%)`,
        animation: `lgFlash 1100ms ease-out ${REVEAL}ms both`,
      }} />

      {/* Motes of light drifting up. */}
      {!out && MOTES.map((m, i) => (
        <span key={i} aria-hidden="true" className="lg-a" style={{
          position: "absolute", left: `${m.left}%`, top: "62%", width: m.size, height: m.size, borderRadius: "50%",
          background: "#b8ffd8", boxShadow: `0 0 ${m.size * 3}px ${G}`, opacity: 0, pointerEvents: "none", willChange: "transform, opacity",
          animation: `lgMote${i} ${m.ms.toFixed(0)}ms linear ${(REVEAL + 400 + m.delay).toFixed(0)}ms infinite`,
        }} />
      ))}

      {/* The edges go to black. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 85% 75% at 50% 42%, transparent 55%, #000 100%)",
      }} />

      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 24px calc(env(safe-area-inset-bottom, 0px) + 9vh)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 30,
      }}>
        {!out ? (
          <>
            <div style={{ fontSize: 36, fontWeight: 800, color: PALE, textAlign: "center", letterSpacing: -0.5, textShadow: `0 0 24px ${G}99` }}>
              {words.map((w, i) => (
                <span key={i} className="lg-a" style={{
                  display: "inline-block", marginRight: i < words.length - 1 ? "0.28em" : 0,
                  animation: `lgWord 900ms cubic-bezier(0.2, 0.8, 0.2, 1) ${SPEAK + i * WORD_GAP}ms both`,
                }}>{w}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, height: 54, opacity: asked ? 1 : 0, transform: asked ? "none" : "translateY(12px)", transition: "opacity 0.6s ease, transform 0.6s ease", pointerEvents: asked ? "auto" : "none" }}>
              <button onClick={() => setShut(onYes())} style={{ ...btn, background: "rgba(0,0,0,0.35)", color: PALE, border: `1.5px solid ${G}88` }}>{t("Yes")}</button>
              <button onClick={e => onNo({ x: e.clientX, y: e.clientY })} style={{ ...btn, background: G, color: "#04140b", border: "none", boxShadow: `0 0 28px ${G}66` }}>{t("No")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="lg-a" style={{ textAlign: "center", animation: "lgUp 0.8s ease 0.7s both" }}>
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
    </div>
  );
}
