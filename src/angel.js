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
export function forgetCredentials() { remove(KEY_STORE); remove(SESSION_STORE); }
export const hasCredentials = () => !!getApiKey();
export const saveCredentials = ({ key }) => setApiKey(key);

// SmartAPI sessions end at midnight.
export function hasSession() { return !!getSession(); }
function getSession() {
  try {
    const s = JSON.parse(read(SESSION_STORE) || "null");
    return s && s.day === istDay() && s.jwt ? s : null;
  } catch { return null; }
}

export const loginUrl = () =>
  `https://smartapi.angelone.in/publisher-login?api_key=${encodeURIComponent(getApiKey())}&redirect_url=${encodeURIComponent(`${window.location.origin}/`)}&state=paperrally`;

// Angel One returns to the app with tokens in the address. Save them and remove them from the address at once.
function consumeLoginRedirect() {
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
    window.dispatchEvent(new Event("pr-broker-expired"));
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
async function tokenFor(symbol) {
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

/* ---- option premiums ---- */
// Real traded premiums for option contracts. A contract is { symbol, strike, type: "call" | "put", expiry (ms) }.
// Angel One lists index and stock options on NFO as NAME + DDMMMYY + STRIKE + CE/PE (BANKNIFTY28DEC2347700CE),
// and SENSEX options on BFO as SENSEX + YYMMM + STRIKE (monthly) or SENSEX + YY + M + DD + STRIKE (weekly).
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const BFO_WEEK_MONTH = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "O", "N", "D"];
const OPTION_ROOTS = { "^NSEI": ["NFO", "NIFTY"], "^NSEBANK": ["NFO", "BANKNIFTY"], "^BSESN": ["BFO", "SENSEX"] };
const DAY_MS = 86400000;
const two = (n) => String(n).padStart(2, "0");
export const optionKey = (c) => `${c.symbol}|${c.expiry}|${c.strike}|${c.type}`;

// The names this contract could be listed under, most likely first. Empty when the broker has no such options.
export function optionSymbolCandidates(c) {
  const stock = parseSymbol(c.symbol);
  const [exchange, root] = OPTION_ROOTS[c.symbol] || (stock && stock.exchange === "NSE" ? ["NFO", stock.name] : []);
  if (!root || !(c.strike > 0) || !c.expiry) return { exchange: null, names: [] };
  const cp = c.type === "call" ? "CE" : "PE";
  const strike = String(+c.strike);
  const parts = (ms) => { const d = new Date(ms + IST_MS); return { dd: two(d.getUTCDate()), m: d.getUTCMonth(), yy: two(d.getUTCFullYear() % 100) }; };
  if (exchange === "BFO") {
    const e = parts(c.expiry);
    const lastOfMonth = parts(c.expiry + 7 * DAY_MS).m !== e.m;
    return { exchange, names: [lastOfMonth ? `${root}${e.yy}${MONTHS[e.m]}${strike}${cp}` : `${root}${e.yy}${BFO_WEEK_MONTH[e.m]}${e.dd}${strike}${cp}`] };
  }
  // The exchange can move an expiry by a day around a holiday; try the day itself, then its neighbours.
  const names = [0, -1, 1].map((shift) => { const e = parts(c.expiry + shift * DAY_MS); return `${root}${e.dd}${MONTHS[e.m]}${e.yy}${strike}${cp}`; });
  return { exchange, names };
}

const OPT_PREFIX = "opt:";
const optionMisses = {}; // key -> time of the last failed lookup, so a missing contract is not searched again and again
const optionLookups = {};
const MISS_RETRY_MS = 10 * 60 * 1000;
function rememberOptionToken(key, value) {
  const all = tokens();
  const now = Date.now();
  Object.keys(all).forEach((k) => { // drop contracts that have expired
    if (k.startsWith(OPT_PREFIX) && Number(k.split("|")[1]) < now - DAY_MS) delete all[k];
  });
  all[OPT_PREFIX + key] = value;
  write(TOKEN_STORE, JSON.stringify(all));
}
function lookUpOption(c) {
  const key = optionKey(c);
  if (optionLookups[key] || (optionMisses[key] && Date.now() - optionMisses[key] < MISS_RETRY_MS)) return;
  const { exchange, names } = optionSymbolCandidates(c);
  if (!names.length) { optionMisses[key] = Date.now(); return; }
  optionLookups[key] = (async () => {
    for (const name of names) {
      const rows = (await inTurn("search", 1100, () => call("/order/v1/searchScrip", { exchange, searchscrip: name }))) || [];
      const hit = rows.find((r) => r.tradingsymbol === name);
      if (hit) { rememberOptionToken(key, [exchange, String(hit.symboltoken)]); return; }
    }
    optionMisses[key] = Date.now();
  })().catch(() => { optionMisses[key] = Date.now(); }).finally(() => { delete optionLookups[key]; });
}

// Returns { [optionKey]: last traded premium } for the contracts whose codes are already known.
// Unknown contracts are looked up in the background (one a second) and appear on a later call,
// so a long options chain never holds up the prices of open positions.
export async function fetchOptionQuotes(contracts) {
  const known = [];
  contracts.forEach((c) => {
    const tk = tokens()[OPT_PREFIX + optionKey(c)];
    if (tk) known.push([optionKey(c), tk]); else lookUpOption(c);
  });
  const out = {};
  for (let i = 0; i < known.length; i += 50) {
    const chunk = known.slice(i, i + 50);
    const exchangeTokens = {};
    const byToken = {};
    chunk.forEach(([key, [ex, tk]]) => { (exchangeTokens[ex] = exchangeTokens[ex] || []).push(tk); byToken[`${ex}:${tk}`] = key; });
    const data = await inTurn("quote", 1100, () => call("/market/v1/quote/", { mode: "LTP", exchangeTokens }));
    (data?.fetched || []).forEach((q) => {
      const key = byToken[`${q.exchange}:${q.symbolToken}`];
      if (key && q.ltp > 0) out[key] = q.ltp;
    });
  }
  return out;
}

const INTERVALS = { "1m": "ONE_MINUTE", "5m": "FIVE_MINUTE", "15m": "FIFTEEN_MINUTE", "60m": "ONE_HOUR", "1d": "ONE_DAY" };
const stamp = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 16).replace("T", " ");

export async function fetchCandles({ symbol, interval, fromMs, toMs }) {
  const [exchange, symboltoken] = await tokenFor(symbol);
  const rows = (await inTurn("candles", 400, () => call("/historical/v1/getCandleData", {
    exchange, symboltoken, interval: INTERVALS[interval] || "FIVE_MINUTE", fromdate: stamp(fromMs), todate: stamp(toMs),
  }))) || [];
  return rows.map(([t, o, h, l, c]) => ({ t: Math.floor(Date.parse(t) / 1000), o, h, l, c }));
}

export async function searchStocks(q) {
  const rows = (await inTurn("search", 1100, () => call("/order/v1/searchScrip", { exchange: "NSE", searchscrip: q }))) || [];
  return rows.filter((r) => /-EQ$/.test(r.tradingsymbol)).slice(0, 8).map((r) => {
    const name = r.tradingsymbol.replace(/-EQ$/, "");
    tokens()[`${name}.NS`] = ["NSE", String(r.symboltoken)];
    return { symbol: `${name}.NS`, name };
  });
}

export const finishLogin = async () => consumeLoginRedirect();
