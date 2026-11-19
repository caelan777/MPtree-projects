import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { System } from "./plugins";
import type { T } from "./themes";

// ─── HOME SCREEN WIDGETS ─────────────────────────────────────────────────────
// What the Widget page (Settings, Home screen widget) decides: which of the
// four widgets its button adds, their colour, and whether they show the cover.
// The four are drawn natively (WidgetRenderer.java); colour and cover go there
// at once and change every MPTree widget already on the home screen. Kept on
// this phone only: widgets belong to a home screen, not to the account.

export const WIDGET_KINDS = ["bar", "card", "record", "pill"] as const;
export type WidgetKind = typeof WIDGET_KINDS[number];
export const WIDGET_COLOURS = ["app", "black", "white", "clear"] as const;
export type WidgetColour = typeof WIDGET_COLOURS[number];
export type WidgetConfig = { kind: WidgetKind; colour: WidgetColour; cover: boolean };

const KEY = "mptree_widget";
export const DEFAULT_WIDGET: WidgetConfig = { kind: "card", colour: "app", cover: true };

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
        cover: typeof v.cover === "boolean" ? v.cover : DEFAULT_WIDGET.cover,
      };
    }
  } catch { /* the default, then */ }
  System.setWidgetConfig({ colour: config.colour, cover: config.cover }).catch(() => {});
  listeners.forEach(l => l());
  return config;
}

export function saveWidget(patch: Partial<WidgetConfig>): void {
  config = { ...config, ...patch };
  Preferences.set({ key: KEY, value: JSON.stringify(config) }).catch(() => {});
  if (patch.colour !== undefined || patch.cover !== undefined) {
    System.setWidgetConfig({ colour: config.colour, cover: config.cover }).catch(() => {});
  }
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
