import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import type { TvApp } from "../launcher";

/** Two letters for an app without a picture: "YouTube" → "Yt", "HBO Max" → "HM". */
function initials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 1).toUpperCase() + (label[1] ?? "").toLowerCase();
}

type Props = {
  app: TvApp;
  onOpen: () => void;
  /** Holding OK. Only on the Apps page. */
  onLong?: () => void;
  pinned?: boolean;
  isDefault?: boolean;
};

export function AppTile({ app, onOpen, onLong, pinned, isDefault }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onLong) return;
    el.addEventListener("tvlong", onLong);
    return () => el.removeEventListener("tvlong", onLong);
  }, [onLong]);

  const banner = app.image && app.isBanner;
  return (
    <div className="tile">
      <button
        ref={ref}
        className={"f face" + (banner ? " banner" : "")}
        data-f=""
        data-default={isDefault ? "" : undefined}
        data-long={onLong ? "" : undefined}
        onClick={onOpen}
        aria-label={app.label}
      >
        {banner ? (
          <img src={app.image!} alt="" />
        ) : (
          <>
            {app.image ? <img className="icon" src={app.image} alt="" /> : <span className="mk">{initials(app.label)}</span>}
            <span className="nm">{app.label}</span>
          </>
        )}
      </button>
      <span className="label">{banner ? app.label + (pinned ? ", on Home" : "") : pinned ? "On Home" : " "}</span>
    </div>
  );
}

/** The dashed tile at the end of a row. */
export function AddTile({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="tile">
      <button className="f face add" data-f="" onClick={onOpen}>
        <span className="mk add"><Plus size={30} /></span>
        <span className="nm">{label}</span>
      </button>
      <span className="label">{" "}</span>
    </div>
  );
}
