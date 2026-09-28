import type { T } from "../themes";
import { t, phoneLang, type LangPref } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { IC } from "./Icons";

// Each language is named in itself, the way every language picker does it:
// someone who cannot read the current language can still find their own.
const NAMES = { en: "English", nl: "Nederlands" } as const;

export function LanguageSheet({ value, onPick, onClose, T }: {
  value: LangPref;
  onPick: (v: LangPref) => void;
  onClose: () => void;
  T: T;
}) {
  const options: { id: LangPref; label: string; sub?: string }[] = [
    { id: "auto", label: t("Phone language"), sub: NAMES[phoneLang()] },
    { id: "en", label: NAMES.en },
    { id: "nl", label: NAMES.nl },
  ];
  return (
    <InfoSheet title={t("Language")} onClose={onClose} T={T}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map(o => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            aria-pressed={value === o.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
              background: T.dim, borderRadius: 12, padding: "14px 16px", cursor: "pointer",
              border: `1px solid ${value === o.id ? T.accent : "transparent"}`,
              color: T.text, fontFamily: "inherit", fontSize: 15, textAlign: "left",
            }}
          >
            <span>
              {o.label}
              {o.sub && <span style={{ color: T.muted, fontSize: 13, marginLeft: 8 }}>{o.sub}</span>}
            </span>
            {value === o.id && IC.Check(T.text)}
          </button>
        ))}
      </div>
    </InfoSheet>
  );
}
