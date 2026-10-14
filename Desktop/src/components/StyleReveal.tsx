import { useEffect, useLayoutEffect, useRef } from "react";
import { LANTERN_GREEN } from "../lantern";

// ─── STYLE REVEAL ────────────────────────────────────────────────────────────
// Putting on one of the two styles with a name opens its page out of the
// place that was tapped. Lantern comes in as light: a green flood behind a
// shockwave, with sparks thrown out. Aviela blooms: a pink lily, her
// favourite flower, opens where the finger was, the screen fills with her
// pink, and lily petals fly out across it.
//
// In three steps. The colour spreads from the tap until it covers the page
// (`onCovered`: the style is put on and its page opened, out of sight), it
// holds a moment, and then it lifts off the new page (`onDone`).
//
// Smoothness first. The first version grew the colour with clip-path and
// opened petals inside one SVG, and both are redrawn on every frame, which a
// phone shows as stutter. Here every moving thing is its own element, drawn
// once at its full size, and only its transform and opacity change: the GPU
// moves finished pictures about and nothing is drawn again. No shadows on
// anything that moves, and no more pieces than the effect needs.
//
// The colour that covers the page is the one big thing. It used to be a
// circle drawn at its full size, over two thousand pixels across, which a
// phone has to draw again and again as it grows, and it shows: blank patches
// and stutter. Now it is painted once into a small picture (`Glow`, a canvas)
// and that picture is made bigger. A gradient looks the same enlarged, and the
// GPU enlarges a finished picture for nothing.
//
// Two more things a phone needs to keep it smooth. Every keyframe holds plain
// numbers: one that reads a CSS variable cannot be handed to the GPU and runs
// on the main thread, which is busy just then. And the whole run, the lift
// at the end included, is set going at the start, so nothing waits on a timer
// or on React while the new page is being built underneath.

type Kind = "aviela" | "lantern";
type Point = { x: number; y: number };

const G = LANTERN_GREEN;
const PINK = "#f7bbd1", ROSE = "#ee8fb4", BLUSH = "#ffeaf4", WHITE = "#ffffff";

/** How long the colour takes to cover the page, the pause, and the lift. */
const COVER: Record<Kind, number> = { aviela: 1400, lantern: 1300 };
const HOLD = 200;
const LIFT = 900;

// ─── A pink lily ─────────────────────────────────────────────────────────────
// Six long pointed petals, white at the edge and deep pink down the middle,
// speckled near the heart, with stamens standing out of it. A petal is drawn
// pointing up from its base at the bottom middle of a 60 by 150 box.
const LILY_PETAL = "M30 150C9 122 2 76 13 40C18 22 25 9 30 0C35 9 42 22 47 40C58 76 51 122 30 150Z";
const SPECKS: [number, number, number][] = [[27, 118, 1.6], [33, 108, 1.4], [25, 98, 1.3], [35, 94, 1.5], [29, 86, 1.2], [31, 124, 1.3], [24, 110, 1.1], [36, 116, 1.2]];

