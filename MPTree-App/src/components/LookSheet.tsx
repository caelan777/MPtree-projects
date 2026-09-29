import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeSH, cardSkinStyle, SHADE_PREVIEW, type T } from "../themes";
import type { Theme } from "../types";
import { t } from "../i18n";
import { IC } from "./Icons";
import { MARK_PATH } from "./Logo";
import { SpinningDisc } from "./SpinningDisc";
import { usePro } from "../pro";
import {
  useLook, saveLook, previewLook, endPreview, getLook,
  type Look, type CardSkin, type VinylSkin, type DarkShade, type LightShade, type AppIcon,
} from "../look";
import { System } from "../plugins";

// ─── PERSONALISE (Pro) ───────────────────────────────────────────────────────
// Shade, header card, record and app icon. Everything can be tried without Pro:
// a pick shows at once, all over the app, and without Pro it is put back when
// this sheet closes. The app icon is the exception, because changing it is a
// change to the phone's home screen, not to MPTree.

type LookSheetProps = {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  /** The colour of what is playing, for the "cover" card preview. */
  tint: string | null;
  /** The cover of what is playing, for the picture disc preview. */
  cover?: string;
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
    <svg width={size} height={size} viewBox="0 0 108 108" style={{ display: "block", borderRadius: "26%" }}>
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

/** A small header card with the skin on it: the logo, the tabs, a search bar. */
function CardArt({ skin, T, dark, tint }: { skin: CardSkin; T: T; dark: boolean; tint: string | null }) {
  const st = cardSkinStyle(skin, T, dark, tint);
  return (
    <div style={{ position: "relative", width: 96, height: 60, borderRadius: 12, overflow: "hidden", background: T.bg }}>
      {/* A few rows under the card, so glass has something to show through. */}
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{ position: "absolute", left: 8, right: 8, top: 10 + i * 14, height: 8, borderRadius: 3, background: i % 2 ? T.dim : T.muted + "88" }} />
      ))}
      <div style={{ position: "absolute", left: 5, right: 5, top: 5, height: 34, borderRadius: 9, ...st, boxShadow: st.boxShadow === "none" ? "none" : "0 3px 10px rgba(0,0,0,0.35)" }}>
        <div style={{ position: "absolute", left: 7, top: 6, width: 9, height: 9, borderRadius: 2, background: T.text }} />
        <div style={{ position: "absolute", left: 32, top: 6, width: 30, height: 9, borderRadius: 5, background: T.accent, opacity: 0.85 }} />
        <div style={{ position: "absolute", left: 7, right: 7, top: 20, height: 8, borderRadius: 3, background: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }} />
      </div>
    </div>
  );
}

function Tile({ selected, onClick, label, children, T, locked }: {
  selected: boolean; onClick: () => void; label: string; children: ReactNode; T: T; locked?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 7, flexShrink: 0,
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
          <span style={{ position: "absolute", right: 2, bottom: 2, width: 20, height: 20, borderRadius: 10, background: T.sheetBg, border: `1px solid ${T.border}`, display: "grid", placeItems: "center", color: T.muted }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          </span>
        )}
      </div>
      <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500 }}>{label}</span>
    </button>
  );
}

function Row({ title, sub, children, T }: { title: string; sub?: string; children: ReactNode; T: T }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ padding: "0 20px", ...makeSH(T).lbl, marginTop: 0 }}>{title}</div>
      {sub && <div style={{ padding: "0 20px", fontSize: 12, color: T.muted, marginTop: -3, marginBottom: 8, lineHeight: 1.45 }}>{sub}</div>}
      {/* Scrolls sideways on a narrow phone rather than wrapping into a grid
          that pushes the last row off the sheet. */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "2px 16px 4px", scrollbarWidth: "none" }}>
        {children}
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

export function LookSheet({ theme, onSetTheme, tint, cover, onNeedPro, onToast, onClose, T }: LookSheetProps) {
  const sh = makeSH(T);
  const pro = usePro();
  const look = useLook();
  const dark = theme === "dark";
  const photoInput = useRef<HTMLInputElement>(null);
  const [icon, setIcon] = useState<AppIcon>(look.icon);

  // What the launcher actually has, which is the truth if the two ever differ.
  useEffect(() => {
    System.getAppIcon().then(r => setIcon(r.icon as AppIcon)).catch(() => {});
  }, []);

  // Buying Pro with a preview showing keeps what is showing.
  useEffect(() => {
    if (pro) saveLook({ ...getLook() });
  }, [pro]);

  const close = () => {
    if (!pro) endPreview();
    onClose();
  };

  const pick = (patch: Partial<Look>) => {
    if (pro) saveLook(patch); else previewLook(patch);
  };

  const pickShade = (ground: Theme, patch: Partial<Look>) => {
    pick(patch);
    // Picking a light shade in dark mode would change nothing you can see.
    if (ground !== theme) onSetTheme(ground);
  };

  const pickIcon = async (next: AppIcon) => {
    if (!pro) { onNeedPro(); return; }
    if (next === icon) return;
    try {
      await System.setAppIcon({ icon: next });
      setIcon(next);
      saveLook({ icon: next });
      onToast(t("Icon changed. Your home screen can take a few seconds to catch up."));
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
  ];
  const CARDS: { id: CardSkin; label: string }[] = [
    { id: "solid", label: t("Solid") }, { id: "glass", label: t("Glass") }, { id: "line", label: t("Line") },
    { id: "float", label: t("Floating") }, { id: "cover", label: t("Cover colour") },
  ];
  const VINYLS: { id: VinylSkin; label: string }[] = [
    { id: "classic", label: t("Black") }, { id: "white", label: t("White") }, { id: "smoke", label: t("Smoke") },
    { id: "marble", label: t("Marble") }, { id: "picture", label: t("Picture disc") },
  ];
  const ICONS: { id: AppIcon; label: string }[] = [
    { id: "classic", label: t("Classic") }, { id: "light", label: t("Light") },
    { id: "vinyl", label: t("Record") }, { id: "stamp", label: t("Stamp") },
  ];

  const swatch = (p: T) => (
    <div style={{ width: 64, height: 64, borderRadius: 12, background: p.bg, border: `1px solid ${p.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 7, right: 7, top: 7, height: 18, borderRadius: 6, background: p.playerBg, border: `1px solid ${p.border}` }} />
      <div style={{ position: "absolute", left: 9, top: 32, width: 30, height: 5, borderRadius: 3, background: p.text }} />
      <div style={{ position: "absolute", left: 9, top: 41, width: 20, height: 4, borderRadius: 2, background: p.muted }} />
      <div style={{ position: "absolute", right: 8, bottom: 8, width: 14, height: 14, borderRadius: 7, background: p.accent }} />
    </div>
  );

  const discSize = 64;

  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={close}>
      <div style={{ ...sh.sheet, paddingBottom: 0, maxHeight: "86vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Personalise")}</span>
          <button onClick={close} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        {!pro && (
          <div style={{ margin: "0 20px", padding: "12px 14px", borderRadius: 12, background: T.dim, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, fontSize: 13, color: T.textSub, lineHeight: 1.45 }}>
              {t("Try anything. Without Pro it goes back when you close this.")}
            </span>
            <button onClick={onNeedPro} style={{ flexShrink: 0, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 18, padding: "8px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {t("Keep it")}
            </button>
          </div>
        )}

        <div style={{ overflowY: "auto", paddingBottom: 28 }}>
          <Row T={T} title={t("Dark mode")}>
            {DARKS.map(d => (
              <Tile key={d.id} T={T} label={d.label} selected={dark && look.dark === d.id} onClick={() => pickShade("dark", { dark: d.id })}>
                {swatch(SHADE_PREVIEW.dark(d.id))}
              </Tile>
            ))}
          </Row>
          <Row T={T} title={t("Light mode")}>
            {LIGHTS.map(l => (
              <Tile key={l.id} T={T} label={l.label} selected={!dark && look.light === l.id} onClick={() => pickShade("light", { light: l.id })}>
                {swatch(SHADE_PREVIEW.light(l.id))}
              </Tile>
            ))}
          </Row>

          <Row T={T} title={t("Header card")} sub={look.card === "cover" && !tint ? t("Takes its colour from the cover of what is playing.") : undefined}>
            {CARDS.map(c => (
              <Tile key={c.id} T={T} label={c.label} selected={look.card === c.id} onClick={() => pick({ card: c.id })}>
                <CardArt skin={c.id} T={T} dark={dark} tint={tint ?? "rgb(96, 128, 160)"} />
              </Tile>
            ))}
          </Row>

          <Row T={T} title={t("Record")} sub={look.vinyl === "picture" && !cover ? t("Play a song with a cover to see it as a picture disc.") : undefined}>
            {VINYLS.map(v => (
              <Tile key={v.id} T={T} label={v.label} selected={look.vinyl === v.id} onClick={() => pick({ vinyl: v.id })}>
                <div style={{ width: discSize, height: discSize, display: "grid", placeItems: "center" }}>
                  <SpinningDisc size={discSize - 4} skin={v.id} customPhoto={v.id === "picture" ? cover : undefined} />
                </div>
              </Tile>
            ))}
          </Row>

          <Row T={T} title={t("App icon")} sub={t("Changes the icon on your home screen.")}>
            {ICONS.map(i => (
              <Tile key={i.id} T={T} label={i.label} selected={icon === i.id} locked={!pro && i.id !== "classic"} onClick={() => pickIcon(i.id)}>
                <IconArt icon={i.id} size={60} />
              </Tile>
            ))}
            <Tile T={T} label={t("Your photo")} selected={false} locked={!pro} onClick={() => pro ? photoInput.current?.click() : onNeedPro()}>
              <div style={{ width: 60, height: 60, borderRadius: "26%", border: `1.5px dashed ${T.muted}`, display: "grid", placeItems: "center", color: T.muted }}>
                <IC.Photo />
              </div>
            </Tile>
          </Row>
          <div style={{ padding: "8px 20px 0", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            {t("Your photo adds a second MPTree icon to your home screen. Android does not let apps put a photo on their real icon, so some phones show a small MPTree badge on it.")}
          </div>
          <input ref={photoInput} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>
    </div>
  );
}
