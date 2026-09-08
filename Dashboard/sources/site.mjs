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

/* versions.js sets globals on `window` rather than exporting, because it is
 * loaded by a plain script tag on the site. Running it against a stub gives
 * the same array the site itself renders, so there is no second copy of the
 * release list to keep in step. */
function readVersionsJs(repoRoot) {
  const src = readFileSync(join(repoRoot, "Website", "assets", "versions.js"), "utf8");
  const win = {};
  new Function("window", src)(win);
  return { repo: win.MPTREE_REPO, versions: win.MPTREE_VERSIONS ?? [] };
}

/* Never request the real ?v= URL of an asset while checking. Cloudflare serves
 * /assets/* with a year of immutable caching, so fetching a version-stamped URL
 * before a deploy has landed pins the OLD file at the NEW address for a year.
 * A throwaway querystring cannot poison anything. */
const bust = url => `${url}${url.includes("?") ? "&" : "?"}nocache=${Date.now()}`;

export async function site(repoRoot) {
  const { versions } = readVersionsJs(repoRoot);
  const newest = versions[0];

  const res = await fetch(bust(`${SITE}/version.json`), { redirect: "follow" });
  if (!res.ok) return { ok: false, reason: `version.json answered ${res.status}` };
  const live = await res.json();

  const home = await fetch(bust(`${SITE}/`));
  const html = home.ok ? await home.text() : "";
  const assetVersion = html.match(/site\.css\?v=(\d+)/)?.[1] ?? null;

  const agrees = live.latest === newest?.version;

  return {
    ok: true,
    reachable: home.ok,
    assetVersion,
    liveVersion: live.latest,
    liveDate:    live.date,
    repoVersion: newest?.version ?? null,
    repoDate:    newest?.date ?? null,
    agrees,
    // Spelled out rather than left to the page to work out, so the reason a
    // panel is flagged travels with the flag.
    warning: agrees ? null
      : `version.json says ${live.latest} but versions.js says ${newest?.version}. ` +
        `Anyone on an older build is not being told an update exists.`,
    releaseCount: versions.length,
  };
}
