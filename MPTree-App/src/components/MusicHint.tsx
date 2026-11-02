import { useLayoutEffect, useRef } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { floatCard } from "./cardStyles";

// For someone new: the card on top of Songs that says where the songs come
// from, and the sheet behind its second button with every way to get songs
// onto the phone. Shown once, after the welcome page, until "OK" is tapped.

type MusicHintProps = {
  onDone: () => void;
  onHow: () => void;
  /** Its height, so the list's virtualization can count it. */
  onHeight: (h: number) => void;
  T: T;
};

export function MusicHint({ onDone, onHow, onHeight, T }: MusicHintProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    onHeight(el.offsetHeight);
    return () => { ro.disconnect(); onHeight(0); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const btn = { flex: 1, minWidth: 0, minHeight: 44, padding: "10px 8px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } as const;
  return (
    <div ref={ref} style={{ padding: "4px 12px 12px" }}>
      <div style={{ background: T.playBtnBg, color: T.playBtnFg, borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{t("Your songs show up here")}</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.82 }}>
          {t("MPTree finds the music on your phone by itself. Don't see anything? Then there are no songs on it yet.")}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button onClick={onDone} style={{ ...btn, border: "none", background: T.playBtnFg, color: T.playBtnBg }}>{t("OK")}</button>
          <button onClick={onHow} style={{ ...btn, border: `1px solid ${T.playBtnFg}`, background: "transparent", color: T.playBtnFg }}>{t("How do I add songs?")}</button>
        </div>
      </div>
    </div>
  );
}

const WAYS: { title: string; body: string; note?: string }[] = [
  { title: "Download in your browser", body: "Buy or download songs on a site that allows it, like Bandcamp or Qobuz. They land in your Download folder.",
    note: "MPTree is not responsible for songs you download from illegal sites." },
  { title: "With a cable from your computer", body: "Connect your phone to your computer. Drag your songs into the Music folder." },
  { title: "From a friend", body: "Have someone send you a song with Quick Share, Bluetooth or WhatsApp. Then save it on your phone." },
  { title: "From your cloud", body: "Are your songs in Google Drive, OneDrive or Dropbox? Open the app and choose \"Download\"." },
  { title: "With a memory card", body: "Put your songs on an SD card and put it in your phone." },
  { title: "From your old phone (Pro)", body: "Sign in to your MPTree account on both phones. Your songs move to your new phone by themselves." },
];

export function MusicHowSheet({ onClose, T }: { onClose: () => void; T: T }) {
  const sh = makeSH(T);
  return (
    <div style={{ ...sh.overlay, zIndex: 460, padding: "0 12px calc(env(safe-area-inset-bottom, 0px) + 12px)", boxSizing: "border-box" }} onClick={onClose}>
      <div style={{ ...floatCard(T), width: "100%", maxHeight: "85vh", overflowY: "auto", padding: "20px 18px 16px", boxSizing: "border-box", animation: "mpCardUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 19, fontWeight: 800, color: T.text, marginBottom: 14 }}>{t("How do I add songs?")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {WAYS.map((w, i) => (
            <div key={w.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.playBtnBg, color: T.playBtnFg, fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{t(w.title)}</div>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: T.textSub, marginTop: 2 }}>{t(w.body)}</div>
                {w.note && <div style={{ fontSize: 12, lineHeight: 1.4, color: T.muted, marginTop: 6 }}>{t(w.note)}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: T.text, marginTop: 18 }}>
          {t("Then open MPTree. Your songs show up by themselves. Don't see them? Pull the list down.")}
        </div>
        <button onClick={onClose} style={{ width: "100%", minHeight: 48, marginTop: 16, border: "none", borderRadius: 16, background: T.playBtnBg, color: T.playBtnFg, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t("OK")}</button>
      </div>
    </div>
  );
}
