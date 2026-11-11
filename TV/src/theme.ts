// MPTree's light palette, copied from MPTree-App/src/themes.ts (LIGHT). Copied on
// purpose rather than shared: see "Keep it simple" in the root CLAUDE.md.
export const T = {
  accent: "#000000", surface: "#f5f5f5", card: "#efefef", bg: "#ffffff",
  muted: "#888888", dim: "#e0e0e0", border: "#d8d8d8",
  text: "#111111", textSub: "#666666", playBtnFg: "#ffffff",
};

/** The screen is drawn at 1920×1080 and scaled to whatever the TV reports. */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Overscan-safe margins. */
export const SAFE_X = 96;
export const SAFE_Y = 54;

// ── Dark mode ────────────────────────────────────────────────────────────────
// Dark once the sun is down, light again when it comes up. Home Assistant knows
// both; without it the evening is guessed as 19:00 to 07:00.

type SunStates = Record<string, { state: string } | undefined>;

export function sunIsDown(states: SunStates, now: Date, ids: { sun: string; sunrise: string; sunset: string }): boolean {
  const sun = states[ids.sun]?.state;
  if (sun === "below_horizon") return true;
  if (sun === "above_horizon") return false;
  const rise = Date.parse(states[ids.sunrise]?.state ?? "");
  const set = Date.parse(states[ids.sunset]?.state ?? "");
  // The next sunrise coming before the next sunset means it is night now.
  if (Number.isFinite(rise) && Number.isFinite(set)) return rise < set;
  const h = now.getHours();
  return h >= 19 || h < 7;
}

/** When the sun next rises or sets, whichever is first; in 12 hours if unknown. */
export function nextSunChange(states: SunStates, now: Date, ids: { sunrise: string; sunset: string }): number {
  const times = [states[ids.sunrise]?.state, states[ids.sunset]?.state]
    .map(s => Date.parse(s ?? ""))
    .filter(t => Number.isFinite(t) && t > now.getTime());
  return times.length ? Math.min(...times) : now.getTime() + 12 * 3_600_000;
}
