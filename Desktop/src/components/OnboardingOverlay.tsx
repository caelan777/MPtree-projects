import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { T } from "../themes";
import { t } from "../i18n";

// ─── ONBOARDING OVERLAY ──────────────────────────────────────────────────────
// First-launch guide with REAL on-screen indicators: each step spotlights the
// actual button/element (via a data-tour attribute in App) by cutting a hole
// in a dark overlay around it, and anchors the tip card next to it. Steps
// whose target isn't on screen fall back to a centered card. Shown once —
// App persists a "seen" flag.

interface Props {
  onDone: () => void;
  T: T;
  /** The window layout (sidebar, table, player bar): other things to point
   *  at, and a mouse and a keyboard to say it for. */
  wide?: boolean;
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

const PHONE_STEPS: Step[] = [
  {
    target: '[data-tour="logo"]',
    title: "The logo is a button",
    body: "Tap it to fold the header and the player away and give the list the whole screen. Tap again to bring them back. Hold it for options, and while it is folded you can drag it wherever you want it.",
  },
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
    body: "Tap here (or swipe the screen left) for your playlists, plus Favorites, Recently Played and Most Played, built automatically.",
  },
  {
    target: '[data-tour="settings"]',
    title: "Make it yours",
    body: "Sound, sleep timer, backups, size, language and help all live here. Enjoy the music!",
  },
];

/** The same walk for the wide layout on Windows. Nothing is tapped or held
 *  there, and what the phone keeps in its header is in a sidebar and a bar. */
