import type { CSSProperties } from "react";
import type { T } from "./themes";
import type { GlassAccent } from "./look";

// ─── LIQUID GLASS ────────────────────────────────────────────────────────────
// The third style with a name, between Aviela and Lantern. Every card, sheet,
// row of Settings, chip and field is a pane of thick frosted glass: the light
// behind it blurred and brightened, a bright edge round it that catches the
// light at the top left, as in the glass of a phone's lock screen. Behind the
// glass is soft light in the dark, or the person's own background photo,
// which is where it looks best. The record is the plain black one. Its accent
// is a choice: plain black and white, or one colour.
//
// Nearly every colour in MPTree is an inline style, so there is no class to
// hang the blur on. Instead the glass colours carry a mark nobody else uses
// (one colour channel a step off), and one stylesheet finds them by it and
// frosts them (GLASS_CSS). Song rows have no ground of their own, so a long
// list does not blur row by row and scrolls as smoothly as ever.

// The marks. Panes: a channel a step off white. Sheets: their own grey.
const DARK_PANE = "255, 254, 255", LIGHT_PANE = "254, 255, 255";
const DARK_SHEET = "28, 28, 33", LIGHT_SHEET = "246, 247, 250";
const pane = (mark: string, a: number) => `rgba(${mark}, ${a})`;

const DARK_GLASS: Partial<T> = {
  bg: "#050506",
  card: pane(DARK_PANE, 0.1),
  playerBg: pane(DARK_PANE, 0.12),
  surface: pane(DARK_PANE, 0.08),
  chipBg: pane(DARK_PANE, 0.1),
  inputBg: pane(DARK_PANE, 0.1),
  sheetBg: pane(DARK_SHEET, 0.5),
  border: "rgba(255, 255, 255, 0.22)",
  chipBorder: "rgba(255, 255, 255, 0.22)",
  dim: "rgba(255, 255, 255, 0.14)",
  overlayBg: "rgba(0, 0, 0, 0.3)",
};

const LIGHT_GLASS: Partial<T> = {
  bg: "#dfe0e5",
  card: pane(LIGHT_PANE, 0.5),
  playerBg: pane(LIGHT_PANE, 0.55),
  surface: pane(LIGHT_PANE, 0.42),
  chipBg: pane(LIGHT_PANE, 0.5),
  inputBg: pane(LIGHT_PANE, 0.55),
  sheetBg: pane(LIGHT_SHEET, 0.6),
  border: "rgba(255, 255, 255, 0.75)",
  chipBorder: "rgba(255, 255, 255, 0.75)",
  dim: "rgba(0, 0, 0, 0.07)",
  overlayBg: "rgba(0, 0, 0, 0.2)",
};

/** Each accent in the dark and in the light: the colour and the ink on it,
 *  the tint it gives the light behind the glass, and its swatch. */
export const GLASS_ACCENT: Record<GlassAccent, { dark: [string, string]; light: [string, string]; glow: string | null; swatch: string }> = {
  mono:   { dark: ["#ffffff", "#000000"], light: ["#000000", "#ffffff"], glow: null, swatch: "#ffffff" },
  violet: { dark: ["#c9b6ff", "#34188f"], light: ["#6b45e0", "#ffffff"], glow: "124,77,255", swatch: "#a68bff" },
  blue:   { dark: ["#a9d4ff", "#0b3a73"], light: ["#1f6fe0", "#ffffff"], glow: "40,130,255", swatch: "#6fb3ff" },
  pink:   { dark: ["#ffb3d1", "#7a1240"], light: ["#d63a7a", "#ffffff"], glow: "255,70,150", swatch: "#ff7fb2" },
  green:  { dark: ["#a6f0c6", "#0b4a2a"], light: ["#1e9e5a", "#ffffff"], glow: "40,210,120", swatch: "#5fe09a" },
  amber:  { dark: ["#ffd28a", "#5a3000"], light: ["#c77700", "#ffffff"], glow: "255,160,40", swatch: "#ffbf55" },
};

export function glassPalette<P extends T>(p: P, dark: boolean, accent: GlassAccent = "mono"): P {
  const a = GLASS_ACCENT[accent];
  const [colour, ink] = dark ? a.dark : a.light;
  return {
    ...p, ...(dark ? DARK_GLASS : LIGHT_GLASS),
    accent: colour, playBtnBg: colour, playBtnFg: ink,
    // A colour of its own also takes shuffle and selection, as Aviela's pink does.
    ...(accent === "mono" ? null : { violet: colour }),
  };
}

/** The light behind the glass when there is no photo: soft, wide pools of
 *  light in the dark (or of shade in the light), and the accent's own glow.
 *  No shapes: the glass is the thing to look at. */
export function glassBackdrop(dark: boolean, accent: GlassAccent = "mono"): CSSProperties {
  const glow = GLASS_ACCENT[accent].glow;
  const light = dark ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.95)";
  const shade = dark ? "rgba(255,255,255,0.13)" : "rgba(110,112,124,0.35)";
  return {
    backgroundImage: [
      `radial-gradient(70vmax 55vmax at 0% 0%, ${light}, transparent 65%)`,
      `radial-gradient(60vmax 50vmax at 100% 100%, ${glow ? `rgba(${glow},${dark ? 0.4 : 0.28})` : dark ? "rgba(255,255,255,0.18)" : shade}, transparent 65%)`,
      `radial-gradient(45vmax 35vmax at 100% 30%, ${shade}, transparent 70%)`,
    ].join(","),
    backgroundAttachment: "fixed",
  };
}

const any = (marks: string[]) => marks.map(m => `[data-glass] [style*="rgba(${m}"]`).join(",");

/** Frosts every surface wearing a glass colour: blurred, brightened, with a
 *  bright edge that is strongest at the top left, as glass catches light. */
export const GLASS_CSS = `
${any([DARK_PANE, LIGHT_PANE])} {
  -webkit-backdrop-filter: blur(28px) saturate(180%) brightness(1.08);
  backdrop-filter: blur(28px) saturate(180%) brightness(1.08);
}
${any([DARK_SHEET, LIGHT_SHEET])} {
  -webkit-backdrop-filter: blur(40px) saturate(170%);
  backdrop-filter: blur(40px) saturate(170%);
}
[data-glass="dark"] [style*="rgba(${DARK_PANE}"], [data-glass="dark"] [style*="rgba(${DARK_SHEET}"] {
  box-shadow: inset 1.5px 1.5px 0 rgba(255,255,255,0.32), inset -1px -1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.10), 0 8px 28px rgba(0,0,0,0.28) !important;
}
[data-glass="light"] [style*="rgba(${LIGHT_PANE}"], [data-glass="light"] [style*="rgba(${LIGHT_SHEET}"] {
  box-shadow: inset 1.5px 1.5px 0 rgba(255,255,255,0.95), inset -1px -1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.35), 0 8px 28px rgba(40,42,52,0.12) !important;
}
`;
