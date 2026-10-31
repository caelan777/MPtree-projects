import { AlarmClock, Heater, Power, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, lightsLine } from "../../home";
import { clock, deg, longDate } from "../../format";
import { StatsCard, WeatherIcon, type LayoutProps } from "./parts";

/** Classic: clock and numbers on the left, the house on the right, apps below. */
export function Classic({ now, ha, home: h, stats, statsError, dock, onOpenApp, onAddApp, onSettings, onOpenHeating }: LayoutProps) {
  const connect = connectText(ha);
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
          <StatsCard stats={stats} error={statsError} now={now} />
        </div>

        {h.ready ? (
          <div className="ctl">
            <button className="f c" data-f="" onClick={h.sunset}>
              <Sunset size={54} />
              <div><div className="t">Sunset</div><div className="sub">{h.sunsetAt ? `Sun sets at ${h.sunsetAt}. OK switches the lights.` : "OK switches the sunset lights"}</div></div>
            </button>
            <button className="f c" data-f="" onClick={h.allOff}>
              <Power size={54} />
              <div><div className="t">All lights off</div><div className="sub">{lightsLine(h.lightsOn)}</div></div>
            </button>
            <button className="f c" data-f="" onClick={h.toggleAlarm}>
              <div className="row"><AlarmClock size={54} /><span className={"state" + (h.alarmOn ? "" : " off")}>{h.alarmOn ? "ON" : "OFF"}</span></div>
              <div><div className="t">Alarm</div><div className="sub">{HA.alarmLabel}</div></div>
            </button>
            <button className="f c" data-f="" data-heat="" onClick={onOpenHeating}>
              <div className="row"><span className="sub" style={{ margin: 0 }}>Heating</span><span className={"state" + (h.heatOn ? "" : " off")}>{h.heatOn ? "ON" : "OFF"}</span></div>
              <div>
                <div className="big" style={{ display: "flex", alignItems: "center", gap: 14 }}><Heater size={44} />{deg(h.heatTarget)}</div>
                <div className="sub">Now {deg(h.heatCurrent)}. OK to change.</div>
              </div>
            </button>
            <div className="c">
              <div className="sub" style={{ margin: 0 }}>Inside, living room</div>
              <div><div className="big">{deg(h.inside)}</div><div className="sub">{h.humidity !== null ? `Humidity ${Math.round(h.humidity)}%` : " "}</div></div>
            </div>
            <div className="c">
              <div className="row"><span className="sub" style={{ margin: 0 }}>Outside, {HA.outsideLabel}</span><WeatherIcon state={h.condition} size={40} /></div>
              <div><div className="big">{deg(h.outside, 0)}</div><div className="sub">{h.conditionText || " "}</div></div>
            </div>
          </div>
        ) : (
          <div className="ctl">
            <button className="f c wide" data-f="" onClick={onSettings}>
              <span className="t">{connect.title}</span>
              <span className="sub">{connect.body}</span>
            </button>
          </div>
        )}
      </div>

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </>
  );
}
