import { memo } from "react";
import { Logo } from "./Logo";
import { t } from "../i18n";
import { useLook, useVinyl, saveLook, type VinylSkin } from "../look";

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
  /** Overrides the saved record, for the previews in the Personalise sheet. */
  skin?: VinylSkin;
  /** In the player: a tap turns the record into a picture disc of the cover
   *  and back. onNoCover is called instead when there is no cover to use. */
  tappable?: boolean;
  onNoCover?: () => void;
};

// ─── Record skins (Pro) ──────────────────────────────────────────────────────
// Only the record itself turns. Grooves and sheen on the drawn skins sit on a
// layer above it that stays still: grooves are circles, so turning them shows
// nothing, and a highlight is where the light is, which does not orbit.

// White marble with grey veins, drawn once by the browser from an SVG. As an <img>
// it is rasterised a single time and then turned as a texture, exactly like
// vinyl.webp, so it costs the compositor nothing extra per frame.
const MARBLE = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>" +
  "<filter id='m' x='0' y='0' width='100%' height='100%'>" +
  "<feTurbulence type='fractalNoise' baseFrequency='0.01 0.02' numOctaves='3' seed='11'/>" +
  "<feColorMatrix type='saturate' values='0'/>" +
  "<feComponentTransfer>" +
  "<feFuncR type='table' tableValues='0.96 0.97 0.95 0.96 0.22 0.95 0.97 0.96 0.14 0.95'/>" +
  "<feFuncG type='table' tableValues='0.96 0.97 0.95 0.96 0.22 0.95 0.97 0.96 0.14 0.95'/>" +
  "<feFuncB type='table' tableValues='0.97 0.98 0.96 0.97 0.23 0.96 0.98 0.97 0.15 0.96'/>" +
  "<feFuncA type='table' tableValues='1 1'/>" +
  "</feComponentTransfer></filter>" +
  "<rect width='400' height='400' filter='url(#m)'/></svg>");

const GROOVES =
  "repeating-radial-gradient(circle at center, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 2.6px, rgba(0,0,0,0) 3.3px)";
const SHEEN =
  "conic-gradient(from 25deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.16) 22deg, rgba(255,255,255,0) 52deg, " +
  "rgba(255,255,255,0) 180deg, rgba(255,255,255,0.11) 205deg, rgba(255,255,255,0) 235deg, rgba(255,255,255,0) 360deg)";

export const SpinningDisc = memo(function SpinningDisc({
  size, spinning = false, title = "", customPhoto, skin: forced, tappable = false, onNoCover,
}: SpinningDiscProps) {
  const look = useLook();
  const vinyl = useVinyl();
  // The picture disc is not a record you pick but a tap on the record, so it
  // is only ever shown for real, never in a preview, and only with a cover.
  const picture = !forced && look.photoDisc && !!customPhoto;
  const skin: VinylSkin | "picture" = picture ? "picture" : (forced ?? vinyl);

  const onTap = tappable ? () => {
    if (!customPhoto) { onNoCover?.(); return; }
    saveLook({ photoDisc: !look.photoDisc });
  } : undefined;

  const label = Math.round(size * 0.24);
  const mark = Math.round(label * 0.5);

  const recordSrc = skin === "marble" ? MARBLE : skin === "picture" ? customPhoto! : "/vinyl.webp";
  const recordFilter =
    skin === "white" ? "invert(1) grayscale(1) brightness(1.08)"
    : skin === "smoke" ? "grayscale(1) brightness(1.9) contrast(0.75)"
    : undefined;
  const drawn = skin === "marble" || skin === "picture";
  // The pale records get a black label, the rest a white one.
  const pale = skin === "white" || skin === "marble";
  const labelBg = pale ? "#000" : "#fff";
  const labelInk = pale ? "#fff" : "#000";
  // On a picture disc the picture is the record, so the label goes back to
  // the mark rather than showing the same picture twice.
  const labelPhoto = skin === "picture" ? undefined : customPhoto;

  return (
    <div
      onClick={onTap}
      role={tappable ? "button" : undefined}
      aria-label={tappable ? t("Switch between the record and the cover") : undefined}
      style={{
      width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center",
      position: "relative", borderRadius: "50%", cursor: tappable ? "pointer" : undefined,
      WebkitTapHighlightColor: "transparent",
      // Static: the shadow stays put while the record turns.
      boxShadow: skin === "smoke" ? "0 6px 24px rgba(0,0,0,0.22)" : "0 6px 24px rgba(0,0,0,0.4)",
      // Nothing inside affects layout outside, so a spinning frame cannot make
      // the parent reflow.
      contain: "layout paint",
    }}>
      <style>{DISC_STYLE}</style>
      <img
        className="mp-vinyl"
        src={recordSrc}
        alt=""
        draggable={false}
        style={{
          gridArea: "1 / 1", width: "100%", height: "100%", borderRadius: "50%",
          objectFit: "cover", display: "block", userSelect: "none",
          filter: recordFilter,
          opacity: skin === "smoke" ? 0.62 : 1,
          animation: "mpDiscSpin 7s linear infinite",
          animationPlayState: spinning ? "running" : "paused",
          // Its own compositor layer, so turning it is a transform the GPU
          // applies to an existing texture rather than a repaint every frame.
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />
      {drawn && (
        <div aria-hidden="true" style={{
          gridArea: "1 / 1", width: "100%", height: "100%", borderRadius: "50%",
          background: `${SHEEN}, ${GROOVES}`,
          boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size * 0.018))}px rgba(0,0,0,0.85)`,
          pointerEvents: "none",
        }} />
      )}
      <div style={{
        gridArea: "1 / 1", width: label, height: label, borderRadius: "50%", overflow: "hidden",
        background: labelBg, display: "grid", placeItems: "center", zIndex: 1,
        boxShadow: "0 1px 6px rgba(0,0,0,0.45)",
      }}>
        {labelPhoto ? (
          <img src={labelPhoto} alt={title} draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Logo size={mark} color={labelInk} />
        )}
      </div>
    </div>
  );
});
