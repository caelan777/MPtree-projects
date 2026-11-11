// The Songs page in eight looks, for the colours carousel (see build.mjs).
//   node ../../store/app-screens/capture/shots.mjs <root> flows.mjs screens
const PRO = { mptree_pro: { owned: true, via: "free", since: Date.UTC(2026, 8, 20) } };
const look = l => ({ ...PRO, mptree_look: { vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic", cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false, ...l } });
// A song playing, so the player is part of the picture.
const playing = [{ tap: { text: "Static Bloom" } }, { wait: 2500 }];
const light = (name, l) => ({ theme: "light", storage: look(l), steps: [...playing, { shot: name }] });
const dark = (name, l) => ({ storage: look(l), steps: [...playing, { shot: name }] });

export const FLOWS = {
  pink:       light("pink", { light: "pink" }),
  pinkBlack:  light("pink-black", { light: "pink", cardLight: "dark:amoled" }),
  sage:       light("sage", { light: "sage" }),
  sageDark:   light("sage-graphite", { light: "sage", cardLight: "dark:graphite" }),
  paper:      light("paper", { light: "paper" }),
  stoneDark:  light("stone-black", { light: "stone", cardLight: "dark:classic" }),
  amoled:     dark("amoled", { dark: "amoled" }),
  amoledPink: dark("amoled-pink", { dark: "amoled", cardDark: "light:pink" }),
  graphSage:  dark("graphite-sage", { dark: "graphite", cardDark: "light:sage" }),
  pinkGraph:  light("pink-graphite", { light: "pink", cardLight: "dark:graphite" }),
  sageBlack:  light("sage-black", { light: "sage", cardLight: "dark:amoled" }),
  paperBlack: light("paper-black", { light: "paper", cardLight: "dark:amoled" }),
  stone:      light("stone", { light: "stone" }),
  amoledPaper: dark("amoled-paper", { dark: "amoled", cardDark: "light:paper" }),
  amoledSage: dark("amoled-sage", { dark: "amoled", cardDark: "light:sage" }),
  graphPink:  dark("graphite-pink", { dark: "graphite", cardDark: "light:pink" }),
  graphStone: dark("graphite-stone", { dark: "graphite", cardDark: "light:stone" }),
  graphite:   dark("graphite", { dark: "graphite" }),
};
