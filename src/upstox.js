// A user's own Upstox connection. Everything runs in their browser, and only read-only requests are possible.
import { read, write, remove, readJson, inTurn, redirectUri, stripLoginParams, sessionExpired, parseSymbol, isoDay, IST_MS } from "./brokerUtil";

const BASE = "https://api.upstox.com";
const READ_ONLY = [/^\/v2\/user\/profile$/, /^\/v2\/market-quote\/quotes$/, /^\/v2\/instruments\/search$/, /^\/v3\/historical-candle\//];
const CREDS = "pr_upstox_creds", SESSION = "pr_upstox_session", KEYS = "pr_upstox_keys";

const session = () => readJson(SESSION);
const creds = () => readJson(CREDS);
// Upstox tokens end at 3:30 AM IST.
const validUntil = () => {
  const ist = new Date(Date.now() + IST_MS);
  let end = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 30) - IST_MS;
  if (end <= Date.now()) end += 86400000;
  return end;
};
export const hasSession = () => { const s = session(); return !!s && s.until > Date.now(); };
export const hasCredentials = () => !!creds();
export const clearConnection = () => remove(SESSION);
export function forgetCredentials() { remove(CREDS); remove(SESSION); }
export const saveCredentials = ({ key, secret }) => write(CREDS, JSON.stringify({ key, secret }));
export const loginUrl = () => `${BASE}/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(creds().key)}&redirect_uri=${encodeURIComponent(redirectUri())}&state=upstox`;

// Upstox explains why a login failed; keep its reason so the person knows what to fix.
const LOGIN_HELP = {
  UDAPI100069: "Upstox says your API Key or API Secret is wrong. Open your app on Upstox, copy both again, then choose \"Use a different key\".",
};
function loginError(json) {
  const e = (json?.errors || [])[0] || {};
  const code = e.errorCode || e.error_code || "";
  const err = new Error(`Upstox login failed${code ? ` (${code})` : ""}: ${e.message || "no reason given"}`);
  err.userMessage = LOGIN_HELP[code] || (e.message ? `Upstox couldn't log you in: ${e.message}` : null);
  return err;
}

export async function finishLogin() {
  const qs = new URLSearchParams(window.location.search);
  const code = qs.get("code");
  if (!code || qs.get("state") !== "upstox") return false;
  stripLoginParams(["code", "state"]);
  const c = creds();
  const res = await fetch(`${BASE}/v2/login/authorization/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ code, client_id: c?.key, client_secret: c?.secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) throw loginError(json);
  write(SESSION, JSON.stringify({ token: json.access_token, until: validUntil() }));
  return true;
}

async function get(path, params) {
  if (!READ_ONLY.some((r) => r.test(path))) throw new Error("This request is not allowed");
  const s = session();
  if (!s) throw new Error("Upstox is not connected");
  const res = await fetch(`${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`, { headers: { Accept: "application/json", Authorization: `Bearer ${s.token}` } });
  if (res.status === 401) { clearConnection(); sessionExpired(); throw new Error("Upstox session ended"); }
  const json = await res.json().catch(() => ({}));
  if (json.status !== "success") throw new Error("Upstox request failed");
  return json.data;
}

export const fetchProfile = () => inTurn("upstox-profile", 300, () => get("/v2/user/profile"));

const FIXED = { "^NSEI": "NSE_INDEX|Nifty 50", "^NSEBANK": "NSE_INDEX|Nifty Bank", "^BSESN": "BSE_INDEX|SENSEX", "^INDIAVIX": "NSE_INDEX|India VIX" };
let keyCache = null;
const keys = () => { if (!keyCache) keyCache = readJson(KEYS) || {}; return keyCache; };
async function keyFor(symbol) {
  if (FIXED[symbol]) return FIXED[symbol];
  if (keys()[symbol]) return keys()[symbol];
  const p = parseSymbol(symbol);
  if (!p) throw new Error("Unknown symbol");
  const rows = await inTurn("upstox-search", 600, () => get("/v2/instruments/search", { query: p.name, exchanges: p.exchange, segments: "EQ", records: "10", page_number: "1" }));
  const hit = (rows || []).find((r) => (r.trading_symbol || "").toUpperCase() === p.name) || (rows || [])[0];
  if (!hit?.instrument_key) throw new Error("Symbol not found");
  keys()[symbol] = hit.instrument_key;
  write(KEYS, JSON.stringify(keys()));
  return hit.instrument_key;
}

export async function fetchQuotes(symbols) {
  const pairs = await Promise.allSettled(symbols.map(async (s) => [s, await keyFor(s)]));
  const known = pairs.filter((p) => p.status === "fulfilled").map((p) => p.value);
  const out = {};
  for (let i = 0; i < known.length; i += 400) {
    const chunk = known.slice(i, i + 400);
    const data = await inTurn("upstox-quote", 1100, () => get("/v2/market-quote/quotes", { instrument_key: chunk.map(([, k]) => k).join(",") }));
    Object.values(data || {}).forEach((q) => {
      const hit = chunk.find(([, k]) => k === q.instrument_token);
      if (hit) out[hit[0]] = { price: q.last_price, prevClose: q.last_price - (q.net_change ?? 0) };
    });
  }
  return out;
}

const UNITS = { "1m": ["minutes", 1], "5m": ["minutes", 5], "15m": ["minutes", 15], "60m": ["hours", 1], "1d": ["days", 1] };
export async function fetchCandles({ symbol, interval, fromMs, toMs }) {
  const key = encodeURIComponent(await keyFor(symbol));
  const [unit, n] = UNITS[interval] || UNITS["5m"];
  const data = await inTurn("upstox-candles", 400, () => get(`/v3/historical-candle/${key}/${unit}/${n}/${isoDay(toMs)}/${isoDay(fromMs)}`));
  const rows = [...(data?.candles || [])];
  if (isoDay(toMs) === isoDay(Date.now()) && unit !== "days") {
    const today = await inTurn("upstox-candles", 400, () => get(`/v3/historical-candle/intraday/${key}/${unit}/${n}`)).catch(() => null);
    rows.push(...(today?.candles || []));
  }
  return rows.map(([t, o, h, l, c]) => ({ t: Math.floor(Date.parse(t) / 1000), o, h, l, c })).sort((a, b) => a.t - b.t);
}

export async function searchStocks(q) {
  const rows = await inTurn("upstox-search", 600, () => get("/v2/instruments/search", { query: q, exchanges: "NSE", segments: "EQ", records: "8", page_number: "1" }));
  return (rows || []).filter((r) => r.trading_symbol).map((r) => {
    const symbol = `${r.trading_symbol}.NS`;
    keys()[symbol] = r.instrument_key;
    return { symbol, name: r.name || r.trading_symbol };
  });
}
