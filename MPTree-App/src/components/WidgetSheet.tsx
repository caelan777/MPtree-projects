import type { T } from "../themes";
import { t } from "../i18n";
import { System } from "../plugins";
import { Logo } from "./Logo";
import { useWidget, saveWidget, WIDGET_KINDS, WIDGET_COLOURS, PRO_KINDS, type WidgetKind, type WidgetColour } from "../widget";
import { LOCK_RED } from "./lockRed";

// ─── HOME SCREEN WIDGET ──────────────────────────────────────────────────────
// Settings, Home screen widget: which of the four widgets to add, their colour,
// and the button that asks the phone to put the chosen one on the home screen.
// Card and Record, and Clear, are part of Pro. The widgets themselves are
// native (WidgetRenderer.java); the drawing here only shows what they look like.

export const widgetName = (k: WidgetKind): string =>
  k === "bar" ? t("Bar") : k === "card" ? t("Card") : k === "record" ? t("Record") : t("Pill");
export const widgetColourName = (c: WidgetColour): string =>
  c === "app" ? t("Same as app") : c === "black" ? t("Black") : c === "white" ? t("White") : t("Clear");
const SIZE: Record<WidgetKind, string> = { bar: "4 × 1", card: "4 × 2", record: "2 × 2", pill: "2 × 1" };

type Pal = { bg: string; text: string; sub: string; accent: string; accentFg: string; border: string };
function palette(c: WidgetColour, T: T): Pal {
  if (c === "black") return { bg: "#111111", text: "#ffffff", sub: "#9a9a9a", accent: "#ffffff", accentFg: "#000000", border: "#2a2a2a" };
  if (c === "white") return { bg: "#ffffff", text: "#111111", sub: "#666666", accent: "#111111", accentFg: "#ffffff", border: "#e2e2e2" };
  // Glass: see-through, lit at the top edge, with a line of light round it.
  if (c === "clear") return { bg: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.10))", text: "#ffffff", sub: "#ececec", accent: "#ffffff", accentFg: "#000000", border: "rgba(255,255,255,0.45)" };
  return { bg: T.playerBg ?? T.bg, text: T.text, sub: T.textSub, accent: T.accent, accentFg: T.playBtnFg, border: T.border };
}

const Play = ({ size, p }: { size: number; p: Pal }) => (
  <span style={{ width: size, height: size, borderRadius: size / 2, background: p.accent, display: "grid", placeItems: "center", flexShrink: 0 }}>
    <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill={p.accentFg} aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
  </span>
);
const Skip = ({ p, back }: { p: Pal; back?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={p.text} aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d={back ? "M6 5h2v14H6zM20 5v14L9 12z" : "M16 5h2v14h-2zM4 5l11 7-11 7z"} />
  </svg>
);
const Lines = ({ p, w = 90 }: { p: Pal; w?: number }) => (
  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
    <i style={{ display: "block", width: w, maxWidth: "100%", height: 8, borderRadius: 4, background: p.text, opacity: 0.9 }} />
    <i style={{ display: "block", width: w * 0.6, maxWidth: "70%", height: 6, borderRadius: 3, background: p.sub, opacity: 0.8 }} />
  </span>
);
const Cover = ({ size, p, on, radius }: { size: number; p: Pal; on: boolean; radius: number }) => (
  <span style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "grid", placeItems: "center", overflow: "hidden",
    background: on ? "linear-gradient(135deg, #e8e2d6, #b9b2a5)" : p.accent }}>
    {on
      ? <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.6" aria-hidden="true"><path d="M12 3 4 12l8 9 8-9z M12 3v18" /></svg>
      : <Logo size={size * 0.5} color={p.accentFg} />}
  </span>
);

/** The widget drawn small, the way the home screen will show it. */
function Preview({ kind, p, cover }: { kind: WidgetKind; p: Pal; cover: boolean }) {
  const box = { background: p.bg, border: `1px solid ${p.border}`, boxSizing: "border-box" as const, boxShadow: p.border.startsWith("rgba") ? "0 8px 24px rgba(0,0,0,0.25)" : undefined };
  if (kind === "bar") return (
    <div style={{ ...box, width: 300, height: 70, borderRadius: 24, display: "flex", alignItems: "center", gap: 12, padding: "0 12px" }}>
      <Cover size={46} p={p} on={cover} radius={11} /><Lines p={p} /><Skip p={p} back /><Play size={40} p={p} /><Skip p={p} />
    </div>
  );
  if (kind === "card") return (
    <div style={{ ...box, width: 300, height: 150, borderRadius: 26, display: "flex", gap: 14, padding: 14 }}>
      <Cover size={96} p={p} on={cover} radius={15} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Lines p={p} w={110} />
        <span style={{ display: "block", height: 3, borderRadius: 2, background: p.sub, opacity: 0.35, marginTop: 14, position: "relative" }}>
          <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "34%", borderRadius: 2, background: p.text }} />
        </span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: "auto" }}><Skip p={p} back /><Play size={42} p={p} /><Skip p={p} /></span>
      </div>
    </div>
  );
  if (kind === "record") return (
    <div style={{ ...box, width: 150, height: 156, borderRadius: 26, padding: "10px 12px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center", background: cover ? "linear-gradient(135deg, #e8e2d6, #b9b2a5)" : "#111111", boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.3)" }}>
        <span style={{ width: 28, height: 28, borderRadius: 14, background: "#ffffff", display: "grid", placeItems: "center" }}><Logo size={15} color="#000000" /></span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginTop: 9 }}><Lines p={p} w={70} /><Play size={32} p={p} /></span>
    </div>
  );
  return (
    <div style={{ ...box, width: 150, height: 70, borderRadius: 35, display: "flex", alignItems: "center", gap: 10, padding: "0 14px 0 12px" }}>
      <Play size={44} p={p} /><Lines p={p} w={60} />
    </div>
  );
}

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={LOCK_RED} strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

