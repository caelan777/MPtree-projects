import { HA } from "../../homeConfig";
import { connectText, greeting, heatLine, sunsetOk, type Home } from "../../home";
import { short } from "../../stats";
import { clock, deg } from "../../format";
import { type LayoutProps } from "./parts";

/** "2 hours", "1 hour", "40 minutes". */
function roughly(min: number): string {
  if (min < 55) return `${Math.max(1, Math.round(min / 5) * 5)} minutes`;
  const h = Math.round(min / 60);
  return h === 1 ? "1 hour" : `${h} hours`;
}

function sunSentence(h: Home) {
  if (h.toSunset !== null) return <>The sun sets in <b>{roughly(h.toSunset)}</b>.</>;
  return h.sunriseAt ? <>The sun comes up at <b>{h.sunriseAt}</b>.</> : null;
}

/** Editorial: no tiles, the screen reads like the opening of a newspaper. The
 *  numbers are black, the words around them grey; the buttons are underlined words. */
export function Editorial({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating, onOpenMusic }: LayoutProps) {
  const n = h.lightsOn.length;
  const p = h.playing;
  return (
    <div className="ed">
      <div className="ed-text">
      <p className="ed-lede">
        {greeting(now)}. It's <b>{clock(now)}</b>
        {h.ready ? (
          <>, <b>{deg(h.outside, 0)}</b>{h.conditionText ? ` and ${h.conditionText.toLowerCase()}` : ""} in {HA.outsideLabel} and <b>{deg(h.inside)}</b> inside. {sunSentence(h)}</>
        ) : "."}
      </p>

      {h.ready && (
        <p className="ed-more">
          {h.rainAt ? <>Rain from <b>{h.rainAt}</b>. </> : null}
          {n === 0 ? <>All lights are <b>off</b>. </> : <><b>{n === 1 ? "1 light" : `${n} lights`}</b> {n === 1 ? "is" : "are"} on. </>}
          {p ? <><b>{p.title}</b> is {p.playing ? "playing" : "paused"} on the {p.where}. </> : null}
          The alarm for {h.nextAlarmDay || "Wednesday"} is <b>{h.alarmOn ? "on" : "off"}</b>.{" "}
          {stats?.installs != null && (
            <>MPTree has <b>{short(stats.installs)}</b> installs{stats.installsToday ? <>, <b>{stats.installsToday}</b> today</> : null}.</>
          )}
        </p>
      )}
      </div>

      <div className="ed-acts">
        {h.ready ? (
          <>
            <button className="f ed-act" data-f="" data-ok={sunsetOk(h)} onClick={h.sunset}>Sunset lights</button>
            <button className="f ed-act" data-f="" data-ok="Turn all lights off" onClick={h.allOff}>All lights off</button>
            <button className="f ed-act" data-f="" data-heat="" data-ok="Change the heating" onClick={onOpenHeating}>Heating {heatLine(h)}</button>
            <button className="f ed-act" data-f="" data-ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm}>Alarm {h.alarmOn ? "on" : "off"}</button>
            {p ? (
              <button className="f ed-act" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>Music controls</button>
            ) : h.shuffleName ? (
              <button className="f ed-act" data-f="" data-ok="Shuffle all songs in the living room" onClick={h.shuffleMusic}>Music in the living room</button>
            ) : null}
          </>
        ) : (
          <button className="f ed-act" data-f="" data-ok="Open Settings, Home Assistant" onClick={onSettings}>{connectText(ha).title}</button>
        )}
      </div>

      <div className="ed-apps">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f ed-app" data-f="" data-ok={`Open ${a.label}`} data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            {a.label}
          </button>
        ))}
        {dock.length < 6 && <button className="f ed-app dim" data-f="" data-ok="Choose an app to add to Home" onClick={onAddApp}>+ Add</button>}
      </div>
    </div>
  );
}
