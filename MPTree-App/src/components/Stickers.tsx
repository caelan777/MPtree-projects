import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { stickerArt, STICKER_KINDS, type StickerKind, type Tone } from "../flowers";
import { START_WIDTH, MAX_STICKERS, type Sticker, type StickerPlace, type StickerSetup } from "../stickers";

// ─── STICKERS ON SCREEN ──────────────────────────────────────────────────────
// StickerLayer draws a setup's stickers on one place, behind everything else in
// it. StickerEditor is where they are put down by hand: over a copy of the
// songs page, with a tray of Aviela's stickers at the bottom. A sticker is
// dragged where it should go, onto the header card or anywhere on the page,
// and turned and sized with the round handle on its corner or two fingers.
// Save keeps the whole lot as a setup, new or over the one being changed.

export function stickerName(k: StickerKind): string {
  switch (k) {
    case "sprig": return t("Sprig");
    case "bunch": return t("Bunch");
    case "bloom": return t("Bloom");
    case "flower": return t("Flower");
    case "daisy": return t("Daisy");
    case "garland": return t("Garland");
    case "vine": return t("Vine");
    case "lines": return t("Line art");
    case "meadow": return t("Meadow");
  }
}

function piece(s: Sticker, tone: Tone, extra?: CSSProperties) {
  const a = stickerArt(s.k, tone);
  return { src: a.src, style: { position: "absolute", left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: "auto", aspectRatio: `${a.w} / ${a.h}`, transform: `translate(-50%, -50%) rotate(${s.r}deg)${s.f ? " scaleX(-1)" : ""}`, display: "block", ...extra } as CSSProperties };
}

/** The stickers of one place, behind what else is there: inside the header
 *  card (which is its own stacking context), or over the whole screen. */
