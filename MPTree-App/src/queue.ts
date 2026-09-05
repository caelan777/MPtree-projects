// ─── QUEUE RULES ─────────────────────────────────────────────────────────────
//
// The Play Next rules, kept out of App.tsx so they can be tested. This is the
// subtlest logic in the app and the easiest to break: it used to live inline in
// two nearly-identical handlers, verified only by playing music by hand.
//
// The thing to understand: recording an id in playNextQueue does NOT change what
// plays. The native service advances the queue it was handed and never consults
// that list, so a pinned track has to be physically moved into the queue or it
// simply never plays next. Everything here is about producing that queue.

/** Anything with a stable id. Keeps this module free of app types. */
export type Queued = { id: string };

/**
 * Where a newly pinned track should land: after the current one, and after any
 * pins already sitting behind it. That second half is what makes repeated Play
 * Next taps keep their tap order instead of each one jumping the last.
 */
export function playNextInsertIndex<T extends Queued>(
  queue: T[],
  currentIndex: number,
  alreadyPinned: readonly string[],
): number {
  let at = currentIndex + 1;
  while (at < queue.length && alreadyPinned.includes(queue[at].id)) at++;
  return at;
}

/**
 * The queue after pinning `toPin` to play next.
 *
 * Returns null when there is nothing sensible to do, which the caller should
 * treat as "leave the queue alone": either nothing was pinned, or the current
 * track is not in the queue at all (so "next" has no meaning).
 *
 * Songs already in the queue are moved rather than duplicated, and the current
 * track can never be queued after itself.
 */
export function planPlayNext<T extends Queued>(
  base: readonly T[],
  currentId: string,
  toPin: readonly T[],
  alreadyPinned: readonly string[],
): T[] | null {
  const pinnable = toPin.filter(s => s.id !== currentId);
  if (pinnable.length === 0) return null;

  const pinIds = new Set(pinnable.map(s => s.id));
  // Drop existing copies first, so re-pinning moves a track instead of leaving
  // the old position behind as a duplicate.
  const without = base.filter(s => !pinIds.has(s.id));

  const currentIndex = without.findIndex(s => s.id === currentId);
  if (currentIndex === -1) return null;

  const at = playNextInsertIndex(without, currentIndex, alreadyPinned);
  return [...without.slice(0, at), ...pinnable, ...without.slice(at)];
}

/**
 * The pin list after those ids were pinned: existing order kept, new ids
 * appended, no duplicates.
 */
export function mergePins(existing: readonly string[], added: readonly string[]): string[] {
  return [...existing, ...added.filter(id => !existing.includes(id))];
}
