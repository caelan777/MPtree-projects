import type { CSSProperties } from "react";
import bodyUrl from "./assets/lantern-figure-body.webp";
import glowUrl from "./assets/lantern-figure-glow.webp";
import groundDarkUrl from "./assets/lantern-ground-dark.webp";
import groundLightUrl from "./assets/lantern-ground-light.webp";

// ─── THE FIGURE ──────────────────────────────────────────────────────────────
// A man in the dark, seen from the chest up, with green light on his
// shoulders: Caelan's photo (Branding/lantern/figure-source.jpg), blurred hard
// so that only a vague shape and the light are left. He stands behind
// Lantern: on the question the first time ("Are you afraid?"), and behind the
// list while the style is on. scripts/lantern-figure.mjs makes the pictures
// imported above from it.
//
// Two layers for the question, so the light can swell with the voice: the
// figure (`body`) and the green light on it (`light`). Behind the list, one
// picture: as he is on a dark app, as a faint grey mist with the green on it
// on a light one.

/** The two layers, for the question: the figure, and the light on it. */
export function lanternFigure(): { body: string; light: string } {
  return { body: bodyUrl, light: glowUrl };
}

/** Width over height, for laying the pictures out. */
export const FIGURE_RATIO = 600 / 560;

/** The figure behind the app while Lantern is on: in the middle, a little
 *  below the header, as wide as a phone at most. It is the shell's own
 *  background, so the list scrolls over it and it stays where it is. */
export function lanternBackdrop(dark: boolean): CSSProperties {
  return {
    backgroundImage: `url("${dark ? groundDarkUrl : groundLightUrl}")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center 60%",
    backgroundSize: "min(112vw, 640px) auto",
  };
}
