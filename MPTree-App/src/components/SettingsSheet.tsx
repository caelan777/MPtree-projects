import { useState, useEffect, useRef } from "react";
import { makeSH, type T } from "../themes";
import type { Theme } from "../types";
import { IC } from "./Icons";

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

type SettingsSheetProps = {
  url: string;
  theme: Theme;
  binCount: number;
  onSave: (u: string) => void;
  onToggleTheme: () => void;
  onViewBin: () => void;
  onOpenAudioEffects: () => void;
  /** Re-runs the first-launch spotlight tour. */
  onShowTutorial: () => void;
  /** Opens the pre-export info sheet */
  onExport: () => void;
  /** Opens the pre-import info sheet */
  onImportOpen: () => void;
  /** Opens the support/tip page in the browser. */
  onSupport: () => void;
  // ── Sleep timer ──
  /** Absolute epoch-ms deadline for a fixed-clock sleep timer, or null. */
  sleepUntil: number | null;
  /** True when the timer is armed to pause at the end of the current track. */
  sleepEndOfTrack: boolean;
  /** Whether a song is loaded (enables the "end of track" option). */
  hasCurrentSong: boolean;
  onSetSleepTimer: (minutes: number | "endOfTrack" | null) => void;
  onClose: () => void;
  T: T;
};

export function SettingsSheet({
  url, theme, binCount,
  onSave, onToggleTheme, onViewBin, onOpenAudioEffects, onShowTutorial,
  onExport, onImportOpen, onSupport,
  sleepUntil, sleepEndOfTrack, hasCurrentSong, onSetSleepTimer,
  onClose, T,
}: SettingsSheetProps) {
  const [val, setVal] = useState(url);
  const sh = makeSH(T);

  // Live remaining-time label for an active fixed-clock timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleepUntil == null) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [sleepUntil]);

  // ── Swipe-down-to-dismiss ─────────────────────────────────────────────────
  // Drag the handle / header downward to close, in addition to the ✕ button
  // and tapping the dimmed backdrop. The sheet follows the finger and commits
  // to closing once dragged past a threshold; otherwise it springs back.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const CLOSE_THRESHOLD = 90;

  const onDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, dy));
  };
  const onDragEnd = () => {
    if (dragY > CLOSE_THRESHOLD) { onClose(); return; }
    dragStartY.current = null;
    setDragging(false);
    setDragY(0);
  };

  const sleepActive = sleepUntil != null || sleepEndOfTrack;
  const remainingMs = sleepUntil != null ? Math.max(0, sleepUntil - now) : 0;
  const remainingLabel = (() => {
    if (sleepEndOfTrack) return "End of track";
    if (sleepUntil == null) return "Off";
    const totalSec = Math.round(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  })();

  const SLEEP_PRESETS = [15, 30, 45, 60];

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div
        style={{
          ...sh.sheet, paddingBottom: 0, maxHeight: "75vh", display: "flex", flexDirection: "column",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s ease",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + header act as the drag-to-dismiss grip. */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragEnd}
          style={{ flexShrink: 0 }}
        >
          <div style={{ ...sh.handle }} />
          <div style={{ ...sh.hdr }}>
            <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Settings</span>
            <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingBottom: 32, WebkitOverflowScrolling: "touch" }}>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Appearance</div>
          <button onClick={onToggleTheme} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              {theme === "dark" ? <IC.Moon /> : <IC.Sun />}
              <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
            </div>
            <div style={{ width: 46, height: 26, borderRadius: 13, background: theme === "light" ? T.accent : T.border, position: "relative", transition: "background 0.25s" }}>
              <div style={{ position: "absolute", top: 3, left: theme === "light" ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
            </div>
          </button>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Audio</div>
          <button onClick={onOpenAudioEffects} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <IC.EQ /><span>Audio Effects</span>
            </div>
            <IC.ChevronR />
          </button>
          <button onClick={onShowTutorial} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 8, background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text, fontFamily: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Show Tutorial</span>
            </div>
            <IC.ChevronR />
          </button>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Sleep Timer</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SLEEP_PRESETS.map(min => (
              <button
                key={min}
                onClick={() => onSetSleepTimer(min)}
                style={{
                  flex: "1 1 0", minWidth: 60, padding: "10px 0", borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  background: T.dim,
                  color: T.text, fontSize: 14, fontWeight: "600", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {min}m
              </button>
            ))}
          </div>
          <button
            onClick={() => onSetSleepTimer("endOfTrack")}
            disabled={!hasCurrentSong}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", marginTop: 8,
              background: sleepEndOfTrack ? T.dim : T.dim,
              border: `1px solid ${sleepEndOfTrack ? T.accent : "transparent"}`,
              borderRadius: 12, padding: "14px 16px",
              cursor: hasCurrentSong ? "pointer" : "default",
              opacity: hasCurrentSong ? 1 : 0.5,
              color: T.text, fontFamily: "inherit", fontSize: 15,
            }}
          >
            <span>Stop at end of track</span>
            {sleepEndOfTrack && IC.Check(T.text)}
          </button>

          {sleepActive && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "12px 16px", background: T.dim, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 14, color: T.text }}>
                Pausing in <strong style={{ color: T.text }}>{remainingLabel}</strong>
              </span>
              <button
                onClick={() => onSetSleepTimer(null)}
                style={{ background: "transparent", border: "none", color: T.muted, fontSize: 13, fontWeight: "700", cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Library</div>
          <button onClick={() => { onClose(); onViewBin(); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <IC.Bin /><span>Removed songs</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {binCount > 0 && (
                <span style={{ background: T.heart, color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: "700" }}>{binCount}</span>
              )}
              <IC.ChevronR />
            </div>
          </button>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Backup &amp; Restore</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => { onClose(); onExport(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <DownloadIcon /><span>Export backup</span>
              </div>
              <IC.ChevronR />
            </button>
            <button
              onClick={() => { onClose(); onImportOpen(); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                <UploadIcon /><span>Restore backup</span>
              </div>
              <IC.ChevronR />
            </button>
          </div>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Download URL</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, lineHeight: 1.5 }}>
            Opened when you tap +. Leave blank to disable.
          </div>
          <input value={val} onChange={e => setVal(e.target.value)} placeholder="https://…" style={sh.inp} autoCapitalize="none" autoCorrect="off" />
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          <button onClick={() => { onSave(val.trim()); onClose(); }} style={sh.saveBtn}>Save</button>
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          <div style={sh.lbl}>Support</div>
          <button onClick={onSupport} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text, fontFamily: "inherit" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
              </svg>
              <span>Buy me a coffee</span>
            </div>
            <IC.ChevronR />
          </button>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
            MPTree is free. If it is useful to you, you can chip in.
          </div>
        </div>

        <div style={{ padding: "14px 20px 0", color: T.muted, fontSize: 12 }}>MPTree 0.1.0</div>

        </div>
      </div>
    </div>
  );
}