import type { T } from "../themes";
import { t } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { ProTag } from "./SettingsSheet";

// ─── WIDGETS ─────────────────────────────────────────────────────────────────
// The four home-screen widgets, and a way to place one without knowing where
// a phone keeps its widget list. The plain one is for everyone and comes in
// black or white; the other three are part of Pro and wear the look chosen in
// Personalise. What they look like is drawn on the Android side (Widgets.java).

export type WidgetKind = "basic" | "vinyl" | "pod" | "player";
export type WidgetBasic = "black" | "white";

const WIDGETS: { kind: WidgetKind; name: string; sub: string; pro: boolean }[] = [
  { kind: "basic",  name: "Plain",         sub: "Title, artist and the three buttons.",              pro: false },
  { kind: "vinyl",  name: "Record",        sub: "A record with the cover as its label.",             pro: true },
  { kind: "pod",    name: "Pocket player", sub: "A small player with a click wheel.",                pro: true },
  { kind: "player", name: "Player",        sub: "The cover, how far the song is, and the buttons.",  pro: true },
];

export function WidgetsSheet({ pro, basic, onSetBasic, onPin, onOpenPro, onClose, T }: {
  pro: boolean;
  basic: WidgetBasic;
  onSetBasic: (v: WidgetBasic) => void;
  onPin: (kind: WidgetKind) => void;
  onOpenPro: () => void;
  onClose: () => void;
  T: T;
}) {
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {WIDGETS.map(w => (
          <div key={w.kind} style={{ background: T.dim, borderRadius: 12, padding: "13px 14px 13px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
