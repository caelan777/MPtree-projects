import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { makeSH, cardPalette, SHADE_PREVIEW, type T, isWide, fullPage } from "../themes";
import type { Theme } from "../types";
import { t } from "../i18n";
import { IC } from "./Icons";
import { Logo } from "./Logo";
import { SpinningDisc } from "./SpinningDisc";
import { usePro } from "../pro";
import {
  useLook, saveLook, previewLook, keepPreview, endPreview, isPreviewing, setLookBack, FREE, FLOWER_RECORDS, FLOWER_KINDS, AVIELA_CARDS,
  type Look, type CardShade, type VinylSkin, type DarkShade, type LightShade, type FlowerRecord, type Flowers,
} from "../look";
import { isDesktop } from "../plugins";
import { groundFlowers, cardFlowers, cornerFlowers, logoFlower, toneOf, type Tone } from "../flowers";

// ─── PERSONALISE (Pro) ───────────────────────────────────────────────────────
// Laid out the way Android's own "Wallpaper & style" is: what MPTree will look
// like at the top, and under it two tabs. Styles are whole looks, picked with
// one tap. Custom has every choice on its own, in groups: colour, header card,
// record.
//
// Two styles carry a name instead of their colours: Aviela and Lantern, which
// is black lit in green.
//
// One style has a page of its own. Aviela is pink with a white header card and
// flowers, and which flowers is a choice: its records, the ways for the app to
// wear them, and a header card in white, pink or black. Tapping it puts it on
// and opens that page, laid out like Custom, with a way back.
//
// There is no dark or light to choose here. A colour is dark or it is light,
// and picking one puts the app in that mode; the header card and the record
// are one choice, kept for both.
//
// The pictures at the top are not drawings. One is a copy of the app as it is
// on screen right now, taken again after every change (AppCopy); the other is
// the real player sheet, handed in by App. Both are shrunk with a transform.
//
// Without Pro a locked option can still be tapped: it shows everywhere as a
// preview and goes back when the page closes.

type LookSheetProps = {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  /** The real player sheet, for the second small screen. Left out where the
   *  player is not a sheet (the wide window on Windows). */
  player?: ReactNode;
  onNeedPro: () => void;
  onClose: () => void;
  T: T;
};

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

/** The app in Aviela, small, wearing one kind of flowers. Drawn at twice the
 *  size and halved, so the flowers are the real ones, only smaller. */
function FlowerScreen({ kind, card, tone }: { kind: Exclude<Flowers, "none">; card: T; tone: Tone }) {
  const app = SHADE_PREVIEW.light("pink");
  const inCard = cardFlowers(kind, tone);
  const inCorner = cornerFlowers(kind, tone);
  return (
    <div style={{ width: 92, height: 64, borderRadius: 13, overflow: "hidden", border: `1px solid ${app.border}`, boxSizing: "border-box" }}>
      <div style={{ width: 184, height: 128, transform: "scale(0.5)", transformOrigin: "top left", position: "relative", backgroundColor: app.bg, ...groundFlowers(kind) }}>
        <div style={{ position: "absolute", left: 10, right: 10, top: 10, height: 62, borderRadius: 16, background: card.playerBg, border: `1px solid ${card.border}`, overflow: "hidden", boxSizing: "border-box", zIndex: 0 }}>
          {inCard && <div style={inCard} />}
          {inCorner && <div style={inCorner} />}
          <div style={{ position: "absolute", left: 14, top: 13, width: 26, height: 22, borderRadius: 4, background: card.text }}>
            {kind === "mark" && <span style={{ position: "absolute", right: -13, top: -7, width: 19, height: 19, backgroundImage: logoFlower(), backgroundSize: "contain" }} />}
          </div>
          <div style={{ position: "absolute", left: 14, bottom: 11, width: 44, height: 6, borderRadius: 3, background: card.muted }} />
        </div>
        {kind !== "meadow" && <>
          <div style={{ position: "absolute", left: 16, top: 88, width: 80, height: 9, borderRadius: 5, background: app.text }} />
          <div style={{ position: "absolute", left: 16, top: 106, width: 52, height: 7, borderRadius: 4, background: app.muted }} />
        </>}
      </div>
    </div>
  );
}

