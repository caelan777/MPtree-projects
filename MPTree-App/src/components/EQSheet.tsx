import React, { useState, useCallback, useEffect, useId, useRef } from "react";
import { BackButton, PAGE_IN, PageInStyle } from "./FullPage";
import { pageGround, type T } from "../themes";
import { t } from "../i18n";

// ─── AUDIO EFFECTS ───────────────────────────────────────────────────────────
// A page of its own over the whole screen, as Backup is (design 18A, Caelan,
// 21 Nov), instead of a sheet from the bottom. Two cards: the crossfade, with a
// picture of how long two songs run over each other, and the equalizer as one
// line with a point per band that a finger pulls up or down. Settings stays
// open under it, so the back arrow goes back there.

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
  return hz >= 1000 ? `${Math.round(hz / 100) / 10}k` : `${hz}`;
}

function fmtCrossfade(ms: number): string {
  if (ms === 0) return t("Off");
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace(/\.0$/, "")} s`;
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

  // What was changed here; until then the levels the app has, also when the
  // equalizer's bands arrive after the page opened (it opens at once now).
  const [edited, setLocalLevels] = useState<number[] | null>(null);
  const localLevels = edited ?? (eqInfo?.bandFreqsHz.map((_, i) => bandLevels[i] ?? 0) ?? []);
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
  const ms     = stopFromIndex(cfIndex);
  const pct    = (cfIndex / (CROSSFADE_STOPS.length - 1)) * 100;

  const card: React.CSSProperties = { background: T.card, borderRadius: 16, padding: "14px 16px 16px" };
  const head: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 700, color: T.text };

  return (
    <div className={PAGE_IN} style={{ position: "fixed", inset: 0, background: pageGround(T), zIndex: 431, display: "flex", flexDirection: "column", color: T.text }}>
      <PageInStyle />
      <style>{`
        .mp-au-range { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; outline: none; margin: 0; }
        .mp-au-range::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: ${T.accent}; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
        .mp-au-chip { transition: background-color .15s ease, color .15s ease; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "calc(env(safe-area-inset-top, 0px) + 8px) 10px 6px", flexShrink: 0 }}>
        <BackButton onClick={onClose} T={T} />
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>{t("Audio Effects")}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "4px 16px calc(env(safe-area-inset-bottom, 0px) + 28px)", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ── Crossfade ── */}
          <div style={card}>
            <div style={head}><span>{t("Crossfade")}</span><span>{fmtCrossfade(ms)}</span></div>
            <FadePicture ms={ms} T={T} />
            <input className="mp-au-range" type="range" min={0} max={CROSSFADE_STOPS.length - 1} step={1} value={cfIndex}
              aria-label={t("Crossfade")}
              onChange={e => {
                const idx = Number(e.target.value);
                setCfIndex(idx);
                onCrossfadeChange(stopFromIndex(idx));
              }}
              style={{ background: `linear-gradient(to right, ${T.accent} ${pct}%, ${T.dim} ${pct}%)` }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginTop: 10 }}>
              <span>{t("Off")}</span><span>8 s</span>
            </div>
          </div>

          {/* ── Equalizer ── */}
          <div style={card}>
            <div style={head}>
              <span>{t("Equalizer")}</span>
              {eqAvailable && <Switch checked={eqEnabled} onChange={onToggleEnabled} T={T} />}
            </div>
            {eqInfo === null ? null : !eqAvailable ? (
              <div style={{ fontSize: 14, color: T.muted, marginTop: 10 }}>{t("Not available on this device.")}</div>
            ) : (
              <>
                <Curve bands={bands} levels={localLevels} minMb={minMb} maxMb={maxMb} on={eqEnabled} T={T}
                  onMove={levels => { setLocalLevels(levels); setActivePreset(null); }}
                  onDone={levels => onLevelsChange(levels)} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
                  {EQ_PRESETS.map(p => {
                    const on = activePreset === p.name;
                    return (
                      <button key={p.name} className="mp-au-chip" onClick={() => applyPreset(p)} aria-pressed={on}
                        style={{
                          height: 32, padding: "0 13px", borderRadius: 16, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accent : "transparent", color: on ? T.playBtnFg : T.text,
                        }}>
                        {t(p.name)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {eqAvailable && (
            <button onClick={resetEQ}
              style={{ alignSelf: "center", background: "transparent", border: "none", padding: "6px 12px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: T.textSub, cursor: "pointer" }}>
              {t("Reset to flat")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── the crossfade, drawn ────────────────────────────────────────────────────
// This song running out and the next one coming in, over as long as the fade
// is: at Off they only meet, at 8 s they run over each other a long way.
function FadePicture({ ms, T }: { ms: number; T: T }) {
  const id = useId().replace(/:/g, "");
  const W = 300, END = 196;
  const over = (ms / 8000) * 126;
  const bStart = END - over;
  const aSolid = over > 0 ? (END - over) / END : 1;
  const bSolid = over > 0 ? over / (W - bStart) : 0;
  return (
    <svg viewBox={`0 0 ${W} 78`} width="100%" height="78" style={{ display: "block", margin: "12px 0 12px" }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="0" x2="1">
          <stop offset={aSolid} stopColor={T.text} />
          <stop offset="1" stopColor={T.text} stopOpacity={over > 0 ? 0 : 1} />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" x2="1">
          <stop offset="0" stopColor={T.text} stopOpacity={over > 0 ? 0 : 1} />
          <stop offset={bSolid} stopColor={T.text} />
        </linearGradient>
      </defs>
      <text x="2" y="10" fontSize="9.5" fontWeight="800" letterSpacing="0.08em" fill={T.muted}>{t("This song").toUpperCase()}</text>
      <rect x="0" y="18" width={END} height="17" rx="4" fill={`url(#${id}a)`} />
      <rect x={bStart} y="43" width={W - bStart} height="17" rx="4" fill={`url(#${id}b)`} />
      {over > 0 && <rect x={bStart} y="12" width={over} height="54" rx="7" fill="none" stroke={T.text} strokeOpacity="0.55" strokeDasharray="3 3" />}
      <text x={W - 2} y="76" fontSize="9.5" fontWeight="800" letterSpacing="0.08em" fill={T.muted} textAnchor="end">{t("Next song").toUpperCase()}</text>
    </svg>
  );
}

// ─── the equalizer as one line ───────────────────────────────────────────────
// A point per band, spread evenly, with a smooth line through them. A finger
// on the picture takes the nearest point and pulls it to where it is, in
// steps of 1 dB; letting go sends the levels on (as the sliders did on their
// release), so the phone is not asked for a new setting at every pixel.
function Curve({ bands, levels, minMb, maxMb, on, onMove, onDone, T }: {
  bands: number[]; levels: number[]; minMb: number; maxMb: number; on: boolean;
  onMove: (levels: number[]) => void; onDone: (levels: number[]) => void; T: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(300);
  const [held, setHeld] = useState<number | null>(null);
  // The levels while a finger is on the picture: taken when it comes down.
  const latest = useRef(levels);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setW(Math.max(160, Math.round(el.clientWidth)));
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const H = 168, TOP = 16, BOT = 16, PADX = 16;
  const n = bands.length;
  const xAt = (i: number) => n <= 1 ? w / 2 : PADX + (i * (w - PADX * 2)) / (n - 1);
  const yAt = (mb: number) => TOP + ((maxMb - mb) / Math.max(1, maxMb - minMb)) * (H - TOP - BOT);
  const pts = bands.map((_, i) => ({ x: xAt(i), y: yAt(levels[i] ?? 0) }));

  // Catmull-Rom through the points, as cubic Béziers.
  let line = pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    line += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  const fill = pts.length ? `${line} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z` : "";

  const levelFrom = (clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    const y = ((clientY - r.top) / r.height) * H;
    const mb = maxMb - ((y - TOP) / (H - TOP - BOT)) * (maxMb - minMb);
    return Math.max(minMb, Math.min(maxMb, Math.round(mb / 100) * 100));
  };
  const nearest = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * w;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(xAt(i) - x) < Math.abs(xAt(best) - x)) best = i;
    return best;
  };
  const set = (i: number, clientY: number) => {
    const next = [...latest.current];
    next[i] = levelFrom(clientY);
    latest.current = next;
    onMove(next);
  };
  const db = (mb: number) => { const v = Math.round(mb / 100); return v > 0 ? `+${v} dB` : `${v} dB`; };

  return (
    <div style={{ opacity: on ? 1 : 0.4, transition: "opacity .2s ease", marginTop: 12 }}>
      <div ref={box} style={{ position: "relative", height: H, touchAction: "none", cursor: on ? "pointer" : "default", pointerEvents: on ? "auto" : "none" }}
        onPointerDown={e => {
          if (!n) return;
          const i = nearest(e.clientX);
          latest.current = levels;
          setHeld(i);
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          set(i, e.clientY);
        }}
        onPointerMove={e => { if (held !== null) set(held, e.clientY); }}
        onPointerUp={() => { if (held !== null) { setHeld(null); onDone(latest.current); } }}
        onPointerCancel={() => { if (held !== null) { setHeld(null); onDone(latest.current); } }}>
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} style={{ display: "block", overflow: "visible" }}>
          <line x1="0" x2={w} y1={yAt(0)} y2={yAt(0)} stroke={T.border} strokeWidth="1" />
          <line x1="0" x2={w} y1={TOP} y2={TOP} stroke={T.border} strokeWidth="1" strokeDasharray="2 4" />
          <line x1="0" x2={w} y1={H - BOT} y2={H - BOT} stroke={T.border} strokeWidth="1" strokeDasharray="2 4" />
          <path d={fill} fill={T.text} opacity="0.06" />
          <path d={line} fill="none" stroke={T.text} strokeWidth="3" strokeLinecap="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={held === i ? 11 : 9} fill={T.text} stroke={T.card} strokeWidth="3" />
          ))}
          {held !== null && pts[held] && (
            <text x={Math.min(w - 26, Math.max(26, pts[held].x))} y={Math.max(11, pts[held].y - 17)} fontSize="12" fontWeight="800" fill={T.text} textAnchor="middle">
              {db(levels[held] ?? 0)}
            </text>
          )}
        </svg>
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 6 }}>
        {bands.map((hz, i) => (
          <span key={i} style={{ position: "absolute", left: xAt(i), transform: "translateX(-50%)", fontSize: 11, fontWeight: 700, color: T.muted, whiteSpace: "nowrap" }}>
            {fmtHz(hz)}{i === n - 1 ? " Hz" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Switch({ checked, onChange, T }: { checked: boolean; onChange: (v: boolean) => void; T: T }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        width: 46, height: 28, borderRadius: 14, border: "none", padding: 0, cursor: "pointer", flexShrink: 0,
        background: checked ? T.accent : T.dim, position: "relative", transition: "background-color .2s ease",
      }}>
      <span style={{
        position: "absolute", top: 3, left: checked ? 21 : 3, width: 22, height: 22, borderRadius: 11,
        background: checked ? T.playBtnFg : "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .2s ease",
      }} />
    </button>
  );
}
