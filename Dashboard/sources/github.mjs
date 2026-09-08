/* GitHub: how many people actually downloaded a build.
 *
 * This is the one source that needs no setup at all. The GitHub CLI is
 * installed and authenticated, it is just not on PATH in these shells, so it
 * gets called by its full path.
 *
 * Every release carries two copies of the same APK under different names, and
 * the difference matters: MPTree.apk is what the Download button on the site
 * resolves to through /releases/latest, and MPTree-<version>.apk is what the
 * versions page links to. Counting them separately says which door people came
 * through, which one is worth putting effort into.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const GH_CANDIDATES = [
  "C:/Program Files/GitHub CLI/gh.exe",
  "C:/Program Files (x86)/GitHub CLI/gh.exe",
  "/usr/bin/gh",
  "/usr/local/bin/gh",
  "/opt/homebrew/bin/gh",
];

const REPO = "caelan777/MPtree-projects";

function ghApi(gh, path) {
  const out = execFileSync(gh, ["api", path], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(out);
}

export async function github() {
  const gh = GH_CANDIDATES.find(p => existsSync(p))
    ?? (() => { try { execFileSync("gh", ["--version"]); return "gh"; } catch { return null; } })();

  if (!gh) {
    return { ok: false, reason: "The GitHub CLI was not found. Install it, or add its path to GH_CANDIDATES." };
  }

  const releases = ghApi(gh, `repos/${REPO}/releases?per_page=100`);
  const repo     = ghApi(gh, `repos/${REPO}`);
  const commits  = ghApi(gh, `repos/${REPO}/commits?per_page=5`);

  let button = 0, versionsPage = 0;

  const perRelease = releases.map(rel => {
    const assets = rel.assets.map(a => ({ name: a.name, downloads: a.download_count }));
    for (const a of assets) {
      // MPTree.apk is the Download button. Anything else with a version in its
      // name came off the versions page.
      if (a.name === "MPTree.apk") button += a.downloads;
      else if (a.name.endsWith(".apk")) versionsPage += a.downloads;
    }
    return {
      tag:       rel.tag_name,
      name:      rel.name,
      published: rel.published_at,
      total:     assets.reduce((n, a) => n + a.downloads, 0),
      assets,
    };
  });

  return {
    ok: true,
    total: button + versionsPage,
    byDoor: { downloadButton: button, versionsPage },
    releases: perRelease,
    repo: {
      pushedAt:   repo.pushed_at,
      openIssues: repo.open_issues_count,
      stars:      repo.stargazers_count,
      private:    repo.private,
    },
    commits: commits.map(c => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      date:    c.commit.author.date,
    })),
  };
}
