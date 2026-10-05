import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { makeSH, cardPalette, SHADE_PREVIEW, type T, isWide, fullPage, TITLE_H } from "../themes";
import type { Theme } from "../types";
import { t } from "../i18n";
import { IC } from "./Icons";
import { MARK_PATH, Logo } from "./Logo";
import { SpinningDisc } from "./SpinningDisc";
import { usePro } from "../pro";
import {
  useLook, saveLook, previewLook, keepPreview, endPreview, isPreviewing, FREE,
  type Look, type CardShade, type VinylSkin, type DarkShade, type LightShade, type AppIcon,
} from "../look";
import { System, isDesktop } from "../plugins";

// ─── PERSONALISE (Pro) ───────────────────────────────────────────────────────
// Colour, header card and record belong to a mode: they sit in one frame with
// the Dark/Light switch on its top edge, and each mode keeps its own three. The
// app icon, below the frame, is one for both. The sheet stops short of the
// header card and does not dim it, so a change to the card shows on the real
// one.
//
// Without Pro a locked option can still be tapped: it shows everywhere as a
// preview and goes back when the sheet closes. Only the app icon cannot be
// previewed, because it is the phone's home screen, not MPTree.

type LookSheetProps = {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  /** Where the header card ends, so the sheet can start below it. */
  topGap: number;
  onNeedPro: () => void;
  onToast: (msg: string) => void;
  onClose: () => void;
  T: T;
};

