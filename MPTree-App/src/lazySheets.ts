import { lazy, Suspense, createElement, type ComponentType, type ComponentProps } from "react";

// ─── SHEETS LOADED WHEN NEEDED ─────────────────────────────────────────────
// The big sheets that only open now and then (Personalise, Backup, Cut, the
// equalizer, the photo crop) are not part of the code the app starts with.
// They are fetched a few seconds after start-up, when the app is idle
// (preloadSheets), so by the time anyone opens one it is already there and
// nothing waits. If one is opened before that, it appears as soon as its file
// is read, a moment later; nothing stands in for it, because a stand-in would
// itself flash before the sheet slides up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sheet<C extends ComponentType<any>>(load: () => Promise<C>) {
  const Lazy = lazy(async () => ({ default: await load() }));
  return function LazySheet(props: ComponentProps<C>) {
    return createElement(Suspense, { fallback: null }, createElement(Lazy as ComponentType<ComponentProps<C>>, props));
  };
}

const loadLook   = () => import("./components/LookSheet").then(m => m.LookSheet);
const loadBackup = () => import("./components/BackupSheet").then(m => m.BackupSheet);
const loadCut    = () => import("./components/CutTrackSheet").then(m => m.CutTrackSheet);
const loadEQ     = () => import("./components/EQSheet").then(m => m.EQSheet);
const loadCrop   = () => import("./components/CropSheet").then(m => m.CropSheet);

export const LookSheet     = sheet(loadLook);
export const BackupSheet   = sheet(loadBackup);
export const CutTrackSheet = sheet(loadCut);
export const EQSheet       = sheet(loadEQ);
export const CropSheet     = sheet(loadCrop);

/** Fetches every sheet above in the background. Called once, after start-up. */
export function preloadSheets(): void {
  for (const load of [loadLook, loadBackup, loadCut, loadEQ, loadCrop]) load().catch(() => {});
}
