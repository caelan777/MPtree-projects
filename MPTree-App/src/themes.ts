import React from "react";
import type { FilterId, Theme } from "./types";
import type { DarkShade, LightShade, CardSkin } from "./look";

// ─── THEMES ──────────────────────────────────────────────────────────────────

// `heart` is no longer the colour of the like state. The heart follows the
// accent now, like the rest of the interface, and liked is shown by filling
// the shape rather than by colouring it. The token is kept because the cut
// screen uses it for its preview playhead, which is a genuine "you are here"
// marker and the one place a warm colour still earns its place.
export const DARK = {
  accent:"#FFFFFF", surface:"#111111", card:"#141414", bg:"#000000",
  muted:"#777777", dim:"#252525", border:"#2a2a2a",
  text:"#ffffff", textSub:"#777777",
  heart:"#e8445a", violet:"#7C3AED", repeat:"#0EA5E9",
  sheetBg:"#141414", overlayBg:"rgba(0,0,0,0.78)", playerBg:"#0c0c0c",
  inputBg:"#252525", chipBg:"#141414", chipBorder:"#2a2a2a", chipColor:"#cccccc",
  playBtnBg:"#ffffff", playBtnFg:"#000000",
  binBg:"#1a0508", binBorder:"#3a1217", sliderBg:"#2a2a2a",
};

export const LIGHT = {
  accent:"#000000", surface:"#f5f5f5", card:"#efefef", bg:"#ffffff",
  muted:"#888888", dim:"#e0e0e0", border:"#d8d8d8",
  text:"#111111", textSub:"#666666",
  heart:"#e8445a", violet:"#7C3AED", repeat:"#0EA5E9",
  sheetBg:"#ffffff", overlayBg:"rgba(0,0,0,0.5)", playerBg:"#f9f9f9",
  inputBg:"#e8e8e8", chipBg:"#eeeeee", chipBorder:"#d8d8d8", chipColor:"#333333",
  playBtnBg:"#111111", playBtnFg:"#ffffff",
  binBg:"#fff0f2", binBorder:"#f5c0c8", sliderBg:"#cccccc",
};

export type T = typeof DARK;

// ─── SHADES (Pro) ────────────────────────────────────────────────────────────
// Other takes on the same two grounds. Each is still black and white in spirit:
// a darker dark, a softer dark, a warmer light, a cooler light. Only the
// neutrals move; the accent keeps inverting with the ground, and violet, rose
// and sky keep their one job each.
const DARK_SHADES: Record<DarkShade, Partial<T>> = {
  classic: {},
  // True black everywhere, for OLED screens: the pixels are off.
  amoled: {
    surface:"#0a0a0a", card:"#000000", playerBg:"#000000", sheetBg:"#0a0a0a",
    dim:"#161616", border:"#1f1f1f", inputBg:"#161616",
    chipBg:"#0a0a0a", chipBorder:"#1f1f1f", sliderBg:"#1f1f1f",
  },
  // Charcoal instead of black: easier on the eyes in a lit room.
  graphite: {
    bg:"#17181b", surface:"#202125", card:"#1d1e22", playerBg:"#1b1c20", sheetBg:"#222327",
    muted:"#8b8c92", textSub:"#8b8c92", dim:"#2d2e33", border:"#35363c",
    inputBg:"#2d2e33", chipBg:"#222327", chipBorder:"#35363c", chipColor:"#d2d3d8",
    sliderBg:"#35363c", overlayBg:"rgba(10,10,12,0.72)",
  },
};

const LIGHT_SHADES: Record<LightShade, Partial<T>> = {
  classic: {},
  // Warm off-white, like the paper sleeve a record comes in.
  paper: {
    accent:"#1d1a15", surface:"#efe8da", card:"#ebe3d3", bg:"#f7f2e8",
    muted:"#8a806f", dim:"#e3dbca", border:"#d8cdb8", text:"#1d1a15", textSub:"#6b6253",
    sheetBg:"#fbf7ef", playerBg:"#f3ede1", inputBg:"#e6dece",
    chipBg:"#ece5d6", chipBorder:"#d8cdb8", chipColor:"#3a342a",
    playBtnBg:"#1d1a15", playBtnFg:"#f7f2e8", sliderBg:"#d0c5ae",
  },
  // Cool grey, a light mode that is not a white page.
  stone: {
    accent:"#121417", surface:"#dfe1e4", card:"#dcdee2", bg:"#e9ebee",
    muted:"#7b8089", dim:"#d2d5da", border:"#c6cad0", text:"#121417", textSub:"#5d626b",
    sheetBg:"#f2f3f5", playerBg:"#e4e6e9", inputBg:"#d5d8dd",
    chipBg:"#dfe1e4", chipBorder:"#c6cad0", chipColor:"#2b2f35",
    playBtnBg:"#121417", playBtnFg:"#e9ebee", sliderBg:"#c1c5cc",
  },
};