// The launcher icons, drawn the way Branding/build-alt-icons.mjs draws them for
// Android. Change one, change the other.
function IconArt({ icon, size }: { icon: AppIcon; size: number }) {
  const markAt = (w: number, color: string) => {
    const off = (108 - w) / 2;
    return (
      <g transform={`translate(${off} ${off}) scale(${w / 1000})`}>
        <path d={MARK_PATH} fill={color} fillRule="evenodd" />
      </g>
    );
  };
  const rings = [];
  for (let r = 20; r <= 60; r += 2.5) rings.push(<circle key={r} cx="54" cy="54" r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.5" />);
  return (
    // The ring keeps a white icon visible on a white sheet.
    <svg width={size} height={size} viewBox="0 0 108 108" style={{ display: "block", borderRadius: "26%", boxShadow: "0 0 0 1px rgba(128,128,128,0.35)" }}>
      {icon === "classic" && <><rect width="108" height="108" fill="#000" />{markAt(52, "#fff")}</>}
      {icon === "light"   && <><rect width="108" height="108" fill="#fff" />{markAt(52, "#000")}</>}
      {icon === "vinyl"   && <>
        <rect width="108" height="108" fill="#0b0b0b" />{rings}
        <circle cx="54" cy="54" r="34" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
        <circle cx="54" cy="54" r="17" fill="#fff" />{markAt(20, "#000")}
      </>}
      {icon === "stamp"   && <>
        <rect width="108" height="108" fill="#fff" />
        <circle cx="54" cy="54" r="29" fill="#000" />{markAt(30, "#fff")}
      </>}
    </svg>
  );
}

/** A little screen in a palette: the header card, two rows, the play button. */
function Screen({ p }: { p: T }) {
  return (
    <div style={{ width: 64, height: 64, borderRadius: 12, background: p.bg, border: `1px solid ${p.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 6, right: 6, top: 6, height: 18, borderRadius: 6, background: p.playerBg, border: `1px solid ${p.border}` }} />
      <div style={{ position: "absolute", left: 9, top: 32, width: 30, height: 5, borderRadius: 3, background: p.text }} />
      <div style={{ position: "absolute", left: 9, top: 41, width: 20, height: 4, borderRadius: 2, background: p.muted }} />
      <div style={{ position: "absolute", right: 8, bottom: 8, width: 13, height: 13, borderRadius: 7, background: p.accent }} />
    </div>
  );
}

/** The header card itself, small, entirely in its own palette. */
function Card({ p }: { p: T }) {
  return (
    <div style={{ width: 92, height: 64, borderRadius: 13, background: p.playerBg, border: `1px solid ${p.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 9, top: 10, width: 12, height: 11, borderRadius: 2, background: p.text }} />
      <div style={{ position: "absolute", left: 30, top: 9, width: 36, height: 13, borderRadius: 7, background: p.surface, border: `1px solid ${p.border}` }}>
        <div style={{ position: "absolute", left: 1, top: 1, width: 17, height: 9, borderRadius: 5, background: p.accent }} />
      </div>
      <div style={{ position: "absolute", left: 9, right: 9, top: 32, height: 12, borderRadius: 4, background: p.surface, border: `1px solid ${p.border}` }} />
      <div style={{ position: "absolute", left: 9, top: 50, width: 22, height: 4, borderRadius: 2, background: p.muted }} />
    </div>
  );
}

/** The looks of the round button, in the order lib.rs numbers them. */
const BUBBLES = [
  { label: "Black",  ground: "#0b0b0d", edge: "rgba(255,255,255,0.28)", mark: "#fff" },
  { label: "White",  ground: "#fff",    edge: "rgba(0,0,0,0.22)",       mark: "#0b0b0d" },
  { label: "Record", ground: "repeating-radial-gradient(circle, #0b0b0d 0 2px, #26262b 2px 3px)", edge: "rgba(255,255,255,0.28)", mark: "#0b0b0d" },
];

function Tile({ selected, onClick, label, children, T, locked }: {
  selected: boolean; onClick: () => void; label: string; children: ReactNode; T: T; locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0,
        background: "transparent", border: "none", cursor: "pointer", padding: 0,
        fontFamily: "inherit", color: selected ? T.text : T.muted,
      }}
    >
      <div style={{
        position: "relative", borderRadius: 16, padding: 3,
        border: `2px solid ${selected ? T.accent : "transparent"}`,
        transition: "border-color 0.15s ease",
      }}>
        {children}
        {locked && (
          <span style={{ position: "absolute", right: 1, bottom: 1, width: 20, height: 20, borderRadius: 10, background: T.sheetBg, border: `1px solid ${T.border}`, display: "grid", placeItems: "center", color: T.muted }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          </span>
        )}
      </div>
      <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500, whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}

function Row({ title, aside, children, T, framed }: { title: string; aside?: ReactNode; children: ReactNode; T: T; framed?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Whether there is more to the right. A cut-off tile alone is easy to miss,
  // so the edge fades and carries an arrow until the end is reached.
  const [more, setMore] = useState(false);
  const measure = () => {
    const el = scroller.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: framed ? "0 14px" : "0 20px", marginBottom: 7 }}>
        <span style={{ ...makeSH(T).lbl, margin: 0 }}>{title}</span>
        {aside}
      </div>
      <div style={{ position: "relative" }}>
        {/* Scrolls sideways on a narrow phone rather than wrapping into a grid
            that pushes the last row off the sheet. */}
        <div ref={scroller} onScroll={measure}
          style={{ display: "flex", gap: 8, overflowX: "auto", padding: framed ? "2px 10px 4px" : "2px 16px 4px", scrollbarWidth: "none" }}>
          {children}
        </div>
        <div aria-hidden style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 56, pointerEvents: "none",
          background: `linear-gradient(to right, transparent, ${T.sheetBg} 85%)`,
          opacity: more ? 1 : 0, transition: "opacity 0.2s",
        }} />
        {more && (
          <button
            onClick={() => scroller.current?.scrollBy({ left: scroller.current.clientWidth * 0.7, behavior: "smooth" })}
            aria-label={t("More")}
            style={{
              position: "absolute", right: 8, top: 23, width: 28, height: 28, borderRadius: 14,
              display: "grid", placeItems: "center", padding: 0, cursor: "pointer",
              background: T.surface, border: `1px solid ${T.border}`, color: T.text,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            }}
          >
            <IC.ChevronR />
          </button>
        )}
      </div>
    </div>
  );
}

/** Square-crops and shrinks a picked photo to what a launcher icon uses. */
function squareIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 432;
      const c = document.createElement("canvas");
      c.width = S; c.height = S;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("no canvas")); return; }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
    img.src = url;
  });
}

