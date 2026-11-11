import { useEffect, useRef, useState } from "react";

// The intro when the TV turns on: the Verkuijl logo on black with the name small
// at the foot of the screen; then the logo grows towards you and you fly through
// it, the way MPTree opens (MPTree-App/src/components/LoadingScreen.tsx), and Home
// is there. It only flies once Home is ready (the apps and Home Assistant read).

/** Where the mark is flown into, as a fraction of its box: the middle of the owl's
 *  face, between the ears and the beak, so you fly in between its eyes. */
const FLY_ORIGIN = "39.3% 16.8%";
/** The logo stays at least this long, so it is seen even when Home is ready at once. */
const MIN_MS = 1800;
/** When the TV itself starts, longer: it is the first thing seen after a cold start. */
const BOOT_MIN_MS = 3500;
/** Home comes anyway after this long: a Home Assistant that never answers must not
 *  keep the TV on the logo. The house page then says it can't be reached. */
const MAX_MS = 12_000;
const FLY_MS = 950;
/** Waiting to know whether to play (a black screen) gives up after this long in view. */
const WAIT_MS = 3000;

/** The Verkuijl logo: the line-drawn owl on its perch, traced from the 480 x 600
 *  artwork in TV/design/verkuijl-owl.png, so it stays sharp as it grows. */
const OWL = [
  "M107.2 75.8 L165 107.2 Q210.25 94.5 255.5 107.4 L312.3 75.8", // ears and the top of the head
  "M107.2 75.8 L198 191.5 L210 233 L222 191.5 L312.3 75.8", // the face, down to the beak
  "M128 130.5 L128 211.5 L170.5 240.5 M291 130.5 L291 211.5 L249.5 240.5", // sides of the head
  "M128 228.5 L128 306.5 L210 438.5", // the body
  "M247.5 257.5 L295 229 L336.5 299.5 L372 495.5 L247.5 317.5 Z", // the wing
  "M140.5 467.2 L308.5 467.2", // the perch
  "M200.5 484.5 C196.5 477.5 194.5 471.5 194.5 464.5 C194.5 457.5 198.5 454 205.5 454 L231.5 454", // talons
  "M218.5 484.5 C213.5 477.5 210.5 471.5 210.5 465.5 C210.5 459.5 212.5 456.5 216.5 454.5",
  "M237 482.5 L265.5 528", // the tail
].join(" ");

function VerkuijlMark({ height }: { height: number }) {
  return (
    <svg width={Math.round(height * 280 / 464)} height={height} viewBox="100 70 280 464" role="img" aria-label="Verkuijl" style={{ display: "block" }}>
      <path d={OWL} fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  /** False while it is not yet known whether to play: only the black ground. */
  playing: boolean;
  /** Home is ready (the apps and Home Assistant read): the logo may fly. */
  ready: boolean;
  /** The TV itself just started (not back from standby): the logo stays longer. */
  boot: boolean;
  onDone: () => void;
};

export function Intro({ playing, ready, boot, onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "fly">("in");
  const [minPassed, setMinPassed] = useState(false);
  const [maxPassed, setMaxPassed] = useState(false);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!playing) return;
    // Counted from the logo being on screen, not from being asked to play: just
    // after the TV starts the page can take a while to draw its first frame.
    let a = 0, b = 0, r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => {
      a = window.setTimeout(() => setMinPassed(true), boot ? BOOT_MIN_MS : MIN_MS);
      b = window.setTimeout(() => setMaxPassed(true), MAX_MS);
    }); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); window.clearTimeout(a); window.clearTimeout(b); };
  }, [playing, boot]);

  // Not playing yet, and nothing comes to start it: give the screen back.
  useEffect(() => {
    if (playing) return;
    let seen = 0;
    const t = window.setInterval(() => {
      if (document.hidden) { seen = 0; return; }
      seen += 500;
      if (seen >= WAIT_MS) done.current();
    }, 500);
    return () => window.clearInterval(t);
  }, [playing]);

  const go = playing && phase === "in" && minPassed && (ready || maxPassed);
  useEffect(() => {
    if (!go) return;
    const t = window.setTimeout(() => setPhase("fly"), 0);
    return () => window.clearTimeout(t);
  }, [go]);
  useEffect(() => {
    if (phase !== "fly") return;
    const t = window.setTimeout(() => done.current(), FLY_MS + 40);
    return () => window.clearTimeout(t);
  }, [phase]);

  return (
    <div className={"intro" + (phase === "fly" ? " fly" : "")} aria-hidden="true">
      <div className="in-ground" />
      {playing && (
        <>
          <div className="in-mark" style={{ transformOrigin: FLY_ORIGIN }}>
            <div className="in-breathe"><VerkuijlMark height={300} /></div>
          </div>
          <div className="in-name">Verkuijl</div>
        </>
      )}
    </div>
  );
}
