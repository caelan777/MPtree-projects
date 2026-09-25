/**
 * Builds the Google Play screenshots from raw captures of the running app.
 *
 *   node Branding/store/make-store-shots.mjs
 *
 * Play shows these small, in a strip you swipe sideways, so a bare screenshot
 * of an interface loses. Each one gets a headline that says what you are
 * looking at, and the phone is cropped so it bleeds off the bottom edge rather
 * than sitting in the middle like a product photo.
 *
 * The raw captures come from MPTree-App/scripts/screenshot.mjs, which drives
 * the real app. Nothing here is drawn by hand, so a screenshot cannot drift
 * from the interface it claims to show. Re-capture, then re-run this.
 *
 * Two of the five carry no screenshot at all. What MPTree is for, playing what
 * is already on your phone with nothing leaving it, is not visible in any
 * interface, and those two are where it gets said.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW  = join(HERE, "raw");
const OUT  = join(HERE, "screenshots");

const W = 1080, H = 1920;

/* Play's own guidance is 2 to 8. Five is enough to tell the story and few
   enough that the last one still gets seen. */
const SHOTS = [
  {
    file: "01-library.png",
    shot: "songs.png",
    head: "Your music,<br>already on your phone",
    sub:  "No streaming, no account, no subscription.",
  },
  {
    file: "02-player.png",
    shot: "player.png",
    head: "A player worth<br>opening",
    sub:  "Your own cover art, on a record that turns as it plays.",
  },
  {
    file: "03-playlists.png",
    shot: "playlists.png",
    head: "Playlists that<br>fill themselves",
    sub:  "Favourites, Recently Played, Most Played and Last Added.",
  },
  {
    file: "04-offline.png",
    statement: "It works<br>with no signal",
    sub: "Flight mode, the underground, another country with the data off.",
  },
  {
    file: "05-private.png",
    statement: "Nothing leaves<br>your device",
    sub: "No ads, no tracking, no account. Free, and staying that way.",
  },
];

const MARK = `<svg width="104" height="104" viewBox="0 0 512 512"><path fill="#fff" d="M256 40 L432 300 H336 L336 472 H176 L176 300 H80 Z"/></svg>`;

const dataUri = p => "data:image/png;base64," + readFileSync(p).toString("base64");

function page(shot) {
  const body = shot.statement
    ? `<div class="statement">
         <div class="mark">${MARK}</div>
         <h1 class="big">${shot.statement}</h1>
         <p class="sub wide">${shot.sub}</p>
       </div>`
    : `<div class="head">
         <h1>${shot.head}</h1>
         <p class="sub">${shot.sub}</p>
       </div>
       <div class="phone"><img src="${dataUri(join(RAW, shot.shot))}" alt=""></div>`;

  return `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; background: #000; overflow: hidden; }
  body {
    font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, -apple-system, sans-serif;
    color: #fff; display: flex; flex-direction: column;
  }

  .head { padding: 96px 76px 0; flex-shrink: 0; }
  h1 {
    font-size: 78px; line-height: 1.04; font-weight: 700;
    letter-spacing: -0.035em; text-wrap: balance;
  }
  .sub {
    margin-top: 26px; font-size: 31px; line-height: 1.42;
    color: #8A8A8A; font-weight: 400; max-width: 27ch;
  }

  /* The phone is wider than the space left under the headline, so it is cut
     off at the bottom rather than shrunk. A screen you can read beats a whole
     phone you cannot. */
  .phone { flex: 1; display: flex; justify-content: center; margin-top: 44px; min-height: 0; }
  .phone img {
    width: 800px; height: auto; display: block;
    border: 1px solid #2A2A2A;
    border-top-left-radius: 44px; border-top-right-radius: 44px;
    border-bottom: 0;
  }

  .statement {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 0 84px; text-align: center;
  }
  .mark { margin-bottom: 58px; }
  .big {
    font-size: 96px; line-height: 1.03; font-weight: 700; letter-spacing: -0.04em;
  }
  .sub.wide { max-width: 30ch; margin-top: 38px; font-size: 34px; }
</style>${body}`;
}

/* ── Chrome over the DevTools protocol, the same approach the app's own
      screenshot script uses and for the same reason: --screenshot alone
      clamps the window and crops the result. ─────────────────────────────── */
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find(p => existsSync(p));

if (!CHROME) {
  console.error("No Chrome found.");
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9444;
const profile = resolve(tmpdir(), "mptree-store-profile");
rmSync(profile, { recursive: true, force: true });

const proc = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`,
  "about:blank",
], { stdio: "ignore" });

async function targetWsUrl() {
  for (let i = 0; i < 60; i++) {
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

try {
  mkdirSync(OUT, { recursive: true });
  const tmp = join(tmpdir(), "mptree-store-page.html");

  const cdp = connect(await targetWsUrl());
  await cdp.ready;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: W, height: H, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send("Page.enable");

  for (const shot of SHOTS) {
    writeFileSync(tmp, page(shot));
    await cdp.send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(900);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: false,
    });
    const out = join(OUT, shot.file);
    writeFileSync(out, Buffer.from(data, "base64"));
    console.log(`  ${shot.file}  ${W}x${H}  ${(Buffer.from(data, "base64").length / 1024).toFixed(0)}KB`);
  }

  cdp.close();
  rmSync(tmp, { force: true });
  console.log(`\n${SHOTS.length} screenshots in ${OUT}`);
} finally {
  proc.kill();
}
