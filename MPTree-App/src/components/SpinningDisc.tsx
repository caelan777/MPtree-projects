import { Logo } from "./Logo";

// ─── SPINNING DISC ───────────────────────────────────────────────────────────
// The record for the expanded player: the real vinyl.webp turning on its
// spindle, with a fixed centre label. The label carries the black MPTree mark,
// or the track's own photo when it has one. Only the record turns (the brand
// forbids rotating the mark), and only while audio is playing. Honours
// prefers-reduced-motion.

type SpinningDiscProps = {
  size: number;
  /** True while audio is playing; the record turns only then. */
  spinning?: boolean;
  title?: string;
  /** When set, the centre label shows this photo instead of the MPTree mark. */
  customPhoto?: string;
};

export function SpinningDisc({ size, spinning = false, title = "", customPhoto }: SpinningDiscProps) {
  const label = Math.round(size * 0.24);
  const mark = Math.round(label * 0.5);

  return (
    <div style={{ width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center", position: "relative" }}>
      <style>{`
        @keyframes mpDiscSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .mp-vinyl { animation: none !important; } }
      `}</style>
      <img
        className="mp-vinyl"
        src="/vinyl.webp"
        alt=""
        draggable={false}
        style={{
          gridArea: "1 / 1", width: "100%", height: "100%", borderRadius: "50%",
          objectFit: "cover", display: "block", userSelect: "none",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          animation: "mpDiscSpin 7s linear infinite",
          animationPlayState: spinning ? "running" : "paused",
        }}
      />
      <div style={{
        gridArea: "1 / 1", width: label, height: label, borderRadius: "50%", overflow: "hidden",
        background: "#fff", display: "grid", placeItems: "center", zIndex: 1,
        boxShadow: "0 1px 6px rgba(0,0,0,0.45)",
      }}>
        {customPhoto ? (
          <img src={customPhoto} alt={title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Logo size={mark} color="#000" />
        )}
      </div>
    </div>
  );
}