export function LookSheet({ theme, onSetTheme, topGap, onNeedPro, onToast, onClose, T }: LookSheetProps) {
  const sh = makeSH(T);
  const pro = usePro();
  const look = useLook();
  const previewing = isPreviewing();
  // The round button that floats on the screen (Windows): which look it wears.
  // Kept by the app itself, not in the look, because it is a window of its own.
  const [bubble, setBubble] = useState(0);
  useEffect(() => {
    if (isDesktop) invoke<number>("shortcut_style", { style: null }).then(setBubble).catch(() => {});
  }, []);
  const pickBubble = (i: number) => {
    setBubble(i);
    invoke("shortcut_style", { style: i }).catch(() => {});
  };
  const dark = theme === "dark";
  const photoInput = useRef<HTMLInputElement>(null);
  const [icon, setIcon] = useState<AppIcon>(look.icon);

  // What the launcher actually has, which is the truth if the two ever differ.
  useEffect(() => {
    System.getAppIcon().then(r => setIcon(r.icon as AppIcon)).catch(() => {});
  }, []);

  // Bought Pro while trying something: keep what is showing.
  useEffect(() => { if (pro) keepPreview(); }, [pro]);

  const close = () => { endPreview(); onClose(); };

  /** Free picks and Pro picks are kept; the rest is shown as a preview. */
  const pick = (free: boolean, patch: Partial<Look>) => {
    if (pro || free) saveLook(patch); else previewLook(patch);
  };

  const pickIcon = async (next: AppIcon) => {
    if (next !== FREE.icon && !pro) { onNeedPro(); return; }
    if (next === icon) return;
    try {
      await System.setAppIcon({ icon: next });
      setIcon(next);
      saveLook({ icon: next });
      onToast(t("Icon changed"));
    } catch {
      onToast(t("This phone did not let MPTree change its icon"));
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await squareIcon(file);
      const r = await System.pinPhotoShortcut({ dataUrl, label: "MPTree" });
      onToast(r.supported
        ? t("Confirm on your home screen to add it")
        : t("Your home screen does not let apps add shortcuts"));
    } catch {
      onToast(t("That photo could not be read"));
    }
  };

  const DARKS: { id: DarkShade; label: string }[] = [
    { id: "classic", label: t("Black") }, { id: "amoled", label: "AMOLED" }, { id: "graphite", label: t("Graphite") },
  ];
  const LIGHTS: { id: LightShade; label: string }[] = [
    { id: "classic", label: t("White") }, { id: "paper", label: t("Paper") }, { id: "stone", label: t("Stone") },
    { id: "pink", label: t("Pink") }, { id: "sage", label: t("Sage") },
  ];
  const CARDS: { id: CardShade; label: string }[] = [
    ...DARKS.map(d => ({ id: `dark:${d.id}` as CardShade, label: d.label })),
    ...LIGHTS.map(l => ({ id: `light:${l.id}` as CardShade, label: l.label })),
  ];
  const VINYLS: { id: VinylSkin; label: string }[] = [
    { id: "classic", label: t("Black") }, { id: "white", label: t("White") },
    { id: "smoke", label: t("Smoke") }, { id: "marble", label: t("Marble") },
  ];
  const ICONS: { id: AppIcon; label: string }[] = [
    { id: "classic", label: t("Classic") }, { id: "light", label: t("Light") },
    { id: "vinyl", label: t("Record") }, { id: "stamp", label: t("Stamp") },
  ];

  // Card and record, like the colour, are the ones of the mode that is on.
  const card = dark ? look.cardDark : look.cardLight;
  const setCard = (c: CardShade) => pick(c === FREE.card, dark ? { cardDark: c } : { cardLight: c });
  const vinyl = dark ? look.vinylDark : look.vinylLight;
  const setVinyl = (v: VinylSkin) => pick(v === FREE.vinyl, dark ? { vinylDark: v } : { vinylLight: v });

  const modeSwitch = (
    <div role="radiogroup" aria-label={t("Mode")} style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 17, padding: 2, border: `1px solid ${T.border}` }}>
      {(["dark", "light"] as Theme[]).map(m => (
        <button
          key={m}
          role="radio"
          aria-checked={theme === m}
          aria-label={m === "dark" ? t("Dark") : t("Light")}
          onClick={() => onSetTheme(m)}
          style={{
            height: 30, display: "flex", alignItems: "center", gap: 6, padding: "0 13px",
            borderRadius: 15, border: "none", cursor: "pointer", fontFamily: "inherit",
            fontSize: 13, fontWeight: 700,
            background: theme === m ? T.accent : "transparent",
            color: theme === m ? T.playBtnFg : T.muted,
            transition: "background 0.2s, color 0.2s",
          }}
        >
          <span style={{ display: "grid", transform: "scale(0.78)", margin: "0 -2px" }}>{m === "dark" ? <IC.Moon /> : <IC.Sun />}</span>
          {m === "dark" ? t("Dark") : t("Light")}
        </button>
      ))}
    </div>
  );

  return (
    // No dimming: the header card above the sheet is part of what is being
    // changed, so it has to show in its real colours.
    <div style={{ position: "fixed", inset: 0, zIndex: 420, display: "flex", alignItems: isWide() ? "center" : "flex-end", justifyContent: "center" }} onClick={close}>
      <div
        style={{
          ...sh.sheet, paddingBottom: 0, height: isWide() ? "84vh" : `calc(100% - ${topGap}px)`,
          // The one sheet that does not take the whole small window: the header
          // card it changes has to stay in view above it.
          ...(fullPage() ? { height: `calc(100% - ${topGap + TITLE_H}px)`, minHeight: 0, borderRadius: "20px 20px 0 0" } : null),
          display: "flex", flexDirection: "column", boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={sh.handle} />
        <div style={{ ...sh.hdr, padding: "12px 20px 10px" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Personalise")}</span>
          <button onClick={close} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 20 }}>
          <div style={{ position: "relative", margin: "24px 12px 0", border: `1px solid ${T.border}`, borderRadius: 18, padding: "10px 0 12px" }}>
          <div style={{ position: "absolute", top: -18, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <div style={{ background: T.sheetBg, padding: "0 8px" }}>{modeSwitch}</div>
          </div>
          <Row T={T} framed title={t("Colour")}>
            {dark
              ? DARKS.map(d => (
                <Tile key={d.id} T={T} label={d.label} selected={look.dark === d.id} locked={!pro && d.id !== FREE.dark}
                  onClick={() => pick(d.id === FREE.dark, { dark: d.id })}>
                  <Screen p={SHADE_PREVIEW.dark(d.id)} />
                </Tile>
              ))
              : LIGHTS.map(l => (
                <Tile key={l.id} T={T} label={l.label} selected={look.light === l.id} locked={!pro && l.id !== FREE.light}
                  onClick={() => pick(l.id === FREE.light, { light: l.id })}>
                  <Screen p={SHADE_PREVIEW.light(l.id)} />
                </Tile>
              ))}
          </Row>

          <Row T={T} framed title={isWide() ? t("Sidebar") : t("Header card")}>
            {/* Default follows the app's colour; every other card is its own. */}
            <Tile T={T} label={t("Default")} selected={card === "default"} onClick={() => setCard("default")}>
              <Card p={T} />
            </Tile>
            {CARDS.map(c => (
              <Tile key={c.id} T={T} label={c.label} selected={card === c.id} locked={!pro} onClick={() => setCard(c.id)}>
                <Card p={cardPalette(c.id, T)} />
              </Tile>
            ))}
          </Row>

          <Row T={T} framed title={t("Record")}>
            {VINYLS.map(v => (
              <Tile key={v.id} T={T} label={v.label} selected={vinyl === v.id} locked={!pro && v.id !== FREE.vinyl}
                onClick={() => setVinyl(v.id)}>
                <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                  <SpinningDisc size={60} skin={v.id} />
                </div>
              </Tile>
            ))}
          </Row>
          </div>

          {isDesktop && (
            <Row T={T} title={t("Floating button")}>
              {BUBBLES.map((b, i) => (
                <Tile key={b.label} T={T} label={t(b.label)} selected={bubble === i} onClick={() => pickBubble(i)}>
                  <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", position: "relative",
                      background: b.ground, border: `1px solid ${b.edge}`,
                    }}>
                      {b.label === "Record" && <div style={{ position: "absolute", width: 24, height: 24, borderRadius: "50%", background: "#fff" }} />}
                      <div style={{ position: "relative", display: "flex" }}><Logo size={b.label === "Record" ? 15 : 28} color={b.mark} /></div>
                    </div>
                  </div>
                </Tile>
              ))}
            </Row>
          )}

          {/* The launcher icon is Android's to change. Windows takes its icon
              from the installed program, so there is nothing to pick here. */}
          {!isDesktop && (
          <Row T={T} title={t("App icon")}>
            {ICONS.map(i => (
              <Tile key={i.id} T={T} label={i.label} selected={icon === i.id} locked={!pro && i.id !== FREE.icon} onClick={() => pickIcon(i.id)}>
                <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}><IconArt icon={i.id} size={58} /></div>
              </Tile>
            ))}
            <Tile T={T} label={t("Your photo")} selected={false} locked={!pro} onClick={() => pro ? photoInput.current?.click() : onNeedPro()}>
              <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                <div style={{ width: 58, height: 58, borderRadius: "26%", border: `1.5px dashed ${T.muted}`, display: "grid", placeItems: "center", color: T.muted }}>
                  <IC.Photo />
                </div>
              </div>
            </Tile>
          </Row>
          )}
          <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {/* Only while a locked option is showing: the way to keep it. The
            Pro page has the free week too. */}
        {previewing && !pro && (
          <div style={{ flexShrink: 0, padding: "12px 20px 22px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={onNeedPro} style={sh.saveBtn}>
              {t("Keep it with Pro")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
