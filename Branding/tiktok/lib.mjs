/* What capture.mjs and render.mjs share: a Chrome to drive, a way to talk to
 * it, and a small web server for it to load pages from.
 *
 * No dependencies. Node 22 has fetch and WebSocket built in, and Chrome does
 * the rest, down to encoding the video.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE  = dirname(fileURLToPath(import.meta.url));
export const ROOT  = resolve(HERE, "..", "..");
export const CACHE = join(HERE, ".cache");

export const flag = name => process.argv.includes("--" + name);
export const arg  = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── A web server ─────────────────────────────────────────────────────────
   Pages have to come from http, not file://: the app keeps its settings in
   localStorage, which a file:// page does not reliably get, and a canvas that
   draws a file:// image is tainted and cannot be encoded. `routes` maps a URL
   prefix to a folder; the first match wins. ──────────────────────────────── */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};

export function serve(routes, { fallback, inline = {} } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (inline[path]) {
      res.writeHead(200, { "Content-Type": inline[path][0], "Cache-Control": "no-store" });
      res.end(inline[path][1]);
      return;
    }
    let file = null;
    for (const [prefix, dir] of routes) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length) || "index.html";
      const candidate = resolve(dir, rest);
      if (!candidate.startsWith(resolve(dir) + sep) && candidate !== resolve(dir)) break;
      if (existsSync(candidate) && statSync(candidate).isFile()) file = candidate;
      break;
    }
    if (!file && fallback) file = fallback;
    if (!file) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(file));
  });
  return new Promise(ok => server.listen(0, "127.0.0.1", () => ok({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  })));
}

/* ── Chrome ─────────────────────────────────────────────────────────────── */
const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

let portSeed = 9500 + (process.pid % 300);

export async function launchChrome({ gpu = false } = {}) {
  const exe = CHROMES.find(p => existsSync(p));
  if (!exe) throw new Error("No Chrome found. Add its path to CHROMES in lib.mjs.");
  const port = portSeed++;
  // A profile per run, inside the project. Chrome's crash handler can hold a
  // lock in it for a moment after exit, so a shared one fails the next run.
  const profile = join(CACHE, `chrome-${process.pid}-${port}`);
  mkdirSync(CACHE, { recursive: true });
  const proc = spawn(exe, [
    "--headless=new", "--hide-scrollbars", "--mute-audio",
    ...(gpu ? [] : ["--disable-gpu"]),
    "--no-first-run", "--no-default-browser-check",
    "--disable-breakpad", "--no-crash-upload",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    "about:blank",
  ], { stdio: "ignore" });

  let ws = null;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
      ws = list.find(t => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl ?? null;
    } catch { /* not up yet */ }
    if (!ws) await sleep(250);
  }
  if (!ws) { proc.kill(); throw new Error("Chrome's debugging port never answered"); }

  const cdp = connect(ws);
  await cdp.ready;

  const close = async () => {
    cdp.close();
    proc.kill();
    // Killing Chrome leaves its children, which keep this process's pipes open.
    if (process.platform === "win32" && proc.pid) {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" }).unref();
    }
    proc.unref();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* later */ }
  };
  return { cdp, close };
}

/** A minimal DevTools protocol client, with events. */
export function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  ws.addEventListener("message", e => {
    const msg = JSON.parse(e.data);
    if (msg.id !== undefined) {
      const slot = pending.get(msg.id);
      if (!slot) return;
      pending.delete(msg.id);
      msg.error ? slot.reject(new Error(`${slot.method}: ${msg.error.message}`)) : slot.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params);
    }
  });
  const ready = new Promise((ok, fail) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", fail, { once: true });
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(fn);
  };
  /** Runs an expression in the page and returns its value, awaited. */
  const evaluate = async expression => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  };
  return { ready, send, on, evaluate, close: () => ws.close() };
}

/** Waits for a page load that was started by `start`. */
export async function loaded(cdp, start) {
  const done = new Promise(ok => cdp.on("Page.loadEventFired", ok));
  await start();
  await Promise.race([done, sleep(10_000)]);
}

/* ── Fonts ────────────────────────────────────────────────────────────────
   Two, fetched from Google Fonts once and kept in .cache:

   Roboto, because it is what an Android phone draws the app in. The app asks
   for "Segoe UI" before falling back to the system sans, so on this Windows
   machine Chrome would draw Windows' font and the recording would not look
   like a phone. capture.mjs registers Roboto under that name.

   TikTok Sans, TikTok's own typeface, released under the OFL. Captions set in
   it look like text added in TikTok's editor rather than like an ad. ──── */
const FONT_CSS = {
  "roboto.woff2":      "https://fonts.googleapis.com/css2?family=Roboto:wght@100..900&display=swap",
  "tiktok-sans.woff2": "https://fonts.googleapis.com/css2?family=TikTok+Sans:wght@400..900&display=swap",
};

export async function ensureFonts() {
  const dir = join(CACHE, "fonts");
  mkdirSync(dir, { recursive: true });
  for (const [name, cssUrl] of Object.entries(FONT_CSS)) {
    const out = join(dir, name);
    if (existsSync(out)) continue;
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36" },
    }).then(r => r.text());
    // The latin block, which covers English and Dutch.
    const block = css.split("/* latin */")[1];
    const url = block && (block.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!url) throw new Error(`No latin woff2 in ${cssUrl}`);
    const buf = Buffer.from(await fetch(url).then(r => r.arrayBuffer()));
    writeFileSync(out, buf);
    console.log(`  font ${name}  ${Math.round(buf.length / 1024)} KB`);
  }
  return dir;
}
