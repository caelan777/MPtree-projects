import React, { useState, useCallback } from "react";
import type { T } from "../themes";

interface EqInfo {
  available: boolean;
  bandFreqsHz: number[];
  minMillibel: number;
  maxMillibel: number;
}

interface Props {
  eqInfo:            EqInfo | null;
  eqEnabled:         boolean;
  bandLevels:        number[];
  crossfadeMs:       number;
  onToggleEnabled:   (enabled: boolean) => void;
  onLevelsChange:    (levels: number[]) => void;
  onCrossfadeChange: (ms: number) => void;
  onClose:           () => void;
  T: T;
}

function fmtHz(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

function fmtCrossfade(ms: number): string {
  if (ms === 0) return "Off";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")}s`;
}

const CROSSFADE_STOPS = [0, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000];

// ─── Equalizer presets ────────────────────────────────────────────────────────
// Presets are defined as gain curves over the audible range keyed by frequency
// (Hz → dB). Because different devices expose different numbers of bands at
// different center frequencies, we don't hardcode per-band values — instead we
// sample each preset's curve at whatever center frequencies the device reports
// (interpolating between control points). That makes every preset work on any
// device's equalizer.
type PresetPoint = { hz: number; db: number };
interface EqPreset { name: string; curve: PresetPoint[]; }

const EQ_PRESETS: EqPreset[] = [
  { name: "Flat",      curve: [{ hz: 60, db: 0 }, { hz: 16000, db: 0 }] },
  { name: "Rock",      curve: [{ hz: 60, db: 5 }, { hz: 230, db: 3 }, { hz: 910, db: -1 }, { hz: 3600, db: 3 }, { hz: 14000, db: 5 }] },
  { name: "Pop",       curve: [{ hz: 60, db: -1 }, { hz: 230, db: 3 }, { hz: 910, db: 5 }, { hz: 3600, db: 2 }, { hz: 14000, db: -1 }] },
  { name: "Bass",      curve: [{ hz: 60, db: 7 }, { hz: 230, db: 4 }, { hz: 910, db: 0 }, { hz: 3600, db: 0 }, { hz: 14000, db: 0 }] },
  { name: "Treble",    curve: [{ hz: 60, db: 0 }, { hz: 230, db: 0 }, { hz: 910, db: 0 }, { hz: 3600, db: 4 }, { hz: 14000, db: 7 }] },
  { name: "Vocal",     curve: [{ hz: 60, db: -2 }, { hz: 230, db: 0 }, { hz: 910, db: 4 }, { hz: 3600, db: 4 }, { hz: 14000, db: 1 }] },
  { name: "Electronic",curve: [{ hz: 60, db: 5 }, { hz: 230, db: 1 }, { hz: 910, db: -1 }, { hz: 3600, db: 2 }, { hz: 14000, db: 5 }] },
  { name: "Jazz",      curve: [{ hz: 60, db: 3 }, { hz: 230, db: 2 }, { hz: 910, db: -1 }, { hz: 3600, db: 2 }, { hz: 14000, db: 4 }] },
];

// Interpolate a preset curve at an arbitrary frequency, returning millibels
// (dB × 100, the unit the native equalizer uses), clamped to [minMb, maxMb].
function presetLevelAt(curve: PresetPoint[], hz: number, minMb: number, maxMb: number): number {
  let db: number;
  if (hz <= curve[0].hz) {
    db = curve[0].db;
  } else if (hz >= curve[curve.length - 1].hz) {
    db = curve[curve.length - 1].db;
  } else {
    db = curve[curve.length - 1].db;
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1];
      if (hz >= a.hz && hz <= b.hz) {
        // Interpolate in log-frequency space for a more natural curve.
        const t = (Math.log(hz) - Math.log(a.hz)) / (Math.log(b.hz) - Math.log(a.hz));
        db = a.db + t * (b.db - a.db);
        break;
      }
    }
  }
  const mb = Math.round(db * 100);
  return Math.max(minMb, Math.min(maxMb, mb));
}

