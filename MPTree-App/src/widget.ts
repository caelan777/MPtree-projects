import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { System } from "./plugins";
import type { T } from "./themes";
import type { VinylSkin } from "./look";
import { recordPicture } from "./components/SpinningDisc";

// ─── HOME SCREEN WIDGETS ─────────────────────────────────────────────────────
// What the Widget page (Settings, Home screen widget) decides: which of the
// four widgets its button adds, and their colour. The four are drawn natively
// (WidgetRenderer.java). The colour is for the widget added next: one already
// on the home screen keeps the colour it was added with (Caelan, 27 Nov: a
// widget turned clear when Clear was tapped here). The cover shows as it does in the
// player, always (test build 127 had a switch for it). Kept on this phone only:
// widgets belong to a home screen, not to the account.

// The free ones first, the two of Pro together after them.
export const WIDGET_KINDS = ["bar", "pill", "card", "record"] as const;
export type WidgetKind = typeof WIDGET_KINDS[number];
export const WIDGET_COLOURS = ["app", "black", "white", "clear"] as const;
export type WidgetColour = typeof WIDGET_COLOURS[number];
/** Card and Record, and the Clear colour, are part of Pro. */
export const PRO_KINDS: readonly WidgetKind[] = ["card", "record"];
export type WidgetConfig = { kind: WidgetKind; colour: WidgetColour };

const KEY = "mptree_widget";
export const DEFAULT_WIDGET: WidgetConfig = { kind: "bar", colour: "app" };

let config: WidgetConfig = DEFAULT_WIDGET;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => config;

export function useWidget(): WidgetConfig {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export async function loadWidget(): Promise<WidgetConfig> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const v = JSON.parse(value) as Partial<WidgetConfig>;
      config = {
        kind: (WIDGET_KINDS as readonly string[]).includes(v.kind as string) ? v.kind as WidgetKind : DEFAULT_WIDGET.kind,
        colour: (WIDGET_COLOURS as readonly string[]).includes(v.colour as string) ? v.colour as WidgetColour : DEFAULT_WIDGET.colour,
      };
    }
  } catch { /* the default, then */ }
  System.setWidgetConfig({ colour: config.colour }).catch(() => {});
  listeners.forEach(l => l());
  return config;
}

export function saveWidget(patch: Partial<WidgetConfig>): void {
  config = { ...config, ...patch };
  Preferences.set({ key: KEY, value: JSON.stringify(config) }).catch(() => {});
  if (patch.colour !== undefined) System.setWidgetConfig({ colour: config.colour }).catch(() => {});
  listeners.forEach(l => l());
}

/** The app's colours, for widgets set to "Same as app". Sent when they change. */
let sentPalette = "";
export function sendWidgetPalette(T: T): void {
  const palette = { bg: T.playerBg ?? T.bg, text: T.text, sub: T.textSub, accent: T.accent, accentFg: T.playBtnFg };
  const key = JSON.stringify(palette);
  if (key === sentPalette) return;
  sentPalette = key;
  System.setWidgetConfig({ palette }).catch(() => {});
}

/** Whether Pro is on, for the widgets that are part of it. */
let sentPro: boolean | null = null;
export function sendWidgetPro(pro: boolean): void {
  if (sentPro === pro) return;
  sentPro = pro;
  System.setWidgetConfig({ pro }).catch(() => {});
}

/** The record the app has on, for the Record widget: drawn here the way the
 *  player draws it and handed over as a picture, with its label's colours.
 *  The widget puts the song's cover on the label, or makes the whole record
 *  the cover with the picture disc on, as the player does. */
let sentRecord = "";
export async function sendWidgetRecord(skin: VinylSkin, photoDisc: boolean): Promise<void> {
  const key = `${skin}|${photoDisc}`;
  if (key === sentRecord) return;
  sentRecord = key;
  try {
    const pic = recordPicture(skin);
    const img = new Image();
    img.src = pic.src;
    await img.decode();
    const N = 288;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = N;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.beginPath();
    g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
    g.clip();
    // Under a see-through record (smoke), the dark it sits on in the player.
    g.fillStyle = "#111111";
    g.fillRect(0, 0, N, N);
    if (pic.filter) g.filter = pic.filter;
    g.globalAlpha = pic.opacity;
    g.drawImage(img, 0, 0, N, N);
    const record = canvas.toDataURL("image/png").split(",")[1];
    await System.setWidgetConfig({ record, labelBg: pic.labelBg, labelInk: pic.labelInk, photoDisc });
  } catch {
    sentRecord = "";
  }
}
