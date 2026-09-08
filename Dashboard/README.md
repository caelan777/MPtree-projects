# Dashboard

One page with every MPTree number on it: downloads, Play, website visitors,
comments, and the state of the closed test. Built because those numbers live in
five places that never talk to each other, so there was no single answer to
"is this working".

## How it works

Two halves, and the split is forced rather than chosen.

A published artifact cannot fetch anything. Its content security policy blocks
every outbound request, so the page physically cannot call GitHub, Cloudflare
or Google itself. So:

- **`collect.mjs` runs here.** It holds the credentials, calls every API, and
  writes `data.json`.
- **The page holds nothing.** It calls nothing and renders whatever is in its
  own small database.

Claude pushes `data.json` into that database. The upside of being forced into
this shape: no key ever leaves this machine, and the published page is safe to
open anywhere.

## Refreshing it

```bash
node Dashboard/collect.mjs
```

Then ask Claude to push it to the dashboard. That is one call, pointed straight
at `data.json`, so the numbers never pass through the chat.

The page shows the time of the last refresh, and says so plainly when that is
more than two days old. A dashboard quietly showing last week's numbers is
worse than no dashboard.

## What needs setting up

Nothing is required to get started: downloads, site health and the comment
count already work. The rest is three independent jobs, and a stall on one does
not block the others.

Copy the credentials file first:

```bash
cp Dashboard/secrets.env.example Dashboard/secrets.env
```

### 1. Cloudflare, about five minutes

Website visitor numbers and deploy history.

1. Cloudflare dashboard, **My Profile**, **API Tokens**, **Create Token**,
   **Create Custom Token**.
2. Give it two read permissions:
   - Zone, Analytics, **Read**
   - Account, Cloudflare Pages, **Read**
3. Zone Resources: include mp-tree.net. Account Resources: your account.
4. Paste the token into `secrets.env` as `CLOUDFLARE_API_TOKEN`.

The account and zone ids are already filled in, so the token never has to look
them up. Without them it would need a third permission, Zone, Zone, Read.

These are read-only permissions. The token cannot change anything, and it
cannot deploy.

### 2. Cusdis, skip it

The comment **count already works with no key at all**, and that is the part
worth having. Reading the comment text needs a project token, and Cusdis does
not show that token anywhere in its settings screen, so there is nothing to
copy. `CUSDIS_PROJECT_TOKEN` stays empty and the dashboard links straight to
the thread instead, which is one tap and shows the same thing.

The app id in the widget on the homepage is not that token. It identifies the
project publicly, which is why the count needs no authentication in the first
place.

### 3. Google Play, about thirty minutes, the fiddly one

1. **Play Console**, Setup, **API access**. Link a Google Cloud project, or let
   it create one.
2. In **Google Cloud**, that project, APIs and Services: enable the **Google
   Play Android Developer API**.
3. Still in Google Cloud, IAM, **Service Accounts**, create one. Then Keys,
   Add Key, Create new key, **JSON**. A file downloads.
4. Save that file as `Dashboard/play-service-account.json`. It is gitignored.
   Treat it like the keystore: anyone holding it can read everything about the
   app in your Play Console.
5. Back in **Play Console**, Users and permissions, invite the service account
   by its email address (it ends in `.iam.gserviceaccount.com`). Give it view
   access, and tick **Download bulk reports**.
6. Play Console, **Download reports**, Statistics. Copy the `gs://` bucket name
   shown there into `PLAY_REPORTS_BUCKET` in `secrets.env`.

Step 5 is the one people skip, and without it the install reports stay
invisible even though everything else authenticates fine.

## What the API will never give you

Not an oversight, these have no path at all:

- **Closed test opt-ins, and how many of the fourteen days have passed.** No
  Google API exposes either. They exist only in the Play Console screen. Type
  them into the dashboard; it does the counting from there.
- **Instagram, TikTok and X followers.** Instagram needs a Business account
  plus a Meta app, X's cheapest API tier is a hundred dollars a month, and
  TikTok's API is built for posting rather than reading your own numbers. Typed
  in, stamped with the date, so an old number looks old.
- **Gmail.** Would need its own OAuth app. The feedback address is a link.

## Files

| Path | Role |
|---|---|
| `collect.mjs` | Runs every source, writes `data.json` |
| `sources/github.mjs` | Release download counts, commits. No setup |
| `sources/site.mjs` | Live `version.json` against `versions.js`. No setup |
| `sources/cloudflare.mjs` | Zone analytics and Pages deploys. Needs a token |
| `sources/play.mjs` | Reviews, and installs from the reports bucket |
| `sources/cusdis.mjs` | Comment count. Count needs no key |
| `dashboard.html` | The page itself, published as an artifact |
| `secrets.env` | Credentials. Gitignored |
| `data.json` | Output. Gitignored |

No shared abstraction between the sources on purpose. Five APIs with five
different authentication schemes have nothing real in common, and a base class
here would be the premature abstraction `CLAUDE.md` warns off.

## A note on privacy

The website numbers are read from Cloudflare's own edge counts. No tracking
script was added to the site, no cookie is set, and no visitor's browser makes
a request to anything extra. That was a deliberate choice over Cloudflare's Web
Analytics product, which gives per page paths but only by loading a beacon from
a tracking host on every visit. The privacy page was updated to say what is
counted, in the same breath as the app's promise that it collects nothing.
