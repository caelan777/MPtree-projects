import { HA } from "../../homeConfig";
import { connectText, heatLine, lightsLine } from "../../home";
import { short } from "../../stats";
import { clock, deg } from "../../format";
import { type LayoutProps } from "./parts";

/** Editorial: no tiles, the screen reads like the opening of a newspaper. The
 *  numbers are black, the words around them grey; the buttons are words too. */
export function Editorial({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating }: LayoutProps) {
  const day = now.toLocaleDateString("en-GB", { weekday: "long" });
  return (
    <div className="ed">
      <p className="ed-lede">
        It's <b>{clock(now)}</b> on {day}.{" "}
        {h.ready && (
          <>
            Outside in {HA.outsideLabel} it is <b>{deg(h.outside, 0)}</b>{h.conditionText ? ` and ${h.conditionText.toLowerCase()}` : ""},
            inside <b>{deg(h.inside)}</b>.{" "}
            {h.sunsetAt && <>The sun sets at <b>{h.sunsetAt}</b>. </>}
          </>
        )}
        {stats?.installs != null && (
          <>MPTree has <b>{short(stats.installs)}</b> installs{stats.installsToday ? <>, <b>{stats.installsToday}</b> of them today</> : null}.</>
        )}
      </p>

      <div className="ed-acts">
        {h.ready ? (
          <>
            <button className="f ed-act" data-f="" onClick={h.sunset}>Sunset</button>
            <button className="f ed-act" data-f="" onClick={h.allOff}>All lights off</button>
            <button className="f ed-act" data-f="" data-heat="" onClick={onOpenHeating}>Heating {heatLine(h)}</button>
            <button className="f ed-act" data-f="" onClick={h.toggleAlarm}>Alarm {h.alarmOn ? "on" : "off"}</button>
          </>
        ) : (
          <button className="f ed-act" data-f="" onClick={onSettings}>{connectText(ha).title}</button>
        )}
      </div>
      {h.ready && (
        <div className="ed-side">
          {lightsLine(h.lightsOn)}<br />
          Humidity <b>{h.humidity !== null ? `${Math.round(h.humidity)}%` : "–"}</b>
        </div>
      )}

      <div className="ed-apps">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f ed-app" data-f="" data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            {a.label}
          </button>
        ))}
        {dock.length < 6 && <button className="f ed-app dim" data-f="" onClick={onAddApp}>+ Add</button>}
      </div>
    </div>
  );
}
