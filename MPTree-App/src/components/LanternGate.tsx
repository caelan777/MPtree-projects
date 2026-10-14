import { useEffect, useRef, useState } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { t, tn } from "../i18n";
import { LANTERN_GREEN } from "../lantern";
import { speakLanternVoice, playLanternBuildUp, VOICE_STEP, BUILD_MS, BUILD_BEATS } from "../lanternVoice";
import { lanternFigure, FIGURE_RATIO } from "../lanternFigure";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// The first time someone with Pro puts Lantern on, the screen goes dark and
// something builds: a low drone that rises, a hiss, a heart that beats faster
// (lanternVoice.ts), and the dark pulses green on every beat. Then a hit, and
// slowly there is light: the green on a man's shoulders (lanternFigure.ts),
// the man himself left in the dark, coming up out of it. A moment of quiet, and a voice
// asks one thing: "Are you", then large, "afraid?", the light swelling with
// it. Then the answer, by sliding: left for yes, right for no. "No" is the
// way in: the Lantern page opens out of the light from where the knob let
// go. "Yes" puts the light out and shuts Lantern for a week, and says so.
//
// Caelan picked this from six designs (only the light, and a slider).
//
// Everything is set going at the start, on fixed times from it, as CSS
// animations with plain numbers: the GPU runs them, and the sound is laid out
// on its own clock the same way, so the two keep together without the page
// doing anything in between. Only the voice's light is made when the voice
// starts, from its loudness, and handed over as one animation too.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

/** When the light starts to come up: at the hit, the end of the build-up. */
const REVEAL = BUILD_MS;
/** How long it takes to come up out of the dark. */
const RISE = 2600;
/** When the voice asks, after a moment of quiet. */
const SPEAK = BUILD_MS + 900;
/** "afraid?" comes this long after "Are you", roughly as it is said. */
const AFRAID_AFTER = 650;
/** How far the knob has to go, as a share of its way to either end. */
const COMMIT = 0.6;

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

