import { t } from "../i18n";

// ─── LAYOUT ──────────────────────────────────────────────────────────────────
// How a list is laid out: rows with a cover (as it always was), compact rows
// without one, or covers in a grid of two or three. Songs has the button in
// its header card, My playlists next to + New playlist; both offer these four.

export const LIST_LAYOUTS = ["list", "compact", "grid", "grid3"] as const;
export type ListLayout = typeof LIST_LAYOUTS[number];
export const isListLayout = (v: unknown): v is ListLayout => typeof v === "string" && (LIST_LAYOUTS as readonly string[]).includes(v);

export function layoutName(k: ListLayout): string {
  return k === "list" ? t("List") : k === "compact" ? t("Compact") : k === "grid" ? t("Grid") : t("Small grid");
}

export function LayoutIcon({ kind, size = 16 }: { kind: ListLayout; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "list") return (
    <svg {...common} strokeWidth={2}><rect x="3" y="4" width="6" height="6" rx="1.5" /><path d="M12 7h9" /><rect x="3" y="14" width="6" height="6" rx="1.5" /><path d="M12 17h9" /></svg>
  );
  if (kind === "compact") return <svg {...common} strokeWidth={2}><path d="M4 5h16M4 10h16M4 15h16M4 20h16" /></svg>;
  if (kind === "grid") return (
    <svg {...common} strokeWidth={2}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>
  );
  const sq = [3, 9.7, 16.4];
  return (
    <svg {...common} strokeWidth={1.7}>
      {sq.flatMap(y => sq.map(x => <rect key={`${x}-${y}`} x={x} y={y} width="4.6" height="4.6" rx="1" />))}
    </svg>
  );
}
