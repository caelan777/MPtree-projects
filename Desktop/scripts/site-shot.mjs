/**
 * Takes the picture of the Windows app that the website shows under
 * "How it looks", from the interface itself with the demo library.
 *
 *   npm run dev -- --port 5180     (in Desktop/, in another terminal)
 *   node Desktop/scripts/site-shot.mjs
 *
 * Writes Website/assets/img/screens/windows.jpg. Run it again when the wide
 * layout changes, and bump ?v= on the site.
 */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "Website", "assets", "img", "screens", "windows.jpg");
const URL = process.env.MPTREE_UI || "http://localhost:5180/";
const W = 1280, H = 760, PORT = 9338;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-site-shot-profile");
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
  const ws = new WebSocket(await wsUrl());
  const pending = new Map();
  let id = 1;
  ws.addEventListener("message", e => { const m = JSON.parse(e.data); const s = pending.get(m.id); if (s) { pending.delete(m.id); m.error ? s.no(new Error(m.error.message)) : s.ok(m.result); } });
  await new Promise((ok, no) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", no, { once: true }); });
  const send = (method, params = {}) => new Promise((ok, no) => { const n = id++; pending.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params })); });
  const run = expression => send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then(r => r.result?.value);

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });
  // Past the welcome page, as someone who has used it before.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("CapacitorStorage.mptree_onboarded_v2", "1"); } catch {}` });
  await send("Page.navigate", { url: URL });
  await sleep(5000);
  const rows = await run(`document.querySelectorAll(".drow").length`);
  if (!rows) throw new Error("The song list never showed. Is the dev server running on " + URL + "?");
  // A song playing, so the bar and the panel on the right have something in them.
  await run(`document.querySelectorAll(".drow")[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); new Promise(r => setTimeout(r, 2500))`);
  const shot = await send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
  writeFileSync(OUT, Buffer.from(shot.data, "base64"));
  console.log("wrote", OUT);
  ws.close();
} finally {
  proc.kill();
}
