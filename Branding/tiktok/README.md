# TikTok videos

Short vertical videos for TikTok, Reels and Shorts. Each one is fifteen
seconds of the real app being used, cut like a phone screen recording with
captions typed over it.

**[posting.md](posting.md) is the companion**: which one to post first, what
to write under each, and what to do with the sound.

The film in [../ad/](../ad/README.md) is a different thing. That one is an
advert, and it looks like one: made for a launch, a store page, or a paid slot.
These are made for the feed, where anything that looks like an advert gets
scrolled past in under a second. So they look like what people actually post:
somebody's phone, recorded, with a line of text on top.

| File | Opens with | For |
|---|---|---|
| `mptree-ads.mp4` | every music player i tried was full of ads | the main one |
| `mptree-downloads.mp4` | i put my music app on the play store and 7 people downloaded it | the underdog version |
| `mptree-logo.mp4` | i spent way too long on this logo animation | people who notice design |
| `mptree-ads-nl.mp4` | elke muziekspeler die ik probeerde zat vol reclame | Dutch, over the app in Dutch |
| `mptree-halloween.mp4` | pov: you open the settings of your music app on halloween | 28 Oct to 1 Nov only: the scare behind Settings, then the treat (8 s) |
| `mptree-halloween-stare.mp4` | stare at the songs and don't look away | the countdown version (12 s) |
| `mptree-halloween-boo.mp4` | (just the scare) | the scare, happy halloween, download MPTree (8 s). **The one with its own sound**, made in [sounds.js](sounds.js) from oscillators and noise |

All four are 1080 x 1920, 30 fps, H.264, about 15 seconds and 22 MB, with no
sound. They land next to this file and are not committed.

## Making them

```bash
node Branding/tiktok/capture.mjs                # film the takes
node Branding/tiktok/capture.mjs --lang nl      # the same takes, in Dutch
node Branding/tiktok/render.mjs                 # cut all four videos
```

Two steps, because filming is the slow part (a couple of minutes) and cutting
takes seconds. Captions can be rewritten and the videos cut again as often as
you like without filming anything twice. Filming builds the Play Store version
of the app on its first run; `--rebuild` builds it again after the app changes.

The download count in the second video is a variable, so it can be kept true:

```bash
node Branding/tiktok/render.mjs downloads --var downloads=12
```

## What is in a video

**The app is real.** `capture.mjs` builds the Play Store version of MPTree,
runs it in Chrome at the size of a phone, and uses it the way a thumb would,
following the scripts in [takes.mjs](takes.mjs): tap this song, open the
player, flick the list, drag the logo. The library is the website demo's
invented one, with a sleeve drawn for every album ([covers.mjs](covers.mjs))
so the list does not scroll past forty grey note icons. Nothing on the app's
screen is drawn by hand, so a video cannot show the app doing something it
does not do.

**What is added is what a phone and an editor would add**, drawn by
[compose.html](compose.html): Android's status bar, the gesture bar, the grey
"show taps" circles where a finger is, a slow push-in here and there, and the
captions. Those are set in TikTok Sans, TikTok's own typeface, in the black on
white label style its editor makes, so they read as text somebody typed in the
app rather than as an advert.

One thing in that list is illustration. The status bar shows airplane mode,
and the recording was made in a browser, not on a phone in airplane mode.
What it illustrates is true, MPTree plays with no connection at all, but that
icon is drawn, not recorded.

## How the filming works

A screen recorder films in real time. Whenever the machine falls behind, a
frame comes out late and the video stutters, and a phone animation that lasts
a third of a second has no room for that.

So nothing here runs in real time. [vclock.js](vclock.js) goes into the app's
page before the app does and takes over its clock: timers, animation frames,
`Date`, `performance.now`, and every CSS animation and transition. Nothing
moves until the recorder moves it, and then exactly one frame's worth. A frame
can take a third of a second to photograph and the app still believes a
thirtieth has passed. Slow motion falls out of the same thing: the
`fold-slow` and `ball-slow` takes move the clock a quarter of a frame at a
time, so every frame of the slow version is a real frame of the app.

Three things had to be made to hold still with it:

* **Touches are DOM events, not DevTools input.** At a device scale of 4,
  Chrome's `Input.dispatchTouchEvent` delivers every touchmove after the first
  at a quarter of its real position, so a dragged logo crawled a few pixels
  while the finger crossed the screen. Its gesture handling also runs on the
  wall clock. The app listens for touches and clicks, so those are sent
  straight to whatever is under the finger.
* **Smooth scrolling is done on animation frames.** The app glides to the
  playing song with `behavior: "smooth"`, which Chrome runs on its own clock
  and which arrived as a jump between two frames.
* **Shuffle is seeded.** `Math.random` is replaced with a fixed sequence, so a
  take skips to the same next song every time it is filmed.

## How the cutting works

[cuts.mjs](cuts.mjs) describes each video as a list of shots, stretches of
the takes, with captions timed from the start of their shot. `render.mjs`
opens `compose.html` in Chrome, which draws every frame as a function of the
frame number and hands it to Chrome's own H.264 encoder with an exact
timestamp. [mp4.js](mp4.js) wraps the result in an MP4. There is no ffmpeg
and nothing to install.

**Every render checks itself.** The finished file is read back out of its own
boxes, a few frames are decoded from it and compared with the same frames
drawn again. A difference of a fraction of a level out of 255 is compression;
anything over 6 fails the render and writes nothing. The file is not trusted
because it was written, only because it plays back as what was drawn.

## Changing things

* **A caption**: edit it in `cuts.mjs` and run `render.mjs`. Keep words
  between y 260 and 1500 and away from the right edge; TikTok puts its tabs
  above that, its caption and sound name below it, and its buttons down the
  right.
* **Stills**, to check a change without watching the whole thing:
  `node Branding/tiktok/render.mjs ads --at 0,3.2,9.5` writes PNGs to
  `stills/`. `--at 0` is also the frame to use as a cover.
* **A new take**: add it to `takes.mjs` and film it by name,
  `node Branding/tiktok/capture.mjs mytake`. `--trace "<js>"` prints any
  expression after every frame, which is how you find out why a take does not
  do what it should.
* **A new video**: add a cut to `cuts.mjs`. It can use any take, in any
  order, as often as it likes.

## No sound, on purpose

The files have no audio track. TikTok, Reels and Shorts all let you pick a
sound in their own editor, and a sound picked there is one the app can show
to everyone else using it, which is reach a sound baked into the file does
not get. posting.md says which kind to pick.
