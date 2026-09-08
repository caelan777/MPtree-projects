/* Collects every MPTree number that an API will give up, into one file.
 *
 *   node Dashboard/collect.mjs
 *
 * Writes Dashboard/data.json, and builds Dashboard/dashboard.build.html with
 * those numbers baked in. That file is what gets published, and the same data
 * is pushed into the published page's database.
 *
 * Why both: a published artifact cannot fetch anything. Its content security
 * policy blocks every outbound request, so the page has to be handed its data
 * rather than going to get it. Which is just as well, since it means no
 * credential ever leaves this machine.
 *
 * Every source runs on its own and is wrapped. A missing key or a dead API
 * marks that one section unavailable, with the reason, and the rest still run.
 * The dashboard then shows an honest gap instead of a stale number pretending
 * to be current.
 *
 * Options:
 *   --out <path>   write the JSON somewhere else
 *   --quiet        no per source progress
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { github }     from "./sources/github.mjs";
import { site }       from "./sources/site.mjs";
import { cloudflare } from "./sources/cloudflare.mjs";
import { play }       from "./sources/play.mjs";
import { cusdis }     from "./sources/cusdis.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const QUIET = process.argv.includes("--quiet");
const OUT   = resolve(arg("out", join(HERE, "data.json")));

/* secrets.env is a plain KEY=value file, gitignored. Deliberately not JSON:
 * it gets pasted into by hand, and a stray comma in JSON is a silent break. */
function loadEnv() {
  const path = join(HERE, "secrets.env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    out[trimmed.slice(0, eq).trim()] =
      trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();

const SOURCES = [
  ["github",     "GitHub releases", () => github()],
  ["site",       "Site health",     () => site(ROOT)],
  ["cloudflare", "Cloudflare",      () => cloudflare(env)],
  ["play",       "Google Play",     () => play(env, HERE)],
  ["cusdis",     "Comments",        () => cusdis(env)],
];

const say = (...a) => { if (!QUIET) console.log(...a); };

const data = { collectedAt: new Date().toISOString(), sources: {} };

for (const [key, label, run] of SOURCES) {
  const started = Date.now();
  try {
    data.sources[key] = await run();
  } catch (err) {
    // A source that throws outright is still just one unavailable panel.
    data.sources[key] = { ok: false, reason: String(err?.message ?? err) };
  }
  const result = data.sources[key];
  say(`  ${result.ok ? "ok  " : "skip"} ${label.padEnd(16)} ${Date.now() - started}ms` +
      (result.ok ? "" : `  ${result.reason}`));
}

writeFileSync(OUT, JSON.stringify(data, null, 2));

/* The page is published with the latest numbers already in it, so it is never
 * blank on the first frame and still reads correctly if the database cannot
 * be reached. The live copy in the database wins whenever it is newer.
 *
 * A review or a commit message containing a closing script tag would end the
 * script early and spill the rest of the page out as text, so `<` is escaped.
 * The two line separators are legal inside JSON and illegal inside a
 * JavaScript string literal, which is the other way this breaks. */
const LINE_SEP  = String.fromCharCode(0x2028);
const PARA_SEP  = String.fromCharCode(0x2029);

const inline = JSON.stringify(data)
  .split("<").join("\\u003c")
  .split(LINE_SEP).join("\\u2028")
  .split(PARA_SEP).join("\\u2029");

const PAGE = join(HERE, "dashboard.build.html");
const template = readFileSync(join(HERE, "dashboard.html"), "utf8");
if (!template.includes("__SNAPSHOT__")) {
  throw new Error("dashboard.html has no __SNAPSHOT__ placeholder to fill in");
}
writeFileSync(PAGE, template.replace("__SNAPSHOT__", inline));

const ready = Object.values(data.sources).filter(s => s.ok).length;
say(`\n${OUT}\n${PAGE}\n${ready} of ${SOURCES.length} sources answered.`);
