// Supabase Edge Function: yahoo-proxy
// Proxies Yahoo Finance chart/search requests server-side so the browser
// never talks to query1.finance.yahoo.com directly (avoids CORS blocks).
//
// type=chart supports two modes:
//   - interval + range (e.g. interval=5m&range=1d)            -> normal live/recent data
//   - interval + period1 + period2 (unix seconds)              -> a specific historical date range (Replay Mode)
// type=search  -> symbol search / news
// type=multi   -> several charts in ONE request:
//   symbols=RELIANCE.NS,TCS.NS,...&interval=5m&range=1d
//   returns { results: { "RELIANCE.NS": <chart json>, ... } } (a failed symbol maps to { error })
//
// Speed-ups: answers are cached in memory for a few seconds (live) or minutes
// (history/search), and identical requests arriving together share one upstream
// call, so 50 users opening the app at 9:15 cost Yahoo one request per symbol.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const LIVE_TTL = 5_000;
const HISTORY_TTL = 10 * 60_000;
const SEARCH_TTL = 60_000;
const MAX_MULTI = 30;

type Entry = { at: number; ttl: number; status: number; body: string; pending?: Promise<Entry> };
const cache = new Map<string, Entry>();

function prune() {
  if (cache.size < 500) return;
  const now = Date.now();
  for (const [k, v] of cache) if (!v.pending && now - v.at > v.ttl) cache.delete(k);
  if (cache.size > 800) cache.clear();
}

async function getCached(target: string, ttl: number): Promise<Entry> {
  const now = Date.now();
  const hit = cache.get(target);
  if (hit?.pending) return hit.pending;
  if (hit && now - hit.at < hit.ttl) return hit;
  const pending = (async () => {
    const upstream = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TradeFreeBot/1.0)" } });
    const body = await upstream.text();
    const entry: Entry = { at: Date.now(), ttl: upstream.ok ? ttl : 0, status: upstream.status, body };
    if (upstream.ok) cache.set(target, entry); else cache.delete(target);
    return entry;
  })();
  cache.set(target, { at: now, ttl, status: 0, body: "", pending });
  pending.catch(() => cache.delete(target));
  prune();
  return pending;
}

const SYMBOL_RE = /^[A-Za-z0-9^.\-=&]{1,32}$/;
const INTERVAL_RE = /^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo|3mo)$/;
const RANGE_RE = /^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$/;

function chartTarget(symbol: string, interval: string, range: string | null, period1: string | null, period2: string | null) {
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}`;
  if (period1 && period2) {
    const past = Number(period2) * 1000 < Date.now() - 60 * 60_000;
    return { target: `${base}&period1=${period1}&period2=${period2}`, ttl: past ? HISTORY_TTL : LIVE_TTL };
  }
  const r = range ?? "1d";
  return { target: `${base}&range=${r}`, ttl: r === "1d" || r === "5d" ? LIVE_TTL : HISTORY_TTL };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // "chart" | "search" | "multi"
    const interval = url.searchParams.get("interval") ?? "5m";
    const range = url.searchParams.get("range");
    const period1 = url.searchParams.get("period1");
    const period2 = url.searchParams.get("period2");

    if ((type === "chart" || type === "multi") && !INTERVAL_RE.test(interval)) return json({ error: "invalid interval" }, 400);
    if (range && !RANGE_RE.test(range)) return json({ error: "invalid range" }, 400);
    if ((period1 && !/^\d{1,11}$/.test(period1)) || (period2 && !/^\d{1,11}$/.test(period2))) return json({ error: "invalid period" }, 400);

    if (type === "chart") {
      const symbol = url.searchParams.get("symbol") ?? "";
      if (!SYMBOL_RE.test(symbol)) return json({ error: "invalid symbol" }, 400);
      const { target, ttl } = chartTarget(symbol, interval, range, period1, period2);
      const e = await getCached(target, ttl);
      return json(e.body, e.status);
    }

    if (type === "multi") {
      const symbols = [...new Set((url.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
      if (!symbols.length || symbols.length > MAX_MULTI || !symbols.every((s) => SYMBOL_RE.test(s))) return json({ error: "invalid symbols" }, 400);
      const entries = await Promise.allSettled(symbols.map((s) => {
        const { target, ttl } = chartTarget(s, interval, range, period1, period2);
        return getCached(target, ttl);
      }));
      const results: Record<string, unknown> = {};
      entries.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value.status >= 200 && r.value.status < 300) {
          try { results[symbols[i]] = JSON.parse(r.value.body); } catch { results[symbols[i]] = { error: "bad upstream json" }; }
        } else {
          results[symbols[i]] = { error: r.status === "fulfilled" ? `upstream ${r.value.status}` : "fetch failed" };
        }
      });
      return json({ results });
    }

    if (type === "search") {
      const q = (url.searchParams.get("q") ?? "").slice(0, 80);
      const quotesCount = String(Math.min(20, Number(url.searchParams.get("quotesCount") ?? "8") || 0));
      const newsCount = String(Math.min(20, Number(url.searchParams.get("newsCount") ?? "0") || 0));
      const target = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${quotesCount}&newsCount=${newsCount}`;
      const e = await getCached(target, SEARCH_TTL);
      return json(e.body, e.status);
    }

    return json({ error: "invalid type" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
