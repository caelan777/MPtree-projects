import { AlarmClock, Heater, Pause, Play, Power, Shuffle, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, inTime, lightsNames, sunsetOk } from "../../home";
import { short } from "../../stats";
import { clock, deg, longDate } from "../../format";
import { Hours, type LayoutProps } from "./parts";

const CLOUDY = new Set(["cloudy", "partlycloudy", "rainy", "pouring", "fog", "snowy", "snowy-rainy", "lightning-rainy", "windy-variant"]);

/** "On · ", "Off · ", or nothing when it can't be told. */
const st = (on: boolean | null) => (on === null ? "" : on ? "On · " : "Off · ");

/** Sky: the background is the weather. Grey day, a lower warmer light in the hour
 *  before sunset, dark at night (with dark mode), clouds when it is cloudy.
 *  Frosted panels float on top; every button says its state under its name. */
export function Sky({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating, onOpenMusic }: LayoutProps) {
  const dusk = h.toSunset !== null && h.toSunset < 75;
  const cloudy = CLOUDY.has(h.condition ?? "");
  const setAt = Date.parse(ha.states[HA.sunset]?.state ?? "");
  const sunsetHour = Number.isFinite(setAt) ? new Date(setAt).getHours() : null;
  const p = h.playing;

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
          <div className="w">
            <span><b>{deg(h.outside, 0)}</b> {h.conditionText.toLowerCase()}</span>
            <span><b>{deg(h.inside)}</b> inside</span>
            {h.toSunset !== null ? <span>Sun sets in <b>{inTime(h.toSunset)}</b></span> : h.sunriseAt ? <span>Sun up at <b>{h.sunriseAt}</b></span> : null}
          </div>
        )}
      </div>
      {h.ready && <Hours hours={h.hours} now={now} n={6} className="glass sky-fc" sunsetHour={sunsetHour} />}

      <div className="sky-col">
        {h.ready ? (
          <>
            <button className="f glass gbtn" data-f="" data-ok={sunsetOk(h)} onClick={h.sunset}>
              <span className="gi"><Sunset size={34} /></span>
              <span>Sunset lights<span className="sub">{st(h.sunsetLightsOn)}{h.sunsetAt ? `sun sets at ${h.sunsetAt}` : "the sunset lights"}</span></span>
            </button>
            <button className="f glass gbtn" data-f="" data-ok="Turn all lights off" onClick={h.allOff}>
              <span className="gi"><Power size={30} /></span><span>All lights off<span className="sub">{lightsNames(h.lightsOn)}</span></span>
            </button>
            <div className="sky-pair">
              <button className="f glass gbtn" data-f="" data-heat="" data-ok="Change the heating" onClick={onOpenHeating}>
                <span className="gi"><Heater size={30} /></span><span>Heating<span className="sub">{h.heatOn ? `On · ${deg(h.heatTarget)}` : "Off"}</span></span>
              </button>
              <button className="f glass gbtn" data-f="" data-ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm}>
                <span className="gi"><AlarmClock size={30} /></span><span>Alarm<span className="sub">{h.alarmOn ? "On" : "Off"} · Wed, Thu 08:00</span></span>
              </button>
            </div>
          </>
        ) : h.off ? null : (
          <button className="f glass gbtn" data-f="" data-ok="Open Settings, Home Assistant" onClick={onSettings}><span>{connectText(ha).title}<span className="sub">{connectText(ha).body}</span></span></button>
        )}
        {p ? (
          <button className="f glass gbtn" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
            <span className="gi">{p.playing ? <Pause size={30} /> : <Play size={30} />}</span>
            <span className="ell">{p.title}<span className="sub">{p.playing ? "Playing" : "Paused"} · {p.where}</span></span>
          </button>
        ) : h.shuffleName ? (
          <button className="f glass gbtn" data-f="" data-ok={`Shuffle all songs, ${h.shuffleWhere}`} onClick={h.shuffleMusic}>
            <span className="gi"><Shuffle size={30} /></span><span>Shuffle music<span className="sub">{h.shuffleWhere}</span></span>
          </button>
        ) : null}
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
