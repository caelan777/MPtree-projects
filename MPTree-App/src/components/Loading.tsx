import type { T } from "../themes";
import { t } from "../i18n";

/** Three quiet dots, for a part of a page whose content is still on its way.
 *  Stands where an "empty" message would otherwise show for a moment and say
 *  something that is not true yet. The same dots as the loading screen. */
export function Loading({ T, label }: { T: T; label?: string }) {
  return (
    <div role="status" aria-label={label ?? t("Loading…")}
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "36px 24px", color: T.muted }}>
      <style>{`
        @keyframes mpLoadDot { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .mp-load span { animation: none !important; opacity: 0.6 !important; } }
      `}</style>
      <div className="mp-load" style={{ display: "flex", gap: 7 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: T.text, animation: `mpLoadDot 1.4s ease-in-out ${i * 0.18}s infinite` }} />
        ))}
      </div>
      {label && <div style={{ fontSize: 13 }}>{label}</div>}
    </div>
  );
}
