import { memo } from "react";
import type { T } from "../themes";
import type { TimelineKind } from "../look";
import { t } from "../i18n";

// ─── TIMELINE ────────────────────────────────────────────────────────────────
// The bar in the player that shows how far into the song it is, and is dragged
// to go elsewhere. "line" is the one MPTree had; the others are what Caelan is
// choosing between (seven designs, 19 November 2026), so a test build can show
// each of them. Every one but the ring keeps the same <input type="range"> for
// the dragging, laid over the drawing and made invisible: the phone's own
// slider does the touch, the drawing only shows where it is.
//
// The ring has no bar: it is drawn round the record (PlayerArt), and this only
// shows the two times.

type Props = {
  kind: TimelineKind;
  currentTime: number;
  duration: number;
  onSeek: (ms: number) => void;
  onSeekStart: () => void;
  onSeekEnd: (ms: number) => void;
  fmt: (ms: number) => string;
  /** For the wave: the same song gets the same pattern every time. */
  seed: string;
  T: T;
};

/** The wave's bars for a song: a pattern made from its name, not its sound. */
function waveOf(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const a = 0.5 + ((h >>> 0) % 1000) / 1000, b = 1.3 + ((h >>> 10) % 1000) / 700;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const env = 0.55 + 0.45 * Math.sin((i / n) * Math.PI);
    const v = Math.abs(Math.sin(i * 0.73 * a) * 0.55 + Math.sin(i * b + 1.3) * 0.3 + Math.sin(i * 0.31 + a) * 0.25);
    out.push(Math.min(1, v) * env);
  }
  return out;
}

export const Timeline = memo(function Timeline({ kind, currentTime, duration, onSeek, onSeekStart, onSeekEnd, fmt, seed, T }: Props) {
  const time = (ms: number, align: "left" | "right") => (
    <span style={{ fontSize: 11, color: T.muted, width: 34, flexShrink: 0, textAlign: align, fontVariantNumeric: "tabular-nums" }}>{fmt(ms)}</span>
  );
  const input = (extra?: React.CSSProperties) => (
    <input
      className={kind === "line" ? "slider" : undefined}
      type="range" min={0} max={duration || 100} value={currentTime}
      aria-label={t("Position in the song")}
      onMouseDown={onSeekStart} onTouchStart={onSeekStart}
      onChange={e => onSeek(Number(e.target.value))}
      onMouseUp={e => onSeekEnd(Number((e.target as HTMLInputElement).value))}
      onTouchEnd={e => onSeekEnd(Number((e.target as HTMLInputElement).value))}
      style={extra}
    />
  );

  if (kind === "line") {
    return (
      <div style={{ display: "flex", alignItems: "center" }}>
        {time(currentTime, "left")}
        {input()}
        {time(duration, "right")}
      </div>
    );
  }
  if (kind === "ring") {
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: 6, fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums", padding: "2px 0" }}>
        <b style={{ color: T.text }}>{fmt(currentTime)}</b><span>/</span><span>{fmt(duration)}</span>
      </div>
    );
  }

  const p = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const on = T.text, off = T.sliderBg;
  const hidden: React.CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "pointer" };
  let drawing: React.ReactNode = null;
  let height = 22;

  if (kind === "thick") {
    return (
      <div>
        <div style={{ position: "relative", height: 14, display: "flex", alignItems: "center" }}>
          <div style={{ width: "100%", height: 10, borderRadius: 5, background: off, overflow: "hidden" }}>
            <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 5, background: on }} />
          </div>
          {input(hidden)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {time(currentTime, "left")}{time(duration, "right")}
        </div>
      </div>
    );
  }
  if (kind === "wave") {
    height = 28;
    const bars = waveOf(seed, 44);
    drawing = (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {bars.map((v, i) => <i key={i} style={{ display: "block", width: 3, height: Math.round(4 + 20 * v), borderRadius: 2, background: i / bars.length < p ? on : off }} />)}
      </div>
    );
  } else if (kind === "dots") {
    const n = 26, cur = Math.round(p * (n - 1));
    drawing = (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={{ display: "block", width: i === cur ? 12 : 5, height: i === cur ? 12 : 5, borderRadius: 6, background: i <= cur ? on : off }} />
        ))}
      </div>
    );
  } else if (kind === "ruler") {
    height = 30;
    const n = 46;
    drawing = (
      <div style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 3, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          {Array.from({ length: n }, (_, i) => (
            <i key={i} style={{ display: "block", width: 1.5, height: i % 5 === 0 ? 13 : 7, borderRadius: 1, background: i / (n - 1) < p ? T.textSub : off }} />
          ))}
        </div>
        <i style={{ position: "absolute", left: `${p * 100}%`, bottom: 0, width: 2, height: 26, marginLeft: -1, borderRadius: 1, background: on }} />
        <i style={{ position: "absolute", left: `${p * 100}%`, bottom: 22, width: 8, height: 8, marginLeft: -4, borderRadius: 4, background: on }} />
      </div>
    );
  } else if (kind === "thumb") {
    height = 28;
    drawing = (
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <div style={{ position: "relative", width: "100%", height: 4, borderRadius: 2, background: off }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p * 100}%`, borderRadius: 2, background: on }} />
          <span style={{
            position: "absolute", left: `${p * 100}%`, top: "50%", width: 46, height: 24, margin: "-12px 0 0 -23px", borderRadius: 12,
            background: on, color: T.bg, fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
          }}>{fmt(currentTime)}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {kind !== "thumb" ? time(currentTime, "left") : <span style={{ width: 26, flexShrink: 0 }} />}
      <div style={{ position: "relative", flex: 1, height, margin: "0 8px" }}>
        {drawing}
        {input(hidden)}
      </div>
      {time(duration, "right")}
    </div>
  );
});
