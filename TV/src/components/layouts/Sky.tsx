import { Shuffle } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { inTime } from "../../home";
import { short } from "../../stats";
import { kicker } from "../../music";
import { clock, deg, longDate } from "../../format";
import { Cover, HourStrip, MusicButtons, SongLine, type DayProps } from "./parts";

const CLOUDY = new Set(["cloudy", "partlycloudy", "rainy", "pouring", "fog", "snowy", "snowy-rainy", "lightning-rainy", "windy-variant"]);

/** Sky: a window onto the weather. The sky is the background (grey by day, a low
 *  warm sun in the hour before sunset, dark at night, clouds when it is cloudy),
 *  with layered hills. The time floats on it; the rest is frosted glass. */
export function Sky({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAddApp, onOpenMusic }: DayProps) {
  const dusk = h.toSunset !== null && h.toSunset < 75;
  const cloudy = CLOUDY.has(h.condition ?? "");
  const setAt = h.sunsetAt ? Number(h.sunsetAt.slice(0, 2)) : null;

  return (
    <div className={"sk" + (dusk ? " dusk" : "") + (cloudy ? " cloudy" : "")}>
      <div className="sk-bg" aria-hidden="true">
        <span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" />
        <span className="sun" />
        <span className="hill h3" /><span className="hill h2" /><span className="hill h1" />
      </div>

      <div className="sk-time">{clock(now)}</div>
      <div className="sk-sub">
        <span>{longDate(now)}</span>
        {h.hasWeather && <span><b>{deg(h.outside, 0)}</b> {h.conditionText.toLowerCase()}</span>}
        {h.inside !== null && <span><b>{deg(h.inside)}</b> inside</span>}
        {h.toSunset !== null ? <span>Sun sets in <b>{inTime(h.toSunset)}</b></span> : h.sunriseAt ? <span>Sun up at <b>{h.sunriseAt}</b></span> : null}
      </div>
      <HourStrip hours={h.hours} now={now} n={6} className="glass sk-hrs" sunsetHour={setAt} />

      <div className="sk-side">
        {m ? (
          <div className="glass sk-np">
            <div className="head">
              <Cover m={m} className="art" />
              <div className="tx"><span>{kicker(m)}</span><b>{m.title}</b>{m.artist && <span>{m.artist}</span>}</div>
            </div>
            <SongLine m={m} now={now} />
            <div className="btns">
              <MusicButtons m={m} className="gb-r" />
              <button className="f glass gb-more" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>All controls</button>
            </div>
          </div>
        ) : shuffle ? (
          <button className="f glass gb" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}>
            <span className="gi"><Shuffle size={30} /></span>
            <span className="tx">Shuffle music<span>All your songs · {shuffle.where}</span></span>
          </button>
        ) : null}
        {stats && (
          <div className="glass sk-stats">
            <div><b>{short(stats.installs)}</b>MPTree installs</div>
            <div><b>{stats.installsToday ? `+${stats.installsToday}` : "–"}</b>today</div>
            <div><b>{stats.rating ?? "–"}</b>rating</div>
          </div>
        )}
      </div>

      <div className="glass sk-shelf">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add" onOpen={onAddApp} />}
      </div>
    </div>
  );
}
