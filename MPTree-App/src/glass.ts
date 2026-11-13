import type { CSSProperties } from "react";
import type { T } from "./themes";

// ─── LIQUID GLASS ────────────────────────────────────────────────────────────
// The third style with a name, between Aviela and Lantern. Still black and
// white: soft grey light drifts behind the app, and the header card, the
// player and the sheets are frosted glass over it.
//
// Nearly every colour in MPTree is an inline style, so there is no class to
// hang the blur on. Instead the glass colours carry a mark nobody else uses
// (one colour channel a step off), and one stylesheet finds them by it and
// frosts them (GLASS_CSS). Only the few big surfaces get it, never the rows of a list, so
// scrolling a long library stays smooth.

const DARK_GLASS: Partial<T> = {
  bg: "#050506",
  card: "rgba(255, 254, 255, 0.07)",
  playerBg: "rgba(255, 254, 255, 0.08)",
  sheetBg: "rgba(24, 24, 29, 0.86)",
  surface: "rgba(255, 255, 255, 0.06)",
  chipBg: "rgba(255, 254, 255, 0.08)",
  inputBg: "rgba(255, 255, 255, 0.09)",
  border: "rgba(255, 255, 255, 0.14)",
  chipBorder: "rgba(255, 255, 255, 0.14)",
  dim: "rgba(255, 255, 255, 0.12)",
  overlayBg: "rgba(0, 0, 0, 0.55)",
};

const LIGHT_GLASS: Partial<T> = {
  bg: "#e7e8ec",
  card: "rgba(254, 255, 255, 0.55)",
  playerBg: "rgba(254, 255, 255, 0.6)",
  sheetBg: "rgba(250, 251, 252, 0.86)",
  surface: "rgba(255, 255, 255, 0.45)",
  chipBg: "rgba(254, 255, 255, 0.55)",
  inputBg: "rgba(255, 255, 255, 0.6)",
  border: "rgba(0, 0, 0, 0.08)",
  chipBorder: "rgba(0, 0, 0, 0.08)",
  dim: "rgba(0, 0, 0, 0.07)",
  overlayBg: "rgba(0, 0, 0, 0.35)",
};

export function glassPalette<P extends T>(p: P, dark: boolean): P {
  return { ...p, ...(dark ? DARK_GLASS : LIGHT_GLASS) };
}

/** The light behind the glass: three soft blobs of grey, still. */
export function glassBackdrop(dark: boolean): CSSProperties {
  const a = dark ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.95)";
  const b = dark ? "rgba(150,150,160,0.16)" : "rgba(160,162,172,0.55)";
  const c = dark ? "rgba(255,255,255,0.10)" : "rgba(120,122,132,0.35)";
  return {
    backgroundImage: [
      `radial-gradient(42vmax 42vmax at 12% 8%, ${a}, transparent 70%)`,
      `radial-gradient(50vmax 50vmax at 95% 45%, ${b}, transparent 70%)`,
      `radial-gradient(46vmax 46vmax at 25% 95%, ${c}, transparent 70%)`,
    ].join(","),
    backgroundAttachment: "fixed",
  };
}

// The marks: one colour channel a step off white (or off the sheet grey), which
// nobody sees and the browser keeps exactly, unlike an alpha, which it rounds.
const DARK_PANE = "255, 254, 255", LIGHT_PANE = "254, 255, 255";
const FROSTED = [DARK_PANE, LIGHT_PANE, "24, 24, 29", "250, 251, 252"];
const sel = (marks: string[]) => marks.map(f => `[data-glass] [style*="${f}"]`).join(",");

/** Frosts every surface wearing a glass colour, with a bright top edge. */
export const GLASS_CSS = `
${sel(FROSTED)} {
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
}
[data-glass="dark"] [style*="background: rgba(${DARK_PANE}"] {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.35) !important;
}
[data-glass="light"] [style*="background: rgba(${LIGHT_PANE}"] {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.04), 0 10px 30px rgba(40,42,52,0.12) !important;
}
`;
