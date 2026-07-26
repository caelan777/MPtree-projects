# MPTree

MPTree is an **offline, on-device music player**. Today it ships as an Android app;
the long-term goal is a small family of apps (Android, desktop, website) that share a
brand and a feel but stay simple under the hood.

> Full plan and milestones: [docs/roadmap.md](docs/roadmap.md)

## Vision

- Android app ✅ (exists)
- Desktop app (planned — Tauri)
- Official website (planned — also the download/update hub)
- Shared branding across all surfaces
- Modern UI, fast performance, easy updates

## Guiding architecture principle

**Keep it simple. Prefer duplication over premature abstraction.**
We are *not* building shared packages yet. Each surface (Android app, website, desktop
prototype) is built as its own thing. We introduce shared modules only once real
duplication proves the need — expected after both the Android app and a basic desktop
prototype exist. Don't reach for a monorepo or `@mptree/*` packages before then.

## Workspace layout

```
MPtree projects/            ← workspace root (this folder)
├─ CLAUDE.md                ← this file
├─ docs/roadmap.md          ← the roadmap
├─ MPTree-App/              ← the Android app (React + Capacitor). THE real code today.
├─ Branding/                ← (empty) → MPTree brand assets/tokens will live here
├─ Website/                 ← (empty) → official website will live here
└─ Desktop/                 ← (empty) → Tauri desktop prototype will live here
```

Note: `Branding/`, `Website/`, `Desktop/` are currently empty placeholders, and the
top-level `README.md` is (oddly) a directory — both are cleanup targets, see the roadmap.

## The Android app (`MPTree-App/`)

A React SPA rendered in an Android WebView via Capacitor, talking to custom native
Java plugins for the actual audio work.

**Stack:** React 19 · TypeScript · Vite 8 · Capacitor 8 · `lucide-react`. No CSS
framework, no state library, no router — all state and playback orchestration live in
one ~2,300-line `src/App.tsx`; theming is an inline-style `src/themes.ts` (DARK/LIGHT).

**Key files**

| Path | Role |
|---|---|
| `src/App.tsx` | Everything: state, playback control, gestures, backup/import flows |
| `src/storage.ts` | Persistence (Capacitor Preferences) + backup/restore (Filesystem + native zip) |
| `src/types.ts`, `src/utils.ts`, `src/themes.ts` | Types, helpers, theme tokens |
| `src/components/`, `src/hooks/` | ~20 presentational sheets/views; swipe/pull/select hooks |
| `android/` | The **real** Capacitor Android project (self-contained; its own Gradle wrapper) |
| `android/app/src/main/java/com/caelan/mplayer/` | Native: `MusicPlayerService` (MediaPlayer/MediaSession/EQ/crossfade), `AudioPlayerPlugin`, `MusicScannerPlugin`, home-screen widget |
| `capacitor.config.ts` | appId `com.caelan.mplayer`, `webDir: dist` |

**How playback works (important):** the **native service is the source of truth**, not
JS. Android freezes the WebView in the background, so the native service advances tracks
on its own; JS *adopts* whatever native reports via the `stateChange` event
(`syncToNativePath` in `App.tsx`). `trackComplete` means only "queue exhausted, stop",
never "advance". Startup is two-phase so the media-permission prompt fires after the
splash screen.

## Build & run (inside `MPTree-App/`)

```bash
npm install
npm run dev          # web dev server (UI only; native plugins no-op in browser)
npm run build        # tsc -b && vite build → dist/
npm run lint
npx cap sync android # copy web build + plugins into the Android project
npx cap open android # open android/ in Android Studio to build/run the APK
```

## Conventions & gotchas

- **Refs mirror state.** Most `useState` in `App.tsx` has a `useRef` twin so async native
  callbacks/intervals read the latest value. If you add state used in a callback, mirror it.
- **Native is authoritative** for playback — don't reintroduce JS-side track advancement.
- **Naming is inconsistent** (`mplayer` / `MPlayer1` / `MPTree`, `package.json` version
  `0.0.0`). Slated to be unified during repository cleanup — see roadmap Phase 1.
- Not a Git repo yet — putting it under version control is the first roadmap step.

## Current focus

Near-term order (see roadmap): **1) repo cleanup → 2) documentation → 3) brand →
4) website → 5) desktop prototype (Tauri).** Not writing shared packages yet.
