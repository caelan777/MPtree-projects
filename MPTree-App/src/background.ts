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
  /** The photo, cut to the screen's shape, as a JPEG data URL. */
  photo: string | null;
  /** How much of the photo shows through the veil: 0.1 to 0.6. */
  strength: number;
};

export const STRENGTH_MIN = 0.1;
export const STRENGTH_MAX = 0.6;
const DEFAULT: Background = { photo: null, strength: 0.35 };

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
    const stored = JSON.parse(value) as { on?: boolean; strength?: number };
    let photo: string | null = null;
    if (stored.on) {
      const file = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
      photo = typeof file.data === "string" && file.data.startsWith("data:image/") ? file.data : null;
    }
    kept = { photo, strength: clamp(Number(stored.strength) || DEFAULT.strength) };
    emit();
  } catch { /* no photo, then */ }
}

/** Shows a change without keeping it. */
export function previewBackground(patch: Partial<Background>): void {
  const next = { ...(preview ?? kept), ...patch };
  preview = { photo: next.photo, strength: clamp(next.strength) };
  emit();
}

export function hasBackgroundChanges(): boolean {
  return preview !== null && (preview.photo !== kept.photo || preview.strength !== kept.strength);
}

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
    await Preferences.set({ key: KEY, value: JSON.stringify({ on: !!next.photo, strength: next.strength }) });
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
  if (!kept.photo && !preview) return;
  preview = { ...kept, photo: null };
  void keepBackground();
}
