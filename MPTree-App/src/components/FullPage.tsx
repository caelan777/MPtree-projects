import type { ReactNode } from "react";
import { pageGround, type T } from "../themes";
import { t } from "../i18n";

// ─── A PAGE OF ITS OWN ───────────────────────────────────────────────────────
// Every page that Settings opens looks and moves the same (Caelan, 21 Nov): the
// whole screen, the back arrow top left where Backup has it, the title next to
// it, and in from the right the way Backup's pages come. Closing is the arrow
// or Android's own back; there is no X.

const css = `
  @keyframes mpFpIn { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
  .mp-fp { animation: mpFpIn .26s cubic-bezier(.2,.8,.2,1) both; }
  @media (prefers-reduced-motion: reduce) { .mp-fp { animation: none; } }
`;

/** The class that brings a page in as Backup's come in, for a page that
 *  draws its own frame (Personalise, Pro, Audio Effects, Account). */
export const PAGE_IN = "mp-fp";
export function PageInStyle() { return <style>{css}</style>; }

export function BackButton({ onClick, T, label }: { onClick: () => void; T: T; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label ?? t("Back")}
      style={{ width: 44, height: 44, borderRadius: 22, display: "grid", placeItems: "center", background: "transparent", border: "none", color: T.text, cursor: "pointer", padding: 0, flexShrink: 0 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 5 8 12 15 19" /></svg>
    </button>
  );
}

export function FullPage({ title, onBack, right, children, T, z = 440, scroll = true }: {
  title?: ReactNode;
  onBack: () => void;
  /** Something at the right of the title (a button). */
  right?: ReactNode;
  children: ReactNode;
  T: T;
  z?: number;
  /** false: the page scrolls its own parts (the children fill the rest). */
  scroll?: boolean;
}) {
  return (
    <div className={PAGE_IN} style={{ position: "fixed", inset: 0, zIndex: z, background: pageGround(T), color: T.text, display: "flex", flexDirection: "column" }}>
      <style>{css}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "calc(env(safe-area-inset-top, 0px) + 8px) 10px 6px", flexShrink: 0, minHeight: 50 }}>
        <BackButton onClick={onBack} T={T} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        {right}
      </div>
      {scroll
        ? <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>{children}</div>
        : <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>}
    </div>
  );
}
