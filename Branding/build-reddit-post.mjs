/**
 * The picture for posting MPTree for Android on Reddit.
 *
 *   node Branding/build-reddit-post.mjs
 *
 * Writes Branding/social/mptree-reddit-1080x1350.png. Black and white, in step
 * with build-windows-post.mjs. The phones show the app's own screens from
 * Branding/store/app-screens; take new ones there when the app changes.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "social");
const PORT = 9342;
const W = 1080, H = 1350;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mark = readFileSync(join(HERE, "logo", "mptree-mark-white.svg")).toString("base64");
const screen = name => "data:image/png;base64," + readFileSync(join(HERE, "store", "app-screens", name + ".png")).toString("base64");

// Three phones: the list on the left, the record playing in front, and the
// same record in white on the right, so the light side of the app is seen too.
const page = `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: #000; color: #fff; font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 60px; position: relative; }
  .top { display: flex; align-items: center; gap: 22px; }
  .mark { width: 74px; height: auto; display: block; }
  .name { font-size: 25px; font-weight: 700; letter-spacing: 0.62em; margin-right: -0.62em; color: #c9c9c9; }
  h1 { margin-top: 40px; font-size: 96px; line-height: 0.98; font-weight: 800; letter-spacing: -0.035em; }
  .sub { margin-top: 22px; font-size: 32px; line-height: 1.3; color: #bdbdbd; }
  .phones { position: absolute; left: 0; right: 0; top: 500px; height: 900px; }
  .phone { position: absolute; border-radius: 50px; padding: 11px; background: #1b1b1b;
    box-shadow: inset 0 0 0 2px #3a3a3a, 0 30px 90px rgba(255,255,255,0.08); }
  .phone img { display: block; width: 100%; height: auto; border-radius: 40px; }
  .front { width: 390px; left: ${(W - 390) / 2}px; top: 0; z-index: 2; box-shadow: inset 0 0 0 2px #4a4a4a, 0 0 0 10px #000, 0 40px 120px rgba(255,255,255,0.12); }
  .left  { width: 330px; left: 70px;  top: 90px; z-index: 1; transform: rotate(-6deg); }
  .right { width: 330px; right: 70px; top: 90px; z-index: 1; transform: rotate(6deg); }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; padding: 110px 0 56px;
    background: linear-gradient(180deg, rgba(0,0,0,0) 0, #000 100px); }
  .get { font-size: 40px; font-weight: 800; letter-spacing: -0.01em; }
  .url { display: inline-block; margin-top: 18px; font-size: 38px; font-weight: 800; color: #000; background: #fff;
    padding: 14px 40px 17px; border-radius: 999px; letter-spacing: -0.01em; }
</style>
<div class="top"><img class="mark" src="data:image/svg+xml;base64,${mark}" alt=""><div class="name">MPTREE</div></div>
<h1>Your music.<br>No internet needed.</h1>
<p class="sub">A free music player for the songs on your phone.<br>No ads. No subscription. Nothing tracked.</p>
<div class="phones">
  <div class="phone left"><img src="${screen("01-songs")}" alt=""></div>
  <div class="phone right"><img src="${screen("17-light-player")}" alt=""></div>
  <div class="phone front"><img src="${screen("02-player")}" alt=""></div>
</div>
<div class="foot">
  <div class="get">Free on Google Play</div>
  <div class="url">mp-tree.net</div>
</div>`;

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-reddit-post-profile");
rmSync(profile, { recursive: true, force: true });
const proc = spawn(chrome, ["--headless=new", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const p = (await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json())).find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome never answered");
}

try {
  mkdirSync(OUT, { recursive: true });
  const ws = new WebSocket(await wsUrl());
  const pending = new Map();
  let id = 1;
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); const s = pending.get(m.id); if (s) { pending.delete(m.id); m.error ? s.no(new Error(m.error.message)) : s.ok(m.result); } });
  await new Promise((ok, no) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", no, { once: true }); });
  const send = (method, params = {}) => new Promise((ok, no) => { const i = id++; pending.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const tmp = join(tmpdir(), "mptree-reddit-post.html");
  writeFileSync(tmp, page);
  await send("Page.navigate", { url: pathToFileURL(tmp).href });
  await sleep(1600);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const name = `mptree-reddit-${W}x${H}.png`;
  writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
  console.log("  social/" + name);
  rmSync(tmp, { force: true });
  ws.close();
} finally {
  proc.kill();
}
