import { useEffect, useState } from "react";

// The MPTree number: downloads in total. The TV does not collect it itself: the
// keys stay on the PC, where Dashboard/tv-numbers.mjs puts it in a secret gist
// every hour (STATS_URL).

export type MptreeStats = {
  /** Every download: the website's public releases (Windows app, APK) plus Play installs. */
  total: number;
  collectedAt: string | null;
};

const HOUR = 3_600_000;

type Raw = { collectedAt?: string; total?: number };

export function parseStats(raw: Raw): MptreeStats {
  if (typeof raw.total !== "number" || !Number.isFinite(raw.total)) throw new Error("The numbers file has no downloads in it.");
  return { total: raw.total, collectedAt: raw.collectedAt ?? null };
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
