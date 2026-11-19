import { useEffect, useRef, useState, type ReactNode } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import type { PlayerStyle } from "../look";
import { SpinningDisc } from "./SpinningDisc";

// ─── WHAT THE PLAYER SHOWS ───────────────────────────────────────────────────
// The big picture in the player's card, in the style picked on the Player page
// of Personalise: the record (as it always was), the cover large, the record on
// a turntable whose arm moves, or only the words. Each takes the same square,
// so the timeline and the buttons under it never move when the style changes.

type DiscProps = {
  spinning: boolean; title: string; customPhoto?: string;
  onNoCover?: () => void; onPhoto?: () => void;
};
type Ring = { currentTime: number; duration: number; onSeek: (ms: number) => void; onSeekStart: () => void; onSeekEnd: (ms: number) => void };

type Props = DiscProps & {
  style: PlayerStyle;
  size: number;
  artist: string;
  /** 0 to 1: how far into the song. The turntable's arm follows it. */
  progress: number;
  /** The timeline drawn round the record instead of under it. */
  ring?: Ring;
  dark: boolean;
  /** Only the words take the title's place under the picture as well, so they
   *  are this much taller and the buttons stay where they were. */
  wordsExtra?: number;
  T: T;
};

export function PlayerArt({ style, size, artist, progress, ring, dark, wordsExtra = 0, T, ...disc }: Props) {
  if (style === "text") return <Words size={size} height={size + wordsExtra} title={disc.title} artist={artist} T={T} />;
  if (style === "cover" && disc.customPhoto) return <Cover size={size} photo={disc.customPhoto} title={disc.title} onPhoto={disc.onPhoto} />;
  if (style === "turntable") {
    return <Turntable size={size} playing={disc.spinning} progress={progress} dark={dark}
      disc={(d, spinning) => <SpinningDisc size={d} {...disc} spinning={spinning} tappable />} />;
  }
  // The record. With the ring, the record is a little smaller inside the same
  // square, and the ring goes round it.
  if (ring) {
    const inner = size - 30;
    return (
      <div style={{ position: "relative", width: size, height: size, display: "grid", placeItems: "center" }}>
        <SpinningDisc size={inner} {...disc} tappable />
        <RingTime size={size} ring={ring} T={T} />
      </div>
    );
  }
  return <SpinningDisc size={size} {...disc} tappable />;
}

// ─── the cover, large ────────────────────────────────────────────────────────
function Cover({ size, photo, title, onPhoto }: { size: number; photo: string; title: string; onPhoto?: () => void }) {
  // Holding it opens the song's photo, as holding the record does.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef({ x: 0, y: 0 });
  const stop = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => stop, []);
  return (
    <div
      onPointerDown={e => { stop(); from.current = { x: e.clientX, y: e.clientY }; if (onPhoto) timer.current = setTimeout(() => { navigator.vibrate?.(15); onPhoto(); }, 500); }}
      onPointerMove={e => { if (Math.abs(e.clientX - from.current.x) > 10 || Math.abs(e.clientY - from.current.y) > 10) stop(); }}
      onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
      style={{ width: size, height: size, borderRadius: 16, overflow: "hidden", flexShrink: 0, boxShadow: "0 8px 26px rgba(0,0,0,0.35)", WebkitTapHighlightColor: "transparent" }}>
      <img src={photo} alt={title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }} />
    </div>
  );
}

