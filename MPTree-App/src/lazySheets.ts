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

let lookHere = false;
const loadLook   = () => import("./components/LookSheet").then(m => { lookHere = true; return m.LookSheet; });

/** Personalise is read and can show at once. Until then Settings stays in
 *  view behind it: hiding Settings first showed the songs for a moment when
 *  Personalise was opened in the first seconds after start-up. */
export const lookReady = () => lookHere;
/** Reads Personalise now, for when it is about to be opened. */
export const loadLookSheet = () => loadLook().then(() => {});
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
  // Personalise's first opening waited on decoding every record's picture;
  // decoded now, while nothing happens, it opens at once.
  void Promise.all([import("./look"), import("./components/SpinningDisc")]).then(([l, d]) => {
    for (const v of l.swipeRecords(true)) {
      try { const img = new Image(); img.src = d.recordPicture(v).src; img.decode?.().catch(() => {}); } catch { /* skip */ }
    }
  }).catch(() => {});
}
