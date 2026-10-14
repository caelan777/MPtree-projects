/**
 * The screenshots for the Microsoft Store listing: the wide window with the
 * demo library, once in each of four styles.
 *
 *   npm run dev -- --port 5180     (in Desktop/, in another terminal)
 *   node Desktop/scripts/store-shots.mjs
 *
 * Writes Desktop/store/screenshots/1-black.png and so on, at 2160 by 1215
 * (the Store wants at least 1366 by 768). Like site-shot.mjs, it drives a
 * headless Chrome; the look and the mode are put in storage before each load.
 */
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "store", "screenshots");
const URL = process.env.MPTREE_UI || "http://localhost:5180/";
const W = 1440, H = 810, PORT = 9339;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE = {
  vinylDark: "classic", vinylLight: "classic", dark: "classic", light: "classic",
  cardDark: "default", cardLight: "default", icon: "classic", photoDisc: false, flowers: "none",
  aviela: { record: "lily", flowers: "sprig", card: "light:classic" },
  lantern: { record: "lantern", card: "dark:lantern", colour: "dark:classic" },
};
const STYLES = [
  { file: "1-black", theme: "dark", look: {} },
  { file: "2-aviela", theme: "light", look: { light: "pink", flowers: "sprig", cardLight: "light:classic", cardDark: "light:classic", vinylLight: "lily", vinylDark: "lily" } },
  { file: "3-lantern", theme: "dark", look: { cardDark: "dark:lantern", cardLight: "dark:lantern", vinylDark: "lantern", vinylLight: "lantern" } },
  { file: "4-white", theme: "light", look: { vinylLight: "white", vinylDark: "white" } },
];

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-store-shot-profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
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
  await send("Page.navigate", { url: URL });
  await sleep(3000);

  for (const s of STYLES) {
    const put = {
      mptree_onboarded_v2: "1",
      mptree_update_notices: "0",
      mptree_look: JSON.stringify({ ...BASE, ...s.look }),
      mptree_session: JSON.stringify({ filter: "newest", theme: s.theme, isPlaying: false }),
    };
    await run(`localStorage.clear(); ${Object.entries(put).map(([k, v]) => `localStorage.setItem(${JSON.stringify("CapacitorStorage." + k)}, ${JSON.stringify(v)});`).join(" ")}`);
    await send("Page.reload");
    await sleep(5000);
    const rows = await run(`document.querySelectorAll(".drow").length`);
    if (!rows) throw new Error("The song list never showed. Is the dev server running on " + URL + "? The page says: " + await run(`document.body.innerText.slice(0, 200)`));
    // A song playing, so the bar and the panel on the right have something in them.
    await run(`document.querySelectorAll(".drow")[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); new Promise(r => setTimeout(r, 2500))`);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const file = join(OUT, `${s.file}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log("wrote", file);
  }
  ws.close();
} finally {
  proc.kill();
}
