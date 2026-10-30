# Discover: legal free-music sources

Research for an "Ontdekken" (Discover) page in the Android app: browse and search legally
free music, preview it, tap Download, and the mp3 lands in `Music/MPTree` so it shows up in
Songs. Researched on 2026-10-30.

**Ground rules for this page**

* MPTree is **commercial**: it sells Pro (EUR 2.99) and shows rewarded ads. Several
  sources define "commercial" to include ad revenue, so any "free for non-commercial use"
  API is out unless we make a deal.
* We only download files the source **offers for download**. No YouTube, no stream
  ripping, no scraping, no re-hosting. If a source only gives a stream, it is out.
* The **licence of the music** and the **terms of the API** are two separate questions.
  A CC BY song can still sit behind an API that forbids commercial apps.

**How this was checked.** The session's network blocked direct page fetches for most of
these hosts, so every row below comes from current web search results that quote the
official docs and terms pages (linked). Before building, open the two recommended terms
pages once yourself and confirm; that is a 10 minute job.

## Summary table

| Source | Public API | Key / approval | Real download URL | Music licence | Commercial app (Pro + ads) | Verdict |
|---|---|---|---|---|---|---|
| **Audius** | Yes, REST + JS SDK | Free API key from the plans page; key is safe in client code. Free tier 10 req/s, 500,000 req/month | Yes: `GET /v1/tracks/:id/download`, only for tracks whose artist turned downloads on | Audius Open Music License (OML, 2 Jul 2025): music players get a worldwide, royalty-free licence. Artists can opt out of API access | **Allowed** for a music player under the OML; check the attribution clause (OML 1.5) and the API Terms text | **Start here** |
| **Internet Archive** (netlabels, Live Music Archive) | Yes: `advancedsearch.php` + item metadata, no key | None | Yes, direct file URLs per item | Per item, in the `licenseurl` field. Uploader sets it; default for many items is non-commercial. LMA (etree) is "taping allowed" for trading, which is non-commercial | Only items with CC BY, CC BY-SA, CC0 or Public Domain Mark in `licenseurl`. Filter in the query | **Second source**, filtered |
| **ccMixter** | Yes, open Query API (`ccmixter.org/api/query`) | None | Yes, mp3 per upload | Mixed. Has a "free for commercial use" filter (CC BY, CC0). Many uploads are NC; "Sampling" licences forbid use in advertising | Only the commercial filter. Fine with attribution | Good backup, small (about 65k files), mostly remixes |
| **Jamendo** (API v3) | Yes | Free client id, but terms say free use is **non-commercial only**. Commercial use (explicitly incl. ad revenue) needs a paid quote. Non-commercial cap about 35,000 req/month | Yes, `audiodownload`, empty when the artist disallows downloads (`audiodownload_allowed`) | CC (mostly BY-NC-SA / BY-NC-ND) | **Not without a deal.** Jamendo also says using its music for commercial activity needs a commercial licence | Best catalogue, but needs a paid agreement. Ask for a quote later |
| **Wikimedia Commons** (incl. Musopen uploads) | Yes, MediaWiki API, no key (send a proper User-Agent) | None | Yes, file URLs (mostly .ogg / .oga, some .mp3) | Per file, mostly PD and CC BY / BY-SA; Musopen recordings are Public Domain Mark | Allowed for PD / BY / BY-SA files | Nice "Classical" shelf. Needs ogg to mp3, or play ogg as is |
| **Musopen** | No public API | n/a | Website only; unlimited/FLAC is paid | Public domain recordings | PD itself is fine, but no API. Use its uploads on Commons instead | Via Commons only |
| **Free Music Archive** | No working public API found. Owned by Tribe of Noise since 2019, platform still "being rebuilt" (FMA NEXT, no date) | n/a | Website only | Per track, mixed | n/a | Out for now |
| **SoundCloud** | Yes, but registering an app now needs an **Artist Pro** subscription | Paid account + app review | No documented download endpoint; API Terms forbid ripping or copying user content | All rights reserved by default | No | **Out** |
| **Bandcamp** | **No public API.** The old one was shut and its docs removed; only private/partner APIs | n/a | Only through the site / purchases | Mostly all rights reserved | No | **Out** (scraping would break our rule) |
| **Pixabay Music** | Official API covers images and video; no confirmed official music endpoint (only third-party wrappers) | Free key | Not via the official API | Pixabay Content Licence, commercial OK, but it forbids distributing the files on their own | Distributing tracks to users is exactly what the licence forbids | **Out** |
| **Incompetech** (Kevin MacLeod) | No API | n/a | Per track on the site | CC BY 4.0 (or a paid no-credit licence) | Allowed with credit | Could be a small hand-picked shelf later. Not worth an integration now |
| **Openverse** (WordPress) | Yes, aggregator of CC audio (Jamendo, Wikimedia, Freesound, ...) with `license_type=commercial` filter; anonymous at low limits | Optional free token | Links to the source file; for Jamendo items that hits Jamendo's terms again | Per item | Usable for search, but each item inherits its source's terms | Not as a primary source; maybe later as search glue |

