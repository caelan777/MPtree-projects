import type { T } from "../themes";
import { t } from "../i18n";

/** A part of a page whose content is still on its way. It stands where an
 *  "empty" message would otherwise show for a moment and say something that
 *  is not true yet, and holds that place quietly: no dots, nothing moving.
 *  The label is for screen readers, and shown only when one is given. */
export function Loading({ T, label }: { T: T; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label ?? t("Loading…")}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "36px 24px", minHeight: 80, color: T.muted }}>
      {label && <div style={{ fontSize: 13 }}>{label}</div>}
    </div>
  );
}
