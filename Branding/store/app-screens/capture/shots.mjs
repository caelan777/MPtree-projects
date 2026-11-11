// Screens of the running app (dev server on :5173), at 1080 x 2160.
//   node shots.mjs <project root> <flows file> <out dir> [flow name ...]
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const [ROOT, FLOWS_FILE, OUT, ...ONLY] = process.argv.slice(2);
const { SLEEVES } = await import(pathToFileURL(join(ROOT, "Branding/tiktok/covers.mjs")).href);
const { FLOWS } = await import(pathToFileURL(resolve(FLOWS_FILE)).href + "?" + Date.now());
const FONT = readFileSync(join(ROOT, "Branding/tiktok/.cache/fonts/roboto.woff2")).toString("base64");

// Static Bloom wears the MPTree mark instead of its own sleeve.
const MARK = readFileSync(join(ROOT, "Branding/source/mptree-mark.svg"), "utf8").match(/ d="([^"]+)"/)[1];
const LOGO_SLEEVE = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#0d0d0d"/><path transform="translate(111 111) scale(0.29)" fill="#ffffff" fill-rule="evenodd" d="${MARK}"/></svg>`;
const ORIGIN = "http://localhost:5173";
const W = 360, H = 720, DSF = 3, PORT = 9335;
const ALBUMS = ["Paper Weather", "Slow Signal", "Static Bloom", "Ghost Frequency", "Low Tide", "Sunday Machine", "Nightjar", "Tidewater"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find(p => existsSync(p));
const profile = resolve(tmpdir(), "mptree-shots-profile");
rmSync(profile, { recursive: true, force: true });
const proc = spawn(chrome, ["--headless=new", "--hide-scrollbars", "--mute-audio", "--no-first-run",
  "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "about:blank"], { stdio: "ignore" });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json`).then(r => r.json());
      const p = list.find(t => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("Chrome never answered");
}
function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 1;
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    const s = pending.get(m.id);
    if (!s) return;
    pending.delete(m.id);
    m.error ? s.reject(new Error(m.error.message)) : s.resolve(m.result);
  });
  const ready = new Promise((ok, no) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", no, { once: true }); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }),
      sleep(20000).then(() => { throw new Error("evaluate timed out: " + expression.slice(0, 80)); }),
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { ready, send, evaluate, close: () => ws.close() };
}

const HELPERS = `
(() => {
  const shown = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  window.__shown = shown;
  window.__find = q => {
    let el = null;
    const pick = list => { const v = list.filter(shown); return v[q.nth || 0] || null; };
    if (q.tour) el = pick([...document.querySelectorAll('[data-tour="' + q.tour + '"]')]);
    else if (q.label) el = pick([...document.querySelectorAll("[aria-label]")].filter(e => e.getAttribute("aria-label") === q.label));
    else if (q.labelHas) el = pick([...document.querySelectorAll("[aria-label]")].filter(e => e.getAttribute("aria-label").includes(q.labelHas)));
    else if (q.css) el = pick([...document.querySelectorAll(q.css)]);
    else if (q.text) {
      const all = [...document.querySelectorAll("body *")].filter(e => e.textContent.trim() === q.text && shown(e));
      const inner = all.filter(e => ![...e.children].some(c => c.textContent.trim() === q.text));
      el = inner[q.nth || 0] || null;
      if (el && q.up) for (let i = 0; i < q.up && el.parentElement; i++) el = el.parentElement;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * (q.fx ?? 0.5) + (q.dx || 0), y: r.top + r.height * (q.fy ?? 0.5) + (q.dy || 0) };
  };
  window.__tap = (x, y) => {
    const target = document.elementFromPoint(x, y) || document.body;
    const mk = type => {
      const t = new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 11, radiusY: 11, force: 1 });
      const now = type === "end" ? [] : [t];
      return new TouchEvent("touch" + type, { bubbles: true, cancelable: true, composed: true, touches: now, targetTouches: now, changedTouches: [t] });
    };
    target.dispatchEvent(mk("start"));
    const end = mk("end");
    target.dispatchEvent(end);
    if (!end.defaultPrevented) target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, detail: 1 }));
    return target.tagName;
  };
  window.__dump = () => {
    const out = [];
    for (const e of document.querySelectorAll("button, [role=button], [aria-label], input, [data-tour]")) {
      if (!shown(e)) continue;
      const r = e.getBoundingClientRect();
      out.push([e.tagName, e.getAttribute("aria-label") || "", e.getAttribute("data-tour") || "", e.textContent.trim().slice(0, 40), Math.round(r.left), Math.round(r.top)].join(" | "));
    }
    return out.join("\\n");
  };
  const bytes = Uint8Array.from(atob("${FONT}"), c => c.charCodeAt(0));
  const face = new FontFace("Segoe UI", bytes.buffer, { weight: "100 900" });
  document.fonts.add(face);
  face.load().catch(() => {});
  const vinyl = new Image(); vinyl.src = "/vinyl.webp";
})();
`;

async function seedPage(cfg) {
  localStorage.clear();
  sessionStorage.clear();
  const toJpeg = svg => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 320; c.getContext("2d").drawImage(img, 0, 0, 320, 320); ok(c.toDataURL("image/jpeg", 0.88)); };
    img.onerror = fail;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  const art = {};
  for (const [album, svg] of Object.entries(cfg.sleeves)) art[album] = await toJpeg(svg);
  const meta = {};
  for (const [id, album] of Object.entries(cfg.albumOf)) meta[id] = { customPhoto: art[album] };
  for (const i of [1, 5, 9, 13, 17, 22]) meta["demo://" + i].liked = true;
  const HOUR = 3600000, now = Date.now();
  [[2, 31, 1], [1, 14, 3], [9, 9, 5], [5, 8, 9], [17, 7, 14], [0, 6, 20], [13, 5, 27], [22, 4, 33], [4, 3, 41], [8, 2, 52]].forEach(([i, plays, ago]) => {
    Object.assign(meta["demo://" + i], { playCount: plays, lastPlayedAt: now - ago * HOUR });
  });
  if (cfg.lyrics) meta["demo://2"].customLyrics = cfg.lyrics;
  const set = (k, v) => localStorage.setItem("CapacitorStorage." + k, typeof v === "string" ? v : JSON.stringify(v));
  set("mptree_meta", meta);
  set("mptree_session", cfg.session);
  set("mptree_playlists", [
    { id: "1000", name: "Late drives", createdAt: Date.UTC(2026, 6, 12), songIds: [0, 8, 16, 24, 32, 40, 9, 17].map(i => "demo://" + i), coverPhoto: art["Paper Weather"] },
    { id: "1001", name: "Kitchen radio", createdAt: Date.UTC(2026, 5, 3), songIds: [1, 5, 13, 21, 29, 37].map(i => "demo://" + i), coverPhoto: art["Low Tide"] },
    { id: "1002", name: "Long walk", createdAt: Date.UTC(2026, 4, 21), songIds: [2, 10, 18, 26, 34, 42, 50, 58, 3, 11, 19].map(i => "demo://" + i), coverPhoto: art["Static Bloom"] },
  ]);
  set("mptree_lang", cfg.lang);
  set("mptree_onboarded_v2", "1");
  set("mptree_collapse_hint_shown", "3");
  for (const [k, v] of Object.entries(cfg.extra)) set(k, v);
  for (const [k, v] of Object.entries(cfg.raw)) localStorage.setItem(k, v);
  for (const [k, v] of Object.entries(cfg.tab)) sessionStorage.setItem(k, v);
  return Object.keys(localStorage).length;
}

