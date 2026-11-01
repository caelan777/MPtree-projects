import { AddTile, AppTile } from "../AppTile";
import { greeting } from "../../home";
import { clock, deg } from "../../format";
import { HourStrip, MusicCard, Nums, type DayProps } from "./parts";

/** Classic: a greeting with the time in it, the day and the weather under it, the
 *  next hours as a ruled strip, and the music as one big card. Apps below. */
export function Classic({ now, name, home: h, music, shuffle, stats, dock, onOpenApp, onAddApp, onOpenMusic }: DayProps) {
  const who = name.trim();
  return (
    <div className="cl">
      <div className="cl-left">
        <h1 className="cl-greet">{greeting(now)}{who ? `, ${who}` : ""}. <i>It's {clock(now)}.</i></h1>
        <div className="cl-meta">
          <span><b>{now.toLocaleDateString("en-GB", { weekday: "long" })}</b> {now.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
          {h.hasWeather && <span><b>{deg(h.outside, 0)}</b> {h.conditionText.toLowerCase()}</span>}
          {h.inside !== null && <span><b>{deg(h.inside)}</b> inside</span>}
        </div>
        <HourStrip hours={h.hours} now={now} n={6} className="cl-hours" />
        <Nums stats={stats} className="nums cl-nums" />
      </div>

      <MusicCard m={music} shuffle={shuffle} now={now} onOpen={onOpenMusic} className="cl-music" />

      <div className="dock">
        {dock.map((a, i) => <AppTile key={a.packageName} app={a} onOpen={() => onOpenApp(a)} isDefault={i === 0} />)}
        {dock.length < 6 && <AddTile label="Add app" onOpen={onAddApp} />}
      </div>
    </div>
  );
}
