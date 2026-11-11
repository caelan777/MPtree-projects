/* The site itself: is it up, and is it telling people the truth.
 *
 * The app downloaded from the website checks /version.json about once a day to
 * find out whether a newer build exists. If that file falls behind the release
 * list the site renders, nobody is ever told, and the failure is completely
 * silent: the site looks correct, the app looks correct, and the update simply
 * never reaches anyone. So the one thing worth checking automatically is that
 * the two agree.
 *
 * Needs no credentials. Everything here is public.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://mp-tree.net";

/* Since October 2026 there is no versions page: the repo's own
 * Website/version.json is the truth, and the live copy must match it. */
function readRepoVersion(repoRoot) {
  return JSON.parse(readFileSync(join(repoRoot, "Website", "version.json"), "utf8"));
}

/* Never request the real ?v= URL of an asset while checking. Cloudflare serves
 * /assets/* with a year of immutable caching, so fetching a version-stamped URL
 * before a deploy has landed pins the OLD file at the NEW address for a year.
 * A throwaway querystring cannot poison anything. */
const bust = url => `${url}${url.includes("?") ? "&" : "?"}nocache=${Date.now()}`;

export async function site(repoRoot) {
  const repo = readRepoVersion(repoRoot);

  const res = await fetch(bust(`${SITE}/version.json`), { redirect: "follow" });
  if (!res.ok) return { ok: false, reason: `version.json answered ${res.status}` };
  const live = await res.json();

  const t0 = Date.now();
  const home = await fetch(bust(`${SITE}/`));
  const ms = Date.now() - t0;
  const html = home.ok ? await home.text() : "";
  const assetVersion = html.match(/site.css?v=(d+)/)?.[1] ?? null;

  const agrees = live.latest === repo.latest && live.windows?.latest === repo.windows?.latest;

  return {
    ok: true,
    reachable: home.ok,
    responseMs: ms,
    assetVersion,
    liveVersion: live.latest,
    liveDate:    live.date,
    liveWindows: live.windows?.latest ?? null,
    repoVersion: repo.latest,
    repoWindows: repo.windows?.latest ?? null,
    agrees,
    warning: agrees ? null
      : `The live version.json (${live.latest} / Windows ${live.windows?.latest}) differs from the repo (${repo.latest} / Windows ${repo.windows?.latest}).`,
  };
}
