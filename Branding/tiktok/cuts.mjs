/* The videos, as edits of the takes.
 *
 * A shot is a stretch of a take: { take, from, to } in seconds of that take,
 * optionally `rate` (0.5 plays it at half speed) and `cam`, a push-in given as
 * [seconds into the shot, scale, centre x, centre y] keyframes in video px.
 * Shots play one after another with hard cuts, the way TikTok edits look.
 *
 * Captions, rings and badges are timed from the start of their `shot`, so a
 * shot can be trimmed without re-timing everything after it. `until` counts
 * from the same start; left out, it lasts to the end of that shot, or of shot
 * `through`.
 *
 * Captions: { lines, y, size, stagger, style: "box" | "plain", icon: "plane" }.
 * The frame is 1080 x 1920. Keep words between y 260 and 1500 and away from
 * the right edge: TikTok puts its tabs above that, its caption and sound
 * below it, and its buttons down the right.
 *
 * Copy is lowercase on purpose. That is how people type on TikTok, and a
 * caption in title case reads as an advert before it is read at all.
 */
// A slow push-in for opening shots: nothing in the app moves in the first
// half second, and a picture that is already moving is what stops a thumb.
const PUSH = [[0, 1, 540, 960], [2.6, 1.06, 540, 900]];

export const CUTS = {
  ads: {
    about: "every music player i tried was full of ads, so i made my own",
    lang: "en",
    shots: [
      { take: "tap",     from: 0.00, to: 2.40, cam: PUSH },
      { take: "welcome", from: 1.70, to: 3.20 },
      { take: "player",  from: 0.20, to: 2.60, cam: [[0.5, 1, 540, 900], [2.4, 1.12, 540, 880]] },
      { take: "fold",    from: 0.18, to: 1.78 },
      { take: "ball",    from: 0.18, to: 2.58 },
      { take: "player",  from: 2.40, to: 6.90, cam: [[0, 1.12, 540, 880], [4.5, 1.22, 540, 860]] },
    ],
    captions: [
      { shot: 0, lines: ["every music player i tried", "was full of ads"], y: 560, size: 60 },
      // Above the logo: the Enter MPTree button this shot is about sits at 1180.
      { shot: 1, at: 0.05, lines: ["so i made my own"], y: 320, size: 66 },
      { shot: 2, at: 0.25, stagger: 0.5, lines: ["no ads", "no account", "no subscription"], y: 340, size: 58 },
      { shot: 3, at: 0.1, lines: ["scroll and it all", "folds into the logo"], y: 1000 },
      { shot: 4, at: 0.1, lines: ["and the logo goes", "wherever you want"], y: 1400 },
      { shot: 5, at: 0.1, until: 2.0, lines: ["works in airplane mode"], icon: "plane", y: 330 },
      { shot: 5, at: 2.0, lines: ["it's called MPTree", "free on google play"], y: 330, size: 64 },
    ],
    rings: [
      { shot: 5, at: 0.1, until: 2.0, target: "plane", r: 42 },
    ],
  },

  // The underdog opening. The number is the Play Store's own install count;
  // set it per post with --var downloads=12 rather than editing it here.
  downloads: {
    about: "i put my music app on the play store and 7 people downloaded it",
    lang: "en",
    vars: { downloads: 7 },
    shots: [
      { take: "welcome", from: 0.00, to: 3.05, cam: PUSH },
      { take: "tap",     from: 0.25, to: 2.10 },
      { take: "player",  from: 0.20, to: 2.60, cam: [[0.5, 1, 540, 900], [2.4, 1.12, 540, 880]] },
      { take: "fold",    from: 0.18, to: 1.78 },
      { take: "ball",    from: 0.18, to: 2.58 },
      { take: "player",  from: 2.40, to: 6.90, cam: [[0, 1.12, 540, 880], [4.5, 1.22, 540, 860]] },
    ],
    captions: [
      { shot: 0, lines: ["i put my music app on the play store", "and {downloads} people downloaded it"], y: 1430, size: 54 },
      { shot: 1, at: 0.05, lines: ["here's what the other", "8 billion of you are missing"], y: 560, size: 58 },
      { shot: 2, at: 0.25, stagger: 0.5, lines: ["no ads", "no account", "no subscription"], y: 340, size: 58 },
      { shot: 3, at: 0.1, lines: ["scroll and it all", "folds into the logo"], y: 1000 },
      { shot: 4, at: 0.1, lines: ["and the logo goes", "wherever you want"], y: 1400 },
      { shot: 5, at: 0.1, until: 2.3, lines: ["it's called MPTree", "free on google play"], y: 330, size: 64 },
      { shot: 5, at: 2.3, lines: ["let's get it to 100"], y: 330, size: 64 },
    ],
  },

  // For people who notice motion. Opens on the logo's flight home at a quarter
  // speed, which is the part of the app with the most work in it.
  logo: {
    about: "i spent way too long on this logo animation",
    lang: "en",
    shots: [
      { take: "ball-slow", from: 0.45, to: 3.30 },
      { take: "fold-slow", from: 0.55, to: 3.25 },
      { take: "ball",      from: 0.18, to: 2.58 },
      { take: "tap",       from: 0.25, to: 1.95 },
      { take: "player",    from: 0.20, to: 2.60, cam: [[0.5, 1, 540, 900], [2.4, 1.12, 540, 880]] },
      { take: "player",    from: 2.60, to: 5.60, cam: [[0, 1.12, 540, 880], [3.0, 1.2, 540, 860]] },
    ],
    captions: [
      { shot: 0, lines: ["i spent way too long", "on this logo animation"], y: 1180, size: 62 },
      { shot: 1, at: 0.1, lines: ["it folds into the logo", "when you scroll"], y: 1000 },
      { shot: 2, at: 0.1, lines: ["and you can put it", "anywhere you want"], y: 1400 },
      { shot: 3, at: 0.05, lines: ["anyway it's a music player"], y: 560, size: 60 },
      { shot: 4, at: 0.25, stagger: 0.5, lines: ["no ads", "no account", "works offline"], y: 340, size: 58 },
      { shot: 5, at: 0.05, lines: ["it's called MPTree", "free on google play"], y: 330, size: 64 },
    ],
    badges: [
      { shot: 0, text: "0.25x", x: 860, y: 250 },
      { shot: 1, text: "0.25x", x: 860, y: 250 },
    ],
  },

  // The first cut in Dutch, over the app filmed in Dutch.
  "ads-nl": {
    about: "elke muziekspeler die ik probeerde zat vol reclame",
    lang: "nl",
    shots: [
      { take: "tap",     from: 0.00, to: 2.40, cam: PUSH },
      { take: "welcome", from: 1.70, to: 3.20 },
      { take: "player",  from: 0.20, to: 2.60, cam: [[0.5, 1, 540, 900], [2.4, 1.12, 540, 880]] },
      { take: "fold",    from: 0.18, to: 1.78 },
      { take: "ball",    from: 0.18, to: 2.58 },
      { take: "player",  from: 2.40, to: 6.90, cam: [[0, 1.12, 540, 880], [4.5, 1.22, 540, 860]] },
    ],
    captions: [
      { shot: 0, lines: ["elke muziekspeler die ik", "probeerde zat vol reclame"], y: 560, size: 60 },
      { shot: 1, at: 0.05, lines: ["dus ik heb er zelf een gemaakt"], y: 320, size: 60 },
      { shot: 2, at: 0.25, stagger: 0.5, lines: ["geen reclame", "geen account", "geen abonnement"], y: 340, size: 58 },
      { shot: 3, at: 0.1, lines: ["scroll en alles", "verdwijnt in het logo"], y: 1000 },
      { shot: 4, at: 0.1, lines: ["en dat logo zet je", "gewoon waar je wil"], y: 1400 },
      { shot: 5, at: 0.1, until: 2.0, lines: ["werkt ook in vliegtuigmodus"], icon: "plane", y: 330, size: 58 },
      { shot: 5, at: 2.0, lines: ["hij heet MPTree", "gratis in de play store"], y: 330, size: 64 },
    ],
    rings: [
      { shot: 5, at: 0.1, until: 2.0, target: "plane", r: 42 },
    ],
  },

  // Halloween, 28 October to 1 November: the scare behind Settings, then the
  // treat. One take, cut where the screen goes dark so the eyes land on a cut.
  halloween: {
    about: "pov: you open the settings of your music app on halloween",
    lang: "en",
    shots: [
      { take: "halloween", from: 0.00, to: 1.98, cam: PUSH },
      { take: "halloween", from: 1.98, to: 3.30 },
      { take: "halloween", from: 3.30, to: 6.75 },
      { take: "halloween", from: 6.75, to: 8.40 },
    ],
    captions: [
      { shot: 0, lines: ["pov: you open the settings", "of your music app on halloween"], y: 1300, size: 56 },
      { shot: 2, at: 0.4, lines: ["and then it gives you", "24 hours of pro for free"], y: 400, size: 58 },
      { shot: 3, at: 0.1, lines: ["it's called MPTree", "free on google play"], y: 330, size: 64 },
    ],
  },

  // The jumpscare format: the viewer is told to stare at the list and counts
  // down with it, nothing gives away the tap, then the eyes land with a punch
  // in and a shake. The apology and the treat come after, and the ending asks
  // to be sent on, which is what a scare video lives on.
  "halloween-stare": {
    about: "stare at the songs and don't look away",
    lang: "en",
    shots: [
      { take: "halloween-stare", from: 0.00, to: 5.00, cam: [[0, 1, 540, 960], [5.0, 1.1, 540, 900]] },
      { take: "halloween-stare", from: 5.00, to: 5.35 },
      { take: "halloween-stare", from: 5.35, to: 6.25, rate: 0.5, cam: [
        [0, 1.95, 540, 1090], [0.033, 1.88, 566, 1072], [0.067, 1.84, 510, 1112], [0.1, 1.81, 562, 1076], [0.133, 1.79, 520, 1108], [0.167, 1.77, 554, 1080], [0.2, 1.76, 528, 1100], [0.233, 1.75, 548, 1084], [0.3, 1.74, 537, 1092], [0.4, 1.73, 540, 1090], [1.8, 1.8, 540, 1090]] },
      { take: "halloween-stare", from: 6.25, to: 9.40 },
      { take: "halloween-stare", from: 9.40, to: 10.40, rate: 0.5 },
    ],
    captions: [
      { shot: 0, lines: ["stare at the songs", "and don't look away"], y: 330, size: 64 },
      { shot: 0, at: 1.8, until: 2.8, lines: ["3"], y: 1080, size: 150 },
      { shot: 0, at: 2.8, until: 3.8, lines: ["2"], y: 1080, size: 150 },
      { shot: 0, at: 3.8, until: 4.8, lines: ["1"], y: 1080, size: 150 },
      { shot: 3, at: 0.3, until: 1.8, lines: ["sorry", "my music app does this on halloween"], y: 400, size: 54 },
      { shot: 3, at: 1.8, lines: ["you get 24 hours of pro", "for the scare"], y: 400, size: 58 },
      { shot: 4, at: 0.05, lines: ["it's called MPTree", "send this to someone", "who scares easily"], y: 330, size: 58 },
    ],
  },

  // Nothing but the scare: a quiet second and a half on the list, the dark,
  // the eyes landing with a shake, and "happy halloween" under the grin. Then
  // the treat sheet and where to get the app. The only cut with its own sound
  // (sounds.js, "boo"): a hum, silence in the dark, a hit on the eyes, a music
  // box after.
  "halloween-boo": {
    about: "the jumpscare, then happy halloween, then download MPTree",
    lang: "en",
    sound: "boo",
    shots: [
      { take: "halloween-stare", from: 3.50, to: 5.00, cam: [[0, 1, 540, 960], [1.5, 1.04, 540, 940]] },
      { take: "halloween-stare", from: 5.00, to: 5.35 },
      { take: "halloween-stare", from: 5.35, to: 6.20, rate: 0.28, cam: [
        [0, 1.95, 540, 1090], [0.033, 1.88, 566, 1072], [0.067, 1.84, 510, 1112], [0.1, 1.81, 562, 1076],
        [0.133, 1.79, 520, 1108], [0.167, 1.77, 554, 1080], [0.2, 1.76, 528, 1100], [0.233, 1.75, 548, 1084],
        [0.3, 1.74, 537, 1092], [0.4, 1.6, 540, 1110], [1.0, 1.45, 540, 1130], [3.0, 1.5, 540, 1130]] },
      { take: "halloween-stare", from: 6.40, to: 9.30 },
    ],
    captions: [
      { shot: 2, at: 1.0, lines: ["happy halloween"], y: 1260, size: 84 },
      { shot: 3, at: 0.5, lines: ["download MPTree", "free on the play store"], y: 400, size: 66 },
    ],
  },
};
