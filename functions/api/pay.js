/**
 * POST /api/pay: the webhook Lemon Squeezy calls after a payment.
 *
 * The app opens the checkout with the account's tag as custom data
 * (?checkout[custom][tag]=...), and Lemon Squeezy hands it back here in
 * meta.custom_data. A paid order writes that tag down; a refund takes it out
 * again. That is all this server knows: a hash and an order number.
 *
 * Needs, in the Cloudflare Pages project (see Website/README.md):
 *   PRO                    KV namespace binding
 *   LEMON_WEBHOOK_SECRET   the signing secret typed into the webhook's settings
 *   LEMON_PRODUCT_ID       optional: only orders of this product count
 *   LEMON_ALLOW_TEST       optional: "1" lets test-mode payments count too
 */
const TAG = /^[0-9a-f]{64}$/;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

/** Compared without stopping at the first difference. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signed(body, signature, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return same(hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))), signature.toLowerCase());
}

export async function onRequestPost({ request, env }) {
  if (!env.PRO || !env.LEMON_WEBHOOK_SECRET) return new Response("not set up", { status: 503 });

  // The signature is over the body exactly as sent, so it is read as text.
  const body = await request.text();
  if (!(await signed(body, request.headers.get("X-Signature") || "", env.LEMON_WEBHOOK_SECRET))) {
    return new Response("bad signature", { status: 401 });
  }

  let event;
  try { event = JSON.parse(body); } catch { return new Response("bad body", { status: 400 }); }
  // A payment made in Lemon Squeezy's test mode costs nothing: a test card
  // pays for it. It is signed like a real one, so without this a test checkout
  // would hand out real Pro. Answered 200 so it is not sent again.
  if (event?.meta?.test_mode && env.LEMON_ALLOW_TEST !== "1") return new Response("ok");
  const name = event?.meta?.event_name;
  const order = String(event?.data?.id ?? "");
  const attrs = event?.data?.attributes ?? {};
  if (!order) return new Response("ok");

  if (env.LEMON_PRODUCT_ID && String(attrs.first_order_item?.product_id ?? "") !== String(env.LEMON_PRODUCT_ID)) {
    return new Response("ok");
  }

  if (name === "order_created" && attrs.status === "paid") {
    const tag = String(event.meta.custom_data?.tag ?? "");
    // Paid without a tag (the checkout opened from somewhere else than the
    // app): nothing to hang it on. Answered 200 so it is not sent again.
    if (!TAG.test(tag)) return new Response("ok");
    await env.PRO.put("tag:" + tag, JSON.stringify({ order, at: Date.now() }));
    // So a refund, which may not carry the tag, finds its way back.
    await env.PRO.put("order:" + order, tag);
  } else if (name === "order_refunded") {
    const tag = await env.PRO.get("order:" + order);
    if (tag) {
      await env.PRO.delete("tag:" + tag);
      await env.PRO.delete("order:" + order);
    }
  }
  return new Response("ok");
}
