import { Preferences } from "@capacitor/preferences";

/** Everything the launcher remembers. Kept on the TV only (Capacitor Preferences). */
export type Settings = {
  /** Shown in the account pill. */
  name: string;
  /** e.g. http://192.168.1.20:8123 or http://homeassistant.local:8123 */
  haUrl: string;
  /** A Home Assistant long-lived access token. Never leaves the TV. */
  haToken: string;
  /** Where the MPTree numbers are read from: a copy of Dashboard/data.json. */
  statsUrl: string;
  /** Package names of the apps in the row at the bottom, in order. */
  dock: string[];
  /** False until the row has been filled once, so a deliberately empty row stays empty. */
  dockChosen: boolean;
  /** Minutes without a key press before the screensaver starts. 0 = never. */
  saverMinutes: number;
};

export const DEFAULTS: Settings = {
  name: "Caelan",
  haUrl: "",
  haToken: "",
  statsUrl: "",
  dock: [],
  dockChosen: false,
  saverMinutes: 10,
};

const KEY = "mptree_tv_settings";

export async function loadSettings(): Promise<Settings> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value ? { ...DEFAULTS, ...JSON.parse(value) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings): void {
  Preferences.set({ key: KEY, value: JSON.stringify(s) }).catch(() => {});
}

/** The first time the launcher runs, the bottom row is filled with the apps
 *  asked for, found by name since package names differ per TV. */
const WANTED: RegExp[] = [/^youtube$/i, /npo/i, /hbo|^max$/i, /browser|chrome|firefox|tv bro|internet/i, /mptree/i];

export function defaultDock(labels: { packageName: string; label: string }[]): string[] {
  const out: string[] = [];
  for (const re of WANTED) {
    const hit = labels.find(a => re.test(a.label) && !out.includes(a.packageName));
    if (hit) out.push(hit.packageName);
  }
  return out;
}
