import type { Song } from "./types";

// ─── CLEAN UP ────────────────────────────────────────────────────────────────
// Finds what in the library is probably not a song. The sheet that shows the
// list is components/CleanupSheet.tsx.

export type Suspect = { song: Song; why: "short" | "messenger" | "recording" };

const MESSENGER = /\/(whatsapp|whatsapp business|telegram|signal|viber|messenger)\//i;
// WhatsApp names its files PTT-20240101-WA0001 (voice notes) and AUD-...
const MESSENGER_FILE = /\/(PTT|AUD)-\d{8}-WA\d+/i;
const RECORDING = /\/(recordings?|voice ?recorder|sound ?recorder|call ?recordings?|callrecord\w*|voice)\//i;

/** Everything in the library that is probably not a song, most certain first. */
export function findSuspects(songs: Song[]): Suspect[] {
  const out: Suspect[] = [];
  for (const s of songs) {
    // Cut tracks are made on purpose, and are often short on purpose.
    if (s.isCut) continue;
    const path = s.uri || "";
    if (MESSENGER.test(path) || MESSENGER_FILE.test(path)) out.push({ song: s, why: "messenger" });
    else if (RECORDING.test(path)) out.push({ song: s, why: "recording" });
    else if (s.duration !== undefined && s.duration > 0 && s.duration < 60_000) out.push({ song: s, why: "short" });
  }
  const rank = { messenger: 0, recording: 1, short: 2 };
  return out.sort((a, b) => rank[a.why] - rank[b.why] || (a.song.duration ?? 0) - (b.song.duration ?? 0));
}
