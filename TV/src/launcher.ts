import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/** An app that can be opened from the TV's home screen. */
export type TvApp = {
  packageName: string;
  label: string;
  /** PNG as a data URL: the app's TV banner (16:9) when it has one, else its icon. */
  image: string | null;
  isBanner: boolean;
};

interface LauncherPlugin {
  listApps(): Promise<{ apps: TvApp[] }>;
  launch(opts: { packageName: string }): Promise<void>;
  openSystemSettings(): Promise<void>;
  /** The TV's own screensaver (Google's photos). Rejects where the TV does not allow it. */
  startScreensaver(): Promise<void>;
  /** The Home button was pressed while the launcher was already in front. */
  addListener(event: "home", fn: () => void): Promise<PluginListenerHandle>;
  /** An app was installed, updated or removed. */
  addListener(event: "appsChanged", fn: () => void): Promise<PluginListenerHandle>;
}

// In the browser (npm run dev) there is no Android underneath, so a few made-up
// apps stand in, enough to move focus around and see the layout.
const DEV_APPS: TvApp[] = [
  "YouTube", "NPO Start", "HBO Max", "TV Bro", "Netflix", "Spotify", "Play Store", "Plex", "VLC",
  "Disney+", "Videoland", "Kodi",
].map(label => ({ packageName: "dev." + label.toLowerCase().replace(/\W/g, ""), label, image: null, isBanner: false }));

const webLauncher: LauncherPlugin = {
  listApps: async () => ({ apps: DEV_APPS }),
  launch: async ({ packageName }) => { console.log("launch", packageName); },
  openSystemSettings: async () => { console.log("open Android settings"); },
  startScreensaver: async () => { throw new Error("No TV screensaver in the browser"); },
  addListener: async () => ({ remove: async () => {} }),
};

export const Launcher: LauncherPlugin = Capacitor.isNativePlatform()
  ? registerPlugin<LauncherPlugin>("Launcher")
  : webLauncher;
