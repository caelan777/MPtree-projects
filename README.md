# MPTree

MPTree is an **offline, on-device music player**. It plays the music already on your
device. No accounts, no streaming, nothing uploaded. Everything stays local.

Today MPTree ships as an **Android app**. The long-term goal is a small family of apps
(Android, desktop, and an official website) that share one brand and feel while each stays
simple under the hood.

## Workspace structure

```
MPtree projects/            ← workspace root
├─ README.md                ← this file (workspace landing page)
├─ CLAUDE.md                ← detailed overview & conventions for contributors
├─ docs/
│  └─ roadmap.md            ← full roadmap, milestones, and locked decisions
├─ MPTree-App/              ← the Android app (React + Capacitor), the real code today
├─ Branding/                ← (empty) planned home for MPTree brand assets/tokens
├─ Website/                 ← (empty) planned home for the official website
└─ Desktop/                 ← (empty) planned home for the Tauri desktop prototype
```

`Branding/`, `Website/`, and `Desktop/` are intentional placeholders for planned surfaces.

## Documentation

- **[CLAUDE.md](CLAUDE.md)**: workspace overview, Android app architecture, key files, and conventions.
- **[docs/roadmap.md](docs/roadmap.md)**: vision, phased roadmap, milestones, and the decisions behind them.

## Development

All current code lives in `MPTree-App/` (a React SPA rendered in an Android WebView via
Capacitor, backed by custom native audio plugins).

```bash
cd MPTree-App
npm install
npm run dev          # web dev server (UI only; native plugins no-op in the browser)
npm run build        # type-check + production build → dist/
npm run lint

npx cap sync android # copy the web build + plugins into the Android project
npx cap open android # open android/ in Android Studio to build/run the APK
```

**Stack:** React 19 · TypeScript · Vite 8 · Capacitor 8. See [CLAUDE.md](CLAUDE.md) for the
full architecture, including why the native service is the source of truth for playback.

## Status & roadmap

The Android app exists and works. Current effort is groundwork for the wider vision, in
this order:

1. **Repository cleanup**: tidy the workspace and unify naming _(in progress)_.
2. **Documentation**: workspace docs and a real app README.
3. **Branding**: a shared MPTree visual identity.
4. **Website**: the official site and download/update hub.
5. **Desktop prototype**: a basic Tauri client.

Guiding principle: **keep it simple, prefer duplication over premature abstraction.**
Shared packages and a monorepo are deliberately deferred until both the Android app and a
desktop prototype exist and real duplication proves the need. See
[docs/roadmap.md](docs/roadmap.md) for the full plan.
