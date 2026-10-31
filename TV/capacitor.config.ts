import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.caelan.mptree.tv",
  appName: "MPTree TV",
  webDir: "dist",
  // fetch() goes through Android's own networking instead of the WebView, so the
  // launcher can talk to Home Assistant on the home network (plain http, its own
  // origin) without CORS getting in the way. Cleartext is allowed in the manifest.
  plugins: {
    CapacitorHttp: { enabled: true },
  },
};

export default config;
