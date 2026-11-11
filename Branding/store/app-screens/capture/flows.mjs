const PRO = { mptree_pro: { owned: true, via: "free", since: Date.UTC(2026, 8, 20) } };
const DEV = (id) => ({ raw: { mptree_dev_account: "1" }, tab: { mptree_dev_device: id } });
const look = l => ({ ...PRO, mptree_look: { vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic", cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false, ...l } });
const LYRICS = `Streetlights lean in, one by one
The radio hums a song half done
I count the bridges, lose the thread
Static blooming in my head

Hold the night a little longer
Let the quiet pull me under
Every mile a softer sound
Static bloom, I'm homeward bound

Window down, the cold comes through
Somewhere far a train sings too
All the maps fold into one
And the morning's nearly won`;
const setRange = (n, v) => `(() => { const i = [...document.querySelectorAll('input[type=range]')].filter(__shown)[${n}]; if (!i) return "no slider"; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "${v}"); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return i.min + ".." + i.max; })()`;
const next = name => [{ tap: { label: "More options for " + name } }, { tap: { text: "Play next" }, wait: 1500 }];
const bin = name => [{ tap: { label: "More options for " + name } }, { tap: { text: "Remove from library" } }, { tap: { text: "Move to bin" }, wait: 1200 }];
const rename = `(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const m = { "Dev": "Sam", "dev@example.com": "sam@example.com", "D": "S" }; let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (m[t]) n.nodeValue = n.nodeValue.replace(t, m[t]); } })()`;
const player = [{ tap: { text: "Static Bloom" } }, { wait: 800 }, ...next("Wolves in the Hall"), ...next("Low Tide"), ...next("Midnight Drive"),
  { tap: { label: "Expand player" } }, { wait: 9000 }];

export const FLOWS = {
  main: {
    storage: PRO, lyrics: LYRICS,
    steps: [
      { shot: "01-songs" },
      ...player, { shot: "02-player" },
      { tap: { label: "Lyrics" } }, { shot: "03-lyrics" },
    ],
  },
  playlists: {
    storage: PRO,
    steps: [
      { tap: { tour: "playlists" } }, { shot: "04-playlists" },
      { tap: { text: "Late drives" } }, { shot: "05-playlist" },
    ],
  },
  menu: { storage: PRO, steps: [{ tap: { label: "More options for Paper Boats" } }, { shot: "06-song-menu" }] },
  edit: { storage: PRO, steps: [{ tap: { label: "More options for Paper Boats" } }, { tap: { text: "Edit" } }, { shot: "07-edit-song" }] },
  search: {
    storage: PRO,
    steps: [
      { tap: { css: "input" } }, { js: `(() => { const i = document.querySelector("input"); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "night"); i.dispatchEvent(new Event("input", { bubbles: true })); })()` }, { shot: "08-search" },
    ],
  },
  settings: {
    storage: PRO,
    steps: [
      { tap: { tour: "settings" } }, { shot: "09-settings" },
      { see: "Audio Effects", block: "start" }, { shot: "10-settings-audio" },
      { see: "Removed songs", block: "start" }, { shot: "11-settings-library" },
    ],
  },
  look: { storage: PRO, steps: [{ tap: { tour: "settings" } }, { tap: { text: "Personalise" } }, { shot: "12-personalise" }] },
  pro: { port: 5175, steps: [{ tap: { tour: "settings" } }, { tap: { text: "Get MPTree Pro" } }, { shot: "13-pro" }] },
  tablet: {
    storage: PRO, ...DEV("dev-b"),
    steps: [
      { js: "fetch('/__dev_drive', { method: 'POST', body: '{}' }).then(r => r.status)" },
      { js: "void window.__mptreeSync.signIn()", wait: 6000 },
      { js: "window.__mptreeSync.rename('dev-b', 'Living room tablet')", wait: 3000 },
    ],
  },
  account: {
    storage: PRO, ...DEV("dev-a"),
    steps: [
      { js: "void window.__mptreeSync.signIn()", wait: 6000 },
      { js: "window.__mptreeSync.rename('dev-a', 'My phone')", wait: 3000 },
      ...bin("Low Tide"), ...bin("Cathedral Hum"), ...bin("Nightjar"),
      { tap: { tour: "settings" } }, { tap: { text: "Account & sync" } }, { wait: 6000 }, { js: rename }, { shot: "14-account", settle: 100 },
      { tap: { label: "Close", nth: 1 } }, { see: "Removed songs" }, { tap: { text: "Removed songs" } }, { shot: "15-bin" },
    ],
  },
  light: {
    theme: "light", storage: look({ vinylLight: "white" }),
    steps: [{ shot: "16-light-songs" }, ...player, { shot: "17-light-player" }],
  },
  marble: { storage: look({ vinylDark: "marble", dark: "amoled" }), steps: [...player, { shot: "18-player-marble" }] },
};
