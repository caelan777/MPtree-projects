import type { T } from "../themes";
import { t } from "../i18n";
import { CHANGELOG } from "../changelog";
import { InfoSheet } from "./InfoSheet";

/** Once, after an update. Never on a fresh install: that gets the tutorial. */
export function WhatsNewSheet({ onClose, T }: { onClose: () => void; T: T }) {
  return (
    <InfoSheet
      title={t("New in MPTree {v}", { v: CHANGELOG.version })}
      onClose={onClose}
      T={T}
      footer={
        <button
          onClick={onClose}
          style={{ width: "100%", padding: 14, background: T.accent, color: T.playBtnFg, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {t("Got it")}
        </button>
      }
    >
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {CHANGELOG.notes.map((n, i) => (
          <li key={i} style={{ display: "flex", gap: 12, padding: "10px 0", color: T.text, fontSize: 14.5, lineHeight: 1.55 }}>
            <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: "50%", background: T.muted, flexShrink: 0, marginTop: 9 }} />
            <span>{t(n)}</span>
          </li>
        ))}
      </ul>
    </InfoSheet>
  );
}
