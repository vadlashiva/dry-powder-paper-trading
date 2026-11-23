// Practice market: a simulated price feed for people who don't have a broker account yet.
// It answers the same calls as a real broker (see brokers.js), so the whole app works on it.
//
// Prices are generated, not real. They are deterministic: the same symbol at the same minute
// gives the same price on every device and after every reload, so charts, positions and the
// leaderboard stay consistent. Stocks move partly with the index (a shared "market" factor),
// sessions run 9:15 AM to 3:30 PM IST on weekdays, and each day opens near the previous close.
import { read, write, remove, readJson, IST_MS } from "./brokerUtil";

const STORE = "pr_sim_on";
const CLOCK = "pr_sim_clock"; // { realStart, simStart }: set when the user presses "Start market"
const DAY = 86400000;
const OPEN_MIN = 9 * 60 + 15;
const MINUTES = 375; // 9:15 to 3:30
const EPOCH_DAY = Math.floor(Date.UTC(2025, 5, 2) / DAY); // Monday 2 June 2025: the simulated history starts here

// Starting prices and volatility. Unknown symbols get a price and volatility from their name.
export const SIM_UNIVERSE = {
  "^NSEI": { name: "NIFTY 50", base: 24600, vol: 0.009, beta: 1 },
  "^NSEBANK": { name: "NIFTY BANK", base: 58000, vol: 0.011, beta: 0.95 },
  "^BSESN": { name: "SENSEX", base: 79000, vol: 0.009, beta: 1 },
  RELIANCE: { name: "Reliance Industries", base: 1340, vol: 0.015, beta: 0.8 },
  TCS: { name: "Tata Consultancy Services", base: 3085, vol: 0.014, beta: 0.6 },
  HDFCBANK: { name: "HDFC Bank", base: 952, vol: 0.013, beta: 0.8 },
  INFY: { name: "Infosys", base: 1470, vol: 0.016, beta: 0.6 },
  ICICIBANK: { name: "ICICI Bank", base: 1398, vol: 0.015, beta: 0.85 },
  SBIN: { name: "State Bank of India", base: 802, vol: 0.018, beta: 0.9 },
  ITC: { name: "ITC Limited", base: 415, vol: 0.012, beta: 0.5 },
  BHARTIARTL: { name: "Bharti Airtel", base: 1889, vol: 0.015, beta: 0.6 },
  LT: { name: "Larsen & Toubro", base: 3600, vol: 0.016, beta: 0.9 },
  AXISBANK: { name: "Axis Bank", base: 1150, vol: 0.017, beta: 0.9 },
  KOTAKBANK: { name: "Kotak Mahindra Bank", base: 1780, vol: 0.015, beta: 0.8 },
  MARUTI: { name: "Maruti Suzuki", base: 12400, vol: 0.016, beta: 0.7 },
  TATAMOTORS: { name: "Tata Motors", base: 720, vol: 0.022, beta: 1.1 },
  SUNPHARMA: { name: "Sun Pharmaceutical", base: 1650, vol: 0.014, beta: 0.4 },
  WIPRO: { name: "Wipro", base: 250, vol: 0.017, beta: 0.6 },
  HCLTECH: { name: "HCL Technologies", base: 1600, vol: 0.016, beta: 0.6 },
  ADANIENT: { name: "Adani Enterprises", base: 2400, vol: 0.028, beta: 1.2 },
  COCHINSHIP: { name: "Cochin Shipyard", base: 1600, vol: 0.03, beta: 1.1 },
  TATASTEEL: { name: "Tata Steel", base: 150, vol: 0.022, beta: 1.1 },
  HINDUNILVR: { name: "Hindustan Unilever", base: 2350, vol: 0.011, beta: 0.4 },
  BAJFINANCE: { name: "Bajaj Finance", base: 900, vol: 0.02, beta: 1.1 },
};

