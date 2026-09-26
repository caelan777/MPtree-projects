# The ad

A nineteen second film for the Google Play launch. Black and white, with its
own score.

**[script.md](script.md) is the companion**, with every cut timed to the frame,
the voiceover, and the copy to post under it.

```bash
node Branding/ad/make-ad.mjs            # mptree-ad.mp4          1080x1920
node Branding/ad/make-ad.mjs --tiktok   # mptree-ad-tiktok.mp4   1080x1920
node Branding/ad/make-ad.mjs --square   # mptree-ad-square.mp4   1080x1080
node Branding/ad/make-ad.mjs --clean    # ...-clean.mp4, no writing until the end
node Branding/ad/make-ad.mjs --vo       # ...-vo.mp4, with the voiceover
node Branding/ad/make-ad.mjs --silent   # ...-silent.mp4, no sound at all
```

The flags combine: `--clean --tiktok` is the clean cut composed for TikTok.

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

## The clean cut

`--clean` carries no writing at all until the end card, which reads **MPTree /
Now on Google Play**. It is for laying your own captions over, and for the
places that cover the picture with their own furniture anyway.

It is not the captioned film with the words switched off. Dropping the
statement card would leave nearly three seconds of black in the middle, which
reads as a fault on mute, so that bar runs a fourth screen instead, the song
menu, and the three hits in the score land on it rather than on three lines.
The record also stays centred in the opening, since it was only moving up to
make room for words that no longer arrive, and the phone sits higher for the
same reason.

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

**On the frame rate, which is 30.** The recorder stamps frames by the wall
clock, so a machine that cannot draw one inside its budget does not drop it, it
holds it, and the film comes out longer and slower than it was written.

With sound that is not cosmetic. The score is scheduled on the audio clock and
plays in real time, so a render that stretches by a second puts the picture a
second off the music by the end.

This was built at 60 and moved to 30, because 60 did not hold. A 16.7 ms budget
was enough for the captioned cut on a quiet machine and not enough for anything
else: renders came out 0.72s, 2.22s, 4.49s and once 15.66s long. At 30 there is
twice the room and every cut lands on 19.00s. `--fps 60` is still there for a
quiet machine, and it does look better on the turning record, but check what it
prints before using the file.

**Every render is checked twice and can fail.** Total drift past 0.1s with
sound is rejected with a non-zero exit. So is a take where more than a tenth of
the frames missed their slot, even when the total comes out right: one cold
render finished dead on 19.00s with 462 of 570 frames late and came out 2.8 MB
against the 13 MB the same film makes when it runs clean. The clock was fine
and the file was not.

There was a `--bench` here that measured a frame with `getImageData`. It read
about five times high, because that forces a pixel readback the recorder never
does, and it called a render that drifts nothing impossible. It is gone. The
drift line at the end of a render is the honest measurement.

## Two things to know

**It is not strictly monochrome, and that is the app's doing.** The shuffle
button is violet and the remove button is red inside the screenshots, because
that is what they are in MPTree. Everything this film draws itself is black and
white.

**The layout is composed for a phone held upright.** Square is as far sideways
as it goes. There is no landscape cut: positions are fractions of the frame, so
at 16:9 the phone grows until a beat shows four rows of a song list and nothing
else. Landscape would need its own layout, not a wider canvas.
