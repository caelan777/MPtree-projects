import { useEffect, useRef, useState } from "react";
import { AlarmClock, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Heater, Moon, Power, Sun, Sunset, Wind } from "lucide-react";
import { Logo } from "./Logo";
import { AddTile, AppTile } from "./AppTile";
import type { TvApp } from "../launcher";
import { CONDITION, num, type Ha } from "../ha";
import { HA } from "../homeConfig";
import { ago, short, type MptreeStats } from "../stats";
import { clock, deg, longDate, timeOf } from "../format";

type Props = {
  now: Date;
  ha: Ha;
  stats: MptreeStats | null;
  statsError: string | null;
  dock: TvApp[];
  onOpenApp: (a: TvApp) => void;
  onAddApp: () => void;
  onSettings: () => void;
  toast: (msg: string) => void;
};

function WeatherIcon({ state, size }: { state: string | undefined; size: number }) {
  switch (state) {
    case "sunny": return <Sun size={size} />;
    case "clear-night": return <Moon size={size} />;
    case "partlycloudy": return <CloudSun size={size} />;
    case "rainy": case "pouring": return <CloudRain size={size} />;
    case "snowy": case "snowy-rainy": case "hail": return <CloudSnow size={size} />;
    case "lightning": case "lightning-rainy": return <CloudLightning size={size} />;
    case "fog": return <CloudFog size={size} />;
    case "windy": case "windy-variant": return <Wind size={size} />;
    default: return <Cloud size={size} />;
  }
}