const ids = Array.from({ length: 64 }, (_, i) => "demo://" + i);
const seedConfig = f => ({
  sleeves: { ...SLEEVES, "Static Bloom": LOGO_SLEEVE },
  albumOf: Object.fromEntries(ids.map((id, i) => [id, ALBUMS[i % 8]])),
  lang: f.lang || "en",
  session: { filter: "newest", playMode: f.playMode || "shuffle", currentId: f.current || "demo://2", queueIds: ids, positionMs: 74000, isPlaying: false, theme: f.theme || "dark" },
  extra: f.storage || {}, raw: f.raw || {}, tab: f.tab || {}, lyrics: f.lyrics || "",
});

let failed = 0;
try {
  mkdirSync(OUT, { recursive: true });
  const cdp = connect(await wsUrl());
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DSF, mobile: true });
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: HELPERS });

  for (const [name, flow] of Object.entries(FLOWS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    try {
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: flow.theme || "dark" }] });
      await cdp.send("Page.navigate", { url: (flow.port ? "http://localhost:" + flow.port : ORIGIN) + "/manifest.webmanifest" });
      await sleep(600);
      console.log(name);
      await cdp.evaluate(`(${seedPage.toString()})(${JSON.stringify(seedConfig(flow))})`);
      await cdp.send("Page.navigate", { url: (flow.port ? "http://localhost:" + flow.port : ORIGIN) + "/" });
      let up = false;
      for (let i = 0; i < 80 && !up; i++) {
        await sleep(250);
        up = await cdp.evaluate(`!!document.querySelector('[data-tour="songs"]') && document.body.innerText.includes("Midnight Drive")`).catch(() => false);
      }
      if (!up) throw new Error("the app never came up");
      await sleep(1500);
      for (const s of flow.steps) {
        if (s.tap) {
          let p = null;
          for (let i = 0; i < 12 && !p; i++) { p = await cdp.evaluate(`__find(${JSON.stringify(s.tap)})`); if (!p) await sleep(250); }
          if (!p) {
            if (s.optional) continue;
            throw new Error("nothing matches " + JSON.stringify(s.tap));
          }
          await cdp.evaluate(`__tap(${p.x}, ${p.y})`);
          await sleep(s.wait ?? 700);
        } else if (s.see) {
          await cdp.evaluate(`(() => { const e = [...document.querySelectorAll("body *")].find(e => e.textContent.trim() === ${JSON.stringify(s.see)} && !e.children.length); if (e) e.scrollIntoView({ block: ${JSON.stringify(s.block || "center")} }); return !!e; })()`);
          await sleep(s.wait ?? 500);
        } else if (s.js) {
          const r = await cdp.evaluate(s.js);
          if (s.print) console.log(r);
          await sleep(s.wait ?? 500);
        } else if (s.wait) {
          await sleep(s.wait);
        } else if (s.dump) {
          console.log(`--- ${name} / ${s.dump}\n` + await cdp.evaluate("__dump()"));
        } else if (s.shot) {
          await sleep(s.settle ?? 600);
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          writeFileSync(join(OUT, s.shot + ".png"), Buffer.from(data, "base64"));
          console.log("  " + s.shot + ".png");
        }
      }
    } catch (e) { failed++; try { const { data } = await cdp.send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, "fail-" + name + ".png"), Buffer.from(data, "base64")); } catch {} console.log(`  ${name} FAILED: ${e.message}`); }
  }
  cdp.close();
} finally {
  proc.kill();
}
process.exit(failed ? 1 : 0);
