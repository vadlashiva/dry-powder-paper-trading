# Switching on the growth features

Most of the new features work as soon as this is deployed: installable app, notifications,
share cards, trade journal, achievements, the guided tour, the demo video, pricing, the new
guides and faster loading.

Five need a one-time setup in Supabase (and one in Razorpay). Until you do it, the app simply
hides or falls back for these — nothing breaks:

| Feature | Needs | Until then |
|---|---|---|
| Weekly leaderboard | SQL (step 1) | Tab says "opens soon" |
| Referral bonus days | SQL (step 1) | Invite link works, no bonus days |
| "N traders this week" on landing | SQL (step 1) | Hidden (also hidden below 25 traders) |
| Analytics + error reports | SQL (step 1) | Nothing recorded |
| Instant Pro activation | SQL + Edge Functions + Razorpay webhook (steps 1–3) | Old static payment link + manual activation |

---

## 1. Create the tables (2 minutes)

1. Open Supabase → your project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/20261031000000_growth_features.sql`.
3. Click **Run**. It is safe to run again.

This creates `leaderboard`, `referrals`, `payments`, `app_events`, `client_errors`, two small
helper functions, and the row-level security rules that keep each user's data private.

## 2. Deploy the two Edge Functions (instant Pro activation)

> Your project already has an older `razorpay-webhook` function (from the subscription setup). The new one is deliberately named `razorpay-payment-webhook` so the two never clash.

Needs the Supabase CLI (`npm i -g supabase`) on your computer, inside this repo:

```bash
supabase login
supabase link --project-ref <your-project-ref>      # from Project Settings → General
supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_PAYMENT_WEBHOOK_SECRET=<long-random-string>
supabase functions deploy create-payment-link --no-verify-jwt   # it checks the login itself
supabase functions deploy razorpay-payment-webhook --no-verify-jwt
```

While you use **test keys** (`rzp_test_…`), payment links are only created for the accounts listed in the `TEST_PAYMENT_USER_IDS` secret (comma-separated user ids) — otherwise anyone could get Pro with a fake test payment. Everyone else gets the normal static link.

Optional secrets: `PRO_PRICE_PAISE` (default `9900` = ₹99) and `APP_URL` (default `https://paperrally.in`).

> **Razorpay account status.** Creating payment links through the API needs your Razorpay
> account to be activated for live payments. Until it is, the app automatically falls back
> to your existing static payment link (`https://rzp.io/rzp/PPCNezNF`) and you activate Pro
> manually as before.

## 3. Add the Razorpay webhook

Razorpay Dashboard → **Settings → Webhooks → + Add New Webhook**

- **Webhook URL:** `https://<your-project-ref>.supabase.co/functions/v1/razorpay-payment-webhook`
- **Secret:** the same `RAZORPAY_PAYMENT_WEBHOOK_SECRET` you set above
- **Active events:** `payment_link.paid`

When someone pays, the webhook marks their subscription `active` for 30 days (extending any time
left), and the app picks it up within seconds. Duplicate deliveries are ignored.

## 4. (Optional) Hosted analytics dashboard

The app already records key events in your own `app_events` table. If you'd also like a ready-made
dashboard, create a free [Umami](https://umami.is) site and add this in Vercel →
Project → Settings → Environment Variables, then redeploy:

```
REACT_APP_UMAMI_WEBSITE_ID=<your-website-id>
```

---

## Useful queries (SQL Editor)

**Sign-up funnel, last 30 days**
```sql
select name, count(*) as events, count(distinct coalesce(user_id::text, session_id)) as people
from app_events
where created_at > now() - interval '30 days'
  and name in ('landing_view','signup_start','signup_complete','trade','upgrade_click','payment_link_opened')
group by name order by people desc;
```

**Day-2 retention (signed up, came back the next day)**
```sql
with signups as (
  select user_id, min(created_at)::date as d0 from app_events where name = 'signup_complete' group by user_id
)
select count(*) as signups,
       count(*) filter (where exists (
         select 1 from app_events e where e.user_id = s.user_id and e.name = 'app_open' and e.created_at::date = s.d0 + 1
       )) as came_back_day_2
from signups s;
```

**Latest errors**
```sql
select created_at, message, url, left(user_agent, 60) as browser
from client_errors order by created_at desc limit 50;
```

**This week's leaderboard**
```sql
select display_name, return_pct, trades from leaderboard
where week = to_char(now() at time zone 'Asia/Kolkata', 'IYYY-"W"IW')
order by return_pct desc limit 20;
```

## Events recorded

`landing_view`, `signup_start`, `login_start`, `signup_complete`, `app_open`, `trade`,
`trade_tagged`, `upgrade_click`, `payment_link_opened`, `leaderboard_join`, `share_card`,
`invite_copied`, `invite_whatsapp`, `referral_recorded`, `achievement`, `demo_play`,
`install_prompt`, `tour_complete`, `tour_skipped`. No names, emails or phone numbers are sent —
only the event name, a few non-personal properties, and the signed-in user's id (if any).