// ─── THE APP, SMALL ──────────────────────────────────────────────────────────

/**
 * A copy of the app as it is on screen: the same elements with the same
 * styles, cloned and shrunk. Nearly every style in MPTree is written on the
 * element itself, so a clone looks exactly like what it was cloned from. It is
 * taken again whenever `stamp` changes, which is whenever the look does.
 *
 * The pages lying over the app (this one, and Settings under it) are left out.
 */
function AppCopy({ stamp, width, height, scale }: { stamp: string; width: number; height: number; scale: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let second = 0;
    // Two frames on: the app has drawn its new colours by then.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const app = document.querySelector<HTMLElement>("[data-app-shell]");
        const into = host.current;
        if (!app || !into) return;
        const copy = app.cloneNode(true) as HTMLElement;
        copy.removeAttribute("data-app-shell");
        copy.querySelectorAll<HTMLElement>("*").forEach(n => {
          if (n.style.position === "fixed" && Number(n.style.zIndex) >= 400) n.remove();
        });
        copy.style.minHeight = "0";
        copy.style.height = "100%";
        into.replaceChildren(copy);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [stamp, width, height]);
  // The transform also makes this the box that the app's fixed pieces (the
  // small player, the shuffle button) are placed in, so they land where they
  // are on the real screen.
  return (
    <div ref={host} style={{
      position: "absolute", top: 0, left: 0, width, height, overflow: "hidden",
      transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none",
    }} />
  );
}

/** A whole look in one tile: the app's colour, the header card on it, and
 *  its record in the corner. */
