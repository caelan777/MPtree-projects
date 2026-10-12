import { useState, useEffect, useRef } from "react";
import { makeSH, type T } from "../themes";
import { t } from "../i18n";
import type { Song } from "../types";
import { IC } from "./Icons";
import { AudioPlayer } from "../plugins";

// ─── CUT TRACK SHEET ─────────────────────────────────────────────────────────
// Pick the piece of a song you want to keep, and save it as its own track.
//
// One bar, two grips. It used to be a bar that could not be touched with two
// separate sliders under it, each running the whole length of the song, and
// nothing tied the three together. Now the grips sit on the bar itself, the
// time of each is written above it, and the small buttons move a grip by a
// tenth of a second for the last bit of precision a finger does not have.
//
// Nothing plays until it is asked to. Listening is from the start of the piece
// or to its last seconds, because those are the two edges being judged.

// Which formats come out as a file of their own on this platform.
const FILE_FORMATS = "MP3 and AAC";

type CutTrackSheetProps = {
  song: Song;
  totalMs: number;
  onSave: (startMs: number, endMs: number, newName: string) => void;
  onClose: () => void;
  T: T;
};

const MIN_LEN = 1000;
const STEP = 100;
const TAIL = 3000;
const GRIP = 26;

type Grip = "start" | "end";
type Listening = "start" | "tail" | null;

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
  const [listening, setListening] = useState<Listening>(null);
  const listeningRef = useRef<Listening>(null);
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
    setListening(null);
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

  const listen = async (what: Exclude<Listening, null>) => {
    if (listening === what) { await stop(); return; }
    const from = what === "start" ? startMs : Math.max(startMs, endMs - TAIL);
    setPlayheadMs(from);
    setListening(what);
    try {
      await AudioPlayer.play({ path: song.uri, title: song.title, artist: song.artist, cutFrom: Math.round(from) });
    } catch { setListening(null); setPlayheadMs(null); }
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
      fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
    }}>{fmt(ms)}</div>
  );

  const nudgeBtn: React.CSSProperties = {
    width: 44, height: 36, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`,
    color: T.text, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  };
  const nudgeRow = (which: Grip, name: string, ms: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
      <span style={{ flex: 1, fontSize: 14, color: T.textSub, fontWeight: 600 }}>{name}</span>
      <button aria-label={t("{name}: 0.1 s earlier", { name })} onClick={() => move(which, ms - STEP)} style={nudgeBtn}>−0.1</button>
      <span style={{ width: 64, textAlign: "center", fontSize: 16, color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(ms)}</span>
      <button aria-label={t("{name}: 0.1 s later", { name })} onClick={() => move(which, ms + STEP)} style={nudgeBtn}>+0.1</button>
    </div>
  );

  const listenBtn = (what: Exclude<Listening, null>, text: string) => {
    const on = listening === what;
    return (
      <button
        onClick={() => listen(what)}
        disabled={!ready}
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "11px 6px", borderRadius: 12, fontSize: 13.5, fontWeight: 700, fontFamily: "inherit",
          background: on ? T.accent : T.surface, color: on ? T.playBtnFg : T.text,
          border: `1px solid ${on ? T.accent : T.border}`, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.45,
        }}
      >
        {on ? <IC.Pause /> : <IC.Play />}
        {on ? t("Stop") : text}
      </button>
    );
  };

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
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>
            {t("Drag the two grips to the part you want to keep.")}
          </div>

          {/* The bar. Its side margins leave room for a grip at either end. */}
          <div style={{ margin: `0 ${GRIP / 2}px`, opacity: ready ? 1 : 0.45 }}>
            <div
              ref={bar}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
              style={{ position: "relative", height: 74, touchAction: "none", cursor: ready ? "pointer" : "default" }}
            >
              {label(startMs, "left")}
              {label(endMs, "right")}
              <div style={{ position: "absolute", left: 0, right: 0, top: 28, height: 46 }}>
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

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginTop: 2 }}>
            <span>{fmt(0)}</span>
            <span style={{ color: T.text, fontWeight: 700 }}>{t("Keeps {len}", { len: fmt(endMs - startMs) })}</span>
            <span>{fmt(total)}</span>
          </div>

          {nudgeRow("start", t("Start"), startMs)}
          {nudgeRow("end", t("End"), endMs)}

          <div style={sh.lbl}>{t("Listen")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            {listenBtn("start", t("From the start"))}
            {listenBtn("tail", t("The last 3 seconds"))}
          </div>

          <div style={sh.lbl}>{t("Save as")}</div>
          <input value={newName} onChange={e => setNewName(e.target.value)} style={sh.inp} />
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
            {t("{formats} become a new file in Music/MPTree. Other formats are kept as a cut inside MPTree. The original stays unchanged.", { formats: t(FILE_FORMATS) })}
          </div>
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
