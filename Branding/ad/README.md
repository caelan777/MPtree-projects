# The ad

A nineteen second film for TikTok, Reels and Shorts. Black and white, no voice,
no music. Music and captions are added afterwards in an editor.

```bash
node Branding/ad/make-ad.mjs            # mptree-ad.mp4, 1080x1920
node Branding/ad/make-ad.mjs --square   # mptree-ad-square.mp4, 1080x1080
```

Both land next to this file. Neither is committed: they are eight and seven
megabytes, and one command makes them again.

## What is in it

| From | To | |
|---|---|---|
| 0:00 | 0:05 | A record forms out of three rings, turns, and rises. "Your music. Already on your phone." |
| 0:05 | 0:13 | One phone, three screens. The songs list, the player, the playlists. The screen changes under a lit wipe rather than the phone cutting away. |
| 0:13 | 0:16 | "No ads. No trackers. 2.8 megabytes." |
| 0:16 | 0:19 | The record returns, settles upright, and the name arrives. |

It holds on the last frame instead of fading, so the end card can be frozen for
as long as a post needs.

## How it is made

`ad.html` draws every frame into one canvas as a pure function of the frame
number. Nothing animates by itself, so frame 391 is identical on every render
and a re-render never comes out subtly different from the last one.

`make-ad.mjs` fills that page with the real mark from `../source/mptree-mark.svg`
and the real screenshots from `../store/raw/`, then drives Chrome over the
DevTools protocol: the canvas is captured a frame at a time and **Chrome itself
encodes the H.264**, which is why there is no ffmpeg anywhere in this and
nothing to install. It needs Chrome 130 or newer for that. On an older one it
falls back to WebM and says so.

The screenshots are real captures of the running app, taken by
`MPTree-App/scripts/screenshot.mjs`. They are gitignored, so run that first on a
clean checkout. A frame of this film cannot claim an interface the app does not
have.

## Working on it

```bash
node Branding/ad/make-ad.mjs --at 3.9,8.2,16.4   # those seconds as PNGs
node Branding/ad/make-ad.mjs --frames            # every frame as a PNG
```

Open `ad.build.html` in a browser and it plays on a loop, which is the fastest
way to judge a timing change. Edit `ad.html`, never the built copy.

## Two things to know

**It is not strictly monochrome, and that is the app's doing.** The shuffle
button is violet and the remove button is red inside the screenshots, because
that is what they are in MPTree. Everything this film draws itself is black and
white.

**The layout is composed for a phone held upright.** Square is as far sideways
as it goes. There is no landscape cut: positions are fractions of the frame, so
at 16:9 the phone grows until a beat shows four rows of a song list and nothing
else. Landscape would need its own layout, not a wider canvas.