/** The palette for a ground and the shades picked for it. */
export function paletteFor(theme: Theme, dark: DarkShade, light: LightShade): T {
  return theme === "dark"
    ? { ...DARK,  ...DARK_SHADES[dark] }
    : { ...LIGHT, ...LIGHT_SHADES[light] };
}

// ─── HEADER CARD SKINS (Pro) ─────────────────────────────────────────────────
// Only paint: background, border colour, shadow. Never size, padding or border
// width. The header card animates between heights it measures from itself, and
// its inset maths counts exactly one pixel of border top and bottom, so a skin
// that changed any dimension would make the list jump under it.

/** "#rrggbb" or "rgb(r, g, b)" to [r, g, b]. */
function rgbOf(c: string): [number, number, number] {
  if (c.startsWith("#") && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}
const alpha = (c: string, a: number) => { const [r, g, b] = rgbOf(c); return `rgba(${r}, ${g}, ${b}, ${a})`; };
const mix = (a: string, b: string, w: number) => {
  const [r1, g1, b1] = rgbOf(a), [r2, g2, b2] = rgbOf(b);
  const m = (x: number, y: number) => Math.round(x * w + y * (1 - w));
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
};

/** tint: the colour of what is playing, for the "cover" skin; null without. */
export function cardSkinStyle(skin: CardSkin, T: T, dark: boolean, tint: string | null): React.CSSProperties {
  switch (skin) {
    case "glass":
      return {
        background: alpha(T.playerBg, dark ? 0.66 : 0.7),
        backdropFilter: "blur(18px) saturate(1.3)",
        WebkitBackdropFilter: "blur(18px) saturate(1.3)",
        border: `1px solid ${alpha(T.text, dark ? 0.12 : 0.1)}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      };
    case "line":
      return { background: T.bg, border: `1px solid ${alpha(T.text, 0.55)}`, boxShadow: "none" };
    case "float":
      return {
        background: T.surface, border: "1px solid transparent",
        boxShadow: dark ? "0 18px 48px rgba(0,0,0,0.75)" : "0 14px 40px rgba(0,0,0,0.16)",
      };
    case "cover":
      if (tint) {
        return {
          background: mix(tint, T.playerBg, dark ? 0.32 : 0.22),
          border: `1px solid ${mix(tint, T.border, 0.45)}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          transition: "background 0.6s ease, border-color 0.6s ease",
        };
      }
      break;
  }
  return { background: T.playerBg, border: `1px solid ${T.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.45)" };
}

/** For the swatches in the Personalise sheet. */
export const SHADE_PREVIEW = {
  dark:  (d: DarkShade)  => ({ ...DARK,  ...DARK_SHADES[d] }),
  light: (l: LightShade) => ({ ...LIGHT, ...LIGHT_SHADES[l] }),
};

// ─── MOTION ──────────────────────────────────────────────────────────────────
// How the folding header moves. Every piece that moves with it uses this one
// string: the card, the mini-player, the list paddings, the two floating
// buttons, the Playlists spacers, the movable collapse button. App.tsx and
// PlaylistsView.tsx each used to carry their own copy of the literal, which is
// two places for the same number to drift apart in.
export const CHROME_MOTION = "0.34s cubic-bezier(0.22, 1, 0.36, 1)";

export function makeSH(T: T): Record<string, React.CSSProperties> {
  return {
    overlay:  { position:"fixed", inset:0, background:T.overlayBg, zIndex:400, display:"flex", alignItems:"flex-end" },
    sheet:    { background:T.sheetBg, borderRadius:"20px 20px 0 0", width:"100%", paddingBottom:36 },
    handle:   { width:36, height:4, background:T.dim, borderRadius:2, margin:"12px auto 0" },
    hdr:      { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px 12px" },
    xBtn:     { background:"transparent", border:"none", color:T.muted, cursor:"pointer", padding:4, display:"flex" },
    lbl:      { fontSize:11, color:T.muted, letterSpacing:"0.08em", textTransform:"uppercase" as const, marginTop:18, marginBottom:7 },
    inp:      { width:"100%", background:T.inputBg, border:"none", borderRadius:10, padding:"12px 14px", color:T.text, fontSize:15, outline:"none", boxSizing:"border-box" as const },
    photoRow: { display:"flex", alignItems:"center", background:T.inputBg, borderRadius:10, padding:"12px 14px", cursor:"pointer" },
    saveBtn:  { width:"100%", padding:"14px", background:T.accent, color:T.playBtnFg, border:"none", borderRadius:12, fontSize:15, fontWeight:"700", cursor:"pointer" },
  };
}

export const FILTER_OPTIONS: { id: FilterId; label: string }[] = [
  { id:"newest",       label:"Newest First" },
  { id:"oldest",       label:"Oldest First" },
  { id:"alphabetical", label:"A-Z"          },
  { id:"artist",       label:"Artist A-Z"   },
  { id:"favorites",    label:"Favorites"    },
];