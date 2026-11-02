import { useEffect, useRef, useState } from "react";
import { Pause, Play, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { focusFirst } from "../nav";
import { kicker, positionAt, type Music, type ShuffleAll } from "../music";

type Props = { music: Music | null; shuffle: ShuffleAll; onClose: () => void };

/** 3:41 */
function mmss(s: number | null): string {
  if (s === null) return "–:––";
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

/** MPTree's song, big: the cover, how far it is, and previous, play/pause and
 *  next. Back or Done closes it. When the music stops, it offers to shuffle again. */
export function MusicPanel({ music: p, shuffle, onClose }: Props) {
  // Its own clock, a tick a second, so the time in the song moves between updates.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { focusFirst(root.current ?? document); }, []);
  const pos = p ? positionAt(p, nowMs) : null;
  const pct = p && pos !== null && p.duration ? Math.min(100, (pos / p.duration) * 100) : 0;

  return (
    <div className="veil">
      <div className="panel music" ref={root} role="dialog" aria-label="Music">
        {p ? (
          <>
            <div className="mu-top">
              {p.art ? <img className="mu-art" src={p.art} alt="" /> : <span className="mu-art rec" />}
              <div className="mu-t">
                <div className="where">{kicker(p)}</div>
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
              {p.can.prev && <button className="f cb" data-f="" data-ok="Previous song" onClick={() => p.skip("prev")} aria-label="Previous"><SkipBack size={38} /></button>}
              <button className="f cb pl" data-f="" data-default="" data-ok={p.playing ? "Pause" : "Play"} onClick={p.playPause} aria-label={p.playing ? "Pause" : "Play"}>
                {p.playing ? <Pause size={50} /> : <Play size={50} />}
              </button>
              {p.can.next && <button className="f cb" data-f="" data-ok="Next song" onClick={() => p.skip("next")} aria-label="Next"><SkipForward size={38} /></button>}
            </div>
            <div className="mu-low">
              <div className="mu-vol"><span className="mu-note">The remote's volume buttons change how loud it is.</span></div>
              {shuffle && (
                <button className="f pill" data-f="" data-ok="Start all songs again, shuffled" onClick={shuffle.run}><Shuffle size={24} />Shuffle all again</button>
              )}
              <button className="f pill" data-f="" data-ok="Close" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <div className="mu-none">
            <h3>Nothing is playing</h3>
            <div className="by">The music stopped, or MPTree was closed.</div>
            <div className="mu-low">
              {shuffle && (
                <button className="f pill" data-f="" data-default="" data-ok={`Shuffle all songs, ${shuffle.where}`} onClick={shuffle.run}><Shuffle size={24} />Shuffle music</button>
              )}
              <button className="f pill" data-f="" data-ok="Close" onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