/* ---- deterministic random numbers ---- */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normals(seedStr, n) {
  const r = rng(hash(seedStr));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(r(), 1e-12), v = r();
    const m = Math.sqrt(-2 * Math.log(u));
    out[i] = m * Math.cos(2 * Math.PI * v);
    if (i + 1 < n) out[i + 1] = m * Math.sin(2 * Math.PI * v);
  }
  return out;
}

/* ---- symbols ---- */
export const simKey = (symbol) => String(symbol).replace(/\.(NS|BO)$/, "").toUpperCase();
function params(symbol) {
  const k = simKey(symbol);
  if (SIM_UNIVERSE[k]) return SIM_UNIVERSE[k];
  const h = hash(k);
  return { name: k, base: 100 + (h % 2900), vol: 0.014 + ((h >>> 12) % 12) / 1000, beta: 0.6 + ((h >>> 20) % 6) / 10 };
}
// NSE and BSE listings of the same stock share one price, like the real markets.
const indexOf = (symbol) => (simKey(symbol) === "^NSEBANK" ? "^NSEBANK" : "^NSEI");

/* ---- calendar ---- */
const istDayNum = (ms) => Math.floor((ms + IST_MS) / DAY);
const isWeekday = (d) => { const w = (d + 4) % 7; return w >= 1 && w <= 5; }; // 1970-01-01 was a Thursday
const sessionOpenMs = (d) => d * DAY - IST_MS + OPEN_MIN * 60000;
// Trading-day number since the epoch (weekdays only); null for weekends or days before the epoch.
function tradeIndex(d) {
  if (d < EPOCH_DAY || !isWeekday(d)) return null;
  const full = Math.floor((d - EPOCH_DAY) / 7) * 5;
  let rest = 0;
  for (let x = EPOCH_DAY + Math.floor((d - EPOCH_DAY) / 7) * 7; x < d; x++) if (isWeekday(x)) rest++;
  return full + rest;
}
// The most recent weekday on or before IST day `d`.
function lastTradeDay(d) { while (!isWeekday(d)) d--; return d; }

/* ---- market mood ---- */
// The market moves in short phases: each week (5 trading days) leans up or down, and the lean
// usually changes from one week to the next, so beginners see rising, falling and mixed weeks
// instead of one long trend. Stocks follow the lean in proportion to how closely they track the index.
const REGIME_DAYS = 5;
const REGIME_TILT = 0.35; // daily lean, as a fraction of the daily volatility
const FLIP_CHANCE = 0.65;
const regimeCache = {};
function regimeSign(ix, w) {
  const r = regimeCache[ix] || (regimeCache[ix] = [1]);
  for (let k = r.length; k <= w; k++) {
    const flip = rng(hash(`regime|${ix}|${k}`))() < FLIP_CHANCE;
    r[k] = flip ? -r[k - 1] : r[k - 1];
  }
  return r[w];
}

/* ---- daily closes ---- */
const closeCache = {};
function dailyCloses(symbol, upTo) {
  const k = simKey(symbol);
  const p = params(symbol);
  const c = closeCache[k] || (closeCache[k] = [p.base]);
  if (c.length > upTo) return c;
  const ix = indexOf(symbol);
  for (let i = c.length; i <= upTo; i++) {
    const m = normals(`mkt|${ix}|d${i}`, 1)[0];
    const e = normals(`${k}|d${i}`, 1)[0];
    const b = Math.min(p.beta, 1);
    const tilt = REGIME_TILT * b * regimeSign(ix, Math.floor(i / REGIME_DAYS));
    const shock = p.vol * (b * m + Math.sqrt(1 - b * b) * e + tilt);
    const pull = -0.03 * Math.log(c[i - 1] / p.base); // drifts back toward its usual level over weeks
    c[i] = c[i - 1] * Math.exp(shock + pull - (p.vol * p.vol) / 2);
  }
  return c;
}

