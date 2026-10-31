// Razorpay → Supabase webhook: when a Pro payment link is paid, mark that user's
// subscription active for 30 days (extending any time they still have left).
//
// Razorpay Dashboard → Settings → Webhooks → Add:
//   URL:    https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
//   Events: payment_link.paid
//   Secret: any long random string → also save it as the RAZORPAY_WEBHOOK_SECRET secret.
// Deploy with JWT verification off (Razorpay can't send a Supabase token):
//   supabase functions deploy razorpay-webhook --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const encoder = new TextEncoder();

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PERIOD_DAYS = Number(Deno.env.get("PRO_PERIOD_DAYS") ?? 30);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return new Response("Webhook secret not configured", { status: 503 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!safeEqual(await hmacHex(secret, raw), signature)) return new Response("Bad signature", { status: 401 });

  const event = JSON.parse(raw);
  if (event.event !== "payment_link.paid") return new Response("ignored", { status: 200 });

  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  const userId: string | undefined = link?.notes?.user_id ?? payment?.notes?.user_id;
  const paymentId: string | undefined = payment?.id ?? link?.id;
  if (!userId || !paymentId) {
    console.error("payment without user_id", { linkId: link?.id, paymentId });
    return new Response("no user", { status: 200 }); // don't make Razorpay retry forever
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Idempotency: Razorpay may deliver the same event more than once.
  const { error: payErr } = await admin.from("payments").insert({
    payment_id: paymentId, user_id: userId, amount_paise: payment?.amount ?? link?.amount_paid ?? 0,
  });
  if (payErr) {
    if (payErr.code === "23505") return new Response("already processed", { status: 200 });
    console.error("payments insert failed", payErr);
    return new Response("db error", { status: 500 });
  }

  const { data: existing } = await admin.from("subscriptions").select("current_period_end").eq("user_id", userId).maybeSingle();
  const now = Date.now();
  const currentEnd = existing?.current_period_end ? new Date(existing.current_period_end).getTime() : 0;
  const newEnd = new Date(Math.max(now, currentEnd) + PERIOD_DAYS * 24 * 3600 * 1000).toISOString();

  const { error: subErr } = await admin.from("subscriptions").upsert(
    { user_id: userId, status: "active", current_period_end: newEnd },
    { onConflict: "user_id" },
  );
  if (subErr) {
    console.error("subscription upsert failed", subErr);
    return new Response("db error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
