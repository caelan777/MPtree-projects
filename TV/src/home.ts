import { CONDITION, num, type Ha } from "./ha";
import { HA } from "./homeConfig";
import { deg, timeOf } from "./format";

/** Everything the layouts show about the house, read from Home Assistant's
 *  states, plus the buttons. Every layout uses this, so they all behave alike. */
export function homeOf(ha: Ha, toast: (m: string) => void) {
  const s = ha.states;
  const weather = s[HA.weather];
  const heat = s[HA.heating];
  const heatOn = !!heat && heat.state !== "off" && heat.state !== "unavailable";
  const alarmOn = s[HA.alarm]?.state === "on";
  const fail = (e: Error) => toast(e.message);

  return {
    ready: ha.status === "ok",
    outside: num(weather, "temperature"),
    condition: weather?.state,
    conditionText: CONDITION[weather?.state ?? ""] ?? weather?.state ?? "",
    inside: num(s[HA.insideTemp]),
    humidity: num(s[HA.insideHumidity]),
    sunsetAt: timeOf(s[HA.sunset]?.state),
    sunriseAt: timeOf(s[HA.sunrise]?.state),
    lightsOn: Object.values(s).filter(e => e.entity_id.startsWith("light.") && e.entity_id !== HA.allLights && e.state === "on").length,
    alarmOn,
    heatOn,
    heatTarget: num(heat, "temperature"),
    heatCurrent: num(heat, "current_temperature"),

    /** The sunset script switches the sunset lights on, or off again. */
    sunset: () => ha.call("script", "turn_on", { entity_id: HA.sunsetScript }).then(() => toast("Sunset switched"), fail),
    allOff: () => ha.call("light", "turn_off", { entity_id: HA.allLights }).then(() => toast("All lights off"), fail),
    toggleAlarm: () => {
      ha.patch(HA.alarm, { state: alarmOn ? "off" : "on" });
      return ha.call("automation", alarmOn ? "turn_off" : "turn_on", { entity_id: HA.alarm })
        .then(() => toast(alarmOn ? "Alarm off" : "Alarm on"), fail);
    },
  };
}

export type Home = ReturnType<typeof homeOf>;

/** "1 light is on", "3 lights are on", "All lights are off". */
export function lightsLine(n: number): string {
  return n === 0 ? "All lights are off" : n === 1 ? "1 light is on" : `${n} lights are on`;
}

/** "21°" when on, "Off" when off. */
export function heatLine(h: Home): string {
  return h.heatOn ? deg(h.heatTarget) : "Off";
}

/** Where Home Assistant would be, when it is not set up or not answering. */
export function connectText(ha: Ha): { title: string; body: string } {
  if (ha.status === "unset") return { title: "Connect Home Assistant", body: "Add its address and a token in Settings, and your lights, heating and the weather show up here." };
  if (ha.status === "loading") return { title: "Connecting to Home Assistant", body: "One moment." };
  return { title: "Home Assistant can't be reached", body: (ha.error ?? "") + " Press OK to check the address and token." };
}