## Recommendation

**Start with Audius, add Internet Archive second.**

1. **Audius** is the only big catalogue where three things line up: a free API that is
   meant for third-party players, a real download endpoint that only works when the
   artist chose to allow downloads, and a licence (the OML) that explicitly covers music
   players and is royalty-free. The catalogue is current and broad (electronic, hip hop,
   lo-fi, pop), so the page will not feel like a museum. Downloads are a subset of the
   catalogue, so the app should only show tracks that are downloadable, or mark the others
   "Preview only".
   *To confirm before building:* the attribution clause (OML section 1.5) and the API
   Terms text on commercial apps. If either needs a deal, write to `api@audius.co`.

2. **Internet Archive** fills it out with no key and no deal: netlabel releases and
   public-domain recordings, filtered to `licenseurl` CC BY / BY-SA / CC0 / PD. It is
   slower and its metadata is messy, so treat it as one shelf ("From the Internet
   Archive"), not the main feed. Leave the Live Music Archive out: its permission is for
   non-commercial trading.

**Later, if the page works:** ask Jamendo for a commercial quote (best-curated free
catalogue, and their CC music is what most people mean by "free music"), and add a
Classical shelf from Wikimedia Commons (Musopen recordings, public domain).

**Rules the app should follow for every source**

* Save the file with its licence and source in the tags (artist, title, `COMMENT` =
  licence + source URL), and keep the same fields in the app's own metadata, so the
  credit travels with the song even after a backup and restore.
* Show artist, licence and source on the row and in a details sheet. CC BY needs the
  name of the artist, the title, the licence and a link.
* Never show NC tracks. The filter happens in the query, and again in the app as a check.
* Respect each API's rate limit with one request per screen, not per row. Cache genres
  and featured lists for a day.

## Sources

* Jamendo API terms: <https://devportal.jamendo.com/api_terms_of_use>, help centre:
  <https://help-licensing.jamendo.com/hc/en-us/articles/20699346005661-Jamendo-API>,
  track fields: <https://developer.jamendo.com/v3.0/tracks/file>, rate limit noted in
  <https://github.com/WordPress/openverse/issues/1763>
* Audius download endpoint: <https://docs.audius.org/developers/api/download-track>,
  SDK and plans: <https://docs.audius.org/sdk>, Open Music License:
  <https://audius.org/open-music-license.pdf>, terms update:
  <https://blog.audius.co/posts/audius-terms-of-service-update>, terms of use:
  <https://audius.co/documents/TermsOfUse.pdf>
* Internet Archive rights: <https://help.archive.org/help/rights/>, terms update:
  <https://blog.archive.org/2014/12/30/update-to-terms-of-use/>
* ccMixter: <https://ccmixter.org/about>, <https://github.com/WordPress/openverse/issues/1770>
* Free Music Archive: <https://freemusicarchive.org/about/>, <https://artist.tribeofnoise.com/fma>
* SoundCloud: <https://developers.soundcloud.com/docs/api/register-app>,
  <https://developers.soundcloud.com/docs/api/terms-of-use>
* Bandcamp (no public API): <https://github.com/kristoferjoseph/bandcamp-scraper>,
  <https://awesome.ecosyste.ms/projects/github.com%2Fmichaelherger%2Fbandcamp-api>
* Incompetech: <https://wiki.creativecommons.org/Case_Studies/Kevin_MacLeod>
* Openverse: <https://jentic.com/apis/openverse.org/openverse>
