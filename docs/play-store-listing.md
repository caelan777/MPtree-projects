# Play Store listing, ready to paste

Everything below is drafted to drop straight into the Google Play Console. Character
limits are noted where Google enforces them. No em or en dashes anywhere, on purpose.

Privacy policy URL to use in the console: **https://mp-tree.net/privacy**
(the `.html` version 308-redirects to this clean URL, so use the clean one)

---

## Release notes for 1.2.0 (max 500 characters each)

The AAB is `MPTree-App/android/app/build/outputs/bundle/release/MPTree-1.2.0.aab`
(versionCode 36).

```
<en-GB>
New with Pro: the MPTree account. Sign in with Google on up to three devices and they share one library: playlists, likes and settings. Your songs go from one device to the others by themselves, over wifi. Everything stays in your own Google Drive. Buy Pro once and every device on your account has it.
Deleted a song for good? The bin now has a Permanently deleted tab, so you can get it back from your other devices.
</en-GB>
<nl-NL>
Nieuw met Pro: het MPTree-account. Log in met Google op maximaal drie apparaten en ze delen één bibliotheek: afspeellijsten, likes en instellingen. Je nummers gaan vanzelf van het ene apparaat naar de andere, via wifi. Alles blijft in je eigen Google Drive. Koop Pro één keer en elk apparaat op je account heeft het.
Een nummer voorgoed verwijderd? In de prullenbak staat nu Permanent verwijderd, zodat je het terughaalt van je andere apparaten.
</nl-NL>
```

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
MPTree plays the music that is already on your phone. No streaming, no subscription,
no ads, and no internet needed. It is free, and nothing you listen to is ever sent to us.

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

MPTREE PRO

One purchase, no subscription. Pro adds colours, a spinning record, a header card and
other app icons, and never takes a free feature away. Try it free for a week first.

With Pro you can also sign in with Google and use MPTree on up to three devices. Your
playlists, likes and settings are the same on all of them, and your songs go from one
device to the others by themselves. Everything is kept in your own Google Drive, not
with us. Buy Pro once and every device you sign in on has it.

PRIVATE BY DESIGN

MPTree has no ads, no tracking, and no analytics. There is no server, so your music and
your listening are never sent to us. Signing in is optional, and even then your library
only goes to your own Google Drive and your own devices. See the full privacy policy at
mp-tree.net/privacy.

MADE FOR YOUR OWN MUSIC

MPTree is a player for audio files you already have on your device. It is perfect if you
keep your own music collection and want a fast, clean, private way to listen to it.

Free, no ads, no catch. Just your music, on your devices.
```

---

## Data safety form (Play Console → App content → Data safety)

Accurate from 1.2.0, the version with the MPTree account. (Up to 1.1.0 the answer was
simply "No data collected".)

Why anything counts as collected: Play calls data "collected" when the app sends it off
the device, even to the user's own Google Drive. Signing in to an MPTree account sends
the library to the Drive app folder and the songs to the user's other devices, so those
types are declared. Nothing reaches us.

**Data collection and security**
- Does your app collect or share any of the required user data types? **Yes.**
- Is all of the user data collected by your app encrypted in transit? **Yes.** (Drive is
  HTTPS; songs sent directly go over WebRTC, which is always encrypted.)
- Which of the following methods of account creation does your app support? **OAuth**
  (Sign in with Google). There is no username or password of our own.
- Delete account URL: **https://mp-tree.net/privacy#delete-account** (the steps, and what
  is deleted and what stays).
- Delete some data without deleting the account (optional): leave empty.
- Do you provide a way for users to request that their data is deleted? **Yes.**
  (Delete hidden app data in Google Drive, see the same page.)

**Data types.** Tick exactly these. For each one: **Collected: yes. Shared: no** (it only
goes to the user's own Drive and own devices, at their request). **Processed
ephemerally: no. Required or optional: optional** (only when signed in). **Purpose: App
functionality.**

| Category | Data type | What it is in MPTree |
|---|---|---|
| Audio | Music files | Songs moving between the user's devices, sometimes waiting in their Drive |
| Photos and videos | Photos | Covers the user sets, saved in the library |
| App activity | App interactions | Likes and play counts |
| App activity | Other user-generated content | Playlists, song names, lyrics, the bin, settings |
| Device or other IDs | Device or other IDs | A number per device in the list of devices, so they can tell each other apart |

Not ticked, on purpose:
- **Email address / Name:** MPTree reads them from Google only to show which account is
  signed in. They are not sent anywhere.
- **Purchase history:** Google Play handles Pro; MPTree only asks Play whether it is owned.
- **Location, contacts, messages, health, financial info, web history, crash logs,
  diagnostics:** none of it.

If Google asks about the audio files permission: audio is read on the device to play it.
It only leaves the device when the user signs in, and then only to their own devices
and Drive.

---

## Content rating questionnaire (Play Console → App content → Content rating)

Category to pick: **Utility, Productivity, Communication, or Other** (a music player is a
utility). Then answer the questionnaire:

- Violence: No
- Sexuality: No
- Language (profanity): No
- Controlled substances: No
- Gambling: No
- User generated content or user to user communication: No (the account only syncs
  between the user's own devices; nobody can see or reach anyone else)
- Shares user location: No
- Digital purchases: **Yes** (MPTree Pro, a one-time purchase through Google Play)

Expected outcome: rated for **Everyone / PEGI 3 / all ages**.

---

## App content declarations (Play Console → App content)

- Privacy policy: **https://mp-tree.net/privacy**
- Ads: **No, this app does not contain ads.**
- App access: **All functionality is available without special access.** Nothing needs a
  login of ours. Pro is a purchase, and it can be tried free for a week from Settings,
  then MPTree Pro. Buying Pro starts with signing in with Google (the reviewer's own
  account, it is the MPTree account that keeps Pro), so no test credentials are
  needed. Granting the audio permission on first launch reveals the full library.
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
- INTERNET: Google Play for Pro, and the MPTree account when the user signs in: their
  own Google Drive app folder, and songs sent directly to their own other devices. No
  streaming, no analytics, nothing sent to a server of ours (there is none).
- ACCESS_NETWORK_STATE: to move songs on wifi only, unless the user allows mobile data.

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
