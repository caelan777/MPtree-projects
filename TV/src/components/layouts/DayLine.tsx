import type { CSSProperties } from "react";
import { Pause, Play, Shuffle, Sunrise, Sunset } from "lucide-react";
import { AllAppsTile, AppTile } from "../AppTile";
import { clock, deg, longDate } from "../../format";
import { AppRow, Downloads, WeatherIcon, type DayProps } from "./parts";

// The line runs from 06:00 to midnight.
const START_H = 6;
const END_H = 24;
/** The hours that get the weather under the line. */
const MARKS = [9, 12, 15, 18, 21];

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;
/** Where an hour falls on the line, 0 to 100. */
const at = (h: number) => Math.min(100, Math.max(0, ((h - START_H) / (END_H - START_H)) * 100));
const left = (h: number) => ({ left: `${at(h)}%` }) as CSSProperties;

/** The time of day a timestamp falls on, as hours (17.2 for 17:12), when it is today. */
function todayHour(iso: string | undefined, now: Date): number | null {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return d.toDateString() === now.toDateString() ? hourOf(d) : null;
}

/** Day line: today as one straight line from 06:00 to midnight. Black up to now,
 *  the sunrise and sunset marked on it, rain as a hatched stretch, and the weather
 *  every three hours underneath. */
export function DayLine({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  const nowH = hourOf(now);
  const rise = todayHour(h.sunStates.sunrise, now);
  const set = todayHour(h.sunStates.sunset, now);

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const hourAt = (hr: number) => h.allHours.find(x => Math.abs(x.at - (dayStart.getTime() + hr * 3_600_000)) < 1_800_000);

  // Rain: one stretch per run of rainy hours.
  const rain: { from: number; to: number }[] = [];
  for (const x of h.allHours) {
    const hr = (x.at - dayStart.getTime()) / 3_600_000;
    if (!x.rain || hr < START_H || hr >= END_H) continue;
    const last = rain[rain.length - 1];
    if (last && Math.abs(last.to - hr) < 0.01) last.to = hr + 1;
    else rain.push({ from: hr, to: hr + 1 });
  }
  const hh = (hr: number) => `${String(Math.floor(hr) % 24).padStart(2, "0")}:00`;

  return (
    <div className="dl">
      <div className="dl-head">
        <div><div className="t">{clock(now)}</div><div className="d">{longDate(now)}</div></div>
        <div className="dl-temps">
          {h.hasWeather && <div><b>{deg(h.outside, 0)}</b><span>outside, {h.conditionText.toLowerCase()}</span></div>}
          {h.inside !== null && <div><b>{deg(h.inside)}</b><span>inside</span></div>}
        </div>
      </div>

      <div className="dl-line">
        {rise !== null && <span className="dl-sun" style={left(rise)}><Sunrise size={26} />{h.sunriseAt}</span>}
        {set !== null && <span className="dl-sun" style={left(set)}><Sunset size={26} />{h.sunsetAt}</span>}

        <div className="dl-track">
          <i className="dl-past" style={{ width: `${at(nowH)}%` }} />
          {rain.map(r => <i key={r.from} className="dl-rain" style={{ left: `${at(r.from)}%`, width: `${at(r.to) - at(r.from)}%` }} />)}
          <span className="dl-dot" style={left(nowH)} />
        </div>
        <span className="dl-nowlbl" style={left(nowH)}>Now</span>
        {rain.map(r => <span key={r.from} className="dl-rainlbl" style={left((r.from + r.to) / 2)}>Rain {hh(r.from)}–{hh(r.to)}</span>)}

        {MARKS.map(hr => {
          const x = hourAt(hr);
          return (
            <span key={hr} className={"dl-hr" + (hr < nowH ? " past" : "")} style={left(hr)}>
              <span className="tm">{hh(hr)}</span>
              {x && <WeatherIcon state={x.condition} size={34} />}
              {x && <b>{deg(x.temp, 0)}</b>}
            </span>
          );
        })}
      </div>

      <div className="dl-pills">
        {m ? (
          <button className="f dl-pill" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
            {m.playing ? <Pause size={24} /> : <Play size={24} />}<span className="ttl">{m.title}</span><span className="m">{m.where}</span>
          </button>
        ) : shuffle ? (
          <button className="f dl-pill" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}><Shuffle size={24} />Shuffle music<span className="m">{shuffle.where}</span></button>
        ) : null}
        <Downloads stats={stats} className="dl-dls" />
      </div>

      <AppRow className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        <AllAppsTile key="all" onOpen={onAllApps} />
      </AppRow>
    </div>
  );
}
