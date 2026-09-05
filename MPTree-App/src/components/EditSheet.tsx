import { useEffect, useRef, useState } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";
import { readCoverPhoto } from "../utils";

// ─── EDIT SHEET ──────────────────────────────────────────────────────────────
//
// FIX: now receives currentPhoto so submitting without changing the photo
// no longer wipes previously stored cover art.
//
// The onSave payload uses three values for customPhoto:
//   undefined  → no change (don't touch stored customPhoto)
//   null       → user explicitly removed the photo
//   string     → new photo data URI

type EditSheetProps = {
  name: string;
  artist: string;
  genre: string;
  currentPhoto?: string;
  /** Open straight onto the photo picker. Used by the menu's "Photo" button,
   *  which is the same edit, just aimed at one field. */
  focusPhoto?: boolean;
  onSave: (u: {
    customName?:   string;
    customArtist?: string;
    customGenre?:  string;
    customPhoto?:  string | null;
  }) => void;
  onClose: () => void;
  T: T;
};

export function EditSheet({ name: initName, artist: initArtist, genre: initGenre, currentPhoto, focusPhoto = false, onSave, onClose, T }: EditSheetProps) {
  const [name,   setName]   = useState(initName);
  const [artist, setArtist] = useState(initArtist);
  const [genre,  setGenre]  = useState(initGenre);
  // undefined = unchanged, null = cleared, string = new photo
  const [photo,  setPhoto]  = useState<string | null | undefined>(undefined);
  const sh = makeSH(T);

  // "Photo" in the song menu opens this sheet aimed at one field, so the picker
  // comes up on its own. The click has to come from a real element rather than
  // input.click() on a detached node, or Android's WebView ignores it.
  const pickerRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!focusPhoto) return;
    const id = setTimeout(() => pickerRef.current?.click(), 260);
    return () => clearTimeout(id);
  }, [focusPhoto]);

  const previewPhoto = photo !== undefined ? photo : currentPhoto;

  const handleSave = () => {
    onSave({
      customName:   name.trim()   || undefined,
      customArtist: artist.trim() || undefined,
      customGenre:  genre.trim()  || undefined,
      // Only include in payload if something actually changed
      ...(photo !== undefined ? { customPhoto: photo } : {}),
    });
  };

  return (
    <div style={sh.overlay}>
      <div style={sh.sheet}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Edit song</span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>
        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>Title</div>
          <input value={name} onChange={e => setName(e.target.value)} style={sh.inp} />
          <div style={sh.lbl}>Artist</div>
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder="Add artist name…" style={sh.inp} />
          <div style={sh.lbl}>Genre</div>
          <input value={genre} onChange={e => setGenre(e.target.value)} placeholder="Add a genre…" style={sh.inp} />
          <div style={sh.lbl}>Cover photo</div>

          {previewPhoto ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: T.inputBg, borderRadius: 10, padding: "10px 14px" }}>
              <img src={previewPhoto} alt="Cover" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover" }} />
              <span style={{ flex: 1, fontSize: 14, color: T.text }}>Cover photo set</span>
              <label style={{ cursor: "pointer" }}>
                <span style={{ fontSize: 13, color: T.text, fontWeight: "600", textDecoration: "underline" }}>Change</span>
                <input ref={pickerRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  readCoverPhoto(f).then(setPhoto).catch(() => {});
                }} />
              </label>
              <button
                onClick={() => setPhoto(null)}
                style={{ background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, display: "flex" }}>
                <IC.Close />
              </button>
            </div>
          ) : (
            <label style={sh.photoRow}>
              <IC.Photo />
              <span style={{ marginLeft: 8, fontSize: 14, color: T.muted }}>Choose from device</span>
              <input ref={pickerRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                readCoverPhoto(f).then(setPhoto).catch(() => {});
              }} />
            </label>
          )}
        </div>
        <div style={{ padding: "20px 20px 0" }}>
          <button onClick={handleSave} style={sh.saveBtn}>Save</button>
        </div>
      </div>
    </div>
  );
}