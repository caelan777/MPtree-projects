import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// The version shown in Settings comes from package.json rather than being typed
// into the UI, so it cannot drift from the release it was built in. Keep
// package.json, android/app/build.gradle's versionName, and the entry in
// Website/assets/versions.js in step for every release.
// https://vite.dev/config/
// Which channel this build is for. "web" is the APK handed out by mp-tree.net
// and is the only build allowed to tell the user about a newer version on the
// website; Google Play forbids an app distributed through Play from steering
// users to another download channel for its own updates. Build the Play AAB
// with MPTREE_DIST=play (see docs/release.md) and src/updateCheck.ts compiles
// that check out entirely.
const distribution = process.env.MPTREE_DIST === "play" ? "play" : "web";

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __DISTRIBUTION__: JSON.stringify(distribution),
  },
})