/* ---- one trading day, minute by minute ---- */
const dayCache = new Map();
function dayPath(symbol, i) {
  const key = `${simKey(symbol)}|${i}`;
  if (dayCache.has(key)) return dayCache.get(key);
  const p = params(symbol);
  const closes = dailyCloses(symbol, i);
  const prev = i > 0 ? closes[i - 1] : p.base;
  const open = prev * Math.exp(p.vol * 0.25 * normals(`${simKey(symbol)}|gap${i}`, 1)[0]);
  const ix = indexOf(symbol);
  const m = normals(`mkt|${ix}|m${i}`, MINUTES);
  const e = normals(`${simKey(symbol)}|m${i}`, MINUTES);
  const b = Math.min(p.beta, 1);
  const sm = (p.vol * 0.9) / Math.sqrt(MINUTES);
  const logs = new Float64Array(MINUTES);
  let x = Math.log(open);
  for (let k = 0; k < MINUTES; k++) { x += sm * (b * m[k] + Math.sqrt(1 - b * b) * e[k]); logs[k] = x; }
  const fix = Math.log(closes[i]) - logs[MINUTES - 1]; // bend the path so the day ends at its close
  const wick = normals(`${simKey(symbol)}|w${i}`, MINUTES * 2);
  const bars = [];
  let o = open;
  for (let k = 0; k < MINUTES; k++) {
    const c = Math.exp(logs[k] + (fix * (k + 1)) / MINUTES);
    const h = Math.max(o, c) * (1 + Math.abs(wick[2 * k]) * sm * 0.35);
    const l = Math.min(o, c) * (1 - Math.abs(wick[2 * k + 1]) * sm * 0.35);
    bars.push({ o, h, l, c });
    o = c;
  }
  const out = { open, prevClose: prev, bars };
  dayCache.set(key, out);
  if (dayCache.size > 400) dayCache.delete(dayCache.keys().next().value);
  return out;
}

const tick = (v) => Math.round(v * 20) / 20; // 5-paisa tick
const r2 = (b) => ({ o: tick(b.o), h: tick(b.h), l: tick(b.l), c: tick(b.c) });

// Price now (or at `nowMs`): inside a session it moves within the current minute; outside, the last close.
export function simQuote(symbol, nowMs = simNow()) {
  let d = istDayNum(nowMs);
  const minute = Math.floor((nowMs - sessionOpenMs(d)) / 60000);
  const today = isWeekday(d) && minute >= 0 ? tradeIndex(d) : null;
  if (today != null) {
    const day = dayPath(symbol, today);
    if (minute >= MINUTES) return { price: tick(day.bars[MINUTES - 1].c), prevClose: tick(day.prevClose) };
    const bar = day.bars[minute];
    const frac = ((nowMs - sessionOpenMs(d)) % 60000) / 60000;
    const jitter = normals(`${simKey(symbol)}|s${today}|${minute}|${Math.floor(frac * 12)}`, 1)[0];
    const sm = params(symbol).vol * 0.9 / Math.sqrt(MINUTES);
    const p = bar.o + (bar.c - bar.o) * frac;
    return { price: tick(p * (1 + jitter * sm * 0.15)), prevClose: tick(day.prevClose) };
  }
  // before today's open or on a weekend: the last finished session
  d = lastTradeDay(isWeekday(d) && minute < 0 ? d - 1 : d);
  const i = tradeIndex(d) ?? 0;
  const day = dayPath(symbol, i);
  return { price: tick(day.bars[MINUTES - 1].c), prevClose: tick(day.prevClose) };
}

