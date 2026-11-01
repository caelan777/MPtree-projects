import { AlarmClock, Pause, Play, Shuffle, Sunset } from "lucide-react";
import { AddTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { connectText, sunsetOk } from "../../home";
import { clock, deg, longDate } from "../../format";
import { StateTag, StatsLine, type LayoutProps } from "./parts";

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

/** Day line: the day from 06:00 to midnight. The sun's path with a dot for now,
 *  the temperature through the day, rain as a dashed box, the 08:00 alarm, and the
 *  Sunset lights button pinned to the moment the sun goes down. */
export function DayLine({ now, ha, home: h, stats, dock, onOpenApp, onAddApp, onSettings, onOpenHeating, onOpenMusic }: LayoutProps) {
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
  const btnLeft = Math.min(W - 400, Math.max(0, xs + 24));

  // Where the arc is at a given x, so the temperatures can sit just under it.
  const arc: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) arc.push({ x: bezier(i / 40, xr, c1, c2, xs), y: bezier(i / 40, BASE, top, top, BASE) });
  const arcY = (x: number) => {
    if (x <= xr || x >= xs) return BASE;
    const j = arc.findIndex(p => p.x >= x);
    const a = arc[Math.max(0, j - 1)], b = arc[j];
    return a.y + (b.y - a.y) * ((x - a.x) / Math.max(1, b.x - a.x));
  };

  // Today's hours that fall on the line.
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const today = h.hours.filter(x => x.at >= dayStart.getTime() + START_H * 3_600_000 && x.at < dayStart.getTime() + 24 * 3_600_000)
    .map(x => ({ ...x, hr: hourOf(new Date(x.at)) }));
  const temps = today.filter(x => Math.round(x.hr) % 2 === 0 && x.temp !== null && x.at > now.getTime() - 3_600_000);
  // Rain: one dashed box per run of rainy hours.
  const rain: { from: number; to: number }[] = [];
  for (const x of today) {
    if (!x.rain) continue;
    const last = rain[rain.length - 1];
    if (last && Math.abs(last.to - x.hr) < 0.01) last.to = x.hr + 1;
    else rain.push({ from: x.hr, to: x.hr + 1 });
  }
  const xAlarm = xOf(8);
  const p = h.playing;

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
        {rain.map(r => (
          <g key={r.from}>
            <rect x={xOf(r.from)} y={BASE - 50} width={Math.max(40, xOf(r.to) - xOf(r.from))} height="50" rx="10" fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="8 8" />
            <text x={xOf(r.from) + Math.max(40, xOf(r.to) - xOf(r.from)) / 2} y={BASE + 26} textAnchor="middle" className="dl-rain">rain</text>
          </g>
        ))}
        <path d={`M${xr} ${BASE} C ${c1} ${top}, ${c2} ${top}, ${xs} ${BASE}`} fill="none" stroke="var(--text)" strokeWidth="4" />
        {up && <path d={done} fill="none" stroke="var(--text)" strokeWidth="12" strokeLinecap="round" opacity=".12" />}
        {temps.map(x => {
          const px = xOf(x.hr);
          return <text key={x.at} x={px} y={Math.min(BASE - 22, arcY(px) + 44)} textAnchor="middle" className="dl-temp">{deg(x.temp, 0)}</text>;
        })}
        <circle cx={dot.x} cy={dot.y} r="20" fill="var(--text)" />
        <text x={dot.x} y={dot.y - 36} textAnchor="middle" className="dl-now">now</text>
        {[6, 10, 14, 18, 22].map(hr => <text key={hr} x={xOf(hr)} y={BASE + 44} className="dl-tick">{String(hr).padStart(2, "0")}</text>)}
        {h.sunriseAt && <text x={xr - 12} y={BASE - 12} textAnchor="end" className="dl-mark">{h.sunriseAt}</text>}
        {h.ready && <line x1={xAlarm} y1={BASE - 14} x2={xAlarm} y2={BASE + 14} stroke="var(--text)" strokeWidth="3" />}
      </svg>
      {h.ready && (
        <div className="dl-alarm" style={{ left: 96 + xAlarm - 14 }}>
          <AlarmClock size={24} />08:00 alarm Wed, Thu ({h.alarmOn ? "on" : "off"})
        </div>
      )}

      {h.ready && (
        <button className="f dl-sun" data-f="" data-ok={sunsetOk(h)} style={{ left: 96 + btnLeft }} onClick={h.sunset}>
          <span><Sunset size={34} />Sunset lights{h.sunsetAt ? ` · ${h.sunsetAt}` : ""}</span>
          <span className="sub">{h.sunsetLightsOn === true ? "On now · OK turns them off" : h.sunsetLightsOn === false ? "Off now · OK turns them on" : "OK switches them now"}</span>
        </button>
      )}

      <div className="dl-acts">
        {h.ready ? (
          <>
            <button className="f pill" data-f="" data-ok="Turn all lights off" onClick={h.allOff}>All lights off<span className="sub">{h.lightsOn.length ? `${h.lightsOn.length} on` : "all off"}</span></button>
            <button className="f pill" data-f="" data-heat="" data-ok="Change the heating" onClick={onOpenHeating}>Heating <StateTag on={h.heatOn} className="stt" />{h.heatOn ? deg(h.heatTarget) : ""}</button>
            <button className="f pill" data-f="" data-ok={h.alarmOn ? "Turn the alarm off" : "Turn the alarm on"} onClick={h.toggleAlarm}>Alarm <StateTag on={h.alarmOn} className="stt" /></button>
            {p ? (
              <button className="f pill np-pill" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
                {p.playing ? <Pause size={24} /> : <Play size={24} />}<span className="ttl">{p.title}</span>
              </button>
            ) : h.shuffleName ? (
              <button className="f pill" data-f="" data-ok="Shuffle all songs in the living room" onClick={h.shuffleMusic}><Shuffle size={24} />Shuffle music</button>
            ) : null}
          </>
        ) : (
          <button className="f pill" data-f="" data-ok="Open Settings, Home Assistant" onClick={onSettings}>{connectText(ha).title}</button>
        )}
        <StatsLine stats={stats} />
      </div>

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </div>
  );
}
