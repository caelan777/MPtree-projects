// The app screens for the 1.2.8 Play screenshots (style C: Offline, Yours, Free,
// Everywhere). White, as MPTree opens now. Needs the dev server in Play mode on
// :5176 (launch config "mptree-play-shots"), with the ad card switched on for the
// browser, which only the capture does.
//   node shots.mjs <project root> flows-1.2.8.mjs ../shots-1.2.8
const PORT = 5176;
const PRO = { mptree_pro: { owned: true, via: "play", since: Date.UTC(2026, 8, 20) } };
const DEV = (id) => ({ raw: { mptree_dev_account: "1" }, tab: { mptree_dev_device: id } });
const look = l => ({ ...PRO, mptree_look: { vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic", cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false, ...l } });
const next = name => [{ tap: { label: "More options for " + name } }, { tap: { text: "Play next" }, wait: 1500 }];
const rename = `(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const m = { "Dev": "Sam", "D": "S", "Signed in as dev@example.com": "Signed in as sam@example.com" }; let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (m[t]) n.nodeValue = n.nodeValue.replace(t, m[t]); } })()`;
const player = [{ tap: { text: "Static Bloom" } }, { wait: 800 }, ...next("Wolves in the Hall"), ...next("Low Tide"), ...next("Midnight Drive"),
  { tap: { label: "Expand player" } }, { wait: 9000 }];

export const FLOWS = {
  offline: { port: PORT, theme: "light", storage: look({}), steps: [{ shot: "offline" }] },
  yours: { port: PORT, theme: "light", storage: look({ vinylLight: "white" }), steps: [...player, { shot: "yours" }] },
  tablet: {
    port: PORT, theme: "light", storage: look({}), ...DEV("dev-b"),
    steps: [
      { js: "fetch('/__dev_drive', { method: 'POST', body: '{}' }).then(r => r.status)" },
      { js: "void window.__mptreeSync.signIn()", wait: 6000 },
      { js: "window.__mptreeSync.rename('dev-b', 'Tablet')", wait: 3000 },
    ],
  },
  everywhere: {
    port: PORT, theme: "light", storage: look({}), ...DEV("dev-a"),
    steps: [
      { js: "void window.__mptreeSync.signIn()", wait: 6000 },
      { js: "window.__mptreeSync.rename('dev-a', 'My phone')", wait: 3000 },
      { tap: { tour: "settings" } }, { tap: { text: "Account & sync" } }, { wait: 6000 }, { js: rename }, { shot: "everywhere", settle: 300 },
    ],
  },
  free: {
    port: PORT, theme: "light", storage: {}, ...DEV("dev-c"),
    steps: [
      { js: "fetch('/__dev_drive', { method: 'POST', body: '{}' }).then(r => r.status)" },
      { js: "void window.__mptreeSync.signIn()", wait: 6000 },
      { tap: { tour: "settings" } }, { tap: { text: "Get MPTree Pro" } }, { wait: 800 }, { shot: "free" },
    ],
  },
};
