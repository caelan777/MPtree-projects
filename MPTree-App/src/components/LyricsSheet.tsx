import { useState } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";
import { hasLyrics, parseLrc, stripTimestamps } from "../lyrics";
import { fetchExact, searchLyrics, type LyricsHit } from "../lyricsFetch";
import type { Song } from "../types";

// ─── LYRICS SHEET ────────────────────────────────────────────────────────────
//
// Three ways to get words onto a song, in the order most people will want them:
//
//   Paste        you already have the lyrics. Accepts .lrc as-is, so pasting a
//                timestamped file gets you the karaoke view for free.
//   Search       ask lrclib.net. Off unless asked for, every time.
//   Automatic    do the above by itself for songs with no lyrics yet.
//
// The network is opt-in and says so on the face of it. MPTree is an offline
// player and this is the only thing in it that reaches out, so it is spelled out
// here rather than buried in a settings screen.

type LyricsSheetProps = {
  song: Song;
  dispName: string;
  dispArtist: string;
  /** Whatever is already stored for this song, if anything. */
  current?: string;
  /** Read from a .lrc next to the file. Shown as the fallback, not editable. */
  fromFile?: string;
  autoFetch: boolean;
  onAutoFetchChange: (on: boolean) => void;
  onSave: (lyrics: string | null) => void;
  onClose: () => void;
  T: T;
};

export function LyricsSheet({
  song, dispName, dispArtist, current, fromFile, autoFetch, onAutoFetchChange,
  onSave, onClose, T,
}: LyricsSheetProps) {
  const sh = makeSH(T);
  const [text, setText] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<LyricsHit[] | null>(null);
  const [note, setNote] = useState<string | null>(null);


  const timed = parseLrc(text);
  const lineCount = stripTimestamps(text).split("\n").filter(l => l.trim()).length;

  const runSearch = async () => {
    setBusy(true);
    setNote(null);
    setHits(null);
    try {
      const exact = await fetchExact({
        title: dispName,
        artist: dispArtist,
        album: song.album || undefined,
        durationMs: song.duration,
      });
      if (exact && exact.text) {
        setText(exact.text);
        setNote(exact.synced ? "Found, with timings" : "Found");
        return;
      }
      const found = await searchLyrics({ title: dispName, artist: dispArtist || undefined });
      if (found.length === 0) {
        setNote("Nothing found for this one");
        return;
      }
      setHits(found);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div
        style={{ ...sh.sheet, maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Lyrics</span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 20px 4px" }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dispName}{dispArtist ? " · " + dispArtist : ""}
          </p>

          {hits ? (
            <>
              <div style={{ ...sh.lbl, marginTop: 0 }}>Pick one</div>
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setText(h.text); setHits(null); setNote(h.synced ? "Added, with timings" : "Added"); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                    padding: "10px 12px", marginBottom: 6, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h.title || "Untitled"}
                  </div>
                  <div style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h.artist || "Unknown"}{h.synced ? " · timed" : ""}
                  </div>
                </button>
              ))}
              <button
                onClick={() => setHits(null)}
                style={{ background: "transparent", border: "none", color: T.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}
              >
                Back
              </button>
            </>
          ) : (
            <>
              <div style={{ ...sh.lbl, marginTop: 0 }}>Paste them here</div>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={"Paste lyrics, or an .lrc file with timings like\n[00:12.50]The first line"}
                rows={8}
                style={{
                  ...sh.inp, height: "auto", minHeight: 150, resize: "vertical",
                  lineHeight: 1.6, fontFamily: "inherit",
                }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.muted }}>
                  {hasLyrics(text)
                    ? `${lineCount} line${lineCount === 1 ? "" : "s"}${timed ? ", timed for karaoke" : ""}`
                    : fromFile && hasLyrics(fromFile)
                      ? "A lyrics file next to this song will be used"
                      : "Nothing yet"}
                </span>
              </div>

              <div style={sh.lbl}>Look them up</div>
              <button
                onClick={runSearch}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%",
                  background: T.chipBg, border: `1px solid ${T.chipBorder}`, borderRadius: 10,
                  padding: "12px 14px", color: T.text, fontSize: 14, fontWeight: 700,
                  fontFamily: "inherit", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}
              >
                {IC.Search(T.text)}
                {busy ? "Searching…" : "Search online"}
              </button>
              {note && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: T.muted }}>{note}</p>
              )}

              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14,
                padding: "12px 14px", background: T.card, border: `1px solid ${T.border}`,
                borderRadius: 10, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={autoFetch}
                  onChange={e => onAutoFetchChange(e.target.checked)}
                  style={{ marginTop: 2, accentColor: T.violet, width: 17, height: 17, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
                  Look up lyrics automatically
                  <span style={{ display: "block", fontSize: 12, color: T.muted, marginTop: 3 }}>
                    For songs with none yet, while the player is open.
                  </span>
                </span>
              </label>

              {/* Said plainly, because it is the only thing in MPTree that
                  leaves the device apart from the update check. */}
              <p style={{ margin: "10px 0 0", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                Searching sends this song's title, artist, album and length to
                lrclib.net. Nothing else about you or your library is sent, and
                nothing is sent at all until you search or switch this on.
              </p>
            </>
          )}
        </div>

        <div style={{ padding: "14px 20px 0", display: "flex", gap: 8, flexShrink: 0 }}>
          {current && (
            <button
              onClick={() => onSave(null)}
              style={{
                background: T.binBg, border: `1px solid ${T.binBorder}`, color: "#e8445a",
                borderRadius: 10, padding: "13px 16px", fontSize: 14, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", flexShrink: 0,
              }}
            >
              Remove
            </button>
          )}
          <button
            onClick={() => onSave(text.trim() || null)}
            style={{ ...sh.saveBtn, flex: 1, marginTop: 0 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
