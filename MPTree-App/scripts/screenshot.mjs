/**
 * Phone screenshots of the running app, at real device resolution.
 *
 * The website and the Play Store listing both need pictures of the interface,
 * and hand-taking them on a device means they drift and get retaken at whatever
 * size the phone happened to be. This drives the dev server's page through
 * Chrome's DevTools protocol instead, so a shot is reproducible and always
 * comes out at exactly 1080 x 2400.
 *
 * Chrome's `--window-size` is not enough on its own: headless clamps the window
 * to a minimum width (486 css px here), so the page lays out too wide and the
 * capture crops it. Emulation.setDeviceMetricsOverride sets the viewport for
 * real, which is why this talks to the protocol rather than shelling out to
 * `--screenshot`.
 *
 *   npm run dev                      # in another terminal, serving :5173
 *   node scripts/screenshot.mjs
 *
 * Options: --url --out --width --height --dsf --wait --eval "<js>"
 *
 * The shot is seeded first: scripts/shot-props/seed.html fills the fixture's
 * covers, favourites, a listening history and a restored session into local
 * storage, then hands over to the app. Those props have to be served from the
 * app's own origin to write its storage, so they are copied into public/ for
 * the length of the run and deleted afterwards. They live outside public/ the
 * rest of the time because everything in there ships inside the release APK.
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE   = dirname(fileURLToPath(import.meta.url));
const PROPS  = join(HERE, "shot-props");
const PUBLIC = join(HERE, "..", "public");

/** Copies seed.html and the demo covers into public/, returning a cleanup. */
function stageProps() {
  const staged = [];
  for (const name of readdirSync(PROPS)) {
    if (name === "make-covers.mjs") continue;
    const to = join(PUBLIC, name === "seed.html" ? "_shot.html" : name);
    copyFileSync(join(PROPS, name), to);
    staged.push(to);
  }
  return () => staged.forEach(f => rmSync(f, { force: true }));
}

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const URL_    = arg("url", "http://localhost:5173/_shot.html");
const OUT     = resolve(arg("out", "shot.png"));
const WIDTH   = Number(arg("width", 360));
const HEIGHT  = Number(arg("height", 800));
const DSF     = Number(arg("dsf", 3));
const WAIT_MS = Number(arg("wait", 6000));
const EVAL    = arg("eval", "");
const PORT    = Number(arg("port", 9333));

const chrome = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chrome) {
  console.error("No Chrome found. Add its path to CHROME_CANDIDATES.");
  process.exit(1);
}

const profile = resolve(tmpdir(), "mptree-shot-profile");
rmSync(profile, { recursive: true, force: true });

const unstage = stageProps();

const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The debugging port is not listening the instant the process starts. */
async function targetWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const page = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome's debugging port never answered");
}

/** Minimal CDP client. Node has WebSocket built in, so nothing to install. */
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

try {
  const cdp = connect(await targetWsUrl());
  await cdp.ready;

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: DSF, mobile: true,
  });
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url: URL_ });

  // The app starts in two phases and the seed page redirects, so waiting on a
  // load event is not enough. A flat wait is cruder and far more reliable.
  await sleep(WAIT_MS);

  if (EVAL) {
    await cdp.send("Runtime.evaluate", { expression: EVAL, awaitPromise: true });
    await sleep(1200);
  }

  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: false,
  });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(data, "base64"));
  console.log(`${OUT}  ${WIDTH * DSF} x ${HEIGHT * DSF}`);
  cdp.close();
} finally {
  proc.kill();
  unstage();
}
