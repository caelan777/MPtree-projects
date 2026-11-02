# MPTree TV

A home screen (launcher) for the living room Android TV, in MPTree's black and
white look: the clock, the weather, MPTree's music and a row of six apps; and, one
page to the right, the house through Home Assistant (sunset lights, all lights off,
the alarm, heating, inside and outside temperature). Music only ever comes from
MPTree on this TV, never from Home Assistant.

Built like the Android app: React + Vite + Capacitor, with one small native plugin.
It is its own project on purpose; nothing is shared with `MPTree-App/` (see the root
`CLAUDE.md`).

Designs: `design/design.html` (first take), `design/directions.html` (ten
directions), `design/layouts.html` (the layout picker and the Sunset switch),
`design/v2.html`, `design/v3.html` and `design/v4.html` (rounds two to four; 0.6.0
is round four), `design/v5-classic.html` (five ways to do Classic's left side; the
first, the ruled strip tidied, was picked and built). The Verkuijl logo artwork is
`design/verkuijl-owl.png`.

## New in 0.7.0

* **The intro when the TV turns on**: the Verkuijl logo on black with the name
  small at the foot of the screen, then the logo grows towards you and you fly
  through it, the way MPTree opens, onto Home. It plays when the TV starts (the
  launcher starting within five minutes of the TV) and when the screen comes on
  again from standby with Home in front; never when the launcher is opened any
  other way. Home only comes once the apps and Home Assistant have been read (it
  gives up waiting after 12 seconds, so a Home Assistant that is down never keeps
  the TV on the logo). The logo is the line-drawn owl, traced to SVG so it stays
  sharp as it grows; you fly in between its eyes (`src/components/Intro.tsx`,
  `OWL` and `FLY_ORIGIN`).
* **No screensaver when the TV comes on**: it is closed when the screen goes off,
  and the time the TV was off (or an app was in front) no longer counts as the
  remote being left alone.
* **"All apps" at the end of every app row.** With six apps on Home it waits just
  past the right edge; Right on the sixth app slides the row one place along.
* **Shuffle music shuffles in the background**: MPTree's player shuffles all
  songs and plays, and MPTree's screen does not open (MPTree's `ShuffleActivity`;
  an older MPTree is opened, shuffling, as before).
* **Editorial is minimal**: a hairline masthead, the greeting and the time in one
  big serif, one line about the weather, the song as a few italic words, the apps
  as a contents line.
* **Sky at night**: a deep blue sky with stars, a crescent moon, moonlit clouds and
  hills, darker glass.
* **Aligned**: every layout keeps to the same 96 px margins as the top bar, and the
  big times and greetings line up with what is beside them (measured from the
  letters themselves, not their boxes).
* **Settings**: a row that is chosen no longer grows behind the edge.
* **Gone**: music from Home Assistant (the speaker, its shuffle script, its
  settings), Cinema after dark, the night clock, the Dark/Light button on Cinema
  (always dark), and MPTree numbers in Settings (the address is `STATS_URL` in
  `src/homeConfig.ts` now; empty, so no numbers show).

## What 0.6.0 brought (0.7.0, above, changed some of it)

Built from design round four (`design/v4.html`): the five Homes made more
beautiful, and Home in two pages.

* **Home is two pages.** The first is the day in the chosen layout: the time, the
  weather and the next hours, the music and the apps. It is the same with or
  without Home Assistant. With Home Assistant switched on there is a second page,
  **the house**: press **Right at the right edge** of Home (a "House ›" tab at the
  edge says so) and it slides over. **Left at its left edge**, or **Back**, slides
  back. The top bar never slides. Leaving Home (Apps, Settings) and coming back
  starts on the first page again.
* **The five layouts, round four** (Settings, Look):
  * **Classic**: "Good evening, Caelan. It's 21:14." in a serif, the date, the
    weather and inside temperature on one line, the next hours as a ruled strip
    (rain shaded), the MPTree numbers, and the music as one big black card (white
    in dark mode).
  * **Editorial**: a magazine cover. A masthead, one big serif sentence with the
    numbers in black, three columns (tonight, music, MPTree), the buttons as italic
    underlined words and the apps as a contents line.
  * **Cinema** (always dark): the selected app's name huge at the top left; the
    apps as cards, the selected one rises and turns white. The time at the right,
    the music at the foot.
  * **Sky**: the time floats on the sky (grey by day, a low sun before sunset,
    dark with a moon at night, clouds when cloudy) with layered hills; the next
    hours, the music and the numbers on frosted glass; the apps on a glass shelf.
  * **Day line**: the day from 06:00 to midnight as one drawing: the sun's arc with
    a dot for now, the temperature as a shaded curve, rain as a hatched block,
    sunrise and sunset marked, the 08:00 alarm (with Home Assistant).
* **The house page**: Sunset lights, All lights off (with the lights that are on,
  by name), the alarm, the heating (OK opens the heating screen), inside
  temperature and humidity, outside, each with ON/OFF; and what plays on the
  speaker with previous, pause, next and All controls (or Shuffle music on the
  speaker). When Home Assistant can't be reached, it says why, with a button to
  Settings.
