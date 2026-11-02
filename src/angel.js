// Each user's own Angel One SmartAPI connection. Everything here runs in the user's browser:
// keys and tokens stay on their device, and prices go straight from Angel One to them.
// PaperRally never places real orders: only the read-only paths below can ever be called.
const BASE = "https://apiconnect.angelone.in/rest/secure/angelbroking";
const READ_ONLY_PATHS = new Set([
  "/user/v1/getProfile",
  "/market/v1/quote/",
  "/historical/v1/getCandleData",
  "/order/v1/searchScrip", // looks up stock codes only
]);
const KEY_STORE = "pr_angel_key";
const SESSION_STORE = "pr_angel_session";
const TOKEN_STORE = "pr_angel_tokens";
const IST_MS = 19800000;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const remove = (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } };
const istDay = (ms = Date.now()) => new Date(ms + IST_MS).toISOString().slice(0, 10);

export const getApiKey = () => read(KEY_STORE) || "";
export const setApiKey = (key) => write(KEY_STORE, key.trim());
export function clearConnection() { remove(SESSION_STORE); }
export function forgetKey() { remove(KEY_STORE); remove(SESSION_STORE); }

// SmartAPI sessions end at midnight.
export function getSession() {
  try {
    const s = JSON.parse(read(SESSION_STORE) || "null");
    return s && s.day === istDay() && s.jwt ? s : null;
  } catch { return null; }
}

export const loginUrl = (key) =>
  `https://smartapi.angelone.in/publisher-login?api_key=${encodeURIComponent(key)}&redirect_url=${encodeURIComponent(`${window.location.origin}/`)}&state=paperrally`;

// Angel One returns to the app with tokens in the address. Save them and remove them from the address at once.
export function consumeLoginRedirect() {
  const qs = new URLSearchParams(window.location.search);
  const jwt = qs.get("auth_token");
  if (!jwt) return false;
  write(SESSION_STORE, JSON.stringify({ jwt: jwt.replace(/^Bearer\s+/i, ""), feed: qs.get("feed_token") || "", day: istDay() }));
  ["auth_token", "feed_token", "refresh_token", "state"].forEach((k) => qs.delete(k));
  const rest = qs.toString();
  window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  return true;
}

// Requests run one at a time per type, spaced to stay inside Angel One's rate limits.
const queues = {};
function inTurn(group, gapMs, job) {
  const run = (queues[group] || Promise.resolve()).then(job, job);
  queues[group] = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs)));
  return run;
}

