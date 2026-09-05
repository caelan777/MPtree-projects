// ─── LYRICS ──────────────────────────────────────────────────────────────────
//
// Parsing only. Pure, so it can be tested without a player or a device.
//
// The .lrc format is the de facto standard for lyrics that follow along with
// audio: each line is prefixed with one or more timestamps.
//
//   [ar:Artist]            metadata header, ignored
//   [00:12.50]First line
//   [00:15.20][01:02.10]A line that recurs
//
// A file with no timestamps is perfectly normal too, and is shown as plain text.

export type LyricLine = {
  /** Milliseconds from the start of the track. */
  timeMs: number;
  text: string;
};

/** `[ar:...]`, `[ti:...]` and friends: a tag, not a lyric. */
const META_ONLY = /^\s*\[[a-z]+:[^\]]*\]\s*$/i;
const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Timed lines, sorted, or null when the text carries no timestamps at all.
 *
 * A line may carry several timestamps, meaning it recurs; each becomes its own
 * entry, which is what makes a repeated chorus highlight every time round.
 */
export function parseLrc(text: string): LyricLine[] | null {
  if (!text) return null;
  const out: LyricLine[] = [];

  for (const raw of text.split(/\r?\n/)) {
    if (META_ONLY.test(raw)) continue;

    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = STAMP.exec(raw)) !== null) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      // A two-digit fraction is centiseconds, three is milliseconds. Treating
      // "50" as 50ms rather than 500ms would drift every line early.
      const frac = m[3] ?? "";
      const ms = frac.length === 3 ? Number(frac)
               : frac.length === 2 ? Number(frac) * 10
               : frac.length === 1 ? Number(frac) * 100
               : 0;
      stamps.push(min * 60_000 + sec * 1000 + ms);
    }
    if (stamps.length === 0) continue;

    const body = raw.replace(STAMP, "").trim();
    for (const timeMs of stamps) out.push({ timeMs, text: body });
  }

  if (out.length === 0) return null;
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Which line is current at `positionMs`: the last one that has started.
 * Returns -1 before the first line, so a track with a long intro highlights
 * nothing rather than pinning the first line.
 */
export function activeLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  let lo = 0, hi = lines.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) { found = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return found;
}

/**
 * Lyrics with any timestamps stripped, for plain display. Also drops the
 * metadata header, so an .lrc shown as plain text does not open with `[ar:]`.
 */
export function stripTimestamps(text: string): string {
  return text
    .split(/\r?\n/)
    .filter(l => !META_ONLY.test(l))
    .map(l => l.replace(STAMP, "").trimEnd())
    .join("\n")
    .trim();
}

/** Whether there is anything worth showing. */
export function hasLyrics(text: string | undefined | null): boolean {
  return !!text && stripTimestamps(text).length > 0;
}
