/**
 * The post for the new Discover: free music you can download into MPTree and
 * play offline. Same style as the "FREE. OFFLINE. NO ADS." post.
 *
 *   node Branding/build-discover-post.mjs
 *
 * Writes Branding/social/mptree-discover-1080x1920.png (TikTok, story) and
 * mptree-discover-1080x1350.png (Instagram feed). Black and white.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "social");
const PORT = 9343;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const mark = readFileSync(join(HERE, "logo", "mptree-mark-white.svg")).toString("base64");

// The same look as the first "FREE. OFFLINE. NO ADS." post: the mark on top,
// three short lines in heavy capitals, the name spaced out at the bottom.
const page = (W, H, tall) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: #000; color: #fff; font-family: "Segoe UI Black", "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative; }
  .mark { position: absolute; top: ${tall ? 380 : 120}px; width: ${tall ? 210 : 190}px; height: auto; }
  h1 { font-weight: 900; font-size: ${tall ? 124 : 120}px; line-height: 1.12; white-space: nowrap; letter-spacing: 0.005em; text-transform: uppercase; margin-top: ${tall ? 120 : 110}px; }
  .new { margin-top: ${tall ? 70 : 46}px; font-family: "Segoe UI", Roboto, sans-serif; font-weight: 600; font-size: ${tall ? 38 : 32}px; color: #9a9a9a; letter-spacing: 0.02em; }
  .name { position: absolute; bottom: ${tall ? 400 : 70}px; font-family: "Segoe UI", Roboto, sans-serif; font-size: ${tall ? 34 : 30}px; font-weight: 700;
    letter-spacing: 0.62em; margin-right: -0.62em; color: #c9c9c9; }
</style>
<img class="mark" src="data:image/svg+xml;base64,${mark}" alt="">
<h1>Free music.<br>Download it.<br>Play offline.</h1>
<p class="new">New in MPTree: Discover</p>
<div class="name">MPTREE</div>`;

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-discover-post-profile");
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
  const tmp = join(tmpdir(), "mptree-discover-post.html");
  for (const [W, H] of [[1080, 1350], [1080, 1920]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    writeFileSync(tmp, page(W, H, H > 1500));
    await send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(1400);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const name = `mptree-discover-${W}x${H}.png`;
    writeFileSync(join(OUT, name), Buffer.from(data, "base64"));
    console.log("  social/" + name);
  }
  rmSync(tmp, { force: true });
  ws.close();
} finally {
  proc.kill();
}
