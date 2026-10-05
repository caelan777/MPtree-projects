import type { T } from "../themes";

/**
 * The on/off pill used in Settings, the logo's panel and the Bluetooth sheet.
 * Drawn only; the row around it is the button, so the whole row is the target.
 *
 * The knob takes the colour that sits on the accent (TH.playBtnFg). It used to
 * be plain white, which on the dark theme put a white knob on a white track:
 * the switch read as a blank bar whenever it was on.
 */
export function Switch({ on, T, disabled }: { on: boolean; T: T; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 46, height: 26, borderRadius: 13, flexShrink: 0, position: "relative",
        background: on ? T.accent : T.border, opacity: disabled ? 0.4 : 1,
        transition: "background 0.25s, opacity 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%",
        background: on ? T.playBtnFg : "#fff", transition: "left 0.2s, background 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </span>
  );
}
