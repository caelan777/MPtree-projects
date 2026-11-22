import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import { floatCard } from "./cardStyles";

// For someone new: "Download free music here" in a balloon on the Discover
// button (HintBalloon). Where there is no Discover (the iPhone), the card on
// top of Songs that says where the songs come from instead, and the sheet
// behind its second button with every way to get songs onto the phone. Shown
// once, after the welcome page, until it is answered.

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

/** "Download free music here" in a balloon on the Discover button, its point
 *  at the button. Caelan picked it (design B, 20 Nov 2026) over the long arrow
 *  that ran from the hint over the search box. Fixed on the screen, over the
 *  header card: it follows the button every frame, and hides when the button
 *  is folded away. */
export function HintBalloon({ target, onDone, T }: { target: React.RefObject<HTMLElement | null>; onDone: () => void; T: T }) {
  const [at, setAt] = useState<null | { x: number; y: number; w: number }>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const b = target.current?.getBoundingClientRect();
      const next = b && b.width > 20 && b.bottom > 0 ? { x: b.left + b.width / 2, y: b.bottom, w: window.innerWidth } : null;
      const key = next ? `${Math.round(next.x)},${Math.round(next.y)},${next.w}` : "";
      if (key !== last) { last = key; setAt(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!at) return null;
  const width = Math.min(260, at.w - 24);
  // The button is at the right of the header, so the balloon hangs mostly to
  // its left, with the point under the button.
  const left = Math.max(12, Math.min(at.x - width + 44, at.w - width - 12));
  const point = Math.max(18, Math.min(at.x - left, width - 18));
  return (
    <div className="mp-balloon" role="dialog" aria-label={t("Download free music here")}
      style={{ position: "fixed", left, top: at.y + 12, width, zIndex: 62, transformOrigin: `${point}px -8px`,
        animation: "mpBalloonIn .5s cubic-bezier(.2,.9,.25,1.2) both, mpBalloonWiggle .7s ease-in-out .6s 1" }}>
      <style>{`
        @keyframes mpBalloonIn { from { opacity: 0; transform: translateY(-6px) scale(.86); } to { opacity: 1; transform: none; } }
        @keyframes mpBalloonWiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-2.2deg); } 55% { transform: rotate(1.6deg); } 80% { transform: rotate(-.8deg); } }
        @media (prefers-reduced-motion: reduce) { .mp-balloon { animation: none !important; } }
      `}</style>
      <div style={{ position: "absolute", left: point - 9, top: -7, width: 18, height: 18, background: T.accent, transform: "rotate(45deg)", borderRadius: 3 }} />
      <div style={{ position: "relative", background: T.accent, color: T.playBtnFg, borderRadius: 16, padding: "14px 14px 8px", boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{t("Download free music here")}</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>{t("Songs you find here stay on your phone.")}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onDone} style={{ minHeight: 40, minWidth: 56, padding: "6px 10px", background: "transparent", border: "none", color: T.playBtnFg, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t("OK")}</button>
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
