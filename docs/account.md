# The MPTree account

Part of MPTree Pro. Sign in with Google on up to three phones. Then there are
two libraries, picked with a switch in the header card and at the top of
Settings:

- **This device**: what the phone had before. Its songs, playlists, likes, bin
  and look. It stays on the phone; the account never sees it.
- **All devices**: one library every phone on the account shares. Every song of
  every phone, with playlists, likes, names, a bin and a look of its own. What
  is done in it is done on every phone.

Language, text size, the equalizer and the app icon stay with the phone in both.
The songs are not saved in the account; they go from phone to phone so every
phone has them all.

Code: `MPTree-App/src/sync/` (model, engine, drive, rtc),
`src/components/AccountSheet.tsx`, `ModeSwitch.tsx`, `BinView.tsx`, and the
native `AccountPlugin.java` and `SyncPlugin.java`.

## Where things live

There is no MPTree server. The account is the app folder (`appDataFolder`) of
the person's own Google Drive, reached with the `drive.appdata` scope only.

| File | What |
|---|---|
| `devices.json` | The phones on the account, three at most (a test phone does not count) |
| `library.json` | All devices: playlists, song details, bin, who deleted what, cut tracks, settings (songs by fingerprint) |
| `covers.json` | Its cover pictures by hash |
| `inv-<phone>.json` | Which song files that phone has, with title and artist |
| `peer-<phone>.json` | "I am open now", and the WebRTC offer or answer |
| `relay-<to>-<fp>` | A song waiting for phone `<to>`; deleted once it arrives |

On the phone, All devices is kept under keys of its own (`mptree_meta@all` and
so on, `setLibraryScope` in storage.ts). Switching library saves the settings
of the one going away (`mptree_profile_device` / `mptree_profile_all`) and puts
the other's in place (`collectShared` / `restoreShared`).

Songs go straight across over WebRTC when both phones have MPTree open (Google
STUN, no TURN). When that fails, or the other phone is closed, they wait in the
app folder, at most 1 GB per phone at a time, and a month at most. Wifi only
unless the person allows mobile data, and then 500 MB a day at most. A song
that came from another phone lands in Music/MPTree and shows in All devices
only, until someone puts it on This device (song menu) or signs out keeping it.

## Rules

- **Signing in** asks nothing. The first time, All devices starts with this
  phone's likes, names and covers, and none of its playlists. Playlists are
  made in All devices, or copied either way from a playlist's header.
- **Binning** is per library: the bin of This device and the bin of All devices
  are separate. Binning in All devices bins it on every phone's All devices.
- **Deleting for good**, in either library, takes the file off this phone and is
  written down in the song's `del` (phone -> when). Other phones that have it
  keep it in the bin of All devices. This phone lists it in the bin under
  "Deleted for good here"; "Get back" empties `del` and un-bins it, and every
  phone that deleted it fetches it again. It comes back into This device, with
  its playlists and details, if it was there. When no phone has the file any
  more it is gone: greyed out, and dropped from that list after 30 days.
- **Deleted outside MPTree** counts as deleted for good.
- **Before deleting for good** the question says what else happens: that the
  song is also in This device, that other devices keep it, or that it is the
  last copy.
- **Phone full:** songs of All devices that do not fit show greyed out under the
  list, with how much room they need.
- **Voice notes, recordings, clips under a minute** (cleanup.ts) stay in This
  device and are never sent.
- **Backups, Clean up and restoring** are about This device; they switch to it
  first.
- **Signing out** shows This device; the songs from other phones stay (in This
  device) or are deleted, as chosen.
- **Pro ends:** All devices stops and the app shows This device.
- **Two versions of one song** (same title and artist, within 2 s) are not both
  fetched. Songs only come in while 500 MB stays free.
- **Conflicts:** three-way merge against the last agreed base; a change made on
  two phones goes to the later one (`at` stamps). Plays add up. Who deleted a
  song merges phone by phone.
- **Reinstalling** keeps the phone's id (ANDROID_ID). A phone of the same name
  unused for 30 days makes room by itself; same-model phones get "(2)".
- **Emptied in Drive** (Delete hidden app data): phones stop and say so,
  instead of filling it up again.
- The screen stays on while a song is moving.

## Testing with one phone

- **Test phone** (test builds only, on the account page): a pretend phone that
  lives in Drive. It brings three 70 second tone songs through the Drive relay,
  can make a playlist in All devices and like a song, and can delete its songs
  for good. It is sent nothing and does not count towards the three.
- **Emulator:** the Android Studio emulator with a Google Play image is a real
  second phone. The AVD `MPTree_Test` (Pixel 7, Android 17, Play Store) is set
  up; start it from Android Studio's Device Manager, sign in to Google, install
  the test APK by dragging it onto the window.

## Google Cloud setup (once)

1. In Google Cloud Console, pick or create a project and enable the
   **Google Drive API**.
2. **Google Auth Platform, Branding:** app name MPTree, support email, home page
   `https://mp-tree.net`, privacy policy `https://mp-tree.net/privacy.html`.
   No logo, or Google wants to verify the brand first.
3. **Audience:** External. **Data access:** add `.../auth/drive.appdata`. It is a
   non-sensitive scope, so no scope verification.
4. **Clients:** two Android clients for package `com.caelan.mptree`:
   - the upload key, which signs the website APK and the test builds:
     SHA-1 `6C:11:FF:4B:37:73:21:75:50:F5:00:DA:F1:68:0B:6E:39:DE:3C:A8`
   - the Play app signing key: SHA-1 from Play Console, Test and release,
     App integrity, App signing.
5. **Audience, Publish app.** While it is in Testing, only listed test users can
   sign in, and their access runs out after 7 days.

No client id goes into the app: Google Play services matches the app by package
name and signing certificate.

## Testing on the dev server

`localStorage.mptree_dev_account = "1"` switches on a stand-in account whose
"Drive" lives in the dev server's memory (`vite.config.ts`). Open
`http://localhost:5174` and `http://phone-b.localhost:5174` to play two phones.
Songs do not move in the browser; only the account does.
`window.__mptreeSync.run()` runs a round by hand, `setMode("all")` switches.
