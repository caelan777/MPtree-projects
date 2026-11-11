# Posting them

Four videos, four openings. Nobody can tell in advance which opening line
works, including TikTok, which is why there are four: each post is shown to a
small group first, and only what holds that group gets shown to more. So post
one a day and let the numbers pick.

## The order

1. **ads** (or **ads-nl** first, if most of the people who follow you speak
   Dutch; a new post is tried on people near you before anyone else)
2. **downloads**
3. **logo**
4. whichever of the three held people longest, again, with a new sound

Evenings are when the most people are scrolling: somewhere between 18:00 and
21:00. Same time every day is better than a perfect time once.

## What to write under them

**ads**

> every music player i tried was full of ads so i made my own. it plays the
> songs already on your phone, no account, works offline. free on google play
> (android only for now)
>
> #musicplayer #android #indiedev #offlinemusic #mp3

**downloads** (change the number if it has moved:
`node Branding/tiktok/render.mjs downloads --var downloads=12`)

> 7 downloads so far. it's a music player for the songs already on your phone:
> no ads, no account, works offline. free on google play (android)
>
> #indiedev #buildinpublic #android #musicplayer #appdev

**logo**

> took way too many tries to get this right. MPTree, a free offline music
> player for android. search it on google play
>
> #uidesign #animation #indiedev #android #appdesign

**ads-nl**

> elke muziekspeler die ik probeerde zat vol reclame, dus ik heb er zelf een
> gemaakt. speelt de muziek die al op je telefoon staat, geen account, werkt
> offline. gratis in de play store (alleen android)
>
> #muziek #android #app #nederland #indiedev

Then pin a comment of your own: **"it's free on google play, search MPTree"**
(or **"gratis in de play store, zoek op MPTree"**). Links in captions and
comments are not clickable, and a pinned comment is the first thing people
open when they want to find it.

## The sound

The files are silent on purpose. In TikTok's editor, tap **Add sound** and
pick one from the trending list. A trending sound is how a video reaches people
who have never heard of you: TikTok shows it to people who like that sound.

* **ads, downloads**: anything upbeat that is trending this week.
* **logo**: something calm or satisfying; the slow motion is the point.
* **ads-nl**: a Dutch trending sound, if there is one that fits.

If the account is set to a Business account, TikTok only lets it use its
Commercial Music Library. A personal account can use nearly everything in the
trending list.

## In TikTok itself

* **Cover**: pick the first frame. It already has the opening line on it.
* **Text**: none needed, it is in the video. Adding the same line again as
  TikTok text doubles it.
* **First hour**: answer every comment. Early comments, and your replies to
  them, help a post get shown to more people.

## Reels and Shorts

Upload the same files. They carry no TikTok watermark, which Instagram
quietly shows less of. On Reels pick a sound in Instagram's editor the same
way. On Shorts, the title can be the opening line.

## Reading the results

In TikTok's analytics, look at how many people are still watching after the
first two seconds, not at the view count. Views follow that number.

* **Most gone in the first two seconds**: the opening line did not land. Keep
  the rest and change the line in `cuts.mjs`.
* **They stay, then leave in the middle**: a shot is too long. Trim it.
* **They watch to the end and loop**: post that one again next week with a
  different sound.

Every comment asking for a feature is the next video. "you asked for X, so I
added it" is a format that works, and it only needs one new take.