// ─── only the words ──────────────────────────────────────────────────────────
function Words({ size, height, title, artist, T }: { size: number; height: number; title: string; artist: string; T: T }) {
  const big = Math.round(Math.max(30, Math.min(48, size * 0.16)));
  return (
    <div style={{ width: size, height, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left", boxSizing: "border-box", padding: "0 4px" }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted }}>{t("Now playing")}</span>
      <div style={{
        fontSize: big, fontWeight: 900, lineHeight: 1.04, color: T.text, marginTop: 12, letterSpacing: "-0.01em",
        display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word",
      }}>{title}</div>
      <div style={{ fontSize: 17, color: T.textSub, marginTop: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{artist}</div>
    </div>
  );
}

// ─── the timeline as a ring round the record ─────────────────────────────────
function RingTime({ size, ring, T }: { size: number; ring: Ring; T: T }) {
  const r = size / 2 - 6, c = size / 2, C = 2 * Math.PI * r;
  const p = ring.duration > 0 ? Math.min(1, Math.max(0, ring.currentTime / ring.duration)) : 0;
  const a = -Math.PI / 2 + 2 * Math.PI * p;
  const box = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const at = (x: number, y: number): number => {
    const b = box.current!.getBoundingClientRect();
    let ang = Math.atan2(y - (b.top + b.height / 2), x - (b.left + b.width / 2)) + Math.PI / 2;
    if (ang < 0) ang += 2 * Math.PI;
    return Math.round((ang / (2 * Math.PI)) * (ring.duration || 0));
  };
  return (
    <svg ref={box} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}
      role="slider" aria-label={t("Position in the song")} aria-valuemin={0} aria-valuemax={ring.duration} aria-valuenow={ring.currentTime}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.sliderBg} strokeWidth={4} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.text} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${(C * p).toFixed(1)} ${C.toFixed(1)}`} transform={`rotate(-90 ${c} ${c})`} />
      <circle cx={c + r * Math.cos(a)} cy={c + r * Math.sin(a)} r={8} fill={T.text} />
      {/* What is touched: a wide band over the ring only, so the record inside keeps its own tap and swipe. */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="transparent" strokeWidth={30} style={{ pointerEvents: "stroke", cursor: "pointer", touchAction: "none" }}
        onPointerDown={e => { try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* not a pointer the page knows */ } dragging.current = true; ring.onSeekStart(); ring.onSeek(at(e.clientX, e.clientY)); e.stopPropagation(); }}
        onPointerMove={e => { if (dragging.current) ring.onSeek(at(e.clientX, e.clientY)); }}
        onPointerUp={e => { if (!dragging.current) return; dragging.current = false; ring.onSeekEnd(at(e.clientX, e.clientY)); }}
        onPointerCancel={() => { dragging.current = false; }} />
    </svg>
  );
}

// ─── the turntable ───────────────────────────────────────────────────────────
// Seen from above, drawn in a 300 x 300 box and scaled. The arm turns round its
// pivot at the top right: REST is on its rest beside the platter, START puts
// the needle on the outer groove and END near the label. Playing, the arm
// follows the song inward the way it does on a real record.
//
// Play: the arm lifts (its shadow grows), swings in and comes down, while the
// record comes up to speed. Pause: it lifts, goes back to its rest, and the
// record runs down. A new song: up, back to the edge, down. The sound never
// waits for any of this.
const REST = -4, START = 9, END = 30;
const LIFT_MS = 220, SWING_MS = 560, DROP_MS = 200;

function Turntable({ size, playing, progress, dark, disc }: {
  size: number; playing: boolean; progress: number; dark: boolean;
  disc: (diameter: number, spinning: boolean) => ReactNode;
}) {
  const k = size / 300;
  const angleFor = (p: number) => START + (END - START) * Math.min(1, Math.max(0, p));
  const [deg, setDeg] = useState(playing ? angleFor(progress) : REST);
  const [lifted, setLifted] = useState(false);
  const [moving, setMoving] = useState(false);
  const [coasting, setCoasting] = useState(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const first = useRef(true);
  const wrap = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  // The record's own turning (SpinningDisc's CSS animation), sped up and run
  // down by its playback rate.
  const ramp = (from: number, to: number, ms: number, done?: () => void) => {
    cancelAnimationFrame(raf.current);
    const anim = wrap.current?.querySelector(".mp-vinyl")?.getAnimations?.()[0];
    if (!anim) { done?.(); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const x = Math.min(1, (now - t0) / ms);
      const e = to > from ? x * x : 1 - (1 - x) * (1 - x);
      anim.playbackRate = Math.max(0.01, from + (to - from) * e);
      if (x < 1) raf.current = requestAnimationFrame(step);
      else done?.();
    };
    raf.current = requestAnimationFrame(step);
  };

  const cue = (toDeg: () => number) => {
    clear();
    setMoving(true);
    setLifted(true);
    later(LIFT_MS, () => setDeg(toDeg()));
    later(LIFT_MS + SWING_MS, () => setLifted(false));
    later(LIFT_MS + SWING_MS + DROP_MS, () => setMoving(false));
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (playing) {
      setCoasting(false);
      cue(() => angleFor(progressRef.current));
      // The next frame: by then the disc is turning again and has its animation.
      requestAnimationFrame(() => ramp(0.05, 1, 900));
    } else {
      cue(() => REST);
      setCoasting(true);
      ramp(1, 0.02, 1300, () => {
        setCoasting(false);
        const anim = wrap.current?.querySelector(".mp-vinyl")?.getAnimations?.()[0];
        if (anim) anim.playbackRate = 1;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Following the song, and back to the edge when a new one starts.
  const last = useRef(progress);
  useEffect(() => {
    const before = last.current;
    last.current = progress;
    if (!playing || moving) return;
    if (progress < before - 0.15) { cue(() => angleFor(progressRef.current)); return; }
    setDeg(angleFor(progress));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);
  useEffect(() => () => { clear(); cancelAnimationFrame(raf.current); }, []);

  const plinth = dark ? "#0b0b0b" : "#f2f2f2";
  const edge = dark ? "#262626" : "#d6d6d6";
  const arm = dark ? "#dedede" : "#8c8c8c";
  const head = dark ? "#c4c4c4" : "#7a7a7a";
  const shadow = lifted ? "drop-shadow(12px 18px 7px rgba(0,0,0,0.75))" : "drop-shadow(2px 3px 1.5px rgba(0,0,0,0.6))";
  const transition = moving
    ? `transform ${SWING_MS}ms cubic-bezier(.45,0,.25,1), filter ${LIFT_MS}ms ease`
    : "transform 1s linear, filter 200ms ease";
  const D = 228;

  return (
    <div ref={wrap} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 300 300" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
        <rect x="1" y="1" width="298" height="298" rx="18" fill={plinth} stroke={edge} strokeWidth="1.5" />
        <circle cx="128" cy="150" r="125" fill="#151515" stroke={dark ? "#2a2a2a" : "#bdbdbd"} strokeWidth="1.5" />
        <circle cx="128" cy="150" r="119" fill="#0d0d0d" />
        <rect x="267" y="145" width="20" height="11" rx="4" fill={dark ? "#1e1e1e" : "#e2e2e2"} stroke={dark ? "#3a3a3a" : "#c2c2c2"} strokeWidth="1.2" />
        <circle cx="266" cy="46" r="22" fill={dark ? "#1a1a1a" : "#e6e6e6"} stroke={dark ? "#333333" : "#c8c8c8"} strokeWidth="1.5" />
      </svg>
      <div style={{ position: "absolute", left: (128 - D / 2) * k, top: (150 - D / 2) * k }}>
        {disc(D * k, playing || coasting)}
      </div>
      <svg width={size} height={size} viewBox="0 0 300 300" aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
        <g style={{ transformBox: "view-box", transformOrigin: "266px 46px", transform: `rotate(${deg}deg) scale(${lifted ? 1.06 : 1})`, filter: shadow, transition }}>
          <rect x="256" y="12" width="20" height="17" rx="4" fill={dark ? "#8f8f8f" : "#6f6f6f"} />
          <path d="M266 28 L270 152 L253 196" fill="none" stroke={arm} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="247" y="183" width="14" height="24" rx="3" fill={head} transform="rotate(21.4 254 195)" />
          <circle cx="251" cy="202" r="2.2" fill={dark ? "#ffffff" : "#333333"} />
        </g>
        <circle cx="266" cy="46" r="9" fill="#8a8a8a" />
        <circle cx="266" cy="46" r="3.5" fill="#d0d0d0" />
      </svg>
    </div>
  );
}
