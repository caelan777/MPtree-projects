// Screens for the in-app Get music film (brag-output/work/getmusic-film.js),
// white, as MPTree opens now. Needs the dev server in Play mode on :5176.
//   node shots.mjs <project root> flows-getmusic-film.mjs ../shots-getmusic-film
const PORT = 5176;
const SEEN = { mptree_getmusic_seen: "1" };

export const FLOWS = {
  list: { port: PORT, theme: "light", storage: SEEN, steps: [{ wait: 1200 }, { shot: "list" }] },
  page: {
    port: PORT, theme: "light", storage: SEEN,
    steps: [{ tap: { tour: "plus" } }, { wait: 900 }, { shot: "page" }],
  },
  // The list once the downloaded song is in: the newest song (demo://0) becomes
  // the film's made-up "Morning Light", wearing the store page's grey record.
  newsong: {
    port: PORT, theme: "light", storage: SEEN,
    steps: [{ js: `(() => {
      const c = document.createElement("canvas"); c.width = c.height = 320; const g = c.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 320, 320); gr.addColorStop(0, "#ececef"); gr.addColorStop(1, "#d3d3d8");
      g.fillStyle = gr; g.fillRect(0, 0, 320, 320);
      const ring = (r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(160, 160, r, 0, Math.PI * 2); g.fill(); };
      ring(98, "#b8b8be");
      g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1.2;
      for (let r = 45; r < 94; r += 8) { g.beginPath(); g.arc(160, 160, r, 0, Math.PI * 2); g.stroke(); }
      ring(31, "#ececef"); ring(4, "#b8b8be");
      const k = "CapacitorStorage.mptree_meta", m = JSON.parse(localStorage.getItem(k));
      m["demo://0"] = { ...m["demo://0"], customName: "Morning Light", customArtist: "Sola Field", customPhoto: c.toDataURL("image/jpeg", 0.9) };
      localStorage.setItem(k, JSON.stringify(m));
      setTimeout(() => location.reload(), 50);
      return 1;
    })()`, wait: 4500 }, { shot: "newsong" }],
  },
  // The one-off pointer at the +, for people who had MPTree before.
  tip: { port: PORT, theme: "light", storage: {}, steps: [{ wait: 3200 }, { shot: "tip" }] },
};
