import React, { useLayoutEffect, useRef, useState } from "react";

// ─── one line that moves when it does not fit ────────────────────────────────
// A song name too long for its line used to wrap onto two or three lines, so the
// player grew and shrank from song to song, or it was cut off with "…".
// It is one line now. When the words fit they stand still; when they do not
// they wait a moment, then move to the left until the end has been read, with a
// copy of the name coming in behind it, and start over (index.css, mp-mq-*).
// Still for anyone who asked their phone for less motion.

const SPEED = 34;   // px a second
const STILL = 0.22; // the part of each round it stands still, at the start

export function Marquee({ text, align = "left", style }: {
  text: string;
  align?: "left" | "center";
  style?: React.CSSProperties;
}) {
  const box  = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState<null | { dist: number; gap: number; time: number }>(null);

  useLayoutEffect(() => {
    const b = box.current, w = word.current;
    if (!b || !w) return;
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const measure = () => {
      // offsetWidth: layout pixels, the same whatever the sheet is scaled by.
      const room = b.clientWidth, need = w.offsetWidth;
      if (still || room <= 0 || need <= room + 1) { setRun(null); return; }
      const gap = Math.max(36, Math.round(room / 3));
      const dist = need + gap;
      setRun(r => (r && r.dist === dist && r.gap === gap) ? r : { dist, gap, time: dist / SPEED / (1 - STILL) });
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(b);
    // The font may arrive after the first measure, and change the width.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro?.disconnect();
  }, [text]);

  return (
    <div ref={box} style={{
      ...style,
      overflow: "hidden", whiteSpace: "nowrap",
      textAlign: run ? "left" : align,
      ...(run ? {
        // A soft edge on the right; on the left only while it moves (--mp-mq-l).
        maskImage: "linear-gradient(90deg, transparent 0, #000 var(--mp-mq-l), #000 calc(100% - 18px), transparent 100%)",
        WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 var(--mp-mq-l), #000 calc(100% - 18px), transparent 100%)",
        animation: `mpMqEdge ${run.time.toFixed(2)}s linear infinite`,
      } : { textOverflow: "ellipsis" }),
    }}>
      <span
        className={run ? "mp-mq-run" : undefined}
        style={run ? {
          display: "inline-block",
          ["--mp-mq-d" as string]: `${-run.dist}px`,
          animationDuration: `${run.time.toFixed(2)}s`,
        } : undefined}
      >
        <span ref={word}>{text}</span>
        {run && <span aria-hidden="true" style={{ paddingLeft: run.gap }}>{text}</span>}
      </span>
    </div>
  );
}

// ─── the big words of the Text only player ───────────────────────────────────
// Text only has no room to move sideways: the name is the picture there, set in
// big letters over several lines. So the letters get smaller until the whole
// name fits the square. A name too long even then rolls slowly up and back, so
// all of it can still be read. The square never changes size.

const FIT_MIN = 22;

export function FitWords({ text, max, style }: { text: string; max: number; style?: React.CSSProperties }) {
  const box  = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [roll, setRoll] = useState(0);

  useLayoutEffect(() => {
    const b = box.current, w = body.current;
    if (!b || !w) return;
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // offsetHeight, not scrollHeight: with lines this tight the letters stand
    // out of their lines a little, and scrollHeight counts that as too tall,
    // so every name shrank to the smallest size.
    const fit = () => {
      let f = max;
      w.style.fontSize = `${f}px`;
      while (f > FIT_MIN && w.offsetHeight > b.clientHeight + 1) {
        f -= 2;
        w.style.fontSize = `${f}px`;
      }
      const over = w.offsetHeight - b.clientHeight;
      setRoll(!still && over > 1 ? Math.ceil(over) : 0);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(b);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro?.disconnect();
  }, [text, max]);

  return (
    <div ref={box} style={{ ...style, overflow: "hidden", minHeight: 0 }}>
      <div ref={body}
        className={roll ? "mp-mq-roll" : undefined}
        style={{
          wordBreak: "break-word",
          // Room for the tails of g, j, p and y under the last line.
          paddingBottom: "0.14em",
          ...(roll ? { ["--mp-mq-y" as string]: `${-roll}px`, animationDuration: `${Math.max(6, roll / 14 / 0.64).toFixed(2)}s` } : null),
        }}
      >{text}</div>
    </div>
  );
}
