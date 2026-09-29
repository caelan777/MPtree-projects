import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";

// ─── LOOK ────────────────────────────────────────────────────────────────────
// The Pro personalisation: which shade of dark and of light, what colour the
// header card is in each, which record, which app icon. One small store rather
// than a row of useStates in App.tsx, because the record lives three components
// down (PlayerExpandSheet, SpinningDisc) and the loading screen reads it too.
//
// Dark mode and light mode are personalised separately: each has its own shade
// and its own header card, so switching modes switches the whole look.

export type VinylSkin  = "classic" | "white" | "smoke" | "marble";
export type DarkShade  = "classic" | "amoled" | "graphite" | "purple" | "pink";
export type LightShade = "classic" | "paper" | "stone" | "pink" | "sage";
export type AppIcon    = "classic" | "light" | "vinyl" | "stamp";
/** The header card follows the app ("default") or wears any shade of either
 *  mode, so a light card on a dark app is allowed. */
export type CardShade  = "default" | `dark:${DarkShade}` | `light:${LightShade}`;

export type Look = {
  vinyl: VinylSkin;
  dark: DarkShade;
  light: LightShade;
  cardDark: CardShade;
  cardLight: CardShade;
  icon: AppIcon;
  /** Tapping the record in the player turns it into a picture disc of the
   *  cover. Free, and remembered. */
  photoDisc: boolean;
};

export const DEFAULT_LOOK: Look = {
  vinyl: "classic", dark: "classic", light: "classic",
  cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false,
};

/** What anyone gets without Pro. */
export const FREE = { vinyl: "classic", dark: "classic", light: "classic", card: "default", icon: "classic" } as const;

const KEY = "mptree_look";

// The saved look, and while the Personalise sheet is open, a preview of what is
// being tried. Without Pro anything can be tried; the preview is dropped when
// the sheet closes, unless Pro is bought first.
let look: Look = DEFAULT_LOOK;
let preview: Look | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const snapshot = () => preview ?? look;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useLook(): Look {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getLook(): Look { return preview ?? look; }
export function isPreviewing(): boolean { return preview !== null; }

export async function loadLook(): Promise<Look> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (value) {
      const stored = JSON.parse(value);
      look = { ...DEFAULT_LOOK, ...stored };
      // Picture disc used to be one of the records; it is the tap now.
      if ((look.vinyl as string) === "picture") look = { ...look, vinyl: "classic", photoDisc: true };
      if (!(["classic", "white", "smoke", "marble"] as string[]).includes(look.vinyl)) look = { ...look, vinyl: "classic" };
      // The first test build had one card skin (glass, line...) for both modes.
      if (typeof look.cardDark !== "string" || !/^(default|dark:|light:)/.test(look.cardDark)) look = { ...look, cardDark: "default" };
      if (typeof look.cardLight !== "string" || !/^(default|dark:|light:)/.test(look.cardLight)) look = { ...look, cardLight: "default" };
    }
  } catch { /* a broken entry just means the default look */ }
  emit();
  return look;
}

export function saveLook(patch: Partial<Look>): Look {
  look = { ...look, ...patch };
  // Something kept while trying other things stays part of the preview too.
  if (preview) preview = { ...preview, ...patch };
  Preferences.set({ key: KEY, value: JSON.stringify(look) }).catch(() => {});
  emit();
  return look;
}

/** Shows a change without keeping it. */
export function previewLook(patch: Partial<Look>): void {
  preview = { ...(preview ?? look), ...patch };
  emit();
}

/** Keeps what is being previewed, once it may be kept (Pro was bought). */
export function keepPreview(): void {
  if (!preview) return;
  const kept = preview;
  preview = null;
  saveLook(kept);
}

/** Drops what was being tried. */
export function endPreview(): void {
  if (!preview) return;
  preview = null;
  emit();
}

/** Losing Pro (a refund, or locking a test build again) puts the free look
 *  back. The picture disc tap is free, so it stays as it was. */
export function resetLook(): void {
  preview = null;
  saveLook({ ...DEFAULT_LOOK, photoDisc: look.photoDisc });
}
