import type { ReactNode } from "react";
import { AlarmClock, Droplets, Heater, Play, Power, Settings as Gear, Shuffle, Sunset } from "lucide-react";
import type { Ha } from "../ha";
import { HA } from "../homeConfig";
import { connectText, heatSub, lightsLine, sunsetOk, sunsetSub, type Home } from "../home";
import { kicker, type Music } from "../music";
import { clock, deg } from "../format";
import { Cover, EdgeTab, MusicButtons, SongLine, WeatherIcon } from "./layouts/parts";

type Props = {
  now: Date;
  ha: Ha;
  home: Home;
  /** What plays on a speaker in the house (Home Assistant), or null. */
  speaker: Music | null;
  onOpenHeating: () => void;
  onOpenMusic: () => void;
  onSettings: () => void;
};

/** ON or OFF with a dot, or a count ("2 ON"). Nothing when it can't be told. */
function State({ on, text }: { on: boolean | null; text?: string }) {
  if (on === null) return <span className="st none" />;
  return <span className={"st" + (on ? " on" : "")}>{text ?? (on ? "ON" : "OFF")}</span>;
}

function Tile({ icon, state, title, big, sub, ok, onClick, isDefault, heat }: {
  icon: ReactNode; state: ReactNode; title?: string; big?: string; sub: string; ok: string; onClick: () => void; isDefault?: boolean; heat?: boolean;
}) {
  return (
    <button className="f tl" data-f="" data-ok={ok} data-default={isDefault ? "" : undefined} data-heat={heat ? "" : undefined} onClick={onClick}>
      <span className="row1"><span className="ico">{icon}</span>{state}</span>
      <span>
        {big !== undefined ? <span className="big">{big}</span> : <span className="t">{title}</span>}
        <span className="s">{sub}</span>
      </span>
    </button>
  );
}

/** Home's second page: everything Home Assistant does in the house, in soft tiles.
 *  Right from the first page comes here; Left or Back goes back. */
export function HouseView({ now, ha, home: h, speaker: m, onOpenHeating, onOpenMusic, onSettings }: Props) {
  const n = h.lightsOn.length;
  const connect = connectText(ha);
  return (
    <div className="hs">
      <div className="hs-head">
        <div>
          <h2>The house</h2>
          {h.ready && (
            <p>{lightsLine(n)} · heating {h.heatOn ? `on, ${deg(h.heatTarget)}` : "off"} · alarm {h.alarmOn ? "on" : "off"}</p>
          )}
        </div>
        <div className="hs-clock">
          <b>{clock(now)}</b>
          {h.hasWeather && <span>{deg(h.outside, 0)} {h.conditionText.toLowerCase()}</span>}
        </div>
      </div>

      {h.ready ? (
        <>
          <div className="hs-tiles">
            <Tile icon={<Sunset size={30} />} state={<State on={h.sunsetLightsOn} />} title="Sunset lights" sub={sunsetSub(h)}
              ok={sunsetOk(h)} onClick={h.sunset} isDefault />
            <Tile icon={<Power size={30} />} state={<State on={n > 0} text={n > 0 ? `${n} ON` : "ALL OFF"} />} title="All lights off"
              sub={n ? h.lightsOn.join(", ") : "Nothing is on"} ok="Turn all lights off" onClick={h.allOff} />
            <Tile icon={<AlarmClock size={30} />} state={<State on={h.alarmOn} />} title="Alarm"
              sub={HA.alarmLabel + (h.alarmOn && h.nextAlarmDay ? ` · next on ${h.nextAlarmDay}` : "")}
              ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm} />
            <Tile icon={<Heater size={30} />} state={<State on={h.heatOn} />} big={h.heatOn ? deg(h.heatTarget) : "Off"} sub={`${HA.heatingLabel} · ${heatSub(h)}`}
              ok="Change the heating" onClick={onOpenHeating} heat />
            <div className="tl info">
              <span className="row1"><span className="ico"><Droplets size={30} /></span></span>
              <span><span className="big">{deg(h.inside)}</span><span className="s">Inside, living room{h.humidity !== null ? ` · humidity ${Math.round(h.humidity)}%` : ""}</span></span>
            </div>
            <div className="tl info">
              <span className="row1"><span className="ico"><WeatherIcon state={h.condition} size={30} /></span></span>
              <span><span className="big">{deg(h.outside, 0)}</span><span className="s">{HA.outsideLabel}{h.conditionText ? `, ${h.conditionText.toLowerCase()}` : ""}{h.rainAt ? ` · rain from ${h.rainAt}` : ""}</span></span>
            </div>
          </div>

          {m ? (
            <div className="hs-np">
              <Cover m={m} className="art" />
              <span className="tx"><b>{m.title}</b><span>{m.artist ? `${m.artist} · ` : ""}{kicker(m)}</span></span>
              <span className="btns">
                <MusicButtons m={m} className="mb" />
                <button className="f mb more" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>All controls</button>
              </span>
              <SongLine m={m} now={now} />
            </div>
          ) : h.shuffleName ? (
            <button className="f hs-np shuffle" data-f="" data-ok={`Shuffle all songs on the ${HA.speakerLabel.toLowerCase()}`} onClick={h.shuffleMusic}>
              <span className="art icon"><Shuffle size={30} /></span>
              <span className="tx"><b>Shuffle music</b><span>All songs · {HA.speakerLabel}</span></span>
              <span className="mb pl as"><Play size={28} /></span>
            </button>
          ) : null}
        </>
      ) : (
        <div className="hs-off">
          <h3>{connect.title}</h3>
          <p>{connect.body}</p>
          <button className="f pill" data-f="" data-default="" data-ok="Open Settings, Home Assistant" onClick={onSettings}><Gear size={26} />Open Settings</button>
        </div>
      )}

      <EdgeTab side="left" label="Home" />
    </div>
  );
}
