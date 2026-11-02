// A user's own FYERS connection. Everything runs in their browser, and only read-only requests are possible.
// The app secret is never stored or sent: FYERS needs only its hash, which stays on the user's device.
import { read, write, remove, readJson, inTurn, redirectUri, stripLoginParams, sessionExpired, parseSymbol, IST_MS } from "./brokerUtil";

const BASE = "https://api-t1.fyers.in";
const READ_ONLY_PATHS = new Set(["/api/v3/profile", "/data/quotes", "/data/history"]);
const CREDS = "pr_fyers_creds", SESSION = "pr_fyers_session";

const session = () => readJson(SESSION);
const creds = () => readJson(CREDS);
// FYERS tokens end at 6:30 AM IST.
const validUntilNext630 = () => {
  const ist = new Date(Date.now() + IST_MS);
  let end = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 30) - IST_MS;
  if (end <= Date.now()) end += 86400000;
  return end;
};
export const hasSession = () => { const s = session(); return !!s && s.until > Date.now(); };
export const hasCredentials = () => !!creds();
export const clearConnection = () => remove(SESSION);
export function forgetCredentials() { remove(CREDS); remove(SESSION); }
export async function saveCredentials({ key, secret }) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:${secret}`));
  const hash = [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
  write(CREDS, JSON.stringify({ appId: key, hash }));
}
export const loginUrl = () => `${BASE}/api/v3/generate-authcode?client_id=${encodeURIComponent(creds().appId)}&redirect_uri=${encodeURIComponent(redirectUri())}&response_type=code&state=fyers`;

export async function finishLogin() {
  const qs = new URLSearchParams(window.location.search);
  const code = qs.get("auth_code");
  if (!code || qs.get("state") !== "fyers") return false;
  stripLoginParams(["auth_code", "s", "code", "state", "message"]);
  const res = await fetch(`${BASE}/api/v3/validate-authcode`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", appIdHash: creds()?.hash, code }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.access_token) throw new Error(json.message || "FYERS login failed");
  write(SESSION, JSON.stringify({ token: json.access_token, until: validUntilNext630() }));
  return true;
}

async function get(path, params) {
  if (!READ_ONLY_PATHS.has(path)) throw new Error("This request is not allowed");
  const s = session();
  if (!s) throw new Error("FYERS is not connected");
  const res = await fetch(`${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`, { headers: { Authorization: `${creds().appId}:${s.token}` } });
  const json = await res.json().catch(() => ({}));
  if ([-8, -15, -16, -17].includes(json.code)) { clearConnection(); sessionExpired(); throw new Error("FYERS session ended"); }
  if (json.s !== "ok") throw new Error(json.message || "FYERS request failed");
  return json;
}

export const fetchProfile = () => inTurn("fyers-profile", 300, () => get("/api/v3/profile"));

const FIXED = { "^NSEI": "NSE:NIFTY50-INDEX", "^NSEBANK": "NSE:NIFTYBANK-INDEX", "^BSESN": "BSE:SENSEX-INDEX", "^INDIAVIX": "NSE:INDIAVIX-INDEX" };
const toFyers = (symbol) => {
  if (FIXED[symbol]) return FIXED[symbol];
  const p = parseSymbol(symbol);
  if (!p) return null;
  return p.exchange === "NSE" ? `NSE:${p.name}-EQ` : `BSE:${p.name}-A`;
};

export async function fetchQuotes(symbols) {
  const mapped = symbols.map((s) => [s, toFyers(s)]).filter(([, f]) => f);
  const out = {};
  for (let i = 0; i < mapped.length; i += 50) {
    const chunk = mapped.slice(i, i + 50);
    const json = await inTurn("fyers-quote", 1100, () => get("/data/quotes", { symbols: chunk.map(([, f]) => f).join(",") }));
    (json.d || []).forEach((row) => {
      const hit = chunk.find(([, f]) => f === row.n);
      if (hit && row.s === "ok") out[hit[0]] = { price: row.v.lp, prevClose: row.v.prev_close_price };
    });
  }
  return out;
}

const RESOLUTIONS = { "1m": "1", "5m": "5", "15m": "15", "60m": "60", "1d": "1D" };
export async function fetchCandles({ symbol, interval, fromMs, toMs }) {
  const fy = toFyers(symbol);
  if (!fy) throw new Error("Unknown symbol");
  const span = (interval === "1d" ? 360 : 95) * 86400000;
  const out = [];
  for (let start = fromMs; start < toMs; start += span) {
    const json = await inTurn("fyers-candles", 400, () => get("/data/history", {
      symbol: fy, resolution: RESOLUTIONS[interval] || "5", date_format: "0",
      range_from: String(Math.floor(start / 1000)), range_to: String(Math.floor(Math.min(start + span, toMs) / 1000)), cont_flag: "1",
    }));
    (json.candles || []).forEach(([t, o, h, l, c]) => out.push({ t, o, h, l, c }));
  }
  return out;
}

// FYERS has no simple search here, so a typed symbol is checked directly.
export async function searchStocks(q) {
  const name = q.trim().toUpperCase();
  if (!/^[A-Z0-9&-]{2,}$/.test(name)) return [];
  const prices = await fetchQuotes([`${name}.NS`]).catch(() => ({}));
  return prices[`${name}.NS`] ? [{ symbol: `${name}.NS`, name }] : [];
}
