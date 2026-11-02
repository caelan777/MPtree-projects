import { Pause, Play, Shuffle } from "lucide-react";
import { AllAppsTile, AppTile } from "../AppTile";
import { HA } from "../../homeConfig";
import { clock, deg, longDate } from "../../format";
import { AppRow, Nums, type DayProps } from "./parts";

// The line runs from 06:00 to 24:00 across 1728 px: 96 px an hour.
const START_H = 6;
const PX_H = 96;
const W = 1728;
const BASE = 250;
/** The temperature curve lives between these two heights. */
const T_TOP = 120, T_LOW = 232;

const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60;
const xOf = (h: number) => Math.min(W, Math.max(0, (h - START_H) * PX_H));

/** The time of day a timestamp falls on, as hours (17.2 for 17:12). */
function hourFrom(iso: string | undefined, fallback: number): number {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? hourOf(new Date(t)) : fallback;
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** A smooth line through the points (Catmull-Rom, as cubic Béziers). */
function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** Day line: the day as one drawing, 06:00 to midnight. The sun's arc with a dot
 *  for now, the temperature as a soft shaded curve under it, rain as a hatched
 *  block, and the sunset marked where the sun goes down. */
export function DayLine({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  const states = h.sunStates;
  const rise = hourFrom(states.sunrise, 7.5);
  const set = hourFrom(states.sunset, 17.2);
  const xr = xOf(rise), xs = xOf(set);
  const c1 = xr + (xs - xr) * 0.28, c2 = xr + (xs - xr) * 0.72, top = -30;
  const nowH = hourOf(now);
  const up = nowH > rise && nowH < set;
  const t = up ? (nowH - rise) / (set - rise) : 0;
  const dot = up
    ? { x: bezier(t, xr, c1, c2, xs), y: bezier(t, BASE, top, top, BASE) }
    : { x: xOf(nowH < START_H ? START_H : nowH), y: BASE };

  // Today's hours that fall on the line, with their temperatures.
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const from = dayStart.getTime() + START_H * 3_600_000, to = dayStart.getTime() + 24 * 3_600_000;
  const today = h.allHours.filter(x => x.at >= from && x.at <= to).map(x => ({ ...x, hr: (x.at - dayStart.getTime()) / 3_600_000 }));
  const temps = today.filter(x => x.temp !== null) as (typeof today[number] & { temp: number })[];
  let lo = Math.min(...temps.map(x => x.temp)), hi = Math.max(...temps.map(x => x.temp));
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
  const yT = (v: number) => T_LOW - ((v - lo) / (hi - lo)) * (T_LOW - T_TOP);
  const pts = temps.map(x => ({ x: xOf(x.hr), y: yT(x.temp) }));
  const curve = pts.length >= 2 ? smooth(pts) : "";
  const labels = temps.filter(x => Math.abs(x.hr % 4) < 0.01 && x.hr > START_H && x.hr < 24);

  // Rain: one hatched block per run of rainy hours.
  const rain: { from: number; to: number }[] = [];
  for (const x of today) {
    if (!x.rain) continue;
    const last = rain[rain.length - 1];
    if (last && Math.abs(last.to - x.hr) < 0.01) last.to = x.hr + 1;
    else rain.push({ from: x.hr, to: x.hr + 1 });
  }
  const xAlarm = xOf(8);

  return (
    <div className="dl">
      <div className="dl-head">
        <div><div className="t">{clock(now)}</div><div className="d">{longDate(now)}</div></div>
        <div className="dl-temps">
          {h.hasWeather && <div><b>{deg(h.outside, 0)}</b><span>outside, {h.conditionText.toLowerCase()}</span></div>}
          {h.inside !== null && <div><b>{deg(h.inside)}</b><span>inside{h.humidity !== null ? `, ${Math.round(h.humidity)}%` : ""}</span></div>}
        </div>
      </div>

      <svg className="dl-svg" viewBox={`0 -50 ${W} 350`} width={W} height={350} aria-hidden="true">
        <defs>
          <pattern id="dl-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="var(--bg)" /><rect width="3" height="10" fill="var(--border)" />
          </pattern>
          <linearGradient id="dl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--text)" stopOpacity=".12" /><stop offset="1" stopColor="var(--text)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {rain.map(r => {
          const x = xOf(r.from), w = Math.max(48, xOf(r.to) - xOf(r.from));
          return (
            <g key={r.from}>
              <rect x={x} y={40} width={w} height={BASE - 40} fill="url(#dl-hatch)" />
              <text x={x + w / 2} y={28} textAnchor="middle" className="dl-small">rain</text>
            </g>
          );
        })}
        {curve && (
          <>
            <path d={`${curve} L${pts[pts.length - 1].x} ${BASE} L${pts[0].x} ${BASE} Z`} fill="url(#dl-fill)" />
            <path d={curve} fill="none" stroke="var(--muted)" strokeWidth="2.5" />
          </>
        )}
        <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--border)" strokeWidth="3" />
        <rect x={xs} y={BASE} width={W - xs} height="8" fill="var(--text)" opacity=".07" />
        <path d={`M${xr} ${BASE} C ${c1} ${top}, ${c2} ${top}, ${xs} ${BASE}`} fill="none" stroke="var(--text)" strokeWidth="4" />
        {labels.map(x => <text key={x.at} x={xOf(x.hr)} y={yT(x.temp) - 14} textAnchor="middle" className="dl-temp">{deg(x.temp, 0)}</text>)}
        <line x1={dot.x} y1={dot.y + 22} x2={dot.x} y2={BASE} stroke="var(--text)" strokeWidth="2" strokeDasharray="4 6" />
        <circle cx={dot.x} cy={dot.y} r="20" fill="var(--text)" />
        <text x={dot.x} y={dot.y - 36} textAnchor="middle" className="dl-now">now</text>
        {[6, 10, 14, 18, 22].map(hr => <text key={hr} x={xOf(hr)} y={BASE + 42} className="dl-tick">{String(hr).padStart(2, "0")}</text>)}
        {h.sunriseAt && <text x={xr - 12} y={BASE - 14} textAnchor="end" className="dl-mark">{h.sunriseAt}</text>}
        {/* Kept clear of the dot when the sun is about to set. */}
        {h.sunsetAt && <text x={Math.abs(dot.x - xs) < 160 ? Math.max(xs, dot.x) + 36 : xs + 14} y={BASE - 14} className="dl-mark">sunset {h.sunsetAt}</text>}
        {h.ready && (
          <>
            <line x1={xAlarm} y1={BASE - 14} x2={xAlarm} y2={BASE + 14} stroke="var(--text)" strokeWidth="3" />
            <text x={xAlarm + 8} y={BASE + 42} className="dl-small strong">{HA.alarmLabel.split(", ")[1] ?? "08:00"} alarm ({h.alarmOn ? "on" : "off"})</text>
          </>
        )}
      </svg>

      <div className="dl-pills">
        {m ? (
          <button className="f dl-pill" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
            {m.playing ? <Pause size={24} /> : <Play size={24} />}<span className="ttl">{m.title}</span><span className="m">{m.where}</span>
          </button>
        ) : shuffle ? (
          <button className="f dl-pill" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}><Shuffle size={24} />Shuffle music<span className="m">{shuffle.where}</span></button>
        ) : null}
        <Nums stats={stats} className="nums dl-nums" />
      </div>

      <AppRow className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        <AllAppsTile key="all" onOpen={onAllApps} />
      </AppRow>
    </div>
  );
}
