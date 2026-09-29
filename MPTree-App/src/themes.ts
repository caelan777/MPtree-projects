import React from "react";
import type { FilterId, Theme } from "./types";
import type { DarkShade, LightShade, CardShade } from "./look";

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
  // The others are paper with a different hue: every colour keeps paper's
  // lightness and strength of tint, so they sit as quietly as it does. Built
  // in OKLCH; stone carries about half the tint, a cool grey rather than blue.
  stone: {
    accent:"#181b1d", surface:"#e3e9f0", card:"#dee5ec", bg:"#eff3f8",
    muted:"#7b828a", dim:"#d5dde5", border:"#c6cfd9", text:"#181b1d", textSub:"#5d646b",
    sheetBg:"#f4f8fc", playerBg:"#e9eef4", inputBg:"#d9e0e7",
    chipBg:"#e0e6ed", chipBorder:"#c6cfd9", chipColor:"#31353a",
    playBtnBg:"#181b1d", playBtnFg:"#eff3f8", sliderBg:"#bdc7d2",
  },
  // Pastel pink, the one exception: the same lightness as paper but about
  // two and a half times the tint on the light surfaces, asked for by name.
  pink: {
    accent:"#20181b", surface:"#ffdcea", card:"#ffd5e6", bg:"#ffeaf4",
    muted:"#a27183", dim:"#fdccde", border:"#f7bbd1", text:"#20181b", textSub:"#735c64",
    sheetBg:"#fff0f8", playerBg:"#ffe3ef", inputBg:"#fed0e1",
    chipBg:"#ffd8e7", chipBorder:"#f7bbd1", chipColor:"#403035",
    playBtnBg:"#20181b", playBtnFg:"#ffeaf4", sliderBg:"#f1b1c9",
  },
  sage: {
    accent:"#181c17", surface:"#e2ece0", card:"#dce8d9", bg:"#eef5ec",
    muted:"#798676", dim:"#d4e0d1", border:"#c4d4c1", text:"#181c17", textSub:"#5c6759",
    sheetBg:"#f4f9f2", playerBg:"#e8f1e6", inputBg:"#d7e3d4",
    chipBg:"#dee9dc", chipBorder:"#c4d4c1", chipColor:"#30372e",
    playBtnBg:"#181c17", playBtnFg:"#eef5ec", sliderBg:"#bbccb7",
  },
};

/** The palette for a ground and the shades picked for it. */
export function paletteFor(theme: Theme, dark: DarkShade, light: LightShade): T {
  return theme === "dark"
    ? { ...DARK,  ...DARK_SHADES[dark] }
    : { ...LIGHT, ...LIGHT_SHADES[light] };
}

// ─── HEADER CARD (Pro) ───────────────────────────────────────────────────────
// The card at the top can wear any shade of either mode, whatever the app is
// in. Everything drawn inside it then takes its colours from that palette, so
// a light card on a dark app has dark text. Paint only: the card's size, padding
// and one-pixel border never change, because it animates between heights it
// measures from itself.

/** The palette the header card is drawn with. */
export function cardPalette(shade: CardShade, app: T): T {
  if (shade === "default") return app;
  const [ground, name] = shade.split(":") as ["dark" | "light", string];
  return ground === "dark"
    ? { ...DARK,  ...DARK_SHADES[name as DarkShade] }
    : { ...LIGHT, ...LIGHT_SHADES[name as LightShade] };
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