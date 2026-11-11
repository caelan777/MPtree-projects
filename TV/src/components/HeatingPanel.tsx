import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Power } from "lucide-react";
import { num, type Ha } from "../ha";
import { HA } from "../homeConfig";
import { deg } from "../format";
import { focusFirst } from "../nav";

type Props = { ha: Ha; toast: (m: string) => void; onClose: () => void };

/** The heating, big: − and + change the set temperature half a degree a press
 *  (sent a moment after the last press), Power turns it on or off. Back or Done closes. */
export function HeatingPanel({ ha, toast, onClose }: Props) {
  const e = ha.states[HA.heating];
  const on = !!e && e.state !== "off" && e.state !== "unavailable";
  const target = num(e, "temperature");
  const current = num(e, "current_temperature");
  const min = num(e, "min_temp") ?? 5;
  const max = num(e, "max_temp") ?? 30;
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const send = useRef<number | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { focusFirst(root.current ?? document); }, []);
  useEffect(() => () => window.clearTimeout(send.current), []);

  const step = (by: number) => {
    const next = Math.min(max, Math.max(min, (draftRef.current ?? target ?? 20) + by));
    draftRef.current = next;
    setDraft(next);
    window.clearTimeout(send.current);
    send.current = window.setTimeout(() => {
      ha.patch(HA.heating, { attributes: { temperature: next } });
      ha.call("climate", "set_temperature", { entity_id: HA.heating, temperature: next })
        .then(() => toast(`Heating set to ${deg(next)}`), err => toast(err.message))
        .finally(() => { draftRef.current = null; setDraft(null); });
    }, 900);
  };

  const power = () => {
    const mode = on ? "off" : "heat";
    ha.patch(HA.heating, { state: mode });
    ha.call("climate", "set_hvac_mode", { entity_id: HA.heating, hvac_mode: mode })
      .then(() => toast(on ? "Heating off" : "Heating on"), err => toast(err.message));
  };

  const shown = draft ?? target;
  return (
    <div className="veil">
      <div className="panel heat" ref={root} role="dialog" aria-label="Heating">
        <div className="ph">
          <span>Heating</span>
          <span className={"state" + (on ? "" : " off")}>{on ? "ON" : "OFF"}</span>
        </div>
        <div className="dial">
          <button className="f round" data-f="" onClick={() => step(-0.5)} aria-label="Colder"><Minus size={56} /></button>
          <div className="setp">
            <div className="num">{deg(shown)}</div>
            <div className="sub">{draft !== null ? "Sending…" : `${HA.heatingLabel}, set to`}</div>
          </div>
          <button className="f round" data-f="" data-default="" onClick={() => step(0.5)} aria-label="Warmer"><Plus size={56} /></button>
        </div>
        <div className="now">It is <b>{deg(current)}</b> in the living room now</div>
        <div className="pbtns">
          <button className="f opt" data-f="" onClick={power}>
            <span style={{ display: "flex", gap: 16, alignItems: "center" }}><Power size={32} />{on ? "Turn heating off" : "Turn heating on"}</span>
          </button>
          <button className="f opt" data-f="" onClick={onClose}><span>Done</span></button>
        </div>
      </div>
    </div>
  );
}
