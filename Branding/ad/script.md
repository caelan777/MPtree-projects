# The ad, written out

For the Google Play launch. Nineteen seconds, silent, three cuts:
`mptree-ad.mp4` (1080x1920), `mptree-ad-tiktok.mp4` (same edit, composed
above TikTok's caption and buttons) and `mptree-ad-square.mp4` (1080x1080).

Everything below is timed to the film as it renders. If you change a timing in
`ad.html`, these numbers move with it.

---

## 1. Shot by shot

| Time | On screen | What is said |
|---|---|---|
| 0:00.0 | Black. Three rings expand from the centre and fade. | |
| 0:00.6 | A record forms out of the last ring and begins to turn. It keeps turning until 0:05.2. | |
| 0:02.5 | The record shrinks and rises into the top third. | |
| 0:03.0 | | **Your music.** |
| 0:03.7 | | Already on your phone. |
| 0:05.2 | Cut. A phone rises into frame holding the song list. | |
| 0:05.6 | | **It finds your music.** <br> **You just press play.** |
| 0:07.9 | A lit edge sweeps down the screen and leaves the player behind it. The record on the cover turns. | |
| 0:07.9 | | **A player worth opening.** |
| 0:10.7 | The edge sweeps again. Playlists. | |
| 0:10.7 | | **Playlists that fill themselves.** |
| 0:13.1 | The phone and the words fade together. | |
| 0:13.5 | Black. | **No ads.** |
| 0:14.0 | | **No subscription.** |
| 0:14.4 | | **No problems.** |
| 0:16.1 | Cut. The record returns, slowing, and comes to rest with the mark upright. | |
| 0:16.6 | | **MPTree** |
| 0:17.0 | | An offline music player. |
| 0:17.4 | | Google Play · mp-tree.net |
| 0:19.0 | Ends holding the end card. Freeze it as long as the post needs. | |

The three screens are real captures of the running app, not mockups.

---

## 2. Music

**The film comes with its own score.** It is not a track laid over the top, it
is written into the render: a sub, a kick, hats, bells and a pad, in A minor at
87.8 BPM, through a hall. Original, so using it anywhere needs clearing with
nobody.

87.8 BPM is the film's own tempo. One phone beat is one bar, so every gear
change lands on a bar line:

```
0:02.5   the record rises, the first words
0:05.2   cut to the phone
0:07.9   wipe to the player
0:10.7   wipe to the playlists
0:13.4   cut to black, and three hits under the three lines
0:16.1   cut to the end card, and it resolves
```

The statement card is the one to notice. The bar empties out and each of the
three lines lands on its own beat with a hit, then the fourth beat is a rest,
which is the silence before the end card.

**To use a different track instead**, render with `--silent` and lay your own
over it in an editor. The cut points above still apply; put the drop on 0:13.4.

---

## 3. The voiceover

Six lines. They are written to sit beside the picture rather than read it out,
so none of them says what is already on screen.

| Cue | Line | Room |
|---|---|---|
| 0:03.00 | Everything you own, in one place. | 2.6s |
| 0:05.60 | No setup. It is just there. | 2.35s |
| 0:07.95 | Your own artwork, turning as it plays. | 2.75s |
| 0:10.70 | Favourites, most played, last added. | 2.7s |
| 0:13.40 | It costs nothing, and wants nothing from you. | 3.15s |
| 0:16.55 | MPTree. On Google Play. | 2.45s |

"Room" is how long the line has before the next one starts. Keep it flat and
unhurried; the film is doing the work.

**Recording your own is the best version of this.** A phone in a quiet room
beats any synthetic voice, and it will not read as machine-made. Record the six
lines as separate files, drop them in `voice/`, point `voice/lines.json` at
them, and render with `--vo`. The score steps back under the voice by itself.
`node Branding/ad/voice/make-guide.mjs` will tell you if a line runs long.

---

## 4. What to write under it

Play Store link: `https://play.google.com/store/apps/details?id=com.caelan.mptree`

**TikTok**

> Your phone is already full of music you own. MPTree just plays it. No ads,
> no subscription, no account, and nothing about what you listen to leaves
> your phone. Out now on Google Play.
>
> #musicplayer #offlinemusic #android #mp3player #indieapp

**Instagram Reels**

> I built the music player I wanted to use.
>
> MPTree plays the files already on your phone. It finds them, sorts them, and
> gets out of the way. Playlists fill themselves. Your own cover art spins on a
> record while it plays. It works in flight mode, underground, anywhere.
>
> No ads. No subscription. No account. The whole app is 2.8 MB.
>
> Out now on Google Play. Link in bio.
>
> #musicplayer #offlinemusic #androidapps #mp3player #indiedev

**X**

> MPTree is out on Google Play.
>
> An offline music player for the files already on your phone. No ads, no
> subscription, no account. 2.8 MB.
>
> https://play.google.com/store/apps/details?id=com.caelan.mptree

**YouTube Shorts title**

> MPTree, an offline music player for Android

---

## 5. Two things to keep honest

**"Nothing leaves your phone"** is about listening, and it is true of both
builds: no analytics, no tracking, nothing about your library or your playing
is ever sent. The copy handed out on the website does check once a day whether
a newer version exists. The Google Play build does not check at all. Say
"nothing about what you listen to leaves your phone" rather than "it never
connects", which would not be true of the website build.

**2.8 MB** is what Google Play reports today. Check the listing before you put
it in a caption after a release that adds anything large.
