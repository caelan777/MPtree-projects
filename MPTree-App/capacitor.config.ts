import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.caelan.mplayer",
  appName: "MPTree",
  webDir: "dist",
  // Routes fetch()/XHR through native Android networking instead of the
  // WebView. Needed for the Home Assistant integration: it lets us call a
  // local http:// HA instance (e.g. http://homeassistant.local:8123)
  // without hitting WebView cleartext-traffic blocking or CORS rejections —
  // no AndroidManifest changes required.
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;