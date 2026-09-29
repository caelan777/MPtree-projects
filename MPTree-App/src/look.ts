import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";

// ─── LOOK ────────────────────────────────────────────────────────────────────
// The Pro personalisation: which record, which header card, which shade of dark
// and of light, which app icon. One small store rather than five useStates in
// App.tsx, because the record lives three components down (PlayerExpandSheet,
// SpinningDisc) and threading five props through for it is how App.tsx got to
// four thousand lines.
//
// There is a saved look and, while the Personalise sheet is open, a preview.
// Everyone can try everything; without Pro the preview is dropped when the
// sheet closes, so trying is free and keeping is what Pro buys.

export type VinylSkin = "classic" | "white" | "smoke" | "marble" | "picture";
export type CardSkin  = "solid" | "glass" | "line" | "float" | "cover";
export type DarkShade = "classic" | "amoled" | "graphite";
export type LightShade = "classic" | "paper" | "stone";
export type AppIcon   = "classic" | "light" | "vinyl" | "stamp";

export type Look = {
  vinyl: VinylSkin;
  card: CardSkin;
  dark: DarkShade;
  light: LightShade;
  icon: AppIcon;
};

export const DEFAULT_LOOK: Look = { vinyl: "classic", card: "solid", dark: "classic", light: "classic", icon: "classic" };

const KEY = "mptree_look";

let saved: Look = DEFAULT_LOOK;
let preview: Look | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function current(): Look { return preview ?? saved; }

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** The look to draw with: the preview while one is open, else the saved one. */
export function useLook(): Look {
  return useSyncExternalStore(subscribe, current, current);
}

export function getLook(): Look { return current(); }
export function getSavedLook(): Look { return saved; }

export async function loadLook(): Promise<Look> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) saved = { ...DEFAULT_LOOK, ...JSON.parse(value) };
  } catch { /* a broken entry just means the default look */ }
  emit();
  return saved;
}

/** Keeps a change for good. Only called when the person has Pro. */
export function saveLook(patch: Partial<Look>): Look {
  saved = { ...saved, ...patch };
  preview = null;
  Preferences.set({ key: KEY, value: JSON.stringify(saved) }).catch(() => {});
  emit();
  return saved;
}

/** Shows a change without keeping it. */
export function previewLook(patch: Partial<Look>): void {
  preview = { ...current(), ...patch };
  emit();
}

/** Drops whatever was being tried and goes back to the saved look. */
export function endPreview(): void {
  if (preview === null) return;
  preview = null;
  emit();
}

/** Losing Pro (a refund, or locking a test build again) puts the free look back. */
export function resetLook(): void {
  saved = DEFAULT_LOOK;
  preview = null;
  Preferences.remove({ key: KEY }).catch(() => {});
  emit();
}
