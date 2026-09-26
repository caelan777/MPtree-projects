/**
 * Renders the MPTree ad to a video file.
 *
 *   node Branding/ad/make-ad.mjs                 → mptree-ad.mp4, 1080x1920
 *   node Branding/ad/make-ad.mjs --square        → 1080x1080, for a feed
 *   node Branding/ad/make-ad.mjs --frames        → a PNG per frame instead
 *   node Branding/ad/make-ad.mjs --at 3.9,8.2    → those seconds as stills
 *
 * The film is composed for a phone held upright, and square is as far sideways
 * as it goes: everything is placed as a fraction of the frame, so at 16:9 the
 * phone grows until a beat shows four rows of a song list and nothing else.
 * There is no --wide for that reason. A landscape cut would need its own
 * layout, not a wider canvas.
 *
 * There is no ffmpeg on this machine and nothing here installs one. Chrome
 * encodes the file itself: the ad is drawn into a canvas, the canvas is
 * captured a frame at a time, and MediaRecorder writes H.264 into MP4. That
 * is a Chrome 130 and newer ability, so the version is checked rather than
 * assumed, and the codec is chosen from what the browser actually admits to
 * supporting instead of from what it ought to.
 *
 * The drawing lives in ad.html. This file only assembles it (the real mark,
 * the real screenshots) and turns the handle.
 *
 * Options: --out --width --height --fps --duration --bitrate --frames --at
 *          --square --headful
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW  = resolve(HERE, "..", "store", "raw");
const MARK = resolve(HERE, "..", "source", "mptree-mark.svg");

const flag = name => process.argv.includes("--" + name);
const arg  = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SIZE = flag("square") ? [1080, 1080] : [1080, 1920];
const CONFIG = {
  width:    Number(arg("width",  SIZE[0])),
  height:   Number(arg("height", SIZE[1])),
  // 30, not 60. The recorder stamps frames by the wall clock, so a frame drawn
  // late is held rather than dropped and the film stretches. At 60 the budget
  // is 16.7 ms a frame and the heavier cuts blew through it, coming out two,
  // four and once fifteen seconds long. At 30 there is twice the room and the
  // renders land on 19.00s. A film in sync with its own score beats a smoother
  // one that is not. --fps 60 is there for a quiet machine.
  fps:      Number(arg("fps", 30)),
  duration: Number(arg("duration", 19)),
  // TikTok lays its caption, its username and its buttons over the bottom of
  // the frame. Handing that band back and composing above it is the whole
  // difference between the two vertical cuts: same edit, same length, so one
  // piece of music fits both.
  safeTop:    flag("tiktok") ? 0.06 : 0,
  safeBottom: flag("tiktok") ? 0.20 : 0,
  // --clean carries no writing at all until the end card, for laying your own
  // captions over the top.
  text: !flag("clean"),
};
const BITRATE = Number(arg("bitrate", 26_000_000));

// The score is on by default now. --silent gets the film back without it, for
// anyone who would rather lay their own track over the top in an editor.
const SOUND = flag("silent") ? false : flag("vo-only") ? "voice-only" : true;

const suffix = (flag("clean") ? "-clean" : "") + (flag("silent") ? "-silent" : "") + (flag("vo") ? "-vo" : "");
const OUT = resolve(HERE, arg("out",
  (flag("square") ? "mptree-ad-square" :
   flag("tiktok") ? "mptree-ad-tiktok" : "mptree-ad") + suffix + ".mp4"));

/* ── Assemble the page ──────────────────────────────────────────────────
   The screenshots go in as data URIs rather than as file:// references. A
   canvas that has drawn a file:// image is tainted, captureStream on it
   throws, and there would be no video at all. ─────────────────────────── */
const markSvg = readFileSync(MARK, "utf8");
const markPath = (markSvg.match(/ d="([^"]+)"/) || [])[1];
if (!markPath) {
  console.error("No path found in " + MARK);
  process.exit(1);
}

// The clean cut runs a fourth screen where the captioned one puts its
// statement card, so both sets of screenshots go in either way.
const SHOT_FILES = ["songs", "player", "playlists", "menu"];
const shots = {};
for (const name of SHOT_FILES) {
  const p = join(RAW, name + ".png");
  if (!existsSync(p)) {
    console.error("Missing screenshot: " + p + "\nRun MPTree-App/scripts/screenshot.mjs first.");
    process.exit(1);
  }
  shots[name] = "data:image/png;base64," + readFileSync(p).toString("base64");
}

