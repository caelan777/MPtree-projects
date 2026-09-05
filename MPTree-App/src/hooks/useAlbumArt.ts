import { useCallback, useEffect, useSyncExternalStore } from "react";
import { peekArt, requestArt, subscribeArt } from "../artCache";

/**
 * The embedded cover for a song file, or null while unknown / when it has none.
 *
 * Pass enabled=false when something better is already on screen (a photo the
 * user picked), so we never pay for a cover that would be thrown away.
 *
 * The cache is an external store, so this reads it with useSyncExternalStore
 * rather than mirroring it into local state. That keeps rows that scroll back
 * into view rendering their cover on the first paint instead of a frame of grey
 * followed by a re-render.
 *
 * See src/artCache.ts for why lookups are throttled and cached.
 */
export function useAlbumArt(path: string | undefined, enabled: boolean): string | null {
  const key = enabled ? path : undefined;

  const subscribe = useCallback((onChange: () => void) => {
    if (!key) return () => {};
    return subscribeArt(key, onChange);
  }, [key]);

  const getSnapshot = useCallback(() => (key ? peekArt(key) ?? null : null), [key]);

  const art = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Asking is a side effect, so it stays out of render. requestArt is a no-op
  // for anything already cached or already queued.
  useEffect(() => { if (key) requestArt(key); }, [key]);

  return art;
}
