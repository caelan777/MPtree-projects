/* Puts the MPTree numbers where the TV can read them.
 *
 *   node Dashboard/publish-tv.mjs
 *
 * Runs collect.mjs, keeps only the few numbers the TV shows, writes them to
 * Dashboard/tv.json and uploads that file to a public Cloudflare R2 bucket.
 * The TV (Settings, MPTree numbers) reads it from the bucket's public address.
 *
 * Only numbers go up: no keys, no review texts, no commit messages. Those stay
 * in data.json on this PC.
 *
 * Needs, once:
 *   - Wrangler logged in: npx wrangler login
 *   - an R2 bucket with public access on (see Dashboard/README.md, "The TV")
 *
 * Options:
 *   --no-collect   upload the data.json that is already there
 *   --dry-run      write tv.json, upload nothing
 *
 * In Dashboard/secrets.env (both optional):
 *   TV_R2_BUCKET=mptree-tv
 *   TV_R2_KEY=mptree-tv.json
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const flag = name => process.argv.includes("--" + name);

function loadEnv() {
  const path = join(HERE, "secrets.env");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function run(cmd, args) {
  // shell: true so npx is found on Windows (npx.cmd) as well as here.
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status ?? r.error?.message})`);
}

const env = loadEnv();
const BUCKET = env.TV_R2_BUCKET || "mptree-tv";
const KEY = env.TV_R2_KEY || "mptree-tv.json";

if (!flag("no-collect")) run(process.execPath, [join(HERE, "collect.mjs"), "--quiet"]);

const dataPath = join(HERE, "data.json");
if (!existsSync(dataPath)) throw new Error("No Dashboard/data.json yet. Run without --no-collect.");
const data = JSON.parse(readFileSync(dataPath, "utf8"));
const s = data.sources ?? {};
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The same shape as data.json, cut down to what the TV reads (TV/src/stats.ts).
const tv = {
  collectedAt: data.collectedAt,
  sources: {
    play: {
      installs: { totalUsers: num(s.play?.installs?.totalUsers), dailyInstalls: num(s.play?.installs?.dailyInstalls) },
      reviews: { average: num(s.play?.reviews?.average), count: num(s.play?.reviews?.count) },
    },
    github: { total: num(s.github?.total) },
    cloudflare: { traffic: { last7: { uniques: num(s.cloudflare?.traffic?.last7?.uniques) } } },
  },
};
const tvPath = join(HERE, "tv.json");
writeFileSync(tvPath, JSON.stringify(tv, null, 2));

const installs = tv.sources.play.installs.totalUsers, downloads = tv.sources.github.total;
console.log(`tv.json: ${installs ?? "–"} Play installs + ${downloads ?? "–"} downloads`);
if (installs === null && downloads === null) console.log("Warning: neither number came through. See the collect.mjs output above.");

if (flag("dry-run")) {
  console.log(`Dry run: not uploaded. Would go to r2://${BUCKET}/${KEY}`);
} else {
  run("npx", ["--yes", "wrangler@4", "r2", "object", "put", `${BUCKET}/${KEY}`, "--file", tvPath,
    "--content-type", "application/json", "--cache-control", "no-cache", "--remote"]);
  console.log(`Uploaded to r2://${BUCKET}/${KEY}. On the TV: Settings, MPTree numbers, the bucket's public address + /${KEY}`);
}
