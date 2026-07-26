import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { T } from "../themes";
import logoDark from "../assets/logo.png";
import logoLight from "../assets/logolight.png";

// ─── ONBOARDING OVERLAY ──────────────────────────────────────────────────────
// First-launch guide with REAL on-screen indicators: each step spotlights the
// actual button/element (via a data-tour attribute in App) by cutting a hole
// in a dark overlay around it, and anchors the tip card next to it. Steps
// whose target isn't on screen fall back to a centered card. Shown once —
// App persists a "seen" flag.

interface Props {
  onDone: () => void;
  theme: "dark" | "light";
  T: T;
}

interface Step {
  /** CSS selector of the element to spotlight; none = centered card. */
  target?: string;
  title: string;
  body: string;
  /** Extra padding around the spotlight hole. */
  pad?: number;
  /** Spotlight the first fully-visible song row inside the target instead of
   *  the whole scroll container (which fills the screen and leaves nowhere to
   *  put the tip card). */
  pickRow?: boolean;
}

const STEPS: Step[] = [
  {
    target: '[data-tour="search"]',
    title: "Find anything fast",
    body: "Search your whole library by song or artist. The ✕ clears it in one tap.",
  },
  {
    target: '[data-tour="songs"]',
    title: "Tap to play, hold for more",
    body: "Tap any song to play it. Long-press to edit, cut, like, share, or queue it next.",
    pickRow: true,
  },
  {
    target: '[data-tour="shuffle"]',
    title: "Shuffle everything",
    body: "Tap to shuffle all songs. Hold it to switch repeat mode on or off.",
  },
  {
    target: '[data-tour="playlists"]',
    title: "Your playlists",
    body: "Tap here (or swipe the screen left) for your playlists — plus Favorites, Recently Played and Most Played, built automatically.",
  },
  {
    target: '[data-tour="plus"]',
    title: "Add music",
    body: "Opens your download page. Hold it for quick access to the bin.",
  },
  {
    target: '[data-tour="settings"]',
    title: "Make it yours",
    body: "Equalizer with presets, crossfade, sleep timer, backups, themes, and the bin all live here. Enjoy the music!",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function OnboardingOverlay({ onDone, theme, T }: Props) {
  const [step, setStep] = useState(0); // 0 = welcome, 1..STEPS.length = tips
  const [rect, setRect] = useState<Rect | null>(null);

  const violet = T.violet;
  const isWelcome = step === 0;
  const tipIndex = step - 1;
  const current = isWelcome ? null : STEPS[tipIndex];
  const isLast = tipIndex === STEPS.length - 1;

  // Measure the current step's target. Re-measures on resize/orientation.
  useLayoutEffect(() => {
    if (!current?.target) { setRect(null); return; }
    const measure = () => {
      let el: Element | null = document.querySelector(current.target!);
      if (!el) { setRect(null); return; }
      const vhNow = window.innerHeight || 800;

      // Spotlight the row the user is actually looking at. Works no matter how
      // far the list is scrolled, because we pick the first row that's fully
      // on screen right now rather than assuming the list is at the top.
      // We start below the floating header card so we never highlight a row
      // that's tucked underneath it (which looked broken and left the tip card
      // stranded up in the header).
      if (current.pickRow) {
        const headerEl = document.querySelector('[data-tour="search"]');
        const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom + 8 : 120;
        const rows = Array.from(el.querySelectorAll("[data-song-row]"));
        const visible = rows.find(rw => {
          const rr = rw.getBoundingClientRect();
          return rr.height > 0 && rr.top >= headerBottom && rr.bottom <= vhNow - 120;
        });
        if (visible) el = visible;
        else { setRect(null); return; } // no clean row → centered fallback card
      }

      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      const pad = 6 + (current.pad ?? 0);
      let top    = r.top - pad;
      let height = r.height + pad * 2;
      // A target taller than half the viewport leaves no room for the tip card
      // (this is what pushed the card off-screen on the song-list step).
      // Fall back to spotlighting a band near the top of it.
      if (height > vhNow * 0.5) { top = Math.max(top, 96); height = 150; }
      setRect({ top, left: r.left - pad, width: r.width + pad * 2, height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Block background scrolling while the tour is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const next = () => { if (isLast) onDone(); else setStep(step + 1); };

  // ── Tip card positioning ──────────────────────────────────────────────────
  // Prefer below the spotlight, else above it, and ALWAYS clamp inside the
  // viewport. The card's real height is measured rather than guessed, so it
  // can never end up half (or fully) off-screen with the Next button
  // unreachable.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(180);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setCardH(el.getBoundingClientRect().height);
  }, [step, rect]);

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const GAP = 14, EDGE = 12;
  let cardTop: number;
  if (!rect) {
    cardTop = Math.max(EDGE, (vh - cardH) / 2);
  } else {
    const below = rect.top + rect.height + GAP;
    const above = rect.top - GAP - cardH;
    if (below + cardH <= vh - EDGE)      cardTop = below;
    else if (above >= EDGE)              cardTop = above;
    else                                 cardTop = below;
  }
  cardTop = Math.max(EDGE, Math.min(cardTop, vh - cardH - EDGE));
  const cardStyle: React.CSSProperties = { position: "fixed", left: 16, right: 16, top: cardTop };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600 }}>
      {/* Spotlight: a rounded rect whose massive box-shadow darkens everything
          around it — a literal hole in the overlay over the real button. When
          there is no target (welcome / missing element), a plain dark cover. */}
      {rect ? (
        <div style={{
          position: "fixed",
          top: rect.top, left: rect.left, width: rect.width, height: rect.height,
          borderRadius: 14,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.8)",
          border: `2px solid ${violet}`,
          pointerEvents: "none",
          transition: "all 0.28s ease",
        }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)" }} />
      )}

      {/* Click-catcher so taps don't reach the app underneath. */}
      <div style={{ position: "fixed", inset: 0 }} onClick={() => { /* absorb */ }} />

      {isWelcome ? (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{
            background: T.sheetBg, border: `1px solid ${T.border}`,
            borderRadius: 22, width: "100%", maxWidth: 350,
            padding: "32px 26px 22px", textAlign: "center",
          }}>
            <img
              src={theme === "dark" ? logoDark : logoLight}
              alt="MPTree"
              style={{ width: 84, height: 84, objectFit: "contain", margin: "0 auto 18px", display: "block" }}
            />
            <div style={{ fontSize: 23, fontWeight: 800, color: T.text }}>Welcome to MPTree</div>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>by Caelan Verkuijl</div>
            <div style={{ fontSize: 15, color: T.textSub, marginTop: 16, lineHeight: 1.55 }}>
              Your music. Zero ads.<br />Let me show you around — it takes 20 seconds.
            </div>
            <button
              onClick={() => setStep(1)}
              style={{
                width: "100%", marginTop: 24, padding: 14,
                background: T.playBtnBg, color: T.playBtnFg,
                border: "none", borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Show me
            </button>
            <button
              onClick={onDone}
              style={{
                width: "100%", marginTop: 10, padding: 10,
                background: "transparent", color: T.muted,
                border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div ref={cardRef} style={{ ...cardStyle, zIndex: 601 }}>
          <div style={{
            background: T.sheetBg, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: "18px 18px 14px",
            maxWidth: 420, margin: "0 auto",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{current!.title}</div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 8, lineHeight: 1.55 }}>
              {current!.body}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              {/* Progress dots */}
              <div style={{ display: "flex", gap: 6 }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: i === tipIndex ? 16 : 6, height: 6, borderRadius: 3,
                    background: i === tipIndex ? violet : T.border,
                    transition: "all 0.2s",
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!isLast && (
                  <button
                    onClick={onDone}
                    style={{ background: "transparent", border: "none", color: T.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "9px 10px", fontFamily: "inherit" }}
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={next}
                  style={{
                    background: T.playBtnBg, color: T.playBtnFg,
                    border: "none", borderRadius: 10, padding: "9px 18px",
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {isLast ? "Let's go" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}