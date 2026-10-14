import { useEffect, useRef, useState } from "react";
import { LANTERN_GREEN } from "../lantern";

// ─── STYLE REVEAL ────────────────────────────────────────────────────────────
// Putting on one of the two styles with a name opens its page out of the
// place that was tapped. Lantern comes in as light: a green flood behind a
// shockwave, with sparks thrown out. Aviela blooms: a flower opens where the
// finger was, the screen fills with her pink, and petals fly out across it.
//
// In three steps. The colour spreads from the tap until it covers the page
// (`onCovered`: the style is put on and its page opened, out of sight), it
// holds a moment, and then it lifts off the new page (`onDone`).
//
// Everything here is drawn: CSS gradients, and petals as small SVG paths.

type Kind = "aviela" | "lantern";
type Point = { x: number; y: number };

const G = LANTERN_GREEN;
const PINK = "#f7bbd1", ROSE = "#ee8fb4", PETAL = "#ffd5e6", WHITE = "#ffffff", GOLD = "#f3c14b";

/** How long the colour takes to cover the page, the pause, and the lift. */
const COVER: Record<Kind, number> = { aviela: 1350, lantern: 1300 };
const HOLD = 220;
const LIFT = 900;

const petalPath = (len: number, wide: number) => {
  const w = Math.round(len * wide * 10) / 10;
  return `M0 0C${w} ${-len * 0.3} ${w} ${-len * 0.9} 0 ${-len}C${-w} ${-len * 0.9} ${-w} ${-len * 0.3} 0 0Z`;
};

// The petals thrown out, and Lantern's sparks: angle, how far as a share of
// the screen, size, delay, turn. Fixed, so it is the same every time.
const FLYING: [number, number, number, number, number][] = Array.from({ length: 28 }, (_, i) => {
  const a = i * (360 / 28) + ((i * 37) % 17) - 8;
  return [a, 0.38 + ((i * 53) % 47) / 100, 10 + ((i * 29) % 12), ((i * 71) % 9) * 45, 160 + ((i * 97) % 380)];
});

