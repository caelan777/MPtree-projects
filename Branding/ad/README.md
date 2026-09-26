# The ad

A nineteen second film for the Google Play launch. Black and white, 60 fps,
with its own score.

**[script.md](script.md) is the companion**, with every cut timed to the frame,
the voiceover, and the copy to post under it.

```bash
node Branding/ad/make-ad.mjs            # mptree-ad.mp4          1080x1920
node Branding/ad/make-ad.mjs --tiktok   # mptree-ad-tiktok.mp4   1080x1920
node Branding/ad/make-ad.mjs --square   # mptree-ad-square.mp4   1080x1080
node Branding/ad/make-ad.mjs --vo       # ...-vo.mp4, with the voiceover
node Branding/ad/make-ad.mjs --silent   # ...-silent.mp4, no sound at all
```

They land next to this file. None are committed: they are eleven to seventeen
megabytes each, and one command makes them again.

**The TikTok cut is the same edit at the same length.** What differs is where
it sits: TikTok lays its caption, its username and its buttons over the bottom
fifth of the frame, so that version hands the band back and composes above it.
Without it the end card's "Google Play · mp-tree.net" sits under the caption.
Same length means one piece of music fits every cut.

## What is in it

| From | To | |
|---|---|---|
| 0:00 | 0:05 | A record forms out of three rings, turns, and rises. "Your music. Already on your phone." |
| 0:05 | 0:13 | One phone, three screens. The songs list, the player, the playlists. The screen changes under a lit wipe rather than the phone cutting away. |
| 0:13 | 0:16 | "No ads. No subscription. No problems." |
| 0:16 | 0:19 | The record returns, settles upright, and the name arrives. |

It holds on the last frame instead of fading, so the end card can be frozen for
as long as a post needs.

## The sound

**The score is written in the file, not laid over it.** It is five voices of
Web Audio in `ad.html`: a sub, a kick, hats, bells and a pad, through a hall
made of decaying noise. A minor, 87.8 BPM.

That tempo is not a taste. One phone beat is one bar, so the hits land on the
cuts rather than near them, and the three lines of the statement card each
arrive on their own beat. Nothing was bent to fit: the edit was already cut to
that grid, and the score was written onto it.

Two things follow from generating it here. It is original, so using it needs
clearing with nobody. And it is muxed by Chrome in the same pass as the
picture, so there is no second tool and no editor step.

```bash
node Branding/ad/make-ad.mjs --score    # print the loudness envelope
```

That prints a bar per quarter second and marks the cuts, which is how the
score is checked. It is also how the master gain was set: at 0.9 the loudest
kick peaked at 1.084 and clipped, so it sits at 0.76 and peaks at 0.930.

**The voiceover is not generated.** `voice/lines.json` is a list of
`{ at, file }`, `at` being seconds into the film, and the renderer decodes each
clip and schedules it on the audio clock. Any format a browser can read works.
Record the six lines in `script.md` on a phone, drop them in `voice/`, and run
`--vo`. When a voice is present the score steps back to 46 per cent by itself.

`voice/make-guide.mjs` builds a scratch track out of the speech voices Windows
ships. It is for hearing whether a line fits its gap before anyone stands in
front of a microphone, and it reports any line that runs past the next cue. The
voices are the old SAPI ones and they sound it, so do not ship that track.

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
node Branding/ad/make-ad.mjs --bench             # cost of the heaviest frame
```

Open `ad.build.html` in a browser and it plays on a loop, which is the fastest
way to judge a timing change. Edit `ad.html`, never the built copy.

**On the frame rate.** The recorder stamps frames by the wall clock, so a
machine that cannot draw one inside its budget does not drop it, it holds it,
and the film comes out longer and slower than it was written.

With sound that is not cosmetic. The score is scheduled on the audio clock and
plays in real time, so a render that stretches by a second puts the picture a
second off the music by the end. Every render measures it, and a render with
sound that drifts past 0.1s is **rejected** with a non-zero exit rather than
written off as a warning. It has happened: one pass came out 0.72s long and was
thrown away.

If it keeps happening, render at `--fps 30`. On the machine this was built on
the heaviest frame costs 8 ms against a 17 ms budget, so 60 fps has room.
`--bench` asks that question without rendering anything.

## Two things to know

**It is not strictly monochrome, and that is the app's doing.** The shuffle
button is violet and the remove button is red inside the screenshots, because
that is what they are in MPTree. Everything this film draws itself is black and
white.

**The layout is composed for a phone held upright.** Square is as far sideways
as it goes. There is no landscape cut: positions are fractions of the frame, so
at 16:9 the phone grows until a beat shows four rows of a song list and nothing
else. Landscape would need its own layout, not a wider canvas.
