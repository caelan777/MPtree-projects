# Play Store listing, ready to paste

Everything below is drafted to drop straight into the Google Play Console. Character
limits are noted where Google enforces them. No em or en dashes anywhere, on purpose.

Privacy policy URL to use in the console: **https://mp-tree.net/privacy**
(the `.html` version 308-redirects to this clean URL, so use the clean one)

---

## Store listing text

### App name (max 30 characters)

```
MPTree
```

Alternative if you want keywords in the title (28 chars):

```
MPTree: Offline Music Player
```

### Short description (max 80 characters)

```
A private, offline music player for the songs already on your phone.
```
(67 characters)

### Full description (max 4000 characters)

```
MPTree plays the music that is already on your phone. No streaming, no account, no
subscription, and no internet needed. It is free, and nothing you listen to ever leaves
your device.

Open MPTree, allow it to find your audio files, and your whole library is ready to play.
That is the entire setup.

WHAT YOU GET

Works fully offline
Your music plays without a connection, anywhere, anytime.

Automatic playlists
Favourites, Recently Played, Most Played, and Last Added keep themselves up to date, so
your music is organised without any work from you.

Equaliser and crossfade
Shape the sound with a built in equaliser, fade smoothly between tracks, and change the
playback speed to taste.

Cut tracks
Trim any song and save the result as a new file. The original is left untouched.

Home screen widget and media controls
Control playback from your lock screen, your notifications, and a home screen widget.
Playback keeps going with the screen off.

Backups
Save your playlists, artwork, and music to a single file, and restore it later or on a
new phone.

PRIVATE BY DESIGN

MPTree has no ads, no tracking, and no account. It does not collect any data about you.
Your music and your listening stay on your device, because there is no server to send
them to. See the full privacy policy at mp-tree.net/privacy.html.

MADE FOR YOUR OWN MUSIC

MPTree is a player for audio files you already have on your device. It is perfect if you
keep your own music collection and want a fast, clean, private way to listen to it.

Free, no ads, no catch. Just your music, on your device.
```

---

## Data safety form (Play Console → App content → Data safety)

Answer these as follows. All are accurate for MPTree today.

- Does your app collect or share any of the required user data types? **No.**
- Is all of the user data collected by your app encrypted in transit? **Not applicable, no data is collected.**
- Do you provide a way for users to request that their data is deleted? **Not applicable, no data is collected.**

Result: the store listing will show "No data collected" and "No data shared", which is
true. If Google asks about the audio files permission, the honest framing is: audio is
read on the device to play it and is never collected, transmitted, or shared.

---

## Content rating questionnaire (Play Console → App content → Content rating)

Category to pick: **Utility, Productivity, Communication, or Other** (a music player is a
utility). Then answer the questionnaire:

- Violence: No
- Sexuality: No
- Language (profanity): No
- Controlled substances: No
- Gambling: No
- User generated content or user to user communication: No
- Shares user location: No
- Digital purchases: No

Expected outcome: rated for **Everyone / PEGI 3 / all ages**.

---

## App content declarations (Play Console → App content)

- Privacy policy: **https://mp-tree.net/privacy**
- Ads: **No, this app does not contain ads.**
- App access: all functionality is available without special access. No login is required,
  so no test credentials are needed. (If a reviewer asks how to reach every feature, note
  that granting the audio permission on first launch reveals the full library.)
- Content ratings: complete the questionnaire above.
- Target audience and content: choose the age groups you want. MPTree is fine for all
  ages, but if you select an age group that includes children you take on extra Play
  policy obligations, so the simplest choice is **13 and older**.
- News app: No.
- COVID-19 contact tracing or status app: No.
- Data safety: complete the form above.
- Government app: No.
- Financial features: None.
- Health: No.

### Permissions declaration

- READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE: used to find and play the user's local audio
  files. Core function of a music player.
- FOREGROUND_SERVICE + FOREGROUND_SERVICE_MEDIA_PLAYBACK: used to keep music playing and
  show media controls while the app is in the background or the screen is off. This is the
  standard, allowed use for a media player. If prompted, select the **Media playback** use
  case.
- INTERNET: used only by the optional in-app browser when the user chooses to open it.

---

## Store settings

- App category: **Music & Audio**
- Tags: music player, offline, audio, equalizer (pick from Play's tag list)
- Contact email: **caelanverycool@gmail.com**
- Website: **https://mp-tree.net**
- External marketing: your call

---

## Graphics checklist (what still needs a file)

| Asset | Size | Status |
|---|---|---|
| App icon | 512 x 512 PNG | Have it: `Branding/icon/app-icon-512.png` |
| Feature graphic | 1024 x 500 PNG | See `Branding/store/` (generated), regenerate if branding changes |
| Phone screenshots | min 2, up to 8, min 320px side | TODO: capture from the app on a device or emulator |
| Tablet screenshots | optional | Skip unless you want tablet featuring |

For phone screenshots, capture the real app: the Songs list, a playing track, Playlists,
and the equaliser make a strong set of four.
