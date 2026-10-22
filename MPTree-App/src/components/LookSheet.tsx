import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeSH, cardPalette, SHADE_PREVIEW, type T } from "../themes";
import type { Theme } from "../types";
import { t, tn } from "../i18n";
import { IC } from "./Icons";
import { SpinningDisc } from "./SpinningDisc";
import { LanternGate } from "./LanternGate";
import { StyleReveal } from "./StyleReveal";
import { primeLanternVoice } from "../lanternVoice";
import { usePro, ADS_ON } from "../pro";
import { System } from "../plugins";
import { MARK_PATH } from "./Logo";
import { CropSheet } from "./CropSheet";
import { FlowerEditor } from "./FlowerEditor";
import {
  useBackground, previewBackground, keepBackground, endBackgroundPreview, hasBackgroundChanges, STRENGTH_MIN, STRENGTH_MAX,
} from "../background";
import {
  useLook, getLook, previewLook, keepPreview, endPreview, hasLookChanges, isFreeLook, setLookBack, isFreeVinyl, loadLanternLock, lanternLockDays, lockLantern, unlockLantern,
  lanternAsked, markLanternAsked, FREE, FLOWER_RECORDS, FLOWER_KINDS, AVIELA_CARDS, LANTERN_RECORDS, LANTERN_CARDS, LANTERN_COLOURS,
  type Look, type CardShade, type VinylSkin, type DarkShade, type LightShade, type FlowerRecord, type Flowers, type AvielaFlowers, type LanternRecord, type AppColour, type AppIcon,
} from "../look";
import { groundFlowers, cardFlowers, cornerFlowers, logoFlower, toneOf, ownAppArt, type Tone } from "../flowers";

// ─── PERSONALISE (Pro) ───────────────────────────────────────────────────────
// Laid out the way Android's own "Wallpaper & style" is: what MPTree will look
// like at the top, large, getting smaller as the page is scrolled; under it the
// two styles with a name, then one row for each kind of choice: the background
// photo, the colours, the header card, the app icon and the record. A row
// opens its choices on a page of its own, with a way back.
//
// Aviela is pink with flowers, and which flowers is a choice: its records, the
// ways for the app to wear them, and a header card in white, pink or black.
// Lantern is green light: its own records and header cards, on black, white or
// paper. Put on, each brings its own app icon too. Tapping one opens its page.
//
// Lantern asks something first, of whoever has Pro, the first time only: a
// ring comes up with "Are you afraid?" (LanternGate). No lets them in. Yes
// shuts Lantern for a week. Both styles open out of the place that was
// tapped (StyleReveal): green light for Lantern, a pink bloom for Aviela.
//
// Nothing here is kept until Apply. Every pick is shown at once, everywhere,
// and only Apply keeps it; leaving with something not applied asks whether to
// throw it away. The app icon waits for Apply even to be shown, since changing
// it can move it on the home screen. Without Pro, Apply becomes a way to Pro
// as soon as anything locked is on show.
//
// There is no dark or light to choose here. A colour is dark or it is light,
// and picking one puts the app in that mode; the header card and the record
// are one choice, kept for both.
//
// The pictures at the top are not drawings. One is a copy of the app as it is
// on screen right now, taken again after every change (AppCopy); the other is
// the real player sheet, handed in by App. Both are shrunk with a transform.
//

