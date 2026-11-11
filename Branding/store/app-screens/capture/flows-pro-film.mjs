// Screens for the in-app Pro film (brag-output/work/pro-film.js), white, as
// MPTree opens now. Needs the dev server in Play mode on :5176.
//   node shots.mjs <project root> flows-pro-film.mjs ../shots-pro-film
const PORT = 5176;
const PRO = { mptree_pro: { owned: true, via: "play", since: Date.UTC(2026, 8, 20) } };
const look = l => ({ ...PRO, mptree_look: {
  vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic", cardDark: "default", cardLight: "default",
  icon: "classic", photoDisc: false, flowers: "none",
  aviela: { record: "lily", flowers: "sprig", card: "light:classic" },
  lantern: { record: "lantern", card: "dark:lantern", colour: "light:paper" }, ...l } });
const list = (name, l) => ({ port: PORT, theme: "light", storage: look(l), steps: [{ wait: 1200 }, { shot: name }] });

export const FLOWS = {
  white:   list("white", {}),
  paper:   list("paper", { light: "paper" }),
  sage:    list("sage", { light: "sage" }),
  card:    list("card", { cardLight: "dark:classic" }),
  aviela:  list("aviela", { light: "pink", vinylLight: "lily", flowers: "sprig", cardLight: "light:classic" }),
  lantern: list("lantern", { light: "paper", vinylLight: "lantern", cardLight: "dark:lantern" }),
  cleanup: {
    port: PORT, theme: "light", storage: look({}),
    steps: [
      { tap: { tour: "settings" } }, { see: "Clean up non-songs", block: "center" }, { shot: "cleanup-row" },
      { tap: { text: "Clean up non-songs" } }, { wait: 900 }, { shot: "cleanup-sheet" },
    ],
  },
};
