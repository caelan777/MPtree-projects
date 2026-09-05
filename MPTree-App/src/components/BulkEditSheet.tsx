import { useRef, useState } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";
import { readCoverPhoto } from "../utils";

// ─── BULK EDIT SHEET ─────────────────────────────────────────────────────────
//
// Edit artist, genre and cover for a whole selection at once. Title is
// deliberately absent: a title is the one field that is genuinely per-song, and
// setting fifty songs to the same name is never what anyone wants.
//
// Blank means "leave alone", which is what makes this safe to open on a large
// selection. That has to be explicit in the UI, because the alternative reading
// ("blank it out") would quietly wipe artists off fifty tracks. Clearing is
// possible, but only by asking for it.

export type BulkEdit = {
  customArtist?: string | null;
  customGenre?:  string | null;
  customPhoto?:  string | null;
};

type BulkEditSheetProps = {
  count: number;
  onSave: (u: BulkEdit) => void;
  onClose: () => void;
  T: T;
};

export function BulkEditSheet({ count, onSave, onClose, T }: BulkEditSheetProps) {
  const sh = makeSH(T);
  const [artist, setArtist] = useState("");
  const [genre,  setGenre]  = useState("");
  // undefined = untouched, null = clear it, string = this new photo
  const [photo,  setPhoto]  = useState<string | null | undefined>(undefined);
  const [clearArtist, setClearArtist] = useState(false);
  const [clearGenre,  setClearGenre]  = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const artistChange = clearArtist ? null : (artist.trim() || undefined);
  const genreChange  = clearGenre  ? null : (genre.trim()  || undefined);
  const nothingToDo = artistChange === undefined && genreChange === undefined && photo === undefined;

  const handleSave = () => {
    if (nothingToDo) return;
    onSave({
      ...(artistChange !== undefined ? { customArtist: artistChange } : {}),
      ...(genreChange  !== undefined ? { customGenre:  genreChange  } : {}),
      ...(photo        !== undefined ? { customPhoto:  photo        } : {}),
    });
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button
      onClick={() => set(!on)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: on ? T.violet + "22" : "transparent",
        border: `1px solid ${on ? T.violet : T.border}`,
        color: on ? T.violet : T.muted,
        borderRadius: 20, padding: "5px 11px", marginTop: 8,
        fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {on && IC.Check(T.violet)}{label}
    </button>
  );

  return (
    <div style={sh.overlay} onClick={onClose}>
      <div style={sh.sheet} onClick={e => e.stopPropagation()}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>
            Edit {count} song{count === 1 ? "" : "s"}
          </span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>

        <div style={{ padding: "0 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            Anything you leave blank stays as it is. Titles are not changed here,
            since those belong to individual songs.
          </p>

          <div style={sh.lbl}>Artist</div>
          <input
            value={artist} disabled={clearArtist}
            onChange={e => setArtist(e.target.value)}
            placeholder={clearArtist ? "Will be cleared" : "Leave blank to keep"}
            style={{ ...sh.inp, opacity: clearArtist ? 0.5 : 1 }}
          />
          {toggle(clearArtist, setClearArtist, "Clear artist instead")}

          <div style={sh.lbl}>Genre</div>
          <input
            value={genre} disabled={clearGenre}
            onChange={e => setGenre(e.target.value)}
            placeholder={clearGenre ? "Will be cleared" : "Leave blank to keep"}
            style={{ ...sh.inp, opacity: clearGenre ? 0.5 : 1 }}
          />
          {toggle(clearGenre, setClearGenre, "Clear genre instead")}

          <div style={sh.lbl}>Cover photo</div>
          {photo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: T.inputBg, borderRadius: 10, padding: "10px 14px" }}>
              <img src={photo} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }} />
              <span style={{ flex: 1, fontSize: 14, color: T.text }}>
                Will be set on all {count}
              </span>
              <button onClick={() => setPhoto(undefined)} style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, display: "flex" }}>
                <IC.Close />
              </button>
            </div>
          ) : (
            <>
              <label style={sh.photoRow}>
                <IC.Photo />
                <span style={{ marginLeft: 8, fontSize: 14, color: T.muted }}>
                  {photo === null ? "Photos will be removed" : "Choose one for all of them"}
                </span>
                <input
                  ref={pickerRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    readCoverPhoto(f).then(setPhoto).catch(() => {});
                  }}
                />
              </label>
              {toggle(photo === null, on => setPhoto(on ? null : undefined), "Remove photos instead")}
            </>
          )}
        </div>

        <div style={{ padding: "20px 20px 0" }}>
          <button
            onClick={handleSave}
            disabled={nothingToDo}
            style={{ ...sh.saveBtn, opacity: nothingToDo ? 0.45 : 1, cursor: nothingToDo ? "default" : "pointer" }}
          >
            {nothingToDo ? "Nothing to change" : `Apply to ${count} song${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
