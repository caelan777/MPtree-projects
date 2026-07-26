import { useEffect, useRef } from "react";
import type { T } from "../themes";

// ─── TOAST ───────────────────────────────────────────────────────────────────
// Supports an optional action button (e.g. "Undo"). When an action is present
// the toast stays visible a little longer so the user has time to tap it.
//
// The dismiss timer is armed once per toast (keyed on the message + whether it
// has an action) and is NOT re-armed on every parent re-render. This matters:
// while a song plays the app re-renders every second, and if the timer reset
// on each render the toast would never auto-dismiss. `onDone` is read through a
// ref so those re-renders can't restart the countdown.

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function Toast({
  msg,
  onDone,
  action,
  T,
}: {
  msg: string;
  onDone: () => void;
  action?: ToastAction;
  T: T;
}) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const hasAction = !!action;
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), hasAction ? 4200 : 2600);
    return () => clearTimeout(t);
    // Deliberately keyed only on the toast's identity, not on `onDone`.
  }, [msg, hasAction]);

  return (
    <div style={{
      position: "fixed", bottom: 170, left: "50%", transform: "translateX(-50%)",
      background: T.sheetBg, border: `1px solid ${T.border}`, borderRadius: 22,
      padding: action ? "8px 8px 8px 22px" : "10px 22px", color: T.text, fontSize: 13, fontWeight: "600",
      zIndex: 500, whiteSpace: "nowrap", boxShadow: "0 6px 28px rgba(0,0,0,0.3)",
      display: "flex", alignItems: "center", gap: 14, maxWidth: "90vw",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{msg}</span>
      {action && (
        <button
          onClick={() => { action.onClick(); onDoneRef.current(); }}
          style={{
            background: T.violet, border: "none", color: "#fff", borderRadius: 16,
            padding: "6px 16px", fontSize: 13, fontWeight: "700", cursor: "pointer",
            fontFamily: "inherit", flexShrink: 0,
          }}>
          {action.label}
        </button>
      )}
    </div>
  );
}