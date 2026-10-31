import { AlarmClock, Heater, Power, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, heatLine, lightsLine } from "../../home";
import { short } from "../../stats";
import { clock, deg, longDate } from "../../format";
import { type LayoutProps } from "./parts";

const CLOUDY = new Set(["cloudy", "partlycloudy", "rainy", "pouring", "fog", "snowy", "snowy-rainy", "lightning-rainy", "windy-variant"]);

/** Sky: the background is the weather. Grey day, a lower warmer light in the hour
 *  before sunset, dark at night (with dark mode), clouds when it is cloudy.
 *  Frosted panels float on top. */
export function Sky({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating }: LayoutProps) {
  const setAt = Date.parse(ha.states[HA.sunset]?.state ?? "");
  const toSunset = Number.isFinite(setAt) ? (setAt - now.getTime()) / 60000 : Infinity;
  const dusk = toSunset > 0 && toSunset < 75;
  const cloudy = CLOUDY.has(h.condition ?? "");

  return (
    <div className={"sky" + (dusk ? " dusk" : "") + (cloudy ? " cloudy" : "")}>
      <div className="sky-bg" aria-hidden="true">
        <span className="orb" /><span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3" />
        <span className="hill h1" /><span className="hill h2" />
      </div>

      <div className="glass sky-clock">
        <div className="t">{clock(now)}</div>
        <div className="d">{longDate(now)}</div>
        {h.ready && (
          <div className="w"><span><b>{deg(h.outside, 0)}</b> {h.conditionText.toLowerCase()}</span><span><b>{deg(h.inside)}</b> inside</span>{h.humidity !== null && <span>{Math.round(h.humidity)}%</span>}</div>
        )}
      </div>

      <div className="sky-col">
        {h.ready ? (
          <>
            <button className="f glass gbtn" data-f="" onClick={h.sunset}>
              <span className="gi"><Sunset size={34} /></span><span>Sunset<span className="sub">{h.sunsetAt ? `at ${h.sunsetAt}, or now` : "the sunset lights"}</span></span>
            </button>
            <button className="f glass gbtn" data-f="" onClick={h.allOff}>
              <span className="gi"><Power size={30} /></span><span>All lights off<span className="sub">{lightsLine(h.lightsOn)}</span></span>
            </button>
            <div className="sky-pair">
              <button className="f glass gbtn" data-f="" data-heat="" onClick={onOpenHeating}>
                <span className="gi"><Heater size={30} /></span><span>Heating<span className="sub">{heatLine(h)}</span></span>
              </button>
              <button className="f glass gbtn" data-f="" onClick={h.toggleAlarm}>
                <span className="gi"><AlarmClock size={30} /></span><span>Alarm<span className="sub">{h.alarmOn ? "on" : "off"}</span></span>
              </button>
            </div>
          </>
        ) : (
          <button className="f glass gbtn" data-f="" onClick={onSettings}><span>{connectText(ha).title}<span className="sub">{connectText(ha).body}</span></span></button>
        )}
        {stats && (
          <div className="glass sky-stats">
            <div><b>{short(stats.installs)}</b>MPTree installs</div>
            <div><b>{stats.installsToday ? `+${stats.installsToday}` : "–"}</b>today</div>
            <div><b>{stats.rating ?? "–"}</b>rating</div>
          </div>
        )}
      </div>

      <div className="glass sky-dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add" onOpen={onAddApp} />}
      </div>
    </div>
  );
}
