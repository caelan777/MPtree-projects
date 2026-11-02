import { Children, isValidElement, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Pause, Play, Shuffle, SkipBack, SkipForward, Sun, Sunset, Wind } from "lucide-react";
import { Logo } from "../Logo";
import type { TvApp } from "../../launcher";
import { pickHours, type Home, type Hour } from "../../home";
import { kicker, progressAt, type Music, type ShuffleAll } from "../../music";
import { clock, deg } from "../../format";
import { ago, short, type MptreeStats } from "../../stats";

/** What every layout gets. The layouts are Home's first page: the day, the music
 *  and the apps. The house (Home Assistant) is the second page, HouseView. */
export type DayProps = {
  now: Date;
  /** The name typed into Settings, for the greeting. */
  name: string;
  home: Home;
  /** What plays on this TV or on a speaker, or null. */
  music: Music | null;
  /** Shuffle all songs, when nothing plays. */
  shuffle: ShuffleAll;
  stats: MptreeStats | null;
  dock: TvApp[];
  onOpenApp: (a: TvApp) => void;
  /** The Apps page: every app on the TV. Always the last thing on the row. */
  onAllApps: () => void;
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

/** The next hours in a row: time, weather, temperature. Rainy hours are shaded;
 *  the hour the sun sets in shows the sunset (when `sunsetHour` is given). */
export function HourStrip({ hours, now, n, className, sunsetHour }: { hours: Hour[]; now: Date; n: number; className: string; sunsetHour?: number | null }) {
  const list = pickHours(hours, now, n);
  if (!list.length) return null;
  return (
    <div className={"hrs " + className}>
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

/** A record, or the song's cover when there is one. */
export function Cover({ m, className }: { m: Music | null; className: string }) {
  return m?.art ? <img className={className + " cover"} src={m.art} alt="" /> : <span className={className + " rec"} />;
}

/** Previous, play/pause and next for what is playing. */
export function MusicButtons({ m, className = "mb" }: { m: Music; className?: string }) {
  return (
    <>
      {m.can.prev && <button className={"f " + className} data-f="" data-ok="Previous song" onClick={() => m.skip("prev")} aria-label="Previous"><SkipBack size={28} /></button>}
      <button className={"f " + className + " pl"} data-f="" data-ok={m.playing ? `Pause ${m.title}` : `Play ${m.title}`} onClick={m.playPause} aria-label={m.playing ? "Pause" : "Play"}>
        {m.playing ? <Pause size={30} /> : <Play size={30} />}
      </button>
      {m.can.next && <button className={"f " + className} data-f="" data-ok="Next song" onClick={() => m.skip("next")} aria-label="Next"><SkipForward size={28} /></button>}
    </>
  );
}

/** How far into the song, as a thin line. */
export function SongLine({ m, now, className = "songline" }: { m: Music; now: Date; className?: string }) {
  if (m.duration === null) return null;
  return <span className={className}><i style={{ width: `${progressAt(m, now.getTime())}%` }} /></span>;
}

/**
 * The music as one big card (Classic). Nothing playing: the MPTree logo and shuffle
 * all songs; pressing Shuffle all turns the logo into a record at once. What plays:
 * the record, the song, a line for how far, and previous, pause, next, plus every
 * control. Nothing at all when neither is there.
 */
export function MusicCard({ m, shuffle, now, onOpen, className }: { m: Music | null; shuffle: ShuffleAll; now: Date; onOpen: () => void; className: string }) {
  // Shuffle all was pressed: the record shows while MPTree starts the music (and
  // the logo comes back should nothing start).
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!starting) return;
    const t = window.setTimeout(() => setStarting(false), 12_000);
    return () => window.clearTimeout(t);
  }, [starting]);

  if (m) {
    return (
      <div className={"mcard playing " + className}>
        <span className="mc-disc rec" />
        <div className="mc-body">
          <div className="mc-kick">{kicker(m)}</div>
          <h4 className="mc-title">{m.title}</h4>
          {m.artist && <p className="mc-by">{m.artist}</p>}
          <SongLine m={m} now={now} className="mc-line" />
          <div className="mc-btns">
            <MusicButtons m={m} className="mc-b" />
            <button className="f mc-go" data-f="" data-ok="Open the music controls" onClick={onOpen}>All controls</button>
          </div>
        </div>
      </div>
    );
  }
  if (!shuffle) return null;
  return (
    <div className={"mcard " + className}>
      {starting ? <span className="mc-disc rec" /> : <span className="mc-disc mc-logo"><Logo size={230} /></span>}
      <div className="mc-body">
        <h4 className="mc-title">Shuffle music</h4>
        <p className="mc-by">All your songs · {shuffle.where}</p>
        <button className="f mc-go" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={() => { setStarting(true); void shuffle.run(); }}><Shuffle size={26} />Shuffle all</button>
      </div>
    </div>
  );
}

/** The MPTree numbers on one line: installs, today, rating. Nothing when not set up. */
export function Nums({ stats, className = "nums" }: { stats: MptreeStats | null; className?: string }) {
  if (!stats) return null;
  return (
    <span className={className}>
      <span className="lg"><Logo size={30} />MPTree</span>
      <span><b>{short(stats.installs)}</b> installs</span>
      {stats.installsToday ? <span><b>+{stats.installsToday}</b> today</span> : null}
      {stats.rating ? <span><b>{stats.rating}</b> rating</span> : null}
    </span>
  );
}

/**
 * Home's row of apps, then "All apps". Six fit across; with six apps on Home,
 * "All apps" waits just past the right edge, and when Right reaches it the row
 * slides one place left (and back again when Left goes back to the first).
 */
export function AppRow({ className, children }: { className: string; children: ReactNode }) {
  const [shift, setShift] = useState(0);
  return (
    <div className={"arow " + className} style={{ "--shift": shift } as CSSProperties}>
      {Children.toArray(children).map((c, i) => (
        <div key={isValidElement(c) && c.key !== null ? c.key : i} className="ar-i" onFocus={() => setShift(Math.max(0, i - 5))}>{c}</div>
      ))}
    </div>
  );
}

/** The tab at the edge of the screen that says Right (or Left) goes to the other page. */
export function EdgeTab({ side, label }: { side: "left" | "right"; label: string }) {
  return (
    <div className={"edge " + side} aria-hidden="true">
      {side === "left" && <ChevronLeft size={28} />}
      <span>{label}</span>
      {side === "right" && <ChevronRight size={28} />}
    </div>
  );
}

/** The MPTree numbers as a card (Settings, MPTree numbers). */
export function StatsCard({ stats, error, now }: { stats: MptreeStats | null; error: string | null; now: Date }) {
  // Never set up: no card at all, rather than a reminder.
  if (!stats && !error) return null;
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