export function StickerLayer({ items, place, tone, fixed = false, style }: { items: readonly Sticker[]; place: StickerPlace; tone: Tone; fixed?: boolean; style?: CSSProperties }) {
  const mine = items.filter(s => s.on === place);
  if (!mine.length) return null;
  return (
    <div data-stickers="" aria-hidden="true" style={{ position: fixed ? "fixed" : "absolute", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden", ...style }}>
      {mine.map((s, i) => { const p = piece(s, tone); return <img key={i} src={p.src} alt="" draggable={false} style={p.style} />; })}
    </div>
  );
}

/** A setup drawn small: the app's colour, its header card with that card's
 *  stickers, two lines of songs, and the page's stickers. */
export function SetupSwatch({ setup, app, card, cardTone, pageTone }: { setup: StickerSetup | null; app: T; card: T; cardTone: Tone; pageTone: Tone }) {
  const items = setup?.items ?? [];
  return (
    <div style={{ position: "relative", width: 74, height: 112, borderRadius: 12, overflow: "hidden", background: app.bg, border: `1px solid ${app.border}`, boxSizing: "border-box", isolation: "isolate" }}>
      <StickerLayer items={items} place="page" tone={pageTone} />
      <div style={{ position: "absolute", left: 4, top: 4, width: 64, height: 28, borderRadius: 8, background: card.playerBg, border: `1px solid ${card.border}`, boxSizing: "border-box", overflow: "hidden", isolation: "isolate" }}>
        <StickerLayer items={items} place="card" tone={cardTone} />
        <i style={{ position: "absolute", left: 6, top: 6, width: 10, height: 8, borderRadius: 2, background: card.text }} />
        <i style={{ position: "absolute", left: 6, right: 6, top: 17, height: 5, borderRadius: 3, background: card.border }} />
      </div>
      {[42, 58, 74, 90].map(y => (
        <span key={y} style={{ position: "absolute", left: 8, top: y, display: "flex", gap: 5, alignItems: "center", width: 58 }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: app.dim, flexShrink: 0 }} />
          <i style={{ flex: 1, height: 4, borderRadius: 2, background: app.muted, opacity: 0.6 }} />
        </span>
      ))}
    </div>
  );
}

type Live = { id: number; cx: number; cy: number; w: number; r: number };
type Item = Sticker & { id: number };

/** A name for a setup: asked when it is saved, and to rename one. */
export function NameDialog({ T, title, initial, actions, onCancel }: {
  T: T; title: string; initial: string;
  actions: { label: string; primary?: boolean; run: (name: string) => void }[];
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const clean = name.trim().slice(0, 40) || initial;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 480, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onPointerDown={e => { e.stopPropagation(); }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: T.sheetBg, borderRadius: 20, border: `1px solid ${T.border}`, padding: 18, boxSizing: "border-box", boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{title}</div>
        <input ref={input} value={name} onChange={e => setName(e.target.value)} maxLength={40}
          onKeyDown={e => { if (e.key === "Enter") actions[actions.length - 1].run(clean); }}
          aria-label={t("Name")}
          style={{ width: "100%", boxSizing: "border-box", marginTop: 14, padding: "12px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 16, fontFamily: "inherit", outline: "none" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={onCancel} style={{ padding: "10px 16px", borderRadius: 20, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{t("Cancel")}</button>
          {actions.map(a => (
            <button key={a.label} onClick={() => a.run(clean)} style={{
              padding: "10px 16px", borderRadius: 20, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
              border: a.primary ? "none" : `1px solid ${T.border}`, background: a.primary ? T.accent : "transparent", color: a.primary ? T.playBtnFg : T.text,
            }}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

type EditorProps = {
  T: T;
  initial: readonly Sticker[];
  /** The name the setup has, or the one a new one gets. */
  name: string;
  /** Editing one of the person's own setups: it can be saved over. */
  own: boolean;
  /** Saved at once, over itself, without asking for a name (Aviela's Custom). */
  quick?: boolean;
  cardTone: Tone;
  pageTone: Tone;
  onSave: (items: Sticker[], name: string, asNew: boolean) => void;
  onCancel: () => void;
};

export function StickerEditor({ T, initial, name, own, quick = false, cardTone, pageTone, onSave, onCancel }: EditorProps) {
  // The songs page as it is now, copied, behind the stickers. Its own stickers
  // are left out of the copy: they are the ones being moved about here.
  const host = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const app = document.querySelector<HTMLElement>("[data-app-shell]");
    if (app && host.current) {
      const copy = app.cloneNode(true) as HTMLElement;
      copy.removeAttribute("data-app-shell");
      copy.querySelectorAll("[data-stickers]").forEach(n => n.remove());
      copy.querySelectorAll<HTMLElement>("*").forEach(n => { if (n.style.position === "fixed" && Number(n.style.zIndex) >= 400) n.remove(); });
      copy.style.minHeight = "0";
      copy.style.height = "100%";
      host.current.replaceChildren(copy);
    }
    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      const c = document.querySelector<HTMLElement>("[data-header-card]")?.getBoundingClientRect();
      setCard(c && c.width > 120 ? { left: c.left, top: c.top, width: c.width, height: c.height } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const nextId = useRef(initial.length);
  const [items, setItemsNow] = useState<Item[]>(() => initial.map((s, i) => ({ ...s, id: i })));
  // Every change can be undone, one step at a time, back to how it opened.
  const history = useRef<Item[][]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const setItems = (next: (list: Item[]) => Item[]) => {
    history.current = [...history.current.slice(-49), itemsRef.current];
    setItemsNow(next);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setItemsNow(prev);
    if (sel !== null && !prev.some(x => x.id === sel)) setSel(null);
  };
  // Where a sticker clicks onto the header card while it is dragged.
  const [snap, setSnap] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [sel, setSel] = useState<number | null>(null);
  const [live, setLiveState] = useState<Live | null>(null);
  // Also in a ref: a gesture's events can come faster than the screen redraws,
  // and letting go has to keep where the sticker really is.
  const liveRef = useRef<Live | null>(null);
  const setLive = (l: Live | null) => { liveRef.current = l; setLiveState(l); };
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [hint, setHint] = useState(initial.length === 0);
  const plain = (list: Item[]): Sticker[] => list.map(({ id: _id, ...s }) => s);
  const dirty = JSON.stringify(plain(items)) !== JSON.stringify(initial);

  const surface = (on: StickerPlace) => on === "card" && card ? card : { left: 0, top: 0, width: view.w, height: view.h };
  const toPx = (s: Item): Live => {
    const l = liveRef.current ?? live;
    if (l && l.id === s.id) return l;
    const b = surface(s.on);
    return { id: s.id, cx: b.left + s.x * b.width, cy: b.top + s.y * b.height, w: s.w * b.width, r: s.r };
  };
  const inCard = (x: number, y: number) => !!card && x >= card.left && x <= card.left + card.width && y >= card.top && y <= card.top + card.height;
  const commit = (l: Live) => {
    setItems(list => list.map(s => {
      if (s.id !== l.id) return s;
      const on: StickerPlace = inCard(l.cx, l.cy) ? "card" : "page";
      const b = surface(on);
      return { ...s, on, x: (l.cx - b.left) / b.width, y: (l.cy - b.top) / b.height, w: Math.max(0.03, Math.min(1.3, l.w / b.width)), r: ((l.r % 360) + 360) % 360 };
    }));
  };

  // One finger moves a sticker; the corner handle, or a second finger, turns
  // it and changes its size.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ id: number; mode: "move" | "turn" | "pinch"; start: Live; ax: number; ay: number; d0: number; a0: number } | null>(null);
  const begin = (e: React.PointerEvent, id: number, mode: "move" | "turn") => {
    e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* not a pointer the page knows */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSel(id);
    setHint(false);
    const s = items.find(i => i.id === id);
    if (!s) return;
    const start = toPx(s);
    if (pointers.current.size >= 2 && gesture.current?.id === id) {
      const [p, q] = [...pointers.current.values()];
      gesture.current = { id, mode: "pinch", start, ax: 0, ay: 0, d0: Math.hypot(q.x - p.x, q.y - p.y) || 1, a0: Math.atan2(q.y - p.y, q.x - p.x) };
      return;
    }
    if (mode === "turn") {
      gesture.current = { id, mode, start, ax: e.clientX - start.cx, ay: e.clientY - start.cy, d0: Math.hypot(e.clientX - start.cx, e.clientY - start.cy) || 1, a0: Math.atan2(e.clientY - start.cy, e.clientX - start.cx) };
    } else {
      gesture.current = { id, mode, start, ax: e.clientX, ay: e.clientY, d0: 1, a0: 0 };
    }
    setLive(start);
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const s = g.start;
    if (g.mode === "move") {
      let cx = s.cx + e.clientX - g.ax, cy = s.cy + e.clientY - g.ay;
      let sx: number | null = null, sy: number | null = null;
      if (card && cx > card.left - 30 && cx < card.left + card.width + 30 && cy > card.top - 30 && cy < card.top + card.height + 30) {
        const SNAP = 10;
        for (const x of [card.left, card.left + card.width / 2, card.left + card.width]) if (Math.abs(cx - x) < SNAP) { cx = x; sx = x; }
        for (const y of [card.top, card.top + card.height / 2, card.top + card.height]) if (Math.abs(cy - y) < SNAP) { cy = y; sy = y; }
      }
      if ((sx !== null && sx !== snap.x) || (sy !== null && sy !== snap.y)) navigator.vibrate?.(6);
      if (sx !== snap.x || sy !== snap.y) setSnap({ x: sx, y: sy });
      setLive({ ...s, cx, cy });
    } else if (g.mode === "turn") {
      const dx = e.clientX - s.cx, dy = e.clientY - s.cy;
      const k = Math.hypot(dx, dy) / g.d0;
      setLive({ ...s, w: Math.max(18, Math.min(view.w * 1.3, s.w * k)), r: s.r + (Math.atan2(dy, dx) - g.a0) * 180 / Math.PI });
    } else if (pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()];
      const k = Math.hypot(q.x - p.x, q.y - p.y) / g.d0;
      setLive({ ...s, w: Math.max(18, Math.min(view.w * 1.3, s.w * k)), r: s.r + (Math.atan2(q.y - p.y, q.x - p.x) - g.a0) * 180 / Math.PI });
    }
  };
  const end = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    if (liveRef.current) commit(liveRef.current);
    setLive(null);
    setSnap({ x: null, y: null });
    gesture.current = null;
  };

  // What can be done to the sticker that is picked.
  const selected = items.find(s => s.id === sel) ?? null;
  const duplicate = () => {
    if (!selected || items.length >= MAX_STICKERS) return;
    const id = nextId.current++;
    const b = surface(selected.on);
    setItems(list => [...list, { ...selected, id, x: selected.x + 24 / b.width, y: selected.y + 24 / b.height }]);
    setSel(id);
  };
  const mirror = () => { if (selected) setItems(list => list.map(s => (s.id === selected.id ? { ...s, f: !s.f } : s))); };
  /** Forward (1) or back (-1) among the others: later ones lie on top. */
  const restack = (dir: 1 | -1) => {
    if (!selected) return;
    setItems(list => {
      const i = list.findIndex(s => s.id === selected.id);
      const j = dir > 0 ? list.length - 1 : 0;
      if (i < 0 || i === j) return list;
      const next = list.filter(s => s.id !== selected.id);
      next.splice(dir > 0 ? Math.min(next.length, i + 1) : Math.max(0, i - 1), 0, selected);
      return next;
    });
  };

  const add = (k: StickerKind) => {
    if (items.length >= MAX_STICKERS) return;
    const id = nextId.current++;
    // Each new one a little lower and to the side, so they do not pile up.
    const n = items.length % 5;
    setItems(list => [...list, { id, k, on: "page", x: 0.5 + (n - 2) * 0.06, y: 0.42 + n * 0.035, w: START_WIDTH[k], r: 0 }]);
    setSel(id);
    setHint(false);
  };
  const remove = (id: number) => { setItems(list => list.filter(s => s.id !== id)); setSel(null); };

  const cancel = () => { if (dirty) setLeaving(true); else onCancel(); };
  const dragging = !!live && gesture.current?.mode === "move";

  return (
    <div
      onPointerDown={e => {
        // A second finger anywhere, while one holds a sticker: pinch it.
        const g = gesture.current;
        if (g && pointers.current.size >= 1) {
          try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* not a pointer the page knows */ }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [p, q] = [...pointers.current.values()];
          gesture.current = { id: g.id, mode: "pinch", start: liveRef.current ?? g.start, ax: 0, ay: 0, d0: Math.hypot(q.x - p.x, q.y - p.y) || 1, a0: Math.atan2(q.y - p.y, q.x - p.x) };
          return;
        }
        setSel(null);
      }}
      onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      style={{ position: "fixed", inset: 0, zIndex: 460, background: T.bg, touchAction: "none", overflow: "hidden", userSelect: "none" }}>
      <div ref={host} aria-hidden="true" style={{ position: "absolute", inset: 0, opacity: 0.45, pointerEvents: "none", overflow: "hidden" }} />
      {/* Where the header card is: a sticker let go inside it goes on the card. */}
      {card && (
        <div aria-hidden="true" style={{ position: "absolute", left: card.left, top: card.top, width: card.width, height: card.height, borderRadius: 22, border: `1.5px dashed ${T.textSub}`, boxSizing: "border-box", pointerEvents: "none", opacity: 0.7 }} />
      )}
      {/* The lines a sticker has clicked onto. */}
      {snap.x !== null && card && <i aria-hidden="true" style={{ position: "absolute", left: snap.x, top: card.top - 40, height: card.height + 80, width: 0, borderLeft: `1px dashed ${T.accent}`, pointerEvents: "none", zIndex: 90 }} />}
      {snap.y !== null && card && <i aria-hidden="true" style={{ position: "absolute", top: snap.y, left: card.left - 20, width: card.width + 40, height: 0, borderTop: `1px dashed ${T.accent}`, pointerEvents: "none", zIndex: 90 }} />}
      {items.map((s, order) => {
        const p = toPx(s);
        const a = stickerArt(s.k, inCard(p.cx, p.cy) ? cardTone : pageTone);
        const on = sel === s.id;
        return (
          <div key={s.id}
            onPointerDown={e => begin(e, s.id, "move")}
            style={{ position: "absolute", left: p.cx, top: p.cy, width: p.w, transform: `translate(-50%, -50%) rotate(${p.r}deg)`, touchAction: "none", cursor: "grab", zIndex: 2 + order }}>
            <img src={a.src} alt={stickerName(s.k)} draggable={false} style={{ width: "100%", height: "auto", aspectRatio: `${a.w} / ${a.h}`, display: "block", pointerEvents: "none", transform: s.f ? "scaleX(-1)" : undefined }} />
            {on && (
              <>
                <span aria-hidden="true" style={{ position: "absolute", inset: -7, border: `1.5px dashed ${T.text}`, borderRadius: 8, pointerEvents: "none" }} />
                <button aria-label={t("Remove sticker")}
                  onPointerDown={e => { e.stopPropagation(); remove(s.id); }}
                  style={{ position: "absolute", left: -19, top: -19, width: 26, height: 26, borderRadius: 13, border: "none", background: T.text, color: T.bg, display: "grid", placeItems: "center", padding: 0, cursor: "pointer" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
                <span role="button" aria-label={t("Turn and resize")}
                  onPointerDown={e => begin(e, s.id, "turn")}
                  style={{ position: "absolute", right: -18, bottom: -18, width: 24, height: 24, borderRadius: 12, background: T.text, border: `3px solid ${T.bg}`, boxSizing: "border-box", touchAction: "none", cursor: "nwse-resize" }} />
              </>
            )}
          </div>
        );
      })}

      {hint && (
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 262, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 18, padding: "9px 14px", fontSize: 13, fontWeight: 600, textAlign: "center", lineHeight: 1.4, boxShadow: "0 6px 18px rgba(0,0,0,0.3)" }}>
            {t("Tap a sticker below, then drag it onto the header card or the page.")}
          </span>
        </div>
      )}

      {/* The tray. It gets out of the way while a sticker is dragged, so the
          bottom of the page can be reached too. */}
      <div onPointerDown={e => e.stopPropagation()} style={{
        position: "absolute", left: 0, right: 0, bottom: 0, background: T.sheetBg, borderTop: `1px solid ${T.border}`,
        borderRadius: "24px 24px 0 0", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        transform: dragging ? "translateY(100%)" : "none", transition: "transform 0.2s ease", boxShadow: "0 -10px 30px rgba(0,0,0,0.25)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 10px" }}>
          <button onClick={cancel} style={{ padding: "8px 14px", borderRadius: 18, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{t("Cancel")}</button>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted }}>{t("Aviela stickers")}</span>
          <button onClick={() => (quick ? onSave(plain(items), name, false) : setSaving(true))} style={{ padding: "8px 18px", borderRadius: 18, border: "none", background: T.accent, color: T.playBtnFg, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{t("Save")}</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", overflowX: "auto", scrollbarWidth: "none", touchAction: "pan-x" }}>
          {([
            ["undo", t("Undo"), undo, history.current.length > 0, "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
            ["copy", t("Copy"), duplicate, !!selected && items.length < MAX_STICKERS, "M8 8h12v12H8zM4 16V4h12"],
            ["mirror", t("Mirror"), mirror, !!selected, "M12 3v18M8 7 3 12l5 5M16 7l5 5-5 5"],
            ["front", t("To front"), () => restack(1), !!selected, "M12 19V5M5 12l7-7 7 7"],
            ["back", t("To back"), () => restack(-1), !!selected, "M12 5v14M19 12l-7 7-7-7"],
          ] as const).map(([k, label, run, ok, d]) => (
            <button key={k} onClick={run} disabled={!ok} aria-label={label}
              style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "7px 12px", borderRadius: 16, border: `1px solid ${T.border}`, background: T.surface, color: T.text, opacity: ok ? 1 : 0.38, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: ok ? "pointer" : "default" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 14px 4px", scrollbarWidth: "none", touchAction: "pan-x" }}>
          {STICKER_KINDS.map(k => {
            const a = stickerArt(k, pageTone);
            const wide = a.w / a.h > 1.6;
            return (
              <button key={k} onClick={() => add(k)} disabled={items.length >= MAX_STICKERS}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: T.textSub, fontSize: 12, fontFamily: "inherit" }}>
                <span style={{ width: 70, height: 70, borderRadius: 16, background: T.surface, border: `1px solid ${T.border}`, display: "grid", placeItems: "center" }}>
                  <img src={a.src} alt="" draggable={false} style={{ width: wide ? 56 : undefined, height: wide ? undefined : 50, maxWidth: 58, maxHeight: 54 }} />
                </span>
                {stickerName(k)}
              </button>
            );
          })}
        </div>
      </div>

      {saving && (
        <NameDialog T={T} title={t("Save stickers")} initial={name}
          onCancel={() => setSaving(false)}
          actions={own
            ? [{ label: t("Save as new"), run: n => onSave(plain(items), n, true) }, { label: t("Save"), primary: true, run: n => onSave(plain(items), n, false) }]
            : [{ label: t("Save"), primary: true, run: n => onSave(plain(items), n, true) }]} />
      )}
      {leaving && (
        <div style={{ position: "fixed", inset: 0, zIndex: 480, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onPointerDown={e => e.stopPropagation()}>
          <div style={{ width: "100%", maxWidth: 340, background: T.sheetBg, borderRadius: 20, border: `1px solid ${T.border}`, padding: 18, boxSizing: "border-box" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{t("Leave without saving?")}</div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 8, lineHeight: 1.45 }}>{t("The stickers you moved stay as they were.")}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setLeaving(false)} style={{ padding: "10px 16px", borderRadius: 20, border: `1px solid ${T.border}`, background: "transparent", color: T.text, fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>{t("Keep editing")}</button>
              <button onClick={onCancel} style={{ padding: "10px 16px", borderRadius: 20, border: "none", background: T.accent, color: T.playBtnFg, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>{t("Leave")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
