/* MPTree release history, the single source of truth for the website.
 *
 * The homepage reads the first entry for its "latest version" badge, and
 * versions.html renders the whole list. Add a new entry at the TOP for every
 * release; nothing else on the site needs editing.
 *
 * Versioning, as used here:
 *   0.1.x  beta, released on this website only. Every fix bumps the patch.
 *   0.2.0  the point those betas are gathered up into a Play Store release.
 *
 * Each release must exist on GitHub under `tag` and carry TWO copies of the
 * same APK:
 *   MPTree.apk            the Download button resolves /releases/latest/ to this
 *   MPTree-<version>.apk  what this page links to, so saved files stay telling apart
 *
 * Do not tick "Set as a pre-release" on GitHub, even for a beta: /releases/latest
 * skips pre-releases, and the Download button would silently keep serving the
 * previous version.
 *
 * An entry may set `download: false` when no APK exists for it. The list then
 * shows that release's changelog with a short note instead of a button, rather
 * than linking somewhere that 404s. 0.1.1 is the one case: it was superseded by
 * 0.1.2 before any APK was published for it.
 *
 * Also update /version.json when you add an entry here. That file is what the
 * APK from this website reads to tell people on an older build that a new one
 * exists; if it lags behind, nobody finds out. (The Play Store build never
 * reads it — Play does not allow an app to point at another update channel.)
 */
window.MPTREE_REPO = "caelan777/MPtree-projects";

window.MPTREE_VERSIONS = [
  {
    version: "0.1.3",
    date:    "2026-09-05",
    channel: "beta",
    tag:     "v0.1.3-beta",
    notes: [
      "The sort menu lists your artists, so you can narrow the library to one of them.",
      "Songs now show the cover art stored inside the file, in every list.",
      "Set any song as your ringtone, straight from its menu.",
      "Edit has a genre field, and multi-select can set artist, genre and cover on many songs at once.",
      "The big player has a Queue button and a Lyrics button.",
      "Selecting songs inside a playlist now offers everything the songs list does.",
      "Ringtone, Photo and Edit are bigger buttons at the top of the song menu.",
      "Folding the header on a playlist no longer jumps.",
    ],
  },
  {
    version: "0.1.2",
    date:    "2026-09-03",
    channel: "beta",
    tag:     "v0.1.2-beta",
    notes: [
      "The header and player fold away on the Playlists tab too, and a hint says how to bring them back.",
      "Sorting works again. The menu used to open behind the header card and stay invisible.",
      "Add songs to a playlist straight from multi-select, and select or deselect everything when adding.",
      "The playing song is now obvious: accent bar, bold title and moving bars on its artwork.",
      "Songs without a photo get a grey music icon instead of coloured initials.",
      "Cut is simpler: two handles, one preview button.",
      "The timeline moved out of the small player, into the full one.",
      "Startup no longer shows two different loading screens.",
      "Nothing hides behind the player any more, in playlists or when adding songs.",
      "The app tells you when a newer version is on the website.",
    ],
  },
  {
    version: "0.1.1",
    date:    "2026-09-01",
    channel: "beta",
    tag:     "v0.1.1-beta",
    download: false,   // no APK was ever published for this build
    notes: [
      "Play Next now actually plays the song next, in every mode.",
      "Tapping a song while shuffle is on keeps shuffling instead of playing in order.",
      "The Android back button steps back through the app instead of closing it.",
      "Per-song menu moved to a ⋮ button, with Add to playlist. Hold a row to multi-select.",
      "A spinning record in the expanded player, showing the song's own photo when it has one.",
      "Scrolling down folds the header and player into the logo. Hold the logo for the setting.",
      "Playlists scroll to the playing song, and scrolling no longer triggers edit mode.",
    ],
  },
  {
    version: "0.1.0",
    date:    "2026-07-27",
    channel: "beta",
    tag:     "v0.1.0-beta",
    notes: [
      "First public beta.",
    ],
  },
];
