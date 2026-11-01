import { HA } from "../../homeConfig";
import { greeting, pickHours, weatherWord, type Home } from "../../home";
import { short } from "../../stats";
import { clock, deg } from "../../format";
import { type DayProps } from "./parts";

/** "2 hours", "1 hour", "40 minutes". */
function roughly(min: number): string {
  if (min < 55) return `${Math.max(1, Math.round(min / 5) * 5)} minutes`;
  const h = Math.round(min / 60);
  return h === 1 ? "1 hour" : `${h} hours`;
}

function sunSentence(h: Home) {
  if (h.toSunset !== null) return <> The sun sets in <i>{roughly(h.toSunset)}</i>.</>;
  return h.sunriseAt ? <> The sun comes up at <i>{h.sunriseAt}</i>.</> : null;
}

/** Editorial: a magazine cover. A masthead, one big sentence in a serif with the
 *  numbers in black, three short columns, the buttons as italic underlined words
 *  and the apps along the foot like a contents line. */
export function Editorial({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAddApp, onOpenMusic }: DayProps) {
  const word = weatherWord(h.condition);
  const later = pickHours(h.hours, now, 6);
  const last = later[later.length - 1];
  const evening = now.getHours() >= 15;
  return (
    <div className="ed">
      <div className="ed-mast">
        <span><b>The Living Room</b> · {now.toLocaleDateString("en-GB", { weekday: "long" })} edition</span>
        <span>{now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
        <span>{HA.outsideLabel}</span>
      </div>

      <div className="ed-flow">
      <p className="ed-lede">
        {greeting(now)}. It is <b>{clock(now)}</b>
        {h.hasWeather ? (
          <>, <b>{deg(h.outside, 0)}</b>{word ? ` and ${word}` : ""} in {HA.outsideLabel}{h.inside !== null ? <>, <b>{deg(h.inside)}</b> in here</> : null}.{sunSentence(h)}</>
        ) : <> on {now.toLocaleDateString("en-GB", { weekday: "long" })}.</>}
      </p>

      <div className="ed-cols">
        {h.hasWeather && (
          <div className="ed-col">
            <div className="h">{evening ? "Tonight" : "Today"}</div>
            {h.rainAt ? <>Rain from <b>{h.rainAt}</b>. </> : <>No rain on the way. </>}
            {last && last.temp !== null ? <>About <b>{deg(last.temp, 0)}</b> by {clock(new Date(last.at))}.</> : null}
          </div>
        )}
        <div className="ed-col">
          <div className="h">Music</div>
          {m ? (
            <><b>{m.title}</b>{m.artist ? ` by ${m.artist}` : ""} is {m.playing ? "playing" : "paused"} {m.place}.</>
          ) : shuffle ? <>Nothing is playing. <b>Shuffle music</b> starts all your songs, {shuffle.where}.</> : <>Nothing is playing.</>}
        </div>
        {stats && (
          <div className="ed-col">
            <div className="h">MPTree</div>
            <b>{short(stats.installs)}</b> installs{stats.installsToday ? <>, <b>{stats.installsToday}</b> of them today</> : null}.
            {stats.rating ? <> Rated <b>{stats.rating}</b>.</> : null}
          </div>
        )}
      </div>

      <div className="ed-acts">
        {m ? (
          <>
            <button className="f ed-act" data-f="" data-ok={m.playing ? `Pause ${m.title}` : `Play ${m.title}`} onClick={m.playPause}>{m.playing ? "Pause" : "Play"}</button>
            {m.can.next && <button className="f ed-act" data-f="" data-ok="Next song" onClick={() => m.skip("next")}>Next song</button>}
            <button className="f ed-act" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>Music controls</button>
          </>
        ) : shuffle ? (
          <button className="f ed-act" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}>Shuffle music</button>
        ) : null}
      </div>
      </div>

      <div className="ed-apps">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f ed-app" data-f="" data-ok={`Open ${a.label}`} data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            {a.label}
          </button>
        ))}
        {dock.length < 6 && <button className="f ed-app dim" data-f="" data-ok="Choose an app to add to Home" onClick={onAddApp}>+ Add</button>}
      </div>
    </div>
  );
}
