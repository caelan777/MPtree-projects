import type { T } from "../themes";
import { InfoSheet } from "../components/InfoSheet";
import { t } from "../i18n";

// What App.tsx answers to in the wide layout. Kept next to nothing else on
// purpose: change a key there, change its line here.
const KEYS: [string, string][] = [
  ["Space", "Play or pause"],
  ["↑  ↓", "Move up or down the list"],
  ["Enter", "Play the chosen song"],
  ["Delete", "Remove the chosen song"],
  ["←  →", "Back or forward 5 seconds"],
  ["Ctrl + ←  →", "Previous or next song"],
  ["Ctrl + ↑  ↓", "Volume down or up"],
  ["M", "Sound off and on"],
  ["Ctrl + F", "Search"],
  ["Esc", "Close what is open"],
];
const MOUSE: [string, string][] = [
  ["Double click", "Play a song"],
  ["Right click", "The song's menu"],
  ["Ctrl + click", "Select several songs"],
];

export function ShortcutsSheet({ onClose, T }: { onClose: () => void; T: T }) {
  const line = ([key, what]: [string, string], translateKey: boolean) => (
    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 14, color: T.text }}>{t(what)}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: T.textSub, background: T.dim, borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>
        {translateKey ? t(key) : key === "Space" ? t(key) : key}
      </span>
    </div>
  );
  return (
    <InfoSheet title={t("Keyboard shortcuts")} onClose={onClose} T={T}>
      <div style={{ padding: "0 20px 20px" }}>
        {KEYS.map(k => line(k, false))}
        <div style={{ height: 14 }} />
        {MOUSE.map(k => line(k, true))}
      </div>
    </InfoSheet>
  );
}
