// Which Home Assistant entities the launcher uses. Names come from Caelan's own
// Home Assistant (Developer tools, Template). Change them here, nowhere else.
//
// No speakers in here, on purpose: music on Home only ever comes from MPTree on
// this TV, never from Home Assistant.

export const HA = {
  /** A script that switches the sunset lights: run it once for on, again for off. */
  sunsetScript: "script.sunset",
  /** The light group behind "All lights off". */
  allLights: "light.all_lights",
  /** The Wednesday and Thursday 08:00 alarm, an automation that is on or off. */
  alarm: "automation.8am_alarm_wed_thu_with_fade_in",
  alarmLabel: "Wed and Thu, 08:00",
  /** The big radiator in the living room. */
  heating: "climate.living_room_big_heater",
  heatingLabel: "Big heater",
  /** The living room sensor. */
  insideTemp: "sensor.temperature_sensor_living_room_temperature",
  insideHumidity: "sensor.temperature_sensor_living_room_humidity",
  /** Home Assistant's own forecast for the home location (De Bilt). */
  weather: "weather.forecast_home",
  outsideLabel: "De Bilt",
  /** Where De Bilt is, for the weather without Home Assistant (Open-Meteo). */
  lat: 52.1,
  lon: 5.18,
  /** When the sun goes down and comes up next. Also drive dark mode. */
  sunset: "sensor.sun_next_setting",
  sunrise: "sensor.sun_next_rising",
  /** "above_horizon" or "below_horizon", when the sun integration provides it. */
  sun: "sun.sun",
};

/** The MPTree numbers: the address of a copy of Dashboard/data.json (what
 *  `node Dashboard/collect.mjs` writes on the PC). Empty: no numbers on Home.
 *  It lives here, not in Settings: it is one address, set once. */
export const STATS_URL = "";
