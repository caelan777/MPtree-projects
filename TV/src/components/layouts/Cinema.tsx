import { Pause, Play, Plus, Shuffle } from "lucide-react";
import { connectText, heatLine, sunsetOk } from "../../home";
import { clock, deg } from "../../format";
import { StatsLine, type LayoutProps } from "./parts";

/** A filled dot for on, an empty one for off, none when it can't be told. */
function Dot({ on }: { on: boolean | null }) {
  return on === null ? null : <span className={"dot" + (on ? "" : " off")} />;
}

/** Cinema: always dark. The apps are the stars, as tall cards; the selected one
 *  turns white and says "OK to open". The house is a row of small buttons below. */
export function Cinema({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating, onOpenMusic }: LayoutProps) {
  const p = h.playing;
  return (
    <div className="cin">
      <div className="cin-top">
        <b>{clock(now)}</b>
        {h.ready && <span>{deg(h.outside, 0)} {h.conditionText.toLowerCase()} · {deg(h.inside)} inside</span>}
      </div>

      <div className="cin-row">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f poster" data-f="" data-ok={`Open ${a.label}`} data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            <span className="ghost">{a.label.slice(0, 2)}</span>
            {a.image && <img className={a.isBanner ? "bn" : "ic"} src={a.image} alt="" />}
            <span className="nm">{a.label}</span>
            <span className="open">OK to open</span>
          </button>
        ))}
        {dock.length < 6 && (
          <button className="f poster add" data-f="" data-ok="Choose an app to add to Home" onClick={onAddApp}>
            <Plus size={44} />
            <span className="nm">Add app</span>
          </button>
        )}
      </div>

      <div className="cin-bottom">
        <div className="grp">
          {h.ready ? (
            <>
              <button className="f pill" data-f="" data-ok={sunsetOk(h)} onClick={h.sunset}><Dot on={h.sunsetLightsOn} />Sunset lights</button>
              <button className="f pill" data-f="" data-ok="Turn all lights off" onClick={h.allOff}>All lights off{h.lightsOn.length ? <span className="sub">{h.lightsOn.length} on</span> : null}</button>
              <button className="f pill" data-f="" data-heat="" data-ok="Change the heating" onClick={onOpenHeating}><Dot on={h.heatOn} />Heating {heatLine(h)}</button>
              <button className="f pill" data-f="" data-ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm}><Dot on={h.alarmOn} />Alarm</button>
            </>
          ) : h.off ? null : (
            <button className="f pill" data-f="" data-ok="Open Settings, Home Assistant" onClick={onSettings}>{connectText(ha).title}</button>
          )}
          {p ? (
            <button className="f pill np-pill" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
              {p.playing ? <Pause size={24} /> : <Play size={24} />}<span className="ttl">{p.title}</span>
            </button>
          ) : h.shuffleName ? (
            <button className="f pill" data-f="" data-ok={`Shuffle all songs, ${h.shuffleWhere}`} onClick={h.shuffleMusic}><Shuffle size={24} />Shuffle music</button>
          ) : null}
        </div>
        <StatsLine stats={stats} />
      </div>
    </div>
  );
}
