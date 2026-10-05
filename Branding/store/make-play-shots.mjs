/**
 * Builds the store screenshots for 1.2.0 from the real app screens in app-screens/.
 *
 *   node Branding/store/make-play-shots.mjs
 *
 * 1080 x 1920, written to Branding/store/play-1.2.0/ as JPEG (no alpha channel,
 * which Play refuses). Black and white only: a dark screen sits on a pale ground,
 * a light screen on a black one, so the phone never disappears into the card.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "app-screens");
const OUT = join(HERE, "play-1.2.0");
const W = 1080, H = 1920, PORT = 9337;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SHOTS = [
  { file: "01-library",   shot: "01-songs.png",          head: "Your music,<br>already on your phone", sub: "No streaming, no ads, no subscription." },
  { file: "02-player",    shot: "02-player.png",         head: "A record that turns<br>as it plays",   sub: "With your own cover art in the middle." },
  { file: "03-playlists", shot: "04-playlists.png",      head: "Playlists that<br>fill themselves",    sub: "Favourites, recent, most played, last added." },
  { file: "04-lyrics",    shot: "03-lyrics.png",         head: "Lyrics, right<br>where the song is",   sub: "Add them once, read along every time." },
  { file: "05-sound",     shot: "10-settings-audio.png", head: "Equaliser, crossfade,<br>sleep timer", sub: "Shape the sound, then let it stop by itself." },
  { file: "06-light",     shot: "17-light-player.png",   head: "Dark at night,<br>light by day",       sub: "Two themes, both black and white.", dark: true },
  { file: "07-account",   shot: "14-account.png",        head: "One library,<br>three devices",        sub: "With Pro. Kept in your own Google Drive." },
  { file: "08-pro",       shot: "18-player-marble.png",  head: "Make it yours<br>with Pro",            sub: "One purchase. Try it free for a week." },
];

const page = s => {
  const ground = s.dark ? "#0B0B0D" : "#EDEDEA";
  const ink = s.dark ? "#FFFFFF" : "#0B0B0D";
  const soft = s.dark ? "rgba(255,255,255,0.62)" : "rgba(11,11,13,0.60)";
  const rim = s.dark
    ? "linear-gradient(150deg, #8A8A93 0%, #3A3A42 28%, #24242A 64%, #6A6A74 100%)"
    : "linear-gradient(150deg, #55555F 0%, #1B1B20 26%, #0B0B0E 62%, #3A3A44 100%)";
  const shadow = s.dark
    ? "0 0 0 1px rgba(255,255,255,0.10)"
    : "0 60px 100px -30px rgba(0,0,0,0.40), 0 18px 40px -14px rgba(0,0,0,0.28)";
  return `<!doctype html><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
  body { background: ${ground}; color: ${ink}; display: flex; flex-direction: column; align-items: center;
    font-family: "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif; text-align: center; }
  h1 { margin-top: 112px; font-size: 84px; line-height: 1.1; font-weight: 700; letter-spacing: -0.028em; }
  p { margin-top: 26px; font-size: 36px; line-height: 1.3; font-weight: 400; color: ${soft}; }
  .frame { margin-top: 64px; width: 700px; padding: 13px; border-radius: 70px; background: ${rim}; box-shadow: ${shadow}; }
  .screen { border-radius: 57px; overflow: hidden; background: #000; }
  .screen img { width: 100%; height: auto; display: block; }
</style><h1>${s.head}</h1><p>${s.sub}</p>
<div class="frame"><div class="screen"><img src="data:image/png;base64,${readFileSync(join(SRC, s.shot)).toString("base64")}"></div></div>`;
};

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-play-shots-profile");
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
  const tmp = join(tmpdir(), "mptree-play-shot.html");
  for (const s of SHOTS) {
    writeFileSync(tmp, page(s));
    await send("Page.navigate", { url: pathToFileURL(tmp).href });
    await sleep(1200);
    const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 96, captureBeyondViewport: false });
    writeFileSync(join(OUT, s.file + ".jpg"), Buffer.from(data, "base64"));
    console.log("  play-1.2.0/" + s.file + ".jpg");
  }
  rmSync(tmp, { force: true });
  ws.close();
} finally {
  proc.kill();
}
