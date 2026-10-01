# The MPTree account

Part of MPTree Pro. Sign in with Google on up to three phones and they share one
library: playlists, likes, names, the bin, cut tracks and settings are the same
on all of them. Language, text size, the equalizer and the app icon stay with
each phone. The songs are not saved in the account; they go from phone to
phone so every phone has them all.

Test build 15 tried two libraries (This device and All devices) side by side.
That was too complicated and was dropped in build 16; a phone coming from 15
keeps its own library and joins it with the account again (`leaveTwoLibraries`
in engine.ts).

Code: `MPTree-App/src/sync/` (model, engine, drive, rtc),
`src/components/AccountSheet.tsx`, `BinView.tsx`, and the native
`AccountPlugin.java` and `SyncPlugin.java`.

## Where things live

There is no MPTree server. The account is the app folder (`appDataFolder`) of
the person's own Google Drive, reached with the `drive.appdata` scope only.

| File | What |
|---|---|
| `devices.json` | The phones on the account, three at most (a test phone does not count) |
| `library.json` | The library: playlists, song details, bin, who deleted what, cut tracks, settings (songs by fingerprint) |
| `covers.json` | Its cover pictures by hash |
| `inv-<phone>.json` | Which song files that phone has, with title and artist |
| `pro.json` | "This account has Pro": which device bought it, and whether on Play or as a test build's free unlock |
| `peer-<phone>.json` | "I am open now", and the WebRTC offer or answer |
| `relay-<to>-<fp>` | A song waiting for phone `<to>`; deleted once it arrives |

Songs go straight across over WebRTC when both phones have MPTree open (Google
STUN, no TURN). When that fails, or the other phone is closed, they wait in the
app folder, at most 1 GB per phone at a time, and a month at most. Wifi only
unless the person allows mobile data, and then 500 MB a day at most. A song
from another phone lands in Music/MPTree.

## Rules

- **Signing in** asks nothing: this phone's library joins the account's.
  Likes add up, playlists of the same name become one, the account's settings
  win.
- **Deleting a song permanently** takes the file off this phone only, and is
  written down in the song's `del` (phone -> when). The song goes in the bin
  on the other phones. This phone lists it in the bin under "Permanently
  deleted"; "Get back" empties `del` and takes it out of the bin, and every
  phone that deleted it fetches it again. When no phone has the file any more
  it is gone: greyed out, and dropped from that list after 30 days. The
  question before deleting says whether other phones keep it, or whether it is
  the last copy.
- **Deleted outside MPTree** counts as deleted permanently.
- **Songs not here yet** (on their way, or the phone is full) show greyed out
  under the song list.
- **Voice notes, recordings, clips under a minute** (cleanup.ts) are never sent.
- **Signing out** leaves the phone as it is, with the option to delete the
  songs that came from the other phones. Signing in again joins afresh. It
  only forgets this phone's token: revoking MPTree's access on Google's side
  would sign out every phone on the account, since the grant is per Google
  account.
- **Device names** come from the model and can be changed on the account
  page (`renameDevice`).
- **Sign in first, then buy.** On a phone (not in the browser demo) the Pro
  page asks to sign in before it offers the purchase: "Sign in to get Pro".
  Signing in needs no Pro. An account that has Pro gives it to the device
  straight away; otherwise the device is signed in, paused, and the Pro page
  shows the buy button. The free week and Restore purchase need no account.
- **Pro comes with the account.** A device that bought Pro writes `pro.json`;
  any device signed in to the account has Pro too, also one whose Google Play
  account is another one. Pro from the account goes with signing out. A Play build only takes a `pro.json`
  from Play, not a test build's free unlock. When the device that bought it
  loses Pro (refunded), it deletes `pro.json`, also while paused.
- **Pro ends:** syncing stops; nothing on the phone changes. A paused device
  keeps looking for `pro.json`, so Pro bought on another device reaches it.
- **Two copies of one song** are not both fetched: same file name and size, or
  same title and artist within 2 s (or with a length not known yet). A song
  that reads back under another fingerprint than it was sent with keeps the
  sent one (`alias`). Copies that got through anyway are listed on the account
  page, and "Delete the extra copies" removes them without telling the other
  phones (`skip`).
- **Deleting many files** (bin, sign out) asks Android once
  (`MusicScanner.deleteFiles`), not once per song.
- **Signing out** is at once on screen; the device leaves the account in the
  background.
- **A device that has not said what it has** (no inv file: just signed in, or
  just signed out) is sent nothing through Drive. Before each song left in
  Drive, the sender checks the device is still on the account and still
  lacks it. Songs only come in while 500 MB stays free.
- **Conflicts:** three-way merge against the last agreed base; a change made on
  two phones goes to the later one (`at` stamps). Plays add up. Who deleted a
  song merges phone by phone.
- **Reinstalling** keeps the phone's id (ANDROID_ID). A phone of the same model
  that has been quiet for 15 minutes is taken to be this one from before and
  makes way; otherwise same-model phones get "(2)". Two files of the same name
  (two phones creating one at once) are folded into one: devices.json lists
  are joined, of anything else the newest stays.
- **Emptied in Drive** (Delete hidden app data): phones stop and say so,
  instead of filling it up again.
- The screen stays on while a song is moving.

## Testing with one phone

- **Test device** (test builds only, on the account page): a pretend phone that
  lives in Drive. It brings three 70 second tone songs through the Drive relay,
  can make a playlist and like a song, and can delete its songs permanently. It
  is sent nothing and does not count towards the three.
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
`window.__mptreeSync.run()` runs a round by hand.
