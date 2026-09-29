import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// The version shown in Settings comes from package.json rather than being typed
// into the UI, so it cannot drift from the release it was built in. Keep
// package.json, android/app/build.gradle's versionName, and the entries in
// Website/assets/versions.js and Website/version.json in step for every release.
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // dist/channel.txt: which channel this build is for. cap sync copies it
    // into the Android project, where build.gradle reads it to decide whether
    // the ad SDK goes in. Only Play and the Pro test build have the day pass
    // ad; the website APK must carry no ad code at all.
    {
      name: 'mptree-channel',
      generateBundle() {
        const channel = mode === 'test' ? 'test' : mode === 'play' || mode === 'demo' ? mode : 'web'
        this.emitFile({ type: 'asset', fileName: 'channel.txt', source: channel + '\n' })
      },
    },
  ],
  define: {
    // The test build says so in Settings, so a screenshot of it is never
    // mistaken for a release.
    __APP_VERSION__: JSON.stringify(mode === 'test' ? pkg.version + ' (Pro test)' : pkg.version),
    // Which channel this build is for. Only "web" — the APK handed out by
    // mp-tree.net — is allowed to tell the user about a newer version on the
    // website; Google Play forbids an app it distributes from steering users to
    // another download channel for its own updates. See src/updateCheck.ts.
    //
    //   npm run build         → web   (the default, and what cap sync ships)
    //   npm run build:play    → play  (the Play Store AAB)
    //   npm run build:demo    → demo  (the try-it-in-your-browser copy on the
    //                                  website, which has nothing to update)
    //
    // Driven by --mode rather than an environment variable so it works the same
    // in PowerShell, cmd and bash.
    __DISTRIBUTION__: JSON.stringify(mode === 'play' || mode === 'demo' ? mode : 'web'),
    // The Pro test build (npm run build:test) is the website build with Pro
    // free to unlock and lock again. See src/pro.ts.
    __PRO_TEST__: JSON.stringify(mode === 'test'),
  },
}))
