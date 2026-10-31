import { AlarmClock, Heater, Plus, Power, Sunset } from "lucide-react";
import { connectText, heatLine } from "../../home";
import { clock, deg } from "../../format";
import { StatsLine, type LayoutProps } from "./parts";

/** Cinema: always dark. The apps are the stars, as tall cards; the house and the
 *  numbers sit in thin strips above and below. */
export function Cinema({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating }: LayoutProps) {
  return (
    <div className="cin">
      <div className="cin-top">
        <b>{clock(now)}</b>
        {h.ready && <span>{deg(h.outside, 0)} {h.conditionText.toLowerCase()} · {deg(h.inside)} inside</span>}
      </div>

      <div className="cin-row">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f poster" data-f="" data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            <span className="ghost">{a.label.slice(0, 2)}</span>
            {a.image && <img className={a.isBanner ? "bn" : "ic"} src={a.image} alt="" />}
            <span className="nm">{a.label}</span>
          </button>
        ))}
        {dock.length < 6 && (
          <button className="f poster add" data-f="" onClick={onAddApp}>
            <Plus size={44} />
            <span className="nm">Add app</span>
          </button>
        )}
      </div>

      <div className="cin-bottom">
        <div className="grp">
          {h.ready ? (
            <>
              <button className="f pill" data-f="" onClick={h.sunset}><Sunset size={34} />Sunset{h.sunsetAt ? ` ${h.sunsetAt}` : ""}</button>
              <button className="f pill" data-f="" onClick={h.allOff}><Power size={30} />All lights off</button>
              <button className="f pill" data-f="" data-heat="" onClick={onOpenHeating}><Heater size={30} />{heatLine(h)}</button>
              <button className="f pill" data-f="" onClick={h.toggleAlarm}><AlarmClock size={30} />{h.alarmOn ? "Alarm on" : "Alarm off"}</button>
            </>
          ) : (
            <button className="f pill" data-f="" onClick={onSettings}>{connectText(ha).title}</button>
          )}
        </div>
        <StatsLine stats={stats} />
      </div>
    </div>
  );
}
