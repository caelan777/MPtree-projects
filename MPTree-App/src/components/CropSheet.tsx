import { useEffect, useRef, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";

// ─── CROP SHEET ──────────────────────────────────────────────────────────────
// A cover is shown square in the list and round on the record, so a photo of
// any other shape has to lose something. Left to itself that was the edges,
// whatever was on them. Here the person decides: the photo lies under a square
// window and is dragged about, and zoomed with the slider or two fingers. What is
// in the window is what is kept, as a square JPEG.
//
// The ring in the window is the record's label, the smallest the cover is
// ever cut to.

const OUT_PX = 640;
const BACKGROUND_PX = 900;
const QUALITY = 0.82;
const MAX_ZOOM = 4;

type CropSheetProps = {
  /** The photo as picked, as a data URL. */
  src: string;
  /** "background": the shape of this screen, for a photo behind the whole
   *  app, without the record's ring. A cover otherwise. */
  shape?: "cover" | "background";
  onUse: (dataUrl: string) => void;
  onCancel: () => void;
  T: T;
};

/** zoom 1 fills the window; x and y are where the photo's corner is in it. */
type View = { zoom: number; x: number; y: number };

export function CropSheet({ src, shape = "cover", onUse, onCancel, T }: CropSheetProps) {
  const cover = shape === "cover";
  // How tall the window is for its width: square for a cover, the screen's
  // own shape for a background.
  const aspect = cover ? 1 : window.innerHeight / window.innerWidth;
  const side = Math.round(Math.min(window.innerWidth - 72, (window.innerHeight * (cover ? 0.48 : 0.58)) / aspect, 360));
  const tall = Math.round(side * aspect);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  // The fingers on the photo, and how far apart two of them last were.
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const spread = useRef(0);

  /** How large the photo is drawn at a zoom, in the window's pixels. */
  const fitOf = (i: HTMLImageElement) => Math.max(side / i.width, tall / i.height);
  const sizeAt = (i: HTMLImageElement, zoom: number) => {
    const fit = fitOf(i);
    return { w: i.width * fit * zoom, h: i.height * fit * zoom };
  };
  /** Never past its own edge: the window is always full. */
  const held = (i: HTMLImageElement, v: View): View => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const { w, h } = sizeAt(i, zoom);
    return { zoom, x: Math.min(0, Math.max(side - w, v.x)), y: Math.min(0, Math.max(tall - h, v.y)) };
  };
  /** Zooms with the point under the fingers staying where it is. */
  const zoomAt = (i: HTMLImageElement, v: View, zoom: number, px: number, py: number): View => {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const k = next / v.zoom;
    return held(i, { zoom: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  };

  useEffect(() => {
    let gone = false;
    const i = new Image();
    i.onload = () => {
      if (gone) return;
      const fit = fitOf(i);
      setImg(i);
      // Starts in the middle, which is what it was cut to before.
      setView({ zoom: 1, x: (side - i.width * fit) / 2, y: (tall - i.height * fit) / 2 });
    };
    i.onerror = () => { if (!gone) onCancel(); };
    i.src = src;
    return () => { gone = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const inFrame = (clientX: number, clientY: number) => {
    const r = frame.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: side / 2, y: tall / 2 };
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Keeps the drag when the finger leaves the window. Not every pointer can
    // be held on to, and the drag works inside the window without it.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    spread.current = 0;
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const was = fingers.current.get(e.pointerId);
    if (!was || !img) return;
    const now = { x: e.clientX, y: e.clientY };
    fingers.current.set(e.pointerId, now);
    if (fingers.current.size === 1) {
      const dx = now.x - was.x, dy = now.y - was.y;
      setView(v => held(img, { ...v, x: v.x + dx, y: v.y + dy }));
      return;
    }
    const [a, b] = [...fingers.current.values()];
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    const before = spread.current;
    spread.current = apart;
    if (before <= 0 || apart <= 0) return;
    const mid = inFrame((a.x + b.x) / 2, (a.y + b.y) / 2);
    setView(v => zoomAt(img, v, v.zoom * (apart / before), mid.x, mid.y));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    spread.current = 0;
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!img) return;
    const at = inFrame(e.clientX, e.clientY);
    const step = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView(v => zoomAt(img, v, v.zoom * step, at.x, at.y));
  };

  const use = () => {
    if (!img) return;
    try {
      // The window, measured in the photo's own pixels.
      const perPx = 1 / fitOf(img) / view.zoom;
      const cutW = side * perPx, cutH = tall * perPx;
      // A background is as wide as a phone screen's pixels, near enough.
      const outW = Math.max(1, Math.min(cover ? OUT_PX : BACKGROUND_PX, Math.round(cutW)));
      const outH = Math.max(1, Math.round(outW * aspect));
      const canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) { onUse(src); return; }
      // A see-through photo would come out black as a JPEG.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, -view.x * perPx, -view.y * perPx, cutW, cutH, 0, 0, outW, outH);
      onUse(canvas.toDataURL("image/jpeg", QUALITY));
    } catch {
      // Better the whole photo than none.
      onUse(src);
    }
  };

  const drawn = img ? sizeAt(img, view.zoom) : null;
  const btn: React.CSSProperties = {
    flex: 1, height: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 470, background: T.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 22, padding: "18px 18px 16px", width: side + 2, boxSizing: "content-box", boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{cover ? t("Crop the cover") : t("Place the photo")}</div>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.45, margin: "4px 0 12px" }}>
          {t("Drag the photo to move it. Use the slider to zoom.")}
        </div>

        <div
          ref={frame}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
          style={{
            width: side, height: tall, position: "relative", overflow: "hidden", borderRadius: 14,
            background: T.dim, border: `1px solid ${T.border}`, touchAction: "none", cursor: img ? "grab" : "default",
          }}
        >
          {img && drawn && (
            <img
              src={src} alt="" draggable={false}
              style={{ position: "absolute", left: view.x, top: view.y, width: drawn.w, height: drawn.h, maxWidth: "none", userSelect: "none", pointerEvents: "none" }}
            />
          )}
          {cover && <div aria-hidden="true" style={{
            position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
            border: "1.5px dashed rgba(255,255,255,0.75)", boxShadow: "0 0 0 1px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.3)",
          }} />}
        </div>

        <input
          className="slider" type="range" min={1} max={MAX_ZOOM} step={0.01} value={view.zoom} disabled={!img}
          aria-label={t("Zoom")}
          onChange={e => { const z = Number(e.target.value); if (img) setView(v => zoomAt(img, v, z, side / 2, tall / 2)); }}
          style={{ width: "100%", margin: "18px 0 16px", accentColor: T.accent }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...btn, background: T.surface, color: T.text, border: `1px solid ${T.border}` }}>{t("Cancel")}</button>
          <button onClick={use} disabled={!img} style={{ ...btn, background: T.accent, color: T.playBtnFg, border: "none", opacity: img ? 1 : 0.5 }}>{t("Use this")}</button>
        </div>
      </div>
    </div>
  );
}
