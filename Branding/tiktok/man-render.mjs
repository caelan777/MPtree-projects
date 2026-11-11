/**
 * Renders man.html, the drawn jumpscare, to mptree-halloween-man.mp4.
 *
 *   node Branding/tiktok/man-render.mjs              the video
 *   node Branding/tiktok/man-render.mjs --at 1,4,8   stills to stills/, no video
 *
 * Options: --bitrate 14000000
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, arg, serve, launchChrome, loaded, ensureFonts } from "./lib.mjs";

const fonts = await ensureFonts();
const server = await serve([["/__fonts/", fonts], ["/__/", HERE]]);
const { cdp, close } = await launchChrome({ gpu: true });
try {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  cdp.on("Runtime.exceptionThrown", p => console.log("  page error:", p.exceptionDetails.exception?.description?.split("\n")[0]));
  await loaded(cdp, () => cdp.send("Page.navigate", { url: server.origin + "/__/man.html" }));
  for (let i = 0; i < 100 && !(await cdp.evaluate("!!window.man")); i++) await new Promise(r => setTimeout(r, 100));
  const T = await cdp.evaluate("man.ready()");

  if (arg("at", "")) {
    mkdirSync(join(HERE, "stills"), { recursive: true });
    for (const s of arg("at").split(",").map(Number)) {
      const uri = await cdp.evaluate(`man.still(${s})`);
      const file = join(HERE, "stills", `man-${s.toFixed(2).replace(".", "s")}.png`);
      writeFileSync(file, Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64"));
      console.log("  " + file);
    }
  } else {
    const r = await cdp.evaluate(`man.render(${Number(arg("bitrate", 14_000_000))})`);
    let b64 = "";
    for (let at = 0; at < r.length; at += 4_000_000) b64 += await cdp.evaluate(`man.slice(${at}, 4000000)`);
    const buf = Buffer.from(b64, "base64");
    if (buf.length !== r.bytes) throw new Error(`expected ${r.bytes} bytes, got ${buf.length}`);
    const out = join(HERE, "mptree-halloween-man.mp4");
    writeFileSync(out, buf);
    console.log(`  ${out}\n  ${(buf.length / 1048576).toFixed(1)} MB, ${r.frames} frames, ${T.end}s, ${r.codec} (${r.hw})` +
      `\n  sound: peak ${r.peak} at ${r.peakAt}s; silent from ${T.grin}s for the song`);
  }
} finally {
  await close();
  server.close();
}
