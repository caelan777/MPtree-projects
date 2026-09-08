/* Cusdis: comments left on the website.
 *
 * Endpoints taken from Cusdis's own source (pages/api/open/project/...), not
 * guessed:
 *
 *   GET /api/open/project/{projectId}/comments/count?pageIds=a,b
 *       No authentication, CORS open. Returns a count per page slug.
 *   GET /api/open/project/{projectId}/comments/latest?token={projectToken}
 *       Needs the project token, and returns the comment text.
 *
 * So the count works with no setup at all, and only the text of the newest
 * comments needs a token in secrets.env.
 *
 * One thing the count does NOT include: comments awaiting moderation. Cusdis
 * counts approved comments only, so a burst of new ones shows up here as zero
 * until they are approved. The dashboard says so rather than implying silence.
 */
const HOST = "https://cusdis.com";

// From the widget on the homepage: data-app-id and data-page-id.
const PROJECT = "995c76ed-d8cf-4029-85e5-b54c6e34e09e";
const PAGES   = ["mptree-home"];

export async function cusdis(env) {
  const url = `${HOST}/api/open/project/${PROJECT}/comments/count?pageIds=${PAGES.join(",")}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return { ok: false, reason: `Cusdis count answered ${res.status}` };

  const { data } = await res.json();
  const byPage = data ?? {};
  const approved = Object.values(byPage).reduce((n, c) => n + Number(c || 0), 0);

  const out = {
    ok: true,
    approved,
    byPage,
    thread: "https://mp-tree.net/#community",
    latest: null,
    latestNote: null,
  };

  const token = env.CUSDIS_PROJECT_TOKEN;
  if (!token) {
    // Cusdis does not surface the project token anywhere in its settings
    // screen, so there is normally nothing to paste. The count is the part
    // worth having; the text is one tap away on the site itself.
    out.latestNote = "Open the thread to read the comments themselves.";
    return out;
  }

  const latestRes = await fetch(
    `${HOST}/api/open/project/${PROJECT}/comments/latest?token=${encodeURIComponent(token)}`,
    { headers: { accept: "application/json" } },
  );
  if (!latestRes.ok) {
    out.latestNote = latestRes.status === 403
      ? "CUSDIS_PROJECT_TOKEN was rejected. Check it in your Cusdis project settings."
      : `Cusdis latest answered ${latestRes.status}`;
    return out;
  }

  const body = await latestRes.json();
  const rows = Array.isArray(body) ? body : (body.data ?? []);
  out.latest = rows.slice(0, 5).map(c => ({
    by:      c.by_nickname ?? c.byNickname ?? "anonymous",
    content: String(c.content ?? "").slice(0, 400),
    at:      c.createdAt ?? c.created_at ?? null,
  }));
  return out;
}
