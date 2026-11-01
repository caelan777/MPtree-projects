import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Pause, Play, Shuffle, SkipBack, SkipForward, Sun, Sunset, Wind } from "lucide-react";
import { Logo } from "../Logo";
import type { TvApp } from "../../launcher";
import type { Ha } from "../../ha";
import { pickHours, type Home, type Hour } from "../../home";
import { HA } from "../../homeConfig";
import { clock, deg } from "../../format";
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
  /** The music panel: every control for what is playing. */
  onOpenMusic: () => void;
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

/** A row of hours: time, weather, temperature. Rain is a dashed box; the hour the
 *  sun sets in shows the sunset (when `sunsetAt` is given). */
export function Hours({ hours, now, n, className, sunsetHour }: { hours: Hour[]; now: Date; n: number; className: string; sunsetHour?: number | null }) {
  const list = pickHours(hours, now, n);
  if (!list.length) return null;
  return (
    <div className={className}>
      {list.map(h => {
        const d = new Date(h.at);
        const sun = sunsetHour != null && d.getHours() === sunsetHour && !h.rain;
        return (
          <span key={h.at} className={h.rain ? "rain" : undefined}>
            {clock(d)}
            {sun ? <Sunset size={28} /> : <WeatherIcon state={h.condition} size={28} />}
            <b>{deg(h.temp, 0)}</b>
          </span>
        );
      })}
    </div>
  );
}

/** ON / OFF, in a small box. Nothing when it can't be told. */
export function StateTag({ on, className = "state" }: { on: boolean | null; className?: string }) {
  if (on === null) return null;
  return <span className={className + (on ? "" : " off")}>{on ? "ON" : "OFF"}</span>;
}

/** The strip under the house: what is playing on a speaker. OK on the song opens
 *  the music panel (every control); previous, play/pause and next sit right next
 *  to it. When nothing plays, it offers to shuffle all songs instead. Nothing at
 *  all when neither is there. */
export function NowPlaying({ h, onOpen, className = "np" }: { h: Home; onOpen: () => void; className?: string }) {
  const p = h.playing;
  if (p) {
    return (
      <div className={className + " np-row"}>
        <button className="f np-main" data-f="" data-ok="Open the music controls" onClick={onOpen}>
          {p.art ? <img className="art" src={p.art} alt="" /> : <span className="art" />}
          <span className="sp"><b>{p.title}</b> <span>{p.artist ? `· ${p.artist} ` : ""}· {p.where}</span></span>
        </button>
        {p.can.prev && <button className="f nb" data-f="" data-ok="Previous song" onClick={() => h.skip("prev")} aria-label="Previous"><SkipBack size={26} /></button>}
        <button className="f nb pp" data-f="" data-ok={p.playing ? `Pause ${p.title}` : `Play ${p.title}`} onClick={h.playPause} aria-label={p.playing ? "Pause" : "Play"}>
          {p.playing ? <Pause size={26} /> : <Play size={26} />}
        </button>
        {p.can.next && <button className="f nb" data-f="" data-ok="Next song" onClick={() => h.skip("next")} aria-label="Next"><SkipForward size={26} /></button>}
      </div>
    );
  }
  if (!h.shuffleName) return null;
  return (
    <button className={"f " + className} data-f="" data-ok="Shuffle all songs in the living room" onClick={h.shuffleMusic}>
      <span className="art icon"><Shuffle size={30} /></span>
      <span className="sp"><b>Shuffle music</b> <span>· all songs · {HA.speakerLabel}</span></span>
      <span className="pp"><Play size={26} /></span>
    </button>
  );
}

export function StatsCard({ stats, error, now }: { stats: MptreeStats | null; error: string | null; now: Date }) {
  return (
    <div className="mpt">
      <div className="h">
        <span><Logo size={36} />MPTree</span>
        <span className="mono" style={{ fontSize: 16, color: "var(--muted)", fontWeight: 400 }}>{stats ? ago(stats.collectedAt, now.getTime()) : ""}</span>
      </div>
      {stats ? (
        <>
          <div><div className="v">{short(stats.installs)}</div><div className="k">Play installs</div></div>
          <div><div className="v">{stats.rating ?? "–"}</div><div className="k">Rating</div></div>
          <div><div className="v">{short(stats.downloads)}</div><div className="k">Downloads</div></div>
          <div><div className="v">{short(stats.visitors7)}</div><div className="k">Site, 7 days</div></div>
        </>
      ) : (
        <div className="empty">{error ?? "Add the address of the numbers file in Settings, MPTree numbers, to see installs, rating and downloads here."}</div>
      )}
    </div>
  );
}

/** One line of MPTree numbers, for layouts without room for the card. */
export function StatsLine({ stats }: { stats: MptreeStats | null }) {
  if (!stats) return null;
  return (
    <span className="statsline">
      <Logo size={30} />
      <span><b>{short(stats.installs)}</b> installs</span>
      {stats.installsToday ? <span><b>+{stats.installsToday}</b> today</span> : null}
      {stats.rating ? <span><b>{stats.rating}</b> rating</span> : null}
    </span>
  );
}
