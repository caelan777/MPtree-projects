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

type CutTrackSheetProps = {
  song: Song;
  totalMs: number;
  onSave: (startMs: number, endMs: number, newName: string) => void;
  onClose: () => void;
  T: T;
};

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
    const s = Math.floor(ms / 1000);
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
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(async () => {
      try {
        const { position } = await AudioPlayer.getCurrentPosition();
        setPreviewMs(position);
        if (position >= endMs - 300) {
          await AudioPlayer.pause();
          setIsPlaying(false);
          setPreviewMs(endMs);
        }
      } catch { /* ignore */ }
    }, 200);
    return () => clearInterval(iv);
  }, [isPlaying, endMs]);

  const handlePreviewToggle = async () => {
    if (!isLoaded) return;
    if (isPlaying) {
      await AudioPlayer.pause();
      setIsPlaying(false);
    } else {
      const seekTarget = previewMs >= endMs - 300 ? startMs : previewMs;
      await AudioPlayer.seekTo({ milliseconds: seekTarget });
      await AudioPlayer.resume();
      setIsPlaying(true);
    }
  };

  const seekPreviewTo = async (ms: number) => {
    setPreviewMs(ms);
    try { await AudioPlayer.seekTo({ milliseconds: ms }); } catch { /* ignore */ }
  };

  return (
    <div style={sh.overlay}>
      <div style={{ ...sh.sheet, paddingBottom: 32 }}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Cut Track</span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>
        <div style={{ padding: "0 20px" }}>
          {/* Visual waveform bar */}
          <div style={{ position: "relative", height: 44, marginBottom: 8, marginTop: 8 }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 6, borderRadius: 3, background: T.dim, transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: `${(startMs / total) * 100}%`, width: `${((endMs - startMs) / total) * 100}%`, height: 6, borderRadius: 3, background: T.violet + "66", transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: `${(previewMs / total) * 100}%`, transform: "translate(-50%,-50%)", width: 3, height: 20, borderRadius: 2, background: T.violet, transition: "left 0.1s linear" }} />
            <div style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", left: `${(startMs / total) * 100}%`, width: 18, height: 18, borderRadius: "50%", background: "#fff", border: `2px solid ${T.violet}`, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 2 }} />
            <div style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", left: `${(endMs / total) * 100}%`, width: 18, height: 18, borderRadius: "50%", background: "#fff", border: `2px solid ${T.violet}`, boxShadow: "0 2px 8px rgba(0,0,0,0.3)", zIndex: 2 }} />
          </div>

          <input type="range" min={0} max={total} value={previewMs} step={500}
            onChange={async e => { await seekPreviewTo(Number(e.target.value)); }}
            style={{ width: "100%", accentColor: T.violet, marginBottom: 4 }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, marginBottom: 12 }}>
            <span>{fmt(previewMs)}</span>
            <span>{fmt(total)}</span>
          </div>

          {/* Preview controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18 }}>
            <button onClick={() => seekPreviewTo(startMs)}
              style={{ padding: "8px 14px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 13, fontWeight: "600", cursor: "pointer" }}>
              ⏮ Start
            </button>
            <button onClick={handlePreviewToggle} disabled={!isLoaded}
              style={{ width: 48, height: 48, borderRadius: "50%", background: T.violet, border: "none", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: isLoaded ? "pointer" : "default", opacity: isLoaded ? 1 : 0.45,
                boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}>
              {isPlaying ? <IC.Pause /> : <IC.Play />}
            </button>
            <button onClick={() => seekPreviewTo(Math.max(0, endMs - 5000))}
              style={{ padding: "8px 14px", background: T.dim, border: "none", borderRadius: 8, color: T.text, fontSize: 13, fontWeight: "600", cursor: "pointer" }}>
              End ⏭
            </button>
          </div>

          <div style={sh.lbl}>Start — {fmt(startMs)}</div>
          <input type="range" min={0} max={total} value={startMs} step={1000}
            onChange={async e => {
              const v = Number(e.target.value);
              if (v < endMs - 5000) { setStartMs(v); await seekPreviewTo(v); }
            }}
            style={{ width: "100%", accentColor: T.violet }} />

          <div style={{ ...sh.lbl, marginTop: 14 }}>End — {fmt(endMs)}</div>
          <input type="range" min={0} max={total} value={endMs} step={1000}
            onChange={async e => {
              const v = Number(e.target.value);
              if (v > startMs + 5000) { setEndMs(v); await seekPreviewTo(Math.max(0, v - 5000)); }
            }}
            style={{ width: "100%", accentColor: T.violet }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginTop: 4, marginBottom: 14 }}>
            <span>Duration: {fmt(endMs - startMs)}</span>
            <span style={{ color: T.violet, fontWeight: "600" }}>{fmt(startMs)} → {fmt(endMs)}</span>
          </div>

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
            Save Cut Track
          </button>
        </div>
      </div>
    </div>
  );
}