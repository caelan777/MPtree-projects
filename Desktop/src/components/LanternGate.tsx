import { useState } from "react";
import { t, tn } from "../i18n";
import { LANTERN_GREEN } from "../lantern";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// The first time someone with Pro puts Lantern on, a ring turns up and asks
// one thing. "No" is the way in, and the Lantern page opens out of the light
// from where they tapped. "Yes" puts the ring out and shuts Lantern for a week,
// and says so before it goes.
//
// The ring is drawn here: a band of dark metal, a bezel, and a stone that
// lights up from inside. A ring of power in spirit, with nothing borrowed: no
// emblem, no sound, no picture from anywhere.
//
// It looks the same whatever colour the app is in, because it belongs to
// Lantern and not to the page under it.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

const STYLE = `
  @keyframes lgIn    { 0% { opacity: 0; transform: scale(0.55) translateY(40px); filter: blur(14px) brightness(3); }
                       60% { opacity: 1; filter: blur(0) brightness(1.6); }
                       100% { opacity: 1; transform: none; filter: none; } }
  @keyframes lgFloat { 0%, 100% { transform: translateY(-7px) rotate(-3deg); } 50% { transform: translateY(7px) rotate(3deg); } }
  @keyframes lgPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
  @keyframes lgWave  { from { opacity: 0.9; transform: scale(0.2); } to { opacity: 0; transform: scale(3.2); } }
  @keyframes lgGlint { 0%, 55% { transform: translateX(-90px) skewX(-18deg); } 85%, 100% { transform: translateX(90px) skewX(-18deg); } }
  @keyframes lgRise  { from { opacity: 0; transform: translate(0, 0) scale(1); } 15% { opacity: 1; } to { opacity: 0; transform: translate(var(--dx), -150px) scale(0.3); } }
  @keyframes lgSay   { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
  .lg-glint { transform-box: fill-box; }
  @media (prefers-reduced-motion: reduce) { .lg-a { animation: none !important; } }
`;

// Where the sparks start, round the bottom of the ring, and how far they drift.
const SPARKS: [number, number, number, number][] = [
  [-62, 4, -18, 0], [-40, 18, 10, 0.6], [-18, 26, -8, 1.3], [8, 28, 14, 0.3], [30, 22, -12, 1.8],
  [52, 10, 20, 0.9], [-70, -30, -24, 2.2], [68, -26, 22, 1.5], [-6, 30, 4, 2.6], [44, 30, -18, 2.9],
];

