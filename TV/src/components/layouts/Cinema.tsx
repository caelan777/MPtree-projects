import { useState } from "react";
import { LayoutGrid, Pause, Play, Shuffle } from "lucide-react";
import { clock, deg } from "../../format";
import { AppRow, Nums, type DayProps } from "./parts";

/** Cinema: always dark. The selected app gets the stage: its name huge at the top
 *  left, with a soft light behind it; the apps stand on one line and the chosen one
 *  rises and turns white. The time sits quietly at the right, the music at the foot. */
export function Cinema({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  // Which card is selected: the stage shows its name. -1 is "All apps".
  const [sel, setSel] = useState(0);
  const app = sel >= 0 ? dock[sel] ?? dock[0] : undefined;
  const title = app ? app.label : "All apps";
  return (
    <div className="ci">
      <div className="ci-back" aria-hidden="true" />
      <div className="ci-feature">
        <div className="kick">Selected</div>
        <h2 className={title.length > 9 ? "long" : undefined}>{title}</h2>
        <p>{app ? "OK opens it." : "OK shows every app on this TV."}</p>
      </div>
      <div className="ci-clock">
        <b>{clock(now)}</b>
        {h.hasWeather && (
          <span>{deg(h.outside, 0)} {h.conditionText.toLowerCase()}{h.inside !== null ? ` · ${deg(h.inside)} inside` : ""}</span>
        )}
      </div>

      <AppRow className="ci-row">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f ci-card" data-f="" data-ok={`Open ${a.label}`} data-default={i === 0 ? "" : undefined}
            onFocus={() => setSel(i)} onClick={() => onOpenApp(a)}>
            {a.image ? <img className={a.isBanner ? "bn" : "ic"} src={a.image} alt="" /> : <span className="glyph">{a.label.slice(0, 2)}</span>}
            <span className="nm">{a.label}</span>
          </button>
        ))}
        <button key="all" className="f ci-card add" data-f="" data-ok="See all apps on this TV" onFocus={() => setSel(-1)} onClick={onAllApps}>
          <LayoutGrid size={44} />
          <span className="nm">All apps</span>
        </button>
      </AppRow>

      <div className="ci-foot">
        <div className="ci-chips">
          {m ? (
            <button className="f ci-chip" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>
              {m.playing ? <Pause size={22} /> : <Play size={22} />}<span className="ttl">{m.title}</span><span className="dim">{m.where}</span>
            </button>
          ) : shuffle ? (
            <button className="f ci-chip" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}><Shuffle size={22} />Shuffle music</button>
          ) : null}
        </div>
        <Nums stats={stats} className="nums ci-nums" />
      </div>
    </div>
  );
}
