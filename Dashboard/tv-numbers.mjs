/**
 * The MPTree number the TV launcher shows, put where the TV can read it:
 * downloads in total.
 *
 *   node Dashboard/tv-numbers.mjs            collect, then update the gist
 *   node Dashboard/tv-numbers.mjs --no-collect   only update the gist from data.json
 *
 * Runs collect.mjs (keys stay on this PC) and writes the result to a secret
 * GitHub gist through the gh CLI's own login. Downloads are the website's
 * public releases (GitHub; the pro-test builds left out, since those are mostly
 * testers updating) plus Play installs once Play is set up. The TV reads the gist's raw
 * address, STATS_URL in TV/src/homeConfig.ts (TV/src/stats.ts reads it). Windows
 * Task Scheduler runs this every hour ("MPTree TV numbers").
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
const site = s.github?.ok
  ? (s.github.releases ?? []).filter(r => !/pro-test/i.test(r.tag ?? ""))
    .reduce((n, r) => n + (r.assets ?? []).reduce((m, a) => m + (a.downloads ?? 0), 0), 0)
  : null;
const play = s.play?.ok ? s.play.installs?.totalUsers ?? null : null;
if (site === null && play === null) {
  console.error("No download numbers this time; the gist is left as it was.");
  process.exit(1);
}
const total = (site ?? 0) + (play ?? 0);

const out = { collectedAt: data.collectedAt, total };
const body = JSON.stringify({ files: { [FILE]: { content: JSON.stringify(out, null, 2) } } });
const r = spawnSync("gh", ["api", "-X", "PATCH", `gists/${GIST}`, "--input", "-", "--silent"], { input: body, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`TV numbers updated: ${total} downloads`);
