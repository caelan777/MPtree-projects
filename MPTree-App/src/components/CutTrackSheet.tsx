import { useState, useEffect } from "react";
import { registerPlugin } from "@capacitor/core";
import { makeSH, type T } from "../themes";
import type { Song } from "../types";
import { IC } from "./Icons";

type AudioPlayerPlugin = {
  play(options: { path: string; title?: string; artist?: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getCurrentPosition(): Promise<{ position: number }>;
  getDuration(): Promise<{ duration: number }>;
  seekTo(options: { milliseconds: number }): Promise<void>;
};
const AudioPlayer = registerPlugin<AudioPlayerPlugin>("AudioPlayer");

// ─── CUT TRACK SHEET ─────────────────────────────────────────────────────────
// Pick the piece of a song you want to keep, and save it as its own track.
//
// This used to carry three sliders (a preview scrubber plus start and end), a
// separate waveform strip that repeated what the sliders already said, and a
// row of three preview buttons — six controls for what is really two decisions.
// It is now: drag START, drag END, press Play to hear it, name it, save.
// The bar at the top is the ONLY position readout, and pressing Play always
// previews the selection from its start, so there is no third position to
// keep track of.

type CutTrackSheetProps = {
  song: Song;
  totalMs: number;
  onSave: (startMs: number, endMs: number, newName: string) => void;
  onClose: () => void;
  T: T;
};

const MIN_LEN = 1000;

export function CutTrackSheet({ song, totalMs, onSave, onClose, T }: CutTrackSheetProps) {
  const total = totalMs > 0 ? totalMs : 240000;
  const [startMs,   setStartMs]   = useState(song.cutFrom ?? 0);
  const [endMs,     setEndMs]     = useState(song.cutTo ?? total);
  const [newName,   setNewName]   = useState(song.title + " (cut)");
  const [previewMs, setPreviewMs] = useState(song.cutFrom ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded,  setIsLoaded]  = useState(false);
  const sh = makeSH(T);

  const fmt = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await AudioPlayer.play({ path: song.uri });
        await AudioPlayer.seekTo({ milliseconds: song.cutFrom ?? 0 });
        await AudioPlayer.pause();
        if (!cancelled) setIsLoaded(true);
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      AudioPlayer.pause().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While previewing, follow the position and stop the moment the selection
  // ends — the preview is the selection, not the whole song.
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(async () => {
      try {
        const { position } = await AudioPlayer.getCurrentPosition();
        setPreviewMs(position);
        if (position >= endMs - 300) {
          await AudioPlayer.pause();
          setIsPlaying(false);
          setPreviewMs(startMs);
        }
      } catch { /* ignore */ }
    }, 200);
    return () => clearInterval(iv);
  }, [isPlaying, endMs, startMs]);

  const togglePreview = async () => {
    if (!isLoaded) return;
    if (isPlaying) {
      await AudioPlayer.pause();
      setIsPlaying(false);
      return;
    }
    // Always from the start of the selection: one button, one meaning.
    await AudioPlayer.seekTo({ milliseconds: startMs });
    setPreviewMs(startMs);
    await AudioPlayer.resume();
    setIsPlaying(true);
  };

  // Moving a handle stops the preview and parks the playhead on that handle, so
  // the bar always shows what you just dragged.
  const scrubTo = async (ms: number) => {
    setPreviewMs(ms);
    if (isPlaying) { await AudioPlayer.pause().catch(() => {}); setIsPlaying(false); }
    try { await AudioPlayer.seekTo({ milliseconds: ms }); } catch { /* ignore */ }
  };

  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / total) * 100))}%`;

  return (
    <div style={sh.overlay}>
      <div style={{ ...sh.sheet, paddingBottom: 32 }}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Cut track</div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {song.title}
            </div>
          </div>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ padding: "0 20px" }}>
          {/* The one position readout: full song in grey, the kept piece
              highlighted, the playhead on top. */}
          <div style={{ position: "relative", height: 34, marginTop: 4 }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 8, borderRadius: 4, background: T.dim, transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: pct(startMs), width: pct(endMs - startMs), height: 8, borderRadius: 4, background: T.accent, transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: pct(previewMs), transform: "translate(-50%,-50%)", width: 2, height: 22, borderRadius: 1, background: T.heart, transition: isPlaying ? "left 0.2s linear" : "none" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginBottom: 18 }}>
            <span>{fmt(0)}</span>
            <span style={{ color: T.text, fontWeight: 700 }}>Keeps {fmt(endMs - startMs)}</span>
            <span>{fmt(total)}</span>
          </div>

          {/* Two decisions, one slider each. */}
          <Handle
            label="Start" value={startMs} T={T} fmt={fmt}
            min={0} max={total}
            onChange={v => { if (v <= endMs - MIN_LEN) { setStartMs(v); void scrubTo(v); } }}
          />
          <Handle
            label="End" value={endMs} T={T} fmt={fmt}
            min={0} max={total}
            onChange={v => { if (v >= startMs + MIN_LEN) { setEndMs(v); void scrubTo(v); } }}
          />

          {/* One preview button. It always plays the selection. */}
          <button
            onClick={togglePreview}
            disabled={!isLoaded}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              width: "100%", marginTop: 20, padding: "12px 0",
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
              color: T.text, fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: isLoaded ? "pointer" : "default", opacity: isLoaded ? 1 : 0.45,
            }}
          >
            {isPlaying ? <IC.Pause /> : <IC.Play />}
            {isPlaying ? "Stop preview" : "Preview the cut"}
          </button>

          <div style={sh.lbl}>Save as</div>
          <input value={newName} onChange={e => setNewName(e.target.value)} style={sh.inp} />
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
            Saved as a new track. The original stays unchanged.
          </div>
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          <button
            onClick={() => onSave(startMs, endMs, newName.trim() || song.title + " (cut)")}
            style={sh.saveBtn}
          >
            Save cut track
          </button>
        </div>
      </div>
    </div>
  );
}

function Handle({ label, value, min, max, onChange, fmt, T }: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void; fmt: (ms: number) => string; T: T;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: T.textSub, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 17, color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={500} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: T.accent }}
      />
    </div>
  );
}