async function call(path, body, method = "POST") {
  if (!READ_ONLY_PATHS.has(path)) throw new Error("This request is not allowed");
  const session = getSession();
  if (!session) throw new Error("Angel One is not connected");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json", Accept: "application/json",
      "X-UserType": "USER", "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1", "X-ClientPublicIP": "127.0.0.1", "X-MACAddress": "00:00:00:00:00:00",
      "X-PrivateKey": getApiKey(), Authorization: `Bearer ${session.jwt}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (json.errorCode === "AG8001" || json.errorcode === "AG8001" || json.errorCode === "AG8002" || json.errorcode === "AG8002") {
    clearConnection();
    window.dispatchEvent(new Event("pr-angel-expired"));
    throw new Error("Angel One session ended");
  }
  if (!(json.status || json.success)) throw new Error(json.message || "Angel One request failed");
  return json.data;
}

export const fetchProfile = () => inTurn("profile", 400, () => call("/user/v1/getProfile", null, "GET"));

/* ---- stock codes ---- */
// Index codes never change. Other codes are looked up once and remembered on this device.
const FIXED = {
  "^NSEI": ["NSE", "99926000"], "^NSEBANK": ["NSE", "99926009"],
  "^BSESN": ["BSE", "99919000"], "^INDIAVIX": ["NSE", "99926017"],
};
let tokenCache = null;
const tokens = () => {
  if (!tokenCache) { try { tokenCache = JSON.parse(read(TOKEN_STORE) || "{}"); } catch { tokenCache = {}; } }
  return tokenCache;
};
const parseSymbol = (symbol) => {
  const m = symbol.match(/^(.+)\.(NS|BO)$/);
  return m ? { name: m[1], exchange: m[2] === "NS" ? "NSE" : "BSE" } : null;
};
const lookups = {};
export async function tokenFor(symbol) {
  if (FIXED[symbol]) return FIXED[symbol];
  if (tokens()[symbol]) return tokens()[symbol];
  const p = parseSymbol(symbol);
  if (!p) throw new Error("Unknown symbol");
  lookups[symbol] = lookups[symbol] || inTurn("search", 1100, async () => {
    const rows = (await call("/order/v1/searchScrip", { exchange: p.exchange, searchscrip: p.name })) || [];
    const hit = p.exchange === "NSE"
      ? rows.find((r) => r.tradingsymbol === `${p.name}-EQ`)
      : rows.find((r) => r.tradingsymbol === p.name) || rows.find((r) => r.tradingsymbol === `${p.name}-A`) || rows[0];
    if (!hit) throw new Error("Symbol not found");
    tokens()[symbol] = [p.exchange, String(hit.symboltoken)];
    write(TOKEN_STORE, JSON.stringify(tokens()));
    return tokens()[symbol];
  }).finally(() => { delete lookups[symbol]; });
  return lookups[symbol];
}

/* ---- prices ---- */
export async function fetchQuotes(symbols) {
  const pairs = await Promise.allSettled(symbols.map(async (s) => [s, await tokenFor(s)]));
  const known = pairs.filter((p) => p.status === "fulfilled").map((p) => p.value);
  const out = {};
  for (let i = 0; i < known.length; i += 50) {
    const chunk = known.slice(i, i + 50);
    const exchangeTokens = {};
    const bySymbol = {};
    chunk.forEach(([s, [ex, tk]]) => { (exchangeTokens[ex] = exchangeTokens[ex] || []).push(tk); bySymbol[`${ex}:${tk}`] = s; });
    const data = await inTurn("quote", 1100, () => call("/market/v1/quote/", { mode: "OHLC", exchangeTokens }));
    (data?.fetched || []).forEach((q) => {
      const s = bySymbol[`${q.exchange}:${q.symbolToken}`];
      if (s) out[s] = { price: q.ltp, prevClose: q.close };
    });
  }
  return out;
}

const INTERVALS = { "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE", "60m": "ONE_HOUR", "1d": "ONE_DAY" };
const RANGE_DAYS = { "1d": 6, "5d": 8, "1mo": 32, "6mo": 190, "1y": 370 };
const stamp = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 16).replace("T", " ");

async function chartJson({ symbol, interval, range, period1, period2 }) {
  const [exchange, symboltoken] = await tokenFor(symbol);
  const now = Date.now();
  const to = period2 ? Math.min(Number(period2) * 1000, now) : now;
  const from = period1 ? Number(period1) * 1000 : now - (RANGE_DAYS[range] ?? 8) * 86400000;
  const rows = (await inTurn("candles", 400, () => call("/historical/v1/getCandleData", {
    exchange, symboltoken, interval: INTERVALS[interval] || "FIVE_MINUTE", fromdate: stamp(from), todate: stamp(to),
  }))) || [];
  let candles = rows.map(([t, o, h, l, c]) => ({ t: Math.floor(Date.parse(t) / 1000), o, h, l, c }));
  if (range === "1d" && candles.length) { // the latest session only
    const day = istDay(candles[candles.length - 1].t * 1000);
    candles = candles.filter((k) => istDay(k.t * 1000) === day);
  }
  const last = candles[candles.length - 1]?.c;
  const live = period1 ? null : (await fetchQuotes([symbol]))[symbol];
  return { chart: { result: [{
    meta: { regularMarketPrice: live?.price ?? last, previousClose: live?.prevClose ?? candles[0]?.o, chartPreviousClose: live?.prevClose ?? candles[0]?.o },
    timestamp: candles.map((k) => k.t),
    indicators: { quote: [{ open: candles.map((k) => k.o), high: candles.map((k) => k.h), low: candles.map((k) => k.l), close: candles.map((k) => k.c) }] },
  }] } };
}

async function searchJson(q) {
  const rows = (await inTurn("search", 1100, () => call("/order/v1/searchScrip", { exchange: "NSE", searchscrip: q }))) || [];
  return { quotes: rows.filter((r) => /-EQ$/.test(r.tradingsymbol)).slice(0, 8).map((r) => {
    const name = r.tradingsymbol.replace(/-EQ$/, "");
    tokens()[`${name}.NS`] = ["NSE", String(r.symboltoken)];
    return { symbol: `${name}.NS`, quoteType: "EQUITY", longname: name };
  }) };
}

// The app's price code still builds its old feed addresses. Each one is answered here from the user's Angel One connection.
export function answerFeedRequest(url) {
  const qs = new URL(url).searchParams;
  if (qs.get("type") === "search") {
    if (Number(qs.get("newsCount")) > 0) return Promise.resolve({ news: [] }); // Angel One has no news feed
    return searchJson(qs.get("q"));
  }
  return chartJson({ symbol: qs.get("symbol"), interval: qs.get("interval"), range: qs.get("range"), period1: qs.get("period1"), period2: qs.get("period2") });
}
