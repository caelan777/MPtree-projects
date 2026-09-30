# The MPTree account

Part of MPTree Pro. Sign in with Google on up to three phones. Everything a
person made or set is saved in the account; the songs are not, they go from
phone to phone. Code: `MPTree-App/src/sync/` (model, engine, drive, rtc),
`src/components/AccountSheet.tsx`, and the native `AccountPlugin.java` and
`SyncPlugin.java`.

## Where things live

There is no MPTree server. The account is the app folder (`appDataFolder`) of
the person's own Google Drive, reached with the `drive.appdata` scope only.

| File | What |
|---|---|
| `devices.json` | The phones on the account, three at most |
| `library.json` | Playlists, song details, bin, cut tracks, settings (songs by fingerprint) |
| `covers.json` | Cover pictures by hash |
| `inv-<phone>.json` | Which song files that phone has |
| `peer-<phone>.json` | "I am open now", and the WebRTC offer or answer |
| `relay-<to>-<fp>` | A song waiting for phone `<to>`; deleted once it arrives |

Songs go straight across over WebRTC when both phones have MPTree open (Google
STUN, no TURN). When that fails, or the other phone is closed, they wait in the
app folder, at most 1 GB per phone at a time, and a month at most. Wifi only
unless the person allows mobile data, and then 500 MB a day at most.

## Rules for the awkward cases

- **Joining an account that has things in it** asks three questions: send this
  phone's new songs everywhere or keep them here; the account's look or this
  phone's; add this phone's playlists and likes, or replace them with the
  account's. Playlists with the same name become one. A song this phone has
  stays in its list even if the account has it in the bin.
- **Signing out** keeps the base, so signing in again carries on; it can also
  delete the songs that came from other phones.
- **Voice notes, recordings, clips under a minute** (cleanup.ts) and songs kept
  "on this phone only" are never sent.
- **Deleted outside MPTree:** a file that disappears is not fetched back.
  "Get them back" on the account page undoes that.
- **Deleted for good in the bin** marks the song `gone`; other phones offer
  "Delete here too". Restoring it anywhere undoes it.
- **Two versions of one song** (same title and artist, within 2 s) are not both
  fetched.
- **Room:** songs only come in while 500 MB stays free.
- **Conflicts:** a change made on two phones goes to the later one (`at`
  stamps, with the time of the edit kept across restarts).
- **Reinstalling** keeps the phone's id (ANDROID_ID). A phone of the same name
  unused for 30 days makes room by itself; same-model phones get "(2)".
- **Emptied in Drive** (Delete hidden app data): phones stop and say so,
  instead of filling it up again.
- The screen stays on while a song is moving.

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
