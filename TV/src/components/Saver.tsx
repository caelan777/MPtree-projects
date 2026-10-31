import { Logo } from "./Logo";
import { CONDITION, num, type Ha } from "../ha";
import { HA } from "../homeConfig";
import { short, type MptreeStats } from "../stats";
import { clock, deg, longDate } from "../format";
import { usePhoto } from "../photos";

type Props = { now: Date; ha: Ha; stats: MptreeStats | null; photos: boolean };

/** The screensaver: a big clock, the house and the MPTree numbers, over a photo of
 *  somewhere beautiful (Wikimedia Commons) that changes every minute. Without
 *  photos (switched off, or no internet) it is the plain white one. The text
 *  drifts a little every minute so nothing burns into the screen. */
export function Saver({ now, ha, stats, photos }: Props) {
  const photo = usePhoto(photos);
  const s = ha.states;
  const minute = Math.floor(now.getTime() / 60000);
  const dx = ((minute * 37) % 60) - 30;
  const dy = ((minute * 23) % 40) - 20;
  const lightsOn = Object.values(s).filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on").length;
  const heat = s[HA.heating];

  const home = ha.status === "ok" && (
    <>
      <div className="lh">Home</div>
      <div className="li"><span>Outside, {HA.outsideLabel}</span><span>{deg(num(s[HA.weather], "temperature"), 0)} {(CONDITION[s[HA.weather]?.state ?? ""] ?? "").toLowerCase()}</span></div>
      <div className="li"><span>Inside</span><span>{deg(num(s[HA.insideTemp]))}</span></div>
      <div className="li"><span>Heating</span><span>{heat && heat.state !== "off" ? deg(num(heat, "temperature")) : "Off"}</span></div>
      <div className="li"><span>Lights on</span><span>{lightsOn}</span></div>
      <div className="li"><span>Alarm, {HA.alarmLabel}</span><span>{s[HA.alarm]?.state === "on" ? "On" : "Off"}</span></div>
    </>
  );
  const numbers = stats && (
    <>
      <div className="lh">MPTree</div>
      <div className="li"><span>Play installs</span><span>{short(stats.installs)}{stats.installsToday ? ` (+${stats.installsToday})` : ""}</span></div>
      <div className="li"><span>Rating</span><span>{stats.rating ?? "–"}</span></div>
    </>
  );

  if (photo) {
    return (
      <div className="saver photo">
        <img key={photo.url} className="ph-img" src={photo.url} alt="" />
        <div className="ph-shade" />
        <div className="ph-in" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
          <div>
            <div className="time">{clock(now)}</div>
            <div className="date">{longDate(now)}</div>
          </div>
          <div className="ph-card">{home}{numbers}</div>
        </div>
        <div className="ph-credit">{photo.title} · {photo.artist}{photo.licence ? ` · ${photo.licence}` : ""} · Wikimedia Commons</div>
      </div>
    );
  }

  return (
    <div className="saver">
      <div className="in" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <div>
          <div className="time">{clock(now)}</div>
          <div className="date" style={{ fontSize: 40, marginTop: 18 }}>{longDate(now)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 70, color: "var(--muted)", fontSize: 24 }}>
            <Logo size={46} />Press any button
          </div>
        </div>
        <div>{home}{numbers}</div>
      </div>
    </div>
  );
}
