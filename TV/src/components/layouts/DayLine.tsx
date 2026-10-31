import { AlarmClock, Heater, Power, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, heatLine, lightsLine } from "../../home";
import { clock, deg, longDate } from "../../format";
import { StatsLine, type LayoutProps } from "./parts";

// The line runs from 06:00 to 24:00 across 1728 px: 96 px an hour.
const START_H = 6;
const PX_H = 96;
const W = 1728;
const BASE = 200;

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;
const xOf = (h: number) => Math.min(W, Math.max(0, (h - START_H) * PX_H));

/** The time of day a Home Assistant timestamp falls on, as hours (17.2 for 17:12). */
function hourFrom(iso: string | undefined, fallback: number): number {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? hourOf(new Date(t)) : fallback;
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Day line: the day from sunrise to midnight. The sun's path, a dot for now,
 *  and the Sunset button pinned to the moment the sun goes down. */
export function DayLine({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating }: LayoutProps) {
  const rise = hourFrom(ha.states[HA.sunrise]?.state, 7.5);
  const set = hourFrom(ha.states[HA.sunset]?.state, 17.2);
  const xr = xOf(rise), xs = xOf(set);
  const c1 = xr + (xs - xr) * 0.28, c2 = xr + (xs - xr) * 0.72, top = -40;
  const nowH = hourOf(now);
  const up = nowH > rise && nowH < set;
  const t = up ? (nowH - rise) / (set - rise) : 0;
  const dot = up
    ? { x: bezier(t, xr, c1, c2, xs), y: bezier(t, BASE, top, top, BASE) }
    : { x: xOf(nowH < START_H ? START_H : nowH), y: BASE };
  // The part of the path already behind the sun, drawn heavier: the curve split
  // at "now" (de Casteljau), so it follows the arc exactly.
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const q1 = { x: lerp(xr, c1), y: lerp(BASE, top) };
  const mid = { x: lerp(c1, c2), y: top };
  const q2 = { x: q1.x + (mid.x - q1.x) * t, y: q1.y + (mid.y - q1.y) * t };
  const done = up ? `M${xr} ${BASE} C ${q1.x} ${q1.y}, ${q2.x} ${q2.y}, ${dot.x} ${dot.y}` : "";
  // The button sits just right of where the sun goes down, above the line, in the evening.
  const btnLeft = Math.min(W - 340, Math.max(0, xs + 24));

  return (
    <div className="dl">
      <div className="dl-head">
        <div><div className="t">{clock(now)}</div><div className="d">{longDate(now)}</div></div>
        {h.ready && (
          <div className="dl-temps">
            <div><div className="n">{deg(h.outside, 0)}</div><div className="k">outside, {h.conditionText.toLowerCase()}</div></div>
            <div><div className="n">{deg(h.inside)}</div><div className="k">inside{h.humidity !== null ? `, ${Math.round(h.humidity)}%` : ""}</div></div>
          </div>
        )}
      </div>

      <svg className="dl-svg" viewBox={`0 -60 ${W} 330`} width={W} height={330} aria-hidden="true">
        <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--border)" strokeWidth="3" />
        <rect x={xs} y={BASE} width={W - xs} height="10" fill="var(--text)" opacity=".08" />
        <path d={`M${xr} ${BASE} C ${c1} ${top}, ${c2} ${top}, ${xs} ${BASE}`} fill="none" stroke="var(--text)" strokeWidth="4" />
        {up && <path d={done} fill="none" stroke="var(--text)" strokeWidth="12" strokeLinecap="round" opacity=".12" />}
        <circle cx={dot.x} cy={dot.y} r="20" fill="var(--text)" />
        <text x={dot.x} y={dot.y - 36} textAnchor="middle" className="dl-now">now</text>
        {[6, 10, 14, 18, 22].map(hr => <text key={hr} x={xOf(hr)} y={BASE + 44} className="dl-tick">{String(hr).padStart(2, "0")}</text>)}
        {h.sunriseAt && <text x={xr} y={BASE - 22} className="dl-mark">{h.sunriseAt}</text>}
        {h.sunsetAt && <text x={xs + 12} y={BASE - 22} className="dl-mark">{h.sunsetAt}</text>}
      </svg>

      <div className="dl-acts">
        {h.ready ? (
          <>
            <button className="f pill" data-f="" onClick={h.allOff}><Power size={30} />All lights off<span className="sub">{lightsLine(h.lightsOn)}</span></button>
            <button className="f pill" data-f="" data-heat="" onClick={onOpenHeating}><Heater size={30} />Heating {heatLine(h)}</button>
            <button className="f pill" data-f="" onClick={h.toggleAlarm}><AlarmClock size={30} />Alarm {h.alarmOn ? "on" : "off"}</button>
          </>
        ) : (
          <button className="f pill" data-f="" onClick={onSettings}>{connectText(ha).title}</button>
        )}
        <StatsLine stats={stats} />
      </div>
      {h.ready && (
        <button className="f dl-sun" data-f="" style={{ left: 96 + btnLeft }} onClick={h.sunset}>
          <span><Sunset size={36} />Sunset{h.sunsetAt ? ` at ${h.sunsetAt}` : ""}</span>
          <span className="sub">OK switches the lights now</span>
        </button>
      )}

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </div>
  );
}