const STYLE = `
  @keyframes lgDark   { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lgAppear { 0% { opacity: 0; transform: translateY(16px) scale(1.035); } 100% { opacity: 1; transform: none; } }
  @keyframes lgRise   { 0% { opacity: 0; } 60% { opacity: 0.66; } 80% { opacity: 0.52; } 100% { opacity: 0.55; } }
  @keyframes lgBloom  { 0% { opacity: 0; } 30% { opacity: 0.26; } 100% { opacity: 0; } }
  @keyframes lgFloat  { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
  @keyframes lgBreatheL { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @keyframes lgWord   { from { opacity: 0; transform: translateY(16px) scale(1.02); } to { opacity: 1; transform: none; } }
  @keyframes lgHalo   { 0% { opacity: 0.5; transform: scale(1); } 100% { opacity: 0; transform: scale(1.45); } }
  @keyframes lgUp     { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  @keyframes lgNudge  { 0%, 60%, 100% { transform: translateX(0px); } 75% { transform: translateX(14px); } 85% { transform: translateX(-4px); } }
  ${BEAT_FRAMES}
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
  // The answer waits until the voice has finished asking.
  const [asked, setAsked] = useState(false);
  // The light's animation while the voice speaks, made from its loudness.
  const [voice, setVoice] = useState<{ css: string; ms: number } | null>(null);
  // The knob: how far it is pulled (px, minus is towards yes), and whether a
  // finger has it.
  const [pull, setPull] = useState(0);
  const [held, setHeld] = useState(false);
  const drag = useRef<{ x0: number; reach: number; side: -1 | 0 | 1 } | null>(null);
  const knob = useRef<HTMLDivElement>(null);
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
          css: `@keyframes lgVoiceL { ${frames(v => `opacity: ${(0.55 + v * 0.45).toFixed(3)};`)} }`,
        });
      }, () => setTimeout(() => setAsked(true), 250));
    }, SPEAK);
    // Whatever the sound does (a phone can keep it from starting at all), the
    // answer comes: the question is written as well as spoken.
    const anyway = setTimeout(() => setAsked(true), SPEAK + 3600);
    return () => { clearTimeout(start); clearTimeout(anyway); stop(); stopBuild(); };
  }, []);

  const out = shut !== null;
  const sayYes = () => setShut(onYes());
  const sayNo = (x: number, y: number) => onNo({ x, y });

  // Sliding: the knob follows the finger along the track; let go past COMMIT
  // of the way and that is the answer, else it springs back.
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!track || !asked) return;
    drag.current = { x0: e.clientX - pull, reach: track.width / 2 - 36, side: 0 };
    setHeld(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every pointer can be held */ }
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = Math.max(-d.reach, Math.min(d.reach, e.clientX - d.x0));
    setPull(p);
    // A tick in the hand the moment letting go would answer.
    const side = p / d.reach >= COMMIT ? 1 : p / d.reach <= -COMMIT ? -1 : 0;
    if (side !== d.side) {
      d.side = side;
      if (side) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setHeld(false);
    if (!d) return;
    const share = pull / d.reach;
    if (share >= COMMIT) {
      const r = knob.current?.getBoundingClientRect();
      setPull(d.reach);
      sayNo(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : window.innerHeight * 0.85);
    } else if (share <= -COMMIT) {
      setPull(-d.reach);
      sayYes();
    } else {
      setPull(0);
    }
  };

  // The light: it flickers on at the hit, the voice leads it while it speaks,
  // and after that it breathes on its own. Each hands over to the next at the
  // same strength, so there is no jump. Pulling towards yes dims it.
  const light = out ? "none"
    : asked ? "lgBreatheL 3.4s ease-in-out infinite"
    : voice ? `lgVoiceL ${voice.ms}ms linear forwards`
    : `lgRise ${RISE}ms cubic-bezier(0.45, 0, 0.25, 1) ${REVEAL}ms both`;
  const towardsNo = Math.max(0, pull) / 120, towardsYes = Math.max(0, -pull) / 120;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} className="lg-a" style={{
      position: "fixed", inset: 0, zIndex: 480, background: "#000", overflow: "hidden",
      animation: "lgDark 0.6s ease both",
    }}>
      <style>{STYLE + (voice?.css ?? "")}</style>

      {/* The dark, pulsing green with the heart while it builds. */}
      <div aria-hidden="true" className="lg-a" style={{
        position: "absolute", inset: 0, opacity: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 60% 38% at 50% 34%, ${G}55 0%, ${G}18 45%, transparent 75%)`,
        animation: `lgBeat ${BUILD_MS}ms linear both`,
      }} />

      {/* Only the light: the green of his shoulders, coming up slowly out of
          the dark, then hanging there and drifting a little. */}
      <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "7vh", display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div className="lg-a" style={{
          position: "relative", width: "min(149vw, 640px)", aspectRatio: String(FIGURE_RATIO), flexShrink: 0, willChange: "transform, opacity",
          animation: `lgAppear ${RISE + 400}ms cubic-bezier(0.33, 0, 0.2, 1) ${REVEAL}ms both`,
        }}>
          <div className="lg-a" style={{
            position: "absolute", inset: 0, willChange: "transform, opacity",
            animation: `lgFloat 7s ease-in-out ${REVEAL + RISE}ms infinite`,
            opacity: 1 - Math.min(0.6, towardsYes * 0.5), transition: held ? "none" : "opacity 0.5s ease",
          }}>
            <img src={figure.light} alt="" draggable={false} className="lg-a" style={{
              position: "absolute", inset: 0, width: "100%", height: "100%", willChange: "opacity",
              opacity: out ? 0 : 0.55, transition: out ? "opacity 1.8s ease" : "none",
              animation: light,
            }} />
          </div>
        </div>
      </div>

      {/* With the hit, a soft swell of green where the light will be. */}
      <div aria-hidden="true" className="lg-a" style={{
        position: "absolute", inset: 0, opacity: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 70% 45% at 50% 34%, ${G}66 0%, ${G}22 40%, transparent 72%)`,
        animation: `lgBloom 2600ms cubic-bezier(0.4, 0, 0.2, 1) ${REVEAL}ms both`,
      }} />

      {/* The question: "Are you", and large, "afraid?". */}
      {!out && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "36vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: PALE, textAlign: "center", padding: "0 20px" }}>
          <div className="lg-a" style={{ fontSize: 22, fontWeight: 500, color: "rgba(234,255,242,0.75)", animation: `lgWord 1200ms cubic-bezier(0.22, 1, 0.36, 1) ${SPEAK}ms both` }}>
            {t("Are you")}
          </div>
          <div className="lg-a" style={{
            fontSize: 72, fontWeight: 900, letterSpacing: -2.5, lineHeight: 1, textShadow: `0 0 40px ${G}99`,
            animation: `lgWord 1400ms cubic-bezier(0.22, 1, 0.36, 1) ${SPEAK + AFRAID_AFTER}ms both`,
          }}>
            {t("afraid?")}
          </div>
        </div>
      )}

      <div style={{ position: "absolute", left: 28, right: 28, bottom: "calc(env(safe-area-inset-bottom, 0px) + 9vh)" }}>
        {!out ? (
          // The slider. Yes and No are buttons too, so a tap (or a key)
          // answers as well as a slide.
          <div style={{
            position: "relative", height: 72, borderRadius: 36, boxSizing: "border-box",
            background: `linear-gradient(to right, rgba(255,255,255,${0.04 + towardsYes * 0.05}) 0%, rgba(255,255,255,0.04) 50%, rgba(53,224,138,${0.22 + towardsNo * 0.3}) 100%)`,
            border: "1px solid rgba(234,255,242,0.14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -10px 24px rgba(0,0,0,0.35)",
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px",
            opacity: asked ? 1 : 0, transform: asked ? "none" : "translateY(18px)", transition: "opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1), transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)",
            pointerEvents: asked ? "auto" : "none",
          }}>
            <button onClick={sayYes} style={{ background: "transparent", border: "none", color: PALE, opacity: 0.55 + Math.min(1, towardsYes) * 0.45, fontSize: 16, fontWeight: 700, fontFamily: "inherit", minWidth: 48, minHeight: 48, cursor: "pointer", transition: held ? "none" : "opacity 0.35s ease" }}>{t("Yes")}</button>
            <button onClick={e => sayNo(e.clientX, e.clientY)} style={{ background: "transparent", border: "none", color: G, opacity: 0.8 + Math.min(1, towardsNo) * 0.2, fontSize: 16, fontWeight: 800, fontFamily: "inherit", minWidth: 48, minHeight: 48, cursor: "pointer", textShadow: `0 0 ${14 + Math.min(1, towardsNo) * 14}px ${G}b3`, transition: held ? "none" : "opacity 0.35s ease" }}>{t("No")}</button>
            {/* A soft ring going out from the knob while it waits to be pulled. */}
            <span aria-hidden="true" className="lg-a" style={{
              position: "absolute", left: "50%", top: 5, width: 60, height: 60, marginLeft: -30, borderRadius: "50%",
              border: `1.5px solid ${G}`, opacity: 0, pointerEvents: "none",
              animation: asked && !held && pull === 0 ? "lgHalo 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.6s infinite" : "none",
            }} />
            <div
              ref={knob}
              aria-hidden="true"
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              style={{
                position: "absolute", left: "50%", top: 5, width: 60, height: 60, marginLeft: -30, borderRadius: "50%",
                background: "radial-gradient(circle at 50% 38%, #ffffff 0%, #c9ffe2 45%, #35e08a 100%)",
                boxShadow: `0 0 ${30 + towardsNo * 20}px ${G}99`,
                display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", cursor: "grab",
                transform: `translateX(${pull}px)`, transition: held ? "none" : "transform 0.35s cubic-bezier(0.3, 1.4, 0.5, 1)",
              }}
            >
              <div className="lg-a" style={{ display: "flex", animation: asked && !held && pull === 0 ? "lgNudge 3s ease-in-out 0.8s infinite" : "none" }}>
                <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="#04140b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 2 2 7 7 12" /><polyline points="19 2 24 7 19 12" /></svg>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
            <div className="lg-a" style={{ textAlign: "center", animation: "lgUp 0.8s ease 0.7s both" }}>
              <div style={{ fontSize: 25, fontWeight: 800, color: PALE }}>
                {tn(shut, "Lantern is locked for {n} day.", "Lantern is locked for {n} days.")}
              </div>
              <div style={{ fontSize: 15, color: "#8fb3a1", marginTop: 8 }}>{t("Come back when you are not afraid.")}</div>
            </div>
            <div className="lg-a" style={{ animation: "lgUp 0.6s ease 1.3s both" }}>
              <button onClick={onDone} style={{ width: 138, height: 54, borderRadius: 27, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", background: "transparent", color: PALE, border: "1.5px solid #3c5248" }}>{t("OK")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
