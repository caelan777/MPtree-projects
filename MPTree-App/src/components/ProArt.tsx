import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Logo } from "./Logo";
import { SpinningDisc } from "./SpinningDisc";
import { LANTERN_RECORDS, FLOWER_RECORDS, type VinylSkin } from "../look";

// ─── LITTLE PICTURES OF PRO ──────────────────────────────────────────────────
// Records and styles drawn in CSS for the Pro page and the notes that offer
// Pro. Not the real player: a hint of it, small, and light to draw. Colour
// only where the thing itself has it (Lantern's green, Aviela's pink).

export type DiscKind = "vinyl" | "smoke" | "marble" | "lantern" | "aviela";

const FACE: Record<DiscKind, string> = {
  vinyl: "repeating-radial-gradient(circle, #151515 0 2px, #242424 2px 3px)",
  smoke: "radial-gradient(circle at 35% 30%, #fafafa 0 8%, transparent 30%), radial-gradient(circle at 70% 70%, #bdbdbd 0 10%, transparent 40%), conic-gradient(#e9e9e9, #8f8f8f, #f6f6f6, #6f6f6f, #e9e9e9)",
  marble: "repeating-linear-gradient(35deg, #f4f4f4 0 9px, #c9c9c9 9px 11px, #fff 11px 20px, #9a9a9a 20px 21px)",
  lantern: "radial-gradient(circle, #b8ff9c 0 12%, #1d3b16 40%, #050805 75%)",
  aviela: "radial-gradient(circle at 30% 30%, #ffd3e3 0 14%, transparent 15%), radial-gradient(circle at 68% 60%, #ffc0d6 0 12%, transparent 13%), radial-gradient(circle at 40% 75%, #ffe6ee 0 10%, transparent 11%), #f7a8c4",
};

export function MiniDisc({ kind, size, spin = false, ring, style }: {
  kind: DiscKind; size: number; spin?: boolean; ring?: string; style?: CSSProperties;
}) {
  return (
    <span className={spin ? "mp-disc-spin" : undefined} aria-hidden="true" style={{
      display: "block", width: size, height: size, borderRadius: "50%", flexShrink: 0, position: "relative",
      background: FACE[kind], boxShadow: [kind === "lantern" ? "0 0 24px rgba(140,255,110,0.3)" : "", ring ? `0 0 0 2px ${ring}` : ""].filter(Boolean).join(", ") || undefined,
      ...style,
    }}>
      <span style={{ position: "absolute", inset: "38%", borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {size >= 90 && <Logo size={Math.round(size * 0.13)} color="#111" />}
      </span>
    </span>
  );
}

/** A phone in a style: its header card, the record, a line for the song. */
export function StylePhone({ kind, w = 108 }: { kind: "lantern" | "aviela"; w?: number }) {
  const lantern = kind === "lantern";
  return (
    <span aria-hidden="true" style={{
      display: "block", width: w, height: w * 1.66, borderRadius: 16, padding: "12px 10px", boxSizing: "border-box",
      background: lantern ? "#0b0b0b" : "#fde7ef", boxShadow: lantern ? "0 0 0 1px #222" : "0 0 0 1px #f3c6d6",
    }}>
      <span style={{ display: "block", height: 16, borderRadius: 6, background: lantern ? "#1d2a19" : "#f8cadb" }} />
      <MiniDisc kind={kind} size={w * 0.74} spin style={{ margin: `${w * 0.2}px auto 0` }} />
      <span style={{ display: "block", height: 6, borderRadius: 3, background: lantern ? "#2b3d25" : "#f3b3c9", marginTop: w * 0.17 }} />
    </span>
  );
}

// Every record the app has, in the order Personalise shows them.
const RECORDS: VinylSkin[] = ["classic", "white", "smoke", "marble", ...LANTERN_RECORDS, ...FLOWER_RECORDS];

/** Every real record in turn, a couple of seconds each, fading into the
 *  next. The records are the player's own (SpinningDisc), not drawings. */
export function CyclingDisc({ size }: { size: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % RECORDS.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "block", width: size, height: size, flexShrink: 0 }}>
      {RECORDS.map((k, n) => (
        <span key={k} style={{ position: "absolute", inset: 0, opacity: n === i ? 1 : 0, transition: "opacity 0.6s" }}>
          {/* Only the one on show and the next are drawn. */}
          {(n === i || n === (i + 1) % RECORDS.length) && <SpinningDisc size={size} skin={k} spinning />}
        </span>
      ))}
    </span>
  );
}

/** All the records in one row, big and turning, gliding slowly sideways
 *  without end (the row is there twice, so it loops without a jump). */
export function RecordRow({ size }: { size: number }) {
  const one = (copy: number) => RECORDS.map(k => (
    <span key={`${copy}-${k}`} style={{ flexShrink: 0, paddingRight: 18 }}>
      <SpinningDisc size={size} skin={k} spinning />
    </span>
  ));
  return (
    <div aria-hidden="true" style={{ width: "100%", overflow: "hidden", padding: "18px 0" }}>
      <div className="mp-record-row" style={{ display: "flex", width: "max-content", ["--mp-row-time" as string]: `${RECORDS.length * 3}s` }}>
        {one(0)}{one(1)}
      </div>
    </div>
  );
}
