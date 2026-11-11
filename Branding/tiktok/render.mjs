/**
 * Cuts the filmed takes into finished videos.
 *
 *   node Branding/tiktok/render.mjs                 every cut in cuts.mjs
 *   node Branding/tiktok/render.mjs ads             one cut
 *   node Branding/tiktok/render.mjs ads --at 0.5,6  those seconds as PNGs
 *   node Branding/tiktok/render.mjs --list
 *
 * Each cut is drawn in compose.html and encoded by Chrome's own H.264 encoder,
 * frame by frame with an exact timestamp on every frame. Nothing is recorded
 * in real time, so a slow machine makes a slow render, never a wrong one.
 *
 * The takes have to exist first: node Branding/tiktok/capture.mjs.
 *
 * Options: --bitrate 14000000  --out <file>  --var name=value (see cuts.mjs)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HERE, CACHE, arg, flag, serve, launchChrome, loaded, ensureFonts } from "./lib.mjs";
import { CUTS } from "./cuts.mjs";

if (flag("list")) {
  for (const [name, c] of Object.entries(CUTS)) console.log(`  ${name.padEnd(14)} ${c.lang}  ${c.about || ""}`);
  process.exit(0);
}

const wanted = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] || "").match(/^--(at|bitrate|out|var)$/));
const names = wanted.length ? wanted : Object.keys(CUTS);
for (const n of names) if (!CUTS[n]) { console.error(`No cut called "${n}". Try --list.`); process.exit(1); }

const BITRATE = Number(arg("bitrate", 14_000_000));
const AT = arg("at", "");

const fonts = await ensureFonts();
const server = await serve([
  ["/__fonts/", fonts],
  ["/takes/", join(CACHE, "takes")],
  ["/__/", HERE],
]);
const { cdp, close } = await launchChrome({ gpu: true });

try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  cdp.on("Runtime.exceptionThrown", p =>
    console.log("  page error:", p.exceptionDetails.exception?.description?.split("\n")[0]));

  for (const name of names) {
    const cut = structuredClone(CUTS[name]);
    // Words that change from post to post, such as a download count, are
    // written as {name} in the captions and set here: --var downloads=12.
    const vars = { ...(cut.vars || {}) };
    for (let i = 0; i < process.argv.length; i++) {
      if (process.argv[i] === "--var" && process.argv[i + 1]) {
        const [k, ...v] = process.argv[i + 1].split("=");
        vars[k] = v.join("=");
      }
    }
    for (const c of cut.captions || []) {
      c.lines = c.lines.map(l => l.replace(/\{(\w+)\}/g, (m, k) => {
        if (vars[k] === undefined) throw new Error(`${name}: no value for {${k}}. Pass --var ${k}=...`);
        return String(vars[k]);
      }));
    }
    const takes = {};
    for (const s of cut.shots) {
      const meta = join(CACHE, "takes", `${s.take}.${cut.lang}`, "take.json");
      if (!existsSync(meta)) {
        throw new Error(`${name} needs the take "${s.take}" in ${cut.lang}. Film it first:\n` +
          `  node Branding/tiktok/capture.mjs ${s.take} --lang ${cut.lang}`);
      }
      takes[s.take] = JSON.parse(readFileSync(meta, "utf8"));
    }
    const fps = Object.values(takes)[0].fps;
    if (Object.values(takes).some(t => t.fps !== fps)) throw new Error(`${name}: takes filmed at different frame rates`);

    await loaded(cdp, () => cdp.send("Page.navigate", { url: server.origin + "/__/compose.html" }));
    const info = await cdp.evaluate(`compose.load(${JSON.stringify(cut)}, ${JSON.stringify(takes)}, ${fps})`);

    if (AT) {
      const dir = join(HERE, "stills");
      mkdirSync(dir, { recursive: true });
      for (const s of AT.split(",").map(Number)) {
        const uri = await cdp.evaluate(`compose.still(${s})`);
        const file = join(dir, `${name}-${s.toFixed(2).replace(".", "s")}.png`);
        writeFileSync(file, Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
        console.log(`  ${file}`);
      }
      continue;
    }

    console.log(`${name}: ${info.seconds.toFixed(2)}s, ${info.frames} frames at ${fps} fps`);
    const r = await cdp.evaluate(`compose.render(${BITRATE})`);
    let b64 = "";
    for (let at = 0; at < r.length; at += 4_000_000) b64 += await cdp.evaluate(`compose.slice(${at}, 4000000)`);
    const out = resolve(names.length === 1 && arg("out") ? arg("out") : join(HERE, `mptree-${name}.mp4`));
    const buf = Buffer.from(b64, "base64");
    if (buf.length !== r.bytes) throw new Error(`${name}: expected ${r.bytes} bytes, got ${buf.length}`);
    // Read the file back and compare it with what was drawn. A difference
    // of a few levels is compression; tens mean the wrong picture.
    const v = await cdp.evaluate(`compose.verify()`);
    const worst = Math.max(...v.checks.map(c => c.diff));
    if (worst > 6) throw new Error(`${name}: the file does not decode to what was drawn (${JSON.stringify(v.checks)})`);
    writeFileSync(out, buf);
    console.log(`  ${out}\n  ${(buf.length / 1048576).toFixed(1)} MB, ${v.codec} (${r.hw}), ${v.keys} key frames, ` +
      `encoded in ${r.seconds}s, decodes back within ${worst.toFixed(1)}/255`);
    if (r.sound) console.log(`  sound: peak ${r.sound.peak}, ${r.sound.rmsDb} dBFS overall; per 0.1 s: ${r.sound.env.join(" ")}`);
  }
} finally {
  await close();
  server.close();
}
