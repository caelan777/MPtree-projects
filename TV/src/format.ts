/** 14:55 */
export function clock(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Saturday 31 October */
export function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** 20.21 → "20.2°". */
export function deg(v: number | null, digits = 1): string {
  if (v === null) return "–";
  return v.toFixed(digits).replace(/\.0$/, "") + "°";
}

/** An ISO time from Home Assistant as local "17:12". */
export function timeOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? clock(new Date(t)) : null;
}
