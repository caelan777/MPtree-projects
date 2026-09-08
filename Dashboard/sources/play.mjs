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
      reason: "No Play service account key. Follow step 3 in Dashboard/README.md, " +
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

  try {
    const prefix = `stats/installs/installs_${PACKAGE}_`;
    const list = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`,
      { headers: auth },
    ).then(r => r.json());

    const overviews = (list.items ?? [])
      .filter(o => o.name.endsWith("_overview.csv"))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!overviews.length) {
      out.installs = { note: "No install reports in the bucket yet. Google writes them once the app has data." };
      return out;
    }

    const newest = overviews[overviews.length - 1];
    const csv = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(newest.name)}?alt=media`,
      { headers: { authorization: `Bearer ${token}` } },
    ).then(r => r.arrayBuffer());

    const rows = parseCsv(decodeCsv(csv));
    const last = rows[rows.length - 1] ?? {};
    const num  = k => Number(last[k] ?? 0) || 0;

    out.installs = {
      report:        newest.name.split("/").pop(),
      through:       last.Date ?? null,
      totalUsers:    num("Total User Installs"),
      activeDevices: num("Active Device Installs"),
      dailyInstalls: num("Daily User Installs"),
      dailyUninstalls: num("Daily User Uninstalls"),
      days: rows.slice(-30).map(r => ({
        date:      r.Date,
        installs:  Number(r["Daily User Installs"] ?? 0) || 0,
        uninstalls: Number(r["Daily User Uninstalls"] ?? 0) || 0,
        active:    Number(r["Active Device Installs"] ?? 0) || 0,
      })),
    };
  } catch (err) {
    out.installs = { error: err.message };
  }

  return out;
}
