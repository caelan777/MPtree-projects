/**
 * Builds the Google Play screenshots from raw captures of the running app.
 *
 *   node Branding/store/make-store-shots.mjs
 *
 * The raw captures come from MPTree-App/scripts/screenshot.mjs, which drives
 * the real app. Nothing here is drawn by hand, so a screenshot cannot drift
 * from the interface it claims to show. Re-capture, then re-run this.
 *
 * ── On the colour ────────────────────────────────────────────────────────
 * This is the one place MPTree is not black and white, and it is deliberate.
 * The ground is mixed from the app's own three state colours, the violet of
 * shuffle, the blue of repeat and the pink of a liked song, lightened until
 * dark text sits on them comfortably. Inside the phone the interface is still
 * strictly monochrome; the colour is the frame around it, not the product.
 *
 * It also does real work: the app's screens are almost black, so a pale ground
 * throws them forward. A black screenshot on a black background, which is what
 * the previous set was, disappears in Play's strip.
 *
 * Two of the five carry no screenshot. What MPTree is for, playing what is
 * already on your phone with nothing leaving it, is not visible in any
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

/* Straight from MPTree-App/src/themes.ts. Kept as the source values and
   lightened in CSS rather than pasted as pastels, so the link back to the
   app's own palette stays visible. */
const VIOLET = "#7C3AED";  // shuffle
const SKY    = "#0EA5E9";  // repeat
const PINK   = "#E8445A";  // liked

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
    file: "04-song.png",
    shot: "menu.png",
    head: "Everything,<br>on every song",
    sub:  "Ringtone, cover art, tags, lyrics, trimming, playlists. One menu.",
  },
  {
    file: "05-private.png",
    statement: "No signal,<br>no account, no ads",
    sub: "It plays what is already on your phone, and nothing about it ever leaves.",
  },
];

const MARK = size =>
  `<svg width="${size}" height="${size}" viewBox="0 0 512 512"><path fill="#141418" d="M256 40 L432 300 H336 L336 472 H176 L176 300 H80 Z"/></svg>`;

const dataUri = p => "data:image/png;base64," + readFileSync(p).toString("base64");

function page(shot) {
  const body = shot.statement
    ? `<div class="statement">
         <div class="mark">${MARK(120)}</div>
         <h1 class="big">${shot.statement}</h1>
         <p class="sub wide">${shot.sub}</p>
       </div>`
    : `<div class="head">
         <h1>${shot.head}</h1>
         <p class="sub">${shot.sub}</p>
       </div>
       <div class="stage">
         <div class="frame${shot.dim ? " dim" : ""}">
           <div class="screen"><img src="${dataUri(join(RAW, shot.shot))}" alt=""></div>
         </div>
       </div>`;

  return `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body {
    font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, -apple-system, sans-serif;
    color: #141418;
    display: flex; flex-direction: column;
    /* Three soft pools rather than one linear ramp, so the ground has somewhere
       to go behind the phone instead of banding straight down the frame. */
    background:
      radial-gradient(120% 90% at 12% 4%,   ${VIOLET}4F 0%, transparent 58%),
      radial-gradient(110% 80% at 96% 20%,  ${SKY}4A 0%, transparent 55%),
      radial-gradient(130% 95% at 78% 104%, ${PINK}46 0%, transparent 60%),
      linear-gradient(168deg, #F7F4FD 0%, #EDF3FA 48%, #FCF1F4 100%);
  }

  .head { padding: 104px 78px 0; flex-shrink: 0; text-align: center; }
  h1 {
    font-size: 76px; line-height: 1.05; font-weight: 700;
    letter-spacing: -0.035em; text-wrap: balance;
  }
  .sub {
    margin: 26px auto 0; font-size: 31px; line-height: 1.4;
    color: #55566A; font-weight: 400; max-width: 24ch;
  }

  /* The phone is cut off by the bottom edge rather than shrunk to fit. A screen
     you can read beats a whole phone you cannot. */
  .stage { flex: 1; display: flex; justify-content: center; margin-top: 66px; min-height: 0; }

  .frame {
    width: 790px; flex-shrink: 0; align-self: flex-start;
    padding: 14px;
    border-radius: 70px;
    /* A rail, not a flat block: light catches the top left of a real phone. */
    background: linear-gradient(150deg, #55555F 0%, #1B1B20 26%, #0B0B0E 62%, #3A3A44 100%);
    box-shadow:
      0 44px 90px -18px rgba(38, 20, 72, 0.42),
      0 14px 34px -10px rgba(38, 20, 72, 0.26),
      0 2px 0 rgba(255, 255, 255, 0.35) inset;
  }
  .screen {
    border-radius: 57px; overflow: hidden; background: #000;
    position: relative;
  }
  .screen img { width: 100%; height: auto; display: block; }

  .statement {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 0 88px; text-align: center;
  }
  .mark { margin-bottom: 56px; }
  .big { font-size: 94px; line-height: 1.04; font-weight: 700; letter-spacing: -0.04em; }
  .sub.wide { max-width: 28ch; margin-top: 38px; font-size: 33px; }
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
    const buf = Buffer.from(data, "base64");
    writeFileSync(join(OUT, shot.file), buf);
    console.log(`  ${shot.file}  ${W}x${H}  ${(buf.length / 1024).toFixed(0)}KB`);
  }

  cdp.close();
  rmSync(tmp, { force: true });
  console.log(`\n${SHOTS.length} screenshots in ${OUT}`);
} finally {
  proc.kill();
}
