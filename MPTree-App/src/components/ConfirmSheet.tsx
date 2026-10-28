import type { ReactNode } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { floatCard } from "./cardStyles";

// Every "are you sure?" in the app: the floating card the "⋮" menu and the
// selection use, the question, what it means, and the two answers side by
// side. The one that does it is red; Cancel is the grey one.

type ConfirmSheetProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Drawn left of the title: what is about to change. */
  preview?: ReactNode;
  T: T;
};

export function ConfirmSheet({ title, body, confirmLabel, onConfirm, onCancel, preview, T }: ConfirmSheetProps) {
  const sh = makeSH(T);
  const btn = { flex: 1, minWidth: 0, minHeight: 48, padding: "12px 10px", border: "none", borderRadius: 16, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } as const;
  return (
    <div style={{ ...sh.overlay, zIndex: 460, padding: "0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", boxSizing: "border-box" }} onClick={onCancel}>
      <div style={{ ...floatCard(T), width: "100%", padding: "20px 16px 16px", animation: "mpCardUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {preview}
          <span style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{title}</span>
        </div>
        <p style={{ color: T.textSub, fontSize: 14.5, lineHeight: 1.5, margin: "12px 2px 18px", whiteSpace: "pre-line" }}>{body}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ ...btn, background: T.dim, color: T.text }}>{t("Cancel")}</button>
          <button onClick={onConfirm} style={{ ...btn, background: "#e8445a", color: "#fff" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
