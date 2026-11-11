/* A clock the recorder winds by hand.
 *
 * Injected into the app's page before any of the app's own scripts run, so
 * everything that asks the time asks this. Nothing moves on its own: timers,
 * animation frames, CSS animations and CSS transitions all stand still until
 * capture.mjs calls __vt.step(ms), and then move exactly that far.
 *
 * That is the whole reason the recording is smooth. A screen recorder films in
 * real time, and every frame the machine is late with is a frame the video
 * stutters on. Here a frame can take a tenth of a second to capture and the
 * app still believes a thirtieth has passed.
 *
 * What is not wound: the MessageChannel that React schedules its work on, and
 * promises. Those mean "as soon as possible", not "later", so they run for
 * real, and step() waits for them to drain before the frame is taken.
 */
(() => {
  if (window.__vt) return;

  const RealDate = Date;
  const RealChannel = MessageChannel;
  // The evening the film is set in, so a clock read anywhere is the same on
  // every render. 20:41 in the Netherlands, unless a take sets its own day
  // (capture.mjs puts window.__vclockEpoch in first).
  const EPOCH = window.__vclockEpoch ?? RealDate.UTC(2026, 8, 28, 18, 41, 0);

  let now = 0;
  let seq = 0;
  const timers = new Map();
  let rafs = new Map();
  let rafSeq = 0;

  // ── Time itself ─────────────────────────────────────────────────────────
  Object.defineProperty(performance, "now", { value: () => now, configurable: true, writable: true });

  function VDate(...a) {
    if (!new.target) return new RealDate(EPOCH + now).toString();
    return a.length ? new RealDate(...a) : new RealDate(EPOCH + now);
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => EPOCH + Math.floor(now);
  VDate.UTC = RealDate.UTC;
  VDate.parse = RealDate.parse;
  window.Date = VDate;

  // A swipe measures its speed from event.timeStamp, which the browser stamps
  // with the real clock. Events are dispatched at the moment the recorder sends
  // them, which is the current virtual moment, so that is what they report.
  try {
    Object.defineProperty(Event.prototype, "timeStamp", { get: () => now, configurable: true });
  } catch { /* leave it real */ }

  // Shuffle is Math.random, and a take should shuffle into the same order
  // every time it is filmed. mulberry32, from a fixed seed.
  let seed = 0x4d505472;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ── Timers ──────────────────────────────────────────────────────────────
  window.setTimeout = function (fn, ms, ...args) {
    const id = ++seq;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every: 0, order: id });
    return id;
  };
  window.setInterval = function (fn, ms, ...args) {
    const id = ++seq;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: now + every, fn, args, every, order: id });
    return id;
  };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };

  window.requestAnimationFrame = fn => { const id = ++rafSeq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = id => { rafs.delete(id); };

  // One real macrotask. React's scheduler posts its work to a MessageChannel,
  // so a message posted after it arrives after that work has run.
  const tick = () => new Promise(res => {
    const ch = new RealChannel();
    ch.port1.onmessage = () => { ch.port1.close(); res(); };
    ch.port2.postMessage(0);
  });
  const drain = async (n) => { for (let i = 0; i < n; i++) await tick(); };

  const call = (fn, args) => {
    try { typeof fn === "function" ? fn(...args) : (0, eval)(String(fn)); }
    catch (e) { console.error(e); }
  };

  // Each timer gets a task of its own, as it would in a browser, so the
  // promises and renders one of them starts have settled before the next runs.
  async function runTimersUntil(target) {
    for (let guard = 0; guard < 5000; guard++) {
      let best = null, bestId = 0;
      for (const [id, t] of timers) {
        if (t.at > target) continue;
        if (!best || t.at < best.at || (t.at === best.at && t.order < best.order)) { best = t; bestId = id; }
      }
      if (!best) return;
      now = Math.max(now, best.at);
      if (best.every) { best.at += best.every; best.order = ++seq; }
      else timers.delete(bestId);
      call(best.fn, best.args);
      await drain(2);
    }
    console.warn("vclock: timer storm, gave up after 5000");
  }

  // ── CSS animations and transitions ──────────────────────────────────────
  // Every animation is paused the first time it is seen and from then on is
  // placed by hand: its own clock advances by the step while it is meant to be
  // running, and its currentTime is set to that. "Meant to be running" for a
  // CSS animation is what the stylesheet says, because the app pauses the
  // record by switching animation-play-state, and a paused-by-script animation
  // no longer listens to that property.
  const track = new WeakMap();

  function cssRunning(a) {
    const el = a.effect && a.effect.target;
    if (!el) return true;
    const cs = getComputedStyle(el, a.effect.pseudoElement || null);
    const names = cs.animationName.split(",").map(s => s.trim());
    const states = cs.animationPlayState.split(",").map(s => s.trim());
    const i = Math.max(0, names.indexOf(a.animationName));
    return (states[i % states.length] || "running") !== "paused";
  }

  function endOf(a) {
    const t = a.effect ? a.effect.getComputedTiming() : null;
    return t && Number.isFinite(t.endTime) ? t.endTime : Infinity;
  }

  function syncAnimations(dt) {
    let list;
    try { list = document.getAnimations(); } catch { return; }
    for (const a of list) {
      let s = track.get(a);
      const isCss = typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation;
      const isTransition = typeof CSSTransition !== "undefined" && a instanceof CSSTransition;
      if (!s) {
        // New since the last frame, so it began somewhere in the step just
        // taken. Most begin at its start, set off by a touch sent before the
        // step, so it is placed a whole step in. Starting new ones at zero
        // instead froze anything restarted every frame: a transition chasing
        // a dragged finger was re-created each frame and never moved at all.
        s = { t: dt, ended: false, scriptPaused: !isCss && !isTransition && a.playState === "paused" };
        track.set(a, s);
        try { a.pause(); } catch { /* already gone */ }
      } else {
        const running = isCss ? cssRunning(a) : isTransition ? true : !s.scriptPaused;
        if (running) s.t += dt;
      }
      try { a.currentTime = s.t; } catch { /* cancelled mid-frame */ }
      // A paused animation that is seeked past its end never fires its end
      // event, and the app waits on two of them (the logo flight and the
      // welcome reveal). Fire it here, once, as the browser would have.
      const end = endOf(a);
      if (!s.ended && s.t >= end) {
        s.ended = true;
        const el = a.effect && a.effect.target;
        if (el && isCss) {
          el.dispatchEvent(new AnimationEvent("animationend", { animationName: a.animationName, elapsedTime: end / 1000, bubbles: true }));
        } else if (el && isTransition) {
          el.dispatchEvent(new TransitionEvent("transitionend", { propertyName: a.transitionProperty, elapsedTime: end / 1000, bubbles: true }));
        }
        // Past its end with no fill, it has nothing left to show; let it go
        // so it does not sit in getAnimations() for the rest of the take.
        const fill = a.effect ? a.effect.getComputedTiming().fill : "none";
        if (fill === "none" || fill === "backwards" || fill === "auto") { try { a.cancel(); } catch { /* fine */ } }
      }
    }
  }

  // ── The handle ──────────────────────────────────────────────────────────
  let stepping = false;
  window.__vt = {
    now: () => now,
    /** Moves the world on by dt milliseconds and leaves it ready to be filmed. */
    async step(dt) {
      if (stepping) throw new Error("vclock: step() while stepping");
      stepping = true;
      try {
        const target = now + dt;
        await runTimersUntil(target);
        now = target;
        const q = rafs; rafs = new Map();
        for (const fn of q.values()) call(fn, [now]);
        await drain(6);
        syncAnimations(dt);
        await drain(2);
        // Anything the end events above set off.
        syncAnimations(0);
      } finally {
        stepping = false;
      }
      return now;
    },
    pending: () => timers.size,
  };
})();
