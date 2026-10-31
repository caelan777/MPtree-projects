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

async function request(url: string, token: string, path: string, body?: unknown): Promise<unknown> {
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
  const configured = !!(url && token);
  // The latest address and token, for calls made from timers and key handlers.
  const cfg = useRef({ url, token });
  useEffect(() => { cfg.current = { url, token }; }, [url, token]);

  const refresh = useCallback(async () => {
    const { url: u, token: t } = cfg.current;
    if (!u || !t) { setStatus("unset"); return; }
    try {
      setStates(await fetchStates(u, t));
      setStatus("ok");
      setError(null);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
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

  return { states, status: configured ? status : ("unset" as HaStatus), error, call, refresh, patch };
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
