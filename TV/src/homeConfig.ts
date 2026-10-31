// Which Home Assistant entities the launcher uses. Names come from Caelan's own
// Home Assistant (Developer tools, Template). Change them here, nowhere else.

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
  /** When the sun goes down next. */
  sunset: "sensor.sun_next_setting",
};
