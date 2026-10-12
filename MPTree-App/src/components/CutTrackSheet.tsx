import { useState, useEffect, useRef } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import type { Song } from "../types";
import { IC } from "./Icons";
import { AudioPlayer } from "../plugins";

// ─── CUT TRACK SHEET ─────────────────────────────────────────────────────────
// Pick the piece of a song you want to keep, and save it as its own track.
//
// One bar with two grips, one button to hear the piece, a name, and Save.
// Nothing else: buttons to move a grip by a tenth of a second and a second
// way of listening were here for a while, and made a small job look like a
// big one. The grips move in tenths, which a finger on the bar can reach.
//
// Nothing plays until it is asked to.

type CutTrackSheetProps = {
  song: Song;
  totalMs: number;
  onSave: (startMs: number, endMs: number, newName: string) => void;
  onClose: () => void;
  T: T;
};

const MIN_LEN = 1000;
const STEP = 100;
const GRIP = 28;

type Grip = "start" | "end";

const fmt = (ms: number) => {
  const tenths = Math.max(0, Math.round(ms / 100));
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}.${tenths % 10}`;
};

export function CutTrackSheet({ song, totalMs, onSave, onClose, T }: CutTrackSheetProps) {
  // The length comes with the song. A file that never said how long it is gets
  // asked once, loaded but not started.
  const [total, setTotal] = useState(totalMs > 0 ? totalMs : 0);
  const [startMs, setStartMs] = useState(song.cutFrom ?? 0);
  const [endMs, setEndMs] = useState(song.cutTo ?? totalMs);
  const fallbackName = t("{title} (cut)", { title: song.title });
  const [newName, setNewName] = useState(fallbackName);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const listeningRef = useRef(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  const bar = useRef<HTMLDivElement>(null);
  const held = useRef<Grip | null>(null);
  const sh = makeSH(T);

  useEffect(() => {
    if (total > 0) return;
    let off = false;
    (async () => {
      try {
        await AudioPlayer.play({ path: song.uri, title: song.title, artist: song.artist });
        await AudioPlayer.pause();
        for (let i = 0; i < 30 && !off; i++) {
          const { duration } = await AudioPlayer.getDuration();
          if (duration > 0) { setTotal(duration); setEndMs(e => (e > 0 ? e : duration)); return; }
          await new Promise(r => setTimeout(r, 100));
        }
      } catch { /* the sheet stays as it is: nothing to cut without a length */ }
    })();
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the sheet ends what it started.
  useEffect(() => () => { if (listeningRef.current) AudioPlayer.pause().catch(() => {}); }, []);

  const stop = async () => {
    setListening(false);
    setPlayheadMs(null);
    await AudioPlayer.pause().catch(() => {});
  };

  // While listening, follow the position and stop where the piece ends.
  useEffect(() => {
    if (!listening) return;
    const iv = setInterval(async () => {
      try {
        const { position } = await AudioPlayer.getCurrentPosition();
        // 0 while the file is still loading; the playhead waits where it is.
        if (position > 0) setPlayheadMs(position);
        if (position >= endMs - 60) void stop();
      } catch { /* ignore */ }
    }, 100);
    return () => clearInterval(iv);
  }, [listening, endMs]);

  const listen = async () => {
    if (listening) { await stop(); return; }
    setPlayheadMs(startMs);
    setListening(true);
    try {
      await AudioPlayer.play({ path: song.uri, title: song.title, artist: song.artist, cutFrom: Math.round(startMs) });
    } catch { setListening(false); setPlayheadMs(null); }
  };

  const move = (grip: Grip, ms: number) => {
    if (listeningRef.current) void stop();
    const v = Math.round(ms / STEP) * STEP;
    if (grip === "start") setStartMs(Math.min(Math.max(0, v), endMs - MIN_LEN));
    else setEndMs(Math.max(Math.min(total, v), startMs + MIN_LEN));
  };

  const msAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * total;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!total) return;
    const ms = msAt(e.clientX);
    // The nearer grip is the one meant; touching the bar brings it there.
    const grip: Grip = Math.abs(ms - startMs) <= Math.abs(ms - endMs) ? "start" : "end";
    held.current = grip;
    e.currentTarget.setPointerCapture(e.pointerId);
    move(grip, ms);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (held.current) move(held.current, msAt(e.clientX));
  };
  const onUp = () => { held.current = null; };

  const pct = (ms: number) => (total > 0 ? Math.min(100, Math.max(0, (ms / total) * 100)) : 0);
  const ready = total > 0;

  const grip = (ms: number) => (
    <div style={{
      position: "absolute", top: "50%", left: `${pct(ms)}%`, width: GRIP, height: GRIP,
      transform: "translate(-50%,-50%)", borderRadius: "50%", boxSizing: "border-box",
      background: T.sheetBg, border: `3px solid ${T.accent}`, pointerEvents: "none",
    }} />
  );

  const label = (ms: number, align: "left" | "right") => (
    <div style={{
      position: "absolute", top: 0, left: `${pct(ms)}%`,
      transform: `translateX(${align === "left" ? "-20%" : "-80%"})`,
      fontSize: 14, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    }}>{fmt(ms)}</div>
  );

  return (
    <div style={sh.overlay}>
      <div style={{ ...sh.sheet, paddingBottom: 32 }}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: "700", color: T.text }}>{t("Cut track")}</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {song.title}
            </div>
          </div>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ padding: "0 20px" }}>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 12 }}>
            {t("Drag the two grips to the part you want to keep.")}
          </div>

          {/* The bar. Its side margins leave room for a grip at either end. */}
          <div style={{ margin: `0 ${GRIP / 2}px`, opacity: ready ? 1 : 0.45 }}>
            <div
              ref={bar}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ position: "relative", height: 76, touchAction: "none", cursor: ready ? "pointer" : "default" }}
            >
              {label(startMs, "left")}
              {label(endMs, "right")}
              <div style={{ position: "absolute", left: 0, right: 0, top: 28, height: 48 }}>
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 10, borderRadius: 5, background: T.dim, transform: "translateY(-50%)" }} />
                <div style={{ position: "absolute", top: "50%", left: `${pct(startMs)}%`, width: `${pct(endMs) - pct(startMs)}%`, height: 10, background: T.accent, transform: "translateY(-50%)" }} />
                {playheadMs != null && (
                  <div style={{ position: "absolute", top: "50%", left: `${pct(playheadMs)}%`, transform: "translate(-50%,-50%)", width: 2, height: 30, borderRadius: 1, background: T.text, transition: "left 0.1s linear" }} />
                )}
                {grip(startMs)}
                {grip(endMs)}
              </div>
            </div>
          </div>

          <button
            onClick={listen}
            disabled={!ready}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", marginTop: 6, padding: "12px 0", borderRadius: 12,
              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              background: listening ? T.accent : T.surface, color: listening ? T.playBtnFg : T.text,
              border: `1px solid ${listening ? T.accent : T.border}`,
              cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.45,
            }}
          >
            {listening ? <IC.Pause /> : <IC.Play />}
            {listening ? t("Stop") : t("Listen ({len})", { len: fmt(endMs - startMs) })}
          </button>

          <div style={sh.lbl}>{t("Save as")}</div>
          <input value={newName} onChange={e => setNewName(e.target.value)} style={sh.inp} />
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          <button
            disabled={!ready}
            onClick={() => onSave(startMs, endMs, newName.trim() || fallbackName)}
            style={{ ...sh.saveBtn, opacity: ready ? 1 : 0.45 }}
          >
            {t("Save cut track")}
          </button>
        </div>
      </div>
    </div>
  );
}