type LookSheetProps = {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  /** The real player sheet, for the second small screen. Left out where the
   *  player is not a sheet (the wide window on Windows). */
  player?: ReactNode;
  onNeedPro: () => void;
  onToast: (msg: string) => void;
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

/** The app in a named style, small, wearing one kind of flowers or of light.
 *  Drawn at twice the size and halved, so they are the real ones, only smaller. */
function FlowerScreen({ kind, app, card, tone }: { kind: Flowers; app: T; card: T; tone: Tone }) {
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
function AppCopy({ stamp, width, height, scale, bare }: { stamp: string; width: number; height: number; scale: number; bare?: boolean }) {
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
        // Bare: without the flowers or the light the style draws on the
        // ground, for the flower editor to place new ones on.
        if (bare) {
          copy.style.backgroundImage = "none";
          copy.querySelectorAll("[data-ground]").forEach(n => n.remove());
        }
        into.replaceChildren(copy);
      });
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [stamp, width, height, bare]);
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
function Swatch({ app, card, vinyl, flowers = "none", tone = "white", height = 76 }: { app: T; card: T; vinyl: VinylSkin; flowers?: Flowers; tone?: Tone; height?: number }) {
  const inCard = cardFlowers(flowers, tone);
  // The corner pictures are larger than this little card, so they are halved.
  const halved = flowers === "sprig" || flowers === "lines" ? { backgroundSize: "65px 42px" } : flowers === "corners" ? { backgroundSize: "39px 26px" } : null;
  return (
    <div style={{ height, borderRadius: 12, backgroundColor: app.bg, ...groundFlowers(flowers), border: `1px solid ${app.border}`, position: "relative", overflow: "hidden" }}>
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

/** The launcher icons, drawn the way Branding/build-alt-icons.mjs draws them
 *  for Android. Change one, change the other. */
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
  const petals = [];
  for (let i = 0; i < 6; i++) petals.push(<path key={i} d="M0,0C4.2,-3 4.2,-9 0,-10C-4.2,-9 -4.2,-3 0,0Z" transform={`rotate(${i * 60})`} fill="#ee8fb4" />);
  return (
    // The ring keeps a white icon visible on a white page.
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
      {icon === "aviela"  && <>
        <rect width="108" height="108" fill="#ffd5e6" />{markAt(43.2, "#20181b")}
        <g transform="translate(74 33) scale(1.3)">{petals}<circle r="2" fill="#f3c14b" /></g>
      </>}
      {icon === "lantern" && <>
        <rect width="108" height="108" fill="#050906" />
        <circle cx="54" cy="54" r="40" fill="rgba(53,224,138,0.06)" />
        <circle cx="54" cy="54" r="31" fill="rgba(53,224,138,0.10)" />
        <circle cx="54" cy="54" r="23" fill="rgba(53,224,138,0.14)" />
        {markAt(43.2, "#35e08a")}
      </>}
    </svg>
  );
}

type Point = { x: number; y: number };
/** The pages under the small screens: the list of choices, a style's own
 *  page, or one kind of choice on its own. */
type Page = "main" | "aviela" | "lantern" | "background" | "colours" | "card" | "icons" | "records";

export function LookSheet({ theme, onSetTheme, player, onNeedPro, onToast, onClose, T }: LookSheetProps) {
  const sh = makeSH(T);
  const pro = usePro();
  const look = useLook();
  const bg = useBackground();
  const dark = theme === "dark";
  // Which page is open. The phone's back button goes back to the list first.
  const [page, setPage] = useState<Page>("main");
  // Lantern's question, while it is being asked, and how many days Lantern is
  // still shut for after a yes.
  const [asking, setAsking] = useState(false);
  const [shutDays, setShutDays] = useState(0);
  useEffect(() => { loadLanternLock().then(setShutDays).catch(() => {}); }, []);
  // A named style opening out of where it was tapped.
  const [reveal, setReveal] = useState<{ kind: "aviela" | "lantern"; at: Point } | null>(null);
  // "Discard changes?", while it is asked.
  const [confirming, setConfirming] = useState(false);
  // Aviela's flowers being placed by hand, on the record or on the app.
  const [editing, setEditing] = useState<null | "record" | "app">(null);
  // A photo picked for the background, being placed.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  // The icon the launcher shows now. It only changes on Apply: switching it
  // can move it on the home screen, which is not for every tap.
  const [appIcon, setAppIcon] = useState<AppIcon>(look.icon);
  useEffect(() => { System.getAppIcon().then(r => setAppIcon(r.icon as AppIcon)).catch(() => {}); }, []);
  // A background tried and not kept goes when the page does, however it goes.
  useEffect(() => () => endBackgroundPreview(), []);

  // The window's size, which the small copies are a fraction of.
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const measure = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Scrolling down shrinks the two screens, as Android's own "Wallpaper &
  // style" does, and scrolling back to the top brings them back to full size.
  // 0 is full size, 1 is as small as they get.
  const [shrink, setShrink] = useState(0);
  const frame = useRef(0);
  const body = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const top = body.current?.scrollTop ?? 0;
      setShrink(Math.min(1, Math.max(0, top / 220)));
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // Every page starts at its top, with the screens large again.
  const go = (next: Page) => {
    setPage(next);
    if (body.current) body.current.scrollTop = 0;
    setShrink(0);
  };

  // A colour brings its mode with it, so a pick can change the mode too, and
  // that has to go back with it when the pick is thrown away. `kept` is the
  // mode that was applied: the one the page opened in, or the last Apply.
  const [keptTheme, setKeptTheme] = useState<Theme>(theme);
  const kept = useRef<Theme>(theme);
  const now = useRef(theme);
  useEffect(() => { now.current = theme; kept.current = keptTheme; }, [theme, keptTheme]);
  // However the page goes, an unapplied mode does not stay behind.
  useEffect(() => () => {
    if (now.current !== kept.current) onSetTheme(kept.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Puts the launcher icon to what was applied, when it differs. */
  const applyIcon = () => {
    const want = getLook().icon;
    if (want === appIcon) return;
    System.setAppIcon({ icon: want })
      .then(() => { setAppIcon(want); onToast(t("Icon changed")); })
      .catch(() => onToast(t("This phone did not let MPTree change its icon")));
  };

  // Bought Pro while trying something: keep what is showing.
  const wasPro = useRef(pro);
  useEffect(() => {
    if (pro && !wasPro.current) { setKeptTheme(theme); keepPreview(); void keepBackground(); applyIcon(); }
    wasPro.current = pro;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, theme]);

  // What has been changed and not applied, and whether it needs Pro to keep.
  const changed = hasLookChanges() || theme !== keptTheme || hasBackgroundChanges();
  const needsPro = !pro && (!isFreeLook(look) || !!bg.photo);
  const apply = () => {
    keepPreview();
    void keepBackground();
    setKeptTheme(theme);
    applyIcon();
    onToast(t("Applied"));
  };
  const leave = () => {
    if (changed) { setConfirming(true); return; }
    endPreview();
    endBackgroundPreview();
    onClose();
  };
  const discard = () => {
    endPreview();
    endBackgroundPreview();
    if (theme !== keptTheme) onSetTheme(keptTheme);
    setConfirming(false);
    onClose();
  };
  // The phone's back button takes one step at a time, and asks before it
  // throws anything away.
  useEffect(() => {
    setLookBack(() => {
      if (editing) { setEditing(null); return true; }
      if (cropSrc) { setCropSrc(null); return true; }
      if (reveal) return true;
      if (confirming) { setConfirming(false); return true; }
      if (asking) { setAsking(false); return true; }
      if (page !== "main") { go("main"); return true; }
      if (changed) { setConfirming(true); return true; }
      return false;
    });
    return () => setLookBack(null);
  }, [editing, cropSrc, reveal, confirming, asking, page, changed]);

  /** Every pick is shown at once, and kept only by Apply. */
  const pick = (patch: Partial<Look>) => previewLook(patch);
  /** A pick that decides the mode as well: a colour, or a whole style. */
  const pickIn = (mode: Theme, patch: Partial<Look>) => {
    if (mode !== theme) onSetTheme(mode);
    pick(patch);
  };

  const DARKS: { id: DarkShade; label: string }[] = [
    { id: "classic", label: t("Black") }, { id: "graphite", label: t("Graphite") },
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
    { id: "aviela", label: "Aviela" }, { id: "lantern", label: "Lantern" },
  ];
  const RECORD_NAMES: Record<FlowerRecord, string> = {
    daisy: t("Daisy ring"), bloom: t("One bloom"), blossom: t("Blossom"), lines: t("Line drawing"), wreath: t("Wreath"),
    petals: t("Loose petals"), ditsy: t("Small flowers"), bouquet: t("Bouquet"), dahlia: t("Dahlia"), oxeye: t("One daisy"),
    night: t("Night garden"), branch: t("Blossom branch"), posy: t("Posy"), lily: t("Lily"), own: t("Your own"),
  };
  const FLOWER_NAMES: Record<AvielaFlowers, string> = {
    sprig: t("Sprig"), garland: t("Garland"), mark: t("One flower"), bloom: t("Big bloom"), vine: t("Vine"),
    corners: t("Both corners"), confetti: t("Scattered"), lines: t("Drawn"), daisies: t("Daisy chain"), meadow: t("Meadow"),
    own: t("Your own"),
  };
  const AVIELA_CARD_NAMES = [t("White"), t("Pink"), t("Black")];
  const LANTERN_RECORD_NAMES: Record<LanternRecord, string> = {
    "lantern": t("Beams"), "lantern-rings": t("Rings"), "lantern-core": t("Glow"),
    "lantern-dash": t("Charge"), "lantern-solid": t("Green"), "lantern-burst": t("Burst"),
  };
  const LANTERN_CARD_NAMES = ["Lantern", t("Green"), t("Black"), t("White")];

  // The header card and the record are one choice, written for both modes, so
  // they stay when a colour of the other mode is picked.
  const card = dark ? look.cardDark : look.cardLight;
  const vinyl = dark ? look.vinylDark : look.vinylLight;

  // The two styles with a name. Aviela is on while there are flowers; what
  // makes Lantern is its record, so that is what tells whether it is on.
  const avielaOn = !dark && look.light === "pink" && look.flowers !== "none";
  const lanternOn = (LANTERN_RECORDS as readonly string[]).includes(vinyl) && look.flowers === "none";
  // A named style does not outlive a pick of one thing on its own. Everything
  // it brought goes back to plain first, its icon too, and the pick is made on
  // that: otherwise half of Aviela or of Lantern is left standing round the
  // one thing that changed.
  const plain = (): Partial<Look> => (avielaOn || lanternOn ? {
    flowers: "none", cardDark: "default", cardLight: "default", vinylDark: "classic", vinylLight: "classic",
    ...(dark ? { dark: "classic" as const } : { light: "classic" as const }),
    ...(look.icon === (avielaOn ? "aviela" : "lantern") ? { icon: "classic" as const } : {}),
  } : {});
  const setCard = (c: CardShade) => pick({ ...plain(), cardDark: c, cardLight: c });
  const setVinyl = (v: VinylSkin) => pick({ ...plain(), vinylDark: v, vinylLight: v });

  // Aviela: pink, with the record, the flowers and the header card last
  // picked for it.
  const wearAviela = (a: Look["aviela"], extra: Partial<Look> = {}) => pick({
    light: "pink", cardDark: a.card, cardLight: a.card,
    vinylDark: a.record, vinylLight: a.record, flowers: a.flowers, aviela: a, ...extra,
  });
  const avielaApp = SHADE_PREVIEW.light("pink");
  const avielaCard = cardPalette(look.aviela.card, avielaApp);
  const avielaTone = toneOf(look.aviela.card, false, "pink");
  /** Opens Aviela's page. Put on fresh, it brings its own icon. */
  const enterAviela = (fresh: boolean) => {
    if (dark) onSetTheme("light");
    wearAviela(look.aviela, fresh ? { icon: "aviela" } : {});
    go("aviela");
  };
  const openAviela = (at: Point) => {
    if (avielaOn) { enterAviela(false); return; }
    setReveal({ kind: "aviela", at });
  };

  // Lantern: the record, the header card and the colour last picked for it.
  const shadeOf = (c: AppColour) => c.split(":") as [Theme, string];
  const paletteOf = (c: AppColour) => {
    const [mode, shade] = shadeOf(c);
    return mode === "dark" ? SHADE_PREVIEW.dark(shade as DarkShade) : SHADE_PREVIEW.light(shade as LightShade);
  };
  const colourNames: Record<string, string> = Object.fromEntries([
    ...DARKS.map(d => [`dark:${d.id}`, d.label]), ...LIGHTS.map(l => [`light:${l.id}`, l.label]),
  ]);
  const colourNow = `${theme}:${dark ? look.dark : look.light}`;
  const wearLantern = (l: Look["lantern"], extra: Partial<Look> = {}) => {
    const [mode, shade] = shadeOf(l.colour);
    if (mode !== theme) onSetTheme(mode);
    pick({
      ...(mode === "dark" ? { dark: shade as DarkShade } : { light: shade as LightShade }),
      cardDark: l.card, cardLight: l.card, vinylDark: l.record, vinylLight: l.record, flowers: "none", lantern: l, ...extra,
    });
  };
  const lanternApp = paletteOf(look.lantern.colour);
  const lanternCard = cardPalette(look.lantern.card, lanternApp);
  const enterLantern = (fresh: boolean) => {
    wearLantern(look.lantern, fresh ? { icon: "lantern" } : {});
    go("lantern");
  };
  const openLantern = (at: Point) => {
    // Already on: straight to its page.
    if (lanternOn) { enterLantern(false); return; }
    if (pro) {
      const days = lanternLockDays();
      setShutDays(days);
      if (days > 0) {
        // A test build is for trying this more than once a week.
        if (__PRO_TEST__) { unlockLantern(); setShutDays(0); onToast("Test build: Lantern is open again, and will ask again."); return; }
        onToast(tn(days, "Lantern is locked for {n} more day.", "Lantern is locked for {n} more days."));
        return;
      }
      // The first time, the ring asks.
      // In the tap itself: sound may only start from one.
      // A test build asks every time, so the question can be tried again.
      if (__PRO_TEST__ || !lanternAsked()) { primeLanternVoice(); setAsking(true); return; }
    }
    setReveal({ kind: "lantern", at });
  };
  const sayAfraid = (): number => {
    markLanternAsked();
    const days = lockLantern();
    setShutDays(days);
    return days;
  };
  const sayNotAfraid = (at: Point) => {
    markLanternAsked();
    // The dark stays until the green has covered it, or the page would show
    // through for a moment between the two.
    setReveal({ kind: "lantern", at });
  };

  /** Where a tap was; the middle of what was tapped when it came from a key. */
  const tappedAt = (e: React.MouseEvent<HTMLElement>): Point => {
    if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ── The background photo ──
  const choosePhoto = () => picker.current?.click();
  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setCropSrc(reader.result); };
    reader.onerror = () => onToast(t("Could not open that photo"));
    reader.readAsDataURL(file);
  };

  // ── The two small screens ──
  // Large at the top of the page, small once it is scrolled.
  const panes = player ? 2 : 1;
  const room = win.w - 32 - (panes - 1) * 12;
  const big = Math.min(0.42, room / panes / win.w);
  const small = Math.min(big, 0.2);
  const scale = big + (small - big) * shrink;
  const pane: React.CSSProperties = {
    width: Math.round(win.w * scale), height: Math.round(win.h * scale), flexShrink: 0,
    position: "relative", overflow: "hidden", borderRadius: 16 + 6 * (1 - shrink), background: T.bg,
    border: `1px solid ${T.border}`, boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
  };
  const stamp = `${theme}|${JSON.stringify(look)}|${bg.photo?.length ?? 0}|${bg.strength}`;

  // ── The list of choices, as Android lays out its own ──
  const colourName = dark ? DARKS.find(d => d.id === look.dark)?.label : LIGHTS.find(l => l.id === look.light)?.label;
  const cardName = card === "default" ? t("Default") : CARDS.find(c => c.id === card)?.label ?? AVIELA_CARD_NAMES[AVIELA_CARDS.indexOf(card)] ?? "Lantern";
  const recordName = VINYLS.find(v => v.id === vinyl)?.label
    ?? (avielaOn ? RECORD_NAMES[vinyl as FlowerRecord] : lanternOn ? LANTERN_RECORD_NAMES[vinyl as LanternRecord] : "") ?? "";
  const iconName = ICONS.find(i => i.id === look.icon)?.label ?? "";
  const choices: { id: Page; title: string; sub: string; art: ReactNode }[] = [
    {
      id: "background", title: t("Background"),
      sub: bg.photo ? t("Your photo, {n}%", { n: Math.round(bg.strength * 100) }) : t("None"),
      art: bg.photo
        ? <img src={bg.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : <span style={{ color: T.text, display: "flex", transform: "scale(1.3)" }}><IC.Photo /></span>,
    },
    {
      id: "colours", title: t("Colours"), sub: colourName ?? "",
      art: <span style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${T.border}`, background: `linear-gradient(90deg, ${T.bg} 50%, ${T.accent} 50%)` }} />,
    },
    {
      id: "card", title: t("Header card"), sub: cardName,
      // The card drawn at its own size and shrunk; the box around it is the
      // shrunk size, or the layout would still take the full one.
      art: (
        <span style={{ display: "block", position: "relative", width: 39, height: 27 }}>
          <span style={{ position: "absolute", left: 0, top: 0, transform: "scale(0.42)", transformOrigin: "top left" }}><Card p={cardPalette(card, T)} /></span>
        </span>
      ),
    },
    { id: "icons", title: t("Icons"), sub: iconName, art: <IconArt icon={look.icon} size={34} /> },
    { id: "records", title: t("Records"), sub: recordName, art: <SpinningDisc size={36} skin={vinyl} /> },
  ];
  const choiceRow = (c: typeof choices[number], i: number) => {
    const first = i === 0, last = i === choices.length - 1;
    return (
      <button key={c.id} onClick={() => go(c.id)} style={{
        display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", cursor: "pointer",
        background: T.surface, border: "none", fontFamily: "inherit", color: T.text, padding: "14px 16px",
        borderRadius: `${first ? 22 : 6}px ${first ? 22 : 6}px ${last ? 22 : 6}px ${last ? 22 : 6}px`,
      }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{c.title}</span>
          <span style={{ display: "block", fontSize: 13, color: T.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</span>
        </span>
        <span style={{ width: 52, height: 52, borderRadius: 16, background: T.sheetBg, display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0 }}>{c.art}</span>
      </button>
    );
  };

  const styleTile = (key: "aviela" | "lantern") => {
    const on = key === "aviela" ? avielaOn : lanternOn;
    const shut = key === "lantern" && pro && shutDays > 0 && !lanternOn;
    return (
      <button key={key}
        onClick={e => (key === "aviela" ? openAviela(tappedAt(e)) : openLantern(tappedAt(e)))}
        aria-pressed={on}
        style={{
          padding: 4, borderRadius: 19, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
          background: "transparent", border: `2px solid ${on ? T.accent : "transparent"}`, transition: "border-color 0.15s ease",
        }}>
        {key === "aviela"
          ? <Swatch app={avielaApp} card={avielaCard} vinyl={look.aviela.record} flowers={look.aviela.flowers} tone={avielaTone} height={104} />
          : <Swatch app={lanternApp} card={lanternCard} vinyl={look.lantern.record} height={104} />}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "8px 4px 2px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: on ? T.text : T.muted }}>{key === "aviela" ? "Aviela" : "Lantern"}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.muted }}>
            {(!pro || shut) && <Lock T={T} />}
            <IC.ChevronR />
          </span>
        </div>
      </button>
    );
  };

  const TITLES: Record<Page, string> = {
    main: t("Personalise"), aviela: "Aviela", lantern: "Lantern", background: t("Background"),
    colours: t("Colours"), card: t("Header card"), icons: t("Icons"), records: t("Records"),
  };
  const keepLabel = needsPro ? (ADS_ON ? t("Keep it, free with an ad") : t("Keep it with Pro")) : t("Apply");
  const note = { fontSize: 13, color: T.muted, lineHeight: 1.5, padding: "10px 20px 0" } as const;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 420, display: "flex", alignItems: "flex-end" }} onClick={leave}>
      <div
        style={{
          ...sh.sheet, paddingBottom: 0, height: "100%", borderRadius: 0,
          paddingTop: "env(safe-area-inset-top, 0px)",
          display: "flex", flexDirection: "column", boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ ...sh.hdr, padding: "14px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {page !== "main" && (
              <button onClick={() => go("main")} style={{ ...sh.xBtn, color: T.text, padding: "6px 8px 6px 0", marginLeft: -2 }} aria-label={t("Back")}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 5 8 12 15 19" /></svg>
              </button>
            )}
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{TITLES[page]}</span>
          </div>
          {/* On a page of its own the way out is the back arrow, and the
              corner is where a change is kept. */}
          {page === "main" ? (
            <button onClick={leave} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
          ) : changed && (
            <button onClick={needsPro ? onNeedPro : apply} style={{
              flexShrink: 0, padding: "8px 16px", background: T.accent, color: T.playBtnFg, border: "none",
              borderRadius: 18, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
            }}>
              {keepLabel}
            </button>
          )}
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

        <div ref={body} onScroll={onScroll} style={{ flex: 1, overflowY: "auto", paddingBottom: 20 }}>
          {page === "main" ? (
            <div style={{ padding: "0 16px" }}>
              <div style={{ ...sh.lbl, margin: "4px 4px 8px" }}>{t("Styles")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {styleTile("aviela")}
                {styleTile("lantern")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 16 }}>
                {choices.map(choiceRow)}
              </div>
              {/* Room to scroll the screens small even when the list is short. */}
              <div style={{ height: 160 }} />
            </div>
          ) : page === "aviela" ? (
            <>
              <Group T={T}>
                <Row T={T} framed title={t("Record")}>
                  {/* First, the one they make themselves. */}
                  <Tile T={T} label={t("Make your own")} selected={avielaOn && vinyl === "own"} locked={!pro} onClick={() => setEditing("record")}>
                    <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                      {look.aviela.own.record.length ? <SpinningDisc size={60} skin="own" /> : (
                        <span style={{ width: 58, height: 58, borderRadius: "50%", border: `1.5px dashed ${T.muted}`, display: "grid", placeItems: "center", color: T.text }}><IC.Plus /></span>
                      )}
                    </div>
                  </Tile>
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
                  <Tile T={T} label={t("Make your own")} selected={avielaOn && look.flowers === "own"} locked={!pro} onClick={() => setEditing("app")}>
                    {look.aviela.own.app.length ? (
                      // The whole screen, small, in the middle of the tile.
                      <div style={{ width: 92, height: 64, display: "grid", placeItems: "center" }}>
                        <div style={{ height: 62, width: Math.round(62 * win.w / win.h), borderRadius: 8, overflow: "hidden", border: `1px solid ${avielaApp.border}`, boxSizing: "border-box", backgroundColor: avielaApp.bg,
                          backgroundImage: `url("${ownAppArt(look.aviela.own.app, win.w, win.h)}")`, backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }} />
                      </div>
                    ) : (
                      <span style={{ width: 92, height: 64, borderRadius: 13, border: `1.5px dashed ${T.muted}`, boxSizing: "border-box", display: "grid", placeItems: "center", color: T.text }}><IC.Plus /></span>
                    )}
                  </Tile>
                  {FLOWER_KINDS.map(id => (
                    <Tile key={id} T={T} label={FLOWER_NAMES[id]} selected={avielaOn && look.flowers === id} locked={!pro}
                      onClick={() => wearAviela({ ...look.aviela, flowers: id })}>
                      <FlowerScreen kind={id} app={avielaApp} card={avielaCard} tone={avielaTone} />
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
                <Row T={T} framed title={t("Header card")}>
                  {AVIELA_CARDS.map((c, i) => (
                    <Tile key={c} T={T} label={AVIELA_CARD_NAMES[i]} selected={avielaOn && card === c} locked={!pro}
                      onClick={() => wearAviela({ ...look.aviela, card: c })}>
                      <Card p={cardPalette(c, avielaApp)} />
                    </Tile>
                  ))}
                </Row>
              </Group>
            </>
          ) : page === "lantern" ? (
            <>
              <Group T={T}>
                <Row T={T} framed title={t("Record")}>
                  {LANTERN_RECORDS.map(id => (
                    <Tile key={id} T={T} label={LANTERN_RECORD_NAMES[id]} selected={lanternOn && vinyl === id} locked={!pro}
                      onClick={() => wearLantern({ ...look.lantern, record: id })}>
                      <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                        <SpinningDisc size={60} skin={id} />
                      </div>
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
                <Row T={T} framed title={t("Header card")}>
                  {LANTERN_CARDS.map((c, i) => (
                    <Tile key={c} T={T} label={LANTERN_CARD_NAMES[i]} selected={lanternOn && card === c} locked={!pro}
                      onClick={() => wearLantern({ ...look.lantern, card: c })}>
                      <Card p={cardPalette(c, lanternApp)} />
                    </Tile>
                  ))}
                </Row>
              </Group>

              <Group T={T}>
                <Row T={T} framed title={t("Colour")}>
                  {LANTERN_COLOURS.map(c => (
                    <Tile key={c} T={T} label={colourNames[c]} selected={lanternOn && colourNow === c} locked={!pro}
                      onClick={() => wearLantern({ ...look.lantern, colour: c })}>
                      <Screen p={paletteOf(c)} />
                    </Tile>
                  ))}
                </Row>
              </Group>
            </>
          ) : page === "background" ? (
            <div style={{ padding: "4px 16px 0" }}>
              <input ref={picker} type="file" accept="image/*" style={{ display: "none" }} onChange={onPhoto} />
              {bg.photo ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, background: T.surface, borderRadius: 18, padding: 12 }}>
                    <img src={bg.photo} alt="" style={{ width: 56, height: 96, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{t("Photo strength")}</span>
                        <span style={{ fontSize: 13, color: T.muted }}>{Math.round(bg.strength * 100)}%</span>
                      </div>
                      <input className="slider" type="range" min={STRENGTH_MIN} max={STRENGTH_MAX} step={0.01} value={bg.strength}
                        aria-label={t("Photo strength")}
                        onChange={e => previewBackground({ strength: Number(e.target.value) })}
                        style={{ width: "100%", margin: "12px 0 4px", accentColor: T.accent }} />
                      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{t("Less keeps the text easy to read.")}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button onClick={choosePhoto} style={{ ...sh.saveBtn, flex: 1, background: T.surface, color: T.text, fontSize: 14 }}>{t("Another photo")}</button>
                    <button onClick={() => previewBackground({ photo: null })} style={{ ...sh.saveBtn, flex: 1, background: T.surface, color: T.text, fontSize: 14 }}>{t("Remove photo")}</button>
                  </div>
                </>
              ) : (
                <button onClick={choosePhoto} style={{ ...sh.saveBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <IC.Photo />{t("Choose a photo")}
                </button>
              )}
              <div style={{ ...note, padding: "12px 4px 0" }}>
                {t("Your photo goes behind the whole app, under its colour. It stays on this device: it is not synced and not in a backup.")}
              </div>
              {!pro && <div style={{ ...note, padding: "8px 4px 0" }}>{t("Try it as much as you like. Keeping it needs Pro.")}</div>}
            </div>
          ) : page === "colours" ? (
            <Group T={T}>
              <Row T={T} framed title={t("Colour")}>
                {/* The free ones first: black and white, then the rest. */}
                {[...DARKS.filter(d => d.id === FREE.dark), ...LIGHTS.filter(l => l.id === FREE.light),
                  ...DARKS.filter(d => d.id !== FREE.dark), ...LIGHTS.filter(l => l.id !== FREE.light)].map(c => {
                  const isDark = DARKS.includes(c as typeof DARKS[number]);
                  return isDark ? (
                    <Tile key={`d-${c.id}`} T={T} label={c.label} selected={dark && look.dark === c.id} locked={!pro && c.id !== FREE.dark}
                      onClick={() => pickIn("dark", { ...plain(), dark: c.id as DarkShade, flowers: "none" })}>
                      <Screen p={SHADE_PREVIEW.dark(c.id as DarkShade)} />
                    </Tile>
                  ) : (
                    <Tile key={`l-${c.id}`} T={T} label={c.label} selected={!dark && look.light === c.id} locked={!pro && c.id !== FREE.light}
                      onClick={() => pickIn("light", { ...plain(), light: c.id as LightShade, flowers: "none" })}>
                      <Screen p={SHADE_PREVIEW.light(c.id as LightShade)} />
                    </Tile>
                  );
                })}
              </Row>
            </Group>
          ) : page === "card" ? (
            <Group T={T}>
              <Row T={T} framed title={t("Header card")}>
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
          ) : page === "icons" ? (
            <>
              <Group T={T}>
                <Row T={T} framed title={t("App icon")}>
                  {ICONS.map(i => (
                    <Tile key={i.id} T={T} label={i.label} selected={look.icon === i.id} locked={!pro && i.id !== FREE.icon}
                      onClick={() => pick({ icon: i.id })}>
                      <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}><IconArt icon={i.id} size={58} /></div>
                    </Tile>
                  ))}
                </Row>
              </Group>
              <div style={note}>{t("The icon changes when you tap Apply. On some phones it leaves the home screen: add it again from your app list.")}</div>
            </>
          ) : (
            <Group T={T}>
              <Row T={T} framed title={t("Record")}>
                {VINYLS.map(v => (
                  <Tile key={v.id} T={T} label={v.label} selected={vinyl === v.id} locked={!pro && !isFreeVinyl(v.id)}
                    onClick={() => setVinyl(v.id)}>
                    <div style={{ width: 64, height: 64, display: "grid", placeItems: "center" }}>
                      <SpinningDisc size={60} skin={v.id} />
                    </div>
                  </Tile>
                ))}
              </Row>
            </Group>
          )}
        </div>

        {/* Only while something is changed: the way to keep it. With a locked
            option on show and no Pro, that way is Pro (whose page has the ad
            for a day too). */}
        {changed && page === "main" && (
          <div style={{ flexShrink: 0, padding: "12px 20px 22px", borderTop: `1px solid ${T.border}` }}>
            <button onClick={needsPro ? onNeedPro : apply} style={sh.saveBtn}>{keepLabel}</button>
          </div>
        )}

        {asking && <LanternGate onYes={sayAfraid} onNo={sayNotAfraid} onDone={() => setAsking(false)} />}

        {reveal && (
          <StyleReveal kind={reveal.kind} at={reveal.at}
            onCovered={() => { setAsking(false); if (reveal.kind === "aviela") enterAviela(true); else enterLantern(true); }}
            onDone={() => setReveal(null)} />
        )}

        {editing && (
          <FlowerEditor mode={editing} own={look.aviela.own} T={T} onToast={onToast}
            backdrop={scale => <AppCopy stamp={`edit|${stamp}`} width={win.w} height={win.h} scale={scale} bare />}
            onCancel={() => setEditing(null)}
            onDone={own => {
              wearAviela({ ...look.aviela, own, ...(editing === "record" ? { record: "own" as const } : { flowers: "own" as const }) });
              setEditing(null);
            }} />
        )}

        {cropSrc && (
          <CropSheet src={cropSrc} shape="background" T={T} onCancel={() => setCropSrc(null)}
            onUse={d => { previewBackground({ photo: d }); setCropSrc(null); }} />
        )}

        {confirming && (
          <div role="dialog" aria-modal="true" onClick={() => setConfirming(false)} style={{
            position: "fixed", inset: 0, zIndex: 495, background: T.overlayBg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 20, padding: "20px 20px 16px", boxShadow: "0 16px 48px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>{t("Discard changes?")}</div>
              <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.45, margin: "6px 0 18px" }}>{t("What you changed here has not been applied yet.")}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={discard} style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: T.surface, color: T.text, border: `1px solid ${T.border}` }}>{t("Discard")}</button>
                <button onClick={() => setConfirming(false)} style={{ flex: 1, height: 46, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: T.accent, color: T.playBtnFg, border: "none" }}>{t("Keep editing")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
