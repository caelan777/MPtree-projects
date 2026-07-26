import React from "react";
import type { FilterId } from "./types";

// ─── THEMES ──────────────────────────────────────────────────────────────────

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
  { id:"alphabetical", label:"A–Z"          },
  { id:"artist",       label:"Artist A–Z"   },
  { id:"favorites",    label:"Favorites"    },
];