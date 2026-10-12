import type { ReactNode } from "react";
import type { T } from "../themes";
import { t, phoneLang, LANGS, LANG_NAMES, type Lang, type LangPref } from "../i18n";
import { InfoSheet } from "./InfoSheet";
import { IC } from "./Icons";

// Each language is named in itself, the way every language picker does it:
// someone who cannot read the current language can still find their own. The
// flag does the same job faster. Drawn here, not typed as emoji: Windows shows
// a flag emoji as two letters.
//
// The flags are the one place colour is let in outside shuffle and selection.
// A flag in grey is not that flag any more.
const FLAGS: Record<Lang, ReactNode> = {
  en: (
    <>
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0l24 24M24 0L0 24" stroke="#fff" strokeWidth="4.8" />
      <path d="M0 0l24 24M24 0L0 24" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="8" />
      <path d="M12 0v24M0 12h24" stroke="#C8102E" strokeWidth="4.8" />
    </>
  ),
  nl: (
    <>
      <rect width="24" height="8" fill="#AE1C28" />
      <rect y="8" width="24" height="8" fill="#fff" />
      <rect y="16" width="24" height="8" fill="#21468B" />
    </>
  ),
  es: (
    <>
      <rect width="24" height="24" fill="#AA151B" />
      <rect y="6" width="24" height="12" fill="#F1BF00" />
    </>
  ),
};

const round = (T: T): React.CSSProperties => ({
  width: 24, height: 24, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: `0 0 0 1px ${T.border}`,
});

export function Flag({ lang, T }: { lang: Lang; T: T }) {
  return (
    <span style={round(T)} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24">{FLAGS[lang]}</svg>
    </span>
  );
}

export function LanguageSheet({ value, onPick, onClose, T }: {
  value: LangPref;
  onPick: (v: LangPref) => void;
  onClose: () => void;
  T: T;
}) {
  const auto = phoneLang();
  const options: { id: LangPref; flag: Lang; label: string; sub?: string }[] = [
    { id: "auto", flag: auto, label: t("Phone language"), sub: LANG_NAMES[auto] },
    ...LANGS.map(l => ({ id: l, flag: l, label: LANG_NAMES[l] })),
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
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              background: T.dim, borderRadius: 12, padding: "13px 16px", cursor: "pointer",
              border: `1px solid ${value === o.id ? T.accent : "transparent"}`,
              color: T.text, fontFamily: "inherit", fontSize: 15, textAlign: "left",
            }}
          >
            <Flag lang={o.flag} T={T} />
            <span style={{ flex: 1, minWidth: 0 }}>
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
