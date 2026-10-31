import { Logo } from "./Logo";
import { CONDITION, num, type Ha } from "../ha";
import { HA } from "../homeConfig";
import { short, type MptreeStats } from "../stats";
import { clock, deg, longDate } from "../format";

/** The screensaver: a big clock, the house, and today's MPTree numbers.
 *  It drifts a little every minute so nothing burns into the screen. */
export function Saver({ now, ha, stats }: { now: Date; ha: Ha; stats: MptreeStats | null }) {
  const s = ha.states;
  const minute = Math.floor(now.getTime() / 60000);
  const dx = ((minute * 37) % 60) - 30;
  const dy = ((minute * 23) % 40) - 20;
  const lightsOn = Object.values(s).filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on").length;
  const heat = s[HA.heating];

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
        <div>
          {ha.status === "ok" && (
            <>
              <div className="lh">Home</div>
              <div className="li"><span>Outside, {HA.outsideLabel}</span><span>{deg(num(s[HA.weather], "temperature"), 0)} {(CONDITION[s[HA.weather]?.state ?? ""] ?? "").toLowerCase()}</span></div>
              <div className="li"><span>Inside</span><span>{deg(num(s[HA.insideTemp]))}</span></div>
              <div className="li"><span>Heating</span><span>{heat && heat.state !== "off" ? deg(num(heat, "temperature")) : "Off"}</span></div>
              <div className="li"><span>Lights on</span><span>{lightsOn}</span></div>
              <div className="li"><span>Alarm, {HA.alarmLabel}</span><span>{s[HA.alarm]?.state === "on" ? "On" : "Off"}</span></div>
            </>
          )}
          {stats && (
            <>
              <div className="lh">MPTree</div>
              <div className="li"><span>Play installs</span><span>{short(stats.installs)}{stats.installsToday ? ` (+${stats.installsToday})` : ""}</span></div>
              <div className="li"><span>Rating</span><span>{stats.rating ?? "–"}</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