const WIDE_STEPS: Step[] = [
  {
    target: '[data-tour="d-sidebar"]',
    title: "Your library",
    body: "Songs, playlists and the bin are on the left. The arrow at the top folds this bar down to its icons.",
  },
  {
    target: '[data-tour="d-search"]',
    title: "Find anything fast",
    body: "Search your whole library by song or artist. Ctrl+F puts the cursor here.",
  },
  {
    target: '[data-tour="songs"]',
    title: "Double-click to play",
    body: "One click selects a song, a double click plays it. A right click opens edit, cut, like and play next. Ctrl with a click selects several.",
    pickRow: true,
  },
  {
    target: ".dshuffle",
    title: "Shuffle everything",
    body: "Click to shuffle all songs.",
  },
  {
    target: '[data-tour="d-player"]',
    title: "The player",
    body: "Play, skip, seek and volume are down here. Space plays and pauses, and the media keys on your keyboard work too.",
  },
  {
    target: 'nav [data-tour="settings"]',
    title: "Make it yours",
    body: "Sound, the look, your music folder, the floating button and help are in Settings. Enjoy the music!",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function OnboardingOverlay({ onDone, T, wide }: Props) {
  const STEPS = wide ? WIDE_STEPS : PHONE_STEPS;
  // Straight into the first tip. There used to be a "Welcome to MPTree" card in
  // front of it, which after the first-launch welcome page was the same
  // greeting twice, and from Settings was a step between asking for the
  // tutorial and getting it.
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  // The spotlight ring sits on a scrim that is dark in BOTH themes, so it is
  // always white rather than T.accent (which would be black in light mode and
  // vanish against the scrim).
  const spotlight = "#FFFFFF";
  const tipIndex = step;
  const current = STEPS[tipIndex];
  const isLast = tipIndex === STEPS.length - 1;

  // Measure the current step's target. Re-measures on resize/orientation.
  useLayoutEffect(() => {
    if (!current?.target) { setRect(null); return; }
    const measure = () => {
      let el: Element | null = document.querySelector(current.target!);
      if (!el) { setRect(null); return; }
      const vhNow = window.innerHeight || 800;

      // Spotlight a song near the MIDDLE of the screen, not the first one that
      // happens to be visible. Picking the first visible row put the highlight
      // directly under the header and pushed the tip card off the bottom.
      //
      // The band is tried from strict to loose. A single strict band failed on
      // a real device (floating header + mini player + virtualised list left no
      // row fully inside it), which silently dropped back to a plain centered
      // card with no highlight at all. Degrading through wider bands means a
      // song gets highlighted whenever any row is on screen.
      if (current.pickRow) {
        const headerEl = document.querySelector('[data-tour="search"]');
        const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom + 8 : 120;
        const middle = vhNow / 2;

        const rows = Array.from(el.querySelectorAll("[data-song-row]"))
          .map(row => ({ row, rr: row.getBoundingClientRect() }))
          .filter(({ rr }) => rr.height > 0);

        // 1: fully visible with room beneath for the tip card.
        // 2: fully visible anywhere below the header.
        // 3: merely overlapping the area below the header.
        const bands = [
          ({ rr }: { rr: DOMRect }) => rr.top >= headerBottom && rr.bottom <= vhNow - 210,
          ({ rr }: { rr: DOMRect }) => rr.top >= headerBottom && rr.bottom <= vhNow - 20,
          ({ rr }: { rr: DOMRect }) => rr.bottom > headerBottom && rr.top < vhNow - 20,
        ];

        let best: Element | null = null;
        for (const inBand of bands) {
          let bestDistance = Infinity;
          for (const candidate of rows) {
            if (!inBand(candidate)) continue;
            const { rr } = candidate;
            const distance = Math.abs((rr.top + rr.bottom) / 2 - middle);
            if (distance < bestDistance) { bestDistance = distance; best = candidate.row; }
          }
          if (best) break;
        }

        if (best) el = best;
        else { setRect(null); return; } // no rows on screen at all → centered card
      }

      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      const pad = 6 + (current.pad ?? 0);
      let top    = r.top - pad;
      let height = r.height + pad * 2;
      // A target taller than half the viewport leaves no room for the tip card
      // (this is what pushed the card off-screen on the song-list step).
      // Fall back to spotlighting a band near the top of it.
      if (height > vhNow * 0.5 && !wide) { top = Math.max(top, 96); height = 150; }
      setRect({ top, left: r.left - pad, width: r.width + pad * 2, height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step, wide]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The clamp above keeps the card on screen, but on a short screen it can drag
  // the card back over the very row being highlighted, hiding it. If that
  // happened and there is room above the spotlight, flip the card up there.
  if (rect) {
    const coversSpotlight = cardTop < rect.top + rect.height && cardTop + cardH > rect.top;
    const aboveTop = rect.top - GAP - cardH;
    if (coversSpotlight && aboveTop >= EDGE) cardTop = aboveTop;
  }
  let cardStyle: React.CSSProperties = { position: "fixed", left: 16, right: 16, top: cardTop };
  // In a window the card stands by what it is about, not across the middle:
  // under or over it, in line with it, or beside it when it is as tall as the
  // window (the sidebar).
  if (wide && rect) {
    const vw = window.innerWidth;
    const CARD_W = Math.min(400, vw - EDGE * 2);
    const clampX = (x: number) => Math.max(EDGE, Math.min(x, vw - CARD_W - EDGE));
    if (rect.height > vh * 0.5) {
      const right = rect.left + rect.width + GAP;
      const left = right + CARD_W <= vw - EDGE ? right : clampX(rect.left - GAP - CARD_W);
      cardStyle = { position: "fixed", left, width: CARD_W, top: Math.max(EDGE, Math.min(rect.top + 56, vh - cardH - EDGE)) };
    } else {
      cardStyle = { position: "fixed", left: clampX(rect.left + rect.width / 2 - CARD_W / 2), width: CARD_W, top: cardTop };
    }
  }

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
          border: `2px solid ${spotlight}`,
          pointerEvents: "none",
          transition: "all 0.28s ease",
        }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)" }} />
      )}

      {/* Click-catcher so taps don't reach the app underneath. */}
      <div style={{ position: "fixed", inset: 0 }} onClick={() => { /* absorb */ }} />

      {(
        <div ref={cardRef} style={{ ...cardStyle, zIndex: 601 }}>
          <div style={{
            background: T.sheetBg, border: `1px solid ${T.border}`,
            borderRadius: 18, padding: "18px 18px 14px",
            maxWidth: 420, margin: "0 auto",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
          }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{t(current!.title)}</div>
            <div style={{ fontSize: 14, color: T.textSub, marginTop: 8, lineHeight: 1.55 }}>
              {t(current!.body)}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              {/* Progress dots */}
              <div style={{ display: "flex", gap: 6 }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{
                    width: i === tipIndex ? 16 : 6, height: 6, borderRadius: 3,
                    background: i === tipIndex ? T.text : T.border,
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
                    {t("Skip")}
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
                  {isLast ? t("Let's go") : t("Next")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}