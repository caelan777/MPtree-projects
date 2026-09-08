/* Cloudflare: how many people reach the site, and did the last deploy work.
 *
 * Deliberately server side. Cloudflare already counts the requests it serves
 * at its edge, so these numbers cost the site nothing: no script on any page,
 * no cookie, no third party request from a visitor's browser. Cloudflare's own
 * Web Analytics product would give per page paths and referrers, but only by
 * loading a beacon from a tracking host on every visit, which is exactly what
 * the privacy page promises does not happen. Counts are enough.
 *
 * Needs CLOUDFLARE_API_TOKEN in secrets.env, with three read permissions:
 *   Zone    > Zone            > Read   (to find the zone by name)
 *   Zone    > Analytics       > Read   (the numbers themselves)
 *   Account > Cloudflare Pages > Read   (deploy history)
 *
 * Zone and account ids are discovered from the domain name, so the token is
 * normally the only thing to paste. Both can be overridden in secrets.env if
 * discovery ever gets in the way.
 */
const API     = "https://api.cloudflare.com/client/v4";
const GRAPHQL = `${API}/graphql`;
const DOMAIN  = "mp-tree.net";

const iso = d => d.toISOString().slice(0, 10);

async function cf(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map(e => e.message).join("; ") || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body.result;
}

const QUERY = `
query Traffic($zone: String!, $from: Date!, $to: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(
        limit: 60
        filter: { date_geq: $from, date_leq: $to }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum {
          requests
          pageViews
          bytes
          countryMap { clientCountryName requests }
        }
        uniq { uniques }
      }
    }
  }
}`;

export async function cloudflare(env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return { ok: false, reason: "No CLOUDFLARE_API_TOKEN in Dashboard/secrets.env. See the README." };
  }

  const out = { ok: true, traffic: null, pages: null, notes: [] };

  // ── Zone traffic ───────────────────────────────────────────────────────
  try {
    const zoneId = env.CLOUDFLARE_ZONE_ID
      ?? (await cf(token, `/zones?name=${DOMAIN}`))[0]?.id;
    if (!zoneId) throw new Error(`No Cloudflare zone found for ${DOMAIN}`);

    const to   = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);

    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { zone: zoneId, from: iso(from), to: iso(to) },
      }),
    });
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors.map(e => e.message).join("; "));

    const days = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];

    // Roll the per country rows of every day into one table.
    const countries = new Map();
    for (const d of days) {
      for (const c of d.sum.countryMap ?? []) {
        countries.set(c.clientCountryName,
          (countries.get(c.clientCountryName) ?? 0) + c.requests);
      }
    }

    const window = n => days.slice(-n);
    const sum = (rows, pick) => rows.reduce((t, d) => t + pick(d), 0);

    out.traffic = {
      days: days.map(d => ({
        date:      d.dimensions.date,
        requests:  d.sum.requests,
        pageViews: d.sum.pageViews,
        uniques:   d.uniq.uniques,
      })),
      last7: {
        requests:  sum(window(7), d => d.sum.requests),
        pageViews: sum(window(7), d => d.sum.pageViews),
        uniques:   sum(window(7), d => d.uniq.uniques),
      },
      last30: {
        requests:  sum(days, d => d.sum.requests),
        pageViews: sum(days, d => d.sum.pageViews),
        uniques:   sum(days, d => d.uniq.uniques),
      },
      topCountries: [...countries.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([country, requests]) => ({ country, requests })),
    };
    // Uniques are a daily figure. Adding seven of them counts a person who
    // came back on Tuesday twice, so it is a visit count, not a people count.
    out.notes.push("Unique visitors are summed per day, so a returning visitor counts once per day.");
  } catch (err) {
    out.traffic = { error: String(err.message ?? err) };
  }

  // ── Pages deployments ──────────────────────────────────────────────────
  try {
    const accountId = env.CLOUDFLARE_ACCOUNT_ID
      ?? (await cf(token, "/accounts"))[0]?.id;
    if (!accountId) throw new Error("No Cloudflare account visible to this token");

    const projects = await cf(token, `/accounts/${accountId}/pages/projects`);
    const project  = env.CLOUDFLARE_PAGES_PROJECT
      ? projects.find(p => p.name === env.CLOUDFLARE_PAGES_PROJECT)
      : projects.find(p => (p.domains ?? []).some(d => d.includes(DOMAIN))) ?? projects[0];
    if (!project) throw new Error("No Cloudflare Pages project found");

    const deploys = await cf(
      token,
      `/accounts/${accountId}/pages/projects/${project.name}/deployments?per_page=5`,
    );

    out.pages = {
      project: project.name,
      domains: project.domains ?? [],
      deployments: deploys.map(d => ({
        id:      d.short_id ?? d.id?.slice(0, 8),
        created: d.created_on,
        stage:   d.latest_stage?.name ?? null,
        status:  d.latest_stage?.status ?? null,
        branch:  d.deployment_trigger?.metadata?.branch ?? null,
        commit:  d.deployment_trigger?.metadata?.commit_hash?.slice(0, 7) ?? null,
        message: d.deployment_trigger?.metadata?.commit_message?.split("\n")[0] ?? null,
      })),
    };
  } catch (err) {
    out.pages = { error: String(err.message ?? err) };
  }

  return out;
}
