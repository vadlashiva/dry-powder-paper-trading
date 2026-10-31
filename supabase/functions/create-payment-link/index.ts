// Creates a one-time Razorpay Payment Link for the signed-in user, tagged with
// their user id, so the razorpay-payment-webhook function can switch Pro on automatically.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// Optional: PRO_PRICE_PAISE (default 9900 = ₹99), APP_URL (default https://paperrally.in)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return json({ error: "Payments are not configured yet" }, 503);

  // Who is paying? Verified here from their Supabase session token (works with both the
  // legacy and the new publishable/secret API keys, so gateway JWT checks can stay off).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please log in again" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: "Please log in again" }, 401);

  const amount = Number(Deno.env.get("PRO_PRICE_PAISE") ?? 9900);
  const appUrl = Deno.env.get("APP_URL") ?? "https://paperrally.in";
  const username = (user.user_metadata?.username as string | undefined) ?? "";

  const body = {
    amount,
    currency: "INR",
    accept_partial: false,
    description: "PaperRally Pro – 1 month",
    reference_id: `pr_${user.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`.slice(0, 40),
    expire_by: Math.floor(Date.now() / 1000) + 2 * 24 * 3600,
    notes: { user_id: user.id, username, product: "pro_monthly" },
    reminder_enable: false,
    callback_url: `${appUrl}/?paid=1`,
    callback_method: "get",
    // Only Google sign-ins have a real, verified email. Username accounts are stored as
    // "<username>@gmail.com", which may belong to someone else, so never prefill those.
    ...(user.app_metadata?.provider === "google" && user.email ? { customer: { email: user.email } } : {}),
  };

  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.short_url) {
    console.error("razorpay payment link failed", res.status, data);
    return json({ error: "Could not start the payment. Please try again." }, 502);
  }
  return json({ short_url: data.short_url, id: data.id });
});