/* ── The voiceover, if there is one ──────────────────────────────────────
   voice/lines.json is [{ at, file, gain? }], `at` being seconds into the
   film. Anything decodable by a browser works: wav, mp3, m4a. Record the
   lines on a phone, drop them in, render. Nothing here generates a voice. */
const voice = [];
const VOICE_DIR = join(HERE, "voice");
const VOICE_LIST = join(VOICE_DIR, "lines.json");
if (SOUND && flag("vo")) {
  if (!existsSync(VOICE_LIST)) {
    console.error(`--vo needs ${VOICE_LIST}\nSee the README: it is a list of { at, file }.`);
    process.exit(1);
  }
  const TYPES = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac" };
  for (const line of JSON.parse(readFileSync(VOICE_LIST, "utf8"))) {
    const p = join(VOICE_DIR, line.file);
    if (!existsSync(p)) { console.error(`Missing voice clip: ${p}`); process.exit(1); }
    const type = TYPES[line.file.split(".").pop().toLowerCase()] || "audio/wav";
    voice.push({
      at: line.at,
      gain: line.gain === undefined ? 1 : line.gain,
      audio: `data:${type};base64,` + readFileSync(p).toString("base64"),
    });
  }
  console.log(`voiceover: ${voice.length} clips from voice/lines.json`);
}

const built = readFileSync(join(HERE, "ad.html"), "utf8")
  .replace("__MARK__",   markPath)
  .replace("__SHOTS__",  JSON.stringify(shots))
  .replace("__VOICE__",  JSON.stringify(voice))
  .replace("__CONFIG__", JSON.stringify(CONFIG));

const BUILD = join(HERE, "ad.build.html");
writeFileSync(BUILD, built);

/* ── Chrome ─────────────────────────────────────────────────────────────── */
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find(p => existsSync(p));