function LilyPetal({ id, width, height }: { id: string; width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 60 150" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d94a8a" /><stop offset="0.35" stopColor="#ef7fb3" /><stop offset="0.75" stopColor="#f9c6dc" /><stop offset="1" stopColor="#fff2f8" />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" /><stop offset="0.28" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.72" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path d={LILY_PETAL} fill={`url(#${id}f)`} />
      <path d={LILY_PETAL} fill={`url(#${id}e)`} />
      <path d="M30 146C29 110 29 60 30 12" fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
      {SPECKS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#a8235f" opacity="0.75" />)}
    </svg>
  );
}

function Stamens() {
  const arms = [-38, -14, 10, 34, 160, 200];
  return (
    <svg width="120" height="120" viewBox="-60 -60 120 120" style={{ display: "block", overflow: "visible" }}>
      {arms.map((a, i) => {
        const rad = (a * Math.PI) / 180, len = 44 + (i % 3) * 6;
        const x = Math.sin(rad) * len, y = -Math.cos(rad) * len;
        return (
          <g key={i}>
            <path d={`M0 0Q${(x * 0.4).toFixed(1)} ${(y * 0.7).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke="#f6e7c8" strokeWidth="1.8" strokeLinecap="round" />
            <ellipse cx={x.toFixed(1)} cy={y.toFixed(1)} rx="5.5" ry="2.6" transform={`rotate(${a + 90} ${x.toFixed(1)} ${y.toFixed(1)})`} fill="#a4521f" />
          </g>
        );
      })}
      <circle r="6" fill="#d8f0a8" />
    </svg>
  );
}

// The petals and sparks thrown out: angle, how far as a share of the screen,
// size, delay, turn. Fixed, so it is the same every time.
const FLYING: [number, number, number, number, number][] = Array.from({ length: 16 }, (_, i) => {
  const a = i * (360 / 16) + ((i * 37) % 17) - 8;
  return [a, 0.42 + ((i * 53) % 43) / 100, 16 + ((i * 29) % 10), ((i * 71) % 9) * 40, 160 + ((i * 97) % 360)];
});

// The colours, from the middle (0) to the edge (1).
type Stops = [number, string][];
const LANTERN_FLOOD: Stops = [[0, "#e2fff0"], [0.085, G], [0.45, "#0f5532"], [0.97, "#04170c"], [1, "#030f08"]];
const AVIELA_FLOOD: Stops = [[0, WHITE], [0.17, "#fff1f7"], [0.57, "#ffd5e6"], [0.92, PINK], [1, ROSE]];
// A bright ring at the edge with nothing inside it: the wave running ahead.
const ringOf = (c: string): Stops => [[0, `${c}00`], [0.84, `${c}00`], [0.95, `${c}88`], [0.975, c], [1, `${c}00`]];
const LANTERN_RING = ringOf(G);
const AVIELA_RING = ringOf(WHITE);

/** A round gradient, painted once into a small canvas. Made bigger with a
 *  transform, the GPU only stretches the finished picture. */
function Glow({ stops, px, style }: { stops: Stops; px: number; style: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    const r = px / 2;
    const fill = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, colour] of stops) fill.addColorStop(at, colour);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(r, r, r - 1, 0, Math.PI * 2);
    g.fill();
  }, [stops, px]);
  return <canvas ref={ref} width={px} height={px} style={{ display: "block", ...style }} />;
}

/** Half the width the floods and waves are laid out at, before they grow. */
const B = 64;

function prefersStill(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function StyleReveal({ kind, at, onCovered, onDone }: { kind: Kind; at: Point; onCovered: () => void; onDone: () => void }) {
  const calls = useRef({ onCovered, onDone });
  useEffect(() => { calls.current = { onCovered, onDone }; }, [onCovered, onDone]);

  const still = prefersStill();
  const cover = still ? 0 : COVER[kind];
  useEffect(() => {
    const a = setTimeout(() => calls.current.onCovered(), cover);
    const c = setTimeout(() => calls.current.onDone(), cover + HOLD + (still ? 300 : LIFT) + 60);
    return () => { clearTimeout(a); clearTimeout(c); };
  }, [cover, still]);

  const w = window.innerWidth, h = window.innerHeight;
  const { x, y } = at;
  // Far enough to reach the furthest corner from the tap.
  const R = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y))) + 30;
  const reach = Math.max(w, h);
  const wave = R * 0.95;
  const lift = `svLift ${still ? 300 : LIFT}ms ease ${cover + HOLD}ms forwards`;

  // The moving pieces, each with keyframes of its own in plain numbers.
  const PETAL_TURNS = [0, 60, 120, 180, 240, 300].map((a, i) => a + (i % 2 ? 4 : -3));
  const flights = FLYING.map(([a, far, , , turn]) => {
    const rad = (a * Math.PI) / 180;
    const d = far * reach * 0.62;
    return { dx: Math.round(Math.sin(rad) * d), dy: Math.round(-Math.cos(rad) * d + d * 0.25), turn };
  });
  const pieces = (kind === "lantern"
    ? FLYING.map(([a, far], i) =>
        `@keyframes svSpark${i} { 0% { opacity: 0; transform: rotate(${Math.round(a)}deg) translateY(0px); } 12% { opacity: 1; }`
        + ` 100% { opacity: 0; transform: rotate(${Math.round(a)}deg) translateY(${-Math.round(far * reach * 0.7)}px); } }`)
    : [
        ...PETAL_TURNS.map((a, i) => `@keyframes svOpen${i} { from { transform: rotate(${a}deg) scale(0.2, 0.05); } to { transform: rotate(${a}deg) scale(1, 1); } }`),
        ...flights.map(({ dx, dy, turn }, i) =>
          `@keyframes svFly${i} { 0% { opacity: 0; transform: translate(0px, 0px) rotate(0deg) scale(0.4); } 12% { opacity: 1; } 70% { opacity: 1; }`
          + ` 100% { opacity: 0; transform: translate(${dx}px, ${dy}px) rotate(${turn}deg) scale(1); } }`),
      ]).join("\n");

  const css = `
    @keyframes svGrow  { from { transform: scale(${(0.02 * R / B).toFixed(3)}); } to { transform: scale(${(R / B).toFixed(3)}); } }
    @keyframes svWave  { from { opacity: 1; transform: scale(${(0.06 * wave / B).toFixed(3)}); } to { opacity: 0; transform: scale(${(wave / B).toFixed(3)}); } }
    @keyframes svFlash { 0% { opacity: 0; transform: scale(0.2); } 25% { opacity: 1; } 100% { opacity: 0; transform: scale(2.4); } }
    @keyframes svLily  { 0% { opacity: 0; transform: scale(0.4) rotate(-24deg); } 15% { opacity: 1; } 100% { opacity: 1; transform: scale(1.15) rotate(8deg); } }
    @keyframes svLilyOut { from { opacity: 1; transform: scale(1.15) rotate(8deg); } to { opacity: 0; transform: scale(1.9) rotate(22deg); } }
    @keyframes svPop   { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
    @keyframes svTwinkle { 0%, 100% { opacity: 0; transform: scale(0); } 50% { opacity: 1; transform: scale(1); } }
    @keyframes svLift  { from { opacity: 1; } to { opacity: 0; } }
    ${pieces}
  `;

  // A full-size circle round the tap, drawn once and grown with a transform.
  const disc = (size: number): React.CSSProperties => ({
    position: "absolute", left: x - size, top: y - size, width: size * 2, height: size * 2, borderRadius: "50%", willChange: "transform, opacity",
  });
  // The flood and the waves: laid out small round the tap and grown.
  const small: React.CSSProperties = { position: "absolute", left: x - B, top: y - B, width: B * 2, height: B * 2, willChange: "transform, opacity" };
  const flood = (stops: Stops) => (
    <Glow stops={stops} px={256} style={{
      ...small, transform: `scale(${(R / B).toFixed(3)})`,
      animation: still ? "none" : `svGrow ${cover}ms cubic-bezier(0.62, 0, 0.22, 1) both`,
    }} />
  );

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: 490, overflow: "hidden", pointerEvents: "auto", willChange: "opacity",
      animation: lift,
    }}>
      <style>{css}</style>

      {kind === "lantern" ? (
        <>
          {flood(LANTERN_FLOOD)}
          {!still && <>
            {[0, 300].map(delay => (
              <Glow key={delay} stops={LANTERN_RING} px={384} style={{ ...small, opacity: 0, animation: `svWave 1500ms cubic-bezier(0.2, 0.7, 0.3, 1) ${delay}ms both` }} />
            ))}
            <div style={{ ...disc(90), background: `radial-gradient(circle, #ffffff 0%, ${G}aa 35%, transparent 70%)`, opacity: 0, animation: "svFlash 900ms ease-out both" }} />
            {FLYING.map(([, , size, delay], i) => (
              <div key={i} style={{
                position: "absolute", left: x - 1.5, top: y - size, width: 3, height: size * 2, borderRadius: 2, willChange: "transform, opacity",
                background: `linear-gradient(${G}00, ${G}, #e2fff0)`, transformOrigin: `1.5px ${size}px`, opacity: 0,
                animation: `svSpark${i} ${1100 + (i % 5) * 120}ms cubic-bezier(0.15, 0.8, 0.3, 1) ${80 + delay / 3}ms both`,
              }} />
            ))}
          </>}
        </>
      ) : (
        <>
          {flood(AVIELA_FLOOD)}
          {!still && <>
            {/* Light running out ahead of the pink. */}
            <Glow stops={AVIELA_RING} px={384} style={{ ...small, opacity: 0, animation: "svWave 1600ms cubic-bezier(0.2, 0.7, 0.3, 1) 60ms both" }} />

            {/* The lily. Each petal is its own picture, turned out from the
                middle and grown from its base. */}
            <div style={{
              position: "absolute", left: x, top: y, width: 0, height: 0, willChange: "transform, opacity",
              animation: `svLily ${cover}ms cubic-bezier(0.22, 1, 0.36, 1) both, svLilyOut ${LIFT}ms ease-in ${cover + HOLD}ms forwards`,
            }}>
              {PETAL_TURNS.map((a, i) => (
                <div key={a} style={{
                  position: "absolute", left: -32, top: -158, width: 64, height: 160, transformOrigin: "32px 158px", willChange: "transform",
                  animation: `svOpen${i} 1000ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms both`,
                }}>
                  <LilyPetal id={`svp${i}`} width={64} height={160} />
                </div>
              ))}
              <div style={{ position: "absolute", left: -60, top: -60, width: 120, height: 120, willChange: "transform, opacity", animation: "svPop 700ms cubic-bezier(0.22, 1.4, 0.36, 1) 520ms both" }}>
                <Stamens />
              </div>
            </div>

            {/* Lily petals thrown out across the screen. */}
            {FLYING.map(([, , size, delay], i) => (
              <div key={i} style={{
                position: "absolute", left: x - size * 0.2, top: y - size * 0.5, width: size * 0.4, height: size, opacity: 0, willChange: "transform, opacity",
                animation: `svFly${i} ${1500 + (i % 6) * 140}ms cubic-bezier(0.12, 0.75, 0.3, 1) ${160 + delay / 2}ms both`,
              }}>
                <LilyPetal id={`svf${i}`} width={size * 0.4} height={size} />
              </div>
            ))}

            {/* Light catching here and there. */}
            {FLYING.slice(0, 10).map(([a, far], i) => {
              const rad = (a * Math.PI) / 180 + 0.4;
              const d = far * reach * 0.4;
              return (
                <div key={`s${i}`} style={{
                  position: "absolute", left: x + Math.sin(rad) * d - 5, top: y - Math.cos(rad) * d - 5, width: 10, height: 10, opacity: 0,
                  background: i % 3 ? WHITE : BLUSH, willChange: "transform, opacity",
                  clipPath: "polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%)",
                  animation: `svTwinkle 900ms ease ${450 + i * 80}ms both`,
                }} />
              );
            })}
          </>}
        </>
      )}
    </div>
  );
}
