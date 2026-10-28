import type { CSSProperties } from "react";
import type { T } from "../themes";

// The floating card every choice comes up in: the selection's actions, the
// "⋮" menu, a new playlist, and every "are you sure?". Kept apart from the
// components that use it, so each of those files exports components only.

/** The card itself. Placed by the caller. */
export function floatCard(T: T): CSSProperties {
  return {
    background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 24,
    boxShadow: "0 10px 36px rgba(0,0,0,0.35)", boxSizing: "border-box",
  };
}

/** The round grey button a card is closed with. */
export function roundBtn(T: T): CSSProperties {
  return {
    width: 40, height: 40, borderRadius: "50%", border: "none", background: T.dim, color: T.text,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0,
  };
}
