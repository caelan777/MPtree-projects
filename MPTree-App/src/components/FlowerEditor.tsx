import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { STAMPS, OWN_GROUNDS, OWN_MAX, OWN_SIZE, type OwnFlowers, type OwnItem, type OwnGround, type Stamp } from "../look";
import { stampUri, OWN_GROUND } from "../flowers";

// ─── AVIELA, MADE YOUR OWN ───────────────────────────────────────────────────
// All of Aviela's flowers in a tray, and a record or the app to put them on.
// A tap on a flower in the tray puts it in the middle. A flower on the canvas
// is dragged to move it, pinched with two fingers to size and turn it (or the
// two sliders, for one finger or a mouse), and dragged onto the bin to take it
// off. Undo steps back one change at a time; Done keeps it all as one pick on
// the Aviela page, where Apply keeps it for good like everything else.

type Props = {
  /** The record, round, or the app, the shape of the screen. */
  mode: "record" | "app";
  own: OwnFlowers;
  /** For the app: the app itself, small and without flowers, to place them on.
   *  Drawn at `backdropScale` of the screen's size. */
  backdrop?: (scale: number) => ReactNode;
  onDone: (own: OwnFlowers) => void;
  onCancel: () => void;
  onToast: (msg: string) => void;
  T: T;
};

const NAMES = (): Record<Stamp, string> => ({
  rose: t("Rose"), pink: t("Pink flower"), petal: t("Pale flower"), white: t("White flower"), daisy: t("Daisy"),
  lily: t("Lily"), dahlia: t("Dahlia"), bloom: t("Big bloom"), line: t("Drawn flower"), night: t("Drawn in pink"),
  leaf: t("Leaf"), bud: t("Bud"),
});

