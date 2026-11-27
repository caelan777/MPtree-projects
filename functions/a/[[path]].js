// The app's anonymous counter. The apps call /a/<platform>/<event>, for
// example /a/android/open, and get an empty answer. Nothing is stored here:
// Cloudflare's own traffic numbers count the requests per path, day and
// country, and Dashboard/collect.mjs reads them from there. No id, no cookie,
// nothing about the person or their songs is sent.
//
// Events: open (once a day per phone), tab-songs, tab-playlists (once a day
// each), pro-open, pro-buy, ad-start, ad-done.

export function onRequest() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
