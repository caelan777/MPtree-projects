import { useEffect, useLayoutEffect, useRef } from "react";
import type { T } from "../themes";
import { t } from "../i18n";
import { IC } from "./Icons";
import { count } from "../counter";

// ─── TEN HOURS ───────────────────────────────────────────────────────────────
// Once, at the top of the songs, after ten hours of music (listen.ts): a thank
// you, and where Pro is. No sheet over the list and nothing that stops the
// music; the x puts it away for good, and so does "See Pro".

export function ListenCard({ onPro, onClose, onHeight, T }: {
  onPro: () => void;
  onClose: () => void;
  /** Its height, which the list's virtual window has to know about. */
  onHeight: (h: number) => void;
  T: T;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    onHeight(el.offsetHeight);
    return () => { ro.disconnect(); onHeight(0); };
  }, [onHeight]);
  useEffect(() => { count("listen-card"); }, []);
  return (
    <div ref={box} style={{ padding: "4px 16px 10px" }}>
      <div style={{ position: "relative", background: T.accent, color: T.playBtnFg, borderRadius: 18, padding: "14px 16px 16px" }}>
        <button onClick={onClose} aria-label={t("Close")} style={{
          position: "absolute", top: 6, right: 6, width: 36, height: 36, border: "none", background: "transparent",
          color: T.playBtnFg, opacity: 0.6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}><IC.Close /></button>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", opacity: 0.6 }}>{t("10 HOURS")}</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, lineHeight: 1.3, paddingRight: 24 }}>
          {t("You have played 10 hours of music in MPTree.")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4, lineHeight: 1.4 }}>
          {t("Thanks for listening. Like it? Pro keeps it going.")}
        </div>
        <button onClick={onPro} style={{
          marginTop: 12, padding: "7px 14px", borderRadius: 16, border: "none", cursor: "pointer",
          background: T.playBtnFg, color: T.accent, fontSize: 13.5, fontWeight: 700, fontFamily: "inherit",
        }}>{t("See Pro")}</button>
      </div>
    </div>
  );
}
