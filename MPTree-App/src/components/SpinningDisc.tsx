import { memo } from "react";
import { Logo } from "./Logo";

// ─── SPINNING DISC ───────────────────────────────────────────────────────────
// The record for the expanded player: the real vinyl.webp turning on its
// spindle, with a fixed centre label (the track's photo when it has one, else
// the black MPTree mark). Only the record turns (the brand forbids rotating the
// mark), and only while audio is playing. Honours prefers-reduced-motion.
//
// Four things kept this stuttering:
//
//   The player's position ticker updates twice a second, re-rendering the whole
//   sheet and this subtree with it. The rotation is a CSS animation so it never
//   restarted, but React still rebuilt the elements underneath a compositor
//   animation 120 times a minute. memo() below cuts that: the disc only
//   re-renders when its own props change, which is on a track change.
//
//   The record had no layer of its own, so every frame of the rotation repainted
//   it, box-shadow and all, instead of the compositor simply turning a texture
//   it already had. will-change fixes that.
//
//   The texture was 1000x1000 for something drawn at 268. That is four megabytes
//   of GPU memory resampled every frame, for detail no screen could show. The
//   asset is now 536 square: twice the display size, so it still looks right on
//   a 2x screen, at a quarter of the sampling cost.
//
//   The drop shadow lived on the rotating image, so it was part of the spinning
//   layer: it turned with the record (wrong, a shadow does not orbit its light)
//   and enlarged the layer the compositor had to carry. It sits on a static
//   wrapper now.

const DISC_STYLE = `
  @keyframes mpDiscSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .mp-vinyl { animation: none !important; } }
`;

type SpinningDiscProps = {
  size: number;
  /** True while audio is playing; the record turns only then. */
  spinning?: boolean;
  title?: string;
  /** When set, the centre label shows this photo instead of the MPTree mark. */
  customPhoto?: string;
};

export const SpinningDisc = memo(function SpinningDisc({
  size, spinning = false, title = "", customPhoto,
}: SpinningDiscProps) {
  const label = Math.round(size * 0.24);
  const mark = Math.round(label * 0.5);

  return (
    <div style={{
      width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center",
      position: "relative", borderRadius: "50%",
      // Static: the shadow stays put while the record turns.
      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
      // Nothing inside affects layout outside, so a spinning frame cannot make
      // the parent reflow.
      contain: "layout paint",
    }}>
      <style>{DISC_STYLE}</style>
      <img
        className="mp-vinyl"
        src="/vinyl.webp"
        alt=""
        draggable={false}
        style={{
          gridArea: "1 / 1", width: "100%", height: "100%", borderRadius: "50%",
          objectFit: "cover", display: "block", userSelect: "none",
          animation: "mpDiscSpin 7s linear infinite",
          animationPlayState: spinning ? "running" : "paused",
          // Its own compositor layer, so turning it is a transform the GPU
          // applies to an existing texture rather than a repaint every frame.
          willChange: "transform",
          backfaceVisibility: "hidden",
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
});
