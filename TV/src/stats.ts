import { useEffect, useState } from "react";

// The MPTree numbers. The TV does not collect them itself: the keys stay on the
// computer that runs Dashboard/collect.mjs. It reads a copy of the data.json that
// script writes, from wherever that copy is put (an address typed into Settings).

export type MptreeStats = {
  installs: number | null;
  installsToday: number | null;
  rating: number | null;
  reviews: number | null;
  /** Downloads from the website (GitHub releases), which is the Windows app and the APK. */
  downloads: number | null;
  /** Unique site visitors over the last 7 days. */
  visitors7: number | null;
  collectedAt: string | null;
};

const HOUR = 3_600_000;

type Raw = {
  collectedAt?: string;
  sources?: {
    play?: { installs?: { totalUsers?: number; dailyInstalls?: number }; reviews?: { average?: number; count?: number } };
    github?: { total?: number };
    cloudflare?: { traffic?: { last7?: { uniques?: number } } };
  };
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseStats(raw: Raw): MptreeStats {
  const s = raw.sources ?? {};
  return {
    installs: n(s.play?.installs?.totalUsers),
    installsToday: n(s.play?.installs?.dailyInstalls),
    rating: n(s.play?.reviews?.average),
    reviews: n(s.play?.reviews?.count),
    downloads: n(s.github?.total),
    visitors7: n(s.cloudflare?.traffic?.last7?.uniques),
    collectedAt: raw.collectedAt ?? null,
  };
}

export function useMptreeStats(url: string) {
  const [stats, setStats] = useState<MptreeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(url.trim(), { cache: "no-store" });
        if (!res.ok) throw new Error(`The numbers file answered ${res.status}.`);
        const data = parseStats(await res.json());
        if (alive) { setStats(data); setError(null); }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    };
    load();
    const timer = window.setInterval(load, HOUR);
    return () => { alive = false; window.clearInterval(timer); };
  }, [url]);

  return { stats: url ? stats : null, error: url ? error : null };
}

/** 1284 → "1,284", 3400 → "3.4k". */
export function short(v: number | null): string {
  if (v === null) return "–";
  if (v >= 10_000) return (v / 1000).toFixed(v >= 100_000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return v.toLocaleString("en-GB");
}

/** The numbers there are, most telling first: Play installs and rating once Play
 *  is set up in the Dashboard, else (or then) website downloads and visitors.
 *  `k` is the short label ("installs"), `label` the one for a list ("Play installs"). */
export function figures(s: MptreeStats): { v: string; k: string; label: string }[] {
  const out: { v: string; k: string; label: string }[] = [];
  if (s.installs !== null) out.push({ v: short(s.installs) + (s.installsToday ? ` (+${s.installsToday})` : ""), k: "installs", label: "Play installs" });
  if (s.rating !== null) out.push({ v: String(s.rating), k: "rating", label: "Rating" });
  if (s.downloads !== null) out.push({ v: short(s.downloads), k: "downloads", label: "Downloads" });
  if (s.visitors7 !== null) out.push({ v: short(s.visitors7), k: "visitors this week", label: "Site visitors, 7 days" });
  return out;
}

/** "2 h ago", "12 min ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