export function WidgetSheet({ T, pro, onNeedPro, onClose, onToast }: { T: T; pro: boolean; onNeedPro: () => void; onClose: () => void; onToast?: (m: string) => void }) {
  const cfg = useWidget();
  const p = palette(cfg.colour, T);
  const lockedKind = (k: WidgetKind) => !pro && PRO_KINDS.includes(k);
  const lockedColour = (c: WidgetColour) => !pro && c === "clear";
  // A locked one can be looked at; adding it is what asks for Pro.
  const add = async () => {
    if (lockedKind(cfg.kind) || lockedColour(cfg.colour)) { onNeedPro(); return; }
    const r = await System.pinWidget({ kind: cfg.kind }).catch(() => ({ supported: false }));
    if (!r.supported) onToast?.(t("Your phone can't add it from here. Hold your home screen, tap Widgets and find MPTree."));
    else onToast?.(t("Your phone shows the widget. Tap Add."));
  };
  const lbl = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.muted, padding: "18px 20px 8px" };
  // The wallpaper behind the preview: the clear widget needs one to be seen.
  const wall = "radial-gradient(130% 120% at 20% 10%, #4d4d4d 0%, #1c1c1c 55%, #050505 100%)";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 430, background: T.sheetBg, color: T.text, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Its own page over Settings, closed with an X like Personalise. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 20px 10px" }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{t("Home screen widget")}</span>
        <button onClick={onClose} aria-label={t("Close")} style={{ background: "transparent", border: "none", color: T.muted, padding: 4, cursor: "pointer", display: "flex" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        <div style={{ margin: "4px 16px 0", height: 200, borderRadius: 22, background: wall, display: "grid", placeItems: "center", overflow: "hidden" }}>
          <Preview kind={cfg.kind} p={p} cover />
        </div>

        <div style={lbl}>{t("Widget")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px" }}>
          {WIDGET_KINDS.map(k => {
            const on = cfg.kind === k;
            const [w, h] = k === "bar" ? [84, 21] : k === "card" ? [84, 42] : k === "record" ? [42, 42] : [42, 21];
            return (
              <button key={k} onClick={() => saveWidget({ kind: k })} aria-pressed={on}
                style={{ height: 100, borderRadius: 16, background: T.surface, border: `2px solid ${on ? T.accent : "transparent"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", fontFamily: "inherit", color: T.text }}>
                <span style={{ display: "block", width: w, height: h, borderRadius: Math.min(w, h) / 3, background: on ? T.accent : T.dim }} />
                <span style={{ fontSize: 14, fontWeight: on ? 700 : 600, display: "flex", alignItems: "center", gap: 5 }}>{widgetName(k)} <span style={{ color: T.muted, fontWeight: 500, fontSize: 12 }}>{SIZE[k]}</span>{lockedKind(k) && <Lock />}</span>
              </button>
            );
          })}
        </div>

        <div style={lbl}>{t("Colour")}</div>
        <div role="radiogroup" aria-label={t("Colour")} style={{ display: "flex", gap: 4, margin: "0 16px", padding: 4, borderRadius: 22, background: T.surface, border: `1px solid ${T.border}` }}>
          {WIDGET_COLOURS.map(c => {
            const on = cfg.colour === c;
            return (
              <button key={c} role="radio" aria-checked={on} onClick={() => saveWidget({ colour: c })}
                style={{ flex: 1, padding: "9px 0", borderRadius: 18, border: "none", background: on ? T.accent : "transparent", color: on ? T.playBtnFg : T.textSub, fontSize: 13, fontWeight: on ? 700 : 600, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{widgetColourName(c)}{lockedColour(c) && <Lock />}</span>
              </button>
            );
          })}
        </div>

        <button onClick={add}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "calc(100% - 32px)", margin: "18px 16px 0", height: 52, borderRadius: 26, background: T.accent, color: T.playBtnFg, border: "none", fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          {t("Add {widget} to home screen", { widget: widgetName(cfg.kind) })}
        </button>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