function stopFromIndex(idx: number): number {
  return CROSSFADE_STOPS[Math.max(0, Math.min(idx, CROSSFADE_STOPS.length - 1))];
}

function indexFromMs(ms: number): number {
  let best = 0;
  let bestDiff = Math.abs(CROSSFADE_STOPS[0] - ms);
  for (let i = 1; i < CROSSFADE_STOPS.length; i++) {
    const d = Math.abs(CROSSFADE_STOPS[i] - ms);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

export function EQSheet({
  eqInfo, eqEnabled, bandLevels, crossfadeMs,
  onToggleEnabled, onLevelsChange, onCrossfadeChange, onClose, T,
}: Props) {

  const [localLevels, setLocalLevels] = useState<number[]>(() =>
    eqInfo?.bandFreqsHz.map((_, i) => bandLevels[i] ?? 0) ?? []
  );
  const [cfIndex, setCfIndex] = useState(() => indexFromMs(crossfadeMs));
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = useCallback((preset: EqPreset) => {
    const info = eqInfo;
    if (!info) return;
    const levels = info.bandFreqsHz.map(hz =>
      presetLevelAt(preset.curve, hz, info.minMillibel, info.maxMillibel)
    );
    setLocalLevels(levels);
    onLevelsChange(levels);
    setActivePreset(preset.name);
    // Turn the equalizer on when a preset is picked, so the effect is audible.
    if (!eqEnabled && preset.name !== "Flat") onToggleEnabled(true);
  }, [eqInfo, eqEnabled, onLevelsChange, onToggleEnabled]);

  const handleBandChange = useCallback((idx: number, raw: string) => {
    setLocalLevels(prev => { const next = [...prev]; next[idx] = Number(raw); return next; });
    setActivePreset(null); // manual tweak → no longer a named preset
  }, []);

  const commitBandChange = useCallback(() => {
    onLevelsChange(localLevels);
  }, [localLevels, onLevelsChange]);

  const commitCfChange = () => { onCrossfadeChange(stopFromIndex(cfIndex)); };

  const resetEQ = () => {
    const zeros = (eqInfo?.bandFreqsHz ?? []).map(() => 0);
    setLocalLevels(zeros);
    onLevelsChange(zeros);
    setActivePreset("Flat");
  };

  const eqAvailable = !!eqInfo?.available;
  const bands  = eqInfo?.bandFreqsHz ?? [];
  const minMb  = eqInfo?.minMillibel ?? -1500;
  const maxMb  = eqInfo?.maxMillibel ??  1500;
  const accent = T.accent ?? "#7C3AED";
  const violet = T.violet ?? "#7C3AED";

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300 }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: T.sheetBg, borderRadius: "20px 20px 0 0",
        border: `1px solid ${T.border}`, borderBottom: "none",
        zIndex: 301, maxHeight: "92vh", overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: "env(safe-area-inset-bottom, 24px)",
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 20px 16px" }}>
          <span style={{ fontSize: 17, fontWeight: "800", color: T.text }}>Audio Effects</span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: "0 20px 32px", display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Crossfade */}
          <SheetSection label="Crossfade" T={T}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: T.textSub }}>Blend between tracks</span>
              <span style={{ fontSize: 13, fontWeight: "700", color: cfIndex === 0 ? T.muted : accent, minWidth: 36, textAlign: "right" }}>
                {fmtCrossfade(stopFromIndex(cfIndex))}
              </span>
            </div>
            <input type="range" min={0} max={CROSSFADE_STOPS.length - 1} step={1} value={cfIndex}
              className="slider"
              onChange={e => setCfIndex(Number(e.target.value))}
              onMouseUp={commitCfChange} onTouchEnd={commitCfChange}
              style={{ width: "100%", accentColor: accent }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 11, color: T.muted }}>Off</span>
              <span style={{ fontSize: 11, color: T.muted }}>8s</span>
            </div>
          </SheetSection>

          {/* Equalizer */}
          <SheetSection
            label="Equalizer"
            headerRight={eqAvailable ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={resetEQ} style={{ background: "transparent", border: "none", color: T.muted, fontSize: 12, fontWeight: "600", cursor: "pointer", padding: "2px 0" }}>Reset</button>
                <EQToggle checked={eqEnabled} onChange={onToggleEnabled} accent={accent} T={T} />
              </div>
            ) : null}
            T={T}
          >
            {!eqAvailable ? (
              <div style={{ fontSize: 13, color: T.muted, paddingTop: 4 }}>Not available on this device.</div>
            ) : (
              <>
                {/* Presets */}
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 4, WebkitOverflowScrolling: "touch" }}>
                  {EQ_PRESETS.map(p => {
                    const active = activePreset === p.name;
                    return (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p)}
                        style={{
                          flexShrink: 0,
                          padding: "7px 14px", borderRadius: 999,
                          border: `1px solid ${active ? violet : T.border}`,
                          background: active ? violet + "22" : "transparent",
                          color: active ? violet : T.textSub,
                          fontSize: 13, fontWeight: active ? 700 : 600,
                          cursor: "pointer", whiteSpace: "nowrap",
                          fontFamily: "inherit", transition: "all 0.15s",
                        }}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>

                {/* Bar visualizer */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 6, height: 80, marginBottom: 8, opacity: eqEnabled ? 1 : 0.35, transition: "opacity 0.2s" }}>
                  {bands.map((hz, i) => {
                    const level = localLevels[i] ?? 0;
                    const pct   = (maxMb - minMb) > 0 ? (level - minMb) / (maxMb - minMb) : 0.5;
                    const barH  = Math.round(pct * 60) + 10;
                    const barColor = level === 0 ? T.border : level > 0 ? accent : violet + "99";
                    return (
                      <div key={hz} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", height: barH, borderRadius: 3, background: barColor, transition: "height 0.08s ease, background 0.15s", alignSelf: "flex-end" }} />
                        <span style={{ fontSize: 10, color: T.muted, whiteSpace: "nowrap" }}>{fmtHz(hz)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Vertical sliders */}
                <div style={{ display: "flex", gap: 4, justifyContent: "space-between", opacity: eqEnabled ? 1 : 0.35, transition: "opacity 0.2s" }}>
                  {bands.map((hz, i) => {
                    const level = localLevels[i] ?? 0;
                    const dbVal = (level / 100).toFixed(1);
                    return (
                      <div key={hz} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: "700", color: level === 0 ? T.muted : accent, height: 14 }}>
                          {level === 0 ? "0" : level > 0 ? `+${dbVal}` : dbVal}
                        </span>
                        <div style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <input type="range" min={minMb} max={maxMb} step={100} value={level}
                            className="slider" disabled={!eqEnabled}
                            onChange={e => handleBandChange(i, e.target.value)}
                            onMouseUp={commitBandChange} onTouchEnd={commitBandChange}
                            style={{ width: 80, transform: "rotate(-90deg)", accentColor: accent, cursor: eqEnabled ? "pointer" : "default" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: T.muted }}>{(minMb / 100).toFixed(0)}dB</span>
                  <span style={{ fontSize: 10, color: T.muted }}>0dB</span>
                  <span style={{ fontSize: 10, color: T.muted }}>+{(maxMb / 100).toFixed(0)}dB</span>
                </div>
              </>
            )}
          </SheetSection>

        </div>
      </div>
    </>
  );
}

function SheetSection({ label, headerRight, children, T }: {
  label: string; headerRight?: React.ReactNode; children: React.ReactNode; T: T;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: "700", color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function EQToggle({ checked, onChange, accent, T }: {
  checked: boolean; onChange: (v: boolean) => void; accent: string; T: T;
}) {
  return (
    <button onClick={() => onChange(!checked)} style={{
      width: 44, height: 26, borderRadius: 13,
      background: checked ? accent : T.border,
      border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 0.18s", boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}