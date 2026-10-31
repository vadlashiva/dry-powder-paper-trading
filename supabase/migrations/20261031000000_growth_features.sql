-- PaperRally growth features: weekly leaderboard, referrals, payment log,
-- privacy-friendly analytics and client error reports.
-- Run once in Supabase → SQL Editor (safe to re-run).

-- ---------------------------------------------------------------------------
-- Weekly challenge leaderboard (opt-in: a row exists only after "Join")
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard (
  user_id      uuid not null references auth.users (id) on delete cascade,
  week         text not null check (week ~ '^\d{4}-W\d{2}$'),        -- e.g. 2026-W44 (IST)
  display_name text not null check (char_length(display_name) between 2 and 20),
  return_pct   numeric(9, 3) not null default 0 check (return_pct between -100 and 100000),
  trades       integer not null default 0 check (trades >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, week)
);
create index if not exists leaderboard_week_return_idx on public.leaderboard (week, return_pct desc);
alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard: signed-in users can read" on public.leaderboard;
create policy "leaderboard: signed-in users can read" on public.leaderboard
  for select to authenticated using (true);
drop policy if exists "leaderboard: insert own row" on public.leaderboard;
create policy "leaderboard: insert own row" on public.leaderboard
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "leaderboard: update own row" on public.leaderboard;
create policy "leaderboard: update own row" on public.leaderboard
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "leaderboard: delete own row" on public.leaderboard;
create policy "leaderboard: delete own row" on public.leaderboard
  for delete to authenticated using (auth.uid() = user_id);

-- Landing page "N traders practised this week" (count only, no personal data).
create or replace function public.active_traders_this_week()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.portfolios where updated_at > now() - interval '7 days';
$$;
revoke all on function public.active_traders_this_week() from public;
grant execute on function public.active_traders_this_week() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Referrals: invited friend + inviter each get 7 extra free days (app-side)
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  referred_id uuid primary key references auth.users (id) on delete cascade,  -- one referrer per account
  referrer_id uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (referred_id <> referrer_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;

-- Only brand-new accounts (under 2 days old) can record who invited them.
create or replace function public.account_is_new(uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where id = uid and created_at > now() - interval '2 days');
$$;
revoke all on function public.account_is_new(uuid) from public;
grant execute on function public.account_is_new(uuid) to authenticated;

drop policy if exists "referrals: new account records its inviter" on public.referrals;
create policy "referrals: new account records its inviter" on public.referrals
  for insert to authenticated with check (auth.uid() = referred_id and public.account_is_new(auth.uid()));
drop policy if exists "referrals: see your own" on public.referrals;
create policy "referrals: see your own" on public.referrals
  for select to authenticated using (auth.uid() = referred_id or auth.uid() = referrer_id);

-- ---------------------------------------------------------------------------
-- Payments recorded by the razorpay-payment-webhook Edge Function (service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  payment_id   text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  amount_paise integer not null,
  created_at   timestamptz not null default now()
);
alter table public.payments enable row level security;
drop policy if exists "payments: see your own" on public.payments;
create policy "payments: see your own" on public.payments
  for select to authenticated using (auth.uid() = user_id);
-- (no insert/update policies: only the Edge Function, using the service role, writes here)

-- The webhook upserts subscriptions by user_id, so user_id must be unique.
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and tablename = 'subscriptions'
      and indexdef ilike '%unique%(user_id)%'
  ) then
    create unique index subscriptions_user_id_key on public.subscriptions (user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Analytics events (write-only from the app; read in the dashboard)
-- ---------------------------------------------------------------------------
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid(),
  session_id text check (char_length(session_id) <= 64),
  name       text not null check (char_length(name) between 1 and 64),
  props      jsonb not null default '{}'::jsonb check (pg_column_size(props) < 2000),
  path       text check (char_length(path) <= 200)
);
create index if not exists app_events_name_time_idx on public.app_events (name, created_at desc);
alter table public.app_events enable row level security;
drop policy if exists "app_events: anyone can insert" on public.app_events;
create policy "app_events: anyone can insert" on public.app_events
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Client error reports (write-only from the app)
-- ---------------------------------------------------------------------------
create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid(),
  message    text not null check (char_length(message) <= 1000),
  stack      text check (char_length(stack) <= 4000),
  url        text check (char_length(url) <= 300),
  user_agent text check (char_length(user_agent) <= 300)
);
alter table public.client_errors enable row level security;
drop policy if exists "client_errors: anyone can insert" on public.client_errors;
create policy "client_errors: anyone can insert" on public.client_errors
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