function prefersStill(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function StyleReveal({ kind, at, onCovered, onDone }: { kind: Kind; at: Point; onCovered: () => void; onDone: () => void }) {
  const [lifting, setLifting] = useState(false);
  const calls = useRef({ onCovered, onDone });
  useEffect(() => { calls.current = { onCovered, onDone }; }, [onCovered, onDone]);

  const still = prefersStill();
  const cover = still ? 0 : COVER[kind];
  useEffect(() => {
    const a = setTimeout(() => calls.current.onCovered(), cover);
    const b = setTimeout(() => setLifting(true), cover + HOLD);
    const c = setTimeout(() => calls.current.onDone(), cover + HOLD + (still ? 300 : LIFT));
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [cover, still]);

  const w = window.innerWidth, h = window.innerHeight;
  const { x, y } = at;
  // Far enough to reach the furthest corner from the tap.
  const R = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y))) + 40;
  const reach = Math.max(w, h);

  const keyframes = `
    @keyframes svFlood { from { clip-path: circle(0px at ${x}px ${y}px); } to { clip-path: circle(${R}px at ${x}px ${y}px); } }
    @keyframes svWave  { from { opacity: 0.95; transform: scale(0.1); } to { opacity: 0; transform: scale(${(R / 60).toFixed(2)}); } }
    @keyframes svFlash { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(2.6); } }
    @keyframes svSpark { 0% { opacity: 0; transform: rotate(var(--a)) translateY(0) scaleY(0.4); } 12% { opacity: 1; }
                         100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(-1 * var(--d))) scaleY(1); } }
    @keyframes svPetal { from { transform: rotate(-70deg) scale(0); } to { transform: rotate(0deg) scale(1); } }
    @keyframes svBloom { 0% { transform: scale(0.35) rotate(-30deg); opacity: 0; } 18% { opacity: 1; } 100% { transform: scale(1.35) rotate(18deg); opacity: 1; } }
    @keyframes svBloomOut { from { transform: scale(1.35) rotate(18deg); opacity: 1; } to { transform: scale(2.4) rotate(40deg); opacity: 0; } }
    @keyframes svFly   { 0% { opacity: 0; transform: translate(0, 0) rotate(0deg) scale(0.3); } 12% { opacity: 1; }
                         75% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scale(1); } }
    @keyframes svTwinkle { 0%, 100% { opacity: 0; transform: scale(0); } 50% { opacity: 1; transform: scale(1); } }
    @keyframes svLift  { from { opacity: 1; } to { opacity: 0; } }
  `;

  const flood: React.CSSProperties = {
    position: "absolute", inset: 0,
    animation: still ? "none" : `svFlood ${cover}ms cubic-bezier(0.65, 0, 0.25, 1) both`,
  };
  const around = (size: number): React.CSSProperties => ({ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size });

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 490, overflow: "hidden", pointerEvents: "auto",
      animation: lifting ? `svLift ${still ? 300 : LIFT}ms ease forwards` : "none",
    }}>
      <style>{keyframes}</style>

      {kind === "lantern" ? (
        <>
          <div style={{ ...flood, background: `radial-gradient(circle at ${x}px ${y}px, #e2fff0 0px, ${G} 70px, #0f5532 ${Math.round(R * 0.32)}px, #04170c ${Math.round(R * 0.7)}px, #010503 ${R}px)` }} />
          {!still && <>
            {[0, 320].map(delay => (
              <div key={delay} style={{ ...around(120), borderRadius: "50%", border: `3px solid ${G}`, boxShadow: `0 0 26px ${G}, inset 0 0 18px ${G}`, opacity: 0, animation: `svWave 1500ms cubic-bezier(0.2, 0.7, 0.3, 1) ${delay}ms both` }} />
            ))}
            <div style={{ ...around(160), borderRadius: "50%", background: `radial-gradient(circle, #ffffff 0%, ${G}aa 35%, transparent 70%)`, opacity: 0, animation: "svFlash 900ms ease-out both" }} />
            {FLYING.map(([a, far, size, delay], i) => (
              <div key={i} style={{
                position: "absolute", left: x - 1.5, top: y - size, width: 3, height: size * 2, borderRadius: 2,
                background: `linear-gradient(${G}, #e2fff0)`, boxShadow: `0 0 10px ${G}`, transformOrigin: `1.5px ${size}px`, opacity: 0,
                ["--a" as string]: `${a}deg`, ["--d" as string]: `${Math.round(far * reach * 0.7)}px`,
                animation: `svSpark ${1100 + (i % 5) * 120}ms cubic-bezier(0.15, 0.8, 0.3, 1) ${80 + delay / 3}ms both`,
              }} />
            ))}
          </>}
        </>
      ) : (
        <>
          <div style={{ ...flood, background: `radial-gradient(circle at ${x}px ${y}px, ${WHITE} 0px, #fff1f7 ${Math.round(R * 0.12)}px, ${PETAL} ${Math.round(R * 0.4)}px, ${PINK} ${Math.round(R * 0.72)}px, ${ROSE} ${R}px)` }} />
          {!still && <>
            {/* A soft ring of light running out ahead of the pink. */}
            <div style={{ ...around(120), borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", boxShadow: "0 0 30px rgba(255,255,255,0.8)", opacity: 0, animation: "svWave 1600ms cubic-bezier(0.2, 0.7, 0.3, 1) 60ms both" }} />

            {/* The flower that opens where the finger was. */}
            <svg width="300" height="300" viewBox="0 0 300 300" style={{
              ...around(300), overflow: "visible",
              animation: lifting ? `svBloomOut ${LIFT}ms ease-in forwards` : `svBloom ${cover}ms cubic-bezier(0.22, 1, 0.36, 1) both`,
            }}>
              <g transform="translate(150 150)">
                {/* Each petal unfolds from the middle: turned into place by
                    its group, grown out of the centre by its own animation. */}
                {Array.from({ length: 8 }, (_, i) => (
                  <g key={`o${i}`} transform={`rotate(${i * 45})`}>
                    <path d={petalPath(132, 0.38)} fill={i % 2 ? ROSE : PINK} stroke="rgba(32,24,27,0.08)" strokeWidth="0.8"
                      style={{ transformOrigin: "0px 0px", animation: `svPetal 900ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 45}ms both` }} />
                  </g>
                ))}
                {Array.from({ length: 8 }, (_, i) => (
                  <g key={`i${i}`} transform={`rotate(${22.5 + i * 45})`}>
                    <path d={petalPath(86, 0.42)} fill={i % 2 ? WHITE : PETAL} stroke="rgba(32,24,27,0.08)" strokeWidth="0.8"
                      style={{ transformOrigin: "0px 0px", animation: `svPetal 800ms cubic-bezier(0.22, 1, 0.36, 1) ${240 + i * 40}ms both` }} />
                  </g>
                ))}
                <circle r="17" fill={GOLD} style={{ transformOrigin: "0px 0px", animation: "svPetal 700ms cubic-bezier(0.22, 1, 0.36, 1) 520ms both" }} />
              </g>
            </svg>

            {/* Petals thrown out across the screen. */}
            {FLYING.map(([a, far, size, delay, turn], i) => {
              const rad = (a * Math.PI) / 180;
              const d = far * reach * 0.62;
              return (
                <svg key={i} width={size * 1.4} height={size} viewBox="-12 -16 24 18" style={{
                  position: "absolute", left: x - size * 0.7, top: y - size / 2, overflow: "visible", opacity: 0,
                  ["--dx" as string]: `${Math.round(Math.sin(rad) * d)}px`, ["--dy" as string]: `${Math.round(-Math.cos(rad) * d + d * 0.25)}px`,
                  ["--r" as string]: `${turn}deg`,
                  animation: `svFly ${1500 + (i % 6) * 140}ms cubic-bezier(0.12, 0.75, 0.3, 1) ${120 + delay / 2}ms both`,
                }}>
                  <path d={petalPath(15, 0.55)} transform="rotate(90)" fill={[ROSE, WHITE, PINK, PETAL][i % 4]} stroke="rgba(32,24,27,0.1)" strokeWidth="0.5" />
                </svg>
              );
            })}

            {/* Light catching here and there. */}
            {FLYING.slice(0, 12).map(([a, far], i) => {
              const rad = (a * Math.PI) / 180 + 0.4;
              const d = far * reach * 0.42;
              return (
                <div key={`s${i}`} style={{
                  position: "absolute", left: x + Math.sin(rad) * d - 5, top: y - Math.cos(rad) * d - 5, width: 10, height: 10, opacity: 0,
                  background: WHITE, clipPath: "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
                  animation: `svTwinkle 900ms ease ${400 + i * 70}ms both`,
                }} />
              );
            })}
          </>}
        </>
      )}
    </div>
  );
}
