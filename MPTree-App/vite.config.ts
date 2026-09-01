import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// The version shown in Settings comes from package.json rather than being typed
// into the UI, so it cannot drift from the release it was built in. Keep
// package.json, android/app/build.gradle's versionName, and the entry in
// Website/assets/versions.js in step for every release.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
