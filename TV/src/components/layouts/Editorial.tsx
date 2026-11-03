import { HA } from "../../homeConfig";
import { greeting, inTime } from "../../home";
import { clock, deg } from "../../format";
import { short } from "../../stats";
import { Logo } from "../Logo";
import { type DayProps } from "./parts";

/** Editorial, made minimal: a hairline masthead, the greeting and the time in one
 *  big serif, one quiet line about the weather, what plays as a few italic words,
 *  MPTree's downloads as one sentence, and the apps as a contents line at the
 *  foot. No columns, a lot of white. */
export function Editorial({ now, home: h, music: m, shuffle, stats, dock, onOpenApp, onAllApps, onOpenMusic }: DayProps) {
  const weather = [
    h.hasWeather ? `${deg(h.outside, 0)} and ${h.conditionText.toLowerCase()} in ${HA.outsideLabel}` : null,
    h.inside !== null ? `${deg(h.inside)} inside` : null,
    h.rainAt ? `rain from ${h.rainAt}` : null,
    h.toSunset !== null ? `sunset in ${inTime(h.toSunset)}` : h.sunriseAt ? `sun up at ${h.sunriseAt}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="ed">
      <div className="ed-mast">
        <span>{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
        <span>{HA.outsideLabel}</span>
      </div>

      <h1 className="ed-lede">{greeting(now)}.<br /><i>It's {clock(now)}.</i></h1>
      {weather && <p className="ed-line">{weather.charAt(0).toUpperCase() + weather.slice(1)}.</p>}

      <div className="ed-music">
        {m ? (
          <>
            <div className="ed-kick">{m.playing ? "Playing" : "Paused"}</div>
            <div className="ed-song"><b>{m.title}</b>{m.artist ? `, ${m.artist}` : ""}</div>
            <div className="ed-acts">
              <button className="f ed-act" data-f="" data-ok={m.playing ? `Pause ${m.title}` : `Play ${m.title}`} onClick={m.playPause}>{m.playing ? "Pause" : "Play"}</button>
              {m.can.next && <button className="f ed-act" data-f="" data-ok="Next song" onClick={() => m.skip("next")}>Next</button>}
              <button className="f ed-act" data-f="" data-ok="Open the music controls" onClick={onOpenMusic}>More</button>
            </div>
          </>
        ) : shuffle ? (
          <div className="ed-acts">
            <button className="f ed-act" data-f="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}>Shuffle music</button>
          </div>
        ) : null}
      </div>

      {stats && (
        <p className="ed-dls">
          <Logo size={30} />
          <span>MPTree has been downloaded <b>{short(stats.total)}</b> times, <b>{stats.today}</b> of them today.</span>
        </p>
      )}

      <div className="ed-apps">
        {dock.map((a, i) => (
          <button key={a.packageName} className="f ed-app" data-f="" data-ok={`Open ${a.label}`} data-default={i === 0 ? "" : undefined} onClick={() => onOpenApp(a)}>
            {a.label}
          </button>
        ))}
        <button className="f ed-app dim" data-f="" data-ok="See all apps on this TV" onClick={onAllApps}>All apps</button>
      </div>
    </div>
  );
}
