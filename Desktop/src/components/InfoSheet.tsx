import type { ReactNode } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";
import { t } from "../i18n";

/**
 * A plain bottom sheet: a title, a close button and a scrolling body. The
 * shell for the handful of sheets that only show something (FAQ, licences,
 * what's new, the language picker, the Bluetooth sheet), so each of them is
 * only its content.
 */
export function InfoSheet({ title, onClose, children, footer, T }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling part, for a single closing button. */
  footer?: ReactNode;
  T: T;
}) {
  const sh = makeSH(T);
  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        style={{ ...sh.sheet, paddingBottom: 0, maxHeight: "82vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ flexShrink: 0 }}>
          <div style={sh.handle} />
          <div style={sh.hdr}>
            <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>{title}</span>
            <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "0 20px 24px", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
        {footer && <div style={{ flexShrink: 0, padding: "0 20px 28px" }}>{footer}</div>}
      </div>
    </div>
  );
}
