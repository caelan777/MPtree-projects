// Puts a screen inside a phone on a plain grey ground, 1080 x 1920.
//   node frame.mjs <screen.png> "<headline>" [<screen.png> "<headline>" ...]   → ../framed/<same name>
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "framed");
const W = 1080, H = 1920, PORT = 9336;
const GROUND = "#85868C";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const page = (png, head) => `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${GROUND}; display: flex; flex-direction: column; align-items: center;
    font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif; color: #0d0d0f; }
  /* Two lines tall whatever the headline, so the phone sits in the same place on every card.
     A one-line headline sits on the lower line, next to the phone. */
  h1 { align-self: stretch; height: 500px; padding: 0 64px 44px; display: flex; align-items: flex-end; font-size: 92px; line-height: 1.12; font-weight: 700; letter-spacing: -0.025em; }
  .frame {
    width: 600px; padding: 12px; border-radius: 62px; margin-right: 120px;
    background: linear-gradient(150deg, #55555F 0%, #1B1B20 26%, #0B0B0E 62%, #3A3A44 100%);
    box-shadow: 0 50px 90px -24px rgba(0, 0, 0, 0.45), 0 16px 36px -12px rgba(0, 0, 0, 0.30), 0 2px 0 rgba(255, 255, 255, 0.35) inset;
  }
  .screen { border-radius: 50px; overflow: hidden; background: #000; }
  .screen img { width: 100%; height: auto; display: block; }
</style><h1>${head}</h1><div class="frame"><div class="screen"><img src="data:image/png;base64,${readFileSync(png).toString("base64")}"></div></div>`;

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-frame-profile");
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

  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  const tmp = join(tmpdir(), "mptree-frame-page.html");
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const png = args[i];
    writeFileSync(tmp, page(resolve(png), args[i + 1] || ""));
    await send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(1200);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(OUT, basename(png)), Buffer.from(data, "base64"));
    console.log("  framed/" + basename(png));
  }
  rmSync(tmp, { force: true });
  ws.close();
} finally {
  proc.kill();
}
