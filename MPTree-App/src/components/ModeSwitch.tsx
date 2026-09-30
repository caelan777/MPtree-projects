import { useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { useSync, setMode, type Mode } from "../sync/engine";

// ─── WHICH LIBRARY ───────────────────────────────────────────────────────────
// Signed in to an MPTree account there are two libraries: This device, which
// is this phone's own, and All devices, which every phone on the account
// shares (sync/engine.ts). The switch sits in the header card and at the top
// of Settings; a page that changes something says which one it changes.

export const PhoneIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2" width="12" height="20" rx="2.5" /><line x1="11" y1="18" x2="13" y2="18" />
  </svg>
);

export const DevicesIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="10" height="16" rx="2" /><rect x="14" y="7" width="8" height="13" rx="2" />
  </svg>
);

export function ModeSwitch({ T, onSwitched }: { T: T; onSwitched?: (m: Mode) => void }) {
  const s = useSync();
  const [busy, setBusy] = useState<Mode | null>(null);
  if (s.phase !== "on" || s.pausedNoPro) return null;
  const pick = async (m: Mode) => {
    if (busy || m === s.mode) return;
    setBusy(m);
    try { await setMode(m); onSwitched?.(m); } finally { setBusy(null); }
  };
  const opts: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "device", label: t("This device"), icon: <PhoneIcon /> },
    { id: "all", label: t("All devices"), icon: <DevicesIcon /> },
  ];
  return (
    <div role="radiogroup" aria-label={t("Which library")}
      style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 12, padding: 3, border: `1px solid ${T.border}` }}>
      {opts.map(o => {
        const on = (busy ?? s.mode) === o.id;
        return (
          <button key={o.id} role="radio" aria-checked={on} onClick={() => pick(o.id)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              padding: "7px 8px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap",
              background: on ? T.accent : "transparent", color: on ? T.playBtnFg : T.muted,
              transition: "background 0.2s, color 0.2s",
            }}>
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/** One line saying which library a page changes. Nothing when signed out. */
export function ModeNote({ T, style }: { T: T; style?: React.CSSProperties }) {
  const s = useSync();
  if (s.phase !== "on" || s.pausedNoPro) return null;
  const all = s.mode === "all";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 11,
      background: all ? T.accent : T.dim, color: all ? T.playBtnFg : T.textSub,
      fontSize: 12.5, lineHeight: 1.4, ...style,
    }}>
      <span style={{ display: "flex", flexShrink: 0 }}>{all ? <DevicesIcon /> : <PhoneIcon />}</span>
      <span>
        <b>{all ? t("All devices") : t("This device")}</b>
        {" · "}
        {all ? t("What you change here changes on all your devices.") : t("Only this device. Your other devices do not see it.")}
      </span>
    </div>
  );
}
