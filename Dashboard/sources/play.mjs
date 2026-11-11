/* Google Play: reviews, and the install numbers.
 *
 * Two hard truths to state up front, because they decide what this file can
 * and cannot do:
 *
 *  1. Closed test opt-ins and the fourteen day counter are NOT in any API.
 *     They exist only in the Play Console screen. No amount of work here will
 *     produce them, which is why the dashboard has you type them in.
 *  2. Install counts are not in the Play Developer API either. They live in
 *     CSV reports Google drops into a Cloud Storage bucket. So this reads the
 *     bucket, which is why the service account also needs storage read access.
 *
 * Authentication is a service account: a JWT signed with its private key,
 * traded at Google's token endpoint for an access token. node:crypto can do
 * RS256 on its own, so this needs nothing installed.
 *
 * Setup is in the README. Until it is done, or until the app has any data at
 * all, every part of this reports why it is empty rather than failing the run.
 */
import { createSign } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

const PACKAGE = "com.caelan.mptree";
const SCOPES  = [
  "https://www.googleapis.com/auth/androidpublisher",
  "https://www.googleapis.com/auth/devstorage.read_only",
].join(" ");

const b64url = buf => Buffer.from(buf).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Signs the assertion Google wants and swaps it for an access token. */
async function accessToken(key) {
  const now    = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss:   key.client_email,
    scope: SCOPES,
    aud:   "https://oauth2.googleapis.com/token",
    iat:   now,
    exp:   now + 3600,
  }));

  const sig = createSign("RSA-SHA256")
    .update(`${header}.${claims}`)
    .sign(key.private_key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:  `${header}.${claims}.${b64url(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description ?? body.error ?? `HTTP ${res.status}`);
  return body.access_token;
}

/* Play's report CSVs are UTF-16 little endian with a byte order mark, which
 * decoded as UTF-8 comes out as text with a null between every letter. */
function decodeCsv(buf) {
  const bytes = new Uint8Array(buf);
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
  return new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head  = lines.shift().split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.filter(Boolean).map(line => {
    const cells = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

export async function play(env, dashboardDir) {
  const keyPath = env.PLAY_SERVICE_ACCOUNT_JSON
    ?? `${dashboardDir}/play-service-account.json`;

  if (!existsSync(keyPath)) {
    return {
      ok: false,
      reason: "No Play service account key. Follow step 2 in Dashboard/README.md, " +
              "then put the JSON key at Dashboard/play-service-account.json.",
    };
  }

  let key, token;
  try {
    key   = JSON.parse(readFileSync(keyPath, "utf8"));
    token = await accessToken(key);
  } catch (err) {
    return { ok: false, reason: `Could not authenticate with Google: ${err.message}` };
  }

  const auth = { authorization: `Bearer ${token}`, accept: "application/json" };
  const out  = { ok: true, package: PACKAGE, reviews: null, installs: null };

  // ── Reviews ────────────────────────────────────────────────────────────
  try {
    const res = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/reviews?maxResults=25`,
      { headers: auth },
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);

    const rows = (body.reviews ?? []).map(r => {
      const c = r.comments?.[0]?.userComment ?? {};
      return {
        author: r.authorName ?? "anonymous",
        stars:  c.starRating ?? null,
        text:   (c.text ?? "").slice(0, 400),
        at:     c.lastModified?.seconds
          ? new Date(Number(c.lastModified.seconds) * 1000).toISOString() : null,
        device: c.deviceMetadata?.productName ?? null,
        version: c.appVersionName ?? null,
      };
    });

    const rated = rows.filter(r => r.stars);
    out.reviews = {
      count: rows.length,
      average: rated.length
        ? Math.round((rated.reduce((n, r) => n + r.stars, 0) / rated.length) * 10) / 10
        : null,
      // Reviews only exist once someone writes one. An empty list this early
      // in a closed test is the normal case, not a fault.
      note: rows.length ? null : "No reviews written yet.",
      latest: rows.slice(0, 5),
    };
  } catch (err) {
    out.reviews = { error: err.message };
  }

  // ── Installs, from the reports bucket ──────────────────────────────────
  const bucket = env.PLAY_REPORTS_BUCKET;
  if (!bucket) {
    out.installs = {
      note: "Add PLAY_REPORTS_BUCKET to secrets.env to show install counts. " +
            "Play Console, Download reports, Statistics: the bucket is the " +
            "gs://pubsite_prod_... name shown there.",
    };
    return out;
  }

  const listCsv = async (prefix, suffix) => {
    const list = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`,
      { headers: auth },
    ).then(r => r.json());
    return (list.items ?? []).filter(o => o.name.endsWith(suffix))
      .sort((x, y) => x.name.localeCompare(y.name));
  };
  const readCsv = async obj => parseCsv(decodeCsv(await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(obj.name)}?alt=media`,
    { headers: { authorization: `Bearer ${token}` } },
  ).then(r => r.arrayBuffer())));
  const n = v => Number(v ?? 0) || 0;

  try {
    const prefix = `stats/installs/installs_${PACKAGE}_`;
    const overviews = await listCsv(prefix, "_overview.csv");

    if (!overviews.length) {
      out.installs = { note: "No install reports in the bucket yet. Google writes them once the app has data." };
      return out;
    }

    // The last three months, so the chart covers more than the days of this one.
    const rows = [];
    for (const o of overviews.slice(-3)) rows.push(...await readCsv(o));
    const newest = overviews[overviews.length - 1];
    const last = rows[rows.length - 1] ?? {};

    out.installs = {
      report:        newest.name.split("/").pop(),
      through:       last.Date ?? null,
      totalUsers:    n(last["Total User Installs"]),
      activeDevices: n(last["Active Device Installs"]),
      dailyInstalls: n(last["Daily User Installs"]),
      dailyUninstalls: n(last["Daily User Uninstalls"]),
      days: rows.slice(-90).map(r => ({
        date:      r.Date,
        installs:  n(r["Daily User Installs"]),
        uninstalls: n(r["Daily User Uninstalls"]),
        active:    n(r["Active Device Installs"]),
        updates:   n(r["Daily Device Upgrades"]),
      })),
    };

    // Active devices per country, on the last day of the newest report.
    const countryFile = (await listCsv(prefix, "_country.csv")).pop();
    if (countryFile) {
      const cr = await readCsv(countryFile);
      const lastDay = cr.reduce((m, r) => r.Date > m ? r.Date : m, "");
      const installsBy = {};
      for (const r of cr) installsBy[r.Country] = (installsBy[r.Country] ?? 0) + n(r["Daily User Installs"]);
      out.installs.countries = cr.filter(r => r.Date === lastDay)
        .map(r => ({ country: r.Country, active: n(r["Active Device Installs"]), installs: installsBy[r.Country] ?? 0 }))
        .sort((x, y) => y.active - x.active).slice(0, 12);
    }
  } catch (err) {
    out.installs = { error: err.message };
  }

  // ── Crashes and ANRs, same bucket ──────────────────────────────────────
  try {
    const files = await listCsv(`stats/crashes/crashes_${PACKAGE}_`, "_overview.csv");
    const rows = [];
    for (const o of files.slice(-2)) rows.push(...await readCsv(o));
    out.crashes = rows.length ? {
      days: rows.slice(-60).map(r => ({ date: r.Date, crashes: n(r["Daily Crashes"]), anrs: n(r["Daily ANRs"]) })),
    } : { note: "No crash reports in the bucket yet." };
  } catch (err) {
    out.crashes = { error: err.message };
  }

  // ── Store listing: visitors, acquisitions, where they came from ───────
  try {
    const files = await listCsv(`stats/store_performance/store_performance_${PACKAGE}_`, "_traffic_source.csv");
    const rows = [];
    for (const o of files.slice(-2)) rows.push(...await readCsv(o));
    const byDay = {}, bySource = {};
    for (const r of rows) {
      const d = (byDay[r.Date] ??= { date: r.Date, visitors: 0, acquisitions: 0 });
      d.visitors += n(r["Store listing visitors"]); d.acquisitions += n(r["Store listing acquisitions"]);
      const key = r["Traffic source"] === "Google Play search" ? `Zoeken: ${r["Search term"]}` : r["Traffic source"];
      const b = (bySource[key] ??= { source: key, visitors: 0, acquisitions: 0 });
      b.visitors += n(r["Store listing visitors"]); b.acquisitions += n(r["Store listing acquisitions"]);
    }
    out.store = rows.length ? {
      days: Object.values(byDay).sort((x, y) => x.date.localeCompare(y.date)).slice(-60),
      sources: Object.values(bySource).sort((x, y) => y.visitors - x.visitors).slice(0, 10),
    } : { note: "No store listing reports yet." };
  } catch (err) {
    out.store = { error: err.message };
  }

  // ── Ratings, same bucket ───────────────────────────────────────────────
  try {
    const files = await listCsv(`stats/ratings/ratings_${PACKAGE}_`, "_overview.csv");
    const rows = [];
    for (const o of files.slice(-3)) rows.push(...await readCsv(o));
    const last = rows[rows.length - 1];
    out.ratings = last ? {
      through: last.Date,
      total: Number(last["Total Average Rating"]) || null,
      days: rows.slice(-90).map(r => ({ date: r.Date, avg: Number(r["Daily Average Rating"]) || null })),
    } : { note: "No rating reports in the bucket yet." };
  } catch (err) {
    out.ratings = { error: err.message };
  }

  return out;
}
