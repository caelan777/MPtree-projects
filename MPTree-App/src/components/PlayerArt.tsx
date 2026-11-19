import { useEffect, useRef, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import type { PlayerStyle } from "../look";
import { SpinningDisc } from "./SpinningDisc";
import { Logo } from "./Logo";

// ─── WHAT THE PLAYER SHOWS ───────────────────────────────────────────────────
// The big picture in the player's card, in the style picked on the Player page
// of Personalise: the record (as it always was), the cover large, or only the
// words. Each takes the same square, so the timeline and the buttons under it
// never move when the style changes. With the cover large, a song without a
// cover shows the MPTree mark instead of falling back to the record.

type DiscProps = {
  spinning: boolean; title: string; customPhoto?: string;
  onNoCover?: () => void; onPhoto?: () => void;
};
type Ring = { currentTime: number; duration: number; onSeek: (ms: number) => void; onSeekStart: () => void; onSeekEnd: (ms: number) => void };

type Props = DiscProps & {
  style: PlayerStyle;
  size: number;
  artist: string;
  /** 0 to 1: how far into the song. */
  progress: number;
  /** The timeline drawn round the record instead of under it. */
  ring?: Ring;
  dark: boolean;
  /** Only the words take the title's place under the picture as well, so they
   *  are this much taller and the buttons stay where they were. */
  wordsExtra?: number;
  T: T;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PlayerArt({ style, size, artist, ring, wordsExtra = 0, T, progress: _progress, dark: _dark, ...disc }: Props) {
  if (style === "text") return <Words size={size} height={size + wordsExtra} title={disc.title} artist={artist} T={T} />;
  if (style === "cover") return <Cover size={size} photo={disc.customPhoto} title={disc.title} onPhoto={disc.onPhoto} T={T} />;
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
function Cover({ size, photo, title, onPhoto, T }: { size: number; photo?: string; title: string; onPhoto?: () => void; T: T }) {
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
      {photo ? (
        <img src={photo} alt={title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }} />
      ) : (
        // No cover: the mark, on the tile a song without a cover has in the
        // list (white in Black), so the two read as the same thing.
        <div role="img" aria-label={title} style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", background: T.coverBg ?? T.dim }}>
          <Logo size={Math.round(size * 0.42)} color={T.coverBg ? "#111111" : T.text} />
        </div>
      )}
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
// Turned like a dial. A drag moves from where the time is by how far the finger
// goes round, so passing the top no longer jumps to the start or the end (it
// did in test build 127, and the ring was hard to set because of it). A tap
// still goes straight to that point. While it is held the knob grows and says
// the time. The band that is touched is wide, and it keeps the swipe that
// closes the player away.
function RingTime({ size, ring, T }: { size: number; ring: Ring; T: T }) {
  const r = size / 2 - 6, c = size / 2, C = 2 * Math.PI * r;
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? ring.currentTime;
  const p = ring.duration > 0 ? Math.min(1, Math.max(0, shown / ring.duration)) : 0;
  const a = -Math.PI / 2 + 2 * Math.PI * p;
  const kx = c + r * Math.cos(a), ky = c + r * Math.sin(a);
  const box = useRef<SVGSVGElement>(null);
  const last = useRef<{ ang: number; ms: number } | null>(null);
  const angleAt = (x: number, y: number): number => {
    const b = box.current!.getBoundingClientRect();
    let ang = Math.atan2(y - (b.top + b.height / 2), x - (b.left + b.width / 2)) + Math.PI / 2;
    if (ang < 0) ang += 2 * Math.PI;
    return ang;
  };
  const dur = ring.duration || 0;
  const fmt = (ms: number) => { const s2 = Math.floor(ms / 1000); return `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, "0")}`; };
  // The time's label sits inside the ring, next to the knob.
  const lx = c + (r - 34) * Math.cos(a), ly = c + (r - 34) * Math.sin(a);
  return (
    <svg ref={box} data-own-drag="" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}
      role="slider" aria-label={t("Position in the song")} aria-valuemin={0} aria-valuemax={dur} aria-valuenow={Math.round(shown)}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.sliderBg} strokeWidth={4} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.text} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${(C * p).toFixed(1)} ${C.toFixed(1)}`} transform={`rotate(-90 ${c} ${c})`} />
      <circle cx={kx} cy={ky} r={drag !== null ? 12 : 8} fill={T.text} style={{ transition: "r 0.12s ease" }} />
      {drag !== null && (
        <g pointerEvents="none">
          <rect x={lx - 26} y={ly - 13} width={52} height={26} rx={13} fill={T.text} />
          <text x={lx} y={ly + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill={T.bg}>{fmt(drag)}</text>
        </g>
      )}
      {/* What is touched: a wide band over the ring, so the record inside
          keeps its own tap and swipe. */}
      <circle cx={c} cy={c} r={r} fill="none" stroke="transparent" strokeWidth={34} style={{ pointerEvents: "stroke", cursor: "pointer", touchAction: "none" }}
        onTouchStart={e => e.stopPropagation()}
        onPointerDown={e => {
          e.stopPropagation();
          try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* not a pointer the page knows */ }
          const ang = angleAt(e.clientX, e.clientY);
          const ms = Math.round((ang / (2 * Math.PI)) * dur);
          last.current = { ang, ms };
          setDrag(ms);
          ring.onSeekStart();
          ring.onSeek(ms);
        }}
        onPointerMove={e => {
          const l = last.current;
          if (!l) return;
          const ang = angleAt(e.clientX, e.clientY);
          let d = ang - l.ang;
          if (d > Math.PI) d -= 2 * Math.PI;
          if (d < -Math.PI) d += 2 * Math.PI;
          const ms = Math.round(Math.min(dur, Math.max(0, l.ms + (d / (2 * Math.PI)) * dur)));
          last.current = { ang, ms };
          setDrag(ms);
          ring.onSeek(ms);
        }}
        onPointerUp={() => {
          const l = last.current;
          if (!l) return;
          last.current = null;
          setDrag(null);
          ring.onSeekEnd(l.ms);
        }}
        onPointerCancel={() => { if (last.current) ring.onSeekEnd(last.current.ms); last.current = null; setDrag(null); }} />
    </svg>
  );
}
