import { useSyncExternalStore } from "react";
import { Preferences } from "@capacitor/preferences";

// ─── HOW LONG SOMEONE HAS LISTENED ───────────────────────────────────────────
// Only for one card: after ten hours of music, once, a thank-you at the top of
// the songs that mentions Pro (ListenCard). Kept on the phone, never sent.
//
// The page sleeps while the phone plays in the background, so nothing can
// tick. Instead a stretch of playing is timed from the clock: when it starts,
// and when it ends or the page wakes up again. A pause from the notification
// is only seen when the page wakes, so a stretch counts for two hours at most.

const KEY = "mptree_listen";
const SHOW_AT = 10 * 60 * 60 * 1000;
const MAX_STRETCH = 2 * 60 * 60 * 1000;

type Store = { ms: number; closed: boolean };
let store: Store = { ms: 0, closed: true };
let loaded = false;
let since: number | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const save = () => { Preferences.set({ key: KEY, value: JSON.stringify(store) }).catch(() => {}); };

export async function loadListen(): Promise<void> {
  try {
    const r = await Preferences.get({ key: KEY });
    const s = r.value ? JSON.parse(r.value) as Partial<Store> : null;
    store = { ms: Number(s?.ms) || 0, closed: !!s?.closed };
  } catch { store = { ms: 0, closed: false }; }
  loaded = true;
  emit();
}

function flush(restart: boolean) {
  if (since === null) return;
  const now = Date.now();
  const add = Math.min(Math.max(0, now - since), MAX_STRETCH);
  since = restart ? now : null;
  if (!add) return;
  const before = store.ms;
  store = { ...store, ms: before + add };
  save();
  if (before < SHOW_AT && store.ms >= SHOW_AT) emit();
}

/** Called whenever playing starts or stops. */
export function setListening(playing: boolean): void {
  if (playing) { if (since === null) since = Date.now(); }
  else flush(false);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => flush(true));
}

const due = () => loaded && !store.closed && store.ms >= SHOW_AT;
/** Whether the ten-hour card is due: once, until it is closed. */
export function useListenCard(): boolean {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, due, () => false);
}

/** The card is closed for good (its x, or "See Pro"). */
export function closeListenCard(): void {
  store = { ...store, closed: true };
  save();
  emit();
}

