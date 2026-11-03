import { Shuffle } from "lucide-react";
import { AllAppsTile, AppTile } from "../AppTile";
import { inTime } from "../../home";
import { figures } from "../../stats";
import { kicker } from "../../music";
import { clock, deg, longDate } from "../../format";
import { AppRow, Cover, HourStrip, MusicButtons, SongLine, type DayProps } from "./parts";

const CLOUDY = new Set(["cloudy", "partlycloudy", "rainy", "pouring", "fog", "snowy", "snowy-rainy", "lightning-rainy", "windy-variant"]);

/** The night's stars: the same every night (a fixed sequence), more and brighter
 *  high up, fewer towards the hills. Only shown in dark mode. */
const STARS = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 90 }, () => {
    const y = Math.pow(rnd(), 1.6) * 620;
    return { x: rnd() * 1920, y, r: rnd() < 0.12 ? 2.4 : rnd() < 0.5 ? 1.6 : 1.1, o: 0.25 + rnd() * 0.6 * (1 - y / 900), tw: rnd() < 0.15 };
  });
})();

/** Sky: a window onto the weather. The sky is the background (grey by day, a low
 *  warm sun in the hour before sunset; at night a deep blue with stars, a crescent
 *  moon and moonlit hills; clouds when it is cloudy). The time floats on it; the
 *  rest is frosted glass. */
export function Sky({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  const dusk = h.toSunset !== null && h.toSunset < 75;
  const cloudy = CLOUDY.has(h.condition ?? "");
  const setAt = h.sunsetAt ? Number(h.sunsetAt.slice(0, 2)) : null;

  return (
    <div className={"sk" + (dusk ? " dusk" : "") + (cloudy ? " cloudy" : "")}>
      <div className="sk-bg" aria-hidden="true">
        <svg className="stars" viewBox="0 0 1920 1080" width="1920" height="1080">
          {STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} className={st.tw ? "tw" : undefined} />)}
        </svg>
        <span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" />
        <span className="sun" />
        <span className="moon" />
        <span className="glow" />
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
        {stats && figures(stats).length > 0 && (
          <div className="glass sk-stats">
            {figures(stats).slice(0, 3).map((f, i) => <div key={f.k}><b>{f.v}</b>{i === 0 ? `MPTree ${f.k}` : f.k}</div>)}
          </div>
        )}
      </div>

      <div className="glass sk-shelf">
        <AppRow className="sk-row">
          {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
          <AllAppsTile key="all" onOpen={onAllApps} />
        </AppRow>
      </div>
    </div>
  );
}
