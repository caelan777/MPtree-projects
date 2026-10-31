import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, Wind } from "lucide-react";
import { Logo } from "../Logo";
import type { TvApp } from "../../launcher";
import type { Ha } from "../../ha";
import type { Home } from "../../home";
import { ago, short, type MptreeStats } from "../../stats";

/** What every layout gets. */
export type LayoutProps = {
  now: Date;
  ha: Ha;
  home: Home;
  stats: MptreeStats | null;
  statsError: string | null;
  dock: TvApp[];
  onOpenApp: (a: TvApp) => void;
  onAddApp: () => void;
  onSettings: () => void;
  onOpenHeating: () => void;
};

export function WeatherIcon({ state, size }: { state: string | undefined; size: number }) {
  switch (state) {
    case "sunny": return <Sun size={size} />;
    case "clear-night": return <Moon size={size} />;
    case "partlycloudy": return <CloudSun size={size} />;
    case "rainy": case "pouring": return <CloudRain size={size} />;
    case "snowy": case "snowy-rainy": case "hail": return <CloudSnow size={size} />;
    case "lightning": case "lightning-rainy": return <CloudLightning size={size} />;
    case "fog": return <CloudFog size={size} />;
    case "windy": case "windy-variant": return <Wind size={size} />;
    default: return <Cloud size={size} />;
  }
}

export function StatsCard({ stats, error, now }: { stats: MptreeStats | null; error: string | null; now: Date }) {
  return (
    <div className="mpt">
      <div className="h">
        <span><Logo size={40} />MPTree</span>
        <span className="mono" style={{ fontSize: 17, color: "var(--muted)", fontWeight: 400 }}>{stats ? ago(stats.collectedAt, now.getTime()) : ""}</span>
      </div>
      {stats ? (
        <>
          <div><div className="v">{short(stats.installs)}</div><div className="k">Play installs</div></div>
          <div><div className="v">{stats.rating ?? "–"}</div><div className="k">Rating</div></div>
          <div><div className="v">{short(stats.downloads)}</div><div className="k">Website downloads</div></div>
          <div><div className="v">{short(stats.visitors7)}</div><div className="k">Site, 7 days</div></div>
        </>
      ) : (
        <div className="empty">{error ?? "Add the address of the numbers file in Settings to see installs, rating and downloads here."}</div>
      )}
    </div>
  );
}

/** One line of MPTree numbers, for layouts without room for the card. */
export function StatsLine({ stats }: { stats: MptreeStats | null }) {
  if (!stats) return null;
  return (
    <span className="statsline">
      <Logo size={34} />
      <span><b>{short(stats.installs)}</b> installs</span>
      {stats.installsToday ? <span><b>+{stats.installsToday}</b> today</span> : null}
      {stats.rating ? <span><b>{stats.rating}</b> rating</span> : null}
      <span><b>{short(stats.downloads)}</b> downloads</span>
    </span>
  );
}