export function FlowerEditor({ mode, own, backdrop, onDone, onCancel, onToast, T }: Props) {
  const sh = makeSH(T);
  const record = mode === "record";
  const [items, setItems] = useState<OwnItem[]>(record ? own.record : own.app);
  const [ground, setGround] = useState<OwnGround>(own.ground);
  const [sel, setSel] = useState<number | null>(null);
  const [overBin, setOverBin] = useState(false);
  // A flower is being dragged: the bin shows.
  const [dragging, setDragging] = useState(false);
  const undo = useRef<{ items: OwnItem[]; ground: OwnGround }[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const remember = () => { undo.current.push({ items, ground }); if (undo.current.length > 60) undo.current.shift(); setUndoCount(undo.current.length); };
  const stepBack = () => {
    const last = undo.current.pop();
    setUndoCount(undo.current.length);
    if (!last) return;
    setItems(last.items); setGround(last.ground); setSel(null);
  };

  // The canvas: as large as fits above the tray.
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const measure = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const W = record ? Math.round(Math.min(win.w - 48, win.h * 0.46, 420)) : Math.round(Math.min(win.w - 96, (win.h * 0.6) * win.w / win.h));
  const H = record ? W : Math.round(W * win.h / win.w);

  const canvas = useRef<HTMLDivElement>(null);
  const bin = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  // What a finger on a flower is doing: where it started, and for two fingers,
  // how far apart and at what angle they started.
  const drag = useRef<{ i: number; from: OwnItem; x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; angle: number; s: number; r: number } | null>(null);
  const moved = useRef(false);

  const update = (i: number, patch: Partial<OwnItem>) =>
    setItems(list => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const clampS = (v: number) => Math.min(OWN_SIZE.max, Math.max(OWN_SIZE.min, v));
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const add = (f: Stamp) => {
    if (items.length >= OWN_MAX) { onToast(t("That is as many flowers as there is room for.")); return; }
    remember();
    // Near the middle, a little further round each time (the golden angle),
    // so two taps are two flowers and not one on top of the other.
    const k = items.length, turn = k * 137.5 * Math.PI / 180, out = 0.04 + 0.12 * ((k % 5) / 4);
    const next: OwnItem = { f, x: clamp01(0.5 + Math.cos(turn) * out), y: clamp01(0.5 + Math.sin(turn) * out), s: record ? 0.2 : 0.16, r: ((k * 37) % 50) - 25 };
    setItems(list => [...list, next]);
    setSel(items.length);
  };
  const remove = (i: number) => {
    setItems(list => list.filter((_, k) => k !== i));
    setSel(null);
  };

  const twoFingers = () => {
    const [a, b] = [...fingers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI };
  };
  const onBin = (x: number, y: number) => {
    const r = bin.current?.getBoundingClientRect();
    return !!r && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12;
  };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
    if (fingers.current.size === 1) {
      const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
      const i = hit ? Number(hit.dataset.i) : null;
      moved.current = false;
      if (i === null) { setSel(null); drag.current = null; return; }
      setDragging(true);
      remember();
      // The one picked comes to the front.
      setItems(list => [...list.filter((_, k) => k !== i), list[i]]);
      const top = items.length - 1;
      setSel(top);
      drag.current = { i: top, from: items[i], x: e.clientX, y: e.clientY };
    } else if (fingers.current.size === 2 && drag.current) {
      const now = items[drag.current.i];
      const { dist, angle } = twoFingers();
      pinch.current = { dist, angle, s: now.s, r: now.r };
    }
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    moved.current = true;
    if (fingers.current.size >= 2 && pinch.current) {
      const p = pinch.current;
      const { dist, angle } = twoFingers();
      update(d.i, { s: clampS(p.s * dist / Math.max(1, p.dist)), r: Math.round(p.r + angle - p.angle) });
      return;
    }
    update(d.i, { x: clamp01(d.from.x + (e.clientX - d.x) / W), y: clamp01(d.from.y + (e.clientY - d.y) / H) });
    setOverBin(onBin(e.clientX, e.clientY));
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    if (fingers.current.size === 1 && drag.current) {
      // One finger left after a pinch: it drags on from where it is now.
      const [f] = [...fingers.current.values()];
      drag.current = { ...drag.current, from: items[drag.current.i], x: f.x, y: f.y };
      pinch.current = null;
      return;
    }
    if (fingers.current.size === 0) {
      if (drag.current && onBin(e.clientX, e.clientY)) remove(drag.current.i);
      // A tap without a move was only to pick it: nothing to undo.
      else if (drag.current && !moved.current) { undo.current.pop(); setUndoCount(undo.current.length); }
      drag.current = null;
      pinch.current = null;
      setOverBin(false);
      setDragging(false);
    }
  };
  const wheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (sel === null || !items[sel]) return;
    update(sel, { s: clampS(items[sel].s * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) });
  };

  const done = () => onDone(record ? { ...own, record: items, ground } : { ...own, app: items });
  const names = NAMES();
  const chosen = sel !== null ? items[sel] : null;
  const slider = { width: "100%", accentColor: T.accent, margin: "6px 0 0" } as const;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 480, background: T.sheetBg, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div style={{ ...sh.hdr, padding: "14px 16px 8px" }}>
        <button onClick={onCancel} style={{ ...sh.xBtn, color: T.text }} aria-label={t("Cancel")}><IC.Close /></button>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Make your own")}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={stepBack} disabled={!undoCount} aria-label={t("Undo")}
            style={{ ...sh.xBtn, color: undoCount ? T.text : T.muted, opacity: undoCount ? 1 : 0.5 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
          </button>
          <button onClick={done} style={{ padding: "8px 16px", background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 18, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
            {t("Done")}
          </button>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "4px 0" }}>
        <div ref={canvas}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}
          style={{
            width: W, height: H, position: "relative", overflow: "hidden", touchAction: "none", flexShrink: 0,
            borderRadius: record ? "50%" : 18, border: `1px solid ${T.border}`,
            background: record ? OWN_GROUND[ground] : T.bg, boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          }}>
          {!record && backdrop && <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{backdrop(W / win.w)}</div>}
          {items.map((it, i) => {
            const size = it.s * W;
            return (
              <img key={i} data-i={i} src={stampUri(it.f)} alt="" draggable={false}
                style={{
                  position: "absolute", left: it.x * W - size / 2, top: it.y * H - size / 2, width: size, height: size,
                  transform: `rotate(${it.r}deg)`, cursor: "grab", userSelect: "none",
                  outline: i === sel ? `2px dashed ${T.text}` : "none", outlineOffset: 2, borderRadius: "50%",
                  opacity: i === sel && overBin ? 0.4 : 1,
                }} />
            );
          })}
          {/* Where the record's label will lie, over the flowers. */}
          {record && <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: W * 0.34, height: W * 0.34, marginLeft: -W * 0.17, marginTop: -W * 0.17, borderRadius: "50%", border: `1.5px dashed ${ground === "ink" ? "rgba(255,255,255,0.5)" : "rgba(32,24,27,0.35)"}`, pointerEvents: "none" }} />}
          {items.length === 0 && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: record ? "18%" : 24, textAlign: "center", fontSize: 13, color: record && ground === "ink" ? "#fff" : T.muted, pointerEvents: "none", padding: "0 24px" }}>
              {t("Tap a flower below to put it here.")}
            </div>
          )}
        </div>

        <div ref={bin} aria-label={t("Drag a flower here to take it off")} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 18, fontSize: 13, fontWeight: 600,
          color: overBin ? T.playBtnFg : T.muted, background: overBin ? T.accent : T.surface, border: `1px solid ${T.border}`,
          visibility: dragging || sel !== null ? "visible" : "hidden", transition: "background 0.15s",
        }}>
          <IC.Trash />{t("Drag here to take it off")}
        </div>
      </div>

      <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: "10px 0 calc(env(safe-area-inset-bottom, 0px) + 14px)" }}>
        {chosen ? (
          <div style={{ display: "flex", gap: 14, padding: "0 16px 10px", alignItems: "flex-end" }}>
            <label style={{ flex: 1, fontSize: 12, color: T.muted }}>
              {t("Size")}
              <input className="slider" type="range" min={OWN_SIZE.min} max={OWN_SIZE.max} step={0.005} value={chosen.s}
                onPointerDown={remember} onChange={e => update(sel!, { s: Number(e.target.value) })} style={slider} />
            </label>
            <label style={{ flex: 1, fontSize: 12, color: T.muted }}>
              {t("Turn")}
              <input className="slider" type="range" min={-180} max={180} step={1} value={chosen.r}
                onPointerDown={remember} onChange={e => update(sel!, { r: Number(e.target.value) })} style={slider} />
            </label>
            <button onClick={() => { remember(); remove(sel!); }} aria-label={t("Take it off")}
              style={{ ...sh.xBtn, color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, width: 40, height: 40, display: "grid", placeItems: "center" }}>
              <IC.Trash />
            </button>
          </div>
        ) : record ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px" }}>
            <span style={{ fontSize: 12, color: T.muted }}>{t("Record")}</span>
            {OWN_GROUNDS.map(g => (
              <button key={g} onClick={() => { if (g !== ground) { remember(); setGround(g); } }} aria-pressed={g === ground} aria-label={g}
                style={{ width: 28, height: 28, borderRadius: "50%", background: OWN_GROUND[g], cursor: "pointer", padding: 0,
                  border: g === ground ? `2px solid ${T.text}` : `1px solid ${T.border}`, boxShadow: g === ground ? `0 0 0 2px ${T.sheetBg} inset` : "none" }} />
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px", scrollbarWidth: "none" }}>
          {STAMPS.map(f => (
            <button key={f} onClick={() => add(f)} aria-label={names[f]} title={names[f]}
              style={{ flexShrink: 0, width: 58, height: 58, borderRadius: 16, background: f === "white" || f === "daisy" ? "#f7bbd1" : T.surface, border: `1px solid ${T.border}`, padding: 6, cursor: "pointer" }}>
              <img src={stampUri(f)} alt="" draggable={false} style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
