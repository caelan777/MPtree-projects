/**
 * The post that says MPTree for Windows is out as an early release.
 *
 *   node Branding/build-windows-post.mjs
 *
 * Writes Branding/social/mptree-windows-1080x1350.png (Instagram feed) and
 * mptree-windows-1080x1920.png (TikTok, Instagram story). Black and white, in
 * step with build-tester-post.mjs. The picture of the app is the one the
 * website shows (Website/assets/img/screens/windows.jpg); take a new one with
 * Desktop/scripts/site-shot.mjs when the app changes.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "social");
const PORT = 9341;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mark = readFileSync(join(HERE, "logo", "mptree-mark-white.svg")).toString("base64");
const shot = readFileSync(join(HERE, "..", "Website", "assets", "img", "screens", "windows.jpg")).toString("base64");

// `tall` is the 9:16 one. TikTok and Instagram lay their own buttons over the
// top and bottom of a story, so everything there keeps well clear of both.
const page = (W, H, tall) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: #000; color: #fff; font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding-top: ${tall ? 190 : 56}px; }
  .mark { width: ${tall ? 118 : 96}px; height: auto; display: block; }
  .name { margin-top: ${tall ? 30 : 22}px; font-size: ${tall ? 30 : 27}px; font-weight: 700; letter-spacing: 0.62em; margin-right: -0.62em; color: #c9c9c9; }
  .tag { margin-top: ${tall ? 64 : 40}px; font-size: ${tall ? 27 : 24}px; font-weight: 700; letter-spacing: 0.2em; margin-right: -0.2em;
    padding: 11px 26px 12px; border: 2px solid #8a8a8a; border-radius: 999px; color: #e9e9e9; }
  h1 { margin-top: ${tall ? 34 : 22}px; font-size: ${tall ? 140 : 108}px; line-height: 0.98; font-weight: 800; letter-spacing: -0.035em; }
  .sub { margin-top: ${tall ? 28 : 16}px; font-size: ${tall ? 39 : 32}px; line-height: 1.3; color: #bdbdbd; font-weight: 400; }
  /* The app, in a plain window frame, running off the right edge: it reads as
     a real window on a desk, and the song list stays large enough to read. */
  .win { margin-top: ${tall ? 64 : 36}px; align-self: flex-start; margin-left: 70px; width: ${tall ? 1500 : 1360}px;
    border-radius: 16px 0 0 16px; overflow: hidden; border: 1px solid #3c3c3c; border-right: 0;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 40px 120px rgba(255,255,255,0.10); background: #fff; flex-shrink: 0; }
  .bar { height: 38px; background: #fff; }
  .win img { display: block; width: 100%; height: auto; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; padding: ${tall ? "200px 0 250px" : "170px 0 50px"};
    /* Solid black before the words start, so they never sit on the picture. */
    background: linear-gradient(180deg, rgba(0,0,0,0) 0, #000 ${tall ? 170 : 150}px); }
  .get { font-size: ${tall ? 50 : 44}px; font-weight: 800; letter-spacing: -0.01em; }
  .url { display: inline-block; margin-top: ${tall ? 24 : 18}px; font-size: ${tall ? 46 : 40}px; font-weight: 800; color: #000; background: #fff;
    padding: 14px 40px 17px; border-radius: 999px; letter-spacing: -0.01em; }
  .at { margin-top: ${tall ? 28 : 20}px; font-size: ${tall ? 29 : 26}px; color: #8f8f8f; }
</style>
<img class="mark" src="data:image/svg+xml;base64,${mark}" alt="">
<div class="name">MPTREE</div>
<div class="tag">EARLY RELEASE</div>
<h1>Now on<br>Windows</h1>
<p class="sub">Your music, on your computer.<br>Free. No ads. No subscription.</p>
<div class="win"><div class="bar"></div><img src="data:image/jpeg;base64,${shot}" alt=""></div>
<div class="foot">
  <div class="get">Download it free at</div>
  <div class="url">mp-tree.net</div>
  <div class="at">@mp_tree3 on TikTok · @mptree33 on Instagram</div>
</div>`;

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-windows-post-profile");
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
  const tmp = join(tmpdir(), "mptree-windows-post.html");
  for (const [W, H] of [[1080, 1350], [1080, 1920]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    writeFileSync(tmp, page(W, H, H > 1500));
    await send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(1400);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const name = `mptree-windows-${W}x${H}.png`;
    writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
    console.log("  social/" + name);
  }
  rmSync(tmp, { force: true });
  ws.close();
} finally {
  proc.kill();
}
