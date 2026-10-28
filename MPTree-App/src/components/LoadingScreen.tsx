import { useEffect, useRef, useState } from "react";
import type { Theme } from "../types";
import { DARK, LIGHT, type T } from "../themes";
import { t } from "../i18n";
import { Logo } from "./Logo";

// ─── LoadingScreen ───────────────────────────────────────────────────────────
// Full-screen overlay shown while App.tsx's initialize() is still loading.
// It sits on top of the normal UI — which is already mounted underneath —
// so there is never a flash of an empty/incomplete song list. Once
// `visible` flips to false it fades out and then unmounts itself.
//
// Visual concept: the mark alone on the app's ground, breathing slowly, the
// name under it. Strictly monochrome, per the brand system in
// Branding/README.md: black and white carry the identity, and colour is
// reserved for functional state.
//
// On the way out you fly through the mark: it draws back for a moment, then
// grows towards you around the open triangle inside the M, and that opening
// becomes the screen while the ground fades and the app is there. Scaled,
// never turned: the brand does not let the mark rotate.
//
// The first frame is the MARK ONLY, on black. Android always shows its own
// splash before the WebView exists (you cannot opt out on Android 12+), and
// that splash is themed in res/values/styles.xml to be the same mark on the
// same black. Holding this frame identical for a beat, then fading the wordmark
// in, makes the handover invisible — instead of the app appearing to
// start up twice.

interface LoadingScreenProps {
  /** Current app theme, so the loading screen matches light/dark mode. */
  theme: Theme;
  /** The app's palette, Pro shade included, so the screen you come in
   *  through is already the colour the app is. Falls back to plain dark or
   *  light. */
  palette?: T;
  /** Pass `isInitializing` here. While true, the screen is shown at full opacity. */
  visible: boolean;
  /** Optional status text shown under the equalizer bars. */
  label?: string;
  /** Minimum time (ms) the screen stays fully visible once shown. */
  minVisibleMs?: number;
  /** Fired once the screen has fully faded out and unmounted. Used by App to
   *  defer the music scan (and its Android permission dialog) until the
   *  splash is completely gone. */
  onHidden?: () => void;
}

const FADE_MS = 640;
/** Where the mark is flown into: the middle of the triangle inside the M, as
 *  a fraction of the mark's box (the incircle of that opening). */
const FLY_ORIGIN = "16.7% 41.6%";
const MIN_VISIBLE_MS = 1200;

export function LoadingScreen({
  theme,
  palette,
  visible,
  label = t("Loading your music…"),
  minVisibleMs = MIN_VISIBLE_MS,
  onHidden,
}: LoadingScreenProps) {
  const [mounted, setMounted] = useState(visible);
  const [faded, setFaded] = useState(!visible);
  // Everything except the mark waits a beat, so the very first painted frame
  // matches the Android splash we are taking over from.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 260);
    return () => clearTimeout(t);
  }, []);

  const shownAtRef = useRef<number | null>(visible ? Date.now() : null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (visible) {
      shownAtRef.current = Date.now();
      setMounted(true);
      setFaded(false);
      return;
    }
    const elapsed = shownAtRef.current !== null ? Date.now() - shownAtRef.current : minVisibleMs;
    const remaining = Math.max(0, minVisibleMs - elapsed);
    hideTimeoutRef.current = setTimeout(() => {
      setFaded(true);
      hideTimeoutRef.current = null;
    }, remaining);
    return () => {
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [visible, minVisibleMs]);

  // Unmount after the fade-out transition completes, then notify App.
  useEffect(() => {
    if (!faded) return;
    const t = setTimeout(() => { setMounted(false); onHidden?.(); }, FADE_MS + 40);
    return () => clearTimeout(t);
  }, [faded]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  const TH = palette ?? (theme === "dark" ? DARK : LIGHT);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900, overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        pointerEvents: faded ? "none" : "auto",
      }}
    >
      {/* The ground on its own layer, so it can fade while the mark flies. */}
      <div style={{
        position: "absolute", inset: 0, background: TH.bg,
        animation: faded ? `mplGround ${FADE_MS}ms linear both` : "none",
      }} />
      <style>{`
        @keyframes mplBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes mplFly {
          0%   { transform: scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.3, 0, 0.2, 1); }
          22%  { transform: scale(0.9); opacity: 1; animation-timing-function: cubic-bezier(0.6, 0, 0.9, 0.4); }
          94%  { transform: scale(70); opacity: 1; }
          100% { transform: scale(70); opacity: 0; }
        }
        @keyframes mplGround { 0%, 45% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes mplWordsOut { to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .mpl-anim { animation: none !important; }
          .mpl-fly { animation: mplGround ${FADE_MS}ms linear both !important; }
        }
      `}</style>

      {/* Mark, breathing very slowly, and flown through on the way out. */}
      <div className={faded ? "mpl-fly" : undefined} style={{
        position: "relative", transformOrigin: FLY_ORIGIN,
        animation: faded ? `mplFly ${FADE_MS}ms both` : "none",
      }}>
        <div className="mpl-anim" style={{ animation: "mplBreathe 3.2s ease-in-out infinite" }}>
          <Logo size={104} color={TH.text} />
        </div>
      </div>

      {/* Wordmark. Monochrome: the mark carries the identity, not a colour. */}
      <div role="status" aria-label={label} style={{
        position: "relative", marginTop: 22, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: TH.text,
        opacity: settled ? 1 : 0, transition: "opacity 0.35s ease",
        animation: faded ? "mplWordsOut 0.15s ease both" : "none",
      }}>
        MPTree
      </div>

      {/* Signature, pinned near the bottom. */}
      <div style={{
        position: "absolute", bottom: 40, textAlign: "center", opacity: settled ? 1 : 0, transition: "opacity 0.35s ease",
        animation: faded ? "mplWordsOut 0.15s ease both" : "none",
      }}>
        <div style={{ fontSize: 12, color: TH.muted }}>by Verkuijl</div>
      </div>
    </div>
  );
}