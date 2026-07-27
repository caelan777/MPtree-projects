import { useEffect, useRef, useState } from "react";
import type { Theme } from "../types";
import { DARK, LIGHT } from "../themes";
import { Logo } from "./Logo";

// ─── LoadingScreen ───────────────────────────────────────────────────────────
// Full-screen overlay shown while App.tsx's initialize() is still loading.
// It sits on top of the normal UI — which is already mounted underneath —
// so there is never a flash of an empty/incomplete song list. Once
// `visible` flips to false it fades out and then unmounts itself.
//
// Visual concept: the mark alone on the app's ground, breathing slowly, with
// three quiet dots standing in for progress. Strictly monochrome, per the
// brand system in Branding/README.md: black and white carry the identity, and
// colour is reserved for functional state.

interface LoadingScreenProps {
  /** Current app theme, so the loading screen matches light/dark mode. */
  theme: Theme;
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

const FADE_MS = 380;
const MIN_VISIBLE_MS = 1200;

export function LoadingScreen({
  theme,
  visible,
  label = "Loading your music…",
  minVisibleMs = MIN_VISIBLE_MS,
  onHidden,
}: LoadingScreenProps) {
  const [mounted, setMounted] = useState(visible);
  const [faded, setFaded] = useState(!visible);

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

  const TH = theme === "dark" ? DARK : LIGHT;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900,
        background: TH.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        opacity: faded ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: faded ? "none" : "auto",
      }}
    >
      <style>{`
        @keyframes mplBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes mplDot     { 0%, 60%, 100% { opacity: 0.25; } 30% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .mpl-anim { animation: none !important; } }
      `}</style>

      {/* Mark, breathing very slowly. */}
      <div className="mpl-anim" style={{ animation: "mplBreathe 3.2s ease-in-out infinite" }}>
        <Logo size={104} color={TH.text} />
      </div>

      {/* Wordmark. Monochrome: the mark carries the identity, not a colour. */}
      <div style={{ marginTop: 22, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", color: TH.text }}>
        MPTree
      </div>

      {/* Three quiet dots standing in for progress. */}
      <div style={{ display: "flex", gap: 7, marginTop: 26 }} aria-label={label}>
        {[0, 1, 2].map(i => (
          <div key={i} className="mpl-anim" style={{
            width: 6, height: 6, borderRadius: "50%", background: TH.text,
            animation: `mplDot 1.4s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>

      {/* Signature, pinned near the bottom. */}
      <div style={{ position: "absolute", bottom: 40, textAlign: "center" }}>
        <div style={{ fontSize: 12, color: TH.muted }}>by Caelan Verkuijl</div>
        <div style={{ fontSize: 11, color: TH.muted, opacity: 0.65, marginTop: 4, letterSpacing: "0.06em" }}>
          your music · zero ads
        </div>
      </div>
    </div>
  );
}