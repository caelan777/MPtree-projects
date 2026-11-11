import { useEffect, useRef } from "react";
import type { LayoutId } from "../settings";
import type { Ha } from "../ha";
import { Classic } from "./layouts/Classic";
import { Editorial } from "./layouts/Editorial";
import { Cinema } from "./layouts/Cinema";
import { DayLine } from "./layouts/DayLine";
import { EdgeTab, type DayProps } from "./layouts/parts";
import { HouseView } from "./HouseView";

export type Side = "day" | "house";

type Props = DayProps & {
  layout: LayoutId;
  /** Home Assistant is switched on: there is a House page to the right. */
  houseOn: boolean;
  side: Side;
  onSide: (s: Side) => void;
  ha: Ha;
  onOpenHeating: () => void;
  onSettings: () => void;
};

function Day({ layout, ...p }: DayProps & { layout: LayoutId }) {
  switch (layout) {
    case "editorial": return <Editorial {...p} />;
    case "cinema": return <Cinema {...p} />;
    case "dayline": return <DayLine {...p} />;
    default: return <Classic {...p} />;
  }
}

/**
 * Home is two pages side by side. The first is the day in the chosen layout: the
 * time, the weather, the music and the apps. With Home Assistant switched on, the
 * second is the house: Right at the right edge slides over to it, Left at its left
 * edge (or Back) slides back. The page that is away can't be reached (inert).
 */
export function HomeView({ layout, houseOn, side, onSide, ha, onOpenHeating, onSettings, ...day }: Props) {
  const dayRef = useRef<HTMLElement>(null);
  const houseRef = useRef<HTMLElement>(null);
  const at: Side = houseOn ? side : "day";

  useEffect(() => {
    const d = dayRef.current, hs = houseRef.current;
    const toHouse = (e: Event) => { if ((e as CustomEvent<string>).detail === "right") onSide("house"); };
    const toDay = (e: Event) => { if ((e as CustomEvent<string>).detail === "left") onSide("day"); };
    if (houseOn) d?.addEventListener("tvedge", toHouse);
    hs?.addEventListener("tvedge", toDay);
    return () => { d?.removeEventListener("tvedge", toHouse); hs?.removeEventListener("tvedge", toDay); };
  }, [houseOn, onSide]);

  return (
    <div className={"pages" + (at === "house" ? " at-house" : "")}>
      <section className="hp" ref={dayRef} data-zone="" inert={at !== "day" || undefined}>
        <Day layout={layout} {...day} />
        {houseOn && <EdgeTab side="right" label="House" />}
      </section>
      {houseOn && (
        <section className="hp house" ref={houseRef} data-zone="" inert={at !== "house" || undefined}>
          <HouseView now={day.now} ha={ha} home={day.home} onOpenHeating={onOpenHeating} onSettings={onSettings} />
        </section>
      )}
    </div>
  );
}
