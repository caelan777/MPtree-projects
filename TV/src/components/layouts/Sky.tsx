import { Shuffle } from "lucide-react";
import { AllAppsTile, AppTile } from "../AppTile";
import { inTime } from "../../home";
import { kicker } from "../../music";
import { clock, deg, longDate } from "../../format";
import { AppRow, Cover, Downloads, HourStrip, MusicButtons, SongLine, type DayProps } from "./parts";

const CLOUDY = new Set(["cloudy", "partlycloudy", "rainy", "pouring", "fog", "snowy", "snowy-rainy", "lightning-rainy", "windy-variant"]);

/** The night's stars: the same every night (a fixed sequence), more of them high
 *  up. Only shown in dark mode. */
const STARS = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: 70 }, () => {
    const y = Math.pow(rnd(), 1.6) * 640;
    return { x: rnd() * 1920, y, r: rnd() < 0.12 ? 2.4 : 1.4, o: 0.3 + rnd() * 0.5 * (1 - y / 900) };
  });
})();

/** Where the sun is: across the sky from sunrise (left) to sunset (right), highest
 *  at midday, low near the hills. It stays in the band under the words and cards,
 *  so it never hides behind them. Null when it is down or the times are not known. */
function sunAt(rise: string | undefined, set: string | undefined, now: Date): { x: number; y: number } | null {
  const r = Date.parse(rise ?? ""), s = Date.parse(set ?? ""), t = now.getTime();
  // Home Assistant gives the NEXT sunrise: once the sun is up, that is tomorrow's.
  const up = Number.isFinite(r) && r > t ? r - 86_400_000 : r;
  if (!Number.isFinite(up) || !Number.isFinite(s) || t < up || t > s) return null;
  const f = (t - up) / (s - up);
  return { x: 180 + f * 1560, y: 760 - Math.sin(f * Math.PI) * 200 };
}

/** Sky: a flat, poster-like picture of the sky right now. Blue by day, grey when
 *  it is cloudy, warm in the last hour before sunset, deep blue with stars and a
 *  moon at night. The sun crosses it during the day. Hills in front, the apps on
 *  them; the music and the downloads on solid cards. */
export function Sky({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  const dusk = h.toSunset !== null && h.toSunset < 75;
  const cloudy = CLOUDY.has(h.condition ?? "");
  const setAt = h.sunsetAt ? Number(h.sunsetAt.slice(0, 2)) : null;
  const sun = sunAt(h.sunStates.sunrise, h.sunStates.sunset, now);

  return (
    <div className={"sk" + (dusk ? " dusk" : cloudy ? " cloudy" : "")}>
      <div className="sk-bg" aria-hidden="true">
        <svg className="stars" viewBox="0 0 1920 1080" width="1920" height="1080">
          {STARS.map((st, i) => <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />)}
        </svg>
        <span className="moon" />
        {sun && <span className="sun" style={{ left: sun.x, top: sun.y }} />}
        {cloudy && <><span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" /></>}
        <span className="hill h3" /><span className="hill h2" /><span className="hill h1" />
      </div>

      <div className="sk-time">{clock(now)}</div>
      <div className="sk-sub">
        <span>{longDate(now)}</span>
        {h.hasWeather && <span><b>{deg(h.outside, 0)}</b> {h.conditionText.toLowerCase()}</span>}
        {h.toSunset !== null ? <span>Sunset in <b>{inTime(h.toSunset)}</b></span> : h.sunriseAt ? <span>Sunrise <b>{h.sunriseAt}</b></span> : null}
      </div>
      <HourStrip hours={h.hours} now={now} n={6} className="sk-hrs" sunsetHour={setAt} />

      <div className="sk-side">
        {m ? (
          <div className="sk-card sk-np">
            <div className="head">
              <Cover m={m} className="art" />
              <div className="tx"><span>{kicker(m)}</span><b>{m.title}</b>{m.artist && <span>{m.artist}</span>}</div>
            </div>
            <SongLine m={m} now={now} />
            <div className="btns">
              <MusicButtons m={m} className="gb-r" />
              <button className="f gb-more" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>All controls</button>
            </div>
          </div>
        ) : shuffle ? (
          <button className="f sk-card gb" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}>
            <span className="gi"><Shuffle size={30} /></span>
            <span className="tx">Shuffle music<span>All your songs · {shuffle.where}</span></span>
          </button>
        ) : null}
        <Downloads stats={stats} className="sk-dls" />
      </div>

      <AppRow className="dock sk-row">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        <AllAppsTile key="all" onOpen={onAllApps} />
      </AppRow>
    </div>
  );
}
