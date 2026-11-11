// The phones in "How it looks" on mp-tree.net, as MPTree 1.4.0 looks, light; was dark like
// the site. Needs the fixes-137 code in Play mode on :5177 (launch config
// "mptree-140-shots").
//   node shots.mjs <project root> flows-site-1.4.0.mjs ../shots-site-1.4.0
const PORT = 5177;
const SEEN = { mptree_music_hint: "done", mptree_getmusic_seen: "1" };
const next = name => [{ tap: { label: "More options for " + name } }, { tap: { text: "Play next" }, wait: 1500 }];

export const FLOWS = {
  songs: { port: PORT, theme: "light", storage: SEEN, steps: [{ wait: 1500 }, { shot: "songs" }] },
  player: {
    port: PORT, theme: "light", storage: SEEN,
    steps: [{ tap: { text: "Static Bloom" } }, { wait: 1200 }, { dump: "after-play" },
      { tap: { label: "Expand player" } }, { wait: 6000 }, { shot: "player" }],
  },
  discover: {
    port: PORT, theme: "light", storage: SEEN,
    steps: [{ wait: 1200 }, { tap: { label: "Discover" } }, { wait: 9000 }, { shot: "discover" }],
  },
  playlists: {
    port: PORT, theme: "light", storage: SEEN,
    steps: [{ tap: { tour: "playlists" } }, { wait: 1200 }, { shot: "playlists" }],
  },
};
