/**
 * GET /api/pro?tag=<account tag>  ->  { "owned": true | false }
 *
 * The Windows app asks this after someone paid in the web checkout, and again
 * when it is opened. The tag is the hash MPTree already makes of an account
 * (accountTag in the app's src/pro.ts): 64 hex characters, never the email.
 *
 * What is kept is written by pay.js, in the KV namespace bound as PRO:
 *   tag:<tag>  ->  { order, at }
 * and nothing else. See Website/README.md for the one-time setup.
 */
const TAG = /^[0-9a-f]{64}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // The app's window is another origin.
      "Access-Control-Allow-Origin": "*",
      // A purchase has to show the moment it is made.
      "Cache-Control": "no-store",
    },
  });

export async function onRequestGet({ request, env }) {
  if (!env.PRO) return json({ error: "not set up" }, 503);
  const tag = new URL(request.url).searchParams.get("tag") || "";
  if (!TAG.test(tag)) return json({ error: "bad tag" }, 400);
  return json({ owned: (await env.PRO.get("tag:" + tag)) !== null });
}
