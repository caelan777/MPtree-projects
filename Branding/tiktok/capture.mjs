/**
 * Films the real app, one exact frame at a time.
 *
 *   node Branding/tiktok/capture.mjs              every take, in English
 *   node Branding/tiktok/capture.mjs play fold    just those takes
 *   node Branding/tiktok/capture.mjs --lang nl    in Dutch
 *   node Branding/tiktok/capture.mjs --rebuild    build the app again first
 *   node Branding/tiktok/capture.mjs --list       what takes there are
 *
 * A take is a short piece of the app being used: a song tapped, the player
 * opened, the list scrolled until the header folds away. Each is written as a
 * script of touches in takes.mjs and played into the real app, the Play Store
 * build, running in Chrome at the size of a phone. Nothing in a take is drawn
 * by hand, so the videos cannot show the app doing something it does not do.
 *
 * It is filmed the way a stop-motion film is. vclock.js freezes the app's clock,
 * then for every frame the clock is moved on by exactly 1/30 s and the screen is
 * photographed. A screen recorder cannot do that: it films in real time and
 * stutters whenever the machine falls behind. This takes as long as it takes
 * and the result is smooth on any machine.
 *
 * Frames land in .cache/takes/<take>.<lang>/ with a take.json beside them that
 * records where every finger was, which render.mjs draws as Android's
 * "show taps" circles.
 *
 * Options: --fps 30  --dsf 4  --lang en|nl  --rebuild  --quality 92
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, ROOT, CACHE, arg, flag, serve, launchChrome, loaded, ensureFonts } from "./lib.mjs";
import { TAKES } from "./takes.mjs";
import { SLEEVES } from "./covers.mjs";

const FPS  = Number(arg("fps", 30));
// 4 rather than the phone's own 3: the frame is 1440 wide and render.mjs scales
// it to 1080, which leaves room to zoom a third of the way in without the
// picture going soft.
const DSF  = Number(arg("dsf", 4));
const LANG = arg("lang", "en");
const QUALITY = Number(arg("quality", 92));
// --trace "<js>" prints that expression's value after every filmed frame.
const TRACE = arg("trace", "");

// A 360 css px wide phone, the commonest Android width, as tall as a 9:16
// frame leaves once the status bar is drawn above it: (1920 - 84) / 3.
export const VIEW = { w: 360, h: 612 };

const BUILD = join(CACHE, "app");
const APP   = join(ROOT, "MPTree-App");

if (flag("list")) {
  for (const [name, t] of Object.entries(TAKES)) console.log(`  ${name.padEnd(12)} ${t.length}s${t.speed ? ` at ${t.speed}x` : ""}  ${t.about || ""}`);
  process.exit(0);
}

const wanted = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").match(/^--(fps|dsf|lang|quality|jobs|trace)$/));
const names = wanted.length ? wanted : Object.keys(TAKES);
for (const n of names) if (!TAKES[n]) { console.error(`No take called "${n}". Try --list.`); process.exit(1); }

/* ── The app, as it ships on Google Play ────────────────────────────────── */
if (flag("rebuild") || !existsSync(join(BUILD, "index.html"))) {
  console.log("building the app (Play build)");
  execSync(`npx vite build --mode play --base=/ --outDir="${BUILD}" --emptyOutDir`, {
    cwd: APP, stdio: ["ignore", "ignore", "inherit"],
  });
}

/* ── Words, in whichever language the take is filmed in ──────────────────
   Takes find buttons by their accessible name, which the app translates, so a
   Dutch take has to look for the Dutch name. Read straight from the app's own
   dictionary rather than kept in a second list here. */
