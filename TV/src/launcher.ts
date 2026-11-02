import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** An app that can be opened from the TV's home screen. */
export type TvApp = {
  packageName: string;
  label: string;
  /** PNG as a data URL: the app's TV banner (16:9) when it has one, else its icon. */
  image: string | null;
  isBanner: boolean;
};

/** What plays on this TV, as Android's media sessions tell it (MPTree first). */
export type TvNowPlaying = {
  /** False until the launcher is allowed to see it (one adb command, see Settings). */
  allowed: boolean;
  package?: string; app?: string; title?: string; artist?: string; playing?: boolean;
  /** Seconds. */
  position?: number; duration?: number;
  canPrev?: boolean; canNext?: boolean;
  /** Changes with the song; `art` (a data URL) only comes when it differs from the one passed in. */
  artKey?: string; art?: string | null;
};

interface LauncherPlugin {
  listApps(): Promise<{ apps: TvApp[] }>;
  /** `action` is passed to apps that understand it: MPTree takes "shuffle". */
  launch(opts: { packageName: string; action?: string }): Promise<void>;
  openSystemSettings(): Promise<void>;
  /** The TV's own screensaver (Google's photos). Rejects where the TV does not allow it. */
  startScreensaver(): Promise<void>;
  nowPlaying(opts: { artKey?: string }): Promise<TvNowPlaying>;
  mediaControl(opts: { action: "play" | "pause" | "toggle" | "next" | "prev" }): Promise<void>;
  /** MPTree shuffles all its songs in the background; MPTree's screen does not open.
   *  Rejects with an MPTree that can't do that yet (then it is opened instead). */
  shuffleMptree(): Promise<void>;
  /** How long ago the TV itself started: the launcher starting just after is the TV turning on. */
  startInfo(): Promise<{ sinceBootMs: number }>;
  /** The Home button was pressed while the launcher was already in front. */
  addListener(event: "home", fn: () => void): Promise<PluginListenerHandle>;
  /** An app was installed, updated or removed. */
  addListener(event: "appsChanged", fn: () => void): Promise<PluginListenerHandle>;
  /** The screen went off (standby) or came on again. */
  addListener(event: "screenOff" | "screenOn", fn: () => void): Promise<PluginListenerHandle>;
}

// In the browser (npm run dev) there is no Android underneath, so a few made-up
// apps stand in, enough to move focus around and see the layout.
const DEV_APPS: TvApp[] = [
  "YouTube", "NPO Start", "HBO Max", "TV Bro", "Netflix", "Spotify", "Play Store", "Plex", "VLC",
  "Disney+", "Videoland", "Kodi",
].map(label => ({ packageName: "dev." + label.toLowerCase().replace(/\W/g, ""), label, image: null, isBanner: false }))
  .concat({ packageName: "com.caelan.mptree", label: "MPTree", image: null, isBanner: false });

// A song "playing on the TV" in the browser, with ?song in the address.
const devSong = { playing: true, at: Date.now(), n: 0 };
const DEV_TITLES = ["Warning Sign", "Clocks", "The Scientist"];

const webLauncher: LauncherPlugin = {
  listApps: async () => ({ apps: DEV_APPS }),
  launch: async ({ packageName, action }) => { console.log("launch", packageName, action ?? ""); },
  openSystemSettings: async () => { console.log("open Android settings"); },
  startScreensaver: async () => { throw new Error("No TV screensaver in the browser"); },
  nowPlaying: async () => {
    if (!/[?&]song\b/.test(location.search)) return { allowed: false };
    const pos = ((Date.now() - devSong.at) / 1000) % 240;
    return {
      allowed: true, package: "com.caelan.mptree", app: "MPTree", title: DEV_TITLES[devSong.n % 3], artist: "Coldplay",
      playing: devSong.playing, position: pos, duration: 240, canPrev: true, canNext: true, artKey: String(devSong.n), art: null,
    };
  },
  mediaControl: async ({ action }) => {
    if (action === "next" || action === "prev") { devSong.n += action === "next" ? 1 : 2; devSong.at = Date.now(); }
    else devSong.playing = action === "play" ? true : action === "pause" ? false : !devSong.playing;
  },
  shuffleMptree: async () => { console.log("MPTree: shuffle all, in the background"); },
  // ?intro in the address plays the intro, as if the TV just turned on.
  startInfo: async () => ({ sinceBootMs: /[?&]intro\b/.test(location.search) ? 0 : 3_600_000 }),
  addListener: async () => ({ remove: async () => {} }),
};

export const Launcher: LauncherPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<LauncherPlugin>("Launcher")
  : webLauncher;