if (!CHROME) { console.error("No Chrome found."); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9446;

// A profile of its own per run. Chrome's crash handler outlives the process we
// started and holds a lock inside the profile for a while afterwards, so a
// shared directory means the next render dies on EBUSY trying to clear it.
// --disable-breakpad stops that handler being started at all; the unique
// directory is the belt to its braces, since a stale lock can then only ever
// hurt the run that made it.
const profile = resolve(tmpdir(), `mptree-ad-${process.pid}-${Date.now()}`);

const proc = spawn(CHROME, [
  flag("headful") ? "--window-size=520,900" : "--headless=new",
  "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  "--no-first-run", "--no-default-browser-check",
  "--disable-breakpad", "--no-crash-upload",
  "--autoplay-policy=no-user-gesture-required",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  "about:blank",
], { stdio: "ignore" });

async function targetWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const p = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome's debugging port never answered");
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;
  ws.addEventListener("message", e => {
    const msg = JSON.parse(e.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ready, send, close: () => ws.close() };
}

/** Runs an expression in the page and hands back its value, awaiting it. */
async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

const MIMES_SOUND = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  "video/webm",
];
const MIMES_SILENT = [
  'video/mp4;codecs="avc1.640028"',
  'video/mp4;codecs=avc1',
  "video/mp4",
  'video/webm;codecs=vp9',
  "video/webm",
];

try {
  const cdp = connect(await targetWsUrl());
  await cdp.ready;
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: Math.round(CONFIG.width / 2), height: Math.round(CONFIG.height / 2),
    deviceScaleFactor: 1, mobile: false,
  });

  await cdp.send("Page.navigate", { url: pathToFileURL(BUILD).href + "#render" });
  await sleep(1200);
  await evaluate(cdp, "window.adReady()");

  const total = await evaluate(cdp, "window.adTotal()");
  console.log(`${CONFIG.width}x${CONFIG.height}  ${CONFIG.fps} fps  ${CONFIG.duration}s  ${total} frames`);

  if (flag("score")) {
    const rows = await evaluate(cdp, "window.adScoreProbe(0.25)");
    const top = Math.max(...rows.map(r => r.peak)) || 1;
    for (const r of rows) {
      const bar = "#".repeat(Math.round(r.peak / top * 44));
      const mark = [0, 2.47, 5.2, 7.93, 10.67, 13.4, 16.13].some(c => Math.abs(r.t - c) < 0.13) ? " <- cut" : "";
      console.log(`  ${r.t.toFixed(2).padStart(5)}  ${bar.padEnd(45)}${mark}`);
    }
    console.log(`  peak ${top.toFixed(3)} (clipping over 1.0)`);
  }

  // A handful of moments as stills, for checking a render without sitting
  // through it: --at 0.8,3.4,6.2 (seconds).
  const at = arg("at", "");
  if (at) {
    const dir = join(HERE, "stills");
    mkdirSync(dir, { recursive: true });
    for (const s of at.split(",").map(Number)) {
      const i = Math.min(total - 1, Math.round(s * CONFIG.fps));
      const uri = await evaluate(cdp, `window.adFrame(${i})`);
      const name = s.toFixed(2).replace(".", "s") + ".png";
      writeFileSync(join(dir, name), Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
      console.log(`  ${name}  (frame ${i})`);
    }
    cdp.close();
  } else if (flag("frames")) {
    const dir = join(HERE, "frames");
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < total; i++) {
      const uri = await evaluate(cdp, `window.adFrame(${i})`);
      writeFileSync(join(dir, String(i).padStart(5, "0") + ".png"),
        Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
      if (i % 30 === 0) process.stdout.write(`  frame ${i}/${total}\r`);
    }
    console.log(`\n${total} frames in ${dir}`);
  } else {
    const mimes = SOUND ? MIMES_SOUND : MIMES_SILENT;
    const mime = await evaluate(cdp,
      `(${JSON.stringify(mimes)}).find(m => MediaRecorder.isTypeSupported(m)) || ""`);
    if (!mime) throw new Error("This Chrome will not record any video format.");
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    console.log(`recording as ${mime}`);
    if (ext !== "mp4") {
      console.log("  (no MP4 encoder here, so the file comes out WebM)");
    }
    if (SOUND && !/mp4a|opus/.test(mime)) {
      console.log("  warning: that format carries no audio track, so this will come out silent");
    }

    const t0 = Date.now();
    const length = await evaluate(cdp,
      `window.adRecord(${JSON.stringify(mime)}, ${BITRATE}, ${JSON.stringify(SOUND)})`);

    // Pulled back in slices: one 40 MB string through a single protocol
    // message is asking for trouble.
    const CHUNK = 4_000_000;
    let b64 = "";
    for (let at = 0; at < length; at += CHUNK) {
      b64 += await evaluate(cdp, `window.adSlice(${at}, ${CHUNK})`);
    }

    const out = OUT.replace(/\.(mp4|webm)$/, "." + ext);
    const buf = Buffer.from(b64, "base64");
    writeFileSync(out, buf);
    console.log(`\n${out}\n  ${(buf.length / 1048576).toFixed(1)} MB, rendered in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    // A frame the machine could not draw in time is not dropped, it is held,
    // and the film comes out longer and slower than it was written. Say so.
    const drift = await evaluate(cdp, "window.adDrift()");
    if (drift) {
      const off = drift.wall - drift.intended;
      console.log(`  ${drift.late} of ${total} frames ran over, film is ${off >= 0 ? "+" : ""}${off.toFixed(2)}s off ${drift.intended.toFixed(2)}s`);
      // With sound this is not a cosmetic problem. The score is scheduled on
      // the audio clock and plays in real time, while a frame drawn late is
      // held rather than dropped, so a stretched render slides the picture off
      // the music by exactly this much. A drifted file is not shippable.
      const limit = SOUND ? 0.1 : 0.25;
      const lateFrac = drift.late / total;
      // Total drift alone is not enough to pass a take. A cold first render
      // once finished dead on 19.00s with 462 of 570 frames late, and came out
      // 2.8 MB against the 13 MB the same film makes when it runs clean: the
      // loop caught up on the clock while the encoder was handed a mess.
      if (Math.abs(off) > limit || lateFrac > 0.1) {
        console.error(
          `\n  REJECTED: ` + (Math.abs(off) > limit
            ? `${off.toFixed(2)}s of drift is past the ${limit}s limit.`
            : `${drift.late} of ${total} frames missed their slot (${(lateFrac * 100).toFixed(0)}%).`) +
          (SOUND && Math.abs(off) > limit ? "\n  The picture would sit that far off the music by the end." : "") +
          "\n  Run it again, or render at --fps 30 if it keeps happening.",
        );
        cdp.close();
        process.exitCode = 1;
      }
    }
  }

  cdp.close();
} finally {
  // Chrome leaves a family behind: killing the one we started leaves its
  // renderer and utility children running, and those hold this script's pipe
  // open long enough to look like a hang. So kill ours, take the tree down
  // with it on Windows, and stop waiting on either of them.
  proc.kill();
  if (process.platform === "win32" && proc.pid) {
    const sweep = spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    sweep.unref();
  }
  proc.unref();
  // Best effort: a profile left behind is a few megabytes in temp, not a
  // reason to fail a render that already produced its file.
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* it can wait for the OS */ }
}
