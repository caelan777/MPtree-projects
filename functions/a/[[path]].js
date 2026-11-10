// The app's anonymous counter. The apps call /a/<platform>/<event>, for
// example /a/android/open, and get an empty answer. Nothing is stored here:
// Cloudflare's own traffic numbers count the requests per path, day and
// country, and they are read from Cloudflare's analytics API (the dashboard
// does not yet). No id, no cookie,
// nothing about the person or their songs is sent.
//
// Events: open (once a day per phone), tab-songs, tab-playlists, discover
// (once a day each), discover-play, discover-download, pro-open, pro-buy,
// ad-start, ad-done, ad-missing (no ad, so the day came without one).

export function onRequest() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
