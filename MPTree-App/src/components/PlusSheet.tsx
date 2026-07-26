import { useState } from "react";
import { makeSH, type T } from "../themes";
import { IC } from "./Icons";

// ─── PLUS SHEET ──────────────────────────────────────────────────────────────

type PlusSheetProps = {
  url: string;
  binCount: number;
  onSave: (u: string) => void;
  onViewBin: () => void;
  onClose: () => void;
  T: T;
};

export function PlusSheet({ url, binCount, onSave, onViewBin, onClose, T }: PlusSheetProps) {
  const [val, setVal] = useState(url);
  const sh = makeSH(T);

  return (
    <div style={sh.overlay}>
      <div style={{ ...sh.sheet, paddingBottom: 32 }}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>Download</span>
          <button onClick={onClose} style={sh.xBtn}><IC.Close /></button>
        </div>
        <div style={{ padding: "0 20px" }}>
          <div style={sh.lbl}>URL (opened when you tap +)</div>
          <input
            value={val} onChange={e => setVal(e.target.value)}
            placeholder="https://…" style={sh.inp}
            autoCapitalize="none" autoCorrect="off"
          />
        </div>
        <div style={{ padding: "0 20px", marginTop: 4 }}>
          <div style={sh.lbl}>Library</div>
          <button
            onClick={() => { onSave(val.trim() || url); onViewBin(); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: T.dim, border: "none", borderRadius: 12, padding: "14px 16px", cursor: "pointer", color: T.text }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
              <IC.Bin /><span>Removed songs</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {binCount > 0 && (
                <span style={{ background: T.heart, color: "#fff", borderRadius: 10, padding: "2px 8px", fontSize: 12, fontWeight: "700" }}>
                  {binCount}
                </span>
              )}
              <IC.ChevronR />
            </div>
          </button>
        </div>
        <div style={{ padding: "20px 20px 0" }}>
          <button onClick={() => { onSave(val.trim() || url); onClose(); }} style={sh.saveBtn}>
            Save URL
          </button>
        </div>
      </div>
    </div>
  );
}