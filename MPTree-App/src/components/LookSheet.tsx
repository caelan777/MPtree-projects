import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeSH, cardPalette, SHADE_PREVIEW, type T } from "../themes";
import type { Theme } from "../types";
import { t } from "../i18n";
import { IC } from "./Icons";
import { MARK_PATH } from "./Logo";
import { SpinningDisc } from "./SpinningDisc";
import { usePro } from "../pro";
import {
  useLook, saveLook, FREE,
  type CardShade, type VinylSkin, type DarkShade, type LightShade, type AppIcon,
} from "../look";
import { System } from "../plugins";

// ─── PERSONALISE (Pro) ───────────────────────────────────────────────────────
// Colour, header card, record and app icon. Dark mode and light mode are
// personalised separately, so the switch at the top says which one you are
// changing (and shows it). Everything but the plain black and white look has
// a lock without Pro, and a locked tap opens the Pro sheet.

type LookSheetProps = {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
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
function Swatch({ p, card }: { p: T; card?: T }) {
  const c = card ?? p;
  return (
    <div style={{ width: 64, height: 64, borderRadius: 12, background: p.bg, border: `1px solid ${p.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 6, right: 6, top: 6, height: 20, borderRadius: 7, background: c.playerBg, border: `1px solid ${c.border}` }}>
        <div style={{ position: "absolute", left: 5, top: 6, width: 7, height: 7, borderRadius: 2, background: c.text }} />
        <div style={{ position: "absolute", left: 17, top: 6, width: 20, height: 7, borderRadius: 4, background: c.accent, opacity: 0.85 }} />
      </div>
      <div style={{ position: "absolute", left: 9, top: 33, width: 30, height: 5, borderRadius: 3, background: p.text }} />
      <div style={{ position: "absolute", left: 9, top: 42, width: 20, height: 4, borderRadius: 2, background: p.muted }} />
      <div style={{ position: "absolute", right: 8, bottom: 8, width: 13, height: 13, borderRadius: 7, background: p.accent }} />
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
      <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500, whiteSpace: "nowrap" }}>{label}</span>
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

export function LookSheet({ theme, onSetTheme, onNeedPro, onToast, onClose, T }: LookSheetProps) {
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

  /** Keeps a pick, or asks for Pro when it is not one of the free ones. */
  const choose = (free: boolean, apply: () => void) => {
    if (!free && !pro) { onNeedPro(); return; }
    apply();
  };

  const pickIcon = (next: AppIcon) => choose(next === FREE.icon, async () => {
    if (next === icon) return;
    try {
      await System.setAppIcon({ icon: next });
      setIcon(next);
      saveLook({ icon: next });
      onToast(t("Icon changed. Your home screen can take a few seconds to catch up."));
    } catch {
      onToast(t("This phone did not let MPTree change its icon"));
    }
  });

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
    { id: "classic", label: t("Black") }, { id: "amoled", label: "AMOLED" },
    { id: "graphite", label: t("Graphite") }, { id: "purple", label: t("Purple") },
  ];
  const LIGHTS: { id: LightShade; label: string }[] = [
    { id: "classic", label: t("White") }, { id: "paper", label: t("Paper") }, { id: "stone", label: t("Stone") },
    { id: "pink", label: t("Pink") }, { id: "sage", label: t("Sage") },
  ];
  const CARDS: { id: CardShade; label: string }[] = [
    { id: "default", label: t("Default") },
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

  const card = dark ? look.cardDark : look.cardLight;
  const appPalette = dark ? SHADE_PREVIEW.dark(look.dark) : SHADE_PREVIEW.light(look.light);

  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={onClose}>
      <div style={{ ...sh.sheet, paddingBottom: 0, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Personalise")}</span>
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        {/* Which mode is being personalised. Switching it switches the app,
            so what you change is what you see. */}
        <div style={{ padding: "0 20px" }}>
          <div role="radiogroup" aria-label={t("Mode")} style={{ display: "flex", gap: 4, background: T.surface, borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
            {(["dark", "light"] as Theme[]).map(m => (
              <button
                key={m}
                role="radio"
                aria-checked={theme === m}
                onClick={() => onSetTheme(m)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  padding: "9px 0", borderRadius: 9, border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontWeight: 700, fontSize: 14,
                  background: theme === m ? T.accent : "transparent",
                  color: theme === m ? T.playBtnFg : T.muted,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {m === "dark" ? <IC.Moon /> : <IC.Sun />}
                {m === "dark" ? t("Dark mode") : t("Light mode")}
              </button>
            ))}
          </div>
        </div>

        {!pro && (
          <div style={{ margin: "14px 20px 0", padding: "11px 14px", borderRadius: 12, background: T.dim, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, fontSize: 13, color: T.textSub, lineHeight: 1.45 }}>
              {t("Everything with a lock comes with MPTree Pro.")}
            </span>
            <button onClick={onNeedPro} style={{ flexShrink: 0, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 18, padding: "8px 13px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              {t("Get Pro")}
            </button>
          </div>
        )}

        <div style={{ overflowY: "auto", paddingBottom: 28 }}>
          <Row T={T} title={dark ? t("Dark mode colour") : t("Light mode colour")}>
            {dark
              ? DARKS.map(d => (
                <Tile key={d.id} T={T} label={d.label} selected={look.dark === d.id} locked={!pro && d.id !== FREE.dark}
                  onClick={() => choose(d.id === FREE.dark, () => saveLook({ dark: d.id }))}>
                  <Swatch p={SHADE_PREVIEW.dark(d.id)} />
                </Tile>
              ))
              : LIGHTS.map(l => (
                <Tile key={l.id} T={T} label={l.label} selected={look.light === l.id} locked={!pro && l.id !== FREE.light}
                  onClick={() => choose(l.id === FREE.light, () => saveLook({ light: l.id }))}>
                  <Swatch p={SHADE_PREVIEW.light(l.id)} />
                </Tile>
              ))}
          </Row>

          <Row T={T} title={t("Header card")} sub={t("The card at the top can have a colour of its own, from either mode.")}>
            {CARDS.map(c => (
              <Tile key={c.id} T={T} label={c.label} selected={card === c.id} locked={!pro && c.id !== FREE.card}
                onClick={() => choose(c.id === FREE.card, () => saveLook(dark ? { cardDark: c.id } : { cardLight: c.id }))}>
                <Swatch p={appPalette} card={cardPalette(c.id, appPalette)} />
              </Tile>
            ))}
          </Row>

          <Row T={T} title={t("Record")} sub={t("Tap the record in the player to put the song's cover on it.")}>
            {VINYLS.map(v => (
              <Tile key={v.id} T={T} label={v.label} selected={look.vinyl === v.id} locked={!pro && v.id !== FREE.vinyl}
                onClick={() => choose(v.id === FREE.vinyl, () => saveLook({ vinyl: v.id }))}>
                <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                  <SpinningDisc size={60} skin={v.id} />
                </div>
              </Tile>
            ))}
          </Row>

          <Row T={T} title={t("App icon")} sub={t("Changes the icon on your home screen.")}>
            {ICONS.map(i => (
              <Tile key={i.id} T={T} label={i.label} selected={icon === i.id} locked={!pro && i.id !== FREE.icon} onClick={() => pickIcon(i.id)}>
                <IconArt icon={i.id} size={60} />
              </Tile>
            ))}
            <Tile T={T} label={t("Your photo")} selected={false} locked={!pro} onClick={() => choose(false, () => photoInput.current?.click())}>
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
