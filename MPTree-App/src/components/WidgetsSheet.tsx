import type { ReactNode } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { ProTag } from "./SettingsSheet";

// ─── WIDGETS ─────────────────────────────────────────────────────────────────
// The four home-screen widgets, and a way to place one without knowing where
// a phone keeps its widget list. The plain one is for everyone and comes in
// black or white; the other three are part of Pro and wear the look chosen in
// Personalise.
//
// The real ones are drawn on the Android side (Widgets.java and the layouts
// in res/layout). The pictures here are that drawing done again in the
// window, so a widget can be seen before it is placed. Keep the two in step.

export type WidgetKind = "basic" | "vinyl" | "pod" | "player";
export type WidgetBasic = "black" | "white";

const WIDGETS: { kind: WidgetKind; name: string; sub: string; pro: boolean }[] = [
  { kind: "basic",  name: "Plain",         sub: "Title, artist and the three buttons.",              pro: false },
  { kind: "vinyl",  name: "Record",        sub: "A record with the cover as its label.",             pro: true },
  { kind: "pod",    name: "Pocket player", sub: "A small player with a click wheel.",                pro: true },
  { kind: "player", name: "Player",        sub: "The cover, how far the song is, and the buttons.",  pro: true },
];

// ── The pictures ─────────────────────────────────────────────────────────────

type Ink = { card: string; bg: string; text: string; muted: string };

const Glyph = ({ d, size, color }: { d: string; size: number; color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ flexShrink: 0 }}><path d={d} /></svg>
);
const PREV = "M6 6h2v12H6zM9.5 12l8.5 6V6z";
const NEXT = "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z";
const PLAY = "M8 5v14l11-7z";
const NOTE = "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z";

