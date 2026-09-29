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
  // Deep purple. Violet still means shuffle and selection here, so it is
  // lifted a step to stay visible on a purple ground.
  purple: {
    bg:"#120a1f", surface:"#1c1230", card:"#190f2b", playerBg:"#170e28", sheetBg:"#1f1433",
    muted:"#9a8cb5", textSub:"#9a8cb5", dim:"#2a1d42", border:"#34254f",
    inputBg:"#2a1d42", chipBg:"#1f1433", chipBorder:"#34254f", chipColor:"#ddd3f0",
    sliderBg:"#34254f", overlayBg:"rgba(8,4,16,0.78)", violet:"#a78bfa",
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
  // Soft pink.
  pink: {
    accent:"#2a141b", surface:"#f8e4ea", card:"#f6dfe6", bg:"#fdf1f4",
    muted:"#a07886", dim:"#f1d5de", border:"#eac4d0", text:"#2a141b", textSub:"#7a5561",
    sheetBg:"#fff7f9", playerBg:"#fbeaf0", inputBg:"#f3d9e1",
    chipBg:"#f8e4ea", chipBorder:"#eac4d0", chipColor:"#4a2a35",
    playBtnBg:"#2a141b", playBtnFg:"#fdf1f4", sliderBg:"#e2b8c6",
  },
  // Sage green, the deeper of the light shades.
  sage: {
    accent:"#14200f", surface:"#d9e4d6", card:"#d5e0d2", bg:"#e6ede4",
    muted:"#6f8168", dim:"#cbd8c7", border:"#bccdb7", text:"#14200f", textSub:"#4f6049",
    sheetBg:"#eef3ec", playerBg:"#dfe8dc", inputBg:"#cfdccb",
    chipBg:"#d9e4d6", chipBorder:"#bccdb7", chipColor:"#243222",
    playBtnBg:"#14200f", playBtnFg:"#e6ede4", sliderBg:"#b3c6ad",
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