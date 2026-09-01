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
 */
window.MPTREE_REPO = "caelan777/MPtree-projects";

window.MPTREE_VERSIONS = [
  {
    version: "0.1.1",
    date:    "2026-09-01",
    channel: "beta",
    tag:     "v0.1.1-beta",
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