const STEP = { "1m": 1, "5m": 5, "15m": 15, "30m": 30, "60m": 60, "1h": 60 };
// Candles between fromMs and toMs, never past `nowMs`. Daily candles for interval "1d".
export function simCandles({ symbol, interval, fromMs, toMs }, nowMs = simNow()) {
  const end = Math.min(toMs, nowMs);
  const out = [];
  for (let d = istDayNum(fromMs); d <= istDayNum(end); d++) {
    const i = tradeIndex(d);
    if (i == null) continue;
    const start = sessionOpenMs(d);
    if (start > end) continue;
    const day = dayPath(symbol, i);
    const upto = Math.min(MINUTES, Math.floor((end - start) / 60000) + 1);
    if (interval === "1d" || interval === "1wk") {
      const bars = day.bars.slice(0, upto);
      if (start + MINUTES * 60000 > nowMs) bars[bars.length - 1] = { ...bars[bars.length - 1], c: simQuote(symbol, nowMs).price };
      out.push({ t: Math.floor(start / 1000), ...r2({ o: bars[0].o, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)), c: bars[bars.length - 1].c }) });
      continue;
    }
    const step = STEP[interval] || 5;
    for (let k = 0; k < upto; k += step) {
      const t = start + k * 60000;
      if (t < fromMs) continue;
      const seg = day.bars.slice(k, Math.min(k + step, upto));
      let c = seg[seg.length - 1].c;
      if (start + (k + step) * 60000 > nowMs && start + MINUTES * 60000 > nowMs) c = simQuote(symbol, nowMs).price; // the bar still forming
      out.push({ t: Math.floor(t / 1000), ...r2({ o: seg[0].o, h: Math.max(c, ...seg.map((b) => b.h)), l: Math.min(c, ...seg.map((b) => b.l)), c }) });
    }
  }
  return out;
}

/* ---- the practice market's own clock ---- */
// Until the user first presses "Start market", the practice market keeps real India time.
// "Start market" moves its clock forward to the next 9:15 AM open and lets it run at normal
// speed from there, so a beginner can trade a full session at any hour, day or night.
// The clock only ever moves forward, so positions, intraday square-off and history stay in order.
export function simNow(realMs = Date.now()) {
  const c = readJson(CLOCK);
  return c && c.simStart > 0 ? c.simStart + (realMs - c.realStart) : realMs;
}
// Is the practice market in session at practice time `t`? (Weekdays 9:15 AM to 3:30 PM.)
export function simIsOpen(t = simNow()) {
  const d = istDayNum(t);
  const m = (t - sessionOpenMs(d)) / 60000;
  return isWeekday(d) && m >= 0 && m < MINUTES;
}
// The open of the next practice session after practice time `t` (today's, if it hasn't opened yet).
export function nextSimOpen(t = simNow()) {
  let d = istDayNum(t);
  if (!isWeekday(d) || t >= sessionOpenMs(d)) { d++; while (!isWeekday(d)) d++; }
  return sessionOpenMs(d);
}
// "Start market": open a new session now. Does nothing while a session is already running.
export function startSimMarket(realMs = Date.now()) {
  const t = simNow(realMs);
  if (simIsOpen(t)) return t;
  const simStart = nextSimOpen(t);
  write(CLOCK, JSON.stringify({ realStart: realMs, simStart }));
  try { window.dispatchEvent(new Event("pr-sim-clock")); } catch { /* no window */ }
  return simStart;
}
export const clockNow = () => simNow();

/* ---- the broker interface (see brokers.js) ---- */
export const hasCredentials = () => read(STORE) === "1";
export const saveCredentials = () => write(STORE, "1");
export function clearConnection() { /* nothing to disconnect */ }
export function forgetCredentials() { remove(STORE); }
export const hasSession = () => hasCredentials();
export const loginUrl = () => `${window.location.origin}/`;
export const finishLogin = async () => false;
export const fetchProfile = async () => ({ name: "Practice market" });
export async function fetchQuotes(symbols) {
  const out = {};
  symbols.forEach((s) => { out[s] = simQuote(s); });
  return out;
}
export async function fetchCandles(req) { return simCandles(req); }
export async function searchStocks(q) {
  const term = String(q || "").trim().toUpperCase();
  if (!term) return [];
  return Object.entries(SIM_UNIVERSE)
    .filter(([k, v]) => !k.startsWith("^") && (k.includes(term) || v.name.toUpperCase().includes(term)))
    .slice(0, 8)
    .map(([k, v]) => ({ symbol: `${k}.NS`, name: v.name }));
}
