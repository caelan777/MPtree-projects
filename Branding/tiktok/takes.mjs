/* The takes: short pieces of the real app being used, played in by capture.mjs.
 *
 * `at` is seconds from the first filmed frame. Targets are found the way a
 * person would find them: by the words on screen ({ text }, with ui: true when
 * those words are the app's own and get translated), by a button's accessible
 * name ({ label }) or tooltip ({ title }), or by the handles the app's tutorial
 * uses ({ tour }). A pair of numbers is a point in css px on the 360 x 612
 * screen.
 *
 *   tap:    target                               finger down, up after `hold` ms
 *   drag:   { from, to, ms, ease, hold, rest }   down, move, up
 *   scroll: { by | to, ms, ease }                the song list, with a drawn thumb
 *   js:     "code"                               anything else
 *
 * `pre` is played the same way before the camera rolls, for `preLength`
 * seconds: a song already playing, the header already folded.
 *
 * Seeding: playMode, current (a demo:// id), logoPos { fx, fy }, onboarded
 * (false for the welcome page), storage { key: value }.
 */

// The song the app restores on launch. The first row, so the list opens at
// the top rather than scrolled to wherever the restored song sits.
const FIRST = "demo://0";

// The "tap the logo to bring these back" pill shows the first three times the
// header folds, which on a fresh install is every take. Where the logo moves,
// it follows the logo and, parked on the right, sits on top of it. These takes
// film a phone that has already seen it three times.
const NO_HINT = { mptree_collapse_hint_shown: "3" };

export const TAKES = {
  tap: {
    about: "the list; a song is tapped and starts playing",
    current: FIRST,
    length: 3.2,
    script: [
      { at: 0.45, tap: { text: "Static Bloom" } },
    ],
  },

  player: {
    about: "the player opens on a turning record, then skips to the next song",
    current: FIRST,
    pre: [{ at: 0.1, tap: { text: "Static Bloom" } }],
    preLength: 1.4,
    length: 7,
    script: [
      { at: 0.35, tap: { label: "Expand player" } },
      // Skip forward. It has no name of its own; it sits left of the speed button.
      { at: 2.7, tap: { title: "Playback speed", sib: -1 } },
    ],
  },

  fold: {
    about: "the list is flicked and the header folds into the logo",
    current: FIRST,
    pre: [{ at: 0.1, tap: { text: "Midnight Drive" } }],
    preLength: 1.2,
    length: 2.6,
    script: [
      { at: 0.3, scroll: { by: 820, ms: 1300 } },
    ],
  },

  ball: {
    about: "the folded logo is dragged down the screen, then tapped: the header grows back",
    current: FIRST,
    storage: NO_HINT,
    pre: [
      { at: 0.1, tap: { text: "Midnight Drive" } },
      { at: 1.1, scroll: { by: 700, ms: 900, finger: false } },
    ],
    preLength: 3,
    length: 3.8,
    script: [
      { at: 0.3, drag: { from: { label: "Show search and player" }, to: [262, 318], ms: 750, hold: 60 } },
      { at: 2.0, tap: { label: "Show search and player" } },
    ],
  },

  // The same two moments at a quarter speed, for looking at the motion itself.
  // Times are still the app's own seconds; the video comes out four times
  // longer.
  "fold-slow": {
    about: "the header folding into the logo, at a quarter speed",
    speed: 0.25,
    current: FIRST,
    storage: NO_HINT,
    pre: [{ at: 0.1, tap: { text: "Midnight Drive" } }],
    preLength: 1.2,
    length: 0.9,
    script: [
      { at: 0.1, scroll: { by: 420, ms: 700, finger: false } },
    ],
  },

  "ball-slow": {
    about: "the parked logo tapped: it flies home as the header grows, at a quarter speed",
    speed: 0.25,
    current: FIRST,
    storage: NO_HINT,
    logoPos: { fx: 0.83, fy: 0.62 },
    pre: [
      { at: 0.1, tap: { text: "Midnight Drive" } },
      { at: 1.1, scroll: { by: 700, ms: 900, finger: false } },
    ],
    preLength: 3,
    length: 0.9,
    script: [
      { at: 0.15, tap: { label: "Show search and player" }, hold: 90 },
    ],
  },

  // Halloween night: a song is playing, Settings is tapped, the scare plays
  // (dark, then eyes and a grin), the treat sheet comes up, Thanks opens
  // Settings. The Play build only scares from 28 October to 1 November.
  halloween: {
    about: "31 October: Settings is tapped, the scare plays, then the treat sheet and Thanks",
    date: "2026-10-31T20:41:00+01:00",
    current: FIRST,
    storage: NO_HINT,
    pre: [{ at: 0.1, tap: { text: "Midnight Drive" } }],
    preLength: 1.2,
    length: 8.4,
    script: [
      { at: 1.9, tap: { tour: "settings" } },
      { at: 6.6, tap: { text: "Thanks", ui: true } },
    ],
  },

  // The same scare for the "stare at this" cut: five quiet seconds on the
  // list, and no finger on Settings, so nothing gives away what is coming.
  "halloween-stare": {
    about: "31 October: five still seconds on the list, then Settings opens unseen, the scare, the treat, Thanks",
    date: "2026-10-31T20:41:00+01:00",
    current: FIRST,
    storage: NO_HINT,
    pre: [{ at: 0.1, tap: { text: "Midnight Drive" } }],
    preLength: 1.2,
    length: 10.4,
    script: [
      { at: 5.0, js: `document.querySelector('[data-tour="settings"]').click()` },
      { at: 9.4, tap: { text: "Thanks", ui: true } },
    ],
  },

  welcome: {
    about: "first launch: the welcome page, Next, then Enter MPTree opens the library",
    current: FIRST,
    onboarded: false,
    ready: `/Welcome to MPTree|Welkom bij MPTree/.test(document.body.innerText)`,
    // Long enough for the splash screen to have faded right out.
    settle: 2.5,
    length: 4.4,
    script: [
      { at: 1.0, tap: { text: "Next", ui: true } },
      { at: 2.2, tap: { text: "Enter MPTree", ui: true } },
    ],
  },
};
