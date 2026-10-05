import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TITLE_H, type T } from "../themes";
import { isDesktop } from "../plugins";
import { t } from "../i18n";

export { TITLE_H };

const btn: React.CSSProperties = {
  width: 46, height: TITLE_H, border: "none", background: "transparent", color: "inherit",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", padding: 0,
};

/**
 * The top of the window: where it is dragged by, and minimise, maximise and
 * close. Windows' own title bar is switched off (tauri.conf.json), because it
 * is a grey strip that belongs to Windows and not to MPTree; this one is the
 * app's own ground colour, so the window is one surface from top to bottom.
 */
export function TitleBar({ T }: { T: T }) {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isDesktop) return;
    const win = getCurrentWindow();
    const read = () => { win.isMaximized().then(setMax).catch(() => {}); };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  if (!isDesktop) return null;
  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: TITLE_H, zIndex: 2000,
        display: "flex", justifyContent: "flex-end", background: T.bg, color: T.textSub, userSelect: "none",
      }}
    >
      <button className="twin" style={btn} aria-label={t("Minimise")} onClick={() => { win.minimize().catch(() => {}); }}>
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><line x1="0.5" y1="5.5" x2="10.5" y2="5.5" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button className="twin" style={btn} aria-label={max ? t("Restore") : t("Maximise")} onClick={() => { win.toggleMaximize().catch(() => {}); }}>
        {max ? (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
            <rect x="0.5" y="2.5" width="8" height="8" /><polyline points="2.5 2.5 2.5 0.5 10.5 0.5 10.5 8.5 8.5 8.5" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><rect x="0.5" y="0.5" width="10" height="10" /></svg>
        )}
      </button>
      <button className="twin twin-close" style={btn} aria-label={t("Close")} onClick={() => { win.close().catch(() => {}); }}>
        <svg width="11" height="11" viewBox="0 0 11 11" stroke="currentColor" strokeWidth="1" aria-hidden="true"><line x1="0.5" y1="0.5" x2="10.5" y2="10.5" /><line x1="10.5" y1="0.5" x2="0.5" y2="10.5" /></svg>
      </button>
    </div>
  );
}