function Swatch({ app, card, vinyl, flowers = "none", tone = "white" }: { app: T; card: T; vinyl: VinylSkin; flowers?: Flowers; tone?: Tone }) {
  const inCard = cardFlowers(flowers, tone);
  // The corner pictures are larger than this little card, so they are halved.
  const halved = flowers === "sprig" || flowers === "lines" ? { backgroundSize: "65px 42px" } : flowers === "corners" ? { backgroundSize: "39px 26px" } : null;
  return (
    <div style={{ height: 76, borderRadius: 12, backgroundColor: app.bg, ...groundFlowers(flowers), border: `1px solid ${app.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 7, right: 7, top: 7, height: 24, borderRadius: 8, background: card.playerBg, border: `1px solid ${card.border}`, boxSizing: "border-box", overflow: "hidden", zIndex: 0 }}>
        {inCard && <div style={{ ...inCard, ...halved }} />}
        <div style={{ position: "absolute", left: 7, top: 8, width: 18, height: 6, borderRadius: 3, background: card.text }} />
        <div style={{ position: "absolute", right: 7, top: 7, width: 22, height: 8, borderRadius: 4, background: card.accent }} />
      </div>
      <div style={{ position: "absolute", left: 10, top: 42, width: 46, height: 5, borderRadius: 3, background: app.text }} />
      <div style={{ position: "absolute", left: 10, top: 53, width: 30, height: 4, borderRadius: 2, background: app.muted }} />
      <div style={{ position: "absolute", right: 7, bottom: 6 }}><SpinningDisc size={30} skin={vinyl} /></div>
    </div>
  );
}

const Lock = ({ T }: { T: T }) => (
  <span style={{ width: 20, height: 20, borderRadius: 10, background: T.sheetBg, border: `1px solid ${T.border}`, display: "grid", placeItems: "center", color: T.muted, flexShrink: 0 }}>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
  </span>
);

/** A group of choices, as a panel with its name on top. */
function Group({ children, T }: { children: ReactNode; T: T }) {
  return (
    <div style={{ margin: "12px 12px 0", border: `1px solid ${T.border}`, borderRadius: 18, paddingBottom: 12 }}>
      {children}
    </div>
  );
}

type Preset = { id: string; mode: Theme; shade: DarkShade | LightShade; card: CardShade; vinyl: VinylSkin; free?: boolean; name: string };
type Tab = "styles" | "custom";

export function LookSheet({ theme, onSetTheme, player, onNeedPro, onClose, T }: LookSheetProps) {
  const sh = makeSH(T);
  const pro = usePro();
  const look = useLook();
  const previewing = isPreviewing();
  const dark = theme === "dark";
  const [tab, setTab] = useState<Tab>("styles");
  // Aviela's own page, over the tabs. The phone's back button leaves it first.
  const [page, setPage] = useState<"main" | "aviela">("main");
  useEffect(() => {
    setLookBack(page === "aviela" ? () => setPage("main") : null);
    return () => setLookBack(null);
  }, [page]);

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

  // The window's size, which the small copies are a fraction of.
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const measure = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // A colour brings its mode with it, so trying a locked colour changes the
  // mode too, and that has to go back with it. `kept` is the mode that was
  // really chosen: the one the page opened in, or a free or Pro pick since.
  const kept = useRef<Theme>(theme);
  const now = useRef({ pro, theme });
  useEffect(() => { now.current = { pro, theme }; }, [pro, theme]);
  useEffect(() => () => {
    if (!now.current.pro && now.current.theme !== kept.current) onSetTheme(kept.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bought Pro while trying something: keep what is showing.
  useEffect(() => { if (pro) { kept.current = theme; keepPreview(); } }, [pro, theme]);

  const close = () => { endPreview(); onClose(); };

  /** Free picks and Pro picks are kept; the rest is shown as a preview. */
  const pick = (free: boolean, patch: Partial<Look>) => {
    if (pro || free) saveLook(patch); else previewLook(patch);
  };
  /** A pick that decides the mode as well: a colour, or a whole style. */
  const pickIn = (mode: Theme, free: boolean, patch: Partial<Look>) => {
    if (pro || free) kept.current = mode;
    if (mode !== theme) onSetTheme(mode);
    pick(free, patch);
  };

  const DARKS: { id: DarkShade; label: string }[] = [
    { id: "classic", label: t("Black") }, { id: "amoled", label: "AMOLED" }, { id: "graphite", label: t("Graphite") },
    { id: "lantern", label: "Lantern" },
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
    { id: "smoke", label: t("Smoke") }, { id: "marble", label: t("Marble") }, { id: "lantern", label: "Lantern" },
  ];
  const RECORD_NAMES: Record<FlowerRecord, string> = {
    daisy: t("Daisy ring"), bloom: t("One bloom"), blossom: t("Blossom"), lines: t("Line drawing"), wreath: t("Wreath"),
    petals: t("Loose petals"), ditsy: t("Small flowers"), bouquet: t("Bouquet"), dahlia: t("Dahlia"), oxeye: t("One daisy"),
    night: t("Night garden"), branch: t("Blossom branch"), posy: t("Posy"),
  };
  const FLOWER_NAMES: Record<Exclude<Flowers, "none">, string> = {
    sprig: t("Sprig"), garland: t("Garland"), mark: t("One flower"), bloom: t("Big bloom"), vine: t("Vine"),
    corners: t("Both corners"), confetti: t("Scattered"), lines: t("Drawn"), daisies: t("Daisy chain"), meadow: t("Meadow"),
  };
  const AVIELA_CARD_NAMES = [t("White"), t("Pink"), t("Black")];
  // Whole looks: a colour, a header card and a record that belong together.
  // Named after the app's colour, then the header card's where it differs.
  const pair = (a: string, b: string) => `${t(a)} · ${t(b)}`;
  const PRESETS: Preset[] = [
    { id: "black",          mode: "dark",  shade: "classic", card: "default",       vinyl: "classic", name: t("Black"), free: true },
    { id: "white",          mode: "light", shade: "classic", card: "default",       vinyl: "white",   name: t("White"), free: true },
    { id: "lantern",        mode: "dark",  shade: "lantern", card: "default",       vinyl: "lantern", name: "Lantern" },
    { id: "paper-graphite", mode: "light", shade: "paper",   card: "dark:graphite", vinyl: "smoke",   name: pair("Paper", "Graphite") },
    { id: "stone-black",    mode: "light", shade: "stone",   card: "dark:classic",  vinyl: "classic", name: pair("Stone", "Black") },
  ];

  // The header card and the record are one choice, written for both modes, so
  // they stay when a colour of the other mode is picked.
  const card = dark ? look.cardDark : look.cardLight;
  const setCard = (c: CardShade) => pick(c === FREE.card, { cardDark: c, cardLight: c });
  const vinyl = dark ? look.vinylDark : look.vinylLight;
  const setVinyl = (v: VinylSkin) => pick(v === FREE.vinyl, { vinylDark: v, vinylLight: v });

  const presetOn = (p: Preset) =>
    theme === p.mode && (p.mode === "dark" ? look.dark : look.light) === p.shade && card === p.card && vinyl === p.vinyl && look.flowers === "none";
  // Each part is kept or only shown on its own, so White keeps its colour for
  // everyone while its white record is still a Pro record.
  const pickPreset = (p: Preset) => {
    if (pro || p.free) kept.current = p.mode;
    if (p.mode !== theme) onSetTheme(p.mode);
    pick(p.shade === "classic", { flowers: "none", ...(p.mode === "dark" ? { dark: p.shade as DarkShade } : { light: p.shade as LightShade }) });
    pick(p.card === FREE.card, { cardDark: p.card, cardLight: p.card });
    pick(p.vinyl === FREE.vinyl, { vinylDark: p.vinyl, vinylLight: p.vinyl });
  };

  // Aviela: pink, with the record, the flowers and the header card last
  // picked for it.
  const avielaOn = !dark && look.light === "pink" && look.flowers !== "none";
  const wearAviela = (a: Look["aviela"]) => pick(false, {
    light: "pink", cardDark: a.card, cardLight: a.card,
    vinylDark: a.record, vinylLight: a.record, flowers: a.flowers, aviela: a,
  });
  const avielaCard = cardPalette(look.aviela.card, SHADE_PREVIEW.light("pink"));
  const avielaTone = toneOf(look.aviela.card, false, "pink");
  const openAviela = () => {
    if (pro) kept.current = "light";
    if (dark) onSetTheme("light");
    wearAviela(look.aviela);
    setPage("aviela");
  };

  // ── The two small screens ──
  const wide = isWide();
  const panes = player ? 2 : 1;
  const room = (wide ? 520 : win.w - 32) - (panes - 1) * 12;
  const scale = Math.min(Math.min(330, win.h * 0.38) / win.h, room / panes / win.w);
  const pane: React.CSSProperties = {
    width: Math.round(win.w * scale), height: Math.round(win.h * scale), flexShrink: 0,
    position: "relative", overflow: "hidden", borderRadius: 16, background: T.bg,
    border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  };
  const stamp = `${theme}|${JSON.stringify(look)}`;

  const tabBtn = (id: Tab, name: string) => (
    <button
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      style={{
        flex: 1, height: 36, borderRadius: 18, border: "none", cursor: "pointer", fontFamily: "inherit",
        fontSize: 14, fontWeight: 700,
        background: tab === id ? T.accent : "transparent", color: tab === id ? T.playBtnFg : T.muted,
        transition: "background 0.2s, color 0.2s",
      }}
    >
      {name}
    </button>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 420, display: "flex", alignItems: isWide() ? "center" : "flex-end", justifyContent: "center" }} onClick={close}>
      <div
        style={{
          ...sh.sheet, paddingBottom: 0, height: isWide() ? "90vh" : "100%",
          ...(isWide() || fullPage() ? null : { borderRadius: 0, paddingTop: "env(safe-area-inset-top, 0px)" }),
          display: "flex", flexDirection: "column", boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...sh.hdr, padding: "14px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {page === "aviela" && (
              <button onClick={() => setPage("main")} style={{ ...sh.xBtn, color: T.text, padding: "6px 8px 6px 0", marginLeft: -2 }} aria-label={t("Back")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 5 8 12 15 19" /></svg>
              </button>
            )}
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{page === "aviela" ? "Aviela" : t("Personalise")}</span>
          </div>
          <button onClick={close} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        <div aria-hidden="true" style={{ flexShrink: 0, display: "flex", justifyContent: "center", gap: 12, padding: "2px 16px 14px" }}>
          <div style={pane}>
            <AppCopy stamp={stamp} width={win.w} height={win.h} scale={scale} />
          </div>
          {player && (
            <div style={pane}>
              <div style={{ position: "absolute", top: 0, left: 0, width: win.w, height: win.h, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
                {player}
              </div>
            </div>
          )}
        </div>

        {page === "main" && (
          <div role="tablist" style={{ flexShrink: 0, display: "flex", gap: 2, margin: "0 16px", padding: 3, borderRadius: 21, background: T.surface, border: `1px solid ${T.border}` }}>
            {tabBtn("styles", t("Styles"))}
            {tabBtn("custom", t("Custom"))}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 20 }}>
          {page === "aviela" ? (
            <>
              <Group T={T}>
                <Row T={T} framed title={t("Record")}>
                  {FLOWER_RECORDS.map(id => (
                    <Tile key={id} T={T} label={RECORD_NAMES[id]} selected={avielaOn && vinyl === id} locked={!pro}
                      onClick={() => wearAviela({ ...look.aviela, record: id })}>
                      <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                        <SpinningDisc size={60} skin={id} />
                      </div>
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
                <Row T={T} framed title={t("Flowers in the app")}>
                  {FLOWER_KINDS.map(id => (
                    <Tile key={id} T={T} label={FLOWER_NAMES[id]} selected={avielaOn && look.flowers === id} locked={!pro}
                      onClick={() => wearAviela({ ...look.aviela, flowers: id })}>
                      <FlowerScreen kind={id} card={avielaCard} tone={avielaTone} />
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
                <Row T={T} framed title={isWide() ? t("Sidebar") : t("Header card")}>
                  {AVIELA_CARDS.map((c, i) => (
                    <Tile key={c} T={T} label={AVIELA_CARD_NAMES[i]} selected={avielaOn && card === c} locked={!pro}
                      onClick={() => wearAviela({ ...look.aviela, card: c })}>
                      <Card p={cardPalette(c, SHADE_PREVIEW.light("pink"))} />
                    </Tile>
                  ))}
                </Row>
              </Group>
            </>
          ) : tab === "styles" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, padding: "14px 16px 0" }}>
              {[...PRESETS.slice(0, 2), "aviela" as const, ...PRESETS.slice(2)].map(p => {
                const aviela = p === "aviela";
                const app = aviela ? SHADE_PREVIEW.light("pink") : p.mode === "dark" ? SHADE_PREVIEW.dark(p.shade as DarkShade) : SHADE_PREVIEW.light(p.shade as LightShade);
                const on = aviela ? avielaOn : presetOn(p);
                return (
                  <button
                    key={aviela ? p : p.id}
                    onClick={() => (aviela ? openAviela() : pickPreset(p))}
                    aria-pressed={on}
                    style={{
                      padding: 4, borderRadius: 17, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      background: "transparent", border: `2px solid ${on ? T.accent : "transparent"}`,
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <Swatch app={app} card={aviela ? avielaCard : cardPalette(p.card, app)} vinyl={aviela ? look.aviela.record : p.vinyl}
                      flowers={aviela ? look.aviela.flowers : undefined} tone={avielaTone} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "7px 4px 2px" }}>
                      <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aviela ? "Aviela" : p.name}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.muted }}>
                        {!pro && !(!aviela && p.free) && <Lock T={T} />}
                        {/* Aviela opens a page of its own. */}
                        {aviela && <IC.ChevronR />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <Group T={T}>
                <Row T={T} framed title={t("Colour")}>
                  {DARKS.map(d => (
                    <Tile key={`d-${d.id}`} T={T} label={d.label} selected={dark && look.dark === d.id} locked={!pro && d.id !== FREE.dark}
                      onClick={() => pickIn("dark", d.id === FREE.dark, { dark: d.id, flowers: "none" })}>
                      <Screen p={SHADE_PREVIEW.dark(d.id)} />
                    </Tile>
                  ))}
                  {LIGHTS.map(l => (
                    <Tile key={`l-${l.id}`} T={T} label={l.label} selected={!dark && look.light === l.id} locked={!pro && l.id !== FREE.light}
                      onClick={() => pickIn("light", l.id === FREE.light, { light: l.id, flowers: "none" })}>
                      <Screen p={SHADE_PREVIEW.light(l.id)} />
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
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
              </Group>

              <Group T={T}>
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
              </Group>

              {isDesktop && (
                <Group T={T}>
                  <Row T={T} framed title={t("Floating button")}>
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
                </Group>
              )}

            </>
          )}
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
