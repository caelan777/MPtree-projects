/**
 * The few MPTree numbers the TV launcher shows, put where the TV can read them.
 *
 *   node Dashboard/tv-numbers.mjs            collect, then update the gist
 *   node Dashboard/tv-numbers.mjs --no-collect   only update the gist from data.json
 *
 * Runs collect.mjs (keys stay on this PC), takes from data.json only what the TV
 * reads, in the same shape (TV/src/stats.ts, parseStats), and writes that to a
 * secret GitHub gist through the gh CLI's own login. The TV reads the gist's raw
 * address, set as STATS_URL in TV/src/homeConfig.ts. Windows Task Scheduler runs
 * this once a day ("MPTree TV numbers").
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GIST = "ed8ce9b41d95f75ab8c04822360c5057";
const FILE = "tv-numbers.json";

if (!process.argv.includes("--no-collect")) {
  const r = spawnSync(process.execPath, [join(HERE, "collect.mjs"), "--quiet"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const data = JSON.parse(readFileSync(join(HERE, "data.json"), "utf8"));
const s = data.sources ?? {};
const play = s.play?.ok ? {
  installs: { totalUsers: s.play.installs?.totalUsers, dailyInstalls: s.play.installs?.dailyInstalls },
  reviews: { average: s.play.reviews?.average, count: s.play.reviews?.count },
} : undefined;
const slim = {
  collectedAt: data.collectedAt,
  sources: {
    play,
    github: s.github?.ok ? { total: s.github.total } : undefined,
    cloudflare: s.cloudflare?.ok ? { traffic: { last7: { uniques: s.cloudflare.traffic?.last7?.uniques } } } : undefined,
  },
};

const body = JSON.stringify({ files: { [FILE]: { content: JSON.stringify(slim, null, 2) } } });
const r = spawnSync("gh", ["api", "-X", "PATCH", `gists/${GIST}`, "--input", "-", "--silent"], { input: body, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`TV numbers updated: ${data.collectedAt}`);
