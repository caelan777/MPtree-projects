/**
 * Builds the Play screenshots for 1.2.8 in style C: one big word, a short line,
 * and the real app screen below it, running off the bottom edge.
 *
 *   node Branding/store/make-play-shots-1.2.8.mjs
 *
 * The screens come from app-screens/shots-1.2.8/ (capture/flows-1.2.8.mjs).
 * 1080 x 1920, written to Branding/store/play-1.2.8/ as JPEG (no alpha channel,
 * which Play refuses). Black and white only.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "app-screens", "shots-1.2.8");
const OUT = join(HERE, "play-1.2.8");
const W = 1080, H = 1920, PORT = 9338;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// from: where on the 1080 x 2160 screen the window starts, in its own pixels.
const SHOTS = [
  { file: "01-offline",    word: "Offline.",    shot: "offline.png",    from: 0,   sub: "Your music plays from your phone. No streaming, no subscription." },
  { file: "02-yours",      word: "Yours.",      shot: "yours.png",      from: 0,   sub: "A record that turns as it plays, with your own cover on it." },
  { file: "03-free",       word: "Free.",       shot: "free.png",       from: 858, sub: "Watch one ad a day to use Pro for free.", dark: true },
  { file: "04-everywhere", word: "Everywhere.", shot: "everywhere.png", from: 0,   sub: "Your songs get synced between your devices." },
];

const page = s => {
  const ground = s.dark ? "#0B0B0D" : "#FFFFFF";
  const ink = s.dark ? "#FFFFFF" : "#0B0B0D";
  const soft = s.dark ? "#C4C4C4" : "#444444";
  const rim = s.dark ? "#5A5A5A" : "#0B0B0D";
  // The word fills the width but never runs past it.
  const size = Math.min(274, Math.floor(943 / (s.word.length * 0.56)));
  const scale = 936 / 1080;
  return `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${ground}; color: ${ink}; position: relative;
    font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif; }
  h1 { position: absolute; left: 72px; top: 70px; font-size: ${size}px; line-height: 0.9; font-weight: 900; letter-spacing: -0.045em; }
  p { position: absolute; left: 72px; top: ${70 + size * 0.9 + 40}px; width: 835px; font-size: 47px; line-height: 1.38; color: ${soft}; }
  .shot { position: absolute; left: 72px; top: 720px; width: 936px; height: ${H - 720 + 80}px; overflow: hidden;
    border-radius: 58px; border: 7px solid ${rim}; background: #fff; }
  .shot img { display: block; width: 922px; margin-top: ${-Math.round(s.from * scale)}px; }
</style><h1>${s.word}</h1><p>${s.sub}</p>
<div class="shot"><img src="data:image/png;base64,${readFileSync(join(SRC, s.shot)).toString("base64")}"></div>`;
};

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
// Temporary files stay inside the project folder, and go when done.
const profile = resolve(HERE, ".chrome-profile");
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

const tmp = join(HERE, ".play-shot.html");
try {
  mkdirSync(OUT, { recursive: true });
  const ws = new WebSocket(await wsUrl());
  const pending = new Map();
  let id = 1;
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); const s = pending.get(m.id); if (s) { pending.delete(m.id); m.error ? s.no(new Error(m.error.message)) : s.ok(m.result); } });
  await new Promise((ok, no) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", no, { once: true }); });
  const send = (method, params = {}) => new Promise((ok, no) => { const i = id++; pending.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params })); });

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  for (const s of SHOTS) {
    writeFileSync(tmp, page(s));
    await send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(1200);
    const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 96, captureBeyondViewport: false });
    writeFileSync(join(OUT, s.file + ".jpg"), Buffer.from(data, "base64"));
    console.log("  play-1.2.8/" + s.file + ".jpg");
  }
  ws.close();
} finally {
  proc.kill();
  await sleep(800);
  rmSync(tmp, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
