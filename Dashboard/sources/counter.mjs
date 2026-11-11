/* The app's anonymous counter: /a/<platform>/<event> on mp-tree.net.
 *
 * The app opens an empty address at a few moments (src/counter.ts) and
 * Cloudflare counts the requests per path, day and country. Nothing else is
 * kept anywhere, so these counts are the whole of it. Read with the same
 * read-only token as the Cloudflare source.
 *
 * Cloudflare keeps per path counts for a few days only on this plan, so the
 * window is tried long first and shortened until Cloudflare accepts it.
 * "open", "tab-*" and "discover" go out once a day per phone, so a day's
 * "open" is the number of phones that opened MPTree that day.
 */
const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

const QUERY = `query($zone:String!,$from:Time!,$to:Time!){viewer{zones(filter:{zoneTag:$zone}){
  httpRequestsAdaptiveGroups(limit:5000,
    filter:{datetime_geq:$from,datetime_lt:$to,clientRequestPath_like:"/a/%"},
    orderBy:[date_ASC]){count dimensions{clientRequestPath date clientCountryName}}}}}`;

export async function counter(env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  const zone  = env.CLOUDFLARE_ZONE_ID;
  if (!token || !zone) return { ok: false, reason: "Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID." };

  let rows = null, span = 0, lastErr = "";
  for (const days of [30, 14, 8, 7, 3, 1]) {
    const to = new Date(), from = new Date(to - days * 86400000);
    const res = await fetch(GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { zone, from: from.toISOString(), to: to.toISOString() } }),
    });
    const body = await res.json();
    if (body.errors?.length) { lastErr = body.errors.map(e => e.message).join("; "); continue; }
    rows = body.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
    span = days;
    break;
  }
  if (!rows) return { ok: false, reason: lastErr || "Cloudflare gave no counter rows." };

  // days[date][platform][event] = n ; countries[platform][country] = opens
  const days = {}, countries = {};
  for (const r of rows) {
    const m = /^\/a\/([^/]+)\/([^/?]+)/.exec(r.dimensions.clientRequestPath);
    if (!m) continue;
    const [, platform, event] = m;
    const d = r.dimensions.date;
    days[d] ??= {};
    days[d][platform] ??= {};
    days[d][platform][event] = (days[d][platform][event] ?? 0) + r.count;
    if (event === "open") {
      countries[platform] ??= {};
      const c = r.dimensions.clientCountryName || "?";
      countries[platform][c] = (countries[platform][c] ?? 0) + r.count;
    }
  }
  return {
    ok: true,
    span,
    days: Object.keys(days).sort().map(date => ({ date, ...days[date] })),
    countries,
  };
}
