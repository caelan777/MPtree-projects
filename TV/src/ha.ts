import { useCallback, useEffect, useRef, useState } from "react";

// Home Assistant over its REST API. Every request carries the long-lived token
// typed into Settings on the TV; nothing else ever sees it. fetch() is routed
// through Android's networking (CapacitorHttp), so a plain http:// address on
// the home network works.

export type EntityState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};
export type States = Record<string, EntityState>;

export type HaStatus = "unset" | "loading" | "ok" | "error";

const POLL_MS = 20_000;

function base(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function request(url: string, token: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(base(url) + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("Home Assistant refused the token. Make a new one and paste it in Settings.");
  if (!res.ok) throw new Error(`Home Assistant answered ${res.status}.`);
  return res.json();
}

export async function fetchStates(url: string, token: string): Promise<States> {
  const list = (await request(url, token, "/api/states")) as EntityState[];
  const out: States = {};
  for (const e of list) out[e.entity_id] = e;
  return out;
}

export function useHomeAssistant(url: string, token: string) {
  const [states, setStates] = useState<States>({});
  const [status, setStatus] = useState<HaStatus>(url && token ? "loading" : "unset");
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const configured = !!(url && token);
  // The latest address and token, for calls made from timers and key handlers.
  const cfg = useRef({ url, token });
  useEffect(() => { cfg.current = { url, token }; }, [url, token]);

  /** Reads every state again. Says how it went: the number of things found, or the problem. */
  const refresh = useCallback(async (): Promise<{ ok: true; count: number } | { ok: false; error: string }> => {
    const { url: u, token: t } = cfg.current;
    if (!u || !t) { setStatus("unset"); return { ok: false, error: "Add the address and token first." }; }
    try {
      const next = await fetchStates(u, t);
      setStates(next);
      setStatus("ok");
      setError(null);
      setCheckedAt(Date.now());
      return { ok: true, count: Object.keys(next).length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setError(msg);
      return { ok: false, error: msg };
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const tick = () => { if (!document.hidden) refresh(); };
    // Deferred a tick so the first state update happens outside the effect body.
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [configured, url, token, refresh]);

  /** Calls a service, then reads the states again so the screen shows the result. */
  const call = useCallback(async (domain: string, service: string, data: Record<string, unknown>) => {
    const { url: u, token: t } = cfg.current;
    if (!u || !t) throw new Error("Home Assistant is not set up yet. Open Settings.");
    await request(u, t, `/api/services/${domain}/${service}`, data);
    window.setTimeout(refresh, 600);
  }, [refresh]);

  /** Shows a change straight away, before Home Assistant confirms it. */
  const patch = useCallback((id: string, change: Partial<EntityState>) => {
    setStates(s => s[id] ? { ...s, [id]: { ...s[id], ...change, attributes: { ...s[id].attributes, ...(change.attributes ?? {}) } } } : s);
  }, []);

  return { states, status: configured ? status : ("unset" as HaStatus), error, checkedAt, call, refresh, patch };
}

export type Ha = ReturnType<typeof useHomeAssistant>;

export function num(e: EntityState | undefined, attr?: string): number | null {
  if (!e) return null;
  const v = attr ? e.attributes[attr] : e.state;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Home Assistant's weather states, in words. */
export const CONDITION: Record<string, string> = {
  "clear-night": "Clear", cloudy: "Cloudy", exceptional: "Unusual weather", fog: "Fog", hail: "Hail",
  lightning: "Thunder", "lightning-rainy": "Thunder and rain", partlycloudy: "Partly cloudy", pouring: "Heavy rain",
  rainy: "Rain", snowy: "Snow", "snowy-rainy": "Sleet", sunny: "Sunny", windy: "Windy", "windy-variant": "Windy, cloudy",
};

// ── Things Home Assistant only gives when asked ──────────────────────────────

/** One hour of the forecast. */
export type Hour = { at: number; condition: string; temp: number | null; rain: boolean };

const RAINY = new Set(["rainy", "pouring", "lightning-rainy", "snowy-rainy", "hail"]);

function toHours(list: unknown): Hour[] {
  if (!Array.isArray(list)) return [];
  return list.map((f: Record<string, unknown>) => {
    const at = Date.parse(String(f.datetime ?? ""));
    const condition = String(f.condition ?? "");
    const temp = typeof f.temperature === "number" ? f.temperature : null;
    const mm = typeof f.precipitation === "number" ? f.precipitation : 0;
    const chance = typeof f.precipitation_probability === "number" ? f.precipitation_probability : null;
    const rain = RAINY.has(condition) || mm >= 0.3 || (chance !== null && chance >= 60);
    return { at, condition, temp, rain };
  }).filter(h => Number.isFinite(h.at));
}

/** Every light a script switches, read from the script's own config, so "Sunset
 *  lights" can say whether they are on. Empty when it can't be read. */
function lightsIn(node: unknown, out = new Set<string>()): Set<string> {
  if (typeof node === "string") { if (/^light\.[a-z0-9_]+$/.test(node)) out.add(node); }
  else if (Array.isArray(node)) node.forEach(n => lightsIn(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach(v => lightsIn(v, out));
  return out;
}

/** The hourly forecast (every 30 minutes) and the lights in the sunset script (once). */
export function useHaExtras(url: string, token: string, weatherId: string, scriptId: string, ok: boolean) {
  const [hours, setHours] = useState<Hour[]>([]);
  const [scriptLights, setScriptLights] = useState<string[]>([]);

  useEffect(() => {
    if (!ok || !url || !token) return;
    let alive = true;
    const load = async () => {
      try {
        // Home Assistant 2023.9 and later: a service that answers. Older ones kept it in an attribute.
        const res = await request(url, token, "/api/services/weather/get_forecasts?return_response", { entity_id: weatherId, type: "hourly" }) as
          { service_response?: Record<string, { forecast?: unknown }> };
        if (alive) setHours(toHours(res.service_response?.[weatherId]?.forecast));
      } catch {
        try {
          const st = await request(url, token, `/api/states/${weatherId}`) as EntityState;
          if (alive) setHours(toHours(st.attributes.forecast));
        } catch { /* no forecast: the screens leave it out */ }
      }
    };
    load();
    const t = window.setInterval(load, 30 * 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, [ok, url, token, weatherId]);

  useEffect(() => {
    if (!ok || !url || !token) return;
    let alive = true;
    request(url, token, `/api/config/script/config/${scriptId.replace(/^script\./, "")}`)
      .then(cfg => { if (alive) setScriptLights([...lightsIn(cfg)]); })
      .catch(() => { /* not an admin token, or a script made in YAML: the state is left out */ });
    return () => { alive = false; };
  }, [ok, url, token, scriptId]);

  return { hours, scriptLights };
}

export type HaExtras = ReturnType<typeof useHaExtras>;
