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
  fps:      Number(arg("fps", 30)),
  duration: Number(arg("duration", 19)),
};
const BITRATE = Number(arg("bitrate", 14_000_000));
const OUT = resolve(HERE, arg("out", flag("square") ? "mptree-ad-square.mp4" : "mptree-ad.mp4"));

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

const SHOT_FILES = ["songs", "player", "playlists"];
const shots = {};
for (const name of SHOT_FILES) {
  const p = join(RAW, name + ".png");
  if (!existsSync(p)) {
    console.error("Missing screenshot: " + p + "\nRun MPTree-App/scripts/screenshot.mjs first.");
    process.exit(1);
  }
  shots[name] = "data:image/png;base64," + readFileSync(p).toString("base64");
}

const built = readFileSync(join(HERE, "ad.html"), "utf8")
  .replace("__MARK__",   markPath)
  .replace("__SHOTS__",  JSON.stringify(shots))
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
const profile = resolve(tmpdir(), "mptree-ad-profile");
rmSync(profile, { recursive: true, force: true });

const proc = spawn(CHROME, [
  flag("headful") ? "--window-size=520,900" : "--headless=new",
  "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  "--no-first-run", "--no-default-browser-check",
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

const MIMES = [
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
    const mime = await evaluate(cdp,
      `(${JSON.stringify(MIMES)}).find(m => MediaRecorder.isTypeSupported(m)) || ""`);
    if (!mime) throw new Error("This Chrome will not record any video format.");
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    console.log(`recording as ${mime}`);
    if (ext !== "mp4") {
      console.log("  (no MP4 encoder here, so the file comes out WebM)");
    }

    const t0 = Date.now();
    const length = await evaluate(cdp, `window.adRecord(${JSON.stringify(mime)}, ${BITRATE})`);

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
  }

  cdp.close();
} finally {
  proc.kill();
}