/** The Classic layout: clock and numbers on the left, the house on the right, apps below. */
export function HomeView({ now, ha, stats, statsError, dock, onOpenApp, onAddApp, onSettings, toast }: Props) {
  const s = ha.states;
  const weather = s[HA.weather];
  const outside = num(weather, "temperature");
  const inside = num(s[HA.insideTemp]);
  const humidity = num(s[HA.insideHumidity]);
  const sunsetAt = timeOf(s[HA.sunset]?.state);

  return (
    <>
      <div className="mid">
        <div>
          <div className="time">{clock(now)}</div>
          <div className="date">{longDate(now)}</div>
          {ha.status === "ok" && (
            <div className="wx">
              <span><b>{deg(outside, 0)}</b> {HA.outsideLabel}, {(CONDITION[weather?.state ?? ""] ?? "").toLowerCase()}</span>
              <span><b>{deg(inside)}</b> inside</span>
            </div>
          )}
          <StatsCard stats={stats} error={statsError} now={now} />
        </div>

        {ha.status === "ok" ? (
          <div className="ctl">
            <SunsetTile ha={ha} sunsetAt={sunsetAt} toast={toast} />
            <LightsTile ha={ha} toast={toast} />
            <AlarmTile ha={ha} toast={toast} />
            <HeatingTile ha={ha} toast={toast} />
            <div className="c">
              <div className="sub" style={{ margin: 0 }}>Inside, living room</div>
              <div><div className="big">{deg(inside)}</div><div className="sub">{humidity !== null ? `Humidity ${Math.round(humidity)}%` : " "}</div></div>
            </div>
            <div className="c">
              <div className="row"><span className="sub" style={{ margin: 0 }}>Outside, {HA.outsideLabel}</span><WeatherIcon state={weather?.state} size={40} /></div>
              <div><div className="big">{deg(outside, 0)}</div><div className="sub">{CONDITION[weather?.state ?? ""] ?? weather?.state ?? " "}</div></div>
            </div>
          </div>
        ) : (
          <div className="ctl">
            <button className="f c wide" data-f="" onClick={onSettings}>
              <span className="t">{ha.status === "unset" ? "Connect Home Assistant" : ha.status === "loading" ? "Connecting to Home Assistant" : "Home Assistant can't be reached"}</span>
              <span className="sub">
                {ha.status === "unset"
                  ? "Add its address and a token in Settings, and your lights, heating and the weather show up here."
                  : ha.status === "loading" ? "One moment." : (ha.error ?? "") + " Press OK to check the address and token."}
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </>
  );
}

function StatsCard({ stats, error, now }: { stats: MptreeStats | null; error: string | null; now: Date }) {
  return (
    <div className="mpt">
      <div className="h">
        <span><Logo size={40} />MPTree</span>
        <span className="mono" style={{ fontSize: 17, color: "var(--muted)", fontWeight: 400 }}>{stats ? ago(stats.collectedAt, now.getTime()) : ""}</span>
      </div>
      {stats ? (
        <>
          <div><div className="v">{short(stats.installs)}</div><div className="k">Play installs</div></div>
          <div><div className="v">{stats.rating ?? "–"}</div><div className="k">Rating</div></div>
          <div><div className="v">{short(stats.downloads)}</div><div className="k">Website downloads</div></div>
          <div><div className="v">{short(stats.visitors7)}</div><div className="k">Site, 7 days</div></div>
        </>
      ) : (
        <div className="empty">{error ?? "Add the address of the numbers file in Settings to see installs, rating and downloads here."}</div>
      )}
    </div>
  );
}

type TileProps = { ha: Ha; toast: (m: string) => void };

/** Runs the sunset script, which switches the sunset lights on or off itself. */
function SunsetTile({ ha, sunsetAt, toast }: TileProps & { sunsetAt: string | null }) {
  return (
    <button
      className="f c" data-f=""
      onClick={() => ha.call("script", "turn_on", { entity_id: HA.sunsetScript }).then(() => toast("Sunset switched"), e => toast(e.message))}
    >
      <Sunset size={54} />
      <div><div className="t">Sunset</div><div className="sub">{sunsetAt ? `Sun sets at ${sunsetAt}. OK switches the lights.` : "OK switches the sunset lights"}</div></div>
    </button>
  );
}

function LightsTile({ ha, toast }: TileProps) {
  const on = Object.values(ha.states).filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on").length;
  return (
    <button
      className="f c" data-f=""
      onClick={() => ha.call("light", "turn_off", { entity_id: HA.allLights }).then(() => toast("All lights off"), e => toast(e.message))}
    >
      <Power size={54} />
      <div><div className="t">All lights off</div><div className="sub">{on === 0 ? "All lights are off" : on === 1 ? "1 light is on" : `${on} lights are on`}</div></div>
    </button>
  );
}

function AlarmTile({ ha, toast }: TileProps) {
  const e = ha.states[HA.alarm];
  const on = e?.state === "on";
  return (
    <button
      className="f c" data-f=""
      onClick={() => {
        ha.patch(HA.alarm, { state: on ? "off" : "on" });
        ha.call("automation", on ? "turn_off" : "turn_on", { entity_id: HA.alarm }).then(() => toast(on ? "Alarm off" : "Alarm on"), err => toast(err.message));
      }}
    >
      <div className="row"><AlarmClock size={54} /><span className={"state" + (on ? "" : " off")}>{on ? "ON" : "OFF"}</span></div>
      <div><div className="t">Alarm</div><div className="sub">{HA.alarmLabel}</div></div>
    </button>
  );
}

/** OK turns the heating on or off. Holding left or right changes the set
 *  temperature by half a degree per step; it is sent once you let go. */
function HeatingTile({ ha, toast }: TileProps) {
  const e = ha.states[HA.heating];
  const on = !!e && e.state !== "off" && e.state !== "unavailable";
  const target = num(e, "temperature");
  const current = num(e, "current_temperature");
  const min = num(e, "min_temp") ?? 5;
  const max = num(e, "max_temp") ?? 30;
  const ref = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<number | null>(null);
  // The value being dialled in, read by the key handler without waiting for a render.
  const draftRef = useRef<number | null>(null);
  const send = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onHold = (ev: Event) => {
      const dir = (ev as CustomEvent).detail as string;
      const from = draftRef.current ?? target ?? 20;
      const next = Math.min(max, Math.max(min, from + (dir === "right" ? 0.5 : -0.5)));
      draftRef.current = next;
      setDraft(next);
      window.clearTimeout(send.current);
      send.current = window.setTimeout(() => {
        ha.patch(HA.heating, { attributes: { temperature: next } });
        ha.call("climate", "set_temperature", { entity_id: HA.heating, temperature: next })
          .then(() => toast(`Heating set to ${deg(next)}`), err => toast(err.message))
          .finally(() => { draftRef.current = null; setDraft(null); });
      }, 900);
    };
    el.addEventListener("tvhold", onHold);
    return () => el.removeEventListener("tvhold", onHold);
  }, [ha, target, min, max, toast]);

  const shown = draft ?? target;
  return (
    <button
      ref={ref}
      className="f c" data-f="" data-hold=""
      onClick={() => {
        const mode = on ? "off" : "heat";
        ha.patch(HA.heating, { state: mode });
        ha.call("climate", "set_hvac_mode", { entity_id: HA.heating, hvac_mode: mode }).then(() => toast(on ? "Heating off" : "Heating on"), err => toast(err.message));
      }}
    >
      <div className="row"><span className="sub" style={{ margin: 0 }}>Heating</span><span className={"state" + (on ? "" : " off")}>{on ? "ON" : "OFF"}</span></div>
      <div>
        <div className="big" style={{ display: "flex", alignItems: "center", gap: 14 }}><Heater size={44} />{deg(shown)}</div>
        <div className="sub">{draft !== null ? "Let go to set it" : `Now ${deg(current)}. Hold ◀ ▶ to change.`}</div>
      </div>
    </button>
  );
}