* **Weather without Home Assistant.** From Open-Meteo (open-meteo.com: free, no
  account, no key) for De Bilt, every 30 minutes: the weather now, the next hours
  with rain, and sunrise and sunset, so dark mode, Sky and Day line work without
  Home Assistant too. Home Assistant's own weather wins whenever it has it.
* **MPTree's song on Home.** Whatever plays on this TV (MPTree first, any app
  otherwise) shows on Home with previous, pause and next, read from Android's media
  sessions every few seconds. **Once**, from a computer, Android has to allow it
  (Android TV has no screen for this):

  ```
  adb shell cmd notification allow_listener com.caelan.mptree.tv/com.caelan.mptree.tv.MediaListener
  ```

  Settings, This TV says whether it is allowed. The launcher only reads the media
  sessions (song, artist, play or pause), never notifications. Without it, a
  speaker in the house (Home Assistant) still shows.
* **The music panel** works for both: the song big, how far, previous / play-pause
  / next, and for a speaker also shuffle, repeat and volume; Shuffle all again.
* **Shuffle music** starts MPTree on this TV, shuffling all songs, when MPTree is
  installed (the extra `mptree_action=shuffle`); otherwise the Home Assistant
  shuffle script on the speaker.
* **Night clock.** From midnight to 06:00 the screensaver is only a dim clock on
  black that wanders a little every minute. A switch in Settings, Look (on).
* **Typefaces**: Instrument Sans (with narrow widths for the big clocks),
  Instrument Serif and IBM Plex Mono, bundled in the app (no internet needed).
* **What OK does.** A line at the top says what OK will do on whatever is
  selected. Buttons show their state (ON/OFF) apart from what pressing them does.
* **Apps page.** Every app on the TV, A to Z. OK opens it; **hold OK** puts it on
  Home or takes it off (Home holds six).
* **Top bar.** Your name opens MPTree TV's settings; **Settings** opens the TV's own
  Android settings (Wi-Fi, picture, sound).
* **Settings**, in sections (Up and Down pick one, Right goes in, Left comes back).
  Text fields are buttons: OK opens them for typing.
  * **Look**: the five layouts, dark mode, the screensaver, the night clock.
  * **Apps on Home**: the six in order; move, remove, add.
  * **Home Assistant**: the on/off switch, connected or not, the address, the
    token (never shown), and which entity each button uses.
  * **MPTree numbers**: whether they loaded, the numbers, the file's address.
  * **This TV**: Android settings, the screensaver now, whether the song on Home is
    allowed (and the command if not), your name, the version.
* **Dark mode.** Dark from sunset to sunrise (Home Assistant's sun, or Open-Meteo's),
  or always light or dark. The Dark/Light button flips it until the next sunrise or
  sunset.
* **Screensaver.** After 10 minutes, or the Screensaver button: the clock, the
  weather, the house and the MPTree numbers over a photo from Wikimedia Commons'
  Featured pictures. Or plain white, or the TV's own. Any key ends it.
* **The remote.** Arrows move focus to whatever is nearest in that direction. OK
  presses. Back closes a panel, then goes back to Home's first page. The Home
  button always comes back to Home.
* **Heating.** − and + change the set temperature by half a degree, and a button
  turns it on or off.

Not yet: the MPTree numbers through your MPTree account instead of a file address.

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
| `src/weather.ts` | The weather without Home Assistant (Open-Meteo), as Home Assistant states |
| `src/music.ts` | What MPTree plays on this TV (media sessions) |
| `src/components/layouts/` | The five Home layouts (the first page) |
| `src/components/HouseView.tsx` | The house page (the second page) |
| `src/home.css` | Round four: the layouts, the two pages, the house page |
| `src/photos.ts` | Screensaver photos from Wikimedia Commons |
| `src/nav.ts` | The remote: moves focus by position on screen; hold ◀ ▶ and hold OK |
| `src/ha.ts` | Home Assistant over REST, polled every 20 s while the screen is on |
| `src/homeConfig.ts` | The entity ids |
| `src/stats.ts` | Reads the MPTree numbers file (`STATS_URL` in `src/homeConfig.ts`) |
| `src/settings.ts` | What the launcher remembers (Capacitor Preferences) |
| `src/components/` | Top bar, Home, Apps, Settings, Screensaver, app tiles |
| `android/.../LauncherPlugin.java` | Lists apps with their TV banners, opens them, Home button, app changes, what plays on the TV |
| `android/.../MediaListener.java` | The notification listener Android requires before an app may see media sessions |
| `android/.../AndroidManifest.xml` | HOME + LEANBACK_LAUNCHER, the banner, plain http allowed for Home Assistant |

The screen is drawn at 1920×1080 and scaled to whatever the TV reports, so every
size in `src/index.css` is in real TV pixels and matches the designs.
