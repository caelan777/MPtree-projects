import { Logo } from "./Logo";

// ─── SPINNING DISC ───────────────────────────────────────────────────────────
// The same record as the website hero: the real vinyl.webp turning on its
// spindle, with a fixed white centre label carrying the black MPTree mark. Only
// the record turns (the brand forbids rotating the mark), and only while audio
// is playing. Proportions match the site: label 17% of the disc, mark 42% of the
// label. Honours prefers-reduced-motion.

type SpinningDiscProps = {
  size: number;
  /** True while audio is playing; the record turns only then. */
  spinning?: boolean;
};

export function SpinningDisc({ size, spinning = false }: SpinningDiscProps) {
  const label = Math.round(size * 0.17);
  const mark = Math.round(label * 0.42);

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
        style={{
          gridArea: "1 / 1", width: "100%", height: "100%", borderRadius: "50%",
          objectFit: "cover", display: "block",
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
          animation: "mpDiscSpin 7s linear infinite",
          animationPlayState: spinning ? "running" : "paused",
        }}
      />
      <div style={{
        gridArea: "1 / 1", width: label, height: label, borderRadius: "50%",
        background: "#fff", display: "grid", placeItems: "center", zIndex: 1,
      }}>
        <Logo size={mark} color="#000" />
      </div>
    </div>
  );
}