/** Where a cover goes. There is no song to show here, so it is a note. */
const Cover = ({ size, radius, ink }: { size: number; radius: number | string; ink: Ink }) => (
  <div style={{ width: size, height: size, borderRadius: radius, background: ink.muted, opacity: 0.9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <Glyph d={NOTE} size={size * 0.5} color={ink.card} />
  </div>
);

const Words = ({ ink, title = 13, artist = 11 }: { ink: Ink; title?: number; artist?: number }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontSize: title, fontWeight: 700, color: ink.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("Title")}</div>
    <div style={{ fontSize: artist, color: ink.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("Artist")}</div>
  </div>
);

function BasicPreview({ white }: { white: boolean }) {
  const ink: Ink = white
    ? { card: "#ffffff", bg: "#ffffff", text: "#111111", muted: "#666666" }
    : { card: "#000000", bg: "#000000", text: "#ffffff", muted: "#b3b3b3" };
  return (
    <div style={{ width: "100%", maxWidth: 280, height: 54, borderRadius: 20, background: ink.card, display: "flex", alignItems: "center", gap: 10, padding: "0 12px 0 16px", boxSizing: "border-box" }}>
      <Words ink={ink} />
      <Glyph d={PREV} size={20} color={ink.text} />
      <Glyph d={PLAY} size={24} color={ink.text} />
      <Glyph d={NEXT} size={20} color={ink.text} />
    </div>
  );
}

function VinylPreview({ ink }: { ink: Ink }) {
  const corner = (side: "left" | "right", d: string) => (
    <div style={{ position: "absolute", bottom: 0, [side]: 0, width: 30, height: 30, borderRadius: "50%", background: ink.card, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Glyph d={d} size={16} color={ink.text} />
    </div>
  );
  return (
    <div style={{ position: "relative", width: 112, height: 112 }}>
      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "repeating-radial-gradient(circle, #0b0b0d 0 3px, #1f1f24 3px 4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Cover size={46} radius="50%" ink={{ ...ink, muted: "#ededed", card: "#0b0b0d" }} />
      </div>
      {corner("left", PREV)}
      {corner("right", NEXT)}
    </div>
  );
}

function PodPreview({ ink }: { ink: Ink }) {
  const at = (style: React.CSSProperties, node: ReactNode) => (
    <div style={{ position: "absolute", display: "flex", ...style }}>{node}</div>
  );
  return (
    <div style={{ width: 112, height: 168, borderRadius: 20, background: ink.card, padding: 9, boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ alignSelf: "stretch", flex: 1, borderRadius: 10, background: ink.bg, display: "flex", alignItems: "center", gap: 6, padding: "0 6px", minHeight: 0 }}>
        <Cover size={28} radius={5} ink={ink} />
        <Words ink={ink} title={10} artist={9} />
      </div>
      <div style={{ position: "relative", width: 86, height: 86, borderRadius: "50%", background: ink.bg, flexShrink: 0 }}>
        {at({ top: 7, left: 0, right: 0, justifyContent: "center", fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", color: ink.muted }, "MENU")}
        {at({ left: 7, top: 0, bottom: 0, alignItems: "center" }, <Glyph d={PREV} size={13} color={ink.muted} />)}
        {at({ right: 7, top: 0, bottom: 0, alignItems: "center" }, <Glyph d={NEXT} size={13} color={ink.muted} />)}
        {at({ bottom: 6, left: 0, right: 0, justifyContent: "center" }, <Glyph d={PLAY} size={13} color={ink.muted} />)}
        {at({ inset: 0, alignItems: "center", justifyContent: "center" }, <div style={{ width: 32, height: 32, borderRadius: "50%", background: ink.card }} />)}
      </div>
    </div>
  );
}

function PlayerPreview({ ink }: { ink: Ink }) {
  return (
    <div style={{ width: "100%", maxWidth: 280, borderRadius: 22, background: ink.card, padding: 14, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Cover size={58} radius={9} ink={ink} />
        <Words ink={ink} title={15} artist={12} />
      </div>
      <div style={{ height: 4, borderRadius: 2, background: ink.bg, marginTop: 12, overflow: "hidden" }}>
        <div style={{ width: "38%", height: "100%", background: ink.text }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: ink.muted, marginTop: 4 }}>
        <span>1:12</span><span>3:08</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 2 }}>
        <Glyph d={PREV} size={22} color={ink.text} />
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: ink.text, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Glyph d={PLAY} size={20} color={ink.card} />
        </div>
        <Glyph d={NEXT} size={22} color={ink.text} />
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function WidgetsSheet({ pro, basic, onSetBasic, onPin, onOpenPro, onClose, T }: {
  pro: boolean;
  basic: WidgetBasic;
  onSetBasic: (v: WidgetBasic) => void;
  onPin: (kind: WidgetKind) => void;
  onOpenPro: () => void;
  onClose: () => void;
  T: T;
}) {
  // The colours the Pro widgets are given (App.tsx writes the same four).
  const ink: Ink = { card: T.card, bg: T.bg, text: T.text, muted: T.muted };

  const picture = (kind: WidgetKind) =>
    kind === "basic" ? <BasicPreview white={basic === "white"} />
    : kind === "vinyl" ? <VinylPreview ink={ink} />
    : kind === "pod" ? <PodPreview ink={ink} />
    : <PlayerPreview ink={ink} />;

  const choice = (v: WidgetBasic, name: string) => (
    <button
      onClick={() => onSetBasic(v)}
      aria-pressed={basic === v}
      style={{
        flex: 1, padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
        fontSize: 13.5, fontWeight: 700,
        background: basic === v ? T.accent : "transparent", color: basic === v ? T.playBtnFg : T.muted,
      }}
    >
      {name}
    </button>
  );

  return (
    <InfoSheet title={t("Widgets")} onClose={onClose} T={T}>
      <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 14 }}>
        {t("Put MPTree on your home screen.")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {WIDGETS.map(w => (
          <div key={w.kind} style={{ background: T.dim, borderRadius: 14, padding: 12 }}>
            {/* The home screen it will sit on is not ours to know; a quiet
                panel stands in for it. */}
            <div
              aria-hidden="true"
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 12px", display: "flex", justifyContent: "center" }}
            >
              {picture(w.kind)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, paddingLeft: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: T.text }}>
                  {t(w.name)}
                  {w.pro && !pro && <ProTag T={T} />}
                </div>
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.45, marginTop: 2 }}>{t(w.sub)}</div>
              </div>
              <button
                onClick={() => (w.pro && !pro ? onOpenPro() : onPin(w.kind))}
                style={{
                  flexShrink: 0, padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: 700, background: "transparent", color: T.text, border: `1px solid ${T.border}`,
                }}
              >
                {t("Add")}
              </button>
            </div>
            {w.kind === "basic" && (
              <div style={{ display: "flex", gap: 4, background: T.surface, borderRadius: 11, padding: 3, marginTop: 12 }}>
                {choice("black", t("Black"))}
                {choice("white", t("White"))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginTop: 14 }}>
        {t("The Pro widgets follow the look you chose in Personalise.")}
      </div>
    </InfoSheet>
  );
}
