import { makeSH, type T } from "../themes";
import { IC } from "./Icons";

type ConfirmSheetProps = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  T: T;
};

export function ConfirmSheet({ title, body, confirmLabel, onConfirm, onCancel, T }: ConfirmSheetProps) {
  const sh = makeSH(T);
  return (
    <div style={sh.overlay}>
      <div style={sh.sheet}>
        <div style={sh.handle} />
        <div style={sh.hdr}>
          <span style={{ fontSize: 16, fontWeight: "700", color: T.text }}>{title}</span>
          <button onClick={onCancel} style={sh.xBtn}><IC.Close /></button>
        </div>
        <div style={{ padding: "0 20px 20px" }}>
          <p style={{ color: T.textSub, fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>{body}</p>
          <button
            onClick={onConfirm}
            style={{ ...sh.saveBtn, background: "#e8445a" }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ ...sh.saveBtn, background: T.dim, color: T.text, marginTop: 10 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}