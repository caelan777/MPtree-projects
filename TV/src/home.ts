import { CONDITION, num, type Ha, type HaExtras, type Hour } from "./ha";
import { HA } from "./homeConfig";
import { clock, deg, timeOf } from "./format";

/** A speaker in the house that is playing (or was paused in the last half hour). */
export type Playing = { id: string; title: string; artist: string; where: string; art: string | null; playing: boolean };

const friendly = (e: { entity_id: string; attributes: Record<string, unknown> }) =>
  String(e.attributes.friendly_name ?? e.entity_id.split(".")[1].replace(/_/g, " "));

/** "2 h 17 min", "40 min". */
export function inTime(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Everything the layouts show about the house, read from Home Assistant's
 *  states, plus the buttons. Every layout uses this, so they all behave alike. */
export function homeOf(ha: Ha, extras: HaExtras, now: Date, toast: (m: string) => void, haUrl: string) {
  const s = ha.states;
  const weather = s[HA.weather];
  const heat = s[HA.heating];
  const heatOn = !!heat && heat.state !== "off" && heat.state !== "unavailable";
  const heatAction = String(heat?.attributes.hvac_action ?? "");
  const alarmOn = s[HA.alarm]?.state === "on";
  const fail = (e: Error) => toast(e.message);
  const t = now.getTime();

  // Lights that are on, by name. Groups (which hold other lights) are left out.
  const lightsOn = Object.values(s)
    .filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on" && !Array.isArray(e.attributes.entity_id))
    .map(friendly);

  // The sunset lights are on when any light the sunset script switches is on.
  const sunsetLightsOn = extras.scriptLights.length ? extras.scriptLights.some(id => s[id]?.state === "on") : null;
  const setAt = Date.parse(s[HA.sunset]?.state ?? "");
  const toSunset = Number.isFinite(setAt) && setAt > t ? (setAt - t) / 60000 : null;

  // The next hours, from the next whole hour on.
  const hours = extras.hours.filter(h => h.at > t - 30 * 60000);
  const rainHour = hours.find(h => h.rain && h.at < t + 12 * 3_600_000) ?? null;

  // What is playing in the house.
  const players = Object.values(s).filter(e => e.entity_id.startsWith("media_player.") && e.attributes.media_title);
  const pick = players.find(e => e.state === "playing")
    ?? players.find(e => e.state === "paused" && t - Date.parse(String((e as { last_changed?: string }).last_changed ?? "")) < 30 * 60000);
  const playing: Playing | null = pick ? {
    id: pick.entity_id,
    title: String(pick.attributes.media_title),
    artist: String(pick.attributes.media_artist ?? pick.attributes.media_album_artist ?? ""),
    where: friendly(pick),
    // Home Assistant gives the cover as a path on itself, with its own access key in it.
    art: typeof pick.attributes.entity_picture === "string"
      ? (pick.attributes.entity_picture.startsWith("/") ? haUrl.trim().replace(/\/+$/, "") + pick.attributes.entity_picture : pick.attributes.entity_picture)
      : null,
    playing: pick.state === "playing",
  } : null;

  // The shuffle script: the configured one, or any script called something with "shuffle".
  const shuffle = s[HA.shuffleScript] ?? Object.values(s).find(e => e.entity_id.startsWith("script.") && /shuffle/i.test(friendly(e)));

  // The alarm is on Wednesday and Thursday: which of those is next.
  const nextAlarmDay = (() => {
    for (let i = 0; i < 8; i++) {
      const d = new Date(t + i * 86_400_000);
      d.setHours(8, 0, 0, 0);
      if ((d.getDay() === 3 || d.getDay() === 4) && d.getTime() > t) return d.toLocaleDateString("en-GB", { weekday: "long" });
    }
    return "";
  })();

  return {
    ready: ha.status === "ok",
    outside: num(weather, "temperature"),
    condition: weather?.state,
    conditionText: CONDITION[weather?.state ?? ""] ?? weather?.state ?? "",
    inside: num(s[HA.insideTemp]),
    humidity: num(s[HA.insideHumidity]),
    sunsetAt: timeOf(s[HA.sunset]?.state),
    sunriseAt: timeOf(s[HA.sunrise]?.state),
    /** Minutes until the sun sets, or null when it has set. */
    toSunset,
    sunsetLightsOn,
    lightsOn,
    alarmOn,
    nextAlarmDay,
    heatOn,
    heatTarget: num(heat, "temperature"),
    heatCurrent: num(heat, "current_temperature"),
    /** "warming up", "at temperature", or "". */
    heatDoing: !heatOn ? "" : heatAction === "heating" ? "warming up" : heatAction === "idle" ? "at temperature" : "",
    hours,
    rainAt: rainHour ? clock(new Date(rainHour.at)) : null,
    playing,
    shuffleName: shuffle ? friendly(shuffle) : null,

    /** The sunset script switches the sunset lights on, or off again. */
    sunset: () => ha.call("script", "turn_on", { entity_id: HA.sunsetScript })
      .then(() => toast(sunsetLightsOn === true ? "Sunset lights off" : sunsetLightsOn === false ? "Sunset lights on" : "Sunset lights switched"), fail),
    allOff: () => ha.call("light", "turn_off", { entity_id: HA.allLights }).then(() => toast("All lights off"), fail),
    toggleAlarm: () => {
      ha.patch(HA.alarm, { state: alarmOn ? "off" : "on" });
      return ha.call("automation", alarmOn ? "turn_off" : "turn_on", { entity_id: HA.alarm })
        .then(() => toast(alarmOn ? "Alarm off" : "Alarm on"), fail);
    },
    playPause: () => {
      if (!playing) return Promise.resolve();
      ha.patch(playing.id, { state: playing.playing ? "paused" : "playing" });
      return ha.call("media_player", "media_play_pause", { entity_id: playing.id })
        .then(() => toast(playing.playing ? "Paused" : "Playing"), fail);
    },
    shuffleMusic: () => shuffle
      ? ha.call("script", "turn_on", { entity_id: shuffle.entity_id }).then(() => toast("Shuffling all songs"), fail)
      : Promise.resolve(),
  };
}

export type Home = ReturnType<typeof homeOf>;
export type { Hour };

/** The next `n` hours from the next whole hour. When rain comes later than that
 *  (within the day), the last box is the hour it starts, so rain is never missed. */
export function pickHours(hours: Hour[], now: Date, n: number): Hour[] {
  const next = hours.filter(h => h.at > now.getTime());
  const out = next.slice(0, n);
  if (out.length === n && !out.some(h => h.rain)) {
    const rain = next.slice(n).find(h => h.rain && h.at - now.getTime() < 12 * 3_600_000);
    if (rain) out[n - 1] = rain;
  }
  return out;
}


/** "All lights are off", "1 light is on", "3 lights are on". */
export function lightsLine(n: number): string {
  return n === 0 ? "All lights are off" : n === 1 ? "1 light is on" : `${n} lights are on`;
}

/** "On now: Corner lamp, TV light", "On now: Corner lamp and 4 more", or "All off now". */
export function lightsNames(names: string[], max = 2): string {
  if (!names.length) return "All off now";
  if (names.length <= max) return "On now: " + names.join(", ");
  return `On now: ${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** "21°" when on, "Off" when off. */
export function heatLine(h: Home): string {
  return h.heatOn ? deg(h.heatTarget) : "Off";
}

/** Under the heating: "Room 20.2°, warming up". */
export function heatSub(h: Home): string {
  return h.heatOn ? `Room ${deg(h.heatCurrent)}${h.heatDoing ? ", " + h.heatDoing : ""}` : `Off · room ${deg(h.heatCurrent)}`;
}

/** Under Sunset lights: "Sun sets at 17:12, in 2 h 17 min", or "Sun has set (17:12)". */
export function sunsetSub(h: Home): string {
  if (h.toSunset !== null) return `Sunset ${h.sunsetAt}, in ${inTime(h.toSunset)}`;
  return h.sunriseAt ? `Sun is down until ${h.sunriseAt}` : "The sun has set";
}

/** What OK does on the Sunset lights button. */
export function sunsetOk(h: Home): string {
  return h.sunsetLightsOn === true ? "Turn the sunset lights off" : h.sunsetLightsOn === false ? "Turn the sunset lights on" : "Switch the sunset lights";
}

/** ON, OFF, or nothing when it can't be told. */
export function onOff(v: boolean | null): "ON" | "OFF" | null {
  return v === null ? null : v ? "ON" : "OFF";
}

/** Where Home Assistant would be, when it is not set up or not answering. */
export function connectText(ha: Ha): { title: string; body: string } {
  if (ha.status === "unset") return { title: "Connect Home Assistant", body: "Add its address and a token in Settings, and your lights, heating and the weather show up here." };
  if (ha.status === "loading") return { title: "Connecting to Home Assistant", body: "One moment." };
  return { title: "Home Assistant can't be reached", body: (ha.error ?? "") + " Press OK to check the address and token." };
}

/** "Good morning", "Good afternoon", "Good evening". */
export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 6 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
