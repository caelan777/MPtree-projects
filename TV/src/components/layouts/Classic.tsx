import { AlarmClock, Heater, Power, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, heatSub, sunsetOk, sunsetSub } from "../../home";
import { clock, deg, longDate } from "../../format";
import { Hours, NowPlaying, StateTag, StatsCard, WeatherIcon, type LayoutProps } from "./parts";

/** Classic: clock, the next hours and the numbers on the left; the house on the
 *  right, each tile saying what is on now; what's playing; apps below. */
export function Classic({ now, ha, home: h, stats, statsError, dock, onOpenApp, onAddApp, onSettings, onOpenHeating, onOpenMusic }: LayoutProps) {
  const connect = connectText(ha);
  const chips = h.lightsOn.slice(0, 3);
  const more = h.lightsOn.length - chips.length;
  return (
    <>
      <div className="mid">
        <div>
          <div className="time">{clock(now)}</div>
          <div className="date">{longDate(now)}</div>
          {h.ready && (
            <div className="wx">
              <span><b>{deg(h.outside, 0)}</b> {HA.outsideLabel}, {h.conditionText.toLowerCase()}</span>
              <span><b>{deg(h.inside)}</b> inside</span>
            </div>
          )}
          {h.ready && <Hours hours={h.hours} now={now} n={5} className="fc" />}
          <StatsCard stats={stats} error={statsError} now={now} />
        </div>

        {h.ready ? (
          <div className="ctl">
            <button className="f c" data-f="" data-ok={sunsetOk(h)} onClick={h.sunset}>
              <div className="row"><Sunset size={50} /><StateTag on={h.sunsetLightsOn} /></div>
              <div><div className="t">Sunset lights</div><div className="sub">{sunsetSub(h)}</div></div>
            </button>
            <button className="f c" data-f="" data-ok="Turn all lights off" onClick={h.allOff}>
              <Power size={50} />
              <div>
                <div className="t">All lights off</div>
                {h.lightsOn.length ? (
                  <>
                    <div className="sub">On now:</div>
                    <div className="chips">{chips.map(n => <i key={n}>{n}</i>)}{more > 0 && <i>+{more}</i>}</div>
                  </>
                ) : <div className="sub">All off now</div>}
              </div>
            </button>
            <button className="f c" data-f="" data-ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm}>
              <div className="row"><AlarmClock size={50} /><StateTag on={h.alarmOn} /></div>
              <div><div className="t">Alarm</div><div className="sub">{HA.alarmLabel}</div></div>
            </button>
            <button className="f c" data-f="" data-heat="" data-ok="Change the heating" onClick={onOpenHeating}>
              <div className="row"><span className="sub" style={{ margin: 0 }}>Heating</span><StateTag on={h.heatOn} /></div>
              <div>
                <div className="big" style={{ display: "flex", alignItems: "center", gap: 12 }}><Heater size={40} />{h.heatOn ? deg(h.heatTarget) : "Off"}</div>
                <div className="sub">{heatSub(h)}</div>
              </div>
            </button>
            <div className="c">
              <div className="sub" style={{ margin: 0 }}>Inside, living room</div>
              <div><div className="big">{deg(h.inside)}</div><div className="sub">{h.humidity !== null ? `Humidity ${Math.round(h.humidity)}%` : " "}</div></div>
            </div>
            <div className="c">
              <div className="row"><span className="sub" style={{ margin: 0 }}>Outside, {HA.outsideLabel}</span><WeatherIcon state={h.condition} size={38} /></div>
              <div><div className="big">{deg(h.outside, 0)}</div><div className="sub">{h.conditionText || " "}{h.rainAt ? `, rain at ${h.rainAt}` : ""}</div></div>
            </div>
          </div>
        ) : (
          <div className="ctl">
            <button className="f c wide" data-f="" data-ok="Open Settings, Home Assistant" onClick={onSettings}>
              <span className="t">{connect.title}</span>
              <span className="sub">{connect.body}</span>
            </button>
          </div>
        )}
      </div>

      {h.ready && <NowPlaying h={h} onOpen={onOpenMusic} className="np np-classic" />}

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </>
  );
}
