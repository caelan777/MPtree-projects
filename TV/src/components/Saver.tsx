import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Vinyl } from "./layouts/parts";
import { CONDITION, num, type Ha } from "../ha";
import { HA } from "../homeConfig";
import { short, type MptreeStats } from "../stats";
import { clock, deg, longDate, mmss } from "../format";
import { positionAt, type Music } from "../music";
import { usePhoto } from "../photos";

type Props = { now: Date; ha: Ha; stats: MptreeStats | null; photos: boolean; music: Music | null };

/** The screensaver: a big clock, the house and the MPTree numbers, over a photo of
 *  somewhere beautiful (Wikimedia Commons) that changes every minute. Without
 *  photos (switched off, or no internet) it is the plain white one. While MPTree
 *  plays, it is the song instead. The text drifts a little every minute so
 *  nothing burns into the screen. */
export function Saver({ now, ha, stats, photos, music }: Props) {
  const playing = !!music?.playing;
  const photo = usePhoto(photos && !playing);
  const s = ha.states;
  const minute = Math.floor(now.getTime() / 60000);
  const dx = ((minute * 37) % 60) - 30;
  const dy = ((minute * 23) % 40) - 20;

  if (music && playing) return <SongSaver m={music} now={now} dx={dx} dy={dy} />;
  const lightsOn = Object.values(s).filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on").length;
  const heat = s[HA.heating];

  const house = ha.status === "ok";
  const outside = num(s[HA.weather], "temperature");
  const home = (house || outside !== null) && (
    <>
      <div className="lh">{house ? "Home" : "Weather"}</div>
      {outside !== null && <div className="li"><span>Outside, {HA.outsideLabel}</span><span>{deg(outside, 0)} {(CONDITION[s[HA.weather]?.state ?? ""] ?? "").toLowerCase()}</span></div>}
      {house && (
        <>
          <div className="li"><span>Inside</span><span>{deg(num(s[HA.insideTemp]))}</span></div>
          <div className="li"><span>Heating</span><span>{heat && heat.state !== "off" ? deg(num(heat, "temperature")) : "Off"}</span></div>
          <div className="li"><span>Lights on</span><span>{lightsOn}</span></div>
          <div className="li"><span>Alarm, {HA.alarmLabel}</span><span>{s[HA.alarm]?.state === "on" ? "On" : "Off"}</span></div>
        </>
      )}
    </>
  );

  const numbers = stats && (
    <>
      <div className="lh">MPTree</div>
      <div className="li"><span>Downloads</span><span>{short(stats.total)}</span></div>
      <div className="li"><span>Today</span><span>+{stats.today}</span></div>
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

/** While MPTree plays: the cover with MPTree's record turning behind it, the
 *  song, how far it is, and a small clock. No cover: the record alone. */
function SongSaver({ m, now, dx, dy }: { m: Music; now: Date; dx: number; dy: number }) {
  // Its own clock, a tick a second, so the time in the song moves between updates.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const pos = positionAt(m, nowMs);
  const pct = pos !== null && m.duration ? Math.min(100, (pos / m.duration) * 100) : 0;

  return (
    <div className="saver song">
      <div className="sg-in" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
        <div className="sg-clock"><span>{longDate(now)}</span><b>{clock(now)}</b></div>
        <div className={"sg-art" + (m.art ? "" : " bare")}>
          <Vinyl spinning className="sg-disc" />
          {m.art && <img className="sg-cover" src={m.art} alt="" />}
        </div>
        <div className="sg-t">
          <div className="sg-kick"><Logo size={30} color="#a3a6ad" />MPTree</div>
          <h2>{m.title}</h2>
          {m.artist && <p>{m.artist}</p>}
          {m.duration !== null && (
            <div className="sg-prog">
              <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="times"><span>{mmss(pos)}</span><span>{mmss(m.duration)}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
