import { t } from "../i18n";
import { LANTERN_GREEN } from "../lantern";

// ─── LANTERN'S QUESTION ──────────────────────────────────────────────────────
// Before Lantern is put on, a ring turns up and asks one thing. "No" is the
// way in. "Yes" shuts Lantern for a week: it is not for the afraid.
//
// The ring is a plain band of light, drawn here with nothing but a border and
// a glow. No emblem, no sound, no picture from anywhere: all of it is ours.
//
// It looks the same whatever colour the app is in, because it belongs to
// Lantern and not to the page under it.

const G = LANTERN_GREEN;
const PALE = "#eafff2";

const STYLE = `
  @keyframes lgIn   { from { opacity: 0; transform: scale(0.3) translateY(36px); } to { opacity: 1; transform: none; } }
  @keyframes lgTurn { from { transform: rotateX(16deg) rotateY(0deg); } to { transform: rotateX(16deg) rotateY(360deg); } }
  @keyframes lgGlow { 0%, 100% { opacity: 0.5; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.06); } }
  @keyframes lgSay  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .lg-a { animation: none !important; } }
`;

type LanternGateProps = {
  /** "I am afraid": Lantern is shut for a week. */
  onYes: () => void;
  /** "I am not": Lantern goes on. */
  onNo: () => void;
};

export function LanternGate({ onYes, onNo }: LanternGateProps) {
  const btn: React.CSSProperties = {
    width: 124, height: 48, borderRadius: 24, fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: "pointer",
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={t("Are you afraid?")} style={{
      position: "fixed", inset: 0, zIndex: 480, background: "rgba(2,8,5,0.95)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34, padding: 24,
    }}>
      <style>{STYLE}</style>

      <div className="lg-a" aria-hidden="true" style={{ width: 190, height: 190, display: "grid", placeItems: "center", perspective: 620, animation: "lgIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) both" }}>
        <div className="lg-a" style={{
          gridArea: "1 / 1", width: 190, height: 190, borderRadius: "50%",
          background: `radial-gradient(circle, ${G}66 0%, ${G}1f 45%, transparent 70%)`,
          animation: "lgGlow 2.6s ease-in-out infinite",
        }} />
        <div className="lg-a" style={{
          gridArea: "1 / 1", width: 118, height: 118, borderRadius: "50%", boxSizing: "border-box", position: "relative",
          border: `13px solid ${G}`, boxShadow: `0 0 30px ${G}, inset 0 0 20px ${G}aa`,
          animation: "lgTurn 5.5s linear infinite",
        }}>
          {/* The stone, on top of the band. */}
          <div style={{
            position: "absolute", top: -22, left: "50%", marginLeft: -15, width: 30, height: 30, borderRadius: "50%",
            background: `radial-gradient(circle at 38% 34%, #ffffff 0%, ${PALE} 30%, ${G} 78%)`, boxShadow: `0 0 18px ${G}`,
          }} />
        </div>
      </div>

      <div className="lg-a" style={{ fontSize: 26, fontWeight: 800, color: PALE, letterSpacing: "0.01em", textAlign: "center", animation: "lgSay 0.6s ease 1s both" }}>
        {t("Are you afraid?")}
      </div>

      <div className="lg-a" style={{ display: "flex", gap: 14, animation: "lgSay 0.6s ease 1.5s both" }}>
        <button onClick={onYes} style={{ ...btn, background: "transparent", color: PALE, border: `1.5px solid ${G}88` }}>{t("Yes")}</button>
        <button onClick={onNo} style={{ ...btn, background: G, color: "#04140b", border: "none" }}>{t("No")}</button>
      </div>
    </div>
  );
}
