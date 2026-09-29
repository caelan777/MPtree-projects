import { useMemo, useState } from "react";
import { makeSH, type T } from "../themes";
import type { Song, SongMeta } from "../types";
import { t, tn } from "../i18n";
import { IC } from "./Icons";
import type { Suspect } from "../cleanup";

// ─── CLEAN UP (Pro) ──────────────────────────────────────────────────────────
// Android already leaves ringtones, alarms and notification sounds out of the
// scan (MusicScanner only asks for IS_MUSIC), but plenty of other audio is
// filed as music: WhatsApp voice notes, recordings, clips. This finds what is
// probably not a song and lets the person decide, one tick at a time. Nothing
// is deleted: it goes to the bin, where it can be put back.

type CleanupSheetProps = {
  suspects: Suspect[];
  meta: Record<string, SongMeta>;
  onBin: (ids: string[]) => void;
  /** Plays one of them, with the list as the queue, to hear what it is. */
  onPlay: (song: Song, list: Song[]) => void;
  onTogglePlay: () => void;
  currentSongId: string | null;
  isPlaying: boolean;
  onClose: () => void;
  T: T;
};

const fmt = (ms?: number) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CleanupSheet({ suspects, meta, onBin, onPlay, onTogglePlay, currentSongId, isPlaying, onClose, T }: CleanupSheetProps) {
  const sh = makeSH(T);
  // Everything starts ticked: the list is what the person asked to find, and
  // unticking the odd real song is less work than ticking forty voice notes.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suspects.map(x => x.song.id)));

  const reason = useMemo(() => ({
    messenger: t("Chat app"),
    recording: t("Recording"),
    short: t("Under a minute"),
  }), []);

  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const all = picked.size === suspects.length;

  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={onClose}>
      <div style={{ ...sh.sheet, paddingBottom: 0, height: "86vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{t("Clean up")}</span>
          <button onClick={onClose} style={sh.xBtn} aria-label={t("Close")}><IC.Close /></button>
        </div>

        {suspects.length === 0 ? (
          <div style={{ padding: "30px 28px", textAlign: "center", color: T.textSub, fontSize: 14, lineHeight: 1.6 }}>
            {t("Nothing to clean up. Everything in your library looks like a song.")}
          </div>
        ) : (
          <>
            <div style={{ padding: "0 20px 10px", fontSize: 13, color: T.textSub, lineHeight: 1.5 }}>
              {t("These are probably not songs: voice notes, recordings and clips under a minute. Untick anything you want to keep.")}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 8px" }}>
              <span style={{ fontSize: 12, color: T.muted }}>{tn(suspects.length, "{n} found", "{n} found")}</span>
              <button
                onClick={() => setPicked(all ? new Set() : new Set(suspects.map(x => x.song.id)))}
                style={{ background: "transparent", border: "none", color: T.text, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 4 }}
              >
                {all ? t("Untick all") : t("Tick all")}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", borderTop: `1px solid ${T.dim}` }}>
              {suspects.map(({ song, why }) => {
                const on = picked.has(song.id);
                const m = meta[song.id] || {};
                const folder = song.uri.split("/").slice(-2, -1)[0] || "";
                const current = song.id === currentSongId;
                return (
                  <div
                    key={song.id}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(song.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                      padding: "11px 20px", background: "transparent", border: "none",
                      borderBottom: `1px solid ${T.dim}`, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "grid", placeItems: "center",
                      // Violet is the selection colour, and this is a selection.
                      background: on ? T.violet : "transparent",
                      border: `2px solid ${on ? T.violet : T.muted}`,
                    }}>
                      {on && IC.Check("#fff")}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.customName || song.title}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                        {reason[why]}{folder ? ` · ${folder}` : ""}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, color: T.muted, flexShrink: 0 }}>{fmt(song.duration)}</span>
                    {/* Hear it before deciding. The list itself is the queue,
                        so next goes to the next suspect, not into the library. */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (current) onTogglePlay();
                        else onPlay(song, suspects.map(x => x.song));
                      }}
                      aria-label={current && isPlaying ? t("Pause") : t("Play")}
                      style={{
                        width: 34, height: 34, borderRadius: 17, flexShrink: 0, display: "grid", placeItems: "center",
                        background: current ? T.accent : T.dim, color: current ? T.playBtnFg : T.text,
                        border: "none", cursor: "pointer", padding: 0,
                      }}
                    >
                      {current && isPlaying
                        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "12px 20px 28px", flexShrink: 0, borderTop: `1px solid ${T.dim}` }}>
              <button
                onClick={() => onBin([...picked])}
                disabled={picked.size === 0}
                style={{ ...sh.saveBtn, opacity: picked.size === 0 ? 0.5 : 1 }}
              >
                {tn(picked.size, "Move {n} to bin", "Move {n} to bin")}
              </button>
              <div style={{ fontSize: 12, color: T.muted, textAlign: "center", marginTop: 8 }}>
                {t("Nothing is deleted. You can put them back from the bin.")}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
