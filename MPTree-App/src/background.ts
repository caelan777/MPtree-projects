import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

// ─── BACKGROUND (Pro) ────────────────────────────────────────────────────────
// A photo of the person's own behind the whole app, under a veil of the app's
// colour so the text on it stays readable. How much of the photo comes through
// is theirs to pick ("strength"). Personalise works on it the way it works on
// the look: every change shows at once and only Apply keeps it.
//
// It stays on this device. A photo is large next to everything else the
// account syncs, and a backup is for the library, not for a picture that is
// in the phone's gallery anyway.

export type Background = {
  /** The photo, cut to the screen's shape, as a data URL (WebP, or JPEG
   *  from before 20 Nov 2026). */
  photo: string | null;
  /** How much of the photo shows through the veil: 0.1 to 0.6. */
  strength: number;
  /** One of MPTree's own backgrounds instead of the photo (since 21 Nov
   *  2026). The photo is kept meanwhile, so it can be picked again. */
  preset: BgPreset | null;
};

/** MPTree's own backgrounds: Lantern's light behind the list, dark or light
 *  with the app (lanternFigure.ts lanternBackdrop). */
export const BG_PRESETS = ["lantern"] as const;
export type BgPreset = typeof BG_PRESETS[number];
const isPreset = (v: unknown): v is BgPreset => (BG_PRESETS as readonly unknown[]).includes(v);

export const STRENGTH_MIN = 0.1;
export const STRENGTH_MAX = 0.6;
const DEFAULT: Background = { photo: null, strength: 0.35, preset: null };

const KEY = "mptree_background";
const FILE = "background.txt";

let kept: Background = DEFAULT;
let preview: Background | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const snapshot = () => preview ?? kept;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useBackground(): Background {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

const clamp = (v: number) => Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, v));

export async function loadBackground(): Promise<void> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return;
    const stored = JSON.parse(value) as { on?: boolean; strength?: number; preset?: unknown };
    let photo: string | null = null;
    if (stored.on) {
      const file = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 }).catch(() => null);
      photo = file && typeof file.data === "string" && file.data.startsWith("data:image/") ? file.data : null;
    }
    kept = { photo, strength: clamp(Number(stored.strength) || DEFAULT.strength), preset: isPreset(stored.preset) ? stored.preset : null };
    emit();
  } catch { /* no photo, then */ }
}

/** Shows a change without keeping it. */
export function previewBackground(patch: Partial<Background>): void {
  const next = { ...(preview ?? kept), ...patch };
  preview = { photo: next.photo, strength: clamp(next.strength), preset: next.preset ?? null };
  emit();
}

export function hasBackgroundChanges(): boolean {
  return preview !== null && (preview.photo !== kept.photo || preview.strength !== kept.strength || preview.preset !== kept.preset);
}

/** Whether anything is behind the app: a photo or one of MPTree's own. */
export const hasBackground = (b: Background) => !!b.preset || !!b.photo;

/** Keeps what is on show. */
export async function keepBackground(): Promise<void> {
  if (!preview) return;
  const next = preview;
  preview = null;
  const photoChanged = next.photo !== kept.photo;
  kept = next;
  emit();
  try {
    if (photoChanged) {
      if (next.photo) await Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: next.photo });
      else await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }).catch(() => {});
    }
    await Preferences.set({ key: KEY, value: JSON.stringify({ on: !!next.photo, strength: next.strength, preset: next.preset }) });
  } catch { /* shown for now, and tried again on the next Apply */ }
}

/** Drops what was being tried. */
export function endBackgroundPreview(): void {
  if (!preview) return;
  preview = null;
  emit();
}

/** Losing Pro takes the photo away, like the rest of the look. */
export function dropBackground(): void {
  if (!kept.photo && !kept.preset && !preview) return;
  preview = { ...kept, photo: null, preset: null };
  void keepBackground();
}
