import { useState } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";

// ─── LYRICS SHEET ────────────────────────────────────────────────────────────
//
// Two ways to get words onto a song, and this sheet is also where you read them.
//
//   Paste         type or paste them in.
//   Search online opens your browser on a search for this song's lyrics.
//
// MPTree does not fetch lyrics itself. An earlier version called a lyrics API
// directly, which meant the app was quietly making requests about your music;
// handing the search to your browser keeps that decision, and the request, on
// your side of the line. Nothing here leaves the device until you tap Search,
// and then it leaves as a search you can see.

type LyricsSheetProps = {
  dispName: string;
  dispArtist: string;
  /** Whatever is already stored for this song, if anything. */
  current?: string;
  onSave: (lyrics: string | null) => void;
  /** Opens a web search for these lyrics in the user's own browser. */
  onSearchOnline: () => void;
  onClose: () => void;
  T: T;
};

export function LyricsSheet({
  dispName, dispArtist, current, onSave, onSearchOnline, onClose, T,
}: LyricsSheetProps) {
  const sh = makeSH(T);
  const [text, setText] = useState(current ?? "");

  const lineCount = text.split("\n").filter(l => l.trim()).length;

  // Above the expanded player rather than level with it. makeSH.overlay is
  // zIndex 400 and so is the player, so at equal depth whichever renders last
  // wins, and this opened behind it.
  return (
    <div style={{ ...sh.overlay, zIndex: 420 }} onClick={onClose}>
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
          <p style={{ margin: "0 0 4px", fontSize: 13, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {dispName}{dispArtist ? " · " + dispArtist : ""}
          </p>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste the lyrics here…"
            rows={12}
            style={{
              ...sh.inp, height: "auto", minHeight: 240, resize: "vertical",
              lineHeight: 1.7, fontFamily: "inherit", marginTop: 10,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: T.muted }}>
              {lineCount > 0 ? `${lineCount} line${lineCount === 1 ? "" : "s"}` : "Nothing yet"}
            </span>
            <button
              onClick={onSearchOnline}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "transparent", border: `1px solid ${T.chipBorder}`,
                borderRadius: 20, padding: "7px 13px", color: T.text,
                fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {IC.Search(T.text)}
              Search online
            </button>
          </div>

          <p style={{ margin: "10px 0 0", fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
            Search opens your browser and looks up this song's lyrics. Copy what
            you find and paste it above.
          </p>
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