/** The ring itself. `out` is the stone gone dark. */
function Ring({ out }: { out: boolean }) {
  const cx = 120, cy = 192, R = 70, r = 48;
  const band = (x: number, y: number) =>
    `M${x - R} ${y}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0ZM${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  return (
    <svg width="220" height="257" viewBox="0 0 240 280" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id="lgHalo"><stop offset="0" stopColor={G} stopOpacity="0.55" /><stop offset="0.45" stopColor={G} stopOpacity="0.16" /><stop offset="1" stopColor={G} stopOpacity="0" /></radialGradient>
        <linearGradient id="lgMetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0d1512" /><stop offset="0.2" stopColor="#55655e" /><stop offset="0.34" stopColor="#dfe9e4" />
          <stop offset="0.48" stopColor="#6f807a" /><stop offset="0.64" stopColor="#1a2420" /><stop offset="0.8" stopColor="#8a9b95" /><stop offset="1" stopColor="#121a17" />
        </linearGradient>
        <linearGradient id="lgShoulder" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7d3ce" /><stop offset="0.45" stopColor="#4c5b55" /><stop offset="1" stopColor="#141c19" />
        </linearGradient>
        <radialGradient id="lgBezel" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f2f8f5" /><stop offset="0.3" stopColor="#9aaba4" /><stop offset="0.68" stopColor="#3d4c46" /><stop offset="1" stopColor="#0f1714" />
        </radialGradient>
        <radialGradient id="lgGem" cx="0.42" cy="0.36" r="0.7">
          <stop offset="0" stopColor="#ffffff" /><stop offset="0.14" stopColor="#c4ffe0" /><stop offset="0.45" stopColor={G} /><stop offset="0.82" stopColor="#0f8a4e" /><stop offset="1" stopColor="#03301a" />
        </radialGradient>
        <radialGradient id="lgDead" cx="0.42" cy="0.36" r="0.7">
          <stop offset="0" stopColor="#5b6762" /><stop offset="0.5" stopColor="#1f2925" /><stop offset="1" stopColor="#070c0a" />
        </radialGradient>
        <radialGradient id="lgSpill" cx="0.5" cy="0"><stop offset="0" stopColor={G} stopOpacity="0.45" /><stop offset="1" stopColor={G} stopOpacity="0" /></radialGradient>
        <clipPath id="lgStone"><circle cx="120" cy="84" r="42" /></clipPath>
      </defs>

      {/* The light round the stone. */}
      <circle className="lg-a" cx="120" cy="96" r="150" fill="url(#lgHalo)"
        style={{ opacity: out ? 0.06 : undefined, transition: "opacity 1.4s ease", animation: out ? "none" : "lgPulse 2.6s ease-in-out infinite" }} />

      {/* The band: its far side, then its face. */}
      <path d={band(cx + 7, cy - 5)} fill="#0b120f" fillRule="evenodd" />
      <path d={band(cx, cy)} fill="url(#lgMetal)" fillRule="evenodd" />
      <circle cx={cx} cy={cy} r={R - 0.5} fill="none" stroke="#ffffff" strokeOpacity="0.22" />
      <circle cx={cx} cy={cy} r={r + 0.5} fill="none" stroke="#000000" strokeOpacity="0.55" strokeWidth="2" />
      <ellipse cx={cx} cy={cy - R + 6} rx="60" ry="26" fill="url(#lgSpill)" style={{ opacity: out ? 0 : 1, transition: "opacity 1.4s ease" }} />

      {/* The shoulders that hold the head. */}
      <path d="M74 156C70 132 78 112 94 100L112 118C102 126 96 138 94 152Z" fill="url(#lgShoulder)" />
      <path d="M166 156C170 132 162 112 146 100L128 118C138 126 144 138 146 152Z" fill="url(#lgShoulder)" />

      {/* The head: a thick bezel, a recess, and the stone. */}
      <circle cx="125" cy="90" r="56" fill="#0a110e" />
      <circle cx="120" cy="84" r="56" fill="url(#lgBezel)" />
      <circle cx="120" cy="84" r="55" fill="none" stroke="#ffffff" strokeOpacity="0.18" />
      <circle cx="120" cy="84" r="46" fill="#03100a" stroke="#000000" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="120" cy="84" r="42" fill="url(#lgGem)" />
      <circle cx="120" cy="84" r="42" fill="url(#lgDead)" style={{ opacity: out ? 0.94 : 0, transition: "opacity 1.4s ease" }} />
      <circle cx="120" cy="84" r="34" fill="none" stroke="#03301a" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="120" cy="84" r="27" fill="none" stroke="#c9ffe2" strokeOpacity={out ? 0.05 : 0.2} strokeWidth="1.5" />
      <g clipPath="url(#lgStone)">
        <rect className="lg-a lg-glint" x="104" y="30" width="14" height="110" fill="#ffffff" opacity={out ? 0 : 0.28}
          style={{ animation: out ? "none" : "lgGlint 4.2s ease-in-out 1.4s infinite" }} />
      </g>
      <ellipse cx="104" cy="66" rx="14" ry="7.5" transform="rotate(-32 104 66)" fill="#ffffff" opacity={out ? 0.25 : 0.75} />
      <circle cx="139" cy="104" r="3" fill="#ffffff" opacity={out ? 0.1 : 0.45} />
    </svg>
  );
}

type LanternGateProps = {
  /** "I am afraid". Shuts Lantern and says for how many days. */
  onYes: () => number;
  /** "I am not", and where on the screen that was said. */
  onNo: (at: { x: number; y: number }) => void;
  /** Away, after a yes. */
  onDone: () => void;
};

export function LanternGate({ onYes, onNo, onDone }: LanternGateProps) {
  const [shut, setShut] = useState<number | null>(null);
  const btn: React.CSSProperties = {
    width: 128, height: 50, borderRadius: 25, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} style={{
      position: "fixed", inset: 0, zIndex: 480, background: "radial-gradient(circle at 50% 38%, #06150d 0%, #020604 60%, #000 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26, padding: 24, overflow: "hidden",
    }}>
      <style>{STYLE}</style>

      <div aria-hidden="true" style={{ position: "relative", width: 220, height: 257 }}>
        {/* The light it arrives with. */}
        <div className="lg-a" style={{
          position: "absolute", left: 50, top: 18, width: 120, height: 120, borderRadius: "50%",
          border: `3px solid ${G}`, boxShadow: `0 0 24px ${G}`, opacity: 0, animation: "lgWave 1.4s ease-out 0.15s both",
        }} />
        {shut === null && SPARKS.map(([x, y, dx, delay], i) => (
          <span key={i} className="lg-a" style={{
            position: "absolute", left: 110 + x, top: 200 + y, width: 4, height: 4, borderRadius: 2, background: PALE,
            boxShadow: `0 0 8px ${G}`, opacity: 0, ["--dx" as string]: `${dx}px`,
            animation: `lgRise 3.2s ease-out ${1.2 + delay}s infinite`,
          }} />
        ))}
        <div className="lg-a" style={{ animation: "lgIn 1.3s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
          <div className="lg-a" style={{ animation: shut === null ? "lgFloat 5s ease-in-out 1.3s infinite" : "none", transition: "transform 1s ease" }}>
            <Ring out={shut !== null} />
          </div>
        </div>
      </div>

      {shut === null ? (
        <>
          <div className="lg-a" style={{ fontSize: 28, fontWeight: 800, color: PALE, letterSpacing: "0.01em", textAlign: "center", textShadow: `0 0 18px ${G}66`, animation: "lgSay 0.6s ease 1.1s both" }}>
            {t("Are you afraid?")}
          </div>
          <div className="lg-a" style={{ display: "flex", gap: 14, animation: "lgSay 0.6s ease 1.6s both" }}>
            <button onClick={() => setShut(onYes())} style={{ ...btn, background: "transparent", color: PALE, border: `1.5px solid ${G}88` }}>{t("Yes")}</button>
            <button onClick={e => onNo({ x: e.clientX, y: e.clientY })} style={{ ...btn, background: G, color: "#04140b", border: "none", boxShadow: `0 0 22px ${G}66` }}>{t("No")}</button>
          </div>
        </>
      ) : (
        <>
          <div className="lg-a" style={{ textAlign: "center", animation: "lgSay 0.7s ease 0.5s both" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: PALE }}>
              {tn(shut, "Lantern is locked for {n} day.", "Lantern is locked for {n} days.")}
            </div>
            <div style={{ fontSize: 15, color: "#8fb3a1", marginTop: 8 }}>{t("Come back when you are not afraid.")}</div>
          </div>
          <div className="lg-a" style={{ animation: "lgSay 0.6s ease 1.1s both" }}>
            <button onClick={onDone} style={{ ...btn, background: "transparent", color: PALE, border: "1.5px solid #3c5248" }}>{t("OK")}</button>
          </div>
        </>
      )}
    </div>
  );
}
