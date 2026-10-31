# MPTree TV

A home screen (launcher) for the living room Android TV, in MPTree's white look:
the clock, the MPTree numbers, Home Assistant (sunset lights, all lights off, the
alarm, heating, inside and outside temperature) and a row of six apps.

Built like the Android app: React + Vite + Capacitor, with one small native plugin.
It is its own project on purpose; nothing is shared with `MPTree-App/` (see the root
`CLAUDE.md`).

Designs: `design/design.html` (first take), `design/directions.html` (ten
directions), `design/layouts.html` (the layout picker and the Sunset switch).

## What works in 0.4.0

* **Home, in five layouts** (Settings, Layout): Classic, Editorial (the day in a
  few sentences), Cinema (dark, apps as big cards), Sky (the real sky behind
  frosted panels) and Day line (the sun's path, with Sunset pinned to sunset). Or a
  different one each day, and Cinema after dark. All show the same things: clock,
  weather, inside temperature, Sunset, All lights off, Heating, the alarm, the
  MPTree numbers and the app row.
* **Apps page.** Every app on the TV, A to Z. OK opens it; **hold OK** puts it on
  Home or takes it off (Home holds six).
* **Settings.** Your name, the Home Assistant address and token, the address of the
  MPTree numbers file, the screensaver delay, and a way into Android's own settings.
* **Dark mode.** Dark from sunset to sunrise (Home Assistant's sun), or always
  light or dark (Settings). The sun/moon button next to Settings flips it until the
  next sunrise or sunset.
* **Screensaver.** After 10 minutes, or the picture button in the top bar:
  the clock, the house and the MPTree numbers over a photo of somewhere beautiful
  from Wikimedia Commons' Featured pictures (a new one every minute, with the
  photographer's name). Or plain white, or the TV's own (Settings). Any key ends it.
  Set Android's own screensaver later than MPTree's, or to never.
* **The remote.** Arrows move focus to whatever is nearest in that direction. OK
  presses. Back goes to Home. The Home button always comes back to Home.
* **Heating.** OK on the tile opens the heating screen: − and + change the set
  temperature by half a degree (sent a moment after the last press), and a button
  turns it on or off. Back or Done closes it.

Not yet: MPTree itself on the TV with music synced over the internet, and a place
to host the numbers file (see below).

## Build and install

Inside `TV/`:

```bash
npm install
npm run dev          # in a browser: made-up apps, no Home Assistant unless you set it in Settings
npm run build        # tsc -b && vite build → dist/
npm run lint
npx cap sync android # copy the build into the Android project
npx cap open android # open android/ in Android Studio, then Build > Build APK(s)
```

Building the APK needs JDK 11+; use the one in Android Studio:
`export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"`.

To put it on the TV, turn on developer options (Settings, System, About, click
**Android TV OS build** seven times), then **Network debugging** in Developer
options, and from the computer:

```bash
adb connect <tv-ip>
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

It then shows up in the TV's app list as **MPTree TV**, so you can try it before
making it the home screen.

## Making it the home screen

Google TV does not let you pick another home screen in its settings, so two
Google parts are switched off for your user over ADB: the Google home screen,
and the setup wizard (setupwraith), which otherwise claims the Home button
first and, being off, makes Home do nothing.

```bash
adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
adb shell pm disable-user --user 0 com.google.android.tungsten.setupwraith
adb shell cmd package set-home-activity com.caelan.mptree.tv/.MainActivity
```

Press Home and MPTree TV comes up. To undo it, any time (and before a factory
reset, which needs the setup wizard):

```bash
adb shell pm enable com.google.android.tungsten.setupwraith
adb shell pm enable com.google.android.apps.tv.launcherx
```

Keep those undo lines somewhere. If MPTree TV ever fails to start, they are how
you get a home screen back. A big TV update can switch the Google home screen back
on; then run the three lines above again.

## Setting it up

All of this is in **Settings** on the TV and stays on the TV.

1. **Home Assistant address**, the one you use at home, for example
   `http://homeassistant.local:8123` or `http://192.168.1.20:8123`.
2. **Token**: in Home Assistant, your profile, Security, Long-lived access tokens,
   Create token. Type or paste it in. It never leaves the TV.
3. **Numbers file**: the address of a copy of `Dashboard/data.json` (what
   `node Dashboard/collect.mjs` writes). Read once an hour. Where that copy lives is
   still open: it has to be reachable from the TV and must not contain any keys
   (data.json has none, only numbers).

Which Home Assistant things are used is in `src/homeConfig.ts`. Change entity ids
there, nowhere else.

## How it fits together

| Path | Role |
|---|---|
| `src/App.tsx` | Pages, which layout and dark mode, the screensaver timer, Back and Home, the app row |
| `src/home.ts` | What every layout shows and its buttons (sunset, lights, alarm), from Home Assistant |
| `src/components/layouts/` | The five Home layouts |
| `src/photos.ts` | Screensaver photos from Wikimedia Commons |
| `src/nav.ts` | The remote: moves focus by position on screen; hold ◀ ▶ and hold OK |
| `src/ha.ts` | Home Assistant over REST, polled every 20 s while the screen is on |
| `src/homeConfig.ts` | The entity ids |
| `src/stats.ts` | Reads the MPTree numbers file |
| `src/settings.ts` | What the launcher remembers (Capacitor Preferences) |
| `src/components/` | Top bar, Home, Apps, Settings, Screensaver, app tiles |
| `android/.../LauncherPlugin.java` | Lists apps with their TV banners, opens them, Home button, app changes |
| `android/.../AndroidManifest.xml` | HOME + LEANBACK_LAUNCHER, the banner, plain http allowed for Home Assistant |

The screen is drawn at 1920×1080 and scaled to whatever the TV reports, so every
size in `src/index.css` is in real TV pixels and matches the designs.
