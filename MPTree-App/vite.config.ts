import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }
import type { Plugin } from 'vite'

// The dev server's stand-in for the Drive app folder of an MPTree account
// (src/sync/drive.ts). Kept in the server's memory, so http://localhost and
// http://127.0.0.1, which have separate storage, can play two phones on one
// account. Only the dev server has it; no build contains it.
function devDrive(): Plugin {
  let store = "{}"
  return {
    name: 'mptree-dev-drive',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev_drive', (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', c => { body += c })
          req.on('end', () => { store = body || '{}'; res.end('ok') })
          return
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(store)
      })
    },
  }
}

// The version shown in Settings comes from package.json rather than being typed
// into the UI, so it cannot drift from the release it was built in. Keep
// package.json, android/app/build.gradle's versionName, and the entries in
// Website/assets/versions.js and Website/version.json in step for every release.
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), devDrive()],
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
