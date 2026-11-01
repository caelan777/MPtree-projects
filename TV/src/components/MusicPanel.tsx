import { useEffect, useRef, useState } from "react";
import { homeOf } from "../home";
import type { Ha, HaExtras } from "../ha";
import { Minus, Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { focusFirst } from "../nav";

type Props = { ha: Ha; extras: HaExtras; haUrl: string; toast: (m: string) => void; onClose: () => void };

/** 3:41 */
function mmss(s: number | null): string {
  if (s === null) return "–:––";
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

/** The music on a speaker in the house, big: the song, how far it is, and every
 *  control the speaker has: previous, play/pause, next, shuffle, repeat, volume.
 *  Back or Done closes it. When the music stops, it offers to shuffle again. */
export function MusicPanel({ ha, extras, haUrl, toast, onClose }: Props) {
  // Its own clock, a tick a second, so the time in the song moves between Home Assistant's updates.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const h = homeOf(ha, extras, new Date(nowMs), toast, haUrl);
  const p = h.playing;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { focusFirst(root.current ?? document); }, []);
  const pos = p?.position ?? null;
  const pct = p && pos !== null && p.duration ? Math.min(100, (pos / p.duration) * 100) : 0;

  return (
    <div className="veil">
      <div className="panel music" ref={root} role="dialog" aria-label="Music">
        {p ? (
          <>
            <div className="mu-top">
              {p.art ? <img className="mu-art" src={p.art} alt="" /> : <span className="mu-art" />}
              <div className="mu-t">
                <div className="where">{p.playing ? "Playing" : "Paused"} · {p.where}</div>
                <h3>{p.title}</h3>
                {p.artist && <div className="by">{p.artist}</div>}
                {p.duration !== null && (
                  <div className="mu-prog">
                    <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                    <div className="times"><span>{mmss(pos)}</span><span>{mmss(p.duration)}</span></div>
                  </div>
                )}
              </div>
            </div>
            <div className="mu-ctrls">
              {p.can.shuffle && (
                <button className={"f cb sm" + (p.shuffle ? " on" : "")} data-f="" data-ok={p.shuffle ? "Turn shuffle off" : "Turn shuffle on"} onClick={() => h.setShuffle(!p.shuffle)} aria-label="Shuffle">
                  <Shuffle size={34} />
                </button>
              )}
              {p.can.prev && <button className="f cb" data-f="" data-ok="Previous song" onClick={() => h.skip("prev")} aria-label="Previous"><SkipBack size={38} /></button>}
              <button className="f cb pl" data-f="" data-default="" data-ok={p.playing ? "Pause" : "Play"} onClick={h.playPause} aria-label={p.playing ? "Pause" : "Play"}>
                {p.playing ? <Pause size={50} /> : <Play size={50} />}
              </button>
              {p.can.next && <button className="f cb" data-f="" data-ok="Next song" onClick={() => h.skip("next")} aria-label="Next"><SkipForward size={38} /></button>}
              {p.can.repeat && (
                <button className={"f cb sm" + (p.repeat !== "off" ? " on" : "")} data-f=""
                  data-ok={p.repeat === "off" ? "Repeat all" : p.repeat === "all" ? "Repeat this song" : "Repeat off"} onClick={h.nextRepeat} aria-label="Repeat">
                  {p.repeat === "one" ? <Repeat1 size={34} /> : <Repeat size={34} />}
                </button>
              )}
            </div>
            <div className="mu-low">
              {p.can.volume && (
                <div className="mu-vol">
                  <button className="f round sm" data-f="" data-ok="Quieter" onClick={() => h.volumeBy(-0.05)} aria-label="Quieter"><Minus size={32} /></button>
                  <div className="vbar"><i style={{ width: `${Math.round((p.volume ?? 0) * 100)}%` }} /></div>
                  <span className="vnum">{p.volume !== null ? `${Math.round(p.volume * 100)}%` : "Volume"}</span>
                  <button className="f round sm" data-f="" data-ok="Louder" onClick={() => h.volumeBy(0.05)} aria-label="Louder"><Plus size={32} /></button>
                </div>
              )}
              {h.shuffleName && (
                <button className="f pill" data-f="" data-ok="Start all songs again, shuffled" onClick={h.shuffleMusic}><Shuffle size={24} />Shuffle all again</button>
              )}
              <button className="f pill" data-f="" data-ok="Close" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <div className="mu-none">
            <h3>Nothing is playing</h3>
            <div className="by">The music stopped, or the speaker went to sleep.</div>
            <div className="mu-low">
              {h.shuffleName && (
                <button className="f pill" data-f="" data-default="" data-ok="Shuffle all songs in the living room" onClick={h.shuffleMusic}><Shuffle size={24} />Shuffle music</button>
              )}
              <button className="f pill" data-f="" data-ok="Close" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
