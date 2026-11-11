import { useEffect, useMemo, useState } from "react";
import type { EntityState, Hour, States } from "./ha";
import { HA } from "./homeConfig";

// The weather without Home Assistant: Open-Meteo (open-meteo.com), free and with
// no account or key, for the same place Home Assistant's forecast is for. Used
// wherever Home Assistant has no weather or sun of its own (switched off, or not
// set up), so the time, the next hours, the sky and dark mode still work.
//
// Its answer is turned into the same Home Assistant states the screens already
// read (weather.forecast_home, sensor.sun_next_setting, …), so nothing else
// needs to know where the weather came from: Home Assistant's own win.

const URL = "https://api.open-meteo.com/v1/forecast"
  + `?latitude=${HA.lat}&longitude=${HA.lon}`
  + "&current=temperature_2m,weather_code,is_day"
  + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code"
  + "&daily=sunrise,sunset&timezone=auto&forecast_days=3";

const EVERY_MS = 30 * 60_000;

type Raw = {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  hourly?: { time?: string[]; temperature_2m?: number[]; precipitation_probability?: (number | null)[]; precipitation?: number[]; weather_code?: number[] };
  daily?: { sunrise?: string[]; sunset?: string[] };
};

/** WMO weather codes in Home Assistant's words, so the icons and texts are shared. */
export function condition(code: number | undefined, day = true): string {
  if (code === undefined) return "";
  if (code === 0) return day ? "sunny" : "clear-night";
  if (code <= 2) return "partlycloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code === 65 || code === 82) return "pouring";
  if (code >= 51 && code <= 64) return "rainy";
  if (code === 66 || code === 67) return "snowy-rainy";
  if (code >= 71 && code <= 77) return "snowy";
  if (code === 80 || code === 81) return "rainy";
  if (code === 85 || code === 86) return "snowy";
  if (code >= 95) return "lightning-rainy";
  return "cloudy";
}

export type OpenWeather = { states: States; hours: Hour[] };

/** Times from Open-Meteo come without a zone, in the place's own time (timezone=auto),
 *  which is the TV's: JavaScript reads such times as local, which is right here. */
const at = (s: string | undefined) => (s ? Date.parse(s) : NaN);

export function toWeather(raw: Raw, now: number): OpenWeather {
  const states: States = {};
  const put = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): void => {
    states[entity_id] = { entity_id, state, attributes } as EntityState;
  };
  const cur = raw.current ?? {};
  if (typeof cur.temperature_2m === "number") {
    put(HA.weather, condition(cur.weather_code, cur.is_day !== 0), { temperature: cur.temperature_2m });
  }
  // The next sunrise and sunset after now, and whether the sun is up.
  const rises = (raw.daily?.sunrise ?? []).map(at).filter(Number.isFinite);
  const sets = (raw.daily?.sunset ?? []).map(at).filter(Number.isFinite);
  const nextRise = rises.find(t => t > now);
  const nextSet = sets.find(t => t > now);
  if (nextRise) put(HA.sunrise, new Date(nextRise).toISOString());
  if (nextSet) put(HA.sunset, new Date(nextSet).toISOString());
  if (nextRise && nextSet) put(HA.sun, nextSet < nextRise ? "above_horizon" : "below_horizon");

  const h = raw.hourly ?? {};
  const hours: Hour[] = (h.time ?? []).map((t, i) => {
    const code = h.weather_code?.[i];
    const mm = h.precipitation?.[i] ?? 0;
    const chance = h.precipitation_probability?.[i] ?? null;
    const cond = condition(code);
    const rain = ["rainy", "pouring", "lightning-rainy", "snowy-rainy"].includes(cond) || mm >= 0.3 || (chance !== null && chance >= 60);
    return { at: at(t), condition: cond, temp: typeof h.temperature_2m?.[i] === "number" ? h.temperature_2m[i] : null, rain };
  }).filter(x => Number.isFinite(x.at));
  return { states, hours };
}

const EMPTY: OpenWeather = { states: {}, hours: [] };

/** Open-Meteo's weather, read now and every half hour. Empty until the first answer,
 *  and when the TV is offline (the screens then simply leave the weather out). The
 *  sun's "next sunrise / sunset" is worked out again every minute from the last
 *  answer, so dark mode turns at sunset, not up to half an hour later. */
export function useOpenWeather(): OpenWeather {
  const [raw, setRaw] = useState<Raw | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(URL, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Raw;
        if (alive) { setRaw(data); setNowMs(Date.now()); }
      } catch { /* offline: keep what we had */ }
    };
    load();
    const t = window.setInterval(load, EVERY_MS);
    const m = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => { alive = false; window.clearInterval(t); window.clearInterval(m); };
  }, []);
  return useMemo(() => (raw ? toWeather(raw, nowMs) : EMPTY), [raw, nowMs]);
}