const NL = Object.fromEntries(
  [...readFileSync(join(APP, "src", "i18n-nl.ts"), "utf8")
    .matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)]
    .map(m => [JSON.parse(m[1]), JSON.parse(m[2])]),
);
const tr = (s, vars = {}) =>
  (LANG === "nl" && NL[s] ? NL[s] : s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

/* ── The library it is filmed with ───────────────────────────────────────
   MPTree-App/src/web/demoLibrary.ts: eight invented albums of eight songs,
   interleaved, so song demo://i is on album i % 8. */
const ALBUMS = ["Paper Weather", "Slow Signal", "Static Bloom", "Ghost Frequency",
                "Low Tide", "Sunday Machine", "Nightjar", "Tidewater"];

function seedConfig(take) {
  const ids = Array.from({ length: 64 }, (_, i) => "demo://" + i);
  return {
    sleeves: SLEEVES,
    albumOf: Object.fromEntries(ids.map((id, i) => [id, ALBUMS[i % 8]])),
    lang: LANG,
    onboarded: take.onboarded !== false,
    logoPos: take.logoPos || null,
    session: {
      filter: "newest",
      playMode: take.playMode || "shuffle",
      currentId: take.current || "demo://2",
      queueIds: ids,
      positionMs: 74000,
      isPlaying: false,
      theme: take.theme || "dark",
    },
    extra: take.storage || {},
  };
}

/** Runs in the page, on a blank page of the app's own origin. Mirrors
 *  MPTree-App/scripts/shot-props/seed.html, with a sleeve on every song. */
async function seedPage(cfg) {
  localStorage.clear();
  const toJpeg = svg => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 320;
      c.getContext("2d").drawImage(img, 0, 0, 320, 320);
      ok(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = fail;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const art = {};
  for (const [album, svg] of Object.entries(cfg.sleeves)) art[album] = await toJpeg(svg);

  const meta = {};
  for (const [id, album] of Object.entries(cfg.albumOf)) meta[id] = { customPhoto: art[album] };
  for (const i of [1, 5, 9, 13, 17, 22]) meta["demo://" + i].liked = true;
  const HOUR = 3600000, now = Date.UTC(2026, 8, 28, 18, 30);
  [[2, 31, 1], [1, 14, 3], [9, 9, 5], [5, 8, 9], [17, 7, 14], [0, 6, 20],
   [13, 5, 27], [22, 4, 33], [4, 3, 41], [8, 2, 52]].forEach(([i, plays, hoursAgo]) => {
    Object.assign(meta["demo://" + i], { playCount: plays, lastPlayedAt: now - hoursAgo * HOUR });
  });

  const set = (k, v) => localStorage.setItem("CapacitorStorage." + k, typeof v === "string" ? v : JSON.stringify(v));
  set("mptree_meta", meta);
  set("mptree_session", cfg.session);
  set("mptree_playlists", [
    { id: "1000", name: "Late drives", createdAt: Date.UTC(2026, 6, 12),
      songIds: [0, 8, 16, 24, 32, 40, 9, 17].map(i => "demo://" + i), coverPhoto: art["Paper Weather"] },
    { id: "1001", name: "Kitchen radio", createdAt: Date.UTC(2026, 5, 3),
      songIds: [1, 5, 13, 21, 29, 37].map(i => "demo://" + i) },
    { id: "1002", name: "Long walk", createdAt: Date.UTC(2026, 4, 21),
      songIds: [2, 10, 18, 26, 34, 42, 50, 58, 3, 11, 19].map(i => "demo://" + i), coverPhoto: art["Static Bloom"] },
  ]);
  set("mptree_lang", cfg.lang);
  if (cfg.onboarded) set("mptree_onboarded_v2", "1");
  if (cfg.logoPos) set("mptree_logo_pos", cfg.logoPos);
  for (const [k, v] of Object.entries(cfg.extra)) set(k, v);
  return Object.keys(localStorage).length;
}

/* ── Helpers that live in the page ───────────────────────────────────────
   Put in alongside the clock. __find turns a take's description of a target
   into a point on the screen. */
const PAGE_HELPERS = `
(() => {
  const shown = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  window.__find = q => {
    let el = null;
    if (q.tour) el = [...document.querySelectorAll('[data-tour="' + q.tour + '"]')].find(shown) || null;
    else if (q.label) el = [...document.querySelectorAll("[aria-label]")].find(e => e.getAttribute("aria-label") === q.label && shown(e)) || null;
    else if (q.title) el = [...document.querySelectorAll("[title]")].find(e => e.getAttribute("title") === q.title && shown(e)) || null;
    else if (q.css) el = [...document.querySelectorAll(q.css)].find(shown) || null;
    else if (q.text) {
      const all = [...document.querySelectorAll("body *")].filter(e => e.textContent.trim() === q.text && shown(e));
      // The innermost match is the text itself; tap its row, not a wrapper
      // half the screen wide.
      el = all.find(e => ![...e.children].some(c => c.textContent.trim() === q.text)) || all[0] || null;
      if (el && q.up) for (let i = 0; i < q.up && el.parentElement; i++) el = el.parentElement;
    }
    // A button with no name of its own, found by the one next to it.
    for (let i = 0; el && i < Math.abs(q.sib || 0); i++) el = q.sib < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * (q.fx ?? 0.5) + (q.dx || 0), y: r.top + r.height * (q.fy ?? 0.5) + (q.dy || 0) };
  };
  window.__scroller = () => [...document.querySelectorAll('[data-tour="songs"]')].find(shown) || null;
  window.__scrollTo = y => {
    const el = __scroller();
    if (!el) return null;
    el.scrollTop = y;
    el.dispatchEvent(new Event("scroll"));
    return el.scrollTop;
  };
  // The app glides to the playing song with scrollTo / scrollIntoView and
  // behavior "smooth". Chrome runs those on its own compositor clock, which the
  // recording cannot wind, so they arrived as a jump between two frames. These
  // do the same glide on animation frames, which the recording does wind.
  const glide = (el, top) => {
    top = Math.max(0, Math.min(top, el.scrollHeight - el.clientHeight));
    const y0 = el.scrollTop, d = top - y0;
    if (Math.abs(d) < 1) { el.scrollTop = top; return; }
    const ms = Math.min(650, 260 + Math.abs(d) * 0.35);
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      el.scrollTop = y0 + d * e;
      el.dispatchEvent(new Event("scroll"));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const scrollTo0 = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (a, b) {
    if (a && typeof a === "object" && a.behavior === "smooth") return glide(this, a.top ?? this.scrollTop);
    return scrollTo0.apply(this, arguments);
  };
  const intoView0 = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o) {
    if (!(o && typeof o === "object" && o.behavior === "smooth")) return intoView0.apply(this, arguments);
    let sc = this.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc) return intoView0.apply(this, arguments);
    const r = this.getBoundingClientRect(), s = sc.getBoundingClientRect();
    const block = o.block || "start";
    const delta = block === "center" ? (r.top + r.height / 2) - (s.top + sc.clientHeight / 2)
                : block === "end"    ? r.bottom - (s.top + sc.clientHeight)
                : block === "nearest" ? (r.top < s.top ? r.top - s.top : r.bottom > s.top + sc.clientHeight ? r.bottom - (s.top + sc.clientHeight) : 0)
                : r.top - s.top;
    return glide(sc, sc.scrollTop + delta);
  };
  // A finger, delivered as DOM touch events on whatever is under it, with the
  // click a browser sends after a tap. Not through the protocol's
  // Input.dispatchTouchEvent: at a device scale of 4 Chrome passes every
  // touchmove after the first at a quarter of its real position, so a dragged
  // button crawled a few pixels while the finger crossed the screen. Its
  // gesture handling also runs on the wall clock (long press, tap timeouts),
  // which the recording has stopped. The app listens for touches and clicks,
  // so these are exactly what it gets from a phone.
  let held = null;
  window.__touch = (type, x, y) => {
    if (type === "start") held = { target: document.elementFromPoint(x, y) || document.body, x, y, moved: false };
    if (!held) return false;
    const t = new Touch({ identifier: 1, target: held.target, clientX: x, clientY: y, pageX: x, pageY: y,
                          screenX: x, screenY: y, radiusX: 11, radiusY: 11, force: 1 });
    const now = type === "end" ? [] : [t];
    const ev = new TouchEvent("touch" + type, { bubbles: true, cancelable: true, composed: true,
                                               touches: now, targetTouches: now, changedTouches: [t] });
    held.target.dispatchEvent(ev);
    if (type === "move" && Math.hypot(x - held.x, y - held.y) > 10) held.moved = true;
    if (type === "end") {
      if (!held.moved && !ev.defaultPrevented) {
        held.target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true,
          view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, detail: 1 }));
      }
      held = null;
    }
    return true;
  };
  // Roboto, under the name the app asks for first. See lib.mjs.
  const face = new FontFace("Segoe UI", "url(/__fonts/roboto.woff2)", { weight: "100 900" });
  document.fonts.add(face);
  face.load().catch(() => {});
  // The record's texture, decoded before the player first opens, so the frame
  // the sheet arrives on is not the one frame without it.
  const vinyl = new Image(); vinyl.src = "/vinyl.webp";
})();
`;

/* ── Easing ─────────────────────────────────────────────────────────────── */
const EASE = {
  linear: p => p,
  inOut: p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  out: p => 1 - Math.pow(1 - p, 3),
  // A flick: the list leaves at the speed of the thumb and coasts to a stop.
  fling: p => 1 - Math.pow(1 - p, 4),
};

/* ── One take ───────────────────────────────────────────────────────────── */
async function film(name, take, origin, fontsReady) {
  const outDir = join(CACHE, "takes", `${name}.${LANG}`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const { cdp, close } = await launchChrome();
  const t0 = Date.now();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    cdp.on("Runtime.exceptionThrown", p =>
      console.log("    page error:", p.exceptionDetails.exception?.description?.split("\n")[0]));
    cdp.on("Runtime.consoleAPICalled", p => {
      if (p.type === "error") console.log("    console:", p.args.map(a => a.value ?? a.description).join(" ").slice(0, 200));
    });
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: VIEW.w, height: VIEW.h, deviceScaleFactor: DSF, mobile: true,
    });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: "dark" },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ] });

    await loaded(cdp, () => cdp.send("Page.navigate", { url: origin + "/__blank" }));
    await cdp.evaluate(`(${seedPage.toString()})(${JSON.stringify(seedConfig(take))})`);

    const vclock = readFileSync(join(HERE, "vclock.js"), "utf8");
    // `date`: the moment a take is set at, for one that depends on the day.
    const epoch = take.date ? `window.__vclockEpoch = ${Date.parse(take.date)};\n` : "";
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: epoch + vclock + "\n" + PAGE_HELPERS });
    await loaded(cdp, () => cdp.send("Page.navigate", { url: origin + "/" }));

    // `speed` films in slow motion: at 0.25 each frame moves the app on by a
    // quarter of a frame's time, so a third of a second of animation fills
    // more than a second of video without a single frame being invented.
    const speed = take.speed || 1;
    let dt = 1000 / FPS;
    const step = () => cdp.evaluate(`__vt.step(${dt})`);

    // Through the splash screen and the scan, unfilmed.
    const ready = take.ready || `!!document.querySelector('[data-tour="songs"]') && document.body.innerText.includes("Midnight Drive")`;
    let booted = false;
    for (let i = 0; i < FPS * 20; i++) {
      await step();
      if (await cdp.evaluate(ready)) { booted = true; break; }
    }
    if (!booted) {
      const state = await cdp.evaluate(`JSON.stringify({ vt: typeof __vt, now: window.__vt && __vt.now(), pending: window.__vt && __vt.pending(), url: location.href, text: document.body ? document.body.innerText.slice(0, 300) : null })`);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
      writeFileSync(join(outDir, "stuck.jpg"), Buffer.from(data, "base64"));
      throw new Error(`the app never came up: ${state}`);
    }
    for (let i = 0; i < Math.round((take.settle ?? 2) * FPS); i++) await step();

    // Anything the take needs done before the camera rolls.
    for (const js of take.before || []) { await cdp.evaluate(js); for (let i = 0; i < 12; i++) await step(); }

    // See __touch above for why this is not Input.dispatchTouchEvent.
    let last = null;
    const touch = (type, p) => {
      if (p) last = p;
      const at = p || last;
      const kind = { touchStart: "start", touchMove: "move", touchEnd: "end" }[type];
      return cdp.evaluate(`__touch(${JSON.stringify(kind)}, ${at.x}, ${at.y})`);
    };
    const locate = async q => {
      if (Array.isArray(q)) return { x: q[0], y: q[1] };
      const query = { ...q };
      if (query.label) query.label = tr(query.label, query.vars);
      if (query.title) query.title = tr(query.title, query.vars);
      if (query.text && query.ui) query.text = tr(query.text, query.vars);
      const p = await cdp.evaluate(`__find(${JSON.stringify(query)})`);
      if (!p) throw new Error(`${name}: nothing on screen matches ${JSON.stringify(query)}`);
      return p;
    };

    const fingers = [];   // one entry per filmed frame: [x, y] while a finger is down
    const live = [];
    let finger = null;

    const begin = async (a, f) => {
      if (a.tap) {
        const p = await locate(a.tap);
        await touch("touchStart", p);
        finger = p;
        const up = f + Math.max(1, Math.round((a.hold ?? 110) / dt));
        return { tick: async g => { if (g >= up) { await touch("touchEnd"); finger = null; return true; } return false; } };
      }
      if (a.drag) {
        const from = await locate(a.drag.from);
        const to = await locate(a.drag.to);
        const ease = EASE[a.drag.ease || "inOut"];
        const n = Math.max(1, Math.round(a.drag.ms / dt));
        const hold = Math.round((a.drag.hold ?? 0) / dt);
        const rest = Math.round((a.drag.rest ?? 70) / dt);
        await touch("touchStart", from);
        finger = from;
        return { tick: async g => {
          const k = g - f - hold;
          if (k <= 0) return false;
          if (k <= n) {
            const e = ease(k / n);
            const p = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
            await touch("touchMove", p);
            finger = p;
            return false;
          }
          if (k <= n + rest) return false;
          await touch("touchEnd");
          finger = null;
          return true;
        } };
      }
      if (a.scroll) {
        const y0 = await cdp.evaluate(`__scroller().scrollTop`);
        const y1 = a.scroll.to !== undefined ? a.scroll.to : y0 + a.scroll.by;
        const ease = EASE[a.scroll.ease || "fling"];
        const n = Math.max(1, Math.round(a.scroll.ms / dt));
        // The thumb that "threw" the list: drawn, not sent. A real touch
        // would hand the scroll to Chrome's own fling, which runs on the wall
        // clock and cannot be filmed a frame at a time.
        const thumb = a.scroll.finger === false ? null : {
          x: a.scroll.fingerX ?? 250, y: a.scroll.fingerY ?? 470,
          n: Math.max(2, Math.round(n * 0.22)),
        };
        return { tick: async g => {
          const k = g - f;
          const e = ease(Math.min(1, k / n));
          await cdp.evaluate(`__scrollTo(${y0 + (y1 - y0) * e})`);
          if (thumb) {
            finger = k <= thumb.n
              ? { x: thumb.x, y: thumb.y - (y1 - y0) * ease(k / n) * 0.9, drawnOnly: true }
              : null;
          }
          return k >= n;
        } };
      }
      if (a.js) {
        await cdp.evaluate(a.js);
        return null;
      }
      throw new Error(`${name}: not an action: ${JSON.stringify(a)}`);
    };

    const spent = { act: 0, step: 0, shot: 0 };
    let filmed = 0;
    // Plays a script for n frames. Unfilmed for the run-up a take needs before
    // the camera rolls (a song already playing, the header already folded).
    const play = async (actions, n, film) => {
      dt = (1000 / FPS) * (film ? speed : 1);
      const script = actions.map(a => ({ ...a, f: Math.round(a.at * 1000 / dt) }));
      for (let f = 0; f < n; f++) {
        let c = Date.now();
        for (const a of script) if (a.f === f) { const l = await begin(a, f); if (l) live.push(l); }
        if (f > 0 || !film) {
          for (let i = live.length - 1; i >= 0; i--) if (await live[i].tick(f)) live.splice(i, 1);
          spent.act += Date.now() - c; c = Date.now();
          await step();
          spent.step += Date.now() - c; c = Date.now();
        }
        if (TRACE && film) console.log(`    ${String(f).padStart(3)} ${finger ? `finger ${finger.x.toFixed(0)},${finger.y.toFixed(0)}` : "no finger   "}  ${await cdp.evaluate(TRACE)}`);
        if (!film) continue;
        const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: QUALITY });
        spent.shot += Date.now() - c;
        writeFileSync(join(outDir, `${String(f).padStart(4, "0")}.jpg`), Buffer.from(data, "base64"));
        fingers.push(finger ? [Math.round(finger.x * 10) / 10, Math.round(finger.y * 10) / 10] : null);
        filmed++;
        if (f % 30 === 0) process.stdout.write(`  ${name}.${LANG}  ${f}/${n}
`);
      }
      if (live.length) throw new Error(`${name}: an action was still running when the ${film ? "take" : "run-up"} ended`);
    };

    if (take.pre) await play(take.pre, Math.round((take.preLength ?? 1.5) * FPS), false);
    const N = Math.round(take.length * FPS / speed);
    await play(take.script || [], N, true);
    writeFileSync(join(outDir, "take.json"), JSON.stringify({
      name, lang: LANG, fps: FPS, dsf: DSF, view: VIEW, frames: N, speed, fingers,
    }));
    console.log(`  ${name}.${LANG}  ${N} frames  ${((Date.now() - t0) / 1000).toFixed(1)}s` +
      (flag("timing") ? `  per frame: input ${(spent.act / N).toFixed(0)}ms, step ${(spent.step / N).toFixed(0)}ms, shot ${(spent.shot / filmed).toFixed(0)}ms` : ""));
  } finally {
    await close();
  }
}

/* ── Go ─────────────────────────────────────────────────────────────────── */
const fonts = await ensureFonts();
const server = await serve([
  ["/__fonts/", fonts],
  ["/", BUILD],
], { fallback: join(BUILD, "index.html"), inline: { "/__blank": ["text/html", "<!doctype html><meta charset=utf-8><title>seed</title>"] } });

// Takes are independent, so several are filmed at once, each in a Chrome of
// its own. The screenshot is most of the cost and it does not share a core.
const JOBS = Math.max(1, Number(arg("jobs", 4)));
const queue = [...names];
let failed = 0;
try {
  await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    while (queue.length) {
      const n = queue.shift();
      try { await film(n, TAKES[n], server.origin); }
      catch (e) { failed++; console.error(`
  ${n}.${LANG} FAILED: ${e.message}`); }
    }
  }));
} finally {
  server.close();
}
if (failed) process.exitCode = 1;
