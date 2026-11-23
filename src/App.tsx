// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import {TrendingUp, TrendingDown, RotateCcw, X, Flame, Activity, LogOut, Lock, User as UserIcon, Bell, Trash2, Maximize2, Download, Newspaper, Crosshair, Sparkles,Eye, EyeOff, LineChart, Layers, Play, GraduationCap, Phone,
  List, BarChart3, Ellipsis, BookOpen, Briefcase, ListOrdered, Mail, KeyRound, Hourglass, MessageSquare, Trophy, Share2, Smartphone, Compass, NotebookPen,
  ArrowLeft, FlaskConical,
} from "lucide-react";
import { StrategyPanel } from "./strategies";
import { computeSMC, SMCPrimitive } from "./smc";
import { BrokerSetup, AccountQuestion } from "./brokerSetup";
import { AppPreview, PREVIEW_CSS } from "./preview";
import { BROKERS, activeBroker, chooseBroker, answerFeedRequest, fetchQuotes, fetchOptionQuotes } from "./brokers";
import { LEARN, LangSwitch, loadLang, saveLang } from "./i18n";
import { useIsMobile, loadSetting, saveSetting, computeCharges, PerformancePanel } from "./extras";
import { isoWeekIST, initTelemetry, track, tradeKey, TagChips, JournalModal, JournalStatsCard, computeAchievements, AchievementsGrid, ACHIEVEMENTS, makeShareImage, shareImage, captureReferralFromUrl, syncReferrals, InvitePanel, LeaderboardPanel, TourOverlay, InstallHelp } from "./growth";
import { useInstallPrompt, notify, requestNotifications, notificationPermission } from "./pwa";

const SUPPORT_EMAIL = "adi.shiv999@gmail.com";
const mailtoSupport = (subject, body) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/* ---------------- chart library, loaded as its own file ----------------
   lightweight-charts is ~20% of the app's JavaScript. Loading it separately (the
   download starts immediately, in parallel) lets the page render without waiting
   for it; each chart mounts as soon as the library has arrived. */
let LW = null;
const lwListeners = new Set();
const lwReady = import(/* webpackChunkName: "charts" */ "lightweight-charts").then((m) => {
  LW = m;
  lwListeners.forEach((fn) => fn());
  lwListeners.clear();
  return m;
});
lwReady.catch((e) => console.error("chart library failed to load", e));
function withCharts(Impl, minHeight = 0) {
  return function ChartGate(props) {
    const [ready, setReady] = useState(!!LW);
    useEffect(() => {
      if (LW) { setReady(true); return; }
      const fn = () => setReady(true);
      lwListeners.add(fn);
      return () => { lwListeners.delete(fn); };
    }, []);
    return ready ? <Impl {...props} /> : <div className="chartLoading" style={{ minHeight }} aria-busy="true" />;
  };
}
const PriceChart = withCharts(PriceChartImpl, 360);
const IndicatorPane = withCharts(IndicatorPaneImpl, 120);
const RSIChart = withCharts(RSIChartImpl, 120);
const MACDChart = withCharts(MACDChartImpl, 120);
const MiniHeroChart = withCharts(MiniHeroChartImpl, 120);
const PopoutCanvas = withCharts(PopoutCanvasImpl, 200);
declare global { interface Window { Razorpay: any; } }
/* ---------------- background themes ---------------- */
const THEMES = [
  { name: "Night", emoji: "🌙", vars: { "--bg": "#0A0D14", "--surface": "#121722", "--surface-2": "#1A2130", "--border": "#232B3D", "--text": "#E7ECF6", "--text-dim": "#8B96AA" } },
  { name: "Day", emoji: "☀️", vars: { "--bg": "#F3F4F7", "--surface": "#FFFFFF", "--surface-2": "#EEF0F4", "--border": "#DADDE3", "--text": "#12151C", "--text-dim": "#5B6270" } },
];
const LS_THEME = "tf_theme";
function loadThemeIdx() {
  try {
    const i = parseInt(localStorage.getItem(LS_THEME), 10);
    return Number.isInteger(i) && i >= 0 && i < THEMES.length ? i : 0;
  } catch { return 0; }
}
function saveThemeIdx(i) {
  try { localStorage.setItem(LS_THEME, String(i)); } catch { /* storage unavailable */ }
}

const INSTRUMENTS = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", exchange: "NSE", fallback: 1340, iv: 0.24 },
  { symbol: "TCS.NS", name: "Tata Consultancy Services", exchange: "NSE", fallback: 3085, iv: 0.22 },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", exchange: "NSE", fallback: 952, iv: 0.23 },
  { symbol: "INFY.NS", name: "Infosys", exchange: "NSE", fallback: 1470, iv: 0.26 },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", exchange: "NSE", fallback: 1398, iv: 0.25 },
  { symbol: "SBIN.NS", name: "State Bank of India", exchange: "NSE", fallback: 802, iv: 0.30 },
  { symbol: "ITC.NS", name: "ITC Limited", exchange: "NSE", fallback: 415, iv: 0.20 },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", exchange: "NSE", fallback: 1889, iv: 0.28 },
  { symbol: "RELIANCE.BO", name: "Reliance Industries", exchange: "BSE", fallback: 1340, iv: 0.24 },
  { symbol: "TCS.BO", name: "Tata Consultancy Services", exchange: "BSE", fallback: 3085, iv: 0.22 },
  { symbol: "HDFCBANK.BO", name: "HDFC Bank", exchange: "BSE", fallback: 952, iv: 0.23 },
  { symbol: "INFY.BO", name: "Infosys", exchange: "BSE", fallback: 1470, iv: 0.26 },
  { symbol: "^NSEI", name: "NIFTY 50", exchange: "INDEX", fallback: 24636, iv: 0.13 },
  { symbol: "^NSEBANK", name: "NIFTY BANK", exchange: "INDEX", fallback: 58064, iv: 0.16 },
  { symbol: "^BSESN", name: "SENSEX", exchange: "INDEX", fallback: 78955, iv: 0.13 },
];

const STARTING_CASH = 1000000;
const RISK_FREE = 0.065;
// Index option lot sizes (NSE revised Jan 2026). Reviewed every ~6 months.
const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };
const lotSizeFor = (symbol) => LOT_SIZES[displayTicker(symbol)] ?? 1;
// Positions opened before this change were stored in units, not lots.
const posMultiplier = (p) => (p.lotBased ? lotSizeFor(p.symbol) : 1);
const isShort = (p) => p.side === "short";
// Simplified estimate of SPAN + exposure margin for SELLING one lot of an option.
// Not exchange-exact: about 9% of contract value, reduced for out-of-the-money strikes, minimum 4%.
function shortMarginPerLot(spot, strike, type, lot) {
  const contract = spot * lot;
  const otm = Math.max(0, type === "call" ? strike - spot : spot - strike) * lot;
  return Math.round(Math.max(0.09 * contract - 0.5 * otm, 0.04 * contract));
}
const TRIAL_DAYS = 7;
// During Replay the whole terminal runs on a simulated clock.
let SIM_NOW = null;
const nowMs = () => (SIM_NOW ?? Date.now());
// Real traded option premiums from the user's broker, keyed by contract. Where a contract has one, it is used
// instead of the calculated (Black-Scholes) premium everywhere: chain, ticket, positions, P&L, stop-loss and fills.
// Once a contract has a real premium it keeps its last real value rather than switching back to the calculated
// one, so a brief gap in the feed can never trip a stop-loss on a different kind of price.
const REAL_PREMIUMS = new Map();
const REAL_PREMIUM_FRESH_MS = 60000;
const contractKey = (c) => `${c.symbol}|${c.expiry}|${c.strike}|${c.type}`;
function realPremium(c) {
  if (SIM_NOW != null) return null; // Replay has no historical option prices: it stays on calculated premiums
  return REAL_PREMIUMS.get(contractKey(c))?.price ?? null;
}
// "real" = traded premium updated in the last minute, "stale" = traded premium that has stopped updating, "model" = calculated.
function premiumSource(c) {
  if (SIM_NOW != null) return "model";
  const r = REAL_PREMIUMS.get(contractKey(c));
  if (!r) return "model";
  return Date.now() - r.at < REAL_PREMIUM_FRESH_MS ? "real" : "stale";
}
function trialDaysRemaining(createdAtIso, bonusDays = 0) {
  if (!createdAtIso) return 0;
  const start = new Date(createdAtIso).getTime();
  const elapsedDays = (Date.now() - start) / 86400000;
  return Math.max(0, Math.ceil(TRIAL_DAYS + bonusDays - elapsedDays));
}

const TIMEFRAMES = {
  "1m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1H": { interval: "60m", range: "1mo" },
  "1D": { interval: "1d", range: "6mo" },
};
const TIMEFRAME_MS = { "1m": 60000, "5m": 300000, "15m": 900000, "1H": 3600000, "1D": 86400000 };

// NSE equity & F&O trading holidays (weekdays only). Update each December from nseindia.com.
const NSE_HOLIDAYS = {
  "2026-01-15": "Maharashtra Municipal Election", "2026-01-26": "Republic Day",
  "2026-03-03": "Holi", "2026-03-26": "Ram Navami", "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday", "2026-04-14": "Ambedkar Jayanti", "2026-05-01": "Maharashtra Day",
  "2026-05-28": "Bakri Id", "2026-06-26": "Muharram", "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Gandhi Jayanti", "2026-10-20": "Dussehra", "2026-11-10": "Diwali Balipratipada",
  "2026-11-24": "Guru Nanak Jayanti", "2026-12-25": "Christmas",
};

function getMarketStatus() {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const key = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  const holiday = NSE_HOLIDAYS[key];
  if (holiday) return { isOpen: false, label: `Market Closed · ${holiday} holiday` };
  const isOpen = day >= 1 && day <= 5 && mins >= 555 && mins <= 930; // 9:15 AM - 3:30 PM IST
  return { isOpen, label: isOpen ? "Market Open" : "Market Closed · Opens 9:15 AM Mon–Fri" };
}

const TICKER_OVERRIDES = { NSEI: "NIFTY", NSEBANK: "BANKNIFTY", BSESN: "SENSEX" };
const displayTicker = (s) => {
  const base = s.replace(/\.(NS|BO)$/, "").replace(/^\^/, "");
  return TICKER_OVERRIDES[base] || base;
};
const exchangeBadge = (ex) => (ex === "INDEX" ? "IDX" : ex);

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normCDF(x) { return 0.5 * (1 + erf(x / Math.sqrt(2))); }
function phi(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }

// Current model premium for an option position/contract (same pricing used everywhere else in the app).
function optionPremiumNow(pos, quotes, instruments) {
  const real = realPremium(pos);
  if (real != null) return real;
  const spot = quotes[pos.symbol]?.price;
  const symMeta = instruments.find((s) => s.symbol === pos.symbol);
  if (!spot || !symMeta) return null;
  const T = (pos.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
  const sigma = symMeta.iv * (1 + 0.15 * Math.abs(pos.strike - spot) / spot);
  return blackScholes(spot, pos.strike, T, RISK_FREE, sigma, pos.type).price;
}
// A stop-loss on a long option fires when premium falls to/below it; on a short option, when premium rises to/above it.
const stopLossHit = (pos, premium) => (isShort(pos) ? premium >= pos.stopLoss : premium <= pos.stopLoss);

function blackScholes(S, K, T, r, sigma, type) {
  T = Math.max(T, 1 / (365 * 24 * 60)); // floor at 1 minute so expiry-day premiums keep decaying to the close
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  let price, delta, theta;
  if (type === "call") {
    price = S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
    delta = normCDF(d1);
    theta = (-(S * phi(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normCDF(d2)) / 365;
  } else {
    price = K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
    delta = normCDF(d1) - 1;
    theta = (-(S * phi(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;
  }
  const gamma = phi(d1) / (S * sigma * Math.sqrt(T));
  const vega = (S * phi(d1) * Math.sqrt(T)) / 100;
  return { price: Math.max(price, 0.05), delta, gamma, theta, vega };
}

// Option expiries. NSE (NIFTY, BANKNIFTY, NSE stocks) expire on Tuesday; BSE (SENSEX, BSE stocks) on Thursday.
// BANKNIFTY and stock options are monthly only (last Tuesday/Thursday of the month).
// If the expiry day is a holiday, expiry moves to the previous trading day. Expiry time is 3:30 PM IST.
const EXPIRY_RULES = {
  "^NSEI": { weekday: 2, weekly: true, step: 50 },
  "^NSEBANK": { weekday: 2, weekly: false, step: 100 },
  "^BSESN": { weekday: 4, weekly: true, step: 100 },
};
const IST_MS = 19800000;
const expiryRuleFor = (symbol) => EXPIRY_RULES[symbol] ?? { weekday: symbol.endsWith(".BO") ? 4 : 2, weekly: false };
function optionExpiries(symbol, n = 4, base = null) {
  const rule = expiryRuleFor(symbol);
  const now = base ?? Date.now();
  const ist = new Date(now + IST_MS); // IST wall clock, read with UTC getters
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const out = [];
  for (let i = 0; i < 200 && out.length < n; i++, day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() !== rule.weekday) continue;
    if (!rule.weekly) {
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 7);
      if (next.getUTCMonth() === day.getUTCMonth()) continue; // not the last one of the month
    }
    const e = new Date(day);
    while (e.getUTCDay() === 0 || e.getUTCDay() === 6 || NSE_HOLIDAYS[e.toISOString().slice(0, 10)]) e.setUTCDate(e.getUTCDate() - 1);
    const at = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate(), 10, 0); // 3:30 PM IST = 10:00 UTC
    if (at > now && !out.some((x) => x.getTime() === at)) out.push(new Date(at));
  }
  return out;
}

function strikeStep(spot) {
  if (spot > 20000) return 100;
  if (spot > 5000) return 50;
  if (spot > 1000) return 20;
  if (spot > 200) return 10;
  return 5;
}
function strikesAround(spot, count = 9, step = strikeStep(spot)) {
  const center = Math.round(spot / step) * step;
  const half = Math.floor(count / 2);
  const out = [];
  for (let i = -half; i <= half; i++) out.push(+(center + i * step).toFixed(2));
  return out;
}

function genSyntheticHistory(basePrice, count, intervalMs, volatility = 0.004) {
  const now = Date.now();
  let price = basePrice * (1 - (Math.random() - 0.5) * 0.03);
  const arr = [];
  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * intervalMs;
    const open = price;
    const drift = open * (Math.random() - 0.5) * volatility * 2;
    const close = +(open + drift).toFixed(2);
    const wick = Math.abs(open * volatility * (0.4 + Math.random() * 0.6));
    const high = +(Math.max(open, close) + wick).toFixed(2);
    const low = +(Math.min(open, close) - wick).toFixed(2);
    arr.push({ time, price: close, open, high, low: Math.max(low, 0.01), close });
    price = close;
  }
  if (arr.length) {
    const last = arr[arr.length - 1];
    last.close = basePrice;
    last.price = basePrice;
    last.high = Math.max(last.high, basePrice);
    last.low = Math.min(last.low, basePrice);
  }
  return arr;
}

function computeSMA(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j].price;
    return sum / period;
  });
}
function computeEMASeries(values, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return values.map((v) => {
    if (v == null) return null;
    if (prev == null) { prev = v; return prev; }
    prev = v * k + prev * (1 - k);
    return prev;
  });
}
function computeRSI(arr, period = 14) {
  const rsi = new Array(arr.length).fill(null);
  if (arr.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = arr[i].price - arr[i - 1].price;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < arr.length; i++) {
    const change = arr[i].price - arr[i - 1].price;
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}
function computeMACD(arr, fast = 12, slow = 26, signal = 9) {
  const closes = arr.map((d) => d.price);
  const emaFast = computeEMASeries(closes, fast);
  const emaSlow = computeEMASeries(closes, slow);
  const macdLine = closes.map((_, i) => (emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null));
  const signalLine = computeEMASeries(macdLine, signal);
  const hist = macdLine.map((v, i) => (v != null && signalLine[i] != null ? v - signalLine[i] : null));
  return { macdLine, signalLine, hist };
}
const hi = (d) => d.high ?? d.price;
const lo = (d) => d.low ?? d.price;
const cl = (d) => d.close ?? d.price;

function computeBollinger(arr, period = 20, mult = 2) {
  const mid = computeSMA(arr, period);
  const up = [], low = [];
  arr.forEach((_, i) => {
    if (mid[i] == null) { up.push(null); low.push(null); return; }
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (arr[j].price - mid[i]) ** 2;
    const sd = Math.sqrt(v / period);
    up.push(mid[i] + mult * sd);
    low.push(mid[i] - mult * sd);
  });
  return { mid, up, low };
}

function computeATR(arr, period = 14) {
  const out = new Array(arr.length).fill(null);
  if (arr.length <= period) return out;
  const tr = arr.map((d, i) => (i === 0 ? hi(d) - lo(d) : Math.max(hi(d) - lo(d), Math.abs(hi(d) - cl(arr[i - 1])), Math.abs(lo(d) - cl(arr[i - 1])))));
  let atr = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = atr;
  for (let i = period + 1; i < arr.length; i++) { atr = (atr * (period - 1) + tr[i]) / period; out[i] = atr; }
  return out;
}

function computeSupertrend(arr, period = 10, mult = 3) {
  const atr = computeATR(arr, period);
  const line = new Array(arr.length).fill(null), up = new Array(arr.length).fill(null);
  let fUpper = null, fLower = null, trendUp = true;
  for (let i = 0; i < arr.length; i++) {
    if (atr[i] == null) continue;
    const mid = (hi(arr[i]) + lo(arr[i])) / 2;
    const bUpper = mid + mult * atr[i], bLower = mid - mult * atr[i];
    const prevClose = i > 0 ? cl(arr[i - 1]) : cl(arr[i]);
    fUpper = fUpper == null || bUpper < fUpper || prevClose > fUpper ? bUpper : fUpper;
    fLower = fLower == null || bLower > fLower || prevClose < fLower ? bLower : fLower;
    if (trendUp && cl(arr[i]) < fLower) trendUp = false;
    else if (!trendUp && cl(arr[i]) > fUpper) trendUp = true;
    line[i] = trendUp ? fLower : fUpper;
    up[i] = trendUp;
  }
  return { line, up };
}

function computeStochastic(arr, kPeriod = 14, dPeriod = 3) {
  const k = arr.map((d, i) => {
    if (i < kPeriod - 1) return null;
    let h = -Infinity, l = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) { h = Math.max(h, hi(arr[j])); l = Math.min(l, lo(arr[j])); }
    return h === l ? 50 : ((cl(d) - l) / (h - l)) * 100;
  });
  const d = k.map((_, i) => {
    if (i < kPeriod - 2 + dPeriod || k[i] == null) return null;
    let sum = 0, n = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) if (k[j] != null) { sum += k[j]; n++; }
    return n === dPeriod ? sum / n : null;
  });
  return { k, d };
}

const IND_COLORS = { sma50: "#5EC8D8", ema9: "#FF8A5B", ema21: "#B98EFF", bb: "#6FCF97", stoch: "#FFB020", atr: "#5EC8D8" };
const INDICATOR_DEFS = [
  { key: "ma", group: "overlay", name: "SMA 20", color: "#FFB020", pro: false, desc: "Average closing price of the last 20 candles. Price staying above it usually means an uptrend." },
  { key: "sma50", group: "overlay", name: "SMA 50", color: IND_COLORS.sma50, pro: true, desc: "Slower 50-candle average, used to judge the bigger trend." },
  { key: "ema9", group: "overlay", name: "EMA 9", color: IND_COLORS.ema9, pro: true, desc: "Fast exponential average that reacts quickly to recent prices." },
  { key: "ema21", group: "overlay", name: "EMA 21", color: IND_COLORS.ema21, pro: true, desc: "Medium exponential average. EMA 9 crossing EMA 21 is a popular trend signal." },
  { key: "bb", group: "overlay", name: "Bollinger Bands (20, 2)", color: IND_COLORS.bb, pro: true, desc: "A band two standard deviations around SMA 20. Price at the edges means it's stretched." },
  { key: "st", group: "overlay", name: "Supertrend (10, 3)", color: "#14E8A0", pro: true, desc: "Trend-following line: green below price in an uptrend, red above price in a downtrend." },
  { key: "smc", group: "overlay", name: "Smart Money Concepts", color: "#089981", pro: true, desc: "Market structure (BOS / CHoCH), order blocks, fair value gaps, equal highs and lows, premium and discount zones, and the previous day's high and low." },
  { key: "rsi", group: "pane", name: "RSI (14)", color: "#7B61FF", pro: true, desc: "Momentum from 0 to 100. Above 70 is often called overbought, below 30 oversold." },
  { key: "macd", group: "pane", name: "MACD (12, 26, 9)", color: "#14E8A0", pro: true, desc: "Difference between two EMAs with a signal line. Crossovers show changes in momentum." },
  { key: "stoch", group: "pane", name: "Stochastic (14, 3)", color: IND_COLORS.stoch, pro: true, desc: "Where the close sits within the recent high-low range. Above 80 is high, below 20 low." },
  { key: "atr", group: "pane", name: "ATR (14)", color: IND_COLORS.atr, pro: true, desc: "Average True Range: how much price typically moves per candle. Useful for setting stop-losses." },
];
const ALL_INDICATORS_ON = Object.fromEntries(INDICATOR_DEFS.map((d) => [d.key, true]));

function buildChartSeries(history, ind) {
  const sma = ind.ma ? computeSMA(history, 20) : null;
  const rsi = ind.rsi ? computeRSI(history, 14) : null;
  const macd = ind.macd ? computeMACD(history) : null;
  const sma50 = ind.sma50 ? computeSMA(history, 50) : null;
  const closes = history.map((d) => d.price);
  const ema9 = ind.ema9 ? computeEMASeries(closes, 9) : null;
  const ema21 = ind.ema21 ? computeEMASeries(closes, 21) : null;
  const bb = ind.bb ? computeBollinger(history) : null;
  const st = ind.st ? computeSupertrend(history) : null;
  const stoch = ind.stoch ? computeStochastic(history) : null;
  const atr = ind.atr ? computeATR(history) : null;
  return history.map((d, i) => {
    const open = d.open ?? d.price;
    const high = d.high ?? d.price;
    const low = d.low ?? d.price;
    const close = d.close ?? d.price;
    return {
      time: d.time,
      price: d.price,
      open, high, low, close,
      ma: sma ? sma[i] : null,
      rsi: rsi ? rsi[i] : null,
      macdLine: macd ? macd.macdLine[i] : null,
      signalLine: macd ? macd.signalLine[i] : null,
      hist: macd ? macd.hist[i] : null,
      sma50: sma50 ? sma50[i] : null,
      ema9: ema9 && i >= 8 ? ema9[i] : null,
      ema21: ema21 && i >= 20 ? ema21[i] : null,
      bbU: bb ? bb.up[i] : null, bbM: bb ? bb.mid[i] : null, bbL: bb ? bb.low[i] : null,
      st: st ? st.line[i] : null, stUp: st ? st.up[i] : null,
      stochK: stoch ? stoch.k[i] : null, stochD: stoch ? stoch.d[i] : null,
      atr: atr ? atr[i] : null,
    };
  });
}

const IST_OFFSET_SEC = 5.5 * 3600;
function prepLW(data) {
  const out = [];
  let lastT = -Infinity;
  for (const d of data) {
    const t = Math.floor(d.time / 1000) + IST_OFFSET_SEC; // label the axis in IST
    if (t <= lastT) continue;
    lastT = t;
    out.push({ t, d });
  }
  return out;
}

const LW_COLORS = { bull: "#14E8A0", bear: "#FF5470", accent: "#7B61FF", amber: "#FFB020", grid: "#232B3D", text: "#8B96AA" };
const ALLOC_PALETTE = ["#14E8A0", "#7B61FF", "#FFB020", "#FF5470", "#5EC8D8", "#B98EFF", "#FF8A5B", "#6FCF97"];

function joinSyncGroup(chart, syncGroupRef) {
  syncGroupRef.current.push(chart);
  chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (!range) return;
    syncGroupRef.current.forEach((c) => {
      if (c !== chart) {
        try { c.timeScale().setVisibleLogicalRange(range); } catch { /* chart mid-teardown */ }
      }
    });
  });
}
function leaveSyncGroup(chart, syncGroupRef) {
  syncGroupRef.current = syncGroupRef.current.filter((c) => c !== chart);
}
function fitAllInGroup(syncGroupRef) {
  syncGroupRef.current.forEach((c) => { try { c.timeScale().fitContent(); } catch { /* ignore */ } });
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const DRAW_TOOLS = [
  { id: "cursor", label: "Cursor" },
  { id: "hline", label: "H-Line" },
  { id: "vline", label: "V-Line" },
  { id: "trend", label: "Trend" },
  { id: "erase", label: "Erase" },
];

function PriceChartImpl({ data, showMA, syncGroupRef, pickMode, onPricePick, draftPrice, pendingLines, chartType, resetKey, overlays = [], smc = false }) {
  const overlaySeriesRef = useRef(new Map());
  const smcRef = useRef(null);
  const fitKeyRef = useRef(null);
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const lineRef = useRef(null);
  const maRef = useRef(null);
  const draftLineRef = useRef(null);
  const pendingLinesRef = useRef(new Map());
  const userHLineRefsMap = useRef(new Map());
  const pickModeRef = useRef(pickMode);
  const onPricePickRef = useRef(onPricePick);
  const drawModeRef = useRef("cursor");
  const drawingsRef = useRef([]);
  const pendingTrendRef = useRef(null);
  const [drawMode, setDrawMode] = useState("cursor");
  const [drawings, setDrawings] = useState([]);
  const [overlayTick, setOverlayTick] = useState(0);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPricePickRef.current = onPricePick; }, [onPricePick]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { drawingsRef.current = drawings; setOverlayTick((t) => t + 1); }, [drawings]);
  useEffect(() => { setDrawings([]); pendingTrendRef.current = null; setDrawMode("cursor"); }, [resetKey]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = LW.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 340,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: true, mouse: true },
    });
    const candleSeries = chart.addSeries(LW.CandlestickSeries, {
      upColor: LW_COLORS.bull, downColor: LW_COLORS.bear, borderVisible: false,
      wickUpColor: LW_COLORS.bull, wickDownColor: LW_COLORS.bear,
    });
    const lineSeries = chart.addSeries(LW.LineSeries, {
      color: LW_COLORS.accent, lineWidth: 2, priceLineVisible: true, lastValueVisible: true, visible: false,
    });
    const maSeries = chart.addSeries(LW.LineSeries, { color: LW_COLORS.amber, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

    chart.subscribeCrosshairMove((param) => {
      if (!legendRef.current) return;
      const activeSeries = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
      const point = param.seriesData && activeSeries && param.seriesData.get(activeSeries);
      if (param.time && point && point.open != null) {
        legendRef.current.textContent = `O ${point.open.toFixed(2)}   H ${point.high.toFixed(2)}   L ${point.low.toFixed(2)}   C ${point.close.toFixed(2)}`;
      } else if (param.time && point && point.value != null) {
        legendRef.current.textContent = `${point.value.toFixed(2)}`;
      } else {
        legendRef.current.textContent = "";
      }
    });

    chart.subscribeClick((param) => {
      if (drawModeRef.current !== "cursor" && param.point) {
        const activeSeries = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
        const mode = drawModeRef.current;
        if (mode === "hline") {
          const price = activeSeries.coordinateToPrice(param.point.y);
          if (price != null) setDrawings((prev) => [...prev, { id: uid(), type: "hline", price }]);
          return;
        }
        if (mode === "vline") {
          const time = chart.timeScale().coordinateToTime(param.point.x);
          if (time != null) setDrawings((prev) => [...prev, { id: uid(), type: "vline", time }]);
          return;
        }
        if (mode === "trend") {
          const price = activeSeries.coordinateToPrice(param.point.y);
          const time = chart.timeScale().coordinateToTime(param.point.x);
          if (price != null && time != null) {
            if (!pendingTrendRef.current) {
              pendingTrendRef.current = { time, price };
            } else {
              const p1 = pendingTrendRef.current;
              setDrawings((prev) => [...prev, { id: uid(), type: "trend", t1: p1.time, p1: p1.price, t2: time, p2: price }]);
              pendingTrendRef.current = null;
            }
          }
          return;
        }
        if (mode === "erase") {
          const ts = chart.timeScale();
          const activeSeries2 = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
          let best = null, bestDist = 10;
          drawingsRef.current.forEach((d) => {
            if (d.type === "hline") {
              const py = activeSeries2.priceToCoordinate(d.price);
              if (py != null) { const dist = Math.abs(param.point.y - py); if (dist < bestDist) { bestDist = dist; best = d; } }
            } else if (d.type === "vline") {
              const px = ts.timeToCoordinate(d.time);
              if (px != null) { const dist = Math.abs(param.point.x - px); if (dist < bestDist) { bestDist = dist; best = d; } }
            } else if (d.type === "trend") {
              const x1 = ts.timeToCoordinate(d.t1), y1 = activeSeries2.priceToCoordinate(d.p1);
              const x2 = ts.timeToCoordinate(d.t2), y2 = activeSeries2.priceToCoordinate(d.p2);
              if (x1 != null && y1 != null && x2 != null && y2 != null) {
                const dist = pointToSegmentDistance(param.point.x, param.point.y, x1, y1, x2, y2);
                if (dist < bestDist) { bestDist = dist; best = d; }
              }
            }
          });
          if (best) setDrawings((prev) => prev.filter((d) => d.id !== best.id));
          return;
        }
      }
      if (!pickModeRef.current || !param.point) return;
      const activeSeries = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
      if (!activeSeries) return;
      const price = activeSeries.coordinateToPrice(param.point.y);
      if (price != null && onPricePickRef.current) onPricePickRef.current(price);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => setOverlayTick((t) => t + 1));

    chartRef.current = chart;
    candleRef.current = candleSeries;
    lineRef.current = lineSeries;
    maRef.current = maSeries;
    joinSyncGroup(chart, syncGroupRef);

    const onResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); setOverlayTick((t) => t + 1); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      leaveSyncGroup(chart, syncGroupRef);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !lineRef.current) return;
    const isCandle = chartType !== "line";
    candleRef.current.applyOptions({ visible: isCandle });
    lineRef.current.applyOptions({ visible: !isCandle });
  }, [chartType]);

  useEffect(() => {
    if (!candleRef.current || !lineRef.current) return;
    const prepped = prepLW(data);
    candleRef.current.setData(prepped.map(({ t, d }) => ({ time: t, open: d.open, high: d.high, low: d.low, close: d.close })));
    lineRef.current.setData(prepped.map(({ t, d }) => ({ time: t, value: d.close })));
    if (maRef.current) {
      maRef.current.setData(showMA ? prepped.filter(({ d }) => d.ma != null).map(({ t, d }) => ({ time: t, value: d.ma })) : []);
    }
    const fitKey = `${resetKey}|${prepped.length ? 1 : 0}`;
    if (chartRef.current && fitKeyRef.current !== fitKey) { chartRef.current.timeScale().fitContent(); fitKeyRef.current = fitKey; }
  }, [data, showMA]);

  const overlaysKey = overlays.map((o) => o.id).join(",");
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const wanted = new Set(overlays.map((o) => o.id));
    overlaySeriesRef.current.forEach((series, id) => {
      if (!wanted.has(id)) { try { chart.removeSeries(series); } catch { /* already gone */ } overlaySeriesRef.current.delete(id); }
    });
    const prepped = prepLW(data);
    overlays.forEach((o) => {
      let series = overlaySeriesRef.current.get(o.id);
      if (!series) {
        series = chart.addSeries(LW.LineSeries, { color: o.color, lineWidth: o.width ?? 1.5, lineStyle: o.lineStyle ?? 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        overlaySeriesRef.current.set(o.id, series);
      }
      series.setData(prepped.filter(({ d }) => d[o.field] != null).map(({ t, d }) => (
        o.trendColored ? { time: t, value: d[o.field], color: d.stUp ? LW_COLORS.bull : LW_COLORS.bear } : { time: t, value: d[o.field] }
      )));
    });
  }, [data, overlaysKey]);

  // Smart Money Concepts: computed from the candles on screen, drawn by a series primitive.
  useEffect(() => {
    const activeSeries = chartType === "line" ? lineRef.current : candleRef.current;
    if (!activeSeries || !smc) return;
    const primitive = new SMCPrimitive();
    activeSeries.attachPrimitive(primitive);
    smcRef.current = primitive;
    return () => {
      smcRef.current = null;
      try { activeSeries.detachPrimitive(primitive); } catch { /* chart already removed */ }
    };
  }, [smc, chartType]);
  useEffect(() => {
    if (!smc || !smcRef.current) return;
    smcRef.current.setModel(computeSMC(prepLW(data).map(({ t, d }) => ({ time: t, open: d.open, high: d.high, low: d.low, close: d.close }))));
  }, [data, smc, chartType]);

  useEffect(() => {
    const activeSeries = chartType === "line" ? lineRef.current : candleRef.current;
    if (!activeSeries) return;
    if (draftLineRef.current) {
      activeSeries.removePriceLine(draftLineRef.current);
      draftLineRef.current = null;
    }
    if (draftPrice != null && !Number.isNaN(draftPrice)) {
      draftLineRef.current = activeSeries.createPriceLine({
        price: draftPrice,
        color: LW_COLORS.amber,
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "your order",
      });
    }
  }, [draftPrice, chartType]);

  useEffect(() => {
    const activeSeries = chartType === "line" ? lineRef.current : candleRef.current;
    if (!activeSeries) return;
    const list = pendingLines || [];
    const currentIds = new Set(list.map((l) => l.id));
    pendingLinesRef.current.forEach((line, id) => {
      if (!currentIds.has(id)) {
        activeSeries.removePriceLine(line);
        pendingLinesRef.current.delete(id);
      }
    });
    list.forEach((l) => {
      const existing = pendingLinesRef.current.get(l.id);
      if (existing) {
        existing.applyOptions({ price: l.price, title: l.title, color: l.color });
      } else {
        const line = activeSeries.createPriceLine({
          price: l.price, color: l.color, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: l.title,
        });
        pendingLinesRef.current.set(l.id, line);
      }
    });
  }, [pendingLines, chartType]);

  useEffect(() => {
    const activeSeries = chartType === "line" ? lineRef.current : candleRef.current;
    if (!activeSeries) return;
    const hlines = drawings.filter((d) => d.type === "hline");
    const currentIds = new Set(hlines.map((d) => d.id));
    userHLineRefsMap.current.forEach((line, id) => {
      if (!currentIds.has(id)) {
        try { activeSeries.removePriceLine(line); } catch { /* series swapped */ }
        userHLineRefsMap.current.delete(id);
      }
    });
    hlines.forEach((d) => {
      if (!userHLineRefsMap.current.has(d.id)) {
        const line = activeSeries.createPriceLine({
          price: d.price, color: LW_COLORS.accent, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "H",
        });
        userHLineRefsMap.current.set(d.id, line);
      }
    });
  }, [drawings, chartType]);

  useEffect(() => { setOverlayTick((t) => t + 1); }, [data, chartType]);

  const overlayLines = useMemo(() => {
    if (!chartRef.current || !containerRef.current) return [];
    const activeSeries = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
    if (!activeSeries) return [];
    const ts = chartRef.current.timeScale();
    const height = containerRef.current.clientHeight || 340;
    const out = [];
    drawings.forEach((d) => {
      if (d.type === "vline") {
        const x = ts.timeToCoordinate(d.time);
        if (x != null) out.push({ id: d.id, x1: x, y1: 0, x2: x, y2: height });
      } else if (d.type === "trend") {
        const x1 = ts.timeToCoordinate(d.t1), y1 = activeSeries.priceToCoordinate(d.p1);
        const x2 = ts.timeToCoordinate(d.t2), y2 = activeSeries.priceToCoordinate(d.p2);
        if (x1 != null && y1 != null && x2 != null && y2 != null) out.push({ id: d.id, x1, y1, x2, y2 });
      }
    });
    return out;
  }, [drawings, overlayTick, chartType]);

  return (
    <div className="lwWrap">
      <div className="drawToolbar">
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`drawToolBtn ${drawMode === t.id ? "drawToolBtnActive" : ""}`}
            onClick={() => { pendingTrendRef.current = null; setDrawMode(t.id); }}
          >
            {t.label}
          </button>
        ))}
        {drawings.length > 0 && (
          <button className="drawToolBtn" onClick={() => { setDrawings([]); pendingTrendRef.current = null; }}>Clear</button>
        )}
        {drawMode === "trend" && (
          <span className="dim drawToolHint">{pendingTrendRef.current ? "Click the second point…" : "Click the first point…"}</span>
        )}
      </div>
      <div className="lwChartOuter" style={{ position: "relative" }}>
        <div ref={legendRef} className="lwLegend mono" />
        <div ref={containerRef} className={`lwChart ${pickMode || drawMode !== "cursor" ? "lwChartPicking" : ""}`} />
        <svg className="lwDrawOverlay" width="100%" height="100%">
          {overlayLines.map((l) => (
            <line key={l.id} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={LW_COLORS.accent} strokeWidth="1.5" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function IndicatorPaneImpl({ data, syncGroupRef, lines, levels = [] }) {
  const containerRef = useRef(null);
  const seriesRefs = useRef([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = LW.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 110,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, visible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    seriesRefs.current = lines.map((l) => chart.addSeries(LW.LineSeries, { color: l.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false }));
    levels.forEach((lv) => seriesRefs.current[0].createPriceLine({ price: lv.price, color: lv.color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
    joinSyncGroup(chart, syncGroupRef);
    const onResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); leaveSyncGroup(chart, syncGroupRef); chart.remove(); };
  }, []);

  useEffect(() => {
    const prepped = prepLW(data);
    lines.forEach((l, i) => {
      const s = seriesRefs.current[i];
      if (s) s.setData(prepped.filter(({ d }) => d[l.field] != null).map(({ t, d }) => ({ time: t, value: d[l.field] })));
    });
  }, [data]);

  return <div ref={containerRef} className="lwChart" />;
}

function RSIChartImpl({ data, syncGroupRef }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = LW.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 110,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, visible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const series = chart.addSeries(LW.LineSeries, { color: LW_COLORS.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    series.createPriceLine({ price: 70, color: LW_COLORS.bear, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    series.createPriceLine({ price: 30, color: LW_COLORS.bull, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });

    chartRef.current = chart;
    seriesRef.current = series;
    joinSyncGroup(chart, syncGroupRef);

    const onResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      leaveSyncGroup(chart, syncGroupRef);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const prepped = prepLW(data).filter(({ d }) => d.rsi != null).map(({ t, d }) => ({ time: t, value: d.rsi }));
    seriesRef.current.setData(prepped);
  }, [data]);

  return <div ref={containerRef} className="lwChart" />;
}

function MACDChartImpl({ data, syncGroupRef }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const histRef = useRef(null);
  const macdRef = useRef(null);
  const signalRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = LW.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 110,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const hist = chart.addSeries(LW.HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    const macdLine = chart.addSeries(LW.LineSeries, { color: LW_COLORS.bull, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const signalLine = chart.addSeries(LW.LineSeries, { color: LW_COLORS.bear, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

    chartRef.current = chart;
    histRef.current = hist;
    macdRef.current = macdLine;
    signalRef.current = signalLine;
    joinSyncGroup(chart, syncGroupRef);

    const onResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      leaveSyncGroup(chart, syncGroupRef);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!histRef.current) return;
    const prepped = prepLW(data);
    histRef.current.setData(
      prepped.filter(({ d }) => d.hist != null).map(({ t, d }) => ({ time: t, value: d.hist, color: d.hist >= 0 ? "rgba(20,232,160,0.5)" : "rgba(255,84,112,0.5)" }))
    );
    macdRef.current.setData(prepped.filter(({ d }) => d.macdLine != null).map(({ t, d }) => ({ time: t, value: d.macdLine })));
    signalRef.current.setData(prepped.filter(({ d }) => d.signalLine != null).map(({ t, d }) => ({ time: t, value: d.signalLine })));
  }, [data]);

  return <div ref={containerRef} className="lwChart" />;
}

const fmtMoney = (n, d = 2) =>
  (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtDate = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });
const uid = () => Math.random().toString(36).slice(2, 10);

const SUPABASE_URL = "https://qfzepvorvvajqpnfwceq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-pw1tSkYhKymxQZHNqT66w_GOPnWEQN";
const YAHOO_PROXY_URL = `${SUPABASE_URL}/functions/v1/yahoo-proxy`;

// ---- Shared price-feed fetcher ---------------------------------------------
// Many widgets ask for the same symbol at nearly the same moment (ticker, hero
// chart, watchlist, main chart). This keeps one request in flight per URL and
// reuses a fresh answer for a few seconds, so the proxy isn't flooded and the
// browser's connection limit doesn't queue requests for seconds.
const proxyCache = new Map(); // url -> { at, promise }
function proxyJson(url, ttlMs) {
  const now = Date.now();
  const hit = proxyCache.get(url);
  if (hit && (hit.pending || now - hit.at < ttlMs)) return hit.promise;
  const entry = { at: now, pending: true, promise: null };
  entry.promise = answerFeedRequest(url)
    .then((json) => { entry.pending = false; entry.at = Date.now(); return json; })
    .catch((e) => { if (proxyCache.get(url) === entry) proxyCache.delete(url); throw e; });
  proxyCache.set(url, entry);
  if (proxyCache.size > 300) { const cutoff = Date.now() - 10 * 60 * 1000; for (const [k, v] of proxyCache) if (!v.pending && v.at < cutoff) proxyCache.delete(k); }
  return entry.promise;
}
const LIVE_TTL = 6000, HISTORY_TTL = 5 * 60 * 1000, SEARCH_TTL = 60 * 1000, NEWS_TTL = 2 * 60 * 1000;

// setInterval that skips ticks while the tab is hidden and catches up the
// moment the user comes back — saves data and battery on phones.
function visibleInterval(fn, ms) {
  let missed = false;
  const iv = setInterval(() => { if (document.hidden) { missed = true; return; } fn(); }, ms);
  const onVis = () => { if (!document.hidden && missed) { missed = false; fn(); } };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
}
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
initTelemetry(supabase);
captureReferralFromUrl();

const usernameToEmail = (username) => `${username.trim().toLowerCase()}@gmail.com`;

async function signUpUser(username, password) {
  return supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });
}
async function signInUser(username, password) {
  return supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
}
async function signOutUser() {
  await supabase.auth.signOut();
}

// ---- Google Sign-In -------------------------------------------------------
async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

// Every account (password OR Google) must have exactly one row in
// phone_registry, keyed uniquely by phone number. This is what stops someone
// from creating unlimited accounts (via new Gmail addresses) to keep
// resetting their free trial.
async function hasRegisteredPhone(userId) {
  const { data, error } = await supabase
    .from("phone_registry")
    .select("phone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) { console.error("phone check failed", error); return true; } // fail open — don't lock a user out on a network blip
  return !!data;
}

// Accepts the ways people actually type an Indian mobile number —
// "9876543210", "98765 43210", "09876543210", "919876543210", "+91 98765-43210" —
// and stores them all the same way (+919876543210), so one number can't be
// registered twice just by typing it differently.
function normalizePhoneInput(phone) {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return `+91${digits}`;
}

function phoneInputError(p) {
  if (p.startsWith("+91")) {
    if (!/^\+91[6-9]\d{9}$/.test(p)) return "Enter your 10-digit mobile number (e.g. 9876543210).";
    return null;
  }
  if (!/^\+\d{8,15}$/.test(p)) return "Enter a valid mobile number.";
  return null;
}

async function registerPhoneForUser(userId, phone) {
  const p = normalizePhoneInput(phone);
  const invalid = phoneInputError(p);
  if (invalid) return { error: { message: invalid } };
  const { error } = await supabase.from("phone_registry").insert({ phone: p, user_id: userId });
  if (error) {
    if (error.code === "23505") {
      return { error: { message: "This phone number is already linked to a PaperRally account. Please log in with your original account instead." } };
    }
    return { error: { message: "Could not save your phone number. Try again." } };
  }
  return { error: null };
}

function hydratePortfolio(raw) {
  const base = raw || {};
  return {
    cash: base.cash ?? STARTING_CASH,
    stockPositions: base.stockPositions ?? [],
    optionPositions: base.optionPositions ?? [],
    trades: (base.trades || []).map((t) => ({ ...t, time: new Date(t.time) })),
    alerts: base.alerts ?? [],
    pendingOrders: (base.pendingOrders || []).map((o) => ({ ...o, createdAt: new Date(o.createdAt) })),
    customInstruments: base.customInstruments ?? [],
    prefs: base.prefs ?? {},
    weekStart: base.weekStart ?? null,
  };
}
async function fetchPortfolio(userId) {
  const { data, error } = await supabase.from("portfolios").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return hydratePortfolio(data?.data ?? null);
}
async function upsertPortfolio(userId, payload) {
  const { error } = await supabase.from("portfolios").upsert({ user_id: userId, data: payload, updated_at: new Date().toISOString() });
  if (error) console.error("portfolio save failed", error);
}

async function fetchSubscription(userId) {
  const { data, error } = await supabase.from("subscriptions").select("status, current_period_end").eq("user_id", userId).maybeSingle();
  if (error) { console.error("subscription fetch failed", error); return { status: "free", current_period_end: null }; }
  return data || { status: "free", current_period_end: null };
}

// ---- Razorpay Payment Link checkout (no backend required) --------------------
// This app has no server, so it cannot securely create orders/subscriptions or
// verify payment signatures (that requires RAZORPAY_KEY_SECRET, which must never
// ship to the browser). Instead we send the user to a Payment Link you create
// once in the Razorpay Dashboard (Payment Links > + New Payment Link).
//
// IMPORTANT — REPLACE THIS with your real Payment Link URL before shipping:
const RAZORPAY_PAYMENT_LINK_URL = "https://rzp.io/rzp/PPCNezNF";

// Because there's no backend/webhook here, Pro access cannot be unlocked
// automatically the instant payment succeeds. After a user pays, check the
// transaction in the Razorpay Dashboard, then manually set that user's row in
// the Supabase `subscriptions` table (status = "active", current_period_end =
// one month out). fetchSubscription() above will then pick it up on next poll.
async function startProCheckout({ userEmail, onSuccess, onError }) {
  try {
    if (RAZORPAY_PAYMENT_LINK_URL.includes("REPLACE_ME")) {
      throw new Error("Payment link not configured yet — set RAZORPAY_PAYMENT_LINK_URL");
    }
    const url = new URL(RAZORPAY_PAYMENT_LINK_URL);
    // Razorpay Payment Links will prefill these query params if the link was
    // created with "Collect additional information" > email enabled.
    if (userEmail) url.searchParams.set("prefill[email]", userEmail);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
    onSuccess(); // opened the link; see poller below for actual Pro activation
  } catch (e) {
    onError(e.message || "Could not open payment link");
  }
}

// One full trading day of 5-minute candles plus the previous day's close.
async function fetchYahooDay(symbol, dateISO) {
  const p1 = Math.floor(new Date(dateISO + "T00:00:00+05:30").getTime() / 1000);
  const from = p1 - 6 * 86400; // include the previous trading session for chart context
  const isPast = Date.now() > Date.parse(dateISO + "T16:00:00+05:30");
  const json = await proxyJson(`${YAHOO_PROXY_URL}?type=chart&symbol=${encodeURIComponent(symbol)}&interval=5m&period1=${from}&period2=${p1 + 86400}`, isPast ? HISTORY_TTL : LIVE_TTL);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("no data");
  const ts = result.timestamp || [];
  const q0 = result.indicators.quote[0];
  const open = Date.parse(dateISO + "T09:15:00+05:30"), close = Date.parse(dateISO + "T15:30:00+05:30");
  const all = ts.map((t, i) => ({ start: t * 1000, open: q0.open?.[i], high: q0.high?.[i], low: q0.low?.[i], close: q0.close?.[i] }))
    .filter((c) => [c.open, c.high, c.low, c.close].every((v) => typeof v === "number"));
  const candles = all.filter((c) => c.start >= open && c.start < close);
  // previous session = the last trading day before this date, regular hours only
  const before = all.filter((c) => c.start < open);
  const lastDay = before.length ? new Date(before[before.length - 1].start + 19800000).toISOString().slice(0, 10) : null;
  const prevCandles = lastDay ? before.filter((c) => {
    const ds = Date.parse(lastDay + "T09:15:00+05:30");
    return c.start >= ds && c.start < ds + 375 * 60000;
  }) : [];
  const prevClose = prevCandles.length ? prevCandles[prevCandles.length - 1].close : (result.meta?.chartPreviousClose ?? candles[0]?.open);
  return { candles, prevCandles, prevClose };
}

const REPLAY_CANDLE_MS = 5 * 60 * 1000;
const REPLAY_CHANNEL = "paperrally-replay";

// Today's date in India (YYYY-MM-DD).
const istTodayISO = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);

// Most recent completed NSE session (skips weekends and NSE holidays).
function lastTradingDayISO() {
  const istNow = new Date(Date.now() + 19800000); // IST wall clock, read with UTC getters
  let d = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
  const afterClose = istNow.getUTCHours() * 60 + istNow.getUTCMinutes() >= 15 * 60 + 30;
  if (!afterClose) d.setUTCDate(d.getUTCDate() - 1);
  for (let i = 0; i < 15; i++) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !NSE_HOLIDAYS[iso]) return iso;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function openChartPopout(dateISO, sym) {
  const url = `${window.location.origin}/#/chart?date=${encodeURIComponent(dateISO)}&sym=${encodeURIComponent(sym || "^NSEI")}`;
  const w = window.open(url, "paperrally-chart", "width=1280,height=800");
  if (w) w.focus();
  return !!w;
}
const fmtReplayTime = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Price inside a 5-minute candle at fraction f (0..1): open -> one extreme -> the other -> close,
// with a small wiggle so it feels like live ticks. Always stays within the candle's high/low.
function replayPriceInCandle(c, f) {
  const up = c.close >= c.open;
  const pts = [[0, c.open], [0.3, up ? c.low : c.high], [0.7, up ? c.high : c.low], [1, c.close]];
  let p = c.close;
  for (let i = 0; i < pts.length - 1; i++) {
    if (f <= pts[i + 1][0]) { const [f0, v0] = pts[i], [f1, v1] = pts[i + 1]; p = v0 + (v1 - v0) * ((f - f0) / (f1 - f0)); break; }
  }
  if (f > 0 && f < 1) { const r = c.high - c.low; p += Math.sin(f * 37 + c.open) * 0.08 * r + Math.sin(f * 331 + c.close) * 0.06 * r + Math.sin(f * 977) * 0.04 * r; }
  return Math.min(c.high, Math.max(c.low, p));
}

function replaySnapshot(entry, clock) {
  const hist = (entry.prevCandles || []).map((c) => ({ time: c.start, price: c.close, open: c.open, high: c.high, low: c.low, close: c.close }));
  let price = entry.candles.length ? entry.candles[0].open : entry.prevClose;
  for (const c of entry.candles) {
    if (c.start > clock) break;
    if (c.start + REPLAY_CANDLE_MS <= clock) {
      hist.push({ time: c.start, price: c.close, open: c.open, high: c.high, low: c.low, close: c.close });
      price = c.close;
    } else {
      const f = (clock - c.start) / REPLAY_CANDLE_MS;
      let h = c.open, l = c.open;
      for (let g = 0; g <= f; g += 0.05) { const v = replayPriceInCandle(c, g); h = Math.max(h, v); l = Math.min(l, v); }
      const p = replayPriceInCandle(c, f);
      h = Math.max(h, p); l = Math.min(l, p);
      hist.push({ time: c.start, price: p, open: c.open, high: h, low: l, close: p });
      price = p;
    }
  }
  return { price: +price.toFixed(2), prevClose: entry.prevClose, history: hist };
}

function aggregateCandles(hist, minutes, dayStart) {
  const size = minutes * 60000, out = [];
  hist.forEach((c) => {
    const bucket = dayStart + Math.floor((c.time - dayStart) / size) * size;
    const last = out[out.length - 1];
    if (last && last.time === bucket) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.price = c.close; }
    else out.push({ time: bucket, price: c.close, open: c.open, high: c.high, low: c.low, close: c.close });
  });
  return out;
}

async function fetchYahooRange(symbol, interval, period1, period2) {
  const json = await proxyJson(
    `${YAHOO_PROXY_URL}?type=chart&symbol=${encodeURIComponent(symbol)}&interval=${interval}&period1=${period1}&period2=${period2}`,
    period2 * 1000 < Date.now() - 60 * 60 * 1000 ? HISTORY_TTL : LIVE_TTL
  );
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("no data for this date");
  const ts = result.timestamp || [];
  const q0 = result.indicators.quote[0];
  const opens = q0.open || [], highs = q0.high || [], lows = q0.low || [], closes = q0.close || [];
  return ts
    .map((t, i) => ({ time: t * 1000, price: closes[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] }))
    .filter((p) => typeof p.price === "number" && typeof p.open === "number" && typeof p.high === "number" && typeof p.low === "number");
}

function parseYahooChart(json) {
  const result = json.chart.result[0];
  const meta = result.meta;
  const ts = result.timestamp || [];
  const q0 = result.indicators.quote[0];
  const opens = q0.open || [], highs = q0.high || [], lows = q0.low || [], closes = q0.close || [];
  const history = ts
    .map((t, i) => ({ time: t * 1000, price: closes[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] }))
    .filter((p) => typeof p.price === "number" && typeof p.open === "number" && typeof p.high === "number" && typeof p.low === "number");
  return {
    price: meta.regularMarketPrice,
    prevClose: meta.previousClose ?? meta.chartPreviousClose,
    history,
    live: true,
  };
}

const chartUrl = (symbol, interval, range) =>
  `${YAHOO_PROXY_URL}?type=chart&symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;

async function fetchYahoo(symbol, interval = "5m", range = "1d") {
  const json = await proxyJson(chartUrl(symbol, interval, range), range === "1d" || range === "5d" ? LIVE_TTL : HISTORY_TTL);
  return parseYahooChart(json);
}

// Live quotes for many symbols in as few requests as possible (type=multi on the
// proxy, up to 30 per call). Returns the same shape as Promise.allSettled over
// fetchYahoo, and quietly falls back to one-by-one if the proxy is an older version.
async function fetchYahooAll(symbols) {
  // Visitors who haven't connected a broker have no price feed: report "no price" instead of throwing.
  if (!activeBroker()) return symbols.map(() => ({ status: "rejected", reason: new Error("no broker") }));
  let prices = {};
  try { prices = (await fetchQuotes(symbols)) || {}; } catch { prices = {}; }
  return symbols.map((s) => (prices[s]?.price
    ? { status: "fulfilled", value: { price: prices[s].price, prevClose: prices[s].prevClose, history: [], live: true } }
    : { status: "rejected", reason: new Error("no price") }));
}

async function searchYahooSymbols(query) {
  const json = await proxyJson(`${YAHOO_PROXY_URL}?type=search&q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, SEARCH_TTL);
  const quotes = json.quotes || [];
  return quotes
    .filter((r) => r.symbol && r.quoteType === "EQUITY" && (r.symbol.endsWith(".NS") || r.symbol.endsWith(".BO")))
    .map((r) => ({
      symbol: r.symbol,
      name: r.longname || r.shortname || r.symbol,
      exchange: r.symbol.endsWith(".NS") ? "NSE" : "BSE",
    }));
}

async function fetchSymbolNews(query) {
  const json = await proxyJson(`${YAHOO_PROXY_URL}?type=search&q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8`, NEWS_TTL);
  const news = json.news || [];
  return news.map((n) => ({
    title: n.title,
    publisher: n.publisher,
    link: n.link,
    time: n.providerPublishTime ? new Date(n.providerPublishTime * 1000) : null,
    thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
  }));
}

const LANDING_FEATURES = [
  { icon: Activity, title: "Prices From Your Own Broker", desc: "Connect your own Angel One, FYERS or Upstox account. Prices come straight from your broker, while your trades use ₹10,00,000 of virtual cash — your real money is never touched." },
  { icon: Layers, title: "Options Chain With Real Premiums", desc: "NIFTY, BANKNIFTY and SENSEX options at their last traded premiums, with Delta, Gamma, Theta, Vega and IV on every strike and expiry." },
  { icon: TrendingDown, title: "Option Writing, With Margin", desc: "Sell calls and puts the way real writers do — premium credited, margin blocked — and see why the risk on that side is so different." },
  { icon: BarChart3, title: "Strategy Builder", desc: "Build multi-leg option strategies, see the payoff chart, place every leg at once and backtest on past index prices." },
  { icon: Play, title: "Replay Any Trading Day", desc: "Market closed? Trade a past session from its 9:15 AM open as if it were live — at night, on weekends, any time." },
  { icon: FlaskConical, title: "Rule Tester", desc: "Test an intraday rule — opening-range breakout, EMA cross, RSI bounce — on past days and see its win rate, profit and every trade in seconds." },
  { icon: LineChart, title: "Charts & 11 Indicators", desc: "Candles from 1-minute to daily with SMA, EMA, Bollinger Bands, Supertrend, RSI, MACD, Stochastic, ATR and Smart Money Concepts." },
  { icon: Crosshair, title: "Stop-Losses on Every Trade", desc: "Stop orders on stocks and an automatic stop-loss on option positions, so protecting a trade becomes a reflex, not an afterthought." },
  { icon: Bell, title: "Price Alerts", desc: "Get a notification on your phone the moment a stock crosses the price you're watching." },
  { icon: Trophy, title: "Performance, Journal & Leaderboard", desc: "Your win rate and P&L stats, a trade journal with tags, achievements, and a weekly leaderboard to measure yourself against." },
  { icon: GraduationCap, title: "Learn in Your Language", desc: "Short lessons on orders, stop-losses and options in English, हिंदी and ಕನ್ನಡ." },
  { icon: Smartphone, title: "Works on Phone & Desktop", desc: "Install it on your phone like an app, or open a pop-out chart window on desktop and trade beside it — on the same balance." },
];

const WHATS_NEW = [
  { icon: FlaskConical, title: "Rule tester: would your idea have worked?", desc: "Pick a rule like the 15-minute opening-candle breakout and test it on past days in seconds — win rate, total profit and each trade, across timeframes.", tag: "New" },
  { icon: Play, title: "Trade any time — even after hours", desc: "Market closed? Jump into the last trading session from its 9:15 AM open and trade it as if it's live. Evenings and weekends count too.", tag: "Practise now" },
  { icon: Maximize2, title: "Pop-out trading window", desc: "A big full-day chart in its own window, with shares and options — calls, puts, any expiry and strike — traded right next to it.", tag: "Shares + options" },
  { icon: Activity, title: "All 5,000+ BSE stocks", desc: "Tap BSE to browse every active BSE company, largest first, and add any of them to your watchlist in one tap.", tag: "5,123 stocks" },
  { icon: Sparkles, title: "Every feature free for 7 days", desc: "Options chain, indicators, alerts, the pop-out window — all unlocked from day one, with no upgrade prompts in your first week.", tag: "No card needed" },
];

const WHO_FOR = [
  { icon: GraduationCap, title: "Beginners", desc: "Learn what an order, a position, and a stop-loss actually feel like — before any of it involves real money." },
  { icon: Sparkles, title: "Students", desc: "Understand how markets move alongside your coursework, with ₹10,00,000 in virtual capital and nothing at stake." },
  { icon: Activity, title: "Intraday Traders", desc: "Rehearse entries and exits against moving prices during market hours." },
  { icon: LineChart, title: "Swing Traders", desc: "Plan a setup, hold it across sessions, and see how your thesis actually plays out." },
  { icon: Layers, title: "Options Traders", desc: "Work through calls, puts, and spreads with the Greeks in view before risking real premium." },
  { icon: UserIcon, title: "Experienced Traders", desc: "Test a new idea or timeframe without touching your real-money account while you validate it." },
];

const MISTAKES = [
  {
    title: "Entering too early, or chasing a move",
    real: "With real money, a rushed entry costs you the moment you click buy.",
    practice: "In Replay, you can rehearse the same setup candle-by-candle against real past price action — as many times as it takes.",
  },
  {
    title: "Ignoring the stop-loss",
    real: "One skipped stop-loss can undo weeks of careful, disciplined trades.",
    practice: "Practice placing and honoring stop and limit orders here first, until it's a habit rather than an afterthought.",
  },
  {
    title: "Sizing a position too large",
    real: "An oversized trade turns a small misjudgment into a large loss.",
    practice: "₹10,00,000 in virtual capital lets you feel the real consequence of position sizing, without the real cost.",
  },
];

const CANDLE_BASICS = [
  { icon: TrendingUp, title: "Green candle = bullish", desc: "The close was higher than the open — buyers were in control during that period." },
  { icon: TrendingDown, title: "Red candle = bearish", desc: "The close was lower than the open — sellers pushed the price down during that period." },
  { icon: Activity, title: "Wicks show the extremes", desc: "The thin lines above and below the body mark the highest and lowest price traded in that period — the body itself just shows open vs. close." },
  { icon: LineChart, title: "One candle = one timeframe", desc: "Switch between 1m, 5m, 15m, 1H, and 1D — each candle then represents that much time, from a minute to a full trading day." },
];

const HOW_STEPS = [
  { n: "1", title: "Open a free account", desc: "A username and mobile number, or Google. You're in with ₹10,00,000 of practice money in about a minute." },
  { n: "2", title: "Make your first trade", desc: "Buy a stock from the watchlist, or open NIFTY's options chain and pick a strike. Set the stop-loss before you click." },
  { n: "3", title: "Review, then repeat", desc: "History records every exit and its realised P&L. Spot the habits that cost you, fix one, and trade again — or rerun a past day in Replay." },
];

const GUIDE_LINKS = [
  { label: "How to use PaperRally", url: "/how-to-use.html" },
  { label: "Paper trading in India", url: "/paper-trading-india.html" },
  { label: "How to read an options chain", url: "/how-to-read-options-chain.html" },
];

const LEARN_LINKS = [
  { label: "NSE India (official)", url: "https://www.nseindia.com" },
  { label: "NSE: Candlestick & Chart Reading Module", url: "https://www.nseindia.com/static/learn/self-study-ncfm-modules-intermediate-technical-analysis-module" },
  { label: "BSE India (official)", url: "https://www.bseindia.com" },
  { label: "SEBI Investor Education", url: "https://investor.sebi.gov.in" },
];

const FAQ_ITEMS = [
  { q: "Is the money on PaperRally real?", a: "No. Every account starts with ₹10,00,000 in virtual cash. Trades, profits, and losses are simulated and have no monetary value." },
  { q: "How current are the prices?", a: "PaperRally uses a public market data feed, so prices can lag the exchange. BSE prices are typically about 15 minutes behind. Use them for practice, not for real trading decisions." },
  { q: "Do I need a broker or demat account?", a: "Yes, an Angel One account. PaperRally isn't a broker: you connect your own Angel One account so prices come straight from your broker, then trade with ₹10,00,000 of virtual cash. No real order is ever placed and your real money is never touched. No Angel One account yet? Opening one is free." },
  { q: "What is Replay Mode?", a: "Pick any weekday from the last 30 days and PaperRally replays that day's real price action candle by candle, with its own separate ₹10,00,000 balance — so practicing in Replay never touches your main portfolio." },
  { q: "Do option prices match the exchange exactly?", a: "Not exactly. Premiums are worked out from the index or stock price with the Black-Scholes model, so they move realistically with the market but won't tick-for-tick match NSE's option quotes." },
  { q: "Is PaperRally free?", a: "Every new account gets a full 7-day Pro trial, no card required. After that, core paper trading stays free — Pro features like the options chain, alerts, and CSV export need an active subscription." },
];

// A small decorative candlestick strip — static, on-brand, ties directly to
// the product itself rather than generic hero art.
function HeroCandles() {
  const candles = [
    { h: 38, o: 60, bull: true }, { h: 55, o: 30, bull: false }, { h: 25, o: 48, bull: true },
    { h: 62, o: 40, bull: true }, { h: 34, o: 58, bull: false }, { h: 48, o: 20, bull: true },
    { h: 20, o: 44, bull: false }, { h: 56, o: 36, bull: true }, { h: 30, o: 52, bull: false },
    { h: 44, o: 24, bull: true },
  ];
  return (
    <svg viewBox="0 0 300 90" className="heroCandles" aria-hidden="true">
      {candles.map((c, i) => {
        const x = i * 30 + 8;
        const top = Math.min(c.h, c.o);
        const height = Math.abs(c.h - c.o) || 2;
        const color = c.bull ? "var(--bull)" : "var(--bear)";
        return (
          <g key={i} style={{ animation: `candleIn 0.5s ease ${i * 0.05}s both` }}>
            <line x1={x + 7} y1={top - 8} x2={x + 7} y2={top + height + 8} stroke={color} strokeWidth="1.5" opacity="0.55" />
            <rect x={x} y={top} width="14" height={height} rx="2" fill={color} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

// ---- Live landing-page components ----------------------------------------
// These reuse the same fetchYahoo() feed as the trading terminal itself, so
// the landing page shows genuinely live NSE/BSE data before anyone logs in.

function LiveTicker() {
  const symbols = ["^NSEI", "^NSEBANK", "^BSESN", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS"];
  const [rows, setRows] = useState(() => symbols.map((s) => ({ symbol: s, price: null, prevClose: null })));

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const results = await fetchYahooAll(symbols);
      if (cancelled) return;
      setRows(
        symbols.map((s, i) => {
          const r = results[i];
          return r.status === "fulfilled"
            ? { symbol: s, price: r.value.price, prevClose: r.value.prevClose }
            : { symbol: s, price: null, prevClose: null };
        })
      );
    };
    pull();
    const stop = visibleInterval(pull, 20000);
    return () => { cancelled = true; stop(); };
  }, []);

  const valid = rows.filter((r) => r.price != null);
  if (valid.length === 0) return null;
  const doubled = [...valid, ...valid]; // duplicated once so the scroll loop is seamless

  return (
    <div className="tickerTapeWrap">
      <div className="tickerTape">
        {doubled.map((r, i) => {
          const chg = r.prevClose ? ((r.price - r.prevClose) / r.prevClose) * 100 : 0;
          const up = chg >= 0;
          return (
            <span key={i} className="tickerItem mono">
              <b>{displayTicker(r.symbol)}</b> {r.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              <span className={up ? "bull" : "bear"}> {up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Live "Leaders & Laggards" strip for the landing page — ranks the NSE
// stocks available on PaperRally by today's % change using the same feed.
const MOVERS_SYMBOLS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "SBIN.NS", "ITC.NS", "BHARTIARTL.NS"];

function MoversStrip() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const results = await fetchYahooAll(MOVERS_SYMBOLS);
      if (cancelled) return;
      const next = MOVERS_SYMBOLS.map((s, i) => {
        const r = results[i];
        if (r.status !== "fulfilled" || r.value.price == null || !r.value.prevClose) return null;
        const chg = ((r.value.price - r.value.prevClose) / r.value.prevClose) * 100;
        return { symbol: s, price: r.value.price, chg };
      }).filter(Boolean);
      setRows(next);
    };
    pull();
    const stop = visibleInterval(pull, 30000);
    return () => { cancelled = true; stop(); };
  }, []);

  if (rows.length < 2) return null;

  const sorted = [...rows].sort((a, b) => b.chg - a.chg);
  const leaders = sorted.slice(0, 4);
  const laggards = sorted.slice(-4).reverse();

  const MoverRow = ({ r }) => (
    <div className="moverRow">
      <span className="mono moverSym">{displayTicker(r.symbol)}</span>
      <span className="mono moverPrice dim">{fmtMoney(r.price)}</span>
      <span className={`mono moverChg ${r.chg >= 0 ? "bull" : "bear"}`}>{fmtPct(r.chg)}</span>
    </div>
  );

  return (
    <section className="landingMovers">
      <h2 className="landingH2">Who's Leading, Who's Lagging Right Now</h2>
      <p className="dim mistakesIntro">NSE movers among the stocks you can trade on PaperRally — refreshes automatically.</p>
      <div className="moversGrid">
        <div className="moversCol moversColUp">
          <h3 className="moversColTitle bull"><TrendingUp size={14} /> Leading</h3>
          {leaders.map((r) => <MoverRow key={r.symbol} r={r} />)}
        </div>
        <div className="moversCol moversColDown">
          <h3 className="moversColTitle bear"><TrendingDown size={14} /> Lagging</h3>
          {laggards.map((r) => <MoverRow key={r.symbol} r={r} />)}
        </div>
      </div>
    </section>
  );
}

function LiveHeroPrice() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetchYahoo("RELIANCE.NS");
        if (!cancelled) setQ(r);
      } catch { /* keep showing last known value on a transient failure */ }
    };
    pull();
    const stop = visibleInterval(pull, 8000);
    return () => { cancelled = true; stop(); };
  }, []);
  if (!q) return null;
  const chg = q.prevClose ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
  const up = chg >= 0;
  return (
    <div className="heroLivePrice mono">
      <span className="heroLiveDot" />
      RELIANCE <span className="heroLivePriceVal">{fmtMoney(q.price)}</span>
      <span className={up ? "bull" : "bear"}>{up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%</span>
    </div>
  );
}

function MiniHeroChartImpl() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = LW.createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 90,
      layout: { background: { color: "transparent" }, textColor: "transparent", attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
    });
    const series = chart.addSeries(LW.CandlestickSeries, {
      upColor: "#14E8A0", downColor: "#FF5470", borderVisible: false,
      wickUpColor: "#14E8A0", wickDownColor: "#FF5470",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => { if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.remove(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetchYahoo("RELIANCE.NS", "5m", "1d");
        if (cancelled || !seriesRef.current) return;
        const source = r.history.length ? r.history : genSyntheticHistory(r.price || 1300, 40, 5 * 60 * 1000);
        const prepped = prepLW(source);
        seriesRef.current.setData(prepped.map(({ t, d }) => ({ time: t, open: d.open, high: d.high, low: d.low, close: d.close })));
        chartRef.current?.timeScale().fitContent();
      } catch { /* keep last rendered candles on a transient fetch failure */ }
    };
    load();
    const stop = visibleInterval(load, 20000);
    return () => { cancelled = true; stop(); };
  }, []);

  return <div ref={containerRef} className="miniHeroChart" />;
}

// Draggable time-of-day scale for Replay: 9:15 → 3:30 with hour ticks. Times after the latest
// available candle (today's session still in progress) are shaded and can't be selected.
function ReplayTimeline({ dayStart, dayEnd, dataEnd, clock, onSeek, onScrubStart }) {
  const trackRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [dragging, setDragging] = useState(false);
  const span = dayEnd - dayStart;
  const pct = (t) => ((t - dayStart) / span) * 100;
  const fmt = (t) => new Date(t).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
  const timeAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const t = dayStart + Math.round((f * span) / 60000) * 60000;
    return Math.min(t, dataEnd);
  };
  const ticks = [dayStart];
  for (let h = 10; h <= 15; h++) ticks.push(dayStart + ((h * 60) - (9 * 60 + 15)) * 60000);
  ticks.push(dayEnd);
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => { const x = e.touches ? e.touches[0].clientX : e.clientX; onSeek(timeAt(x)); };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move); window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("mouseup", up); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("touchmove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, [dragging, dataEnd]);
  const start = (e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    onScrubStart(); onSeek(timeAt(x)); setDragging(true);
  };
  const onKey = (e) => {
    const step = e.shiftKey ? 15 * 60000 : 60000;
    if (e.key === "ArrowLeft") { e.preventDefault(); onSeek(Math.max(dayStart, clock - step)); }
    if (e.key === "ArrowRight") { e.preventDefault(); onSeek(Math.min(dataEnd, clock + step)); }
  };
  return (
    <div className="rtl">
      <div
        className={`rtlTrack ${dragging ? "rtlDragging" : ""}`}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Replay time of day"
        aria-valuemin={dayStart}
        aria-valuemax={dataEnd}
        aria-valuenow={clock}
        aria-valuetext={fmt(clock)}
        onMouseDown={start}
        onTouchStart={start}
        onKeyDown={onKey}
        onMouseMove={(e) => setHover(timeAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
      >
        <div className="rtlRail" />
        <div className="rtlPlayed" style={{ width: `${pct(clock)}%` }} />
        {dataEnd < dayEnd && <div className="rtlFuture" style={{ left: `${pct(dataEnd)}%` }} title="Not traded yet today" />}
        {ticks.map((t) => <div key={t} className="rtlTick" style={{ left: `${pct(t)}%` }} />)}
        {hover != null && !dragging && <div className="rtlHover mono" style={{ left: `${pct(hover)}%` }}>{fmt(hover)}</div>}
        <div className="rtlThumb" style={{ left: `${pct(clock)}%` }}>
          <span className="rtlThumbLabel mono">{fmt(clock)}</span>
        </div>
      </div>
      <div className="rtlLabels">
        {ticks.map((t) => (
          <button key={t} className="rtlLabel mono" style={{ left: `${pct(t)}%` }} disabled={t > dataEnd} onClick={() => { onScrubStart(); onSeek(Math.min(t, dataEnd)); }}>{fmt(t)}</button>
        ))}
      </div>
    </div>
  );
}

function ReplaySpotlight() {
  const candles = useMemo(() => {
    let price = 1300;
    return Array.from({ length: 18 }, () => {
      const open = price;
      const close = open + (Math.random() - 0.45) * 10;
      const high = Math.max(open, close) + Math.random() * 4;
      const low = Math.min(open, close) - Math.random() * 4;
      price = close;
      return { open, close, high, low };
    });
  }, []);
  const [visible, setVisible] = useState(6);
  useEffect(() => {
    const iv = setInterval(() => {
      setVisible((v) => (v >= candles.length ? 6 : v + 1));
    }, 500);
    return () => clearInterval(iv);
  }, [candles.length]);

  const w = 320, h = 120, cw = w / candles.length;
  const allVals = candles.flatMap((c) => [c.high, c.low]);
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const y = (v) => h - ((v - min) / (max - min)) * h;

  return (
    <div className="replayVisual">
      <svg viewBox={`0 0 ${w} ${h}`} className="replaySvg">
        {candles.slice(0, visible).map((c, i) => {
          const x = i * cw + cw / 2;
          const up = c.close >= c.open;
          const color = up ? "#14E8A0" : "#FF5470";
          const top = y(Math.max(c.open, c.close));
          const bodyH = Math.max(2, Math.abs(y(c.open) - y(c.close)));
          return (
            <g key={i}>
              <line x1={x} y1={y(c.high)} x2={x} y2={y(c.low)} stroke={color} strokeWidth="1" opacity="0.6" />
              <rect x={x - cw * 0.28} y={top} width={cw * 0.56} height={bodyH} fill={color} rx="1" />
            </g>
          );
        })}
      </svg>
      <div className="replayPlayBadge"><Play size={12} fill="currentColor" /> Replaying</div>
    </div>
  );
}

// "N traders practised this week" — shown only once the number is worth showing.
function LiveTradersCount() {
  const [n, setN] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("active_traders_this_week").then(({ data, error }) => { if (!cancelled && !error && typeof data === "number") setN(data); }, () => {});
    return () => { cancelled = true; };
  }, []);
  if (n == null || n < 25) return null;
  return <div className="liveCount heroReveal heroReveal-3"><span className="liveCountDot" /> {n.toLocaleString("en-IN")} traders practised on PaperRally this week</div>;
}

const PRO_FEATURES = ["Limit & stop-loss orders", "RSI, MACD and every chart timeframe", "Options chain with Greeks", "Strategy builder, payoff charts & backtest", "Target orders", "Search & add any NSE/BSE stock", "Price alerts with phone notifications", "News tab", "Trade history CSV export"];
const FREE_FEATURES = ["₹10,00,000 virtual cash", "NSE & BSE market prices", "Market orders & positions", "Replay any recent trading day", "Performance stats, journal & leaderboard", "Learn section (English, हिंदी, ಕನ್ನಡ)"];

function LandingPage({ themeIdx, onEnter: onEnterRaw }) {
  const install = useInstallPrompt();
  const isPhone = useIsMobile(760);
  const [installHelp, setInstallHelp] = useState(false);
  const landingInstall = () => {
    if (install.canInstall) install.promptInstall().then((r) => track("install_prompt", { result: r, from: "landing" }));
    else { setInstallHelp(true); track("install_help", { platform: install.platform, from: "landing" }); }
  };
  const showInstall = !install.standalone && (install.canInstall || isPhone || install.platform !== "desktop");
  const onEnter = (mode) => { track(mode === "register" ? "signup_start" : "login_start"); onEnterRaw(mode); };
  useEffect(() => { track("landing_view", { ref: !!new URLSearchParams(window.location.search).get("ref") }); }, []);
  const [marketNow] = useState(() => getMarketStatus());
  const [lang, setLangState] = useState(() => loadLang());
  const setLang = (code) => { setLangState(code); saveLang(code); };
  const L = LEARN[lang] || LEARN.en;
  // The Guides dropdown is a <details> element, which only closes when its own summary is
  // clicked. Close it on any click/tap outside it, on Escape, or after picking a link.
  const guidesRef = useRef(null);
  useEffect(() => {
    const close = () => { if (guidesRef.current?.open) guidesRef.current.open = false; };
    const onPointer = (e) => { if (guidesRef.current && !guidesRef.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape" && guidesRef.current?.open) { close(); guidesRef.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    const els = document.querySelectorAll(".landingFeatureCard, .landingTrial, .whoForCard, .replaySpotlight, .mistakeRow, .faqItem, .newCard");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("revealed"); }),
      { threshold: 0.15 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="landingWrap" style={THEMES[0].vars /* landing is always on the dark-blue background, so always use the dark palette */}>
      <style>{CSS}</style>

      <LiveTicker />
      {installHelp && <InstallHelp platform={install.platform} onClose={() => setInstallHelp(false)} />}

      <header className="landingNav">
        <div className="authBrand" style={{ justifyContent: "flex-start" }}>
          <Flame size={22} className="brandIcon" />
          <span>PAPERRALLY</span>
        </div>
        <nav className="landingMenu" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#new">What's new</a>
          <a href="#how-it-works">How it works</a>
          <a href="#replay">Replay</a>
          <details className="landingMenuDrop" ref={guidesRef}>
            <summary>Guides</summary>
            <div className="landingMenuPanel" onClick={() => { if (guidesRef.current) guidesRef.current.open = false; }}>
              <a href="/how-to-use.html">How to use PaperRally</a>
              <a href="/paper-trading-india.html">Paper trading in India</a>
              <a href="/how-to-read-options-chain.html">How to read an options chain</a>
              <a href="/how-to-set-stop-loss.html">How to set a stop-loss</a>
              <a href="/nifty-options-for-beginners.html">NIFTY options for beginners</a>
              <a href="/guides.html" className="landingMenuAll">All guides →</a>
            </div>
          </details>
          <a href="#faq">FAQ</a>
          <a href="/contact.html">Contact</a>
        </nav>
        <div className="landingNavActions">
          <button className="btn btnGhost landingNavBtn" onClick={() => onEnter("login")}>Log In</button>
          <button className="btn btnBull landingNavBtn" onClick={() => onEnter("register")}>Get Started Free</button>
        </div>
      </header>

      <section className="landingHero">
        <div className="landingHeroCopy">
          <div className="landingEyebrow heroReveal heroReveal-1">Free to use · every feature free for your first 7 days</div>
          <h1 className="landingH1 heroReveal heroReveal-2">Practice trading NSE &amp; BSE with <span className="landingGradientText">real prices</span>. Zero risk.</h1>
          <p className="landingSub heroReveal heroReveal-3">
            PaperRally is a paper trading terminal for Indian stocks, options, and indices. Trade with
            ₹10,00,000 in virtual cash with NSE &amp; BSE market prices — build real skill before you risk real money.
            Practise any time: during market hours live, and after hours, at night or on weekends by replaying a real trading day.
          </p>
          <div className="heroTrust heroReveal heroReveal-3">
            <span>Practise any time, 24×7</span><span>Use your own Angel One, FYERS or Upstox account</span><span>Your real money is never touched</span>
          </div>
          <LiveTradersCount />
          {!marketNow.isOpen && (
            <div className="heroClosedNote heroReveal heroReveal-3">
              <span className="heroClosedDot" /> <b>Market's closed right now — you can still trade.</b> Sign up and practise the last session from its 9:15 AM open right now.
            </div>
          )}
          <div className="landingHeroBtns heroReveal heroReveal-4">
            <button className="btn btnBull landingCta" onClick={() => onEnter("register")}><Sparkles size={15} /> Get Started Free</button>
            <button className="btn btnGhost landingCta" onClick={() => onEnter("login")}>Log In</button>
          </div>
          {showInstall && (
            <button type="button" className="heroInstall heroReveal heroReveal-4" onClick={landingInstall}>
              <Smartphone size={15} /> Install the app on your phone
            </button>
          )}
          <div className="heroReveal heroReveal-5">
            <MiniHeroChart />
          </div>
        </div>
        <div className="landingHeroCard heroReveal heroReveal-3">
          <div className="authBrand">
            <Flame size={20} className="brandIcon" />
            <span>PAPERRALLY</span>
          </div>
          <div className="authSub">Start trading in under a minute</div>
          <LiveHeroPrice />
          <div className="heroInside">
            <div className="heroInsideHead">Inside PaperRally</div>
            <ul className="heroInsideList">
              {LANDING_FEATURES.slice(0, 8).map((f) => (
                <li key={f.title}><span className="heroInsideIcon"><f.icon size={14} /></span>{f.title}</li>
              ))}
            </ul>
            <a href="#features" className="heroInsideMore">See all {LANDING_FEATURES.length} features →</a>
          </div>
          <button className="btn btnBull authSubmit" onClick={() => onEnter("register")}>Create free account</button>
        </div>
      </section>

      <section className="landingStats">
        <div className="landingStatItem">
          <span className="landingStatNum">₹10,00,000</span>
          <span className="landingStatLabel">Virtual starting cash</span>
        </div>
        <div className="landingStatDivider" />
        <div className="landingStatItem">
          <span className="landingStatNum">NSE + BSE</span>
          <span className="landingStatLabel">Market data</span>
        </div>
        <div className="landingStatDivider" />
        <div className="landingStatItem">
          <span className="landingStatNum">5,000+</span>
          <span className="landingStatLabel">NSE &amp; BSE stocks to trade</span>
        </div>
        <div className="landingStatDivider" />
        <div className="landingStatItem">
          <span className="landingStatNum">7 Days</span>
          <span className="landingStatLabel">Every feature free</span>
        </div>
      </section>

      <section className="landingFeatures" id="features">
        <div className="landingFeatHead">
          <div className="landingEyebrow">Features</div>
          <h2 className="landingH2">Everything you need to practise like a real trader</h2>
          <p className="landingFeatSub dim">One terminal for stocks, options and indices — with your broker’s prices and none of your money at risk.</p>
        </div>
        <div className="landingFeatureGrid">
          {LANDING_FEATURES.map((f, i) => {
            const color = ALLOC_PALETTE[i % ALLOC_PALETTE.length];
            return (
              <div key={f.title} className="landingFeatureCard" style={{ borderTopColor: color }}>
                <div className="landingFeatureIcon" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}><f.icon size={18} /></div>
                <h3>{f.title}</h3>
                <p className="dim">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="whatsNew" id="new">
        <div className="landingEyebrow whatsNewEyebrow">New on PaperRally</div>
        <h2 className="landingH2">Practise whenever you want, on whatever you want</h2>
        <div className="newGrid">
          {WHATS_NEW.map((f) => (
            <div key={f.title} className="newCard">
              <div className="newCardTop">
                <div className="newIcon"><f.icon size={18} /></div>
                <span className="newTag">{f.tag}</span>
              </div>
              <h3>{f.title}</h3>
              <p className="dim">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="whatsNewCta">
          <button className="btn btnBull landingCta" onClick={() => onEnter("register")}><Sparkles size={15} /> Try it free — takes a minute</button>
        </div>
      </section>

      <section className="realityBand">
        <div className="realityNum" aria-hidden="true">🏹</div>
        <div className="realityCopy">
          <h2>Arjuna's secret wasn't talent. It was practice.</h2>
          <p className="dim">Practise in the dark here — ₹0 at risk — so you strike true when it's real.</p>
        </div>
      </section>

      <MoversStrip />

      <section className="landingWhoFor">
        <h2 className="landingH2">Wherever You Are in Your Trading Journey</h2>
        <div className="whoForGrid">
          {WHO_FOR.map((w) => (
            <div key={w.title} className="whoForCard">
              <div className="whoForIcon"><w.icon size={17} /></div>
              <h3>{w.title}</h3>
              <p className="dim">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="replaySpotlight" id="replay">
        <div className="replaySpotlightCopy">
          <div className="landingEyebrow">REPLAY MODE</div>
          <h2 className="landingH2" style={{ textAlign: "left", margin: "0 0 14px" }}>Practice Against a Real Day, Not a Guess.</h2>
          <p className="dim replaySpotlightText">
            Pick any weekday from the last 30 days and PaperRally replays that day's real NSE &amp; BSE price
            action candle by candle — as if it were happening live. Start from the 9:15 AM open, play at 1x, 5x, 30x or 60x,
            drag the timeline to any minute, and trade against it with a separate ₹10,00,000 balance that never touches your main portfolio.
          </p>
          <ul className="upgradeList">
            <li>Market closed? One tap replays the last session — evenings and weekends included</li>
            <li>Play, pause, jump ±15 min, or drag to any time — at 1x to 60x speed</li>
            <li>A fully separate practice balance — your real portfolio is untouched</li>
          </ul>
        </div>
        <ReplaySpotlight />
      </section>


      <section className="demoSection" id="demo">
        <div className="demoCopy">
          <h2 className="landingH2" style={{ textAlign: "left", margin: "0 0 12px" }}>See PaperRally in 36 seconds</h2>
          <p className="dim">Virtual capital, market prices, options with Greeks, replay of any recent day, the pop-out trading window and more — in one quick tour.</p>
          <button className="btn btnBull landingCta" onClick={() => onEnter("register")}><Sparkles size={15} /> Try it yourself — free</button>
        </div>
        <div className="demoPhone">
          <video
            className="demoVideo"
            src="/media/paperrally-demo.mp4"
            poster="/media/paperrally-demo-poster.jpg"
            controls
            playsInline
            preload="none"
            onPlay={() => track("demo_play")}
            aria-label="36-second demo video of the PaperRally app"
          />
        </div>
      </section>

      <section className="howSteps" id="how-it-works">
        <LangSwitch lang={lang} onChange={setLang} className="landingLangSwitch" />
        <h2 className="landingH2">{L.howTitle}</h2>
        <div className="howStepsRow">
          {HOW_STEPS.map((st, i) => (
            <div key={st.n} className="howStep whoForCard">
              <span className="howStepNum">{st.n}</span>
              <h3>{L.howSteps[i].title}</h3>
              <p className="dim">{L.howSteps[i].desc}</p>
            </div>
          ))}
        </div>
        <a className="howStepsLink" href="/how-to-use.html">Read the full step-by-step guide →</a>
      </section>

      <section className="mistakesSection">
        <h2 className="landingH2">{L.mistakesTitle}</h2>
        <p className="dim mistakesIntro">{L.mistakesIntro}</p>
        <div className="mistakesList">
          {L.mistakes.map((m, i) => (
            <div key={i} className="mistakeRow">
              <h3>{m.title}</h3>
              <div className="mistakeCols">
                <div className="mistakeCol mistakeColReal">
                  <span className="mistakeColLabel bear">{L.realLabel}</span>
                  <p className="dim">{m.real}</p>
                </div>
                <div className="mistakeCol mistakeColPractice">
                  <span className="mistakeColLabel bull">{L.practiceLabel}</span>
                  <p className="dim">{m.practice}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landingLearn">
        <LangSwitch lang={lang} onChange={setLang} className="landingLangSwitch" />
        <h2 className="landingH2">{L.chartsTitle}</h2>
        <p className="dim mistakesIntro">{L.chartsIntro}</p>
        <div className="whoForGrid">
          {CANDLE_BASICS.map((c, i) => (
            <div key={c.title} className="whoForCard">
              <div className="whoForIcon"><c.icon size={17} /></div>
              <h3>{L.candles[i].title}</h3>
              <p className="dim">{L.candles[i].desc}</p>
            </div>
          ))}
        </div>
        <div className="learnLinks">
          {GUIDE_LINKS.map((l) => (
            <a key={l.url} href={l.url} className="btn btnBull landingCta learnLinkBtn">{l.label} →</a>
          ))}
        </div>
        <div className="learnLinks" style={{ marginTop: "12px" }}>
          {LEARN_LINKS.map((l) => (
            <a key={l.url} href={l.url} className="btn btnGhost landingCta learnLinkBtn">{l.label} →</a>
          ))}
        </div>
      </section>

      <section className="pricingSection" id="pricing">
        <h2 className="landingH2">Simple pricing</h2>
        <p className="dim mistakesIntro">Everything is free for your first 7 days. After that, keep paper trading free — or unlock Pro.</p>
        <div className="pricingGrid">
          <div className="priceCard">
            <div className="priceName">Free</div>
            <div className="priceAmt">₹0<span>/forever</span></div>
            <ul>{FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn btnGhost landingCta" onClick={() => onEnter("register")}>Start free</button>
          </div>
          <div className="priceCard priceCardPro">
            <div className="priceBadge">First 7 days free</div>
            <div className="priceName">Pro</div>
            <div className="priceAmt">₹99<span>/month</span></div>
            <ul><li><b>Everything in Free, plus:</b></li>{PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}</ul>
            <button className="btn btnMarigold landingCta" onClick={() => onEnter("register")}>Try Pro free for 7 days</button>
            <div className="dim priceFine">No card needed for the trial. Pay by UPI or card via Razorpay when you upgrade. No auto-renewal.</div>
          </div>
        </div>
      </section>

      <section className="landingFaq" id="faq">
        <h2 className="landingH2">Questions? Here's What People Usually Ask.</h2>
        <div className="faqList">
          {FAQ_ITEMS.map((f) => (
            <div key={f.q} className="faqItem">
              <h3>{f.q}</h3>
              <p className="dim">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landingTrial">
        <Sparkles size={22} className="proBadgeIcon" />
        <h2 className="landingH2">Every feature free for your first 7 days</h2>
        <p className="dim landingTrialSub">Options chain, RSI &amp; MACD, price alerts, every chart timeframe, the pop-out trading window and all 5,000+ BSE stocks — no card required.</p>
        <button className="btn btnMarigold landingCta" onClick={() => onEnter("register")}>Start your free trial</button>
      </section>

      <footer className="landingFooter">
        <div className="authBrand" style={{ justifyContent: "flex-start", fontSize: "13px" }}>
          <Flame size={16} className="brandIcon" />
          <span>PAPERRALLY</span>
        </div>
        <div className="landingFooterLinks">
          <a href="/how-to-use.html">How to use</a>
          <a href="/paper-trading-india.html">Paper trading in India</a>
          <a href="/how-to-read-options-chain.html">How to read an options chain</a>
          <a href="/guides.html">All guides</a>
          <a href="/contact.html">Contact</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
          <a href="/refund.html">Refunds</a>
          <a href="/disclaimer.html">Disclaimer</a>
          {showInstall && (
            <a href="#install" className="footerInstall" onClick={(e) => { e.preventDefault(); landingInstall(); }}>
              <Smartphone size={15} /> Install app
            </a>
          )}
        </div>
        <div className="dim landingFooterNote">For education purposes only. PaperRally is a simulator for learning. No real money or securities are ever traded, virtual balances have no cash value, and nothing here is investment advice. PaperRally is not registered with SEBI and is not a broker.</div>
      </footer>
    </div>
  );
}

function AuthGate({ themeIdx, cycleTheme, initialMode, onBack }) {
  const [mode, setMode] = useState(initialMode || "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const normalizedPhone = () => normalizePhoneInput(phone);

  const handleGoogle = async () => {
    setError("");
    setGoogleBusy(true);
    const { error: googleError } = await signInWithGoogle();
    if (googleError) {
      setError(googleError.message || "Could not start Google sign-in.");
      setGoogleBusy(false);
    }
    // On success, the browser redirects away to Google, so there's nothing
    // further to do here — App() picks up the session on return.
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const uname = username.trim();
    if (!uname || !password) return setError("Enter a username and password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(uname)) return setError("Username can only use letters, numbers, and underscores.");

    if (mode === "register") {
      const phoneErr = phoneInputError(normalizedPhone());
      if (phoneErr) return setError(phoneErr);
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const { data: signUpData, error: signUpError } = await signUpUser(uname, password);
        if (signUpError) {
          if (/registered/i.test(signUpError.message)) setError("That username is already taken.");
          else if (/fetch|network/i.test(signUpError.message)) setError("Couldn't reach the server — check your internet connection and try again.");
          else { console.error("sign-up failed", signUpError); setError("Could not create your account. Please try again."); }
          return;
        }
        const newUserId = signUpData?.user?.id;
        if (newUserId) {
          const { error: phoneErr } = await supabase
            .from("phone_registry")
            .insert({ phone: normalizedPhone(), user_id: newUserId });
          if (phoneErr) {
            if (phoneErr.code === "23505") {
              setError("This phone number is already linked to a PaperRally account. Please log in with your original account instead.");
            } else {
              setError("Could not complete registration. Try again.");
            }
            await signOutUser();
            return;
          }
        }
        // Success — session is already active, App() will pick it up.
      } else {
        const { error: signInError } = await signInUser(uname, password);
        if (signInError) {
          if (/confirm/i.test(signInError.message)) {
            // Server-side config issue (email confirmation switched on) — not something the user can fix.
            console.error("Supabase sign-in blocked: 'Confirm email' is enabled in Auth settings", signInError);
            setError("Something went wrong signing you in. Please try again in a minute, or use Continue with Google.");
          } else if (/fetch|network/i.test(signInError.message)) {
            setError("Couldn't reach the server — check your internet connection and try again.");
          } else {
            setError("Invalid username or password.");
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>
      <button type="button" className="themeBtn authThemeBtn" onClick={cycleTheme} title="Change background theme">
        <span className="themeEmoji">{THEMES[themeIdx].emoji}</span> {THEMES[themeIdx].name}
      </button>
      {onBack && (
        <button type="button" className="authBackBtn" onClick={onBack}>← Back to home</button>
      )}
      <div className="authCard">
        <div className="authBrand">
          <Flame size={22} className="brandIcon" />
          <span>PAPERRALLY</span>
        </div>
        <div className="authSub">Paper trading terminal &middot; NSE &amp; BSE</div>

        <button
          type="button"
          className="btn btnGhost authGoogleBtn"
          onClick={handleGoogle}
          disabled={googleBusy}
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C33.9 5.4 29.2 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.3-.3-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.8 18.9 12.5 24 12.5c3.1 0 5.8 1.1 8 3l6-6C33.9 5.4 29.2 3.5 24 3.5c-7.6 0-14.1 4.3-17.7 10.6z"/>
            <path fill="#4CAF50" d="M24 44.5c5.1 0 9.8-1.9 13.4-5.1l-6.2-5.2c-2 1.4-4.6 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.8 40.1 16.3 44.5 24 44.5z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36 44.5 30.6 44.5 24c0-1.2-.1-2.3-.3-3.5z"/>
          </svg>
          {googleBusy ? "Redirecting…" : "Continue with Google"}
        </button>
        <div className="authGoogleNote">Recommended — Google keeps your account safe and you can never get locked out.</div>

        <div className="authDivider"><span>or</span></div>

        <div className="authTabs">
          <button className={`authTab ${mode === "login" ? "authTabActive" : ""}`} onClick={() => { setMode("login"); setError(""); }}>Log In</button>
          <button className={`authTab ${mode === "register" ? "authTabActive" : ""}`} onClick={() => { setMode("register"); setError(""); }}>Register</button>
        </div>

        <form onSubmit={submit}>
          <div className="authField">
            <UserIcon size={14} className="authIcon" />
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          {mode === "register" && (
            <div className="authField">
              <Phone size={14} className="authIcon" />
              <input placeholder="Mobile number (e.g. 9876543210)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            </div>
          )}
          {mode === "register" && (
            <div className="authNote phonePrivacyNote">No OTP, calls or SMS, and we never sell your number — it just makes sure each person gets one free trial.</div>
          )}
          <div className="authField">
            <Lock size={14} className="authIcon" />
            <input type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0 }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {mode === "login" && (
            <button type="button" className="authForgotLink" onClick={() => setForgotOpen((v) => !v)} aria-expanded={forgotOpen}>
              Forgot password?
            </button>
          )}
          {mode === "login" && forgotOpen && (
            <div className="authForgot" role="region" aria-label="Reset your password">
              <div className="authForgotTitle"><KeyRound size={14} /> Can't log in?</div>
              <ol>
                <li><b>Signed up with Google?</b> Use <i>Continue with Google</i> above — there's no password to remember.</li>
                <li><b>Signed up with a username?</b> Email us from your phone with your username and registered mobile number. We'll reset your password, usually within a day.</li>
              </ol>
              <a
                className="btn btnGhost authForgotBtn"
                href={mailtoSupport(
                  "PaperRally password reset",
                  `Hi, I can't log in to PaperRally.\n\nUsername: ${username.trim() || "(your username)"}\nRegistered mobile number: \n\nPlease reset my password.`
                )}
              >
                <Mail size={14} /> Email support to reset password
              </a>
            </div>
          )}
          {error && <div className="authError">{error}</div>}
          <button type="submit" className="btn btnBull authSubmit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}</button>
        </form>

        <div className="authNote">
          {mode === "register"
            ? "One PaperRally account per mobile number."
            : "Your account and portfolio are saved on the server — log in with the same username and password on any device to pick up right where you left off."}
        </div>
      </div>
    </div>
  );
}

function PhoneGate({ userId, userEmail, themeIdx, cycleTheme, onDone, onCancel }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!phone.trim()) return setError("Enter your mobile number.");
    setBusy(true);
    const { error: regError } = await registerPhoneForUser(userId, phone);
    setBusy(false);
    if (regError) {
      setError(regError.message);
      if (/already linked/i.test(regError.message)) {
        // Don't sign out immediately — this is a real account that just
        // isn't eligible for another free trial. Offer Pro instead.
        setDuplicateBlocked(true);
      }
      return;
    }
    onDone();
  };

  const useDifferentAccount = async () => {
    await signOutUser();
    onCancel();
  };

  const handleUpgrade = () => {
    setCheckoutBusy(true);
    startProCheckout({
      userEmail,
      onSuccess: () => setCheckoutBusy(false),
      onError: () => setCheckoutBusy(false),
    });
  };

  return (
    <div className="authWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>
      <button type="button" className="themeBtn authThemeBtn" onClick={cycleTheme} title="Change background theme">
        <span className="themeEmoji">{THEMES[themeIdx].emoji}</span> {THEMES[themeIdx].name}
      </button>
      <div className="authCard">
        <div className="authBrand">
          <Flame size={22} className="brandIcon" />
          <span>PAPERRALLY</span>
        </div>
        <div className="authSub">{duplicateBlocked ? "This number's trial is already used" : "One last step — then you're trading"}</div>

        {duplicateBlocked ? (
          <>
            <div className="authError" style={{ marginBottom: "14px" }}>{error}</div>
            <p className="authNote" style={{ marginTop: 0, marginBottom: "18px" }}>
              This mobile number has already used its free PaperRally trial. You can still use this account by upgrading to Pro directly — no trial needed.
            </p>
            <button className="btn btnMarigold authSubmit" onClick={handleUpgrade} disabled={checkoutBusy} style={{ marginBottom: "10px" }}>
              {checkoutBusy ? "Opening…" : "Upgrade to Pro — ₹99"}
            </button>
            <button className="btn btnGhost authSubmit" onClick={useDifferentAccount}>
              Use a different account instead
            </button>
          </>
        ) : (
          <>
            <p className="authNote phoneGateIntro">
              Add your mobile number to unlock <b>₹10,00,000 of practice money</b> and <b>every feature free for 7 days</b>.
            </p>
            <form onSubmit={submit}>
              <div className="authField">
                <Phone size={14} className="authIcon" />
                <input placeholder="Mobile number (e.g. 9876543210)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" autoFocus />
              </div>
              {error && <div className="authError">{error}</div>}
              <button type="submit" className="btn btnBull authSubmit" disabled={busy}>{busy ? "Please wait…" : "Start trading"}</button>
            </form>
            <ul className="phoneGatePromises">
              <li>No OTP, no calls, no SMS — we don't contact you on this number.</li>
              <li>We never sell your number to anyone.</li>
              <li>It's only used so each person gets one free trial.</li>
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function TradingApp({ username, userId, userEmail, contactEmail = null, memberSince = null, proUntil = null, signInMethod = "password", referral = null, initialPortfolio, isPro, isPaidPro, inTrial, trialDaysLeft, onRefreshSubscription, onLogout, themeIdx, cycleTheme }) {
  const saved = initialPortfolio;
  const syncGroupRef = useRef([]);

  const [quotes, setQuotes] = useState(() => {
    const q = {};
    const seedList = [...INSTRUMENTS, ...(saved?.customInstruments ?? [])];
    seedList.forEach((s) => {
      const hist = genSyntheticHistory(s.fallback, 60, TIMEFRAME_MS["1D"]);
      q[s.symbol] = { price: s.fallback, prevClose: s.fallback, history: hist, live: false };
    });
    return q;
  });
  const [liveMarketStatus, setMarketStatus] = useState(() => getMarketStatus());
  // ---- Full-terminal Replay ----
  const [replayActive, setReplayActive] = useState(false);
  const replayActiveRef = useRef(false);
  const [replayDay, setReplayDay] = useState("");
  const [replayData, setReplayData] = useState(null); // { date, dayStart, dayEnd, bySym }
  const [replayClock, setReplayClock] = useState(0);
  const [replayRunning, setReplayRunning] = useState(false);
  const [replayRate, setReplayRate] = useState(5);
  const [replayBusy, setReplayBusy] = useState(false);
  const liveStashRef = useRef(null);
  const replayDayRef = useRef("");
  useEffect(() => { replayDayRef.current = replayDay; }, [replayDay]);
  SIM_NOW = replayActive ? replayClock : null;
  const marketStatus = replayActive && replayData
    ? { isOpen: replayClock >= replayData.dayStart && replayClock < replayData.dayEnd, label: replayClock >= replayData.dayEnd ? `Replay · session closed (${replayData.date})` : `Replay · ${fmtReplayTime(replayClock)}` }
    : liveMarketStatus;
  const marketStatusRef = useRef(marketStatus);
  useEffect(() => { marketStatusRef.current = marketStatus; }, [marketStatus]);
  useEffect(() => {
    const iv = setInterval(() => setMarketStatus(getMarketStatus()), 30000);
    return () => clearInterval(iv);
  }, []);
  const [exchangeFilter, setExchangeFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState(() => window.history.state?.prNav?.tab || "trade");
  const [cash, setCash] = useState(() => saved?.cash ?? STARTING_CASH);
  const [stockPositions, setStockPositions] = useState(() => saved?.stockPositions ?? []);
  const [optionPositions, setOptionPositions] = useState(() => saved?.optionPositions ?? []);
  const [trades, setTrades] = useState(() => saved?.trades ?? []);
  const [orderQty, setOrderQty] = useState(10);
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [ticket, setTicket] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pulse, setPulse] = useState(null);
  const [search, setSearch] = useState("");
  const [customInstruments, setCustomInstruments] = useState(() => saved?.customInstruments ?? []);
  const [remoteResults, setRemoteResults] = useState([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  // Index option IV follows live India VIX (instead of a fixed 13%). Falls back to the fixed values if the fetch fails.
  const [indiaVix, setIndiaVix] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await fetchYahoo("^INDIAVIX");
        if (!cancelled && r.price > 0) setIndiaVix(r.price);
      } catch { /* keep the last value */ }
    };
    pull();
    const stop = visibleInterval(pull, 60000);
    return () => { cancelled = true; stop(); };
  }, []);
  const VIX_SCALE = { "^NSEI": 1, "^BSESN": 1, "^NSEBANK": 1.2 };
  const allInstruments = useMemo(
    () => [...INSTRUMENTS, ...customInstruments].map((s) => (indiaVix && VIX_SCALE[s.symbol] ? { ...s, iv: (indiaVix / 100) * VIX_SCALE[s.symbol] } : s)),
    [customInstruments, indiaVix]
  );
  const allInstrumentsRef = useRef(allInstruments);
  useEffect(() => { allInstrumentsRef.current = allInstruments; }, [allInstruments]);

  const [timeframe, setTimeframe] = useState("1D");
  const [chartHistory, setChartHistory] = useState([]);
  const [indicators, setIndicators] = useState(() => ({ ...Object.fromEntries(INDICATOR_DEFS.map((d) => [d.key, false])), ma: true }));
  const activeIndicatorCount = INDICATOR_DEFS.filter((d) => indicators[d.key]).length;
  const chartOverlays = useMemo(() => {
    const o = [];
    if (indicators.sma50) o.push({ id: "sma50", field: "sma50", color: IND_COLORS.sma50 });
    if (indicators.ema9) o.push({ id: "ema9", field: "ema9", color: IND_COLORS.ema9 });
    if (indicators.ema21) o.push({ id: "ema21", field: "ema21", color: IND_COLORS.ema21 });
    if (indicators.bb) {
      o.push({ id: "bbU", field: "bbU", color: IND_COLORS.bb, width: 1 });
      o.push({ id: "bbM", field: "bbM", color: IND_COLORS.bb, width: 1, lineStyle: 2 });
      o.push({ id: "bbL", field: "bbL", color: IND_COLORS.bb, width: 1 });
    }
    if (indicators.st) o.push({ id: "st", field: "st", color: LW_COLORS.bull, width: 2, trendColored: true });
    return o;
  }, [indicators]);
  const [chartType, setChartType] = useState("candle");

  const [alerts, setAlerts] = useState(() => saved?.alerts ?? []);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDirection, setAlertDirection] = useState("above");

  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);

  const [pendingOrders, setPendingOrders] = useState(() => saved?.pendingOrders ?? []);
  const [orderType, setOrderType] = useState("market");
  const [orderPrice, setOrderPrice] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editQty, setEditQty] = useState(1);
  const [editPrice, setEditPrice] = useState("");
  const [slEditing, setSlEditing] = useState(null); // option position whose stop-loss is being set
  const [slInput, setSlInput] = useState("");
  const [pickingPriceFromChart, setPickingPriceFromChart] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountPhone, setAccountPhone] = useState(null);
  const openAccount = async () => {
    setAccountOpen(true);
    if (accountPhone) return;
    const { data, error } = await supabase.from("phone_registry").select("phone").eq("user_id", userId).maybeSingle();
    setAccountPhone(error ? "—" : (data?.phone || "Not added"));
  };
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // ---- usability additions ----
  const isMobile = useIsMobile(760);
  const [mobilePane, setMobilePane] = useState(() => window.history.state?.prNav?.pane || "main"); // "watchlist" | "main" (phones only)
  const [moreOpen, setMoreOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(null); // { kind: "stock" | "option", pos }
  const [lang, setLangState] = useState(() => loadLang());
  const setLang = (code) => { setLangState(code); saveLang(code); };
  const L = LEARN[lang] || LEARN.en;
  const chargesKey = `pr_charges_on_${userId}`;
  // Strategies discovery: a NEW badge until the user opens it, and a one-time pointer after their first closed trade.
  const stratSeenKey = `pr_strat_seen_${userId}`;
  const stratNudgeKey = `pr_strat_nudge_${userId}`;
  const [stratSeen, setStratSeen] = useState(() => loadSetting(stratSeenKey, false));
  const [stratNudge, setStratNudge] = useState(false);
  const [stratView, setStratView] = useState("builder");
  const [chargesOn, setChargesOn] = useState(() => loadSetting(chargesKey, false));
  const chargesOnRef = useRef(chargesOn);
  useEffect(() => { chargesOnRef.current = chargesOn; saveSetting(chargesKey, chargesOn); }, [chargesOn]);
  // Planned stop-loss on the stock order ticket ("" = use the suggested 2% stop).
  const [slOn, setSlOn] = useState(true);
  const [slPrice, setSlPrice] = useState("");
  const [targetOn, setTargetOn] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  useEffect(() => { setSlPrice(""); }, [selected]);
  const paymentKey = `pr_payment_pending_${userId}`;
  const [paymentPendingAt, setPaymentPendingAt] = useState(() => loadSetting(paymentKey, null));
  const [paymentChecking, setPaymentChecking] = useState(false);

  // ---- growth & retention ----
  const [prefs, setPrefs] = useState(() => saved?.prefs ?? {}); // synced with the portfolio row
  const updatePrefs = (patch) => setPrefs((p) => ({ ...p, ...patch, flags: { ...(p.flags || {}), ...(patch.flags || {}) } }));
  const [weekStart, setWeekStart] = useState(() => saved?.weekStart ?? null); // { week, equity, reset? }
  const [journalEditing, setJournalEditing] = useState(null);
  const [lastTradeId, setLastTradeId] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [notifPerm, setNotifPerm] = useState(() => notificationPermission());
  const install = useInstallPrompt();
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const installBannerKey = `pr_install_banner_dismissed_${userId}`;
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() => loadSetting(installBannerKey, false));

  // ---- Replay Mode ----
  const REPLAY_CASH = 1000000;
  const [replaySymbol, setReplaySymbol] = useState("RELIANCE.NS");
  const [replayDate, setReplayDate] = useState("");
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState("");
  const [replayFullHistory, setReplayFullHistory] = useState([]);
  const [replayVisibleCount, setReplayVisibleCount] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState("normal"); // slow | normal | fast
  const [replayCash, setReplayCash] = useState(REPLAY_CASH);
  const [replayPositions, setReplayPositions] = useState([]);
  const [replayTrades, setReplayTrades] = useState([]);
  const [replayQty, setReplayQty] = useState(10);
  const replaySyncGroupRef = useRef([]);

  const REPLAY_SPEED_MS = { slow: 800, normal: 400, fast: 150 };

  useEffect(() => {
    if (!replayPlaying) return;
    if (replayVisibleCount >= replayFullHistory.length) { setReplayPlaying(false); return; }
    const t = setTimeout(() => setReplayVisibleCount((c) => Math.min(c + 1, replayFullHistory.length)), REPLAY_SPEED_MS[replaySpeed]);
    return () => clearTimeout(t);
  }, [replayPlaying, replayVisibleCount, replayFullHistory.length, replaySpeed]);

  const loadReplayDay = async () => {
    if (!replayDate) return showToast("Pick a date first", "bear");
    setReplayError("");
    setReplayLoading(true);
    setReplayPlaying(false);
    try {
      const day = new Date(replayDate + "T00:00:00+05:30");
      const period1 = Math.floor(day.getTime() / 1000);
      const period2 = period1 + 24 * 3600;
      const hist = await fetchYahooRange(replaySymbol, "5m", period1, period2);
      if (hist.length < 3) {
        setReplayError("No trading data for this date (weekend, holiday, or too far back).");
        setReplayFullHistory([]);
        setReplayVisibleCount(0);
      } else {
        setReplayFullHistory(hist);
        setReplayVisibleCount(Math.min(5, hist.length));
        setReplayCash(REPLAY_CASH);
        setReplayPositions([]);
        setReplayTrades([]);
      }
    } catch (e) {
      setReplayError("Couldn't load data for that date. Try a different (recent, weekday) date.");
      setReplayFullHistory([]);
      setReplayVisibleCount(0);
    } finally {
      setReplayLoading(false);
    }
  };

  const [replayShowMA, setReplayShowMA] = useState(false);
  const replayVisibleData = useMemo(() => replayFullHistory.slice(0, replayVisibleCount), [replayFullHistory, replayVisibleCount]);
  const replayChartSeries = useMemo(() => buildChartSeries(replayVisibleData, { ma: replayShowMA }), [replayVisibleData, replayShowMA]);
  const replayCurrentPrice = replayVisibleData.length ? replayVisibleData[replayVisibleData.length - 1].close : null;
  const replayMeta = allInstruments.find((s) => s.symbol === replaySymbol);
  const replayPos = replayPositions.find((p) => p.symbol === replaySymbol);
  const replayMktValue = replayPositions.reduce((sum, p) => sum + (p.symbol === replaySymbol && replayCurrentPrice != null ? replayCurrentPrice : p.lastPrice) * p.qty, 0);
  const replayEquity = replayCash + replayMktValue;
  const replayDone = replayFullHistory.length > 0 && replayVisibleCount >= replayFullHistory.length;

  const resetReplaySession = () => {
    setReplayCash(REPLAY_CASH);
    setReplayPositions([]);
    setReplayTrades([]);
    setReplayVisibleCount(replayFullHistory.length ? Math.min(5, replayFullHistory.length) : 0);
    setReplayPlaying(false);
    showToast("Replay session reset", "bull");
  };

  const placeReplayOrder = (side) => {
    if (replayCurrentPrice == null) return;
    const price = replayCurrentPrice;
    const qty = replayQty;
    if (qty <= 0) return;
    const cost = price * qty;
    if (side === "buy") {
      if (cost > replayCash) return showToast("Insufficient replay buying power", "bear");
      setReplayCash((c) => c - cost);
      setReplayPositions((prev) => {
        const existing = prev.find((p) => p.symbol === replaySymbol);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPrice = (existing.avgPrice * existing.qty + cost) / totalQty;
          return prev.map((p) => (p.symbol === replaySymbol ? { ...p, qty: totalQty, avgPrice, lastPrice: price } : p));
        }
        return [...prev, { id: uid(), symbol: replaySymbol, qty, avgPrice: price, lastPrice: price }];
      });
      setReplayTrades((prev) => [{ id: uid(), label: `BUY ${qty} ${displayTicker(replaySymbol)} @ ${fmtMoney(price)}`, amount: -cost }, ...prev].slice(0, 200));
      showToast(`Replay: bought ${qty} ${displayTicker(replaySymbol)}`, "bull");
    } else {
      const held = replayPos?.qty ?? 0;
      if (qty > held) return showToast(`Only ${held} shares held in this replay`, "bear");
      setReplayCash((c) => c + cost);
      setReplayPositions((prev) => prev.map((p) => (p.symbol === replaySymbol ? { ...p, qty: p.qty - qty, lastPrice: price } : p)).filter((p) => p.qty > 0));
      setReplayTrades((prev) => [{ id: uid(), label: `SELL ${qty} ${displayTicker(replaySymbol)} @ ${fmtMoney(price)}`, amount: cost }, ...prev].slice(0, 200));
      showToast(`Replay: sold ${qty} ${displayTicker(replaySymbol)}`, "bear");
    }
  };

  const todayISO = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const expiries = useMemo(
    () => optionExpiries(selected || "^NSEI", 4, replayActive && replayData ? replayData.dayStart : null),
    [selected, replayActive, replayData]
  );
  useEffect(() => { setExpiryIdx(0); }, [selected]);
  const quotesRef = useRef(quotes);
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);
  const cashRef = useRef(cash);
  useEffect(() => { cashRef.current = cash; }, [cash]);
  const stockPositionsRef = useRef(stockPositions);
  useEffect(() => { stockPositionsRef.current = stockPositions; }, [stockPositions]);
  const pendingOrdersRef = useRef(pendingOrders);
  useEffect(() => { pendingOrdersRef.current = pendingOrders; }, [pendingOrders]);

  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (replayActive) return; // replay sessions are never saved over the real portfolio
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      upsertPortfolio(userId, { cash, stockPositions, optionPositions, trades, alerts, pendingOrders, customInstruments, prefs, weekStart });
    }, 600);
    return () => clearTimeout(saveTimerRef.current);
  }, [userId, cash, stockPositions, optionPositions, trades, alerts, pendingOrders, customInstruments, prefs, weekStart, replayActive]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const list = allInstrumentsRef.current;
      const results = await fetchYahooAll(list.map((s) => s.symbol));
      if (cancelled) return;
      setQuotes((prev) => {
        if (replayActiveRef.current) return prev;
        const next = { ...prev };
        results.forEach((r, i) => {
          const sym = list[i].symbol;
          if (r.status === "fulfilled" && r.value.price) {
            const hist = r.value.history.length ? r.value.history.slice(-90) : prev[sym]?.history ?? [];
            next[sym] = { price: r.value.price, prevClose: r.value.prevClose, history: hist, live: true };
          }
        });
        return next;
      });
    };
    pull();
    const stop = visibleInterval(pull, 10000);
    return () => { cancelled = true; stop(); };
  }, []);

  // Prices come only from the real feed (no simulated ticks), so fills and P&L use real prices.

  // Real option premiums: open positions first, then the open ticket, then the chain on screen.
  const [optTick, setOptTick] = useState(0);
  const optWantedRef = useRef([]);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const pull = async () => {
      if (busy || replayActiveRef.current) return;
      const list = optWantedRef.current;
      if (!list.length) return;
      busy = true;
      try {
        const got = await fetchOptionQuotes(list);
        if (cancelled) return;
        const at = Date.now();
        Object.entries(got).forEach(([key, price]) => { if (price > 0) REAL_PREMIUMS.set(key, { price, at }); });
      } catch { /* keep the last premiums; the next pull tries again */ }
      finally { busy = false; }
      if (!cancelled) setOptTick((t) => t + 1); // also refreshes the "delayed" marks when nothing arrived
    };
    pull();
    const stop = visibleInterval(pull, 5000);
    return () => { cancelled = true; stop(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (replayActive) return;
    if (!selected) { setChartHistory([]); return; }
    const load = async () => {
      const { interval, range } = TIMEFRAMES[timeframe];
      try {
        const r = await fetchYahoo(selected, interval, range);
        if (!cancelled && r.history.length >= 5) {
          setChartHistory(r.history.slice(-200));
        } else if (!cancelled) {
          const base = quotesRef.current[selected]?.price ?? allInstrumentsRef.current.find((s) => s.symbol === selected)?.fallback ?? 100;
          setChartHistory(genSyntheticHistory(base, 90, TIMEFRAME_MS[timeframe]));
        }
      } catch {
        if (!cancelled) {
          const base = quotesRef.current[selected]?.price ?? allInstrumentsRef.current.find((s) => s.symbol === selected)?.fallback ?? 100;
          setChartHistory(genSyntheticHistory(base, 90, TIMEFRAME_MS[timeframe]));
        }
      }
    };
    load();
    const stop = visibleInterval(load, 30000);
    return () => { cancelled = true; stop(); };
  }, [selected, timeframe, replayActive]);

  // Live: the newest candle on the chart follows every price tick
  useEffect(() => {
    if (replayActive || !selected || !marketStatus.isOpen) return;
    const px = quotes[selected]?.price;
    if (px == null) return;
    setChartHistory((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.close === px) return prev;
      return [...prev.slice(0, -1), { ...last, price: px, close: px, high: Math.max(last.high ?? px, px), low: Math.min(last.low ?? px, px) }];
    });
  }, [quotes, selected, replayActive, marketStatus.isOpen]);

  // Replay <-> popout chart window
  const replaySyncRef = useRef({});
  replaySyncRef.current = { replayActive, replayData, replayClock, replayRunning, replayRate };
  const replayChannelRef = useRef(null);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(REPLAY_CHANNEL);
    replayChannelRef.current = ch;
    ch.onmessage = (e) => {
      const m = e.data || {};
      const st = replaySyncRef.current;
      if (m.type === "hello") {
        popoutSeenRef.current = true;
        ch.postMessage({ type: "state", active: st.replayActive, date: st.replayData?.date, clock: st.replayClock, running: st.replayRunning, rate: st.replayRate });
        ch.postMessage(buildPopoutAcctRef.current());
        return;
      }
      // Trading from the pop-out chart window
      if (m.type === "watch") { popoutSeenRef.current = true; popoutWatchRef.current = m.sym; ch.postMessage(buildPopoutAcctRef.current()); return; }
      if (m.type === "order") {
        const r = executeStockOrderRef.current(m.sym, m.side, m.qty);
        ch.postMessage({ type: "orderResult", id: m.id, ...r });
        if (r.ok) setToast({ msg: `From pop-out: ${r.msg}`, kind: m.side === "buy" ? "bull" : "bear" });
        return;
      }
      if (m.type === "optOrder") {
        const r = !popoutAcctRef.current.isPro
          ? { ok: false, msg: "Options trading is a Pro feature — upgrade from your PaperRally tab" }
          : executeOptionOrderRef.current({ symbol: m.sym, type: m.opt.type, strike: m.opt.strike, expiry: m.opt.expiry }, m.mode, m.qty);
        ch.postMessage({ type: "orderResult", id: m.id, ok: r.ok, msg: r.msg });
        if (r.ok) setToast({ msg: `From pop-out: ${r.msg}`, kind: r.kind || "bull" });
        return;
      }
      if (m.type === "optClose") {
        const r = closeOptionFromPopoutRef.current(m.posId);
        ch.postMessage({ type: "orderResult", id: m.id, ok: r.ok, msg: r.msg });
        return;
      }
      if (m.type === "startReplay" && m.date) { startReplayRef.current(m.date); return; }
      if (!st.replayActive || !st.replayData || m.date !== st.replayData.date) return;
      if (m.type === "seek") setReplayClock(Math.max(st.replayData.dayStart, Math.min(m.clock, st.replayData.dayEnd)));
      if (m.type === "play") setReplayRunning(true);
      if (m.type === "pause") setReplayRunning(false);
      if (m.type === "rate") setReplayRate(m.rate);
    };
    return () => { ch.close(); replayChannelRef.current = null; };
  }, []);
  useEffect(() => {
    replayChannelRef.current?.postMessage({ type: "state", active: replayActive, date: replayData?.date, clock: replayClock, running: replayRunning, rate: replayRate });
  }, [replayActive, replayData, replayClock, replayRunning, replayRate]);

  // Account snapshot for the pop-out's trade panel, re-sent every second while a pop-out is open.
  const popoutSeenRef = useRef(false);
  const popoutWatchRef = useRef(null);
  const popoutAcctRef = useRef(null);
  const buildPopoutAcct = () => {
    const w = popoutWatchRef.current;
    const wMeta = w ? allInstrumentsRef.current.find((x) => x.symbol === w) : null;
    return { ...popoutAcctRef.current, now: nowMs(), watch: w ? { symbol: w, price: quotesRef.current[w]?.price ?? null, iv: wMeta?.iv ?? null } : null };
  };
  popoutAcctRef.current = {
    type: "acct",
    mode: replayActive && replayData ? "replay" : "live",
    date: replayActive && replayData ? replayData.date : istTodayISO(),
    open: marketStatus.isOpen,
    label: marketStatus.label,
    cash,
    positions: stockPositions.map((p) => ({ symbol: p.symbol, qty: p.qty, avgPrice: p.avgPrice, price: quotes[p.symbol]?.price ?? null })),
    options: optionPositions.map((p) => ({ id: p.id, symbol: p.symbol, type: p.type, strike: p.strike, expiry: p.expiry, qty: p.qty, side: isShort(p) ? "short" : "long", avgPremium: p.avgPremium, mult: posMultiplier(p), premium: optionPremiumNow(p, quotes, allInstruments) })),
    isPro,
    now: nowMs(),
  };
  const buildPopoutAcctRef = useRef(buildPopoutAcct);
  buildPopoutAcctRef.current = buildPopoutAcct;
  useEffect(() => {
    const iv = setInterval(() => {
      if (popoutSeenRef.current) replayChannelRef.current?.postMessage(buildPopoutAcct());
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const popOutChart = () => {
    const date = replayActive && replayData ? replayData.date : liveMarketStatus.isOpen ? istTodayISO() : lastTradingDayISO();
    if (!openChartPopout(date, selected || "^NSEI")) showToast("Your browser blocked the pop-up — allow pop-ups for paperrally.in", "bear");
  };

  // Replay: advance the simulated clock
  useEffect(() => {
    if (!replayActive || !replayRunning || !replayData) return;
    const iv = setInterval(() => setReplayClock((c) => Math.min(c + 500 * replayRate, replayData.dataEnd)), 500);
    return () => clearInterval(iv);
  }, [replayActive, replayRunning, replayRate, replayData]);

  useEffect(() => {
    if (replayActive && replayData && replayRunning && replayClock >= replayData.dataEnd) {
      setReplayRunning(false);
      showToast(replayData.dataEnd < replayData.dayEnd
        ? "You've caught up with the latest candle — drag the timeline back to practise an earlier part of the day"
        : "Replay session closed at 3:30 PM — review Positions and History, then exit replay", "bull");
    }
  }, [replayClock, replayActive, replayData, replayRunning]);

  // Replay: every symbol's price follows the simulated clock
  useEffect(() => {
    if (!replayActive || !replayData) return;
    setQuotes((prev) => {
      const next = { ...prev };
      Object.entries(replayData.bySym).forEach(([sym, entry]) => {
        const snap = replaySnapshot(entry, replayClock);
        next[sym] = { price: snap.price, prevClose: snap.prevClose, history: snap.history.slice(-90), live: true };
      });
      return next;
    });
  }, [replayActive, replayData, replayClock]);

  // Replay: chart for the selected symbol
  useEffect(() => {
    if (!replayActive || !replayData || !selected) return;
    const entry = replayData.bySym[selected];
    if (!entry) { setChartHistory([]); return; }
    const snap = replaySnapshot(entry, replayClock);
    const mins = timeframe === "15m" ? 15 : timeframe === "1H" ? 60 : 5;
    setChartHistory(mins === 5 ? snap.history : aggregateCandles(snap.history, mins, replayData.dayStart));
  }, [replayActive, replayData, replayClock, selected, timeframe]);

  useEffect(() => {
    let changed = false;
    const next = alerts.map((a) => {
      if (a.triggered) return a;
      const price = quotes[a.symbol]?.live ? quotes[a.symbol].price : null;
      if (price == null) return a;
      const hit = a.direction === "above" ? price >= a.target : price <= a.target;
      if (hit) {
        changed = true;
        showToast(`Alert: ${displayTicker(a.symbol)} crossed ${a.direction} ${fmtMoney(a.target)}`, a.direction === "above" ? "bull" : "bear");
        notify(`${displayTicker(a.symbol)} crossed ${fmtMoney(a.target)}`, `Price is now ${fmtMoney(price)} — your ${a.direction} alert on PaperRally fired.`, { tag: `alert-${a.id}` });
        return { ...a, triggered: true };
      }
      return a;
    });
    if (changed) setAlerts(next);
  }, [quotes]);

  useEffect(() => {
    const orders = pendingOrdersRef.current;
    if (orders.length === 0) return;

    const remaining = [];
    const toFill = [];
    orders.forEach((o) => {
      // Never fill against a placeholder price (shown before the first live quote arrives after opening the app).
      const price = quotes[o.symbol]?.live ? quotes[o.symbol].price : null;
      if (price == null) { remaining.push(o); return; }
      const triggered = o.kind === "limit"
        ? (o.side === "buy" ? price <= o.price : price >= o.price)
        : (o.side === "buy" ? price >= o.price : price <= o.price);
      if (triggered) toFill.push({ ...o, fillPrice: price });
      else remaining.push(o);
    });
    if (toFill.length === 0) return;

    let workingCash = cashRef.current;
    let workingPositions = stockPositionsRef.current.map((p) => ({ ...p }));
    const filled = [];
    const partial = [];
    const cancelled = [];

    toFill.forEach((o) => {
      const { fillPrice, ...orderCore } = o;
      const idx = workingPositions.findIndex((p) => p.symbol === o.symbol);

      if (o.side === "buy") {
        const affordableQty = Math.max(0, Math.floor(workingCash / fillPrice));
        const fillQty = Math.min(o.qty, affordableQty);
        if (fillQty <= 0) { cancelled.push(o); return; }
        const total = fillPrice * fillQty;
        workingCash -= total;
        if (idx >= 0) {
          const totalQty = workingPositions[idx].qty + fillQty;
          const avgPrice = (workingPositions[idx].avgPrice * workingPositions[idx].qty + total) / totalQty;
          workingPositions[idx] = { ...workingPositions[idx], qty: totalQty, avgPrice };
        } else {
          workingPositions.push({ id: uid(), symbol: o.symbol, qty: fillQty, avgPrice: fillPrice });
        }
        if (fillQty < o.qty) {
          remaining.push({ ...orderCore, qty: o.qty - fillQty });
          partial.push({ ...o, filledQty: fillQty, remainingQty: o.qty - fillQty, resolution: "requeued" });
        } else {
          filled.push({ ...o, filledQty: fillQty });
        }
      } else {
        const held = idx >= 0 ? workingPositions[idx].qty : 0;
        const fillQty = Math.min(o.qty, held);
        if (fillQty <= 0) { cancelled.push(o); return; }
        const total = fillPrice * fillQty;
        workingCash += total;
        const realized = (fillPrice - workingPositions[idx].avgPrice) * fillQty;
        workingPositions[idx] = { ...workingPositions[idx], qty: workingPositions[idx].qty - fillQty };
        if (fillQty < o.qty) {
          partial.push({ ...o, filledQty: fillQty, remainingQty: o.qty - fillQty, resolution: "cancelled", realized });
        } else {
          filled.push({ ...o, filledQty: fillQty, realized });
        }
      }
    });
    workingPositions = workingPositions.filter((p) => p.qty > 0);

    const doneBrackets = new Set([...filled, ...partial].map((o) => o.bracketId).filter(Boolean));
    setPendingOrders(remaining.filter((o) => !doneBrackets.has(o.bracketId)));
    if (filled.length || partial.length || cancelled.length) {
      setCash(workingCash);
      setStockPositions(workingPositions);
    }
    filled.forEach((o) => {
      const label = `${o.kind.toUpperCase()} ${o.side.toUpperCase()} ${o.filledQty} ${displayTicker(o.symbol)} @ ${fmtMoney(o.fillPrice)}`;
      logTrade(label, o.side === "buy" ? -(o.fillPrice * o.filledQty) : o.fillPrice * o.filledQty, o.side === "sell" ? o.realized : null);
      showToast(`${o.kind === "limit" ? "Limit" : "Stop"} order filled: ${o.side} ${o.filledQty} ${displayTicker(o.symbol)}`, o.side === "buy" ? "bull" : "bear");
      notify(`${o.kind === "limit" ? "Limit" : "Stop"} order filled`, `${o.side.toUpperCase()} ${o.filledQty} ${displayTicker(o.symbol)} @ ${fmtMoney(o.fillPrice)}`, { tag: `fill-${o.id}` });
    });
    partial.forEach((o) => {
      const label = `${o.kind.toUpperCase()} ${o.side.toUpperCase()} ${o.filledQty} ${displayTicker(o.symbol)} @ ${fmtMoney(o.fillPrice)} (partial)`;
      logTrade(label, o.side === "buy" ? -(o.fillPrice * o.filledQty) : o.fillPrice * o.filledQty, o.side === "sell" ? o.realized : null);
      if (o.resolution === "requeued") {
        showToast(`Partial fill: ${o.filledQty}/${o.qty} ${displayTicker(o.symbol)} — ${o.remainingQty} still pending`, "bull");
      } else {
        showToast(`Partial fill: ${o.filledQty}/${o.qty} ${displayTicker(o.symbol)} — remaining ${o.remainingQty} cancelled (not enough shares)`, "bear");
      }
    });
    cancelled.forEach((o) => {
      showToast(`Order cancelled — ${o.side === "buy" ? "insufficient funds" : "insufficient shares held"} for ${displayTicker(o.symbol)}`, "bear");
    });
  }, [quotes]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setRemoteResults([]); setSearchingRemote(false); return; }
    const q = query.toLowerCase();
    const hasLocalMatch = allInstruments.some(
      (s) => displayTicker(s.symbol).toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
    if (hasLocalMatch) { setRemoteResults([]); setSearchingRemote(false); return; }

    let cancelled = false;
    setSearchingRemote(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchYahooSymbols(query);
        if (cancelled) return;
        setRemoteResults(results.filter((r) => !allInstruments.some((s) => s.symbol === r.symbol)));
      } catch {
        if (!cancelled) setRemoteResults([]);
      } finally {
        if (!cancelled) setSearchingRemote(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, allInstruments]);

  const addCustomInstrument = async (result) => {
    if (!isPro) { setUpgradeModalOpen(true); return; }
    if (replayActiveRef.current) { showToast("Exit replay to add new symbols", "bear"); return; }
    showToast(`Adding ${displayTicker(result.symbol)}…`, "bull");
    let price, prevClose, history, live;
    try {
      const r = await fetchYahoo(result.symbol, "1d", "6mo");
      price = r.price ?? 100;
      prevClose = r.prevClose ?? price;
      history = r.history.length ? r.history.slice(-90) : genSyntheticHistory(price, 60, TIMEFRAME_MS["1D"]);
      live = !!r.price;
    } catch {
      price = 100;
      prevClose = 100;
      history = genSyntheticHistory(price, 60, TIMEFRAME_MS["1D"]);
      live = false;
    }
    setCustomInstruments((prev) => [...prev, { symbol: result.symbol, name: result.name, exchange: result.exchange, fallback: price, iv: 0.35 }]);
    setQuotes((prev) => ({ ...prev, [result.symbol]: { price, prevClose, history, live } }));
    setSelected(result.symbol);
    setSearch("");
    setRemoteResults([]);
    setTab("trade");
    showToast(live ? `${displayTicker(result.symbol)} added to your watchlist` : `Added ${displayTicker(result.symbol)} (price unavailable, using placeholder)`, live ? "bull" : "bear");
  };

  // Nothing is selected when the terminal first opens; viewSym keeps the
  // background calculations safe until the user picks a symbol.
  const viewSym = selected || INSTRUMENTS[0].symbol;
  const q = quotes[viewSym];
  const meta = allInstruments.find((s) => s.symbol === viewSym);
  const isIndex = meta.exchange === "INDEX";
  const chartSeries = useMemo(() => buildChartSeries(chartHistory.length ? chartHistory : q.history, indicators), [chartHistory, q.history, indicators]);
  const indicatorLatest = useMemo(() => {
    const all = buildChartSeries(chartHistory.length ? chartHistory : q.history, ALL_INDICATORS_ON);
    return all[all.length - 1] || null;
  }, [chartHistory, q.history]);
  const smcSummary = useMemo(() => {
    const h = chartHistory.length ? chartHistory : q.history;
    return computeSMC(h.map((d) => ({ time: Math.floor(d.time / 1000) + IST_OFFSET_SEC, open: d.open ?? d.price, high: hi(d), low: lo(d), close: cl(d) }))).summary;
  }, [chartHistory, q.history]);
  const toggleIndicator = (def) => {
    if (def.pro && !isPro) { setUpgradeModalOpen(true); return; }
    setIndicators((prev) => ({ ...prev, [def.key]: !prev[def.key] }));
  };
  const indicatorReading = (key) => {
    const L = indicatorLatest;
    if (!L) return { value: "—", text: "Not enough data yet", tone: "" };
    const px = L.close;
    const f = (v) => (v == null ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 2 }));
    const vsLine = (v) => (v == null ? { value: "—", text: "Needs more candles", tone: "" }
      : px >= v ? { value: f(v), text: "Price above: bullish bias", tone: "bull" } : { value: f(v), text: "Price below: bearish bias", tone: "bear" });
    switch (key) {
      case "ma": return vsLine(L.ma);
      case "sma50": return vsLine(L.sma50);
      case "ema9": return vsLine(L.ema9);
      case "ema21": return vsLine(L.ema21);
      case "bb":
        if (L.bbU == null) return { value: "—", text: "Needs 20 candles", tone: "" };
        return { value: `${f(L.bbL)} – ${f(L.bbU)}`, text: px >= L.bbU ? "At upper band: stretched up" : px <= L.bbL ? "At lower band: stretched down" : "Inside the bands", tone: px >= L.bbU ? "bear" : px <= L.bbL ? "bull" : "" };
      case "st":
        if (L.st == null) return { value: "—", text: "Needs more candles", tone: "" };
        return { value: f(L.st), text: L.stUp ? "Uptrend" : "Downtrend", tone: L.stUp ? "bull" : "bear" };
      case "smc": {
        const S = smcSummary, t = S.swingTrend || S.internalTrend;
        if (!t) return { value: "—", text: "No break of structure yet", tone: "" };
        const e = S.lastEvent;
        return { value: e ? `${e.choch ? "CHoCH" : "BOS"} ${f(e.price)}` : "—", text: `${t === 1 ? "Bullish" : "Bearish"} ${S.swingTrend ? "swing" : "internal"} structure · ${S.orderBlocks} order blocks, ${S.fvgs} gaps`, tone: t === 1 ? "bull" : "bear" };
      }
      case "rsi":
        if (L.rsi == null) return { value: "—", text: "Needs 15 candles", tone: "" };
        return { value: L.rsi.toFixed(1), text: L.rsi >= 70 ? "Overbought zone" : L.rsi <= 30 ? "Oversold zone" : "Neutral", tone: L.rsi >= 70 ? "bear" : L.rsi <= 30 ? "bull" : "" };
      case "macd":
        if (L.macdLine == null || L.signalLine == null) return { value: "—", text: "Needs 35 candles", tone: "" };
        return { value: L.macdLine.toFixed(2), text: L.macdLine >= L.signalLine ? "Above signal: bullish momentum" : "Below signal: bearish momentum", tone: L.macdLine >= L.signalLine ? "bull" : "bear" };
      case "stoch":
        if (L.stochK == null) return { value: "—", text: "Needs 14 candles", tone: "" };
        return { value: L.stochK.toFixed(1), text: L.stochK >= 80 ? "High (overbought)" : L.stochK <= 20 ? "Low (oversold)" : "Mid-range", tone: L.stochK >= 80 ? "bear" : L.stochK <= 20 ? "bull" : "" };
      case "atr":
        if (L.atr == null) return { value: "—", text: "Needs 15 candles", tone: "" };
        return { value: f(L.atr), text: `${((L.atr / px) * 100).toFixed(2)}% of price per candle`, tone: "" };
      default: return { value: "—", text: "", tone: "" };
    }
  };

  useEffect(() => { setPickingPriceFromChart(false); }, [selected, tab]);

  useEffect(() => {
    if (tab !== "news" || !isPro || !selected) return;
    let cancelled = false;
    setNewsLoading(true);
    fetchSymbolNews(meta.name || displayTicker(selected))
      .then((items) => { if (!cancelled) setNewsItems(items); })
      .catch(() => { if (!cancelled) setNewsItems([]); })
      .finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, selected, meta.name, isPro]);

  const stockMktValue = stockPositions.reduce((sum, p) => sum + (quotes[p.symbol]?.price ?? 0) * p.qty, 0);
  const optionMktValue = optionPositions.reduce((sum, p) => {
    const spot = quotes[p.symbol]?.price ?? 0;
    const symMeta = allInstruments.find((s) => s.symbol === p.symbol);
    const T = (p.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
    const price = realPremium(p) ?? blackScholes(spot, p.strike, T, RISK_FREE, sigma, p.type).price;
    return sum + (isShort(p) ? (p.margin || 0) - price * posMultiplier(p) * p.qty : price * posMultiplier(p) * p.qty);
  }, 0);
  const equity = cash + stockMktValue + optionMktValue;
  const dayPnl = equity - STARTING_CASH;
  // Unrealized = open positions marked to market; Realized = everything already booked (Total - Unrealized).
  const stockUnrealized = stockPositions.reduce((sum, p) => sum + ((quotes[p.symbol]?.price ?? 0) - p.avgPrice) * p.qty, 0);
  const optionUnrealized = optionPositions.reduce((sum, p) => {
    const spot = quotes[p.symbol]?.price ?? 0;
    const symMeta = allInstruments.find((s) => s.symbol === p.symbol);
    const pT = (p.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
    const price = realPremium(p) ?? blackScholes(spot, p.strike, pT, RISK_FREE, sigma, p.type).price;
    return sum + (isShort(p) ? p.avgPremium - price : price - p.avgPremium) * posMultiplier(p) * p.qty;
  }, 0);
  const unrealizedPnl = stockUnrealized + optionUnrealized;
  const realizedPnl = dayPnl - unrealizedPnl;
  // Don't show P&L from the hard-coded starting prices; wait until every held symbol has a live quote.
  const pricesReady = [...stockPositions, ...optionPositions].every((p) => quotes[p.symbol]?.live);

  const allocationItems = useMemo(() => {
    const items = [];
    stockPositions.forEach((p) => {
      const mv = (quotes[p.symbol]?.price ?? 0) * p.qty;
      if (mv > 0) items.push({ label: displayTicker(p.symbol), value: mv });
    });
    if (optionMktValue > 0) items.push({ label: "Options", value: optionMktValue });
    if (cash > 0) items.push({ label: "Cash", value: cash });
    const total = items.reduce((s, i) => s + i.value, 0) || 1;
    return items
      .map((it, i) => ({ ...it, pct: (it.value / total) * 100, color: it.label === "Cash" ? LW_COLORS.text : ALLOC_PALETTE[i % ALLOC_PALETTE.length] }))
      .sort((a, b) => b.value - a.value);
  }, [stockPositions, optionMktValue, cash, quotes]);

  const prevEquity = useRef(equity);
  useEffect(() => {
    if (Math.abs(equity - prevEquity.current) > 0.5) {
      setPulse(equity >= prevEquity.current ? "bull" : "bear");
      const t = setTimeout(() => setPulse(null), 700);
      prevEquity.current = equity;
      return () => clearTimeout(t);
    }
  }, [equity]);

  const showToast = (msg, kind = "bull") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };
  const logTrade = (label, amount, realized = null) => {
    // Optional realistic charges (brokerage, STT, fees, GST, stamp duty), deducted from cash.
    const ch = chargesOnRef.current ? computeCharges(label, amount) : null;
    const charges = ch ? ch.total : 0;
    if (charges) setCash((c) => c - charges);
    const id = uid();
    setTrades((prev) => [{ id, time: new Date(nowMs()), label, amount, realized, charges, key: tradeKey(label) }, ...prev].slice(0, 200));
    setLastTradeId(id);
    if (replayActiveRef.current) updatePrefs({ flags: { replay: true } });
    track("trade", { option: /\b(BTO|STO|STC|BTC)\b/.test(label), replay: replayActiveRef.current, close: realized != null });
  };

  // opts.focus: symbol to open once replay starts (e.g. RELIANCE.NS for a first trade).
  // opts.quiet: skip the toast (the first-trade card explains replay instead).
  // Resolves true once replay is running, false otherwise.
  const startReplay = async (dayArg, opts = {}) => {
    const replayDay = typeof dayArg === "string" ? dayArg : replayDayRef.current;
    if (!replayDay) return showToast("Pick a date first", "bear");
    setReplayDay(replayDay);
    const wd = new Date(replayDay + "T12:00:00+05:30").getUTCDay();
    if (wd === 0 || wd === 6) return showToast("That's a weekend — pick a weekday", "bear");
    if (NSE_HOLIDAYS[replayDay]) return showToast(`${NSE_HOLIDAYS[replayDay]} was a market holiday — pick another day`, "bear");
    setReplayBusy(true);
    const list = allInstrumentsRef.current;
    const results = await Promise.allSettled(list.map((s) => fetchYahooDay(s.symbol, replayDay)));
    setReplayBusy(false);
    const bySym = {};
    results.forEach((r, i) => { if (r.status === "fulfilled" && r.value.candles.length >= 3) bySym[list[i].symbol] = r.value; });
    if (!Object.keys(bySym).length) return showToast("No market data for that date — try a more recent weekday", "bear");
    const dayStart = Date.parse(replayDay + "T09:15:00+05:30");
    const dayEnd = Date.parse(replayDay + "T15:30:00+05:30");
    // Restarting while already in replay keeps the original live stash — never stash the practice portfolio.
    if (!replayActiveRef.current) liveStashRef.current = { cash, stockPositions, optionPositions, trades, pendingOrders, alerts, quotes };
    replayActiveRef.current = true;
    setCash(REPLAY_CASH); setStockPositions([]); setOptionPositions([]); setTrades([]); setPendingOrders([]); setAlerts([]);
    const lastCandle = Math.max(...Object.values(bySym).map((e) => e.candles[e.candles.length - 1].start));
    const dataEnd = Math.min(dayEnd, lastCandle + REPLAY_CANDLE_MS);
    setReplayData({ date: replayDay, dayStart, dayEnd, dataEnd, bySym });
    setReplayClock(dayStart);
    setReplayRunning(true);
    setReplayActive(true);
    if (opts.focus && bySym[opts.focus]) setSelected(opts.focus);
    else if (!selected || !bySym[selected]) setSelected(bySym["^NSEI"] ? "^NSEI" : Object.keys(bySym)[0]);
    setTab("trade");
    if (!opts.quiet) showToast(`Replaying ${new Date(dayStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} from the 9:15 AM open — trade as if it's live`, "bull");
    return true;
  };

  const startReplayRef = useRef(startReplay);
  startReplayRef.current = startReplay;

  // Today's session if it has started (weekday, not a holiday, at least 15 min after the open); otherwise the last trading day.
  const practiceDayISO = () => {
    const ist = new Date(Date.now() + 19800000);
    const iso = ist.toISOString().slice(0, 10);
    const wd = ist.getUTCDay();
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (wd !== 0 && wd !== 6 && !NSE_HOLIDAYS[iso] && mins >= 9 * 60 + 30) return iso;
    return lastTradingDayISO();
  };
  const practiceToday = () => startReplay(practiceDayISO());
  const restartReplayDay = () => replayData && startReplay(replayData.date);

  // ---- First-run experience ----
  // Most people sign up in the evening or at weekends, when live orders are
  // blocked. Someone who has never traded is taken straight into a replay of
  // the last trading session from its 9:15 AM open, so their first visit can
  // end with a real (practice) trade instead of a "market is closed" toast.
  const neverTradedRef = useRef(
    !(saved?.trades?.length) && !(saved?.stockPositions?.length) && !(saved?.optionPositions?.length)
  );
  const firstTradeKey = `pr_first_trade_done_${userId}`;
  const [firstTradeDone, setFirstTradeDone] = useState(() => {
    if (!neverTradedRef.current) return true;
    try { return localStorage.getItem(firstTradeKey) === "1"; } catch { return false; }
  });
  const [highlightBuy, setHighlightBuy] = useState(false);
  // Phones: Buy/Sell open a full-screen order screen ("buy" | "sell" | null) with its own
  // history entry, so the phone's back button closes it.
  const [orderScreen, setOrderScreen] = useState(null);
  const openOrderScreen = (side) => {
    if (side === "buy") setHighlightBuy(true);
    window.history.pushState({ ...window.history.state, prOrder: side }, "");
    setOrderScreen(side);
  };
  const closeOrderScreen = () => {
    if (window.history.state?.prOrder) window.history.back();
    else setOrderScreen(null);
  };
  useEffect(() => {
    const state = window.history.state; // a reload starts with the order screen closed
    if (state?.prOrder) { const { prOrder, ...rest } = state; window.history.replaceState(rest, ""); }
  }, []);
  useEffect(() => {
    if (!orderScreen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [orderScreen]);
  const lastSessionISO = lastTradingDayISO();
  const lastSessionLabel = new Date(lastSessionISO + "T12:00:00+05:30").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const markFirstTradeDone = () => {
    setFirstTradeDone(true);
    setHighlightBuy(false);
    try { localStorage.setItem(firstTradeKey, "1"); } catch { /* storage unavailable */ }
  };
  useEffect(() => {
    if (!firstTradeDone && trades.length > 0) {
      markFirstTradeDone();
      showToast("Nice — that's your first trade! Track it in the Positions tab.", "bull");
    }
  }, [trades.length]);

  const autoReplayTriedRef = useRef(false);
  useEffect(() => {
    if (autoReplayTriedRef.current || firstTradeDone || replayActive || liveMarketStatus.isOpen) return;
    autoReplayTriedRef.current = true;
    startReplay(lastSessionISO, { focus: "RELIANCE.NS", quiet: true });
  }, [firstTradeDone, replayActive, liveMarketStatus.isOpen]);

  const practiceLastSession = () => startReplay(lastSessionISO);

  const setUpFirstTrade = () => {
    setSelected("RELIANCE.NS");
    setTab("trade");
    setOrderType("market");
    setOrderQty(10);
    setHighlightBuy(true);
    if (isMobile) setTimeout(() => openOrderScreen("buy"), 150);
    else setTimeout(() => document.getElementById("stockOrderCard")?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };

  // Picking a symbol from the watchlist: on phones, jump straight to its chart.
  const ACCOUNT_TABS = ["positions", "orders", "history", "perf", "leaderboard", "replay", "learn", "strategies"];
  const pickSymbol = (sym) => {
    setSelected(sym);
    if (isMobile) {
      setMobilePane("main");
      if (ACCOUNT_TABS.includes(tab)) setTab("trade");
      window.scrollTo({ top: 0 });
    }
  };
  // On phones, tables are shown as cards: each cell gets its column heading as a label.
  useEffect(() => {
    if (!isMobile) return;
    document.querySelectorAll(".posTable").forEach((t) => {
      const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      t.querySelectorAll("tbody tr").forEach((tr) => {
        [...tr.children].forEach((td, i) => {
          const label = heads[i] ?? "";
          if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        });
      });
    });
  });

  // Escape closes whichever dialog or sheet is on top.
  const escStateRef = useRef({});
  escStateRef.current = { orderScreen, journalEditing, closeConfirm, moreOpen, ticket, slEditing, editingOrder, upgradeModalOpen, checkoutBusy, confirmReset };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const st = escStateRef.current;
      if (st.upgradeModalOpen && st.orderScreen) { if (!st.checkoutBusy) setUpgradeModalOpen(false); }
      else if (st.orderScreen) closeOrderScreen();
      else if (st.journalEditing) setJournalEditing(null);
      else if (st.closeConfirm) setCloseConfirm(null);
      else if (st.moreOpen) setMoreOpen(false);
      else if (st.ticket) setTicket(null);
      else if (st.slEditing) setSlEditing(null);
      else if (st.editingOrder) setEditingOrder(null);
      else if (st.upgradeModalOpen && !st.checkoutBusy) setUpgradeModalOpen(false);
      else if (st.confirmReset) setConfirmReset(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Opening Positions brings the option positions card into view, since that's what people come to check.
  useEffect(() => {
    if (tab !== "positions" || optionPositions.length === 0) return;
    const id = requestAnimationFrame(() => document.querySelector(".posHero")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [tab]);
  useEffect(() => {
    if (tab !== "strategies") return;
    track("strategies_open", { pro: !!isPro, first: !stratSeen });
    setStratNudge(false);
    if (!stratSeen) { setStratSeen(true); saveSetting(stratSeenKey, true); }
  }, [tab]);
  useEffect(() => {
    if (stratSeen || stratNudge || loadSetting(stratNudgeKey, false) || replayActive) return;
    if (!trades.some((t) => t.realized != null)) return;
    const id = setTimeout(() => { setStratNudge(true); saveSetting(stratNudgeKey, true); track("strat_nudge_shown"); }, 2500);
    return () => clearTimeout(id);
  }, [trades, stratSeen]);
  const openRuleTester = (from) => { track("strat_nudge_click", { from }); setStratNudge(false); setStratView("rules"); goTab("strategies"); };
  const goTab = (id) => {
    setTab(id);
    setMoreOpen(false);
    if (isMobile) { setMobilePane("main"); window.scrollTo({ top: 0 }); }
  };

  // ---- Back navigation ----
  // Every screen change gets its own browser-history entry (the URL stays the same), so
  // the phone/browser back button and the "Back to ..." link step through the screens
  // the user visited. The entry also brings them to the same screen after visiting a guide.
  const [navBack, setNavBack] = useState(null); // the screen a "Back" press returns to
  useEffect(() => {
    const state = window.history.state || {};
    const nav = state.prNav;
    if (nav && nav.tab === tab && nav.pane === mobilePane) { setNavBack(nav.prev || null); return; }
    if (!nav) {
      window.history.replaceState({ ...state, prNav: { tab, pane: mobilePane, prev: null } }, "");
      setNavBack(null);
      return;
    }
    const prev = { tab: nav.tab, pane: nav.pane };
    window.history.pushState({ prNav: { tab, pane: mobilePane, prev } }, "");
    setNavBack(prev);
  }, [tab, mobilePane]);
  useEffect(() => {
    const onPop = (e) => {
      setOrderScreen(e.state?.prOrder || null);
      const nav = e.state?.prNav;
      if (!nav) return;
      setTab(nav.tab);
      setMobilePane(nav.pane);
      setNavBack(nav.prev || null);
      setMoreOpen(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const exitReplay = () => {
    const st = liveStashRef.current;
    replayActiveRef.current = false;
    setReplayRunning(false);
    setReplayActive(false);
    setReplayData(null);
    if (st) {
      setCash(st.cash); setStockPositions(st.stockPositions); setOptionPositions(st.optionPositions);
      setTrades(st.trades); setPendingOrders(st.pendingOrders); setAlerts(st.alerts); setQuotes(st.quotes);
    }
    liveStashRef.current = null;
    showToast("Back to today's market and your main portfolio", "bull");
  };

  const handleUpgrade = async () => {
    setCheckoutBusy(true);
    track("upgrade_click");
    // Preferred path: a personal payment link from the create-payment-link Edge Function, which
    // lets the razorpay-webhook function switch Pro on automatically. Falls back to the static link.
    const win = window.open("", "_blank"); // open now, while we still have the click, so it isn't blocked
    try {
      const { data, error } = await supabase.functions.invoke("create-payment-link", { body: {} });
      if (!error && data?.short_url) {
        if (win) win.location.href = data.short_url; else window.open(data.short_url, "_blank", "noopener");
        track("payment_link_opened", { auto: true });
        showToast("Complete the payment in the new tab — Pro switches on automatically once it's paid.", "bull");
        setUpgradeModalOpen(false);
        const at = Date.now();
        setPaymentPendingAt(at);
        saveSetting(paymentKey, at);
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const sub = await onRefreshSubscription();
          if (sub?.status === "active" || attempts >= 40) { clearInterval(poll); setCheckoutBusy(false); }
        }, 5000);
        return;
      }
    } catch { /* function not deployed yet — use the static link below */ }
    if (win) win.close();
    track("payment_link_opened", { auto: false });
    startProCheckout({
      userEmail: contactEmail,
      onSuccess: () => {
        showToast("Complete the payment in the new tab — we'll show its status here.", "bull");
        setUpgradeModalOpen(false);
        const at = Date.now();
        setPaymentPendingAt(at);
        saveSetting(paymentKey, at);
        // No webhook/backend here, so we just poll Supabase in case Pro was
        // activated manually (or by a webhook you add later). This is best-effort,
        // not instant — refresh the page after paying if it doesn't pick up.
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          await onRefreshSubscription();
          if (attempts >= 10) { clearInterval(poll); setCheckoutBusy(false); }
        }, 3000);
        setTimeout(() => { clearInterval(poll); setCheckoutBusy(false); }, 30000);
      },
      onError: (msg) => {
        setCheckoutBusy(false);
        showToast(msg, "bear");
      },
    });
  };

  useEffect(() => { if (isPro) setCheckoutBusy(false); }, [isPro]);

  // Payment status banner: shown after the user opens the payment link, until Pro is active.
  useEffect(() => {
    if (isPaidPro && paymentPendingAt) {
      setPaymentPendingAt(null);
      saveSetting(paymentKey, null);
      showToast("Pro is active — thank you!", "bull");
    }
  }, [isPaidPro, paymentPendingAt]);
  const checkPaymentNow = async () => {
    setPaymentChecking(true);
    let sub = null;
    try { sub = await onRefreshSubscription(); } finally { setPaymentChecking(false); }
    if (sub?.status !== "active") showToast("Not activated yet — we'll keep checking. Paid already? Email us your payment ID for faster activation.", "bear");
  };
  const dismissPaymentBanner = () => { setPaymentPendingAt(null); saveSetting(paymentKey, null); };
  // Re-check every 2 minutes while a payment is pending and the tab is open.
  useEffect(() => {
    if (!paymentPendingAt || isPaidPro) return;
    return visibleInterval(() => { onRefreshSubscription(); }, 120000);
  }, [paymentPendingAt, isPaidPro]);

  // One-time nudge when the free trial has just run out (per-browser, since there's
  // no backend to track this server-side). Never fires for paid Pro users.
  useEffect(() => {
    if (isPaidPro || inTrial) return;
    const key = `wb_trial_ended_seen_${userId}`;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        showToast("Your 7-day free trial has ended — upgrade to keep Pro features", "bear");
        setUpgradeModalOpen(true);
      }
    } catch { /* localStorage unavailable */ }
  }, [isPaidPro, inTrial, userId]);

  // One market-order path for both the main screen and the pop-out chart window,
  // so every trade lands in the same cash, positions and history.
  const executeStockOrder = (sym, side, qtyIn) => {
    if (!marketStatus.isOpen) {
      return { ok: false, msg: replayActive ? "This replay day has ended — press Restart day to trade it again" : "Market is closed — orders can only be placed 9:15 AM–3:30 PM, Mon–Fri" };
    }
    const symMeta = allInstruments.find((s) => s.symbol === sym);
    if (!symMeta) return { ok: false, msg: "Unknown symbol" };
    if (symMeta.exchange === "INDEX") return { ok: false, msg: `${displayTicker(sym)} is an index — trade its options from the Options Chain tab` };
    // Only trade on a live price: the built-in starting prices are placeholders, not market prices.
    const price = quotes[sym]?.live ? quotes[sym].price : null;
    if (!price) return { ok: false, msg: "Price is still loading — try again in a moment" };
    const qty = Math.floor(Number(qtyIn));
    if (!(qty > 0)) return { ok: false, msg: "Enter a valid quantity" };
    const cost = price * qty;
    if (side === "buy") {
      if (cost > cash) return { ok: false, msg: "Insufficient buying power" };
      setCash((c) => c - cost);
      setStockPositions((prev) => {
        const existing = prev.find((p) => p.symbol === sym);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPrice = (existing.avgPrice * existing.qty + cost) / totalQty;
          return prev.map((p) => (p.symbol === sym ? { ...p, qty: totalQty, avgPrice } : p));
        }
        return [...prev, { id: uid(), symbol: sym, qty, avgPrice: price }];
      });
      logTrade(`BUY ${qty} ${displayTicker(sym)} @ ${fmtMoney(price)}`, -cost);
      return { ok: true, msg: `Bought ${qty} ${displayTicker(sym)} @ ${fmtMoney(price)}` };
    }
    const existing = stockPositions.find((p) => p.symbol === sym);
    const held = existing?.qty ?? 0;
    if (qty > held) return { ok: false, msg: `Only ${held} shares held` };
    setCash((c) => c + cost);
    setStockPositions((prev) => prev.map((p) => (p.symbol === sym ? { ...p, qty: p.qty - qty } : p)).filter((p) => p.qty > 0));
    logTrade(`SELL ${qty} ${displayTicker(sym)} @ ${fmtMoney(price)}`, cost, (price - existing.avgPrice) * qty);
    return { ok: true, msg: `Sold ${qty} ${displayTicker(sym)} @ ${fmtMoney(price)}` };
  };
  const executeStockOrderRef = useRef(executeStockOrder);
  executeStockOrderRef.current = executeStockOrder;

  // Suggested stop-loss for a new buy: 2% below the entry, rounded down to a 5-paisa tick.
  const suggestedStop = (price) => Math.floor(price * 0.98 * 20) / 20;
  const plannedStopFor = (entry) => {
    const manual = parseFloat(slPrice);
    return manual > 0 ? manual : suggestedStop(entry);
  };

  const placeStockOrder = (side) => {
    const entry = quotes[selected]?.price;
    const wantStop = side === "buy" && slOn && entry;
    const stop = wantStop ? plannedStopFor(entry) : null;
    if (wantStop && stop >= entry) return showToast(`Stop-loss must be below the current price (${fmtMoney(entry)})`, "bear");
    const wantTarget = side === "buy" && targetOn && isPro && entry;
    const target = wantTarget ? parseFloat(targetPrice) : null;
    if (wantTarget && !(target > entry)) return showToast(`Target must be above the current price (${fmtMoney(entry)})`, "bear");
    const bracketId = wantTarget ? uid() : null; // a target and stop placed together: when one fills, the other is cancelled
    const r = executeStockOrder(selected, side, orderQty);
    if (r.ok) closeOrderScreen();
    if (r.ok && wantTarget) {
      const qty = Math.floor(Number(orderQty));
      setPendingOrders((prev) => [{ id: uid(), symbol: selected, side: "sell", kind: "limit", qty, price: +target.toFixed(2), createdAt: new Date(nowMs()), bracketId }, ...prev]);
      setTargetPrice("");
      if (!wantStop) { showToast(`${r.msg} · target set at ${fmtMoney(target)}`, "bull"); return; }
    }
    if (r.ok && wantStop) {
      if (isPro) {
        const qty = Math.floor(Number(orderQty));
        setPendingOrders((prev) => [{ id: uid(), symbol: selected, side: "sell", kind: "stop", qty, price: +stop.toFixed(2), createdAt: new Date(nowMs()), bracketId }, ...prev]);
        showToast(`${r.msg} · stop-loss set at ${fmtMoney(stop)}${wantTarget ? `, target ${fmtMoney(target)}` : ""}`, "bull");
      } else {
        showToast(`${r.msg} · automatic stop-loss orders need Pro — watch your ${fmtMoney(stop)} level`, "bull");
      }
      setSlPrice("");
      return;
    }
    showToast(r.msg, r.ok && side === "buy" ? "bull" : "bear");
  };

  const placeConditionalOrder = (side) => {
    if (!marketStatus.isOpen) return showToast("Market is closed — orders can only be placed 9:15 AM–3:30 PM, Mon–Fri", "bear");
    const price = parseFloat(orderPrice);
    const qty = orderQty;
    if (!price || price <= 0) return showToast("Enter a valid price", "bear");
    if (qty <= 0) return showToast("Enter a valid quantity", "bear");

    if (side === "buy") {
      if (price * qty > cash) return showToast("Order exceeds available cash", "bear");
    } else {
      const held = stockPositions.find((p) => p.symbol === selected)?.qty ?? 0;
      if (qty > held) return showToast(`Only ${held} shares held`, "bear");
    }

    const order = { id: uid(), symbol: selected, side, kind: orderType, qty, price, createdAt: new Date() };
    setPendingOrders((prev) => [order, ...prev]);
    setOrderPrice("");
    closeOrderScreen();
    showToast(`${orderType === "limit" ? "Limit" : "Stop"} order placed: ${side} ${qty} ${displayTicker(selected)} @ ${fmtMoney(price)}`, side === "buy" ? "bull" : "bear");
  };

  const handleChartPricePick = (price) => {
    setOrderPrice(price.toFixed(2));
    setPickingPriceFromChart(false);
    showToast(`Price set from chart: ${fmtMoney(price)}`, "bull");
  };

  const startStopLossFromPosition = (p) => {
    if (!isPro) { setUpgradeModalOpen(true); return; }
    setSelected(p.symbol);
    setOrderType("stop");
    setOrderQty(p.qty);
    setOrderPrice("");
    setTab("trade");
    setPickingPriceFromChart(true);
    showToast(`Click a price on the ${displayTicker(p.symbol)} chart to set your stop-loss`, "bear");
  };

  const togglePickFromChart = () => {
    setPickingPriceFromChart((v) => {
      const next = !v;
      if (next && orderType === "market") setOrderType("limit");
      return next;
    });
  };

  const cancelOrder = (id) => {
    setPendingOrders((prev) => prev.filter((o) => o.id !== id));
    showToast("Order cancelled", "bear");
  };

  const openEditOrder = (o) => {
    setEditingOrder(o);
    setEditQty(o.qty);
    setEditPrice(String(o.price));
  };

  const saveEditOrder = () => {
    const qty = Math.max(1, parseInt(editQty) || 1);
    const price = parseFloat(editPrice);
    if (!price || price <= 0) return showToast("Enter a valid price", "bear");
    if (editingOrder.side === "buy" && price * qty > cash) return showToast("Order exceeds available cash", "bear");
    if (editingOrder.side === "sell") {
      const held = stockPositions.find((p) => p.symbol === editingOrder.symbol)?.qty ?? 0;
      if (qty > held) return showToast(`Only ${held} shares held`, "bear");
    }
    setPendingOrders((prev) => prev.map((o) => (o.id === editingOrder.id ? { ...o, qty, price } : o)));
    setEditingOrder(null);
    showToast("Order updated", "bull");
  };

  const exportTradesCSV = () => {
    if (!isPro) return setUpgradeModalOpen(true);
    if (trades.length === 0) return showToast("No trades to export", "bear");
    const escapeCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const header = "Time,Trade,Cash Impact,Realized P&L\n";
    const rows = trades
      .map((t) => `${t.time.toISOString()},${escapeCell(t.label)},${t.amount.toFixed(2)},${t.realized == null ? "" : t.realized.toFixed(2)}`)
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paperrally-history-${username}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Trade history exported", "bull");
  };

  const openTicket = (type, strike, expiry) => setTicket({ symbol: selected, type, strike, expiry: expiry.getTime() });

  // One option-order path for the order ticket and the pop-out chart window.
  // t = { symbol, type: "call" | "put", strike, expiry (ms) }; mode = buy | sell | short | cover.
  const executeOptionOrder = (t, mode, qtyIn, stopLoss = null) => {
    if (!marketStatus.isOpen) return { ok: false, closed: true, msg: replayActive ? "This replay day has ended — press Restart day to trade it again" : "Market is closed — orders can only be placed 9:15 AM–3:30 PM, Mon–Fri" };
    const qty = Math.floor(Number(qtyIn));
    if (!t || !(qty > 0)) return { ok: false, msg: "Enter a valid number of lots" };
    const ticket = t;
    const spot = quotes[ticket.symbol]?.live ? quotes[ticket.symbol].price : 0;
    const symMeta = allInstruments.find((s) => s.symbol === ticket.symbol);
    if (!symMeta || !spot) return { ok: false, msg: "Price is still loading — try again in a moment" };
    if (ticket.expiry <= nowMs()) return { ok: false, msg: "That expiry has passed — pick a later one" };
    const T = (ticket.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(ticket.strike - spot) / spot);
    const price = realPremium(ticket) ?? blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type).price;
    const lot = lotSizeFor(ticket.symbol);
    const premiumTotal = price * lot * qty;
    const label = `${ticket.type.toUpperCase()} ${displayTicker(ticket.symbol)} ${ticket.strike} ${fmtDate(new Date(ticket.expiry))}`;

    const plural = `${qty} lot${qty > 1 ? "s" : ""} (${qty * lot} units)`;
    const sameContract = (p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased;
    const longKey = (p) => sameContract(p) && !isShort(p);
    const shortKey = (p) => sameContract(p) && isShort(p);

    if (mode === "buy") {
      if (premiumTotal > cash) return { ok: false, msg: "Insufficient buying power" };
      setCash((c) => c - premiumTotal);
      setOptionPositions((prev) => {
        const existing = prev.find(longKey);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPremium = (existing.avgPremium * existing.qty + price * qty) / totalQty;
          return prev.map((p) => (longKey(p) ? { ...p, qty: totalQty, avgPremium, stopLoss: stopLoss ?? p.stopLoss ?? null } : p));
        }
        return [...prev, { id: uid(), symbol: ticket.symbol, type: ticket.type, strike: ticket.strike, expiry: ticket.expiry, qty, avgPremium: price, lotBased: true, side: "long", stopLoss }];
      });
      logTrade(`BTO ${plural} ${label} @ ${fmtMoney(price)}`, -premiumTotal);
      return { ok: true, kind: "bull", msg: `Bought ${plural} ${label}${stopLoss ? ` · SL ${fmtMoney(stopLoss)}` : ""}` };
    } else if (mode === "sell") {
      const existing = optionPositions.find(longKey);
      const held = existing?.qty ?? 0;
      if (qty > held) return { ok: false, msg: held ? `Only ${held} lot${held > 1 ? "s" : ""} held — use Sell to Open to go short` : "You don't hold this option — use Sell to Open to go short" };
      setCash((c) => c + premiumTotal);
      setOptionPositions((prev) => prev.map((p) => (longKey(p) ? { ...p, qty: p.qty - qty } : p)).filter((p) => p.qty > 0));
      logTrade(`STC ${plural} ${label} @ ${fmtMoney(price)}`, premiumTotal, (price - existing.avgPremium) * lot * qty);
      return { ok: true, kind: "bear", msg: `Sold ${plural} ${label}` };
    } else if (mode === "short") {
      const marginNeeded = shortMarginPerLot(spot, ticket.strike, ticket.type, lot) * qty;
      if (marginNeeded - premiumTotal > cash) return { ok: false, msg: `Insufficient margin — selling ${plural} needs about ${fmtMoney(marginNeeded, 0)}` };
      setCash((c) => c - marginNeeded + premiumTotal);
      setOptionPositions((prev) => {
        const existing = prev.find(shortKey);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPremium = (existing.avgPremium * existing.qty + price * qty) / totalQty;
          return prev.map((p) => (shortKey(p) ? { ...p, qty: totalQty, avgPremium, margin: (p.margin || 0) + marginNeeded, stopLoss: stopLoss ?? p.stopLoss ?? null } : p));
        }
        return [...prev, { id: uid(), symbol: ticket.symbol, type: ticket.type, strike: ticket.strike, expiry: ticket.expiry, qty, avgPremium: price, lotBased: true, side: "short", margin: marginNeeded, stopLoss }];
      });
      logTrade(`STO ${plural} ${label} @ ${fmtMoney(price)} (margin ${fmtMoney(marginNeeded, 0)} blocked)`, premiumTotal);
      return { ok: true, kind: "bear", msg: `Shorted ${plural} ${label} — margin ${fmtMoney(marginNeeded, 0)} blocked${stopLoss ? ` · SL ${fmtMoney(stopLoss)}` : ""}` };
    } else if (mode === "cover") {
      const existing = optionPositions.find(shortKey);
      const held = existing?.qty ?? 0;
      if (qty > held) return { ok: false, msg: held ? `Only ${held} lot${held > 1 ? "s" : ""} short` : "You have no short position in this option" };
      const release = (existing.margin || 0) * (qty / held);
      if (premiumTotal > cash + release) return { ok: false, msg: "Insufficient funds to buy back" };
      setCash((c) => c + release - premiumTotal);
      setOptionPositions((prev) => prev.map((p) => (shortKey(p) ? { ...p, qty: p.qty - qty, margin: (p.margin || 0) - release } : p)).filter((p) => p.qty > 0));
      logTrade(`BTC ${plural} ${label} @ ${fmtMoney(price)}`, -premiumTotal, (existing.avgPremium - price) * lot * qty);
      return { ok: true, kind: "bull", msg: `Covered ${plural} ${label}` };
    }
    return { ok: false, msg: "Unknown order type" };
  };

  const strategyExpiries = useCallback(
    (sym) => optionExpiries(sym, 4, replayActive && replayData ? replayData.dayStart : null),
    [replayActive, replayData]
  );
  // Places every leg of a strategy, or none: funds are checked for the whole set first.
  const placeStrategy = (sym, expiry, legs, lots) => {
    if (!marketStatus.isOpen) return showToast(replayActive ? "This replay day has ended — press Restart day to trade it again" : "Market is closed — press Practice today to try this in Replay", "bear");
    const spot = quotes[sym]?.price;
    if (!spot) return showToast("Price is still loading — try again in a moment", "bear");
    const lot = lotSizeFor(sym);
    const needed = legs.reduce((sum, l) => sum + (l.side === "buy" ? l.premium * lot * lots : (shortMarginPerLot(spot, l.strike, l.type, lot) - l.premium * lot) * lots), 0);
    if (needed > cash) return showToast(`Not enough funds — this needs about ${fmtMoney(needed, 0)} (margin is estimated per leg)`, "bear");
    const ordered = [...legs].sort((a, b) => (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1));
    for (const l of ordered) {
      const r = executeOptionOrder({ symbol: sym, type: l.type, strike: l.strike, expiry }, l.side === "buy" ? "buy" : "short", lots);
      if (!r.ok) return showToast(r.msg, "bear");
    }
    showToast(`Placed ${legs.length} leg${legs.length > 1 ? "s" : ""} on ${displayTicker(sym)}`, "bull");
    goTab("positions");
  };

  const executeOptionOrderRef = useRef(executeOptionOrder);
  executeOptionOrderRef.current = executeOptionOrder;

  const placeOptionOrder = (mode, qty, stopLoss = null) => {
    if (!ticket || qty <= 0) { if (!marketStatus.isOpen) setTicket(null); return; }
    const r = executeOptionOrder(ticket, mode, qty, stopLoss);
    showToast(r.msg, r.ok ? r.kind : "bear");
    if (r.ok || r.closed) setTicket(null);
  };

  const closeOptionPosition = (pos, atPrice = null, reason = null) => {
    if (atPrice == null && realPremium(pos) == null && !quotes[pos.symbol]?.live) { showToast("Price is still loading — try again in a moment", "bear"); return; }
    const spot = quotes[pos.symbol]?.price ?? 0;
    const symMeta = allInstruments.find((s) => s.symbol === pos.symbol);
    const T = (pos.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(pos.strike - spot) / spot);
    const price = atPrice ?? realPremium(pos) ?? blackScholes(spot, pos.strike, T, RISK_FREE, sigma, pos.type).price;
    const total = price * posMultiplier(pos) * pos.qty;
    const short = isShort(pos);
    setCash((c) => c + (short ? (pos.margin || 0) - total : total));
    setOptionPositions((prev) => prev.filter((p) => p.id !== pos.id));
    logTrade(`${reason ? `${reason} ` : ""}${short ? "BTC" : "STC"} ${pos.qty}x ${pos.type.toUpperCase()} ${displayTicker(pos.symbol)} ${pos.strike} @ ${fmtMoney(price)}`, short ? -total : total, (short ? pos.avgPremium - price : price - pos.avgPremium) * posMultiplier(pos) * pos.qty);
    showToast(reason ? `${reason}: ${pos.type === "call" ? "C" : "P"} ${displayTicker(pos.symbol)} ${pos.strike} closed @ ${fmtMoney(price)}` : "Position closed", "bear");
    if (reason) notify(`${reason}: ${displayTicker(pos.symbol)} ${pos.strike} ${pos.type.toUpperCase()}`, `Closed @ ${fmtMoney(price)}`, { tag: `sl-${pos.id}` });
  };

  const closeOptionFromPopout = (posId) => {
    if (!marketStatus.isOpen) return { ok: false, msg: replayActive ? "This replay day has ended" : "Market is closed — positions can be closed 9:15 AM–3:30 PM, Mon–Fri" };
    const pos = optionPositions.find((p) => p.id === posId);
    if (!pos) return { ok: false, msg: "That position is already closed" };
    closeOptionPosition(pos);
    return { ok: true, msg: `Closed ${pos.type.toUpperCase()} ${displayTicker(pos.symbol)} ${pos.strike}` };
  };
  const closeOptionFromPopoutRef = useRef(closeOptionFromPopout);
  closeOptionFromPopoutRef.current = closeOptionFromPopout;

  // ---- option stop-losses ----
  const openStopLossEditor = (pos) => {
    if (!isPro) { setUpgradeModalOpen(true); return; }
    const now = optionPremiumNow(pos, quotes, allInstruments) ?? pos.avgPremium;
    // default suggestion: 30% against the entry premium
    const suggested = pos.stopLoss ?? (isShort(pos) ? pos.avgPremium * 1.3 : pos.avgPremium * 0.7);
    setSlInput(String(+suggested.toFixed(2)));
    setSlEditing({ ...pos, nowPremium: now });
  };
  const saveStopLoss = () => {
    const v = parseFloat(slInput);
    if (!v || v <= 0) return showToast("Enter a valid stop-loss premium", "bear");
    const now = slEditing.nowPremium;
    if (now != null && (isShort(slEditing) ? v <= now : v >= now)) {
      return showToast(isShort(slEditing) ? `For a short option the stop-loss must be above the current premium (${fmtMoney(now)})` : `Stop-loss must be below the current premium (${fmtMoney(now)})`, "bear");
    }
    setOptionPositions((prev) => prev.map((p) => (p.id === slEditing.id ? { ...p, stopLoss: +v.toFixed(2) } : p)));
    setSlEditing(null);
    showToast(`Stop-loss set at ${fmtMoney(v)}`, "bull");
  };
  const removeStopLoss = (id) => {
    setOptionPositions((prev) => prev.map((p) => (p.id === id ? { ...p, stopLoss: null } : p)));
    setSlEditing(null);
    showToast("Stop-loss removed", "bear");
  };

  // Close any option position whose stop-loss has been hit, each time prices update.
  const slFiredRef = useRef(new Set());
  useEffect(() => {
    optionPositions.forEach((p) => {
      if (!p.stopLoss || slFiredRef.current.has(p.id)) return;
      if (realPremium(p) == null && !quotes[p.symbol]?.live) return; // wait for a live price, not the placeholder
      const prem = optionPremiumNow(p, quotes, allInstruments);
      if (prem == null || !stopLossHit(p, prem)) return;
      slFiredRef.current.add(p.id);
      closeOptionPosition(p, prem, "SL hit");
    });
  }, [quotes, optTick]);

  // Close buttons open a confirmation first — one stray tap on a phone shouldn't exit a trade.
  const requestClose = (kind, pos) => {
    if (!marketStatus.isOpen) {
      return showToast(replayActive ? "This replay day has ended — press Restart day to trade it again" : "Market is closed — positions can be closed 9:15 AM–3:30 PM, Mon–Fri", "bear");
    }
    setCloseConfirm({ kind, pos });
  };
  const confirmClose = () => {
    const c = closeConfirm;
    setCloseConfirm(null);
    if (!c) return;
    if (!marketStatus.isOpen) return showToast("Market is closed — the position was not closed", "bear");
    if (c.kind === "stock") {
      const live = stockPositions.find((p) => p.id === c.pos.id);
      if (live) {
        closeStockPosition(live);
        // The position is gone, so its protective stop orders have nothing left to sell.
        setPendingOrders((prev) => prev.filter((o) => !(o.symbol === live.symbol && o.side === "sell" && o.kind === "stop")));
      }
    } else {
      const live = optionPositions.find((p) => p.id === c.pos.id);
      if (live) closeOptionPosition(live);
    }
  };

  const closeStockPosition = (pos) => {
    const price = quotes[pos.symbol]?.price ?? 0;
    const total = price * pos.qty;
    setCash((c) => c + total);
    setStockPositions((prev) => prev.filter((p) => p.id !== pos.id));
    logTrade(`SELL ${pos.qty} ${displayTicker(pos.symbol)} @ ${fmtMoney(price)}`, total, (price - pos.avgPrice) * pos.qty);
    showToast("Position closed", "bear");
  };

  const doReset = () => {
    // A reset would wipe out a losing week, so it also takes you off this week's leaderboard.
    const wk = isoWeekIST();
    setWeekStart({ week: wk, equity: STARTING_CASH, reset: true });
    if (prefs.lbJoined) supabase.from("leaderboard").delete().eq("user_id", userId).eq("week", wk).then(() => {}, () => {});
    setCash(STARTING_CASH);
    setStockPositions([]);
    setOptionPositions([]);
    setTrades([]);
    setAlerts([]);
    setPendingOrders([]);
    setConfirmReset(false);
    showToast("Account reset", "bull");
  };

  const addAlert = () => {
    const target = parseFloat(alertTarget);
    if (!target || target <= 0) return showToast("Enter a valid target price", "bear");
    setAlerts((prev) => [...prev, { id: uid(), symbol: selected, target, direction: alertDirection, triggered: false }]);
    setAlertTarget("");
    showToast(`Alert set for ${displayTicker(selected)}`, "bull");
  };
  const deleteAlert = (id) => setAlerts((prev) => prev.filter((a) => a.id !== id));
  const activeAlerts = alerts.filter((a) => !a.triggered).length;

  const bseTab = exchangeFilter === "BSE";
  const filteredInstruments = allInstruments.filter((s) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || displayTicker(s.symbol).toLowerCase().includes(query) || s.name.toLowerCase().includes(query);
    // On the BSE tab, search stays within BSE (the full BSE list below covers the rest).
    const matchesExchange = bseTab ? s.exchange === "BSE" : query ? true : (exchangeFilter === "ALL" || s.exchange === exchangeFilter);
    return matchesExchange && matchesSearch;
  });

  // ---- Full BSE list (loaded on first visit to the BSE tab) ----
  const [bseAll, setBseAll] = useState(null); // [[ticker, name, mcapCr], ...] largest first
  const [bseLoadError, setBseLoadError] = useState(false);
  const [bseShown, setBseShown] = useState(150);
  useEffect(() => {
    if (!bseTab || bseAll) return;
    let cancelled = false;
    fetch("/bse-stocks.json")
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setBseAll(j.stocks || []); })
      .catch(() => { if (!cancelled) setBseLoadError(true); });
    return () => { cancelled = true; };
  }, [bseTab, bseAll]);
  useEffect(() => { setBseShown(150); }, [search, exchangeFilter]);
  const bseMatches = useMemo(() => {
    if (!bseAll) return [];
    const query = search.trim().toLowerCase();
    const have = new Set(allInstruments.map((s) => s.symbol));
    return bseAll.filter(([t, n]) => !have.has(`${t}.BO`) && (!query || t.toLowerCase().includes(query) || n.toLowerCase().includes(query)));
  }, [bseAll, search, allInstruments]);
  const fmtCrore = (cr) => (cr >= 1 ? `₹${cr.toLocaleString("en-IN")} Cr` : "—");

  const currentExpiry = expiries[expiryIdx] ?? expiries[0];
  const chainStep = EXPIRY_RULES[viewSym]?.step ?? strikeStep(q?.price ?? meta.fallback);
  const chainStrikes = strikesAround(q?.price ?? meta.fallback, 9, chainStep);
  const T = currentExpiry ? (currentExpiry.getTime() - nowMs()) / (365 * 24 * 3600 * 1000) : 0;
  {
    const wanted = new Map();
    const want = (c) => { if (c.symbol && c.expiry && !wanted.has(contractKey(c))) wanted.set(contractKey(c), { symbol: c.symbol, strike: c.strike, type: c.type, expiry: c.expiry }); };
    optionPositions.forEach(want);
    if (ticket) want(ticket);
    if (tab === "chain" && selected && currentExpiry) chainStrikes.forEach((strike) => { want({ symbol: selected, strike, type: "call", expiry: currentExpiry.getTime() }); want({ symbol: selected, strike, type: "put", expiry: currentExpiry.getTime() }); });
    optWantedRef.current = replayActive ? [] : [...wanted.values()];
  }

  // ---- weekly challenge: track the start-of-week equity, sync the leaderboard row ----
  const weekKey = isoWeekIST(nowMs());
  useEffect(() => {
    if (replayActive || !pricesReady) return;
    if (!weekStart || weekStart.week !== weekKey) {
      if (weekStart && !weekStart.reset && equity > weekStart.equity) updatePrefs({ flags: { green_week: true } });
      setWeekStart({ week: weekKey, equity });
    }
  }, [weekKey, pricesReady, replayActive]);
  const weekValid = !!(weekStart && weekStart.week === weekKey && weekStart.equity > 0);
  const weekReturn = weekValid && !replayActive ? ((equity - weekStart.equity) / weekStart.equity) * 100 : 0;
  const weekTrades = replayActive ? 0 : trades.filter((t) => isoWeekIST(t.time) === weekKey).length;
  const resetThisWeek = !!(weekStart?.reset && weekStart.week === weekKey);
  const lbSyncRef = useRef(0);
  const syncLeaderboard = (force = false, nameOverride = null) => {
    const name = nameOverride || prefs.lbName;
    if (!name || replayActive || !weekValid || resetThisWeek) return;
    if (!force && Date.now() - lbSyncRef.current < 60000) return;
    lbSyncRef.current = Date.now();
    supabase.from("leaderboard").upsert({
      user_id: userId, week: weekKey, display_name: name,
      return_pct: Math.max(-100, Math.min(100000, +weekReturn.toFixed(3))), trades: weekTrades, updated_at: new Date().toISOString(),
    }).then(() => {}, () => {});
  };
  useEffect(() => { if (prefs.lbJoined && pricesReady) syncLeaderboard(); }, [prefs.lbJoined, pricesReady, Math.round(weekReturn * 100), weekTrades]);
  const joinLeaderboard = (name) => {
    updatePrefs({ lbJoined: true, lbName: name, flags: { challenger: true } });
    syncLeaderboard(true, name);
    track("leaderboard_join");
    showToast("You're on this week's leaderboard — good luck!", "bull");
  };
  const leaveLeaderboard = () => {
    updatePrefs({ lbJoined: false });
    supabase.from("leaderboard").delete().eq("user_id", userId).eq("week", weekKey).then(() => {}, () => {});
    showToast("You've left the leaderboard", "bear");
  };

  // ---- share cards ----
  const shareWeek = async () => {
    const closes = trades.filter((t) => t.realized != null && isoWeekIST(t.time) === weekKey);
    const wins = closes.filter((t) => t.realized > 0).length;
    const pnl = weekValid ? equity - weekStart.equity : 0;
    const blob = await makeShareImage({
      title: "My week on PaperRally",
      bigValue: fmtPct(weekReturn),
      positive: weekReturn >= 0,
      lines: [["Virtual P&L", fmtMoney(pnl, 0)], ["Trades this week", String(weekTrades)], ["Win rate", closes.length ? `${Math.round((wins / closes.length) * 100)}%` : "—"]],
    });
    const r = await shareImage(blob, `My paper-trading week: ${fmtPct(weekReturn)} on PaperRally. Practise NSE & NIFTY options free → https://paperrally.in/?ref=${userId}`);
    track("share_card", { result: r });
    if (r === "downloaded") showToast("Image saved — share it on WhatsApp or Instagram", "bull");
  };

  // ---- achievements ----
  const unlockedNow = useMemo(() => computeAchievements(trades, { ...(prefs.flags || {}), installed: prefs.flags?.installed || install.standalone }), [trades, prefs.flags, install.standalone]);
  useEffect(() => {
    if (replayActive) return;
    const stored = prefs.achievements;
    const now = [...unlockedNow];
    if (!stored) { updatePrefs({ achievements: now }); return; } // first run: record silently
    const fresh = now.filter((id) => !stored.includes(id));
    if (!fresh.length) return;
    updatePrefs({ achievements: [...stored, ...fresh] });
    const first = ACHIEVEMENTS.find((a) => a.id === fresh[0]);
    showToast(`${first.icon} Achievement unlocked: ${first.title}${fresh.length > 1 ? ` (+${fresh.length - 1} more)` : ""}`, "bull");
    track("achievement", { id: fresh[0] });
  }, [unlockedNow, replayActive]);

  // ---- links from outside: ?paid=1 after Razorpay, ?tab=… from home-screen shortcuts ----
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    let changed = false;
    if (qs.get("paid") === "1") {
      qs.delete("paid"); changed = true;
      if (!isPaidPro) { const at = Date.now(); setPaymentPendingAt(at); saveSetting(paymentKey, at); onRefreshSubscription(); }
    }
    const t = qs.get("tab");
    if (t && ["positions", "orders", "replay", "perf", "leaderboard", "learn", "history", "strategies"].includes(t)) { setTab(t); qs.delete("tab"); changed = true; }
    if (qs.get("source") === "pwa") { updatePrefs({ flags: { installed: true } }); qs.delete("source"); changed = true; }
    if (changed) window.history.replaceState(window.history.state, "", window.location.pathname + (qs.toString() ? `?${qs}` : "") + window.location.hash);
    track("app_open", { standalone: install.standalone, mobile: isMobile });
  }, []);

  // ---- guided tour (once per account, on this browser) ----
  const tourKey = `pr_tour_done_${userId}`;
  const startTour = () => {
    if (!selected) setSelected(allInstruments.some((s) => s.symbol === "RELIANCE.NS") ? "RELIANCE.NS" : allInstruments.find((s) => s.exchange !== "INDEX")?.symbol);
    setTab("trade");
    setMoreOpen(false);
    if (isMobile) setMobilePane("main");
    setTimeout(() => setTourOpen(true), 250);
  };
  useEffect(() => {
    if (loadSetting(tourKey, false) || !neverTradedRef.current) return; // existing users can start it from More / Learn
    const t = setTimeout(() => { if (!document.querySelector(".modalOverlay")) startTour(); }, 1800);
    return () => clearTimeout(t);
  }, []);
  const finishTour = (completed) => {
    setTourOpen(false);
    saveSetting(tourKey, true);
    track(completed ? "tour_complete" : "tour_skipped");
  };
  const tourSteps = [
    { title: "Pick a stock", text: isMobile ? "Tap Watchlist to see NSE & BSE prices. Tap any stock to open its chart." : "Your watchlist shows NSE & BSE prices. Click any stock to open its chart, or search all 5,000+ BSE companies.", target: () => document.querySelector(isMobile ? ".bottomNav .bottomNavItem" : ".watchlist") },
    { title: "Read the chart", text: "Switch timeframes, add indicators like RSI and MACD, and draw trendlines. Practice today replays the market from 9:15 AM.", target: () => document.querySelector(".chartCard") },
    { title: "Place a practice trade", text: `${isMobile ? "Tap Buy, then choose" : "Choose"} a quantity, keep the suggested stop-loss, and check how much you'd risk before you press Buy. It's all virtual money.`, target: () => (isMobile ? document.querySelector(".mTradeBar") : document.getElementById("stockOrderCard")) },
    { title: "Test your ideas", text: isMobile ? "Under More → Strategies, the Rule tester shows how a rule like the 15-minute breakout did on past days — in seconds." : "Strategies has a Rule tester: pick a rule like the 15-minute opening breakout and see how it did on past days, in seconds.", target: () => document.querySelector(isMobile ? ".bottomNav .bottomNavItem:last-child" : ".tab-strategies") },
    { title: "Track and improve", text: isMobile ? "Positions shows your P&L. Under More you'll find Performance, the weekly Leaderboard and Learn." : "Positions shows P&L. Performance shows your win rate and habits, and the Leaderboard runs a new challenge every week.", target: () => document.querySelector(isMobile ? ".bottomNav" : ".tabs") },
  ];

  const feedbackHref = mailtoSupport("PaperRally feedback", `Hi PaperRally team,\n\nWhat I like:\n\nWhat's confusing or broken:\n\nWhat I'd love to see next:\n\n— ${username} (${isMobile ? "phone" : "desktop"})`);
  const enableNotifications = async () => {
    const r = await requestNotifications();
    setNotifPerm(r);
    if (r === "granted") { showToast("Notifications on — alerts, fills and stop-losses reach you even when the app is in the background", "bull"); notify("Notifications are on", "You'll hear from PaperRally when an alert or stop-loss fires.", { force: true }); }
    else if (r === "denied") showToast("Notifications are blocked — allow them for paperrally.in in your browser settings", "bear");
  };
  // Native prompt when the browser offers one (Android Chrome/Edge); otherwise step-by-step help.
  const doInstall = async () => {
    setMoreOpen(false);
    if (!install.canInstall) { setInstallHelpOpen(true); track("install_help", { platform: install.platform }); return; }
    const r = await install.promptInstall();
    track("install_prompt", { result: r });
    if (r === "accepted") updatePrefs({ flags: { installed: true } });
  };
  const dismissInstallBanner = () => { setInstallBannerDismissed(true); saveSetting(installBannerKey, true); };

  const TAB_DEFS = [
    ["trade", "Chart & Trade"],
    ["indicators", `Indicators${activeIndicatorCount ? ` (${activeIndicatorCount})` : ""}`],
    ["chain", "Options Chain"],
    ["positions", "Positions"],
    ["orders", `Orders${pendingOrders.length ? ` (${pendingOrders.length})` : ""}`],
    ["strategies", "Strategies"],
    ["alerts", `Alerts${activeAlerts ? ` (${activeAlerts})` : ""}`],
    ["news", "News"],
    ["history", "History"],
    ["perf", "Performance"],
    ["leaderboard", "Leaderboard"],
    ["replay", "Replay"],
    ["learn", L.learnTab],
  ];
  // "Why did you take this trade?" sits in the order box, or below the chart once the phone order screen has closed.
  const renderTagPrompt = () => {
    const lt = lastTradeId && trades[0]?.id === lastTradeId ? trades[0] : null;
    if (!lt || lt.realized != null) return null;
    return (
      <div className="tagPrompt">
        <div className="tagPromptQ">{lt.tag ? <>Tagged: <b>{lt.tag}</b></> : "Why did you take this trade?"}</div>
        <TagChips compact value={lt.tag} onPick={(tag) => { setTrades((prev) => prev.map((t) => (t.id === lt.id ? { ...t, tag } : t))); if (tag) track("trade_tagged", { tag }); }} />
      </div>
    );
  };
  const strategyApi = {
    getSpot: (sym) => quotes[sym]?.price ?? null,
    expiriesFor: strategyExpiries,
    stepFor: (sym) => EXPIRY_RULES[sym]?.step ?? 50,
    lotFor: lotSizeFor,
    priceLeg: (sym, strike, type, expiry) => optionPremiumNow({ symbol: sym, strike, type, expiry }, quotes, allInstruments),
    onPlace: placeStrategy,
    marketOpen: marketStatus.isOpen,
    fmtMoney,
    fmtExpiry: fmtDate,
    now: nowMs,
    fetchIntraday: (sym, period1, period2) => fetchYahooRange(sym, "5m", period1, period2),
    fetchDaily: (sym, fromISO, toISO) => fetchYahooRange(sym, "1d", Math.floor(new Date(`${fromISO}T00:00:00+05:30`).getTime() / 1000), Math.floor(new Date(`${toISO}T23:59:59+05:30`).getTime() / 1000)),
    backtestConfig: (sym) => {
      const iv = allInstruments.find((i) => i.symbol === sym)?.iv ?? 0.13;
      return {
        step: EXPIRY_RULES[sym]?.step ?? 50,
        lot: lotSizeFor(sym),
        expiryFor: (at) => optionExpiries(sym, 1, at)[0]?.getTime(),
        price: (S, K, T, type) => blackScholes(S, K, T, RISK_FREE, iv * (1 + 0.15 * Math.abs(K - S) / S), type).price,
      };
    },
  };
  const navBackLink = navBack && (
    <button type="button" className="navBackBtn" onClick={() => window.history.back()}>
      <ArrowLeft size={14} /> Back to {navBack.pane === "watchlist" ? "Watchlist" : TAB_DEFS.find(([id]) => id === navBack.tab)?.[1] || "previous screen"}
    </button>
  );

  // Order-ticket helpers: quantity shortcuts and the planned stop-loss / risk preview.
  const tradePrice = selected ? (orderType === "market" ? q.price : parseFloat(orderPrice) || q.price) : 0;
  const heldShares = selected ? (stockPositions.find((p) => p.symbol === selected)?.qty ?? 0) : 0;
  const maxAffordable = tradePrice > 0 ? Math.max(0, Math.floor(cash / tradePrice)) : 0;
  const qtyShortcuts = [
    ["1", 1],
    ["10", 10],
    ["25%", Math.floor(maxAffordable * 0.25)],
    ["50%", Math.floor(maxAffordable * 0.5)],
    ["Max", maxAffordable],
  ];
  const plannedStop = selected && tradePrice ? plannedStopFor(tradePrice) : 0;
  const riskAmount = slOn && plannedStop > 0 && plannedStop < tradePrice ? (tradePrice - plannedStop) * orderQty : null;
  const capitalBase = Math.max(1, equity);
  const positionPct = ((tradePrice * orderQty) / capitalBase) * 100;
  const riskPct = riskAmount != null ? (riskAmount / capitalBase) * 100 : null;

  return (
    <div className="app" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>

      <div className="topbar">
        <div className="brand">
          <Flame size={20} className="brandIcon" />
          <span>PAPERRALLY</span>
          <span className="brandSub">paper terminal</span>
        </div>
        <div className="stats">
          {replayActive && <span className="replayBadge">REPLAY</span>}
          <Stat label="Cash" value={fmtMoney(cash, 0)} />
          <Stat label="Equity" value={pricesReady ? fmtMoney(equity, 0) : "Loading…"} pulse={pulse} />
          <Stat label="Total P&L" value={pricesReady ? fmtMoney(dayPnl, 0) : "Loading…"} tone={pricesReady ? (dayPnl >= 0 ? "bull" : "bear") : ""} />
          <Stat className="statSecondary" label="Realized" value={pricesReady ? fmtMoney(realizedPnl, 0) : "…"} tone={pricesReady ? (realizedPnl >= 0 ? "bull" : "bear") : ""} />
          <Stat className="statSecondary" label="Unrealized" value={pricesReady ? fmtMoney(unrealizedPnl, 0) : "…"} tone={pricesReady ? (unrealizedPnl >= 0 ? "bull" : "bear") : ""} />
        </div>
        <div className="topbarActions">
          <button type="button" className="userBadge userBadgeBtn" onClick={openAccount} title="View your account details">
            <UserIcon size={13} />{username}
            {isPaidPro && <span className="proBadge">PRO</span>}
            {inTrial && <span className="proBadge proBadgeTrial" title="Every feature is free during your first week">ALL FREE · {trialDaysLeft}D LEFT</span>}
          </button>
          {/* No upgrade prompts during the free first week — only once it's over. */}
          {!isPaidPro && !inTrial && (
            <button className="upgradeBtn" onClick={() => setUpgradeModalOpen(true)}><Sparkles size={13} /> Upgrade to Pro</button>
          )}
          {!install.standalone && (install.canInstall || install.platform !== "desktop") && <button className="resetBtn installBtn hlBtn" onClick={doInstall} title="Install PaperRally as an app"><Smartphone size={14} /> Install app</button>}
          <a className="resetBtn feedbackBtn hlBtn" href={feedbackHref} title="Tell us what to improve"><MessageSquare size={14} /> Feedback</a>
          <button className="resetBtn" onClick={popOutChart} title="Open a full-day chart in a new window"><Maximize2 size={14} /> Pop-out chart</button>
          <button className="themeBtn" onClick={cycleTheme} title="Change background theme"><span className="themeEmoji">{THEMES[themeIdx].emoji}</span> {THEMES[themeIdx].name}</button>
          <button className="resetBtn" onClick={() => setConfirmReset(true)}><RotateCcw size={14} /> Reset</button>
          <button
            className="resetBtn practiceTopBtn"
            onClick={replayActive ? restartReplayDay : practiceToday}
            disabled={replayBusy}
            title={replayActive ? "Reset the clock to 9:15 AM and start this day's practice over" : "Rewind today to the 9:15 AM open and practice it with a separate practice balance"}
          >
            <Play size={14} /> {replayBusy ? "Loading…" : replayActive ? "Restart day" : "Practice today"}
          </button>
          <button className="resetBtn" onClick={onLogout}><LogOut size={14} /> Log out</button>
        </div>
      </div>

      {replayActive && replayData && (
        <div className="replayBar">
          <span className="replayBarTag">Replay</span>
          <span className="mono replayBarClock">{fmtReplayTime(replayClock)} IST</span>
          <button className="indToggle" onClick={() => setReplayRunning((r) => !r)} disabled={replayClock >= replayData.dataEnd}>{replayRunning ? "Pause" : "Play"}</button>
          {[1, 5, 30, 60].map((r) => (
            <button key={r} className={`indToggle ${replayRate === r ? "indToggleActive" : ""}`} onClick={() => setReplayRate(r)}>{r}x</button>
          ))}
          <button className="indToggle" onClick={() => setReplayClock((c) => Math.max(c - 15 * 60000, replayData.dayStart))} disabled={replayClock <= replayData.dayStart}>−15 min</button>
          <button className="indToggle" onClick={() => setReplayClock((c) => Math.min(c + 15 * 60000, replayData.dataEnd))} disabled={replayClock >= replayData.dataEnd}>+15 min</button>
          <button className="indToggle" onClick={restartReplayDay} disabled={replayBusy}>{replayBusy ? "Loading…" : "Restart from 9:15"}</button>
          <button className="indToggle" onClick={popOutChart}>Pop out chart</button>
          <button className="resetBtn replayExitBtn" onClick={exitReplay}>Exit replay</button>
          <ReplayTimeline
            dayStart={replayData.dayStart}
            dayEnd={replayData.dayEnd}
            dataEnd={replayData.dataEnd}
            clock={replayClock}
            onSeek={setReplayClock}
            onScrubStart={() => setReplayRunning(false)}
          />
        </div>
      )}

      {paymentPendingAt && !isPaidPro && (
        <div className="paymentBar" role="status">
          <Hourglass size={15} className="paymentBarIcon" />
          <div className="paymentBarText">
            <b>Payment being verified.</b> Pro usually activates within a few hours of paying — this page checks automatically.
            {" "}Paid already? Send us your Razorpay payment ID for faster activation.
          </div>
          <div className="paymentBarBtns">
            <button className="btn btnGhost" onClick={checkPaymentNow} disabled={paymentChecking}>{paymentChecking ? "Checking…" : "Check now"}</button>
            <a className="btn btnGhost" href={mailtoSupport("PaperRally Pro payment — please activate", `Hi, I've paid for PaperRally Pro.\n\nUsername: ${username}\nAccount ID: ${userId}\nRazorpay payment ID: \n\nThanks!`)}><Mail size={13} /> Email payment ID</a>
            <button className="iconBtn" onClick={dismissPaymentBanner} aria-label="Hide payment status"><X size={14} /></button>
          </div>
        </div>
      )}

      {isMobile && !install.standalone && !installBannerDismissed && firstTradeDone && (
        <div className="installBar">
          <Smartphone size={18} className="installBarIcon" />
          <div className="installBarText"><b>Get the PaperRally app</b><span className="dim">Opens full-screen, loads fast, sends alert notifications.</span></div>
          <button className="btn btnBull" onClick={doInstall}>Install</button>
          <button className="iconBtn" onClick={dismissInstallBanner} aria-label="Hide install suggestion"><X size={14} /></button>
        </div>
      )}

      {!firstTradeDone && (
        <div className="firstTradeCard">
          <button className="firstTradeClose" onClick={markFirstTradeDone} aria-label="Dismiss"><X size={14} /></button>
          <div className="firstTradeTitleRow">
            <div className="firstTradeTitle"><GraduationCap size={16} /> {L.firstTrade.title}</div>
            <LangSwitch lang={lang} onChange={setLang} />
          </div>
          <p className="firstTradeText">
            {replayActive && replayData
              ? L.firstTrade.replayText(new Date(replayData.dayStart).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }))
              : L.firstTrade.liveText}
          </p>
          <ol className="firstTradeSteps">
            <li><button className="btn btnBull firstTradeBtn" onClick={() => { setUpFirstTrade(); if (isMobile) setMobilePane("main"); }}><TrendingUp size={14} /> {L.firstTrade.setup}</button></li>
            <li>{L.firstTrade.step2}</li>
            <li>{L.firstTrade.step3}</li>
          </ol>
        </div>
      )}
      {!liveMarketStatus.isOpen && !replayActive && (
        <div className="closedBar">
          <span className="closedBarTag">Market closed</span>
          <span className="closedBarText">Orders open at 9:15 AM, Mon–Fri. Meanwhile, practise the last session ({lastSessionLabel}) candle by candle — with separate practice money.</span>
          <button className="btn btnBull closedBarBtn" onClick={practiceLastSession} disabled={replayBusy}><Play size={13} /> {replayBusy ? "Loading…" : "Start practice"}</button>
        </div>
      )}

      <div className="body">
        <div className={`watchlist ${isMobile && mobilePane !== "watchlist" ? "mHidden" : ""}`}>
          {isMobile && navBackLink}
          <input className="search" placeholder="Search name or ticker, e.g. Tata Motors" aria-label="Search stocks by name or ticker" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="exchangeTabs">
            {["ALL", "NSE", "BSE", "INDEX"].map((ex) => (
              <button key={ex} className={`exTab ${exchangeFilter === ex ? "exTabActive" : ""}`} onClick={() => setExchangeFilter(ex)}>{ex === "INDEX" ? "Index" : ex}</button>
            ))}
          </div>
          <div className="wlHead">
            <span>{replayActive ? "Replay: past session prices" : `Prices from your ${activeBroker()?.name ?? "broker"} connection`}</span>
            <Activity size={12} className={quotes[selected]?.live ? "liveDot" : "liveDotOff"} />
          </div>
          <div className="wlList">
            {filteredInstruments.length > 0 ? (
              filteredInstruments.map((s) => {
                const qq = quotes[s.symbol];
                const chg = qq.prevClose ? ((qq.price - qq.prevClose) / qq.prevClose) * 100 : 0;
                const up = chg >= 0;
                return (
                  <button key={s.symbol} className={`wlRow ${selected === s.symbol ? "wlRowActive" : ""}`} aria-current={selected === s.symbol ? "true" : undefined} onClick={() => pickSymbol(s.symbol)}>
                    <div className="wlSym">
                      <span className="wlTicker">{displayTicker(s.symbol)}<span className={`exBadge exBadge-${s.exchange}`}>{exchangeBadge(s.exchange)}</span></span>
                      <span className="wlName">{s.name}</span>
                    </div>
                    <div className="wlPriceCol">
                      {qq.live || replayActive ? (<>
                        <span className="wlPrice mono">{fmtMoney(qq.price)}</span>
                        <span className={`wlChg mono ${up ? "bull" : "bear"}`}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{fmtPct(chg)}</span>
                      </>) : <span className="wlLoading dim">Loading…</span>}
                    </div>
                  </button>
                );
              })
            ) : bseTab ? (
              search.trim() ? null : <div className="wlEmpty dim">No BSE stocks in your watchlist yet — pick one below.</div>
            ) : searchingRemote ? (
              <div className="wlEmpty dim">Searching NSE &amp; BSE for &ldquo;{search}&rdquo;…</div>
            ) : remoteResults.length > 0 ? (
              <>
                <div className="wlRemoteLabel dim">{isPro ? "Not in your watchlist — add from NSE/BSE:" : "Found on NSE/BSE — adding stocks beyond the starter list is a Pro feature:"}</div>
                {remoteResults.map((r) => (
                  <button key={r.symbol} className="wlRow wlRowAdd" onClick={() => addCustomInstrument(r)}>
                    <div className="wlSym">
                      <span className="wlTicker">{displayTicker(r.symbol)}<span className={`exBadge exBadge-${r.exchange}`}>{exchangeBadge(r.exchange)}</span></span>
                      <span className="wlName">{r.name}</span>
                    </div>
                    <span className="addBadge">{isPro ? "+ Add" : <><Lock size={10} /> Pro</>}</span>
                  </button>
                ))}
              </>
            ) : !search.trim() ? (
              <div className="wlEmpty dim">Nothing in this list yet.</div>
            ) : (
              <div className="wlEmpty">
                <div className="wlEmptyTitle">No match for &ldquo;{search.trim()}&rdquo;{search.trim().length >= 2 ? " on NSE or BSE" : ""}</div>
                <div className="dim wlEmptyTips">
                  {search.trim().length < 2
                    ? "Type at least 2 letters to search all NSE & BSE stocks."
                    : <>Try the company name instead of the ticker (e.g. <i>Tata Motors</i>, <i>State Bank</i>), check the spelling, or browse the <b>BSE</b> tab for every listed company.</>}
                </div>
                <div className="wlEmptyBtns">
                  <button className="btn btnGhost" onClick={() => setSearch("")}>Clear search</button>
                  <button className="btn btnGhost" onClick={() => { setSearch(""); setExchangeFilter("BSE"); }}>Browse all BSE</button>
                </div>
              </div>
            )}

            {bseTab && (
              <div className="bseAll">
                <div className="wlRemoteLabel dim bseAllHead">
                  {bseAll
                    ? <>All BSE stocks · {bseMatches.length.toLocaleString("en-IN")}{search.trim() ? ` matching “${search.trim()}”` : ""} · largest first</>
                    : bseLoadError ? "Couldn't load the BSE list — check your connection and reopen this tab." : "Loading all BSE stocks…"}
                </div>
                {bseMatches.slice(0, bseShown).map(([t, n, mcap]) => (
                  <button key={t} className="wlRow wlRowAdd" onClick={() => addCustomInstrument({ symbol: `${t}.BO`, name: n, exchange: "BSE" })}>
                    <div className="wlSym">
                      <span className="wlTicker">{t}<span className="exBadge exBadge-BSE">{exchangeBadge("BSE")}</span></span>
                      <span className="wlName">{n}</span>
                    </div>
                    <div className="wlPriceCol">
                      <span className="wlPrice mono bseMcap">{fmtCrore(mcap)}</span>
                      <span className="addBadge">{isPro ? "+ Add" : <><Lock size={10} /> Pro</>}</span>
                    </div>
                  </button>
                ))}
                {bseMatches.length > bseShown && (
                  <button className="btn btnGhost bseMoreBtn" onClick={() => setBseShown((n) => n + 300)}>
                    Show more ({(bseMatches.length - bseShown).toLocaleString("en-IN")} left)
                  </button>
                )}
                {bseAll && bseMatches.length === 0 && search.trim() && <div className="wlEmpty dim">No BSE stock matches &ldquo;{search}&rdquo;.</div>}
              </div>
            )}
          </div>
        </div>

        <div className={`main ${isMobile && mobilePane === "watchlist" ? "mHidden" : ""}`}>
          {navBackLink}
          {selected ? (
          <div className="mainHead">
            <div className="mainHeadLeft">
              <h1>{displayTicker(selected)}</h1>
              <span className={`exBadge exBadge-${meta.exchange}`}>{exchangeBadge(meta.exchange)}</span>
              <span className="mainHeadName">{meta.name}</span>
            </div>
            <div className="mainHeadPrice">
              {q.live || replayActive ? (<>
                <span className="mono bigPrice">{fmtMoney(q.price)}</span>
                <span className={`mono ${q.price >= q.prevClose ? "bull" : "bear"}`}>{fmtPct(((q.price - q.prevClose) / q.prevClose) * 100)}</span>
              </>) : <span className="dim wlLoading">Loading live price…</span>}
              <span className={`marketStatusBadge ${marketStatus.isOpen ? "marketOpen" : "marketClosed"}`}>{marketStatus.label}</span>
            </div>
          </div>
          ) : (
            <div className="mainHead">
              <div className="mainHeadLeft">
                <h1>Pick a symbol</h1>
              </div>
              <div className="mainHeadPrice">
                <span className={`marketStatusBadge ${marketStatus.isOpen ? "marketOpen" : "marketClosed"}`}>{marketStatus.label}</span>
              </div>
            </div>
          )}

          <div className="tabs" role="tablist" aria-label="Terminal sections">
            {TAB_DEFS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "tabActive" : ""} tab-${id}`} onClick={() => setTab(id)}>{label}{id === "strategies" && !stratSeen && <span className="newPill">NEW</span>}</button>
            ))}
          </div>
          {isMobile && ["chain", "alerts", "news"].includes(tab) && (
            <div className="mSectionHead">
              <h2>{TAB_DEFS.find(([id]) => id === tab)?.[1]}</h2>
            </div>
          )}

          {!selected && ["trade", "indicators", "chain", "alerts", "news"].includes(tab) && (
            <div className="pickEmpty">
              <h3>Choose a stock or index to start</h3>
              <p className="dim">Click any symbol in the watchlist, or search for one, to see its chart, indicators and options chain and place a trade.</p>
              <div className="pickQuick">
                {["^NSEI", "^NSEBANK", "^BSESN"].filter((sym) => allInstruments.some((s) => s.symbol === sym)).map((sym) => (
                  <button key={sym} className="btn btnGhost pickQuickBtn" onClick={() => setSelected(sym)}>{displayTicker(sym)}</button>
                ))}
                <button className="btn btnGhost pickQuickBtn" onClick={popOutChart}><Maximize2 size={13} /> Pop-out full-day chart</button>
              </div>
            </div>
          )}

          {tab === "trade" && selected && (
            <div className="tradeGrid">
              <div className="chartCard">
                <div className="chartHead">
                  <div className="tfTabs">
                    {Object.keys(TIMEFRAMES).map((tf) => {
                      const locked = tf !== "1D" && !isPro;
                      return (
                        <button key={tf} className={`tfTab ${timeframe === tf ? "tfTabActive" : ""}`} onClick={() => (locked ? setUpgradeModalOpen(true) : setTimeframe(tf))}>
                          {locked && <Lock size={9} />} {tf}
                        </button>
                      );
                    })}
                  </div>
                  <div className="indToggles">
                    <button className={`indToggle ${activeIndicatorCount ? "indToggleActive" : ""}`} onClick={() => setTab("indicators")}>
                      <Layers size={11} /> Indicators{activeIndicatorCount ? ` (${activeIndicatorCount})` : ""}
                    </button>
                    <button
                      className="indToggle practiceTodayBtn"
                      title={replayActive ? "Reset the clock to 9:15 AM and start this day's practice over" : "Rewind today to the 9:15 AM open and practice it with a separate practice balance"}
                      onClick={replayActive ? restartReplayDay : practiceToday}
                      disabled={replayBusy}
                    >
                      <RotateCcw size={11} /> {replayBusy ? "Loading…" : replayActive ? "Restart day" : "Practice today"}
                    </button>
                    <button className="indToggle" title="Open a full-day chart in a new window" onClick={popOutChart}>
                      <Maximize2 size={11} /> Pop out
                    </button>
                    <button className="indToggle fitBtn" title="Reset zoom / fit all candles" onClick={() => fitAllInGroup(syncGroupRef)}>
                      <Maximize2 size={11} /> Fit
                    </button>
                    <button
                      className="indToggle chartTypeBtn"
                      title={chartType === "candle" ? "Switch to line chart" : "Switch to candlestick chart"}
                      onClick={() => setChartType((t) => (t === "candle" ? "line" : "candle"))}
                    >
                      {chartType === "candle" ? "Candles" : "Line"}
                    </button>
                  </div>
                </div>

                <PriceChart
                  data={chartSeries}
                  showMA={indicators.ma}
                  overlays={chartOverlays}
                  smc={indicators.smc}
                  syncGroupRef={syncGroupRef}
                  pickMode={pickingPriceFromChart}
                  onPricePick={handleChartPricePick}
                  chartType={chartType}
                  resetKey={`${selected}-${timeframe}-${replayActive && replayData ? replayData.date : "live"}`}
                  draftPrice={orderType !== "market" && orderPrice ? parseFloat(orderPrice) || null : null}
                  pendingLines={pendingOrders
                    .filter((o) => o.symbol === selected)
                    .map((o) => ({
                      id: o.id,
                      price: o.price,
                      color: o.side === "buy" ? LW_COLORS.bull : LW_COLORS.bear,
                      title: `${o.side === "buy" ? "BUY" : "SELL"} ${o.kind === "limit" ? "LMT" : "STOP"}`,
                    }))}
                />

                {indicators.rsi && (
                  <div className="subChart">
                    <span className="subChartLabel"><span className="indDot" style={{ background: LW_COLORS.accent }} />RSI (14)</span>
                    <RSIChart data={chartSeries} syncGroupRef={syncGroupRef} />
                  </div>
                )}

                {indicators.macd && (
                  <div className="subChart">
                    <span className="subChartLabel"><span className="indDot" style={{ background: LW_COLORS.bull }} />MACD (12, 26, 9)</span>
                    <MACDChart data={chartSeries} syncGroupRef={syncGroupRef} />
                  </div>
                )}

                {indicators.stoch && (
                  <div className="subChart">
                    <span className="subChartLabel"><span className="indDot" style={{ background: IND_COLORS.stoch }} />Stochastic (14, 3)</span>
                    <IndicatorPane data={chartSeries} syncGroupRef={syncGroupRef} lines={[{ field: "stochK", color: IND_COLORS.stoch }, { field: "stochD", color: LW_COLORS.accent }]} levels={[{ price: 80, color: LW_COLORS.bear }, { price: 20, color: LW_COLORS.bull }]} />
                  </div>
                )}

                {indicators.atr && (
                  <div className="subChart">
                    <span className="subChartLabel"><span className="indDot" style={{ background: IND_COLORS.atr }} />ATR (14)</span>
                    <IndicatorPane data={chartSeries} syncGroupRef={syncGroupRef} lines={[{ field: "atr", color: IND_COLORS.atr }]} />
                  </div>
                )}

                {pickingPriceFromChart ? (
                  <div className="chartHint chartHintActive">Click anywhere on the chart to set your order price</div>
                ) : (
                  <div className="chartHint dim">Scroll / pinch to zoom &middot; drag to pan &middot; hover for OHLC &middot; Fit resets zoom</div>
                )}
              </div>

              {isIndex ? (
                <div className="orderCard">
                  <h3>Index</h3>
                  <p className="dim indexNote">{meta.name} isn't traded as a cash position here — head to the <b>Options Chain</b> tab to trade {displayTicker(selected)} options.</p>
                </div>
              ) : (
                <div className={`orderCard ${isMobile ? (orderScreen ? "orderScreen" : "mOrderClosed") : ""}`} id="stockOrderCard">
                  {isMobile && orderScreen && (
                    <div className="orderScreenTop">
                      <button type="button" className="orderScreenBack" aria-label="Back to chart" onClick={closeOrderScreen}><ArrowLeft size={20} /></button>
                      <div className="orderScreenTitle">
                        <b>{orderScreen === "buy" ? "Buy" : "Sell"} {displayTicker(selected)}</b>
                        <span className="mono">{fmtMoney(q.price)} <span className={q.price >= q.prevClose ? "bull" : "bear"}>{fmtPct(((q.price - q.prevClose) / q.prevClose) * 100)}</span></span>
                      </div>
                    </div>
                  )}
                  <div className="orderCardHead">
                    <h3>{orderType === "market" ? "Market Order" : orderType === "limit" ? "Limit Order" : "Stop Order"}</h3>
                    <span className="orderCardSym mono">{displayTicker(selected)}</span>
                  </div>

                  <div className="orderTypeTabs">
                    {[["market", "Market", false], ["limit", "Limit", true], ["stop", "Stop", true]].map(([key, label, proOnly]) => (
                      <button
                        key={key}
                        className={`orderTypeTab ${orderType === key ? "orderTypeTabActive" : ""}`}
                        onClick={() => (proOnly && !isPro ? setUpgradeModalOpen(true) : setOrderType(key))}
                      >
                        {proOnly && !isPro && <Lock size={10} />} {label}
                      </button>
                    ))}
                  </div>

                  <div className="orderRow">
                    <label htmlFor="orderQtyInput">Quantity</label>
                    <input id="orderQtyInput" type="number" min="1" inputMode="numeric" className="qtyInput mono" value={orderQty} onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                  <div className="qtyChips" role="group" aria-label="Quick quantity">
                    {qtyShortcuts.map(([label, n]) => (
                      <button
                        key={label}
                        type="button"
                        className={`qtyChip ${orderQty === n && n > 0 ? "qtyChipActive" : ""}`}
                        disabled={n < 1}
                        title={label.includes("%") || label === "Max" ? `${n} shares — ${label} of your available cash` : `${n} share${n > 1 ? "s" : ""}`}
                        onClick={() => setOrderQty(n)}
                      >{label}</button>
                    ))}
                    {heldShares > 0 && (
                      <button type="button" className={`qtyChip ${orderQty === heldShares ? "qtyChipActive" : ""}`} title="Sell everything you hold" onClick={() => setOrderQty(heldShares)}>All held ({heldShares})</button>
                    )}
                  </div>

                  {orderType !== "market" && (
                    <div className="orderRow">
                      <label>{orderType === "limit" ? "Limit price" : "Stop price"}</label>
                      <input type="number" min="0" step="0.05" className="qtyInput mono" placeholder={q.price.toFixed(2)} value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} />
                    </div>
                  )}

                  <button className={`pickPriceBtn ${pickingPriceFromChart ? "pickPriceBtnActive" : ""}`} onClick={togglePickFromChart}>
                    <Crosshair size={13} /> {pickingPriceFromChart ? "Click the chart to set price…" : "Pick price from chart"}
                  </button>

                  <div className="orderEst mono">
                    <span className="dim">Est. cost</span>
                    <span>{fmtMoney(tradePrice * orderQty)}</span>
                  </div>
                  <div className="orderSizeHint dim">
                    That's <b className={positionPct > 25 ? "bear" : ""}>{positionPct.toFixed(1)}%</b> of your capital{positionPct > 25 ? " — a large position for one stock" : ""}.
                  </div>

                  {orderType === "market" && (
                    <div className="slPlan">
                      <label className="slPlanToggle">
                        <input type="checkbox" checked={slOn} onChange={(e) => setSlOn(e.target.checked)} />
                        <span>Add a stop-loss when buying</span>
                      </label>
                      {slOn && (
                        <>
                          <div className="orderRow slPlanRow">
                            <label htmlFor="slPlanInput">Stop-loss price</label>
                            <input
                              id="slPlanInput"
                              type="number"
                              min="0"
                              step="0.05"
                              inputMode="decimal"
                              className="qtyInput mono"
                              placeholder={plannedStop ? plannedStop.toFixed(2) : ""}
                              value={slPrice}
                              onChange={(e) => setSlPrice(e.target.value)}
                            />
                          </div>
                          {riskAmount != null ? (
                            <div className={`riskBox ${riskPct > 2 ? "riskBoxHigh" : ""}`} aria-live="polite">
                              If the stop is hit you lose about <b className="mono">{fmtMoney(riskAmount, 0)}</b> — <b>{riskPct.toFixed(2)}%</b> of your capital.
                              <span className="dim"> {riskPct > 2 ? "Many traders keep this under 1–2% per trade." : "A sensible risk for one trade."}</span>
                              {!slPrice && <span className="dim"> Suggested stop: 2% below the price.</span>}
                            </div>
                          ) : (
                            <div className="riskBox riskBoxHigh">Stop-loss must be below the current price.</div>
                          )}
                          {!isPro && <div className="orderHint dim"><Lock size={10} /> Automatic stop-loss orders are a Pro feature — you'll see the level, but it won't sell for you.</div>}
                        </>
                      )}
                      <label className="slPlanToggle">
                        <input type="checkbox" checked={targetOn && isPro} onChange={(e) => (isPro ? setTargetOn(e.target.checked) : setUpgradeModalOpen(true))} />
                        <span>{!isPro && <Lock size={10} />} Add a target when buying</span>
                      </label>
                      {targetOn && isPro && (
                        <div className="orderRow slPlanRow">
                          <label htmlFor="targetInput">Target price</label>
                          <input id="targetInput" type="number" min="0" step="0.05" inputMode="decimal" className="qtyInput mono" placeholder={tradePrice ? (tradePrice * 1.04).toFixed(2) : ""} value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />
                        </div>
                      )}
                    </div>
                  )}

                  {orderType !== "market" && (
                    <div className="orderHint dim">
                      {orderType === "limit"
                        ? `Fills once ${displayTicker(selected)} trades at your price or better.`
                        : `Triggers a market order once ${displayTicker(selected)} trades through your stop price.`}
                    </div>
                  )}

                  <div className="orderBtns">
                    {orderScreen !== "sell" && <button className={`btn btnBull ${highlightBuy && marketStatus.isOpen && !firstTradeDone ? "buyGlow" : ""}`} disabled={!marketStatus.isOpen} onClick={() => (orderType === "market" ? placeStockOrder("buy") : placeConditionalOrder("buy"))}><TrendingUp size={14} /> Buy</button>}
                    {orderScreen !== "buy" && <button className="btn btnBear" disabled={!marketStatus.isOpen} onClick={() => (orderType === "market" ? placeStockOrder("sell") : placeConditionalOrder("sell"))}><TrendingDown size={14} /> Sell</button>}
                  </div>
                  {!marketStatus.isOpen && !replayActive && (
                    <div className="closedOrderHint">
                      <div className="orderHint dim" style={{ textAlign: "center" }}>Trading resumes when the market opens.</div>
                      <button className="btn btnGhost closedPracticeBtn" onClick={practiceLastSession} disabled={replayBusy}>
                        <Play size={13} /> {replayBusy ? "Loading…" : `Practise ${lastSessionLabel} from 9:15 AM now`}
                      </button>
                    </div>
                  )}
                  {!marketStatus.isOpen && replayActive && (
                    <div className="orderHint dim" style={{ textAlign: "center", marginTop: "-6px" }}>This replay day has ended — press Restart day to go again</div>
                  )}
                  <div className="orderHint dim" style={{ textAlign: "center" }}>Practice only, for education. No real order is placed.</div>
                  {renderTagPrompt()}

                  {(() => {
                    const pos = stockPositions.find((p) => p.symbol === selected);
                    if (!pos) return <div className="held mono">Held: 0 shares</div>;
                    const mv = q.price * pos.qty;
                    const pnl = mv - pos.avgPrice * pos.qty;
                    return (
                      <div className="posSummary">
                        <div className="posSummaryRow">
                          <span className="dim">Held</span>
                          <span className="mono">{pos.qty} sh &middot; avg {fmtMoney(pos.avgPrice)}</span>
                        </div>
                        <div className="posSummaryRow">
                          <span className="dim">Unrealized P&amp;L</span>
                          <span className={`mono ${pnl >= 0 ? "bull" : "bear"}`}>{fmtMoney(pnl)}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {isMobile && !orderScreen && renderTagPrompt()}
            </div>
          )}

          {tab === "indicators" && selected && (
            <div className="indTab">
              <div className="indTabHead">
                <div>
                  <h3>Indicators</h3>
                  <p className="dim">Switch indicators on or off for the {displayTicker(selected)} chart. Readings use the {timeframe} candles. They describe what price has done; they aren't trade recommendations.</p>
                </div>
                <button className="btn btnBull indTabChartBtn" onClick={() => setTab("trade")}><LineChart size={14} /> View chart</button>
              </div>
              {[["overlay", "Drawn on the price chart"], ["pane", "Shown below the chart"]].map(([group, title]) => (
                <div key={group} className="indGroup">
                  <h4 className="dim">{title}</h4>
                  {INDICATOR_DEFS.filter((d) => d.group === group).map((def) => {
                    const on = !!indicators[def.key];
                    const locked = def.pro && !isPro;
                    const r = locked ? { value: "", text: "Pro feature", tone: "" } : indicatorReading(def.key);
                    return (
                      <div key={def.key} className={`indRow ${on ? "indRowOn" : ""}`}>
                        <button className={`indSwitch ${on ? "indSwitchOn" : ""}`} role="switch" aria-checked={on} aria-label={`Show ${def.name}`} onClick={() => toggleIndicator(def)}>
                          {locked ? <Lock size={11} /> : <span />}
                        </button>
                        <span className="indDot" style={{ background: def.color }} />
                        <div className="indInfo">
                          <div className="indName">{def.name}</div>
                          <div className="indDesc dim">{def.desc}</div>
                        </div>
                        <div className="indRead">
                          <div className="mono indVal">{r.value}</div>
                          <div className={`indText ${r.tone}`}>{r.text}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === "chain" && selected && (
            !isPro ? (
              <ProLockPanel title="Options Chain is a Pro feature" description="Black-Scholes pricing and Greeks across every strike and expiry." onUpgrade={() => setUpgradeModalOpen(true)} />
            ) : (
            <div className="chainWrap">
              <div className="expiryTabs">
                {expiries.map((e, i) => (
                  <button key={i} className={`expiryTab ${expiryIdx === i ? "expiryTabActive" : ""}`} onClick={() => setExpiryIdx(i)}>{fmtDate(e)}</button>
                ))}
              </div>
              <div className="chainTableWrap">
                <table className="chainTable">
                  <thead>
                    <tr>
                      <th colSpan={isMobile ? 2 : 5} className="chainSideHead callHead">CALLS</th>
                      <th className="strikeHead">STRIKE</th>
                      <th colSpan={isMobile ? 2 : 5} className="chainSideHead putHead">PUTS</th>
                    </tr>
                    <tr className="subhead">
                      <th title="Delta — how much the premium moves for a ₹1 move in the underlying. A call delta of 0.50 means the option gains roughly ₹0.50 for every ₹1 the stock rises.">Δ</th>
                      {!isMobile && <th title="Theta — how much value the option loses per day, all else equal, purely from time passing. A theta of -0.80 means the premium erodes about ₹0.80 per day.">Θ</th>}
                      {!isMobile && <th title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</th>}
                      <th>Premium</th>{!isMobile && <th></th>}
                      <th></th>
                      {!isMobile && <th></th>}<th>Premium</th>
                      {!isMobile && <th title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</th>}
                      {!isMobile && <th title="Theta — how much value the option loses per day, all else equal, purely from time passing. A theta of -0.80 means the premium erodes about ₹0.80 per day.">Θ</th>}
                      <th title="Delta — how much the premium moves for a ₹1 move in the underlying. A put delta of -0.50 means the option gains roughly ₹0.50 for every ₹1 the stock falls.">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainStrikes.map((strike) => {
                      const spot = q.price;
                      const sigma = meta.iv * (1 + 0.15 * Math.abs(strike - spot) / spot);
                      const call = blackScholes(spot, strike, T, RISK_FREE, sigma, "call");
                      const put = blackScholes(spot, strike, T, RISK_FREE, sigma, "put");
                      const expiryMs = currentExpiry?.getTime();
                      const callC = { symbol: selected, strike, type: "call", expiry: expiryMs };
                      const putC = { symbol: selected, strike, type: "put", expiry: expiryMs };
                      const callPrice = realPremium(callC) ?? call.price;
                      const putPrice = realPremium(putC) ?? put.price;
                      const estTitle = "Calculated premium — no traded price for this contract yet";
                      const isATM = Math.abs(strike - spot) < chainStep / 2;
                      const callITM = strike < spot;
                      const putITM = strike > spot;
                      return (
                        <tr key={strike} className={isATM ? "atmRow" : ""}>
                          <td className="mono callSide">{call.delta.toFixed(2)}</td>
                          {!isMobile && <td className="mono callSide">{call.theta.toFixed(2)}</td>}
                          {!isMobile && <td className="mono callSide">{(sigma * 100).toFixed(0)}%</td>}
                          <td className={`mono premCell callSide ${callITM ? "itmCall" : "otmCall"}`} onClick={() => openTicket("call", strike, currentExpiry)} title={premiumSource(callC) === "model" ? estTitle : undefined}>{fmtMoney(callPrice)}{premiumSource(callC) === "model" && <span className="estTag">est.</span>}</td>
                          {!isMobile && <td className="chainGutter" />}
                          <td className="strikeCell mono">{strike}</td>
                          {!isMobile && <td className="chainGutter" />}
                          <td className={`mono premCell putSide ${putITM ? "itmPut" : "otmPut"}`} onClick={() => openTicket("put", strike, currentExpiry)} title={premiumSource(putC) === "model" ? estTitle : undefined}>{fmtMoney(putPrice)}{premiumSource(putC) === "model" && <span className="estTag">est.</span>}</td>
                          {!isMobile && <td className="mono putSide">{(sigma * 100).toFixed(0)}%</td>}
                          {!isMobile && <td className="mono putSide">{put.theta.toFixed(2)}</td>}
                          <td className="mono putSide">{put.delta.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {isMobile && <div className="chainNote chainTapHint">Tap any premium to buy or sell that option. Theta and IV are in the order ticket.</div>}
              {renderTagPrompt()}
              <div className="chainNote">Premiums are the last traded prices from your broker connection where it supplies them. A premium marked "est." is calculated from the underlying price via Black-Scholes until a traded price arrives; Greeks and IV are always calculated. Index IV follows India VIX{indiaVix ? ` (now ${indiaVix.toFixed(2)})` : ""}. Quantities are in exchange lots (NIFTY 65, BANKNIFTY 30, SENSEX 20). You can buy or sell (short) options; selling blocks an estimated margin from your cash.</div>
              {!marketStatus.isOpen && (
                <div className="chainNote" style={{ color: "var(--bear)", fontWeight: 600 }}>Market Closed — you can browse the chain, but new orders are disabled until 9:15 AM Mon–Fri.</div>
              )}
            </div>
            )
          )}

          {tab === "positions" && (
            <div className="posWrap">
              {optionPositions.length > 0 && (
                <section className="posHero" aria-label="Option positions">
                  <header className="posHeroHead">
                    <div className="posHeroTitle">
                      <span className="posEyebrow">Derivatives</span>
                      <h3>Option Positions <span className="posHeroCount">{optionPositions.length}</span></h3>
                    </div>
                    <div className="posHeroPnl">
                      <span className="posEyebrow">Open P&amp;L</span>
                      <b className={`mono ${optionUnrealized >= 0 ? "bull" : "bear"}`}>{optionUnrealized >= 0 ? "+" : ""}{fmtMoney(optionUnrealized)}</b>
                    </div>
                  </header>
                  <div className="optCards">
                    {optionPositions.map((p) => {
                      const spot = quotes[p.symbol]?.price ?? 0;
                      const symMeta = allInstruments.find((s) => s.symbol === p.symbol);
                      const pT = (p.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
                      const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
                      const price = realPremium(p) ?? blackScholes(spot, p.strike, pT, RISK_FREE, sigma, p.type).price;
                      const source = premiumSource(p);
                      const short = isShort(p);
                      const mult = posMultiplier(p);
                      const mv = (short ? -1 : 1) * price * mult * p.qty;
                      const pnl = (short ? p.avgPremium - price : price - p.avgPremium) * mult * p.qty;
                      const basis = p.avgPremium * mult * p.qty;
                      const pnlPct = basis > 0 ? (pnl / basis) * 100 : 0;
                      const istDay = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                      const expToday = istDay(p.expiry) === istDay(nowMs());
                      const itm = spot > 0 && (p.type === "call" ? spot > p.strike : spot < p.strike);
                      const gap = spot > 0 ? Math.abs(spot - p.strike) : 0;
                      const right = p.type === "call" ? "CE" : "PE";
                      return (
                        <article key={p.id} className={`optCard ${pnl >= 0 ? "optCardUp" : "optCardDown"}`}>
                          <div className="optCardTop">
                            <div className="optContract">
                              <div className="optTags">
                                <span className={`sideTag ${short ? "sideShort" : "sideLong"}`}>{short ? "Short" : "Long"} {p.type === "call" ? "Call" : "Put"}</span>
                                <span className={`expTag ${expToday ? "expToday" : ""}`}><Hourglass size={11} /> {expToday ? "Expires today" : `Exp ${fmtDate(new Date(p.expiry))}`}</span>
                              </div>
                              <div className="optName"><span>{displayTicker(p.symbol)}</span> <span className="mono">{p.strike.toLocaleString("en-IN")}</span> <span className="optRight">{right}</span></div>
                              {spot > 0 && (
                                <div className="optSpot dim">Spot <span className="mono">{spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span> · <span className={itm ? "optItm" : ""}>{itm ? "In the money" : "Out of the money"} by <span className="mono">{gap.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span> pts</span></div>
                              )}
                            </div>
                            <div className="optPnl">
                              <b className={`mono ${pnl >= 0 ? "bull" : "bear"}`}>{pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}</b>
                              <span className={`optPnlPct mono ${pnl >= 0 ? "bull" : "bear"}`}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}% of premium</span>
                              {p.stopLoss ? <span className="slTag">SL {fmtMoney(p.stopLoss)}</span> : null}
                            </div>
                          </div>
                          <dl className="optStats">
                            <div><dt>Quantity</dt><dd className="mono">{p.lotBased ? <>{p.qty} lot{p.qty > 1 ? "s" : ""} <span className="dim">× {mult}</span></> : p.qty}</dd></div>
                            <div><dt>Avg premium</dt><dd className="mono">{fmtMoney(p.avgPremium)}</dd></div>
                            <div><dt>Last traded</dt><dd className="mono" title={source === "model" ? "Calculated premium — no traded price for this contract yet" : source === "stale" ? "Last traded premium — not updated in the past minute" : "Last traded premium"}>{fmtMoney(price)}{source !== "real" && <span className="estTag">{source === "model" ? "est." : "delayed"}</span>}</dd></div>
                            <div><dt>Market value</dt><dd className="mono">{fmtMoney(mv)}</dd></div>
                            {short && p.margin ? <div><dt>Margin blocked</dt><dd className="mono">{fmtMoney(p.margin, 0)}</dd></div> : null}
                          </dl>
                          <div className="optActions">
                            <div className="optActionsLeft">
                              <button className="posBtn" onClick={() => { setSelected(p.symbol); setTab("trade"); }}><LineChart size={14} /> Chart</button>
                              <button className="posBtn" onClick={() => openStopLossEditor(p)}><Crosshair size={14} /> {p.stopLoss ? "Edit stop-loss" : "Set stop-loss"}</button>
                            </div>
                            <button className="posBtn posBtnExit" onClick={() => requestClose("option", p)}>{short ? "Cover position" : "Close position"}</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              <h3 className={optionPositions.length > 0 ? "mt" : undefined}>Stock Positions</h3>
              {stockPositions.length === 0 ? (
                <div className="empty">No open stock positions. Buy something on the Chart &amp; Trade tab.</div>
              ) : (
                <table className="posTable posTableNum">
                  <thead><tr><th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>Last</th><th>Mkt Value</th><th>P&L</th><th></th></tr></thead>
                  <tbody>
                    {stockPositions.map((p) => {
                      const last = quotes[p.symbol]?.price ?? 0;
                      const mv = last * p.qty;
                      const pnl = mv - p.avgPrice * p.qty;
                      return (
                        <tr key={p.id}>
                          <td className="mono">{displayTicker(p.symbol)}</td>
                          <td className="mono">{p.qty}</td>
                          <td className="mono">{fmtMoney(p.avgPrice)}</td>
                          <td className="mono">{fmtMoney(last)}</td>
                          <td className="mono">{fmtMoney(mv)}</td>
                          <td className={`mono ${pnl >= 0 ? "bull" : "bear"}`}>{fmtMoney(pnl)}</td>
                          <td className="orderRowActions">
                            <button className="closeBtn" onClick={() => { setSelected(p.symbol); setTab("trade"); }}><LineChart size={12} /> Chart</button>
                            <button className="closeBtn" onClick={() => startStopLossFromPosition(p)}><Crosshair size={12} /> Stop-Loss</button>
                            <button className="closeBtn closeBtnExit" onClick={() => requestClose("stock", p)}>Close</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {optionPositions.length === 0 && (<>
                <h3 className="mt">Option Positions</h3>
                <div className="empty">No open option positions. Click a premium in the Options Chain to open one.</div>
              </>)}

              {allocationItems.length > 0 && (
                <div className="allocWrap mt">
                  <h3>Allocation</h3>
                  <div className="allocBar">
                    {allocationItems.map((it) => (
                      <div key={it.label} className="allocSeg" style={{ width: `${it.pct}%`, background: it.color }} title={`${it.label}: ${it.pct.toFixed(1)}%`} />
                    ))}
                  </div>
                  <div className="allocLegend">
                    {allocationItems.map((it) => (
                      <div key={it.label} className="allocLegendItem">
                        <span className="allocSwatch" style={{ background: it.color }} />
                        <span>{it.label}</span>
                        <span className="dim mono">{fmtMoney(it.value, 0)} &middot; {it.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {tab === "orders" && (
            <div className="ordersWrap">
              {pendingOrders.length === 0 ? (
                <div className="empty">No pending stock orders. Place a limit or stop order from the Chart &amp; Trade tab. For options, set a stop-loss from the Positions tab or the option ticket.</div>
              ) : (
                <table className="posTable">
                  <thead><tr><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Placed</th><th></th></tr></thead>
                  <tbody>
                    {pendingOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="mono">{displayTicker(o.symbol)}</td>
                        <td className={`mono ${o.side === "buy" ? "bull" : "bear"}`}>{o.side.toUpperCase()}</td>
                        <td className="mono dim">{o.kind === "limit" ? "Limit" : "Stop"}</td>
                        <td className="mono">{o.qty}</td>
                        <td className="mono">{fmtMoney(o.price)}</td>
                        <td className="mono dim">{o.createdAt.toLocaleTimeString()}</td>
                        <td className="orderRowActions">
                          <button className="closeBtn" onClick={() => openEditOrder(o)}>Edit</button>
                          <button className="closeBtn" onClick={() => cancelOrder(o.id)} aria-label={`Cancel ${o.side} order for ${displayTicker(o.symbol)}`}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {optionPositions.some((p) => p.stopLoss) && (
                <>
                  <h3 className="mt">Option Stop-Losses</h3>
                  <table className="posTable">
                    <thead><tr><th>Contract</th><th>Side</th><th>Lots</th><th>Entry</th><th>Now</th><th>Stop-Loss</th><th></th></tr></thead>
                    <tbody>
                      {optionPositions.filter((p) => p.stopLoss).map((p) => {
                        const now = optionPremiumNow(p, quotes, allInstruments);
                        return (
                          <tr key={p.id}>
                            <td className="mono">{p.type === "call" ? "C" : "P"} {displayTicker(p.symbol)} {p.strike} {fmtDate(new Date(p.expiry))}</td>
                            <td className={`mono ${isShort(p) ? "bear" : "bull"}`}>{isShort(p) ? "SHORT" : "LONG"}</td>
                            <td className="mono">{p.qty}</td>
                            <td className="mono">{fmtMoney(p.avgPremium)}</td>
                            <td className="mono">{now != null ? fmtMoney(now) : "—"}</td>
                            <td className="mono bear">{fmtMoney(p.stopLoss)}</td>
                            <td className="orderRowActions">
                              <button className="closeBtn" onClick={() => openStopLossEditor(p)}>Edit</button>
                              <button className="closeBtn" onClick={() => removeStopLoss(p.id)} aria-label="Remove stop-loss"><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
              <div className="dim ordersHint">Orders are checked against market prices as they update and fill automatically — no need to keep this tab open.</div>
            </div>
          )}

          {tab === "alerts" && selected && (
            !isPro ? (
              <ProLockPanel title="Price alerts are a Pro feature" description="Get notified the moment a stock crosses the price you're watching for." onUpgrade={() => setUpgradeModalOpen(true)} />
            ) : (
            <div className="alertsWrap">
              <div className="alertForm">
                <div className="alertFormRow">
                  <span className="dim">Symbol</span>
                  <span className="mono">{displayTicker(selected)}</span>
                  <span className="dim">Alert when price is</span>
                  <select className="alertSelect" value={alertDirection} onChange={(e) => setAlertDirection(e.target.value)}>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  <input className="qtyInput mono" type="number" placeholder="Target price" value={alertTarget} onChange={(e) => setAlertTarget(e.target.value)} />
                  <button className="btn btnBull alertAddBtn" onClick={addAlert}><Bell size={13} /> Add Alert</button>
                </div>
                <div className="dim alertHint">Alerts are checked against market prices and fire a notification here in the app — set one for the symbol currently selected in the watchlist.</div>
                {notifPerm !== "unsupported" && (
                  <div className="notifRow">
                    {notifPerm === "granted"
                      ? <span className="bull"><Bell size={13} /> Phone notifications are on — alerts reach you even when PaperRally is in the background.</span>
                      : notifPerm === "denied"
                        ? <span className="dim">Notifications are blocked for this site. Allow them in your browser settings to get alerts in the background.</span>
                        : <><span className="dim">Get alerts as phone notifications, even when the app is in the background.</span><button className="btn btnGhost" onClick={enableNotifications}><Bell size={13} /> Turn on notifications</button></>}
                  </div>
                )}
              </div>

              {alerts.length === 0 ? (
                <div className="empty">No alerts yet. Set one above.</div>
              ) : (
                <table className="posTable mt">
                  <thead><tr><th>Symbol</th><th>Condition</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id}>
                        <td className="mono">{displayTicker(a.symbol)}</td>
                        <td className="mono">{a.direction === "above" ? "≥" : "≤"} {fmtMoney(a.target)}</td>
                        <td><span className={`alertStatus ${a.triggered ? "alertTriggered" : "alertActive"}`}>{a.triggered ? "Triggered" : "Active"}</span></td>
                        <td><button className="closeBtn" onClick={() => deleteAlert(a.id)} aria-label={`Delete alert for ${displayTicker(a.symbol)}`}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            )
          )}

          {tab === "news" && selected && (
            !isPro ? (
              <ProLockPanel title="News is a Pro feature" description="Recent headlines for whatever stock you're currently viewing." onUpgrade={() => setUpgradeModalOpen(true)} />
            ) : (
            <div className="newsWrap">
              {newsLoading ? (
                <div className="empty">Loading news for {displayTicker(selected)}…</div>
              ) : newsItems.length === 0 ? (
                <div className="empty">No recent news found for {displayTicker(selected)}.</div>
              ) : (
                <div className="newsList">
                  {newsItems.map((n, i) => (
                    <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="newsItem">
                      {n.thumbnail ? <img src={n.thumbnail} alt="" className="newsThumb" /> : <div className="newsThumb newsThumbFallback"><Newspaper size={18} /></div>}
                      <div className="newsBody">
                        <div className="newsTitle">{n.title}</div>
                        <div className="newsMeta dim mono">{n.publisher}{n.time ? ` · ${n.time.toLocaleDateString()}` : ""}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            )
          )}

          {tab === "history" && (
            <div className="histWrap">
              <div className="histHead">
                <h3>Trade History</h3>
                <button className="exportBtn" onClick={exportTradesCSV}>{isPro ? <Download size={13} /> : <Lock size={12} />} Export CSV</button>
              </div>
              {trades.length === 0 ? (
                <div className="empty">No trades yet. Your fills will show up here.</div>
              ) : (
                <table className="posTable">
                  <thead><tr><th>Time</th><th>Trade</th><th>Cash Impact</th><th>Realized P&amp;L</th><th>Journal</th></tr></thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id}>
                        <td className="mono dim">{t.time.toLocaleTimeString()}</td>
                        <td className="mono">{t.label}{t.charges ? <div className="dim histCharges">charges {fmtMoney(t.charges)}</div> : null}</td>
                        <td className="mono">{fmtMoney(t.amount)}</td>
                        <td className={`mono ${t.realized == null ? "dim" : t.realized >= 0 ? "bull" : "bear"}`}>{t.realized == null ? "—" : fmtMoney(t.realized)}</td>
                        <td>
                          <button className={`closeBtn journalBtn ${t.tag ? "journalBtnOn" : ""}`} onClick={() => setJournalEditing(t)} aria-label={t.tag ? `Journal: ${t.tag}. Edit` : "Add a journal note"} title={t.note || ""}>
                            <NotebookPen size={12} /> {t.tag || (t.note ? "Note" : "Add")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "perf" && (
            <PerformancePanel
              trades={trades}
              fmtMoney={fmtMoney}
              chargesOn={chargesOn}
              replayActive={replayActive}
              onToggleCharges={() => {
                setChargesOn((v) => !v);
                showToast(chargesOn ? "Charges off — trades are commission-free again" : "Charges on — brokerage, STT, fees and GST will be deducted from now on", "bull");
              }}
            />
          )}
          {tab === "perf" && (
            <div className="perfExtras">
              {!replayActive && (
                <div className="shareRow">
                  <div>
                    <b>This week: <span className={weekReturn >= 0 ? "bull" : "bear"}>{fmtPct(weekReturn)}</span></b>
                    <span className="dim"> · {weekTrades} trade{weekTrades === 1 ? "" : "s"}</span>
                  </div>
                  <button className="btn btnBull" onClick={shareWeek}><Share2 size={14} /> Share my week</button>
                </div>
              )}
              <JournalStatsCard trades={trades} fmtMoney={fmtMoney} onTag={(id, tag) => { setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, tag } : t))); if (tag) track("trade_tagged", { tag, from: "performance" }); }} />
              <AchievementsGrid unlocked={prefs.achievements || [...unlockedNow]} />
            </div>
          )}

          {tab === "leaderboard" && (
            replayActive ? (
              <div className="empty">The leaderboard uses your real portfolio. Exit replay to see this week's standings.</div>
            ) : (
              <>
                <LeaderboardPanel
                  supabase={supabase}
                  userId={userId}
                  prefs={prefs}
                  defaultName={username.slice(0, 20).replace(/[^\p{L}\p{N} _.\-]/gu, "") || "Trader"}
                  weekKey={weekKey}
                  weekReturn={weekReturn}
                  weekTrades={weekTrades}
                  resetThisWeek={resetThisWeek}
                  onJoin={joinLeaderboard}
                  onLeave={leaveLeaderboard}
                  onShare={shareWeek}
                  fmtPct={fmtPct}
                />
                <InvitePanel userId={userId} referral={referral} inTrial={inTrial} isPaidPro={isPaidPro} showToast={showToast} />
              </>
            )
          )}

          {tab === "learn" && (
            <div className="learnTab">
              <div className="learnTabHead">
                <h3><BookOpen size={17} /> {L.chartsTitle}</h3>
                <LangSwitch lang={lang} onChange={setLang} />
              </div>
              <p className="dim">{L.chartsIntro}</p>
              <div className="learnGrid">
                {L.candles.map((c, i) => (
                  <div key={i} className="learnCard">
                    <h4>{c.title}</h4>
                    <p className="dim">{c.desc}</p>
                  </div>
                ))}
              </div>
              <h3 className="mt">{L.mistakesTitle}</h3>
              <p className="dim">{L.mistakesIntro}</p>
              <div className="learnMistakes">
                {L.mistakes.map((m, i) => (
                  <div key={i} className="learnCard">
                    <h4>{m.title}</h4>
                    <p><span className="bear learnLbl">{L.realLabel}:</span> <span className="dim">{m.real}</span></p>
                    <p><span className="bull learnLbl">{L.practiceLabel}:</span> <span className="dim">{m.practice}</span></p>
                  </div>
                ))}
              </div>
              <div className="learnLinksRow">
                <button className="btn btnBull" onClick={startTour}><Compass size={14} /> Take the 30-second tour</button>
                <a className="btn btnGhost" href="/guides.html">All guides →</a>
                {GUIDE_LINKS.map((l) => (
                  <a key={l.url} href={l.url} className="btn btnGhost">{l.label} →</a>
                ))}
              </div>
            </div>
          )}

          {tab === "strategies" && (
            isPro
              ? <StrategyPanel key={stratView} api={strategyApi} initialView={stratView} />
              : <ProLockPanel title="Strategies is a Pro feature" description="Test your trading rules on past days, build multi-leg option strategies, see payoff charts and backtest them on past index prices." onUpgrade={() => setUpgradeModalOpen(true)} />
          )}

          {tab === "replay" && (
            <div className="replayWrap">
              <div className="replayControls">
                {!replayActive ? (
                  <>
                    <h3 className="replayTitle">Replay a past trading day</h3>
                    <div className="replayControlsRow">
                      <div className="replayField">
                        <label>Date</label>
                        <input type="date" className="qtyInput mono" value={replayDay} min={thirtyDaysAgoISO} max={todayISO} onChange={(e) => setReplayDay(e.target.value)} />
                      </div>
                      <button className="btn btnBull replayLoadBtn" onClick={startReplay} disabled={replayBusy}>{replayBusy ? `Loading ${allInstruments.length} symbols…` : "Start replay"}</button>
                    </div>
                    <div className="dim replayHint">
                      The whole terminal goes back to that day: watchlist prices, charts, indicators and the options chain all move the way they did, starting from the 9:15 AM open. You get a separate {fmtMoney(REPLAY_CASH, 0)} practice balance, and your real portfolio is untouched. Control the clock with Play, Pause and the speed buttons in the replay bar at the top.
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="replayTitle">Replaying {new Date(replayData.dayStart).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>
                    <div className="dim replayHint">Use Chart &amp; Trade, Options Chain and the other tabs exactly as you would live. This session's trades and P&amp;L show in Positions and History. Exit replay to go back to the live market and your real portfolio.</div>
                    <button className="btn btnBear replayLoadBtn" onClick={exitReplay}>Exit replay</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {ticket && (
        <OptionTicket
          ticket={ticket}
          quotes={quotes}
          instruments={allInstruments}
          onClose={() => setTicket(null)}
          onSubmit={placeOptionOrder}
          marketOpen={marketStatus.isOpen}
          isPro={isPro}
          onUpgrade={() => setUpgradeModalOpen(true)}
          heldQty={optionPositions.find((p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased && !isShort(p))?.qty ?? 0}
          shortQty={optionPositions.find((p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased && isShort(p))?.qty ?? 0}
        />
      )}

      {slEditing && (
        <div className="modalOverlay" onClick={() => setSlEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Stop-Loss</h3>
            <p className="mono">{isShort(slEditing) ? "SHORT " : ""}{slEditing.type === "call" ? "C" : "P"} {displayTicker(slEditing.symbol)} {slEditing.strike} {fmtDate(new Date(slEditing.expiry))} · {slEditing.qty} lot{slEditing.qty > 1 ? "s" : ""}</p>
            <div className="orderHint dim mono">Entry {fmtMoney(slEditing.avgPremium)} · Now {slEditing.nowPremium != null ? fmtMoney(slEditing.nowPremium) : "—"}</div>
            <div className="orderRow">
              <label>Stop-loss premium</label>
              <input type="number" min="0" step="0.05" className="qtyInput mono" value={slInput} onChange={(e) => setSlInput(e.target.value)} autoFocus />
            </div>
            {parseFloat(slInput) > 0 && (
              <div className="orderEst mono">Loss if hit ≈ <span className="bear">{fmtMoney(Math.abs((isShort(slEditing) ? parseFloat(slInput) - slEditing.avgPremium : slEditing.avgPremium - parseFloat(slInput)) * posMultiplier(slEditing) * slEditing.qty))}</span></div>
            )}
            <div className="orderHint dim">{isShort(slEditing) ? "The whole position is bought back automatically if the premium rises to this level." : "The whole position is sold automatically if the premium falls to this level."}</div>
            <div className="modalBtns">
              {slEditing.stopLoss ? <button className="btn btnGhost" onClick={() => removeStopLoss(slEditing.id)}>Remove</button> : null}
              <button className="btn btnGhost" onClick={() => setSlEditing(null)}>Cancel</button>
              <button className="btn btnBull" onClick={saveStopLoss}>Save</button>
            </div>
          </div>
        </div>
      )}

      {editingOrder && (
        <div className="modalOverlay" onClick={() => setEditingOrder(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Edit {editingOrder.kind === "limit" ? "Limit" : "Stop"} Order</h3>
            <p>{editingOrder.side.toUpperCase()} {displayTicker(editingOrder.symbol)}</p>
            <div className="orderRow">
              <label>Quantity</label>
              <input type="number" min="1" className="qtyInput mono" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
            </div>
            <div className="orderRow">
              <label>{editingOrder.kind === "limit" ? "Limit price" : "Stop price"}</label>
              <input type="number" min="0" step="0.05" className="qtyInput mono" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            </div>
            <div className="modalBtns">
              <button className="btn btnGhost" onClick={() => setEditingOrder(null)}>Cancel</button>
              <button className="btn btnBull" onClick={saveEditOrder}>Save</button>
            </div>
          </div>
        </div>
      )}

      {upgradeModalOpen && (
        <div className="modalOverlay" onClick={() => !checkoutBusy && setUpgradeModalOpen(false)}>
          <div className="modal upgradeModal" role="dialog" aria-modal="true" aria-label="Upgrade to Pro" onClick={(e) => e.stopPropagation()}>
            <h3><Sparkles size={17} className="proBadgeIcon" /> Upgrade to Pro</h3>
            <p>Everything in Free, plus:</p>
            <ul className="upgradeList">
              <li>Limit &amp; stop-loss orders</li>
              <li>RSI, MACD, and every chart timeframe</li>
              <li>Options chain with Greeks</li>
              <li>Search &amp; add any NSE/BSE stock</li>
              <li>Price alerts</li>
              <li>News tab</li>
              <li>Trade history CSV export</li>
            </ul>
            <div className="modalBtns">
              <button className="btn btnGhost" onClick={() => setUpgradeModalOpen(false)} disabled={checkoutBusy}>Not now</button>
              <button className="btn btnMarigold" onClick={handleUpgrade} disabled={checkoutBusy}>{checkoutBusy ? "Opening…" : "Pay ₹99 via Razorpay"}</button>
            </div>
            <p className="dim upgradeFinePrint">Opens Razorpay in a new tab. Pro unlocks after payment is confirmed — this may take a little while, not instant. You'll need to pay again each month to keep Pro active.</p>
          </div>
        </div>
      )}

      {accountOpen && (() => {
        const fmt = (iso) => { try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; } };
        const lifetime = proUntil && new Date(proUntil).getFullYear() >= 2090;
        const plan = isPaidPro ? (lifetime ? "Pro · no expiry" : `Pro · active till ${fmt(proUntil)}`)
          : inTrial ? `Free trial · ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left` : "Free";
        const rows = [
          ["Username", username],
          ["Email", contactEmail || "— (signed up with username)"],
          ["Mobile", accountPhone || "Loading…"],
          ["Sign-in", signInMethod === "google" ? "Google" : "Username & password"],
          ["Plan", plan],
          ["Member since", memberSince ? fmt(memberSince) : "—"],
        ];
        return (
          <div className="modalOverlay" onClick={() => setAccountOpen(false)}>
            <div className="modal accountModal" role="dialog" aria-modal="true" aria-label="Account details" onClick={(e) => e.stopPropagation()}>
              <h3><UserIcon size={17} /> Account details</h3>
              <dl className="accountList">
                {rows.map(([k, v]) => (<div key={k} className="accountRow"><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
              <p className="dim accountNote">Need to change your mobile number or email? Use Feedback and we'll update it for you.</p>
              <div className="modalBtns">
                {!isPaidPro && <button className="btn btnMarigold" onClick={() => { setAccountOpen(false); setUpgradeModalOpen(true); }}><Sparkles size={14} /> Upgrade to Pro</button>}
                <button className="btn btnGhost" onClick={() => setAccountOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {tourOpen && <TourOverlay steps={tourSteps} onDone={finishTour} />}
      {stratNudge && !tourOpen && (
        <div className="stratNudge" role="dialog" aria-label="New: Rule tester">
          <button className="stratNudgeX" aria-label="Close" onClick={() => { setStratNudge(false); track("strat_nudge_dismiss"); }}><X size={14} /></button>
          <div className="stratNudgeIcon"><FlaskConical size={18} /></div>
          <div className="stratNudgeBody">
            <div className="stratNudgeEyebrow">NEW · RULE TESTER</div>
            <div className="stratNudgeTitle">Would your idea have worked?</div>
            <p>Test a rule like the 15-minute opening breakout on past days — win rate, profit and every trade, in seconds.</p>
            <div className="stratNudgeActions">
              <button className="btn btnBull" onClick={() => openRuleTester("nudge")}>Try the Rule tester</button>
              <button className="btn btnGhost" onClick={() => { setStratNudge(false); track("strat_nudge_dismiss"); }}>Later</button>
            </div>
          </div>
        </div>
      )}
      {installHelpOpen && <InstallHelp platform={install.platform} onClose={() => setInstallHelpOpen(false)} />}
      {journalEditing && (
        <JournalModal
          trade={journalEditing}
          onClose={() => setJournalEditing(null)}
          onSave={({ tag, note }) => {
            setTrades((prev) => prev.map((t) => (t.id === journalEditing.id ? { ...t, tag, note } : t)));
            setJournalEditing(null);
            if (tag) track("trade_tagged", { tag, from: "history" });
            showToast("Journal saved", "bull");
          }}
        />
      )}

      {closeConfirm && (() => {
        const { kind, pos } = closeConfirm;
        let title, detail, price, pnl;
        if (kind === "stock") {
          price = quotes[pos.symbol]?.price ?? 0;
          pnl = (price - pos.avgPrice) * pos.qty;
          title = `Sell ${pos.qty} ${displayTicker(pos.symbol)}?`;
          detail = `${pos.qty} shares at about ${fmtMoney(price)} (bought at ${fmtMoney(pos.avgPrice)})`;
        } else {
          price = optionPremiumNow(pos, quotes, allInstruments) ?? pos.avgPremium;
          const short = isShort(pos);
          pnl = (short ? pos.avgPremium - price : price - pos.avgPremium) * posMultiplier(pos) * pos.qty;
          title = `${short ? "Cover" : "Close"} ${pos.type === "call" ? "CALL" : "PUT"} ${displayTicker(pos.symbol)} ${pos.strike}?`;
          detail = `${pos.qty} ${pos.lotBased ? `lot${pos.qty > 1 ? "s" : ""}` : "contracts"} at about ${fmtMoney(price)} premium (entry ${fmtMoney(pos.avgPremium)})`;
        }
        return (
          <div className="modalOverlay" onClick={() => setCloseConfirm(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
              <h3>{title}</h3>
              <p className="dim">{detail}</p>
              <div className="orderEst mono">
                <span className="dim">Expected P&amp;L</span>
                <span className={pnl >= 0 ? "bull" : "bear"}>{fmtMoney(pnl)}</span>
              </div>
              <div className="orderHint dim">Fills at the market price at the moment you confirm.</div>
              <div className="modalBtns">
                <button className="btn btnGhost" onClick={() => setCloseConfirm(null)} autoFocus>Keep position</button>
                <button className="btn btnBear" onClick={confirmClose}>{kind === "option" && isShort(pos) ? "Cover now" : "Close now"}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {isMobile && moreOpen && (
        <div className="modalOverlay sheetOverlay" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="sheetGrab" aria-hidden="true" />
            <div className="sheetUser">
              <UserIcon size={14} /> {username}
              {isPaidPro && <span className="proBadge">PRO</span>}
              {inTrial && <span className="proBadge proBadgeTrial">ALL FREE · {trialDaysLeft}D LEFT</span>}
            </div>
            <div className="sheetGrid">
              {[
                ["indicators", "Indicators", Layers],
                ["chain", "Options chain", BarChart3],
                ["strategies", "Strategies", Layers],
                ["alerts", "Alerts", Bell],
                ["news", "News", Newspaper],
                ["history", "History", ListOrdered],
                ["perf", "Performance", TrendingUp],
                ["leaderboard", "Leaderboard", Trophy],
                ["replay", "Replay", Play],
                ["learn", L.learnTab, BookOpen],
              ].map(([id, label, Icon]) => (
                <button key={id} className={`sheetItem ${tab === id ? "sheetItemActive" : ""}`} onClick={() => goTab(id)}>
                  <Icon size={18} /><span>{label}</span>{id === "strategies" && !stratSeen && <span className="newPill">NEW</span>}
                </button>
              ))}
            </div>
            <div className="sheetActions">
              {!isPaidPro && !inTrial && (
                <button className="btn btnMarigold" onClick={() => { setMoreOpen(false); setUpgradeModalOpen(true); }}><Sparkles size={14} /> Upgrade to Pro</button>
              )}
              <button className="btn btnGhost" onClick={() => { setMoreOpen(false); replayActive ? restartReplayDay() : practiceToday(); }} disabled={replayBusy}><Play size={14} /> {replayActive ? "Restart day" : "Practice today"}</button>
              {replayActive && <button className="btn btnGhost" onClick={() => { setMoreOpen(false); exitReplay(); }}>Exit replay</button>}
              {!install.standalone && <button className="btn btnBull" onClick={doInstall}><Smartphone size={14} /> Install app</button>}
              <a className="btn feedbackSheetBtn" href={feedbackHref}><MessageSquare size={14} /> Feedback</a>
              <button className="btn btnGhost" onClick={startTour}><Compass size={14} /> Take the tour</button>
              <button className="btn btnGhost" onClick={() => { setMoreOpen(false); popOutChart(); }}><Maximize2 size={14} /> Pop-out chart</button>
              <button className="btn btnGhost" onClick={cycleTheme}><span className="themeEmoji">{THEMES[themeIdx].emoji}</span> Theme: {THEMES[themeIdx].name}</button>
              <button className="btn btnGhost" onClick={() => { setMoreOpen(false); setConfirmReset(true); }}><RotateCcw size={14} /> Reset account</button>
              <button className="btn btnGhost" onClick={onLogout}><LogOut size={14} /> Log out</button>
            </div>
            <div className="sheetLang"><span className="dim">Learning language</span><LangSwitch lang={lang} onChange={setLang} /></div>
          </div>
        </div>
      )}

      {isMobile && tab === "trade" && selected && mobilePane === "main" && !ticket && (
        <div className="mTradeBar">
          <div className="mTradeBarPrice">
            <span className="mono">{displayTicker(selected)}</span>
            {q.live || replayActive
              ? <span className="mono">{fmtMoney(q.price)} <span className={q.price >= q.prevClose ? "bull" : "bear"}>{fmtPct(((q.price - q.prevClose) / q.prevClose) * 100)}</span></span>
              : <span className="dim wlLoading">Loading live price…</span>}
          </div>
          {isIndex ? (
            <button className="btn btnBull" onClick={() => setTab("chain")}>Trade options</button>
          ) : (
            <>
              <button className="btn btnBull" onClick={() => openOrderScreen("buy")}>Buy</button>
              <button className="btn btnBear" onClick={() => openOrderScreen("sell")}>Sell</button>
            </>
          )}
        </div>
      )}

      {isMobile && (
        <nav className="bottomNav" aria-label="Main navigation">
          {[
            ["watchlist", "Watchlist", List, mobilePane === "watchlist", () => { setMobilePane("watchlist"); setMoreOpen(false); window.scrollTo({ top: 0 }); }],
            ["trade", "Chart", LineChart, mobilePane === "main" && ["trade", "indicators", "chain", "alerts", "news"].includes(tab) && !moreOpen, () => goTab("trade")],
            ["positions", "Positions", Briefcase, mobilePane === "main" && tab === "positions" && !moreOpen, () => goTab("positions")],
            ["orders", pendingOrders.length ? `Orders (${pendingOrders.length})` : "Orders", ListOrdered, mobilePane === "main" && tab === "orders" && !moreOpen, () => goTab("orders")],
            ["more", "More", Ellipsis, moreOpen || (mobilePane === "main" && ["history", "perf", "leaderboard", "replay", "learn", "strategies"].includes(tab)), () => setMoreOpen((v) => !v)],
          ].map(([id, label, Icon, active, onClick]) => (
            <button key={id} className={`bottomNavItem ${active ? "bottomNavItemActive" : ""}`} aria-current={active ? "page" : undefined} onClick={onClick}>
              <Icon size={20} />
              <span>{label}</span>
              {id === "more" && !stratSeen && <span className="navDot" aria-label="New feature inside" />}
            </button>
          ))}
        </nav>
      )}

      {confirmReset && (
        <div className="modalOverlay" onClick={() => setConfirmReset(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Reset account?</h3>
            <p>This clears all positions, cash, and trade history back to {fmtMoney(STARTING_CASH, 0)}.</p>
            <div className="modalBtns">
              <button className="btn btnGhost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn btnBear" onClick={doReset}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind} ${isMobile ? "toastMobile" : ""}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  );
}

function Stat({ label, value, tone, pulse, className = "" }) {
  return (
    <div className={`stat ${pulse ? `pulse-${pulse}` : ""} ${className}`}>
      <span className="statLabel">{label}</span>
      <span className={`statValue mono ${tone ? tone : ""}`}>{value}</span>
    </div>
  );
}

function ProLockPanel({ title, description, onUpgrade }) {
  return (
    <div className="lockPanel">
      <div className="lockPanelIcon"><Lock size={20} /></div>
      <h3>{title}</h3>
      <p className="dim">{description}</p>
      <button className="btn btnMarigold lockPanelBtn" onClick={onUpgrade}><Sparkles size={14} /> Upgrade to Pro</button>
    </div>
  );
}

function OptionTicket({ ticket, quotes, instruments, onClose, onSubmit, heldQty, shortQty, marketOpen, isPro, onUpgrade }) {
  const [qty, setQty] = useState(1);
  const [sl, setSl] = useState("");
  const [slErr, setSlErr] = useState("");
  const alertSl = (msg) => setSlErr(msg);
  const spot = quotes[ticket.symbol]?.price ?? 0;
  const symMeta = instruments.find((s) => s.symbol === ticket.symbol);
  const T = (ticket.expiry - nowMs()) / (365 * 24 * 3600 * 1000);
  const sigma = symMeta.iv * (1 + 0.15 * Math.abs(ticket.strike - spot) / spot);
  const modelGreeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);
  const greeks = { ...modelGreeks, price: realPremium(ticket) ?? modelGreeks.price };
  const lot = lotSizeFor(ticket.symbol);
  const marginEst = shortMarginPerLot(spot, ticket.strike, ticket.type, lot) * qty;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal ticketModal" role="dialog" aria-modal="true" aria-label="Option order ticket" onClick={(e) => e.stopPropagation()}>
        <div className="ticketHead">
          <div>
            <span className={`typeBadge ${ticket.type}`}>{ticket.type.toUpperCase()}</span>
            <h3>{displayTicker(ticket.symbol)} {ticket.strike}</h3>
            <span className="dim">Exp {fmtDate(new Date(ticket.expiry))}</span>
          </div>
          <button className="iconBtn" onClick={onClose} aria-label="Close order ticket"><X size={16} /></button>
        </div>

        <div className="greeksGrid mono">
          <div><span className="dim">Premium</span>{fmtMoney(greeks.price)}{premiumSource(ticket) === "model" && <span className="estTag">est.</span>}</div>
          <div><span className="dim" title="Delta — how much this option's premium moves for a ₹1 move in the underlying (e.g. 0.50 = about ₹0.50 of premium change per ₹1 move).">Delta</span>{greeks.delta.toFixed(3)}</div>
          <div><span className="dim" title="Gamma — how fast Delta itself changes as the underlying moves. Higher gamma means Delta shifts quickly, so risk can change fast near expiry or at-the-money.">Gamma</span>{greeks.gamma.toFixed(4)}</div>
          <div><span className="dim" title="Theta — how much premium this option loses per day purely from time passing, all else equal (e.g. -0.80 = about ₹0.80 lost per day).">Theta</span>{greeks.theta.toFixed(3)}</div>
          <div><span className="dim" title="Vega — how much the premium changes for a 1 percentage-point change in implied volatility. Higher vega means the price is more sensitive to shifts in market expectations.">Vega</span>{greeks.vega.toFixed(3)}</div>
          <div><span className="dim" title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</span>{(sigma * 100).toFixed(1)}%</div>
        </div>

        <div className="orderRow">
          <label>Lots <span className="dim">(1 lot = {lot})</span></label>
          <input type="number" min="1" inputMode="numeric" aria-label="Number of lots" className="qtyInput mono" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
        <div className="qtyChips" role="group" aria-label="Quick lots">
          {[1, 2, 5, 10].map((n) => (
            <button key={n} type="button" className={`qtyChip ${qty === n ? "qtyChipActive" : ""}`} onClick={() => setQty(n)}>{n} lot{n > 1 ? "s" : ""}</button>
          ))}
          {heldQty > 0 && <button type="button" className={`qtyChip ${qty === heldQty ? "qtyChipActive" : ""}`} onClick={() => setQty(heldQty)}>All long ({heldQty})</button>}
          {shortQty > 0 && <button type="button" className={`qtyChip ${qty === shortQty ? "qtyChipActive" : ""}`} onClick={() => setQty(shortQty)}>All short ({shortQty})</button>}
        </div>
        <div className="lotExplain dim">1 lot = {lot} units, so {qty} lot{qty > 1 ? "s" : ""} = <b className="mono">{(qty * lot).toLocaleString("en-IN")} units</b></div>
        <div className="orderEst mono">Premium ({qty * lot} units): <span>{fmtMoney(greeks.price * lot * qty)}</span></div>
        <div className="orderHint dim mono" style={{ marginTop: "-8px" }}>Long: {heldQty} lot{heldQty === 1 ? "" : "s"} · Short: {shortQty} lot{shortQty === 1 ? "" : "s"} · Margin to short ≈ {fmtMoney(marginEst, 0)}</div>

        <div className="orderRow">
          <label>Stop-loss premium <span className="dim">(optional)</span></label>
          {isPro ? (
            <input type="number" min="0" step="0.05" className="qtyInput mono" placeholder={`e.g. ${(greeks.price * 0.7).toFixed(2)}`} value={sl} onChange={(e) => { setSl(e.target.value); setSlErr(""); }} />
          ) : (
            <button className="btn btnGhost" onClick={onUpgrade}><Lock size={12} /> Pro</button>
          )}
        </div>
        {slErr && <div className="orderHint bear" style={{ marginTop: "-8px" }}>{slErr}</div>}
        {(() => {
          const v = parseFloat(sl);
          if (!(v > 0)) return null;
          const lossLong = (greeks.price - v) * lot * qty;
          const lossShort = (v - greeks.price) * lot * qty;
          return <div className="orderHint dim mono" style={{ marginTop: "-8px" }}>{v < greeks.price ? `Buy: auto-exit at ${fmtMoney(v)} · max loss ≈ ${fmtMoney(lossLong)}` : `Sell to Open: auto-exit at ${fmtMoney(v)} · max loss ≈ ${fmtMoney(lossShort)}`}</div>;
        })()}

        <div className="ticketSection dim">Buy (long)</div>
        <div className="orderBtns">
          <button className="btn btnBull" disabled={!marketOpen} onClick={() => {
            const v = parseFloat(sl);
            if (v > 0 && v >= greeks.price) return alertSl(`For a buy, stop-loss must be below the premium (${fmtMoney(greeks.price)})`);
            onSubmit("buy", qty, v > 0 ? +v.toFixed(2) : null);
          }}>Buy to Open</button>
          <button className="btn btnGhost" disabled={!marketOpen || heldQty === 0} onClick={() => onSubmit("sell", qty)}>Sell to Close</button>
        </div>
        <div className="ticketSection dim">Sell (short / option writing)</div>
        <div className="orderBtns">
          <button className="btn btnBear" disabled={!marketOpen} onClick={() => {
            const v = parseFloat(sl);
            if (v > 0 && v <= greeks.price) return alertSl(`For Sell to Open, stop-loss must be above the premium (${fmtMoney(greeks.price)})`);
            onSubmit("short", qty, v > 0 ? +v.toFixed(2) : null);
          }}>Sell to Open</button>
          <button className="btn btnGhost" disabled={!marketOpen || shortQty === 0} onClick={() => onSubmit("cover", qty)}>Buy to Close</button>
        </div>
        <div className="orderHint dim">Selling an option earns the premium upfront but blocks margin, and losses can be much larger than the premium if the market moves against you. Margin shown is a simplified estimate.</div>
        {!marketOpen && (
          <div className="orderHint dim" style={{ textAlign: "center", marginTop: "10px" }}>Market is closed — trading resumes 9:15 AM Mon–Fri</div>
        )}
      </div>
    </div>
  );
}

function SplashScreen({ label, themeIdx }) {
  return (
    <div className="authWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>
      <div className="authCard splashCard">
        <div className="authBrand"><Flame size={22} className="brandIcon" /><span>PAPERRALLY</span></div>
        <div className="authSub">{label}</div>
      </div>
    </div>
  );
}

function PopoutCanvasImpl({ entry, clock, dayStart, dayEnd, fitKey, prevClose }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const prevLineRef = useRef(null);
  const fitRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = LW.createChart(ref.current, {
      width: ref.current.clientWidth,
      height: ref.current.clientHeight || 480,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: LW.CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, timeVisible: true, secondsVisible: false, rightOffset: 0 },
    });
    seriesRef.current = chart.addSeries(LW.CandlestickSeries, {
      upColor: LW_COLORS.bull, downColor: LW_COLORS.bear, borderVisible: false, wickUpColor: LW_COLORS.bull, wickDownColor: LW_COLORS.bear,
    });
    chartRef.current = chart;
    const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth, height: ref.current.clientHeight || 480 }); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); chart.remove(); };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!entry) { series.setData([]); return; }
    const snap = replaySnapshot(entry, clock);
    const today = snap.history.filter((c) => c.time >= dayStart);
    const data = today.map((c) => ({ time: Math.floor(c.time / 1000) + IST_OFFSET_SEC, open: c.open, high: c.high, low: c.low, close: c.close }));
    // empty slots up to 3:30 PM keep the whole session on the time axis
    let t = today.length ? today[today.length - 1].time + REPLAY_CANDLE_MS : dayStart;
    for (; t < dayEnd; t += REPLAY_CANDLE_MS) data.push({ time: Math.floor(t / 1000) + IST_OFFSET_SEC });
    series.setData(data);
    if (prevLineRef.current) { series.removePriceLine(prevLineRef.current); prevLineRef.current = null; }
    if (prevClose) prevLineRef.current = series.createPriceLine({ price: prevClose, color: LW_COLORS.text, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "prev close" });
    if (fitRef.current !== fitKey) { chartRef.current?.timeScale().fitContent(); fitRef.current = fitKey; }
  }, [entry, clock, dayStart, dayEnd, fitKey, prevClose]);

  return <div ref={ref} className="popChart" />;
}

function PopoutChart() {
  const params = new URLSearchParams((window.location.hash.split("?")[1]) || "");
  const [themeIdx, setThemeIdx] = useState(() => loadThemeIdx());
  const [date, setDate] = useState(params.get("date") || lastTradingDayISO());
  const [sym, setSym] = useState(params.get("sym") || "^NSEI");
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dayStart = Date.parse(date + "T09:15:00+05:30");
  const dayEnd = dayStart + 375 * 60000;
  const [clock, setClock] = useState(dayStart);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(5);
  const [linked, setLinked] = useState(false);
  const lastStateRef = useRef(0);
  const chRef = useRef(null);
  const meta = INSTRUMENTS.find((s) => s.symbol === sym);
  // Trade panel: orders go to the main PaperRally tab, which owns the portfolio.
  const [acct, setAcct] = useState(null);
  const lastAcctRef = useRef(0);
  const [termConnected, setTermConnected] = useState(false);
  const [tradeQty, setTradeQty] = useState(10);
  const [tradeMode, setTradeMode] = useState("stock"); // stock | options
  const [optType, setOptType] = useState("call");
  const [optExpiryIdx, setOptExpiryIdx] = useState(0);
  const [optStrike, setOptStrike] = useState(null);
  const [optLots, setOptLots] = useState(1);
  const [tradeMsg, setTradeMsg] = useState(null);
  const pendingRef = useRef({});
  const symRef = useRef(sym);
  useEffect(() => { symRef.current = sym; chRef.current?.postMessage({ type: "watch", sym }); }, [sym]);
  // Live chart of today's session while the market is open.
  const isToday = date === istTodayISO();
  const [liveFollow, setLiveFollow] = useState(true);

  useEffect(() => { document.title = `${displayTicker(sym)} · ${date} · PaperRally chart`; }, [sym, date]);

  // load the chosen symbol's day
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetchYahooDay(sym, date)
      .then((e) => {
        if (cancelled) return;
        if (!e.candles.length) { setEntry(null); setError("No data for this day. Pick a recent weekday that wasn't a market holiday."); }
        else setEntry(e);
      })
      .catch(() => { if (!cancelled) { setEntry(null); setError("Couldn't load this day's data. Try another date."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sym, date]);

  // follow the main terminal's replay when it is running the same day
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(REPLAY_CHANNEL);
    chRef.current = ch;
    ch.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "acct") { lastAcctRef.current = Date.now(); setAcct(m); setTermConnected(true); return; }
      if (m.type === "orderResult") {
        if (pendingRef.current[m.id]) { delete pendingRef.current[m.id]; setTradeMsg({ ok: m.ok, msg: m.msg }); }
        return;
      }
      if (m.type !== "state") return;
      if (m.active && m.date === date) {
        lastStateRef.current = Date.now();
        setLinked(true); setClock(m.clock); setRunning(m.running); setRate(m.rate);
      } else if (!m.active || m.date !== date) {
        setLinked(false);
      }
    };
    ch.postMessage({ type: "hello" });
    ch.postMessage({ type: "watch", sym: symRef.current });
    const iv = setInterval(() => {
      if (Date.now() - lastStateRef.current > 3000) setLinked(false);
      if (Date.now() - lastAcctRef.current > 3500) setTermConnected(false);
    }, 1500);
    return () => { clearInterval(iv); ch.close(); chRef.current = null; };
  }, [date]);

  // Today, market hours, not linked to a replay: track the real clock and refresh candles every minute.
  const liveNow = !linked && isToday && liveFollow && Date.now() >= dayStart && Date.now() < dayEnd + 60000;
  useEffect(() => {
    if (!liveNow) return;
    setRunning(false);
    setClock(Math.min(Date.now(), dayEnd));
    const tick = setInterval(() => setClock(Math.min(Date.now(), dayEnd)), 1000);
    const refetch = setInterval(() => { fetchYahooDay(sym, date).then((e) => { if (e.candles.length) setEntry(e); }).catch(() => {}); }, 60000);
    return () => { clearInterval(tick); clearInterval(refetch); };
  }, [liveNow, sym, date]);

  // own clock when not linked
  useEffect(() => {
    if (linked || !running) return;
    const iv = setInterval(() => setClock((c) => Math.min(c + 500 * rate, dayEnd)), 500);
    return () => clearInterval(iv);
  }, [linked, running, rate, dayEnd]);
  useEffect(() => { if (!linked && clock >= dayEnd && running) setRunning(false); }, [clock, dayEnd, running, linked]);
  useEffect(() => { if (!linked) { setClock(dayStart); setRunning(false); } }, [date]);

  const send = (msg) => chRef.current?.postMessage({ ...msg, date });
  const seek = (t) => { const v = Math.max(dayStart, Math.min(t, dayEnd)); if (linked) send({ type: "seek", clock: v }); else { setLiveFollow(false); setClock(v); } };
  const togglePlay = () => {
    if (linked) { send({ type: running ? "pause" : "play" }); return; }
    setLiveFollow(false);
    if (clock >= dayEnd) setClock(dayStart);
    setRunning((r) => !r);
  };
  const changeRate = (r) => { if (linked) send({ type: "rate", rate: r }); else setRate(r); };

  const snap = entry ? replaySnapshot(entry, clock) : null;
  const todayCandles = snap ? snap.history.filter((c) => c.time >= dayStart) : [];
  const price = snap ? snap.price : null;
  const chg = snap && snap.prevClose ? ((snap.price - snap.prevClose) / snap.prevClose) * 100 : 0;
  const dayHigh = todayCandles.length ? Math.max(...todayCandles.map((c) => c.high)) : null;
  const dayLow = todayCandles.length ? Math.min(...todayCandles.map((c) => c.low)) : null;
  const timeLabel = new Date(clock).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const minDate = new Date(Date.now() - 55 * 86400000).toISOString().slice(0, 10);
  const ticks = ["09:15", "10:30", "11:45", "13:00", "14:15", "15:30"];

  const isIndexSym = meta?.exchange === "INDEX";
  const heldPos = acct?.positions?.find((p) => p.symbol === sym);
  const termPrice = acct?.watch?.symbol === sym ? acct.watch.price : null;
  const dayLabel = (iso) => new Date(iso + "T12:00:00+05:30").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  // Trades only make sense when the chart shows the same moment the terminal trades at.
  let tradeBlock = null;
  if (!termConnected) tradeBlock = { text: "Keep your PaperRally tab open in this browser to trade from this window." };
  else if (acct.mode === "replay" && acct.date !== date) tradeBlock = { text: `Your terminal is replaying ${dayLabel(acct.date)}, but this chart shows ${dayLabel(date)}.`, action: { label: `Show ${dayLabel(acct.date)}`, run: () => setDate(acct.date) } };
  else if (acct.mode === "live" && !acct.open) tradeBlock = { text: `The market is closed. Practise ${dayLabel(date)} from 9:15 AM — with separate practice money — and trade it right here.`, action: { label: `Practise ${dayLabel(date)}`, run: () => chRef.current?.postMessage({ type: "startReplay", date }) } };
  else if (acct.mode === "live" && !isToday) tradeBlock = { text: "The market is open now — switch the chart to today to trade.", action: { label: "Show today", run: () => { setLiveFollow(true); setDate(istTodayISO()); } } };
  else if (acct.mode === "replay" && !acct.open) tradeBlock = { text: "This replay day has ended. Restart it from the terminal to trade again." };
  const canTrade = !tradeBlock && !isIndexSym;
  const showOptions = isIndexSym || tradeMode === "options";
  useEffect(() => { setOptStrike(null); setOptExpiryIdx(0); }, [sym]);

  // Options: priced the same way as the terminal's Options Chain (Black-Scholes on the terminal's spot and volatility).
  const optSpot = termPrice;
  const optIv = acct?.watch?.symbol === sym ? acct.watch.iv : null;
  const optNow = acct?.now ?? Date.now();
  const optExpiries = termConnected ? optionExpiries(sym, 4, acct.mode === "replay" ? Date.parse(acct.date + "T09:15:00+05:30") : null) : [];
  const optExpiry = optExpiries[Math.min(optExpiryIdx, Math.max(optExpiries.length - 1, 0))];
  const optStep = EXPIRY_RULES[sym]?.step ?? (optSpot ? strikeStep(optSpot) : 50);
  const optStrikes = optSpot ? strikesAround(optSpot, 11, optStep) : [];
  const atmStrike = optStrikes[Math.floor(optStrikes.length / 2)];
  const strikeNow = optStrike != null && optStrikes.includes(optStrike) ? optStrike : atmStrike;
  const optLot = lotSizeFor(sym);
  let optPremium = null;
  if (optSpot && optIv && optExpiry && strikeNow) {
    const T = (optExpiry.getTime() - optNow) / (365 * 24 * 3600 * 1000);
    const sigma = optIv * (1 + 0.15 * Math.abs(strikeNow - optSpot) / optSpot);
    optPremium = blackScholes(optSpot, strikeNow, T, RISK_FREE, sigma, optType).price;
  }
  const optCost = optPremium != null ? optPremium * optLot * optLots : null;
  const optMargin = optSpot && strikeNow ? shortMarginPerLot(optSpot, strikeNow, optType, optLot) * optLots : null;
  const canTradeOptions = !tradeBlock && termConnected && acct.isPro;

  const sendOptionOrder = (mode) => {
    const id = Math.random().toString(36).slice(2);
    pendingRef.current[id] = true;
    setTradeMsg({ ok: true, msg: "Sending order…", pending: true });
    chRef.current?.postMessage({ type: "optOrder", id, sym, mode, qty: optLots, opt: { type: optType, strike: strikeNow, expiry: optExpiry.getTime() } });
    setTimeout(() => {
      if (pendingRef.current[id]) { delete pendingRef.current[id]; setTradeMsg({ ok: false, msg: "No reply from your PaperRally tab — is it still open?" }); }
    }, 4000);
  };
  const closeOptionPos = (p) => {
    const id = Math.random().toString(36).slice(2);
    pendingRef.current[id] = true;
    chRef.current?.postMessage({ type: "optClose", id, posId: p.id });
    setTimeout(() => { delete pendingRef.current[id]; }, 4000);
  };
  const fmtExpiry = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

  const placeOrder = (side, qtyOverride) => {
    const qty = qtyOverride ?? tradeQty;
    const id = Math.random().toString(36).slice(2);
    pendingRef.current[id] = true;
    setTradeMsg({ ok: true, msg: "Sending order…", pending: true });
    chRef.current?.postMessage({ type: "order", id, sym, side, qty });
    setTimeout(() => {
      if (pendingRef.current[id]) { delete pendingRef.current[id]; setTradeMsg({ ok: false, msg: "No reply from your PaperRally tab — is it still open?" }); }
    }, 4000);
  };
  const closePosition = (p) => {
    const id = Math.random().toString(36).slice(2);
    pendingRef.current[id] = true;
    chRef.current?.postMessage({ type: "order", id, sym: p.symbol, side: "sell", qty: p.qty });
    setTimeout(() => { delete pendingRef.current[id]; }, 4000);
  };
  const posValue = (acct?.positions ?? []).reduce((sum, p) => sum + (p.price ?? p.avgPrice) * p.qty, 0);

  return (
    <div className="app popWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>
      <div className="popTop">
        <div className="brand"><Flame size={18} className="brandIcon" /><span>PAPERRALLY</span><span className="brandSub">full-day chart</span></div>
        <div className="popTopRight">
          {linked ? <span className="popLinked">Linked to terminal replay</span> : <span className="dim popHint">Standalone · open Replay in the terminal to link</span>}
          <label className="dim popDateLabel">Date
            <input type="date" className="qtyInput mono" value={date} min={minDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={linked} />
          </label>
          <button className="themeBtn" onClick={() => setThemeIdx((i) => { const n = (i + 1) % THEMES.length; saveThemeIdx(n); return n; })}><span className="themeEmoji">{THEMES[themeIdx].emoji}</span> {THEMES[themeIdx].name}</button>
        </div>
      </div>

      <div className="popBody">
        <div className="popList">
          {["INDEX", "NSE", "BSE"].map((ex) => (
            <div key={ex}>
              <div className="popListHead dim">{ex === "INDEX" ? "Indices" : ex}</div>
              {INSTRUMENTS.filter((s) => s.exchange === ex).map((s) => (
                <button key={s.symbol} className={`popListRow ${sym === s.symbol ? "popListRowActive" : ""}`} onClick={() => setSym(s.symbol)}>
                  <span className="wlTicker">{displayTicker(s.symbol)}</span>
                  <span className="wlName">{s.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="popMain">
          <div className="popHead">
            <div>
              <h1>{displayTicker(sym)}</h1>
              <span className="dim">{meta?.name} · {new Date(dayStart).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
            {price != null && (
              <div className="popPrice">
                <span className="mono bigPrice">{fmtMoney(price)}</span>
                <span className={`mono ${chg >= 0 ? "bull" : "bear"}`}>{fmtPct(chg)}</span>
                {dayHigh != null && <span className="dim mono popHL">H {fmtMoney(dayHigh)} · L {fmtMoney(dayLow)}</span>}
              </div>
            )}
          </div>

          <div className="popChartCard">
            {loading && <div className="popOverlay dim">Loading {displayTicker(sym)}…</div>}
            {error && !loading && <div className="popOverlay bear">{error}</div>}
            <PopoutCanvas entry={entry} clock={clock} dayStart={dayStart} dayEnd={dayEnd} fitKey={`${sym}|${date}|${entry ? 1 : 0}`} prevClose={entry?.prevClose} />
          </div>

          <div className="popControls">
            {liveNow
              ? <span className="popLiveTag">● TODAY</span>
              : <button className="btn btnBull popPlay" onClick={togglePlay} disabled={!entry}>{running ? "Pause" : clock >= dayEnd ? "Replay day" : "Play"}</button>}
            {!linked && isToday && !liveFollow && Date.now() < dayEnd && <button className="indToggle" onClick={() => setLiveFollow(true)}>Follow today</button>}
            <span className="mono popClock">{timeLabel}</span>
            <div className="popSliderWrap">
              <input type="range" className="replaySlider popSlider" aria-label="Choose time" min={dayStart} max={dayEnd} step={60000} value={clock} onChange={(e) => seek(Number(e.target.value))} disabled={!entry} />
              <div className="popTicks dim mono">{ticks.map((t) => <span key={t}>{t}</span>)}</div>
            </div>
            {[1, 5, 30, 60].map((r) => (
              <button key={r} className={`indToggle ${rate === r ? "indToggleActive" : ""}`} onClick={() => changeRate(r)}>{r}x</button>
            ))}
            <button className="indToggle" onClick={() => seek(dayStart)} disabled={!entry}>Open</button>
            <button className="indToggle" onClick={() => seek(dayEnd)} disabled={!entry}>Close</button>
          </div>
          <div className="dim popFoot">Drag the time bar to any minute between 9:15 AM and 3:30 PM, then press Play. When the terminal is running a replay of the same day, this window follows and controls the same clock.</div>
        </div>

        <aside className="popTrade">
          <div className="popTradeHead">
            <h3>Trade {displayTicker(sym)}</h3>
            {termConnected && <span className={`popModeTag ${acct.mode === "replay" ? "popModeReplay" : acct.open ? "popModeLive" : ""}`}>{acct.mode === "replay" ? `Replay · ${dayLabel(acct.date)}` : acct.open ? "Market open" : "Closed"}</span>}
          </div>

          {termConnected && (
            <div className="popTradeStats">
              <div><span className="dim">Cash</span><span className="mono">{fmtMoney(acct.cash, 0)}</span></div>
              <div><span className="dim">Stocks held</span><span className="mono">{fmtMoney(posValue, 0)}</span></div>
            </div>
          )}

          {tradeBlock && (
            <div className="popTradeBlock">
              <p>{tradeBlock.text}</p>
              {tradeBlock.action && <button className="btn btnBull popTradeBlockBtn" onClick={tradeBlock.action.run}><Play size={13} /> {tradeBlock.action.label}</button>}
            </div>
          )}

          {!isIndexSym && (
            <div className="popTradeTabs">
              <button className={`popTradeTab ${tradeMode === "stock" ? "popTradeTabActive" : ""}`} onClick={() => setTradeMode("stock")}>Shares</button>
              <button className={`popTradeTab ${tradeMode === "options" ? "popTradeTabActive" : ""}`} onClick={() => setTradeMode("options")}>Options</button>
            </div>
          )}

          {showOptions && !tradeBlock && termConnected && !acct.isPro && (
            <div className="popTradeBlock"><p>Options trading is a Pro feature. Upgrade from your PaperRally tab to trade options here.</p></div>
          )}

          {showOptions && canTradeOptions && (
            <div className="popOptForm">
              <div className="popOptTypes">
                <button className={`popOptType ${optType === "call" ? "popOptCall" : ""}`} onClick={() => setOptType("call")}>Call (CE)</button>
                <button className={`popOptType ${optType === "put" ? "popOptPut" : ""}`} onClick={() => setOptType("put")}>Put (PE)</button>
              </div>
              <div className="orderRow">
                <label>Spot</label>
                <span className="mono">{optSpot != null ? fmtMoney(optSpot) : "…"}</span>
              </div>
              <div className="orderRow">
                <label>Expiry</label>
                <select className="qtyInput mono popSelect" value={optExpiryIdx} onChange={(e) => setOptExpiryIdx(Number(e.target.value))}>
                  {optExpiries.map((d, i) => <option key={d.getTime()} value={i}>{fmtExpiry(d)}</option>)}
                </select>
              </div>
              <div className="orderRow">
                <label>Strike</label>
                <select className="qtyInput mono popSelect" value={strikeNow ?? ""} onChange={(e) => setOptStrike(Number(e.target.value))}>
                  {optStrikes.map((k) => <option key={k} value={k}>{k}{k === atmStrike ? " (ATM)" : ""}</option>)}
                </select>
              </div>
              <div className="orderRow">
                <label>Lots <span className="dim">× {optLot}</span></label>
                <input type="number" min="1" className="qtyInput mono" value={optLots} onChange={(e) => setOptLots(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="orderEst mono">
                <span className="dim">Premium</span>
                <span>{optPremium != null ? fmtMoney(optPremium) : "…"}</span>
              </div>
              <div className="orderEst mono">
                <span className="dim">Buy cost</span>
                <span>{optCost != null ? fmtMoney(optCost) : "…"}</span>
              </div>
              <div className="orderBtns">
                <button className="btn btnBull" onClick={() => sendOptionOrder("buy")} disabled={optPremium == null || !optExpiry}><TrendingUp size={14} /> Buy</button>
                <button className="btn btnBear" onClick={() => sendOptionOrder("short")} disabled={optPremium == null || !optExpiry} title={optMargin != null ? `Blocks about ${fmtMoney(optMargin, 0)} margin` : ""}><TrendingDown size={14} /> Sell to open</button>
              </div>
              {optMargin != null && <div className="dim popOptNote">Selling blocks about {fmtMoney(optMargin, 0)} margin. Close positions from the list below.</div>}
            </div>
          )}

          {!showOptions && canTrade && (
            <>
              <div className="orderRow">
                <label>Price</label>
                <span className="mono">{termPrice != null ? fmtMoney(termPrice) : "…"}</span>
              </div>
              <div className="orderRow">
                <label>Quantity</label>
                <input type="number" min="1" className="qtyInput mono" value={tradeQty} onChange={(e) => setTradeQty(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div className="orderEst mono">
                <span className="dim">Est. cost</span>
                <span>{termPrice != null ? fmtMoney(termPrice * tradeQty) : "…"}</span>
              </div>
              <div className="orderBtns">
                <button className="btn btnBull" onClick={() => placeOrder("buy")}><TrendingUp size={14} /> Buy</button>
                <button className="btn btnBear" onClick={() => placeOrder("sell")} disabled={!heldPos}><TrendingDown size={14} /> Sell</button>
              </div>
              <div className="held mono">{heldPos ? `Held: ${heldPos.qty} sh · avg ${fmtMoney(heldPos.avgPrice)}` : "Held: 0 shares"}</div>
            </>
          )}

          {tradeMsg && <div className={`popTradeMsg ${tradeMsg.pending ? "dim" : tradeMsg.ok ? "bull" : "bear"}`}>{tradeMsg.msg}</div>}

          {termConnected && acct.positions.length > 0 && (
            <div className="popPositions">
              <div className="popListHead dim">Open positions</div>
              {acct.positions.map((p) => {
                const pnl = p.price != null ? (p.price - p.avgPrice) * p.qty : null;
                return (
                  <div key={p.symbol} className="popPosRow">
                    <button className="popPosSym" onClick={() => setSym(p.symbol)}>{displayTicker(p.symbol)}<span className="dim"> · {p.qty} sh</span></button>
                    <span className={`mono ${pnl == null ? "dim" : pnl >= 0 ? "bull" : "bear"}`}>{pnl == null ? "…" : fmtMoney(pnl, 0)}</span>
                    <button className="indToggle popPosClose" onClick={() => closePosition(p)} disabled={!acct.open || (acct.mode === "replay" && acct.date !== date)}>Close</button>
                  </div>
                );
              })}
            </div>
          )}
          {termConnected && acct.options?.length > 0 && (
            <div className="popPositions">
              <div className="popListHead dim">Option positions</div>
              {acct.options.map((p) => {
                const pnl = p.premium != null ? (p.side === "short" ? p.avgPremium - p.premium : p.premium - p.avgPremium) * p.mult * p.qty : null;
                return (
                  <div key={p.id} className="popPosRow">
                    <button className="popPosSym" onClick={() => { setSym(p.symbol); setTradeMode("options"); }}>
                      {displayTicker(p.symbol)} {p.strike} {p.type === "call" ? "CE" : "PE"}
                      <span className="dim"> · {p.side === "short" ? "−" : ""}{p.qty} lot{p.qty > 1 ? "s" : ""} · {fmtExpiry(new Date(p.expiry))}</span>
                    </button>
                    <span className={`mono ${pnl == null ? "dim" : pnl >= 0 ? "bull" : "bear"}`}>{pnl == null ? "…" : fmtMoney(pnl, 0)}</span>
                    <button className="indToggle popPosClose" onClick={() => closeOptionPos(p)} disabled={!acct.open}>Close</button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="dim popTradeFoot">Orders go to your PaperRally tab and use the same balance, positions and history.</div>
        </aside>
      </div>
    </div>
  );
}

const isPopoutRoute = () => typeof window !== "undefined" && window.location.hash.startsWith("#/chart");

// ---- Site closed switch ----
// While true, only the owner can use PaperRally; everyone else sees the closed page (the owner signs
// in at paperrally.in/?owner=1). To close the site again: set this to true and restore vercel.json
// (it redirected the guide pages to the home page and told search engines not to index the site).
export const SITE_CLOSED = false;
const OWNER_EMAIL_SHA256 = "309953611ce27921024f1f4854e9efd81b2c29fd7ece895538551463cbac3f4e";
async function isOwnerEmail(email) {
  if (!email) return false;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("") === OWNER_EMAIL_SHA256;
}

function ClosedPage() {
  return (
    <div className="authWrap" style={THEMES[0].vars}>
      <style>{CSS}</style>
      <div className="authCard splashCard">
        <div className="authBrand"><Flame size={22} className="brandIcon" /><span>PAPERRALLY</span></div>
        <h1 style={{ fontSize: "20px", margin: "14px 0 8px" }}>Temporarily unavailable</h1>
        <div className="authSub">PaperRally is closed for now. For questions about your account or a payment, email <a href="mailto:adi.shiv999@gmail.com" style={{ color: "#FFFFFF", textDecoration: "underline" }}>adi.shiv999@gmail.com</a>.</div>
      </div>
    </div>
  );
}

// The user's own broker API opens the app. A key alone isn't proof, so the app only opens
// once they've logged in on their broker's own page and the broker has confirmed the connection.
// Someone who has never connected first sees a read-only preview, then is asked whether they
// have an Angel One account, then gets the step-by-step setup. Every stage is recorded in app_events
// (setup_*, preview_*) so the drop-off between stages can be measured.
const SETUP_PENDING = "pr_setup_pending"; // set just before leaving for the broker's login page
const readPending = () => { try { return JSON.parse(sessionStorage.getItem(SETUP_PENDING) || "null"); } catch { return null; } };
const writePending = (v) => { try { v ? sessionStorage.setItem(SETUP_PENDING, JSON.stringify(v)) : sessionStorage.removeItem(SETUP_PENDING); } catch { /* storage unavailable */ } };
// Wait up to 800 ms for the event to be saved, so it isn't lost when the page navigates away.
const trackThenGo = (name, props, url) => Promise.race([track(name, props), new Promise((r) => setTimeout(r, 800))]).then(() => { window.location.href = url; });

function BrokerGate({ children }) {
  const [state, setState] = useState("checking"); // "checking" | "open" | "connect"
  const [broker, setBroker] = useState(activeBroker);
  const [hasKey, setHasKey] = useState(() => !!activeBroker()?.api.hasCredentials());
  const [error, setError] = useState("");
  // Brand-new users (no broker chosen, no key) start on the preview; anyone part-way through goes straight to setup.
  const [phase, setPhase] = useState(() => (activeBroker() ? "setup" : "preview")); // "preview" | "question" | "setup"
  const opened = useRef(false);
  const verify = async () => {
    const b = activeBroker();
    if (!b) return setState("connect");
    const pending = readPending();
    try {
      await b.api.finishLogin();
      if (!b.api.hasSession()) return setState("connect");
      if (pending) track("setup_logged_in", { broker: b.id, kind: pending.kind });
      await b.api.fetchProfile();
      if (pending) {
        let first = true;
        try { first = !localStorage.getItem(`pr_setup_done_${b.id}`); localStorage.setItem(`pr_setup_done_${b.id}`, "1"); } catch { /* storage unavailable */ }
        track("setup_connected", { broker: b.id, kind: pending.kind, first });
        writePending(null);
      }
      setState("open");
    } catch (e) {
      if (pending) { track("setup_failed", { broker: b.id, kind: pending.kind, message: String(e?.message || e).slice(0, 120) }); writePending(null); }
      b.api.clearConnection();
      setError(e?.userMessage || `${b.name} couldn't confirm this login. Check your key and try again.`);
      setState("connect");
    }
  };
  useEffect(() => {
    verify();
    const ended = () => { setError("Your broker session has ended. Please connect again."); setState("connect"); };
    window.addEventListener("pr-broker-expired", ended);
    return () => window.removeEventListener("pr-broker-expired", ended);
  }, []);
  // Record "opened setup" once per visit, and the preview when it's shown.
  useEffect(() => {
    if (state !== "connect" || opened.current) return;
    opened.current = true;
    track("setup_open", { kind: hasKey ? "reconnect" : "new", broker: broker?.id || null, phase });
    if (phase === "preview") track("preview_view");
  }, [state]);
  if (state === "open") return children;
  if (state === "checking") return <SplashScreen label="Connecting to your broker…" themeIdx={0} />;
  const brand = <div className="authBrand"><Flame size={22} className="brandIcon" /><span>PAPERRALLY</span></div>;
  const pick = (id) => { chooseBroker(id); setBroker(id ? BROKERS[id] : null); setHasKey(id ? BROKERS[id].api.hasCredentials() : false); setError(""); };
  let body;
  if (phase === "preview" && !hasKey) {
    body = <AppPreview brand={brand} onConnect={() => setPhase("question")} />;
  } else if (phase === "question" && !hasKey) {
    body = (
      <AccountQuestion
        brand={brand}
        onYes={() => { pick("angel"); setPhase("setup"); }}
        onOther={() => { pick(""); setPhase("setup"); }}
        onBack={() => { track("preview_view", { from: "question" }); setPhase("preview"); }}
      />
    );
  } else {
    body = (
      <BrokerSetup
        brokers={BROKERS}
        broker={broker}
        hasKey={hasKey}
        error={error}
        onChoose={pick}
        onConnect={async (c) => { await broker.api.saveCredentials(c); writePending({ broker: broker.id, kind: "new" }); await trackThenGo("setup_login_redirect", { broker: broker.id, kind: "new" }, broker.api.loginUrl()); }}
        onReconnect={() => { writePending({ broker: broker.id, kind: "reconnect" }); trackThenGo("setup_login_redirect", { broker: broker.id, kind: "reconnect" }, broker.api.loginUrl()); }}
        onForget={() => { broker.api.forgetCredentials(); pick(""); setHasKey(false); setPhase("question"); }}
        brand={brand}
      />
    );
  }
  return (
    <div className="authWrap" style={THEMES[0].vars}>
      <style>{CSS}</style>
      <style>{PREVIEW_CSS}</style>
      {body}
    </div>
  );
}

function ClosedGate() {
  const [access, setAccess] = useState("checking"); // "checking" | "owner" | "closed" | "login"
  const wantsLogin = new URLSearchParams(window.location.search).has("owner");
  useEffect(() => {
    const check = async (session) => {
      if (!session) return setAccess(wantsLogin ? "login" : "closed");
      if (await isOwnerEmail(session.user?.email)) return setAccess("owner");
      setAccess("closed");
      signOutUser().catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => check(session), 0); });
    return () => listener.subscription.unsubscribe();
  }, []);
  if (access === "owner") return <BrokerGate>{isPopoutRoute() ? <PopoutChart /> : <MainApp />}</BrokerGate>;
  if (access === "login") return <AuthGate themeIdx={0} cycleTheme={() => {}} initialMode="login" />;
  if (access === "checking") return <SplashScreen label="Loading…" themeIdx={0} />;
  return <ClosedPage />;
}

export default function App() {
  if (SITE_CLOSED) return <ClosedGate />;
  // The pop-out chart reads prices from the broker connection too, so it sits behind the same gate.
  return isPopoutRoute() ? <BrokerGate><PopoutChart /></BrokerGate> : <MainApp />;
}

function MainApp() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [themeIdx, setThemeIdx] = useState(() => loadThemeIdx());
  const [showAuthForm, setShowAuthForm] = useState(() => !!window.history.state?.prAuth);
  const [authInitialMode, setAuthInitialMode] = useState("login");
  const [phoneStatus, setPhoneStatus] = useState("checking");
  const [referral, setReferral] = useState(null); // { available, invited, wasReferred, bonusDays }

  // The sign-in form has its own history entry, so the phone/browser back button returns to the landing page.
  useEffect(() => {
    const onPop = (e) => setShowAuthForm(!!e.state?.prAuth);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Every account (password or Google) needs exactly one phone_registry row.
  // Password sign-up already inserts this at registration time; Google
  // sign-in skips straight to a session, so we check for it here and show a
  // one-time PhoneGate if it's missing.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setPhoneStatus("checking"); return; }
    let cancelled = false;
    setPhoneStatus("checking");
    hasRegisteredPhone(userId).then((has) => {
      if (!cancelled) setPhoneStatus(has ? "ok" : "needed");
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Referrals: record who invited a brand-new account, then load bonus trial days.
  useEffect(() => {
    const user = session?.user;
    setReferral(null);
    if (!user || phoneStatus !== "ok") return;
    let cancelled = false;
    syncReferrals(supabase, user.id).then((r) => { if (!cancelled) setReferral(r); });
    // First session of a brand-new account counts as a completed sign-up.
    const key = `pr_signup_tracked_${user.id}`;
    if (Date.now() - new Date(user.created_at).getTime() < 15 * 60000 && !loadSetting(key, false)) {
      saveSetting(key, true);
      track("signup_complete", { provider: user.app_metadata?.provider || "password" });
    }
    return () => { cancelled = true; };
  }, [session?.user?.id, phoneStatus]);

  const refreshSubscription = async () => {
    const userId = session?.user?.id;
    if (!userId) return null;
    const sub = await fetchSubscription(userId);
    setSubscription(sub);
    return sub;
  };

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) { setPortfolioData(null); setSubscription(null); return; }
    let cancelled = false;
    setPortfolioLoading(true);
    Promise.all([fetchPortfolio(userId), fetchSubscription(userId)])
      .then(([portfolio, sub]) => {
        if (cancelled) return;
        setPortfolioData(portfolio);
        setSubscription(sub);
      })
      .catch(() => {
        if (cancelled) return;
        setPortfolioData(hydratePortfolio(null));
        setSubscription({ status: "free", current_period_end: null });
      })
      .finally(() => { if (!cancelled) setPortfolioLoading(false); });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const cycleTheme = () => {
    setThemeIdx((i) => {
      const next = (i + 1) % THEMES.length;
      saveThemeIdx(next);
      return next;
    });
  };

  if (sessionLoading) return <SplashScreen label="Loading…" themeIdx={themeIdx} />;
  if (!session) {
    return showAuthForm ? (
      <AuthGate
        themeIdx={themeIdx}
        cycleTheme={cycleTheme}
        initialMode={authInitialMode}
        onBack={() => (window.history.state?.prAuth ? window.history.back() : setShowAuthForm(false))}
      />
    ) : (
      <LandingPage
        themeIdx={themeIdx}
        onEnter={(mode) => { setAuthInitialMode(mode); window.history.pushState({ prAuth: true }, ""); setShowAuthForm(true); }}
      />
    );
  }
  if (phoneStatus === "checking") return <SplashScreen label="Loading…" themeIdx={themeIdx} />;
  if (phoneStatus === "needed") {
    return (
      <PhoneGate
        userId={session.user.id}
        userEmail={session.user.email}
        themeIdx={themeIdx}
        cycleTheme={cycleTheme}
        onDone={() => setPhoneStatus("ok")}
        onCancel={() => setPhoneStatus("checking")}
      />
    );
  }
  if (portfolioLoading || !portfolioData || !subscription || referral === null) return <SplashScreen label="Loading your portfolio…" themeIdx={themeIdx} />;

  const username = session.user.user_metadata?.username || session.user.email.split("@")[0];
  const isPaidPro = subscription.status === "active";
  const daysLeftInTrial = trialDaysRemaining(session.user.created_at, referral?.bonusDays || 0);
  const inTrial = !isPaidPro && daysLeftInTrial > 0;
  const isPro = isPaidPro || inTrial;

  // Prices come from each user's own broker connection, so the terminal opens only once that is confirmed.
  return (
    <BrokerGate>
    <TradingApp
      key={session.user.id}
      username={username}
      userId={session.user.id}
      userEmail={session.user.email}
      contactEmail={session.user.app_metadata?.provider === "google" ? session.user.email : null}
      memberSince={session.user.created_at}
      proUntil={isPaidPro ? subscription.current_period_end : null}
      signInMethod={session.user.app_metadata?.provider === "google" ? "google" : "password"}
      referral={referral}
      initialPortfolio={portfolioData}
      isPro={isPro}
      isPaidPro={isPaidPro}
      inTrial={inTrial}
      trialDaysLeft={daysLeftInTrial}
      onRefreshSubscription={refreshSubscription}
      onLogout={signOutUser}
      themeIdx={themeIdx}
      cycleTheme={cycleTheme}
    />
    </BrokerGate>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

.app, .authWrap, .landingWrap {
  --bg: #0A0D14; --surface: #121722; --surface-2: #1A2130; --border: #232B3D;
  --text: #E7ECF6; --text-dim: #8B96AA; --bull: #14E8A0; --bear: #FF5470;
  --accent: #7B61FF; --amber: #FFB020;
  background: var(--bg); color: var(--text);
  font-family: 'Inter', sans-serif;
}
.app { min-height: 100vh; display: flex; flex-direction: column; }
.mono { font-family: 'JetBrains Mono', monospace; }
.bull { color: var(--bull); } .bear { color: var(--bear); } .dim { color: var(--text-dim); }

.authWrap { position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.authCard { width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.splashCard { text-align: center; padding: 40px 28px; }
.splashCard .authSub { margin: 10px 0 0; }
.authBrand { display: flex; align-items: center; gap: 8px; font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 18px; justify-content: center; }
.authSub { text-align: center; color: var(--text-dim); font-size: 12px; margin: 6px 0 22px; }
.authGoogleBtn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 16px; }
.authDivider { display: flex; align-items: center; text-align: center; color: var(--text-dim); font-size: 11px; margin: 4px 0 16px; }
.authDivider::before, .authDivider::after { content: ""; flex: 1; border-bottom: 1px solid var(--border); }
.authDivider span { padding: 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.authTabs { display: flex; background: var(--surface-2); border-radius: 10px; padding: 4px; margin-bottom: 20px; }
.authTab { flex: 1; background: none; border: none; color: var(--text-dim); padding: 9px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.authTabActive { background: var(--accent); color: white; }
.authField { display: flex; align-items: center; gap: 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.authField input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 13px; }
.authIcon { color: var(--text-dim); flex-shrink: 0; }
.authError { color: var(--bear); font-size: 12px; margin-bottom: 12px; }
.authSubmit { width: 100%; margin-top: 4px; }
.authNote { color: var(--text-dim); font-size: 11px; margin-top: 18px; text-align: center; line-height: 1.5; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; border-bottom: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: center; gap: 8px; font-family: 'Instrument Sans', sans-serif; font-weight: 700; letter-spacing: -0.2px; font-size: 16px; }
.brandIcon { color: var(--amber); }
.brandSub { font-family: 'Inter'; font-weight: 400; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-left: 4px; }
.stats { display: flex; gap: 28px; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 2px 8px; border-radius: 6px; transition: background 0.3s; }
.statLabel { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.8px; }
.statValue { font-size: 15px; font-weight: 500; }
.pulse-bull { animation: pulseBull 0.7s ease; }
.pulse-bear { animation: pulseBear 0.7s ease; }
@keyframes pulseBull { 0% { background: rgba(20,232,160,0.25); } 100% { background: transparent; } }
@keyframes pulseBear { 0% { background: rgba(255,84,112,0.25); } 100% { background: transparent; } }
.topbarActions { display: flex; align-items: center; gap: 10px; }
.userBadge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border); padding: 7px 12px; border-radius: 20px; }
.proBadge { background: var(--amber); color: #241800; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 999px; letter-spacing: 0.4px; }
.proBadgeTrial { background: var(--accent); color: white; margin-left: 5px; }
.upgradeBtn { display: inline-flex; align-items: center; gap: 6px; background: var(--amber); color: #241800; border: none; padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease; }
.upgradeBtn:hover { opacity: 0.85; }
.resetBtn { display: flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.resetBtn:hover { color: var(--text); border-color: var(--accent); }
.themeBtn { display: flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.themeBtn:hover { color: var(--text); border-color: var(--amber); }
.themeEmoji { font-size: 12px; line-height: 1; }
.authThemeBtn { position: absolute; top: 18px; right: 18px; padding: 6px 12px; font-size: 11px; }

.body { display: flex; flex: 1; min-height: 0; }

.watchlist { width: 270px; border-right: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; flex-shrink: 0; }
.search { margin: 12px 12px 8px; padding: 9px 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 13px; outline: none; }
.search:focus { border-color: var(--accent); }
.exchangeTabs { display: flex; gap: 4px; padding: 0 12px 10px; }
.exTab { flex: 1; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 6px 4px; border-radius: 6px; font-size: 11px; cursor: pointer; }
.exTabActive { background: var(--accent); color: white; border-color: var(--accent); }
.wlHead { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 8px; font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.6px; }
.liveDot { color: var(--bull); }
.liveDotOff { color: var(--text-dim); }
.wlList { overflow-y: auto; flex: 1; }
.wlEmpty { padding: 26px 16px; font-size: 12.5px; text-align: center; line-height: 1.5; }
.wlRemoteLabel { padding: 10px 14px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
.wlRowAdd { border-left: 3px solid var(--accent); }
.addBadge { font-size: 11px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); padding: 4px 10px; border-radius: 20px; flex-shrink: 0; }
.wlRow { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: transparent; border: none; border-left: 3px solid transparent; cursor: pointer; text-align: left; }
.wlRow:hover { background: var(--surface-2); }
.wlRowActive { background: var(--surface-2); border-left: 3px solid var(--accent); }
.wlSym { display: flex; flex-direction: column; }
.wlTicker { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.wlName { font-size: 10px; color: var(--text-dim); }
.wlPriceCol { display: flex; flex-direction: column; align-items: flex-end; }
.wlPrice { font-size: 13px; }
.wlChg { font-size: 11px; display: flex; align-items: center; gap: 3px; }
.exBadge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.4px; }
.exBadge-NSE { background: rgba(123,97,255,0.18); color: #9E8CFF; }
.exBadge-BSE { background: rgba(255,176,32,0.18); color: var(--amber); }
.exBadge-INDEX { background: rgba(20,232,160,0.18); color: var(--bull); }

.main { flex: 1; padding: 20px 28px; overflow-y: auto; min-width: 0; }
.mainHead { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
.mainHeadLeft { display: flex; align-items: baseline; gap: 10px; }
.mainHead h1 { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 27px; letter-spacing: -0.3px; margin: 0; }
.mainHeadName { color: var(--text-dim); font-size: 13px; }
.mainHeadPrice { display: flex; flex-direction: column; align-items: flex-end; }
.bigPrice { font-size: 22px; font-weight: 700; color: var(--amber); }
.marketStatusBadge { font-size: 10px; padding: 3px 9px; border-radius: 20px; margin-top: 4px; font-weight: 600; }
.marketOpen { background: rgba(20,232,160,0.15); color: var(--bull); }
.marketClosed { background: rgba(255,84,112,0.15); color: var(--bear); }

.navBackBtn { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--text-dim); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; padding: 6px 2px; margin-bottom: 8px; }
.navBackBtn:hover { color: var(--text); }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; flex-wrap: wrap; }
.tab { background: none; border: none; color: var(--text-dim); padding: 10px 16px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; border-radius: 8px 8px 0 0; transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; }
.tab:hover { color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); border-bottom-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tabActive { color: var(--text); font-weight: 600; border-bottom: 2px solid var(--accent); }
.tabActive:hover { color: var(--text); border-bottom-color: var(--accent); }

.tradeGrid { display: grid; grid-template-columns: 1fr 260px; gap: 20px; }
.chartCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; transition: box-shadow 0.2s ease, border-color 0.2s ease; }
.chartCard:hover { border-color: color-mix(in srgb, var(--border) 60%, var(--text-dim)); box-shadow: 0 10px 30px rgba(0,0,0,0.22); }
.chartHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 10px; }
.tfTabs, .indToggles { display: flex; gap: 4px; align-items: center; }
.tfTab { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; font-variant-numeric: tabular-nums; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
.tfTab:hover { color: var(--text); border-color: var(--accent); }
.tfTabActive { background: var(--accent); color: white; border-color: var(--accent); }
.tfTabActive:hover { color: white; }
.indToggle { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
.indToggle:hover { color: var(--text); }
.indDot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.indToggleActive { background: var(--amber); color: #241800; border-color: var(--amber); }
.practiceTopBtn { background: var(--accent); color: white; border-color: var(--accent); font-weight: 600; }
.practiceTopBtn:hover:not(:disabled) { filter: brightness(1.1); color: white; border-color: var(--accent); }
.practiceTopBtn:disabled { opacity: 0.6; cursor: wait; }
.practiceTodayBtn { background: var(--accent); color: white; border-color: var(--accent); font-weight: 600; }
.practiceTodayBtn:hover:not(:disabled) { filter: brightness(1.1); color: white; }
.practiceTodayBtn:disabled { opacity: 0.6; cursor: wait; }
.fitBtn { margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--border); border-radius: 0 6px 6px 0; }
.chartTypeBtn { margin-left: 6px; }
.subChart { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 10px; }
.subChartLabel { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.chartHint { margin-top: 10px; font-size: 10px; text-align: center; }
.chartHintActive { margin-top: 10px; font-size: 11px; text-align: center; color: var(--amber); font-weight: 600; }
.lwChartPicking { cursor: crosshair; }
.lwWrap { position: relative; }
.lwChart { width: 100%; }
.lwLegend { position: absolute; top: 4px; left: 4px; z-index: 5; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0.2px; color: var(--text); background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.12); padding: 3px 9px; border-radius: 6px; pointer-events: none; }
.lwLegend:empty { display: none; }
.drawToolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.drawToolBtn { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
.drawToolBtn:hover { color: var(--text); border-color: var(--accent); }
.drawToolBtnActive { background: var(--accent); color: white; border-color: var(--accent); }
.drawToolHint { font-size: 11px; margin-left: 4px; }
.estTag { margin-left: 5px; font-size: 9.5px; font-weight: 600; color: var(--text-dim); letter-spacing: 0.3px; text-transform: uppercase; }
.slTag { font-size: 10.5px; font-weight: 600; color: var(--text-dim); margin-top: 2px; letter-spacing: 0.2px; }
.lwChartOuter { position: relative; }
.lwDrawOverlay { position: absolute; top: 0; left: 0; pointer-events: none; }
.lwChart a[href*="tradingview.com"] { display: none !important; }

.orderCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; height: fit-content; transition: box-shadow 0.2s ease; }
.orderCard:hover { box-shadow: 0 10px 30px rgba(0,0,0,0.22); }
.orderCard h3 { margin: 0; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 14px; }
.orderCardHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.orderTypeTabs { display: flex; gap: 3px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 3px; margin-bottom: 14px; }
.orderTypeTab { flex: 1; background: none; color: var(--text-dim); padding: 7px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.orderTypeTab:hover { color: var(--text); }
.orderTypeTabActive { background: var(--accent); color: white; }
.orderHint { font-size: 11px; line-height: 1.5; margin-bottom: 14px; }
.orderCardSym { font-size: 11px; color: var(--text-dim); background: var(--surface-2); border: 1px solid var(--border); padding: 3px 9px; border-radius: 20px; }
.indexNote { font-size: 12px; line-height: 1.6; margin: 0; }
.orderRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.orderRow label { font-size: 12px; color: var(--text-dim); }
.qtyInput { width: 90px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 6px; font-size: 13px; text-align: right; transition: border-color 0.15s ease; }
.qtyInput:focus { outline: none; border-color: var(--accent); }
.orderEst { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-dim); padding: 10px 0; margin-bottom: 14px; border-top: 1px dashed var(--border); }
.pickPriceBtn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: var(--surface-2); border: 1px dashed var(--border); color: var(--text-dim); padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; margin-bottom: 12px; transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease; }
.pickPriceBtn:hover { color: var(--text); border-color: var(--accent); }
.pickPriceBtnActive { background: var(--amber); color: #241800; border: 1px solid var(--amber); }
.pickPriceBtnActive:hover { color: #241800; }
.orderEst span:last-child { color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.orderBtns { display: flex; gap: 8px; margin-bottom: 14px; }
.btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s ease, transform 0.1s ease; }
.btn:hover { opacity: 0.85; }
.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btnBull { background: var(--bull); color: #06231A; }
.btnBear { background: var(--bear); color: #2B0710; }
.btnGhost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.btnMarigold { background: var(--amber); color: #241800; }
.held { font-size: 11px; color: var(--text-dim); }
.posSummary { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
.posSummaryRow { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; padding: 3px 0; }
.posSummaryRow .mono { font-variant-numeric: tabular-nums; }

.indTab { display: flex; flex-direction: column; gap: 18px; }
.indTabHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.indTabHead h3 { margin: 0 0 4px; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 16px; }
.indTabHead p { margin: 0; font-size: 12.5px; max-width: 62ch; line-height: 1.5; }
.indTabChartBtn { flex: none; padding: 9px 16px; }
.indGroup { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
.indGroup h4 { margin: 0; padding: 12px 16px; font-size: 11px; font-weight: 600; border-bottom: 1px solid var(--border); }
.indRow { display: grid; grid-template-columns: auto auto 1fr minmax(150px, 220px); align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.indRow:last-child { border-bottom: none; }
.indRowOn { background: color-mix(in srgb, var(--accent) 7%, transparent); }
.indSwitch { width: 36px; height: 20px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface-2); position: relative; cursor: pointer; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--text-dim); }
.indSwitch span { position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--text-dim); transition: transform 0.15s ease, background 0.15s ease; }
.indSwitchOn { background: var(--accent); border-color: var(--accent); }
.indSwitchOn span { transform: translateX(16px); background: white; }
.indSwitch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.indName { font-size: 13.5px; font-weight: 600; }
.indDesc { font-size: 11.5px; line-height: 1.45; margin-top: 2px; }
.indRead { text-align: right; }
.indVal { font-size: 13px; font-weight: 600; }
.indText { font-size: 11.5px; color: var(--text-dim); margin-top: 2px; }
.indText.bull { color: var(--bull); } .indText.bear { color: var(--bear); }
@media (max-width: 700px) { .indRow { grid-template-columns: auto auto 1fr; } .indRead { grid-column: 3; text-align: left; } }
.pickEmpty { background: var(--surface); border: 1px dashed var(--border); border-radius: 12px; padding: 48px 24px; text-align: center; }
.pickEmpty h3 { margin: 0 0 8px; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 17px; }
.pickEmpty p { max-width: 46ch; margin: 0 auto 18px; font-size: 13px; line-height: 1.6; }
.pickQuick { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.pickQuickBtn { flex: none; padding: 8px 16px; }
.replayBadge { align-self: center; background: var(--amber); color: #241800; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px; letter-spacing: 0.5px; }
.replayBar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 24px; background: color-mix(in srgb, var(--amber) 14%, var(--surface)); border-bottom: 1px solid color-mix(in srgb, var(--amber) 40%, var(--border)); }
.replayBarTag { background: var(--amber); color: #241800; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.bseAll { border-top: 1px solid var(--border); margin-top: 4px; }
.bseAllHead { padding-top: 10px; }
.bseMcap { font-size: 11px; color: var(--text-dim); }
.bseMoreBtn { width: calc(100% - 16px); margin: 8px; font-size: 12px; justify-content: center; }
.closedBar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 24px; background: color-mix(in srgb, var(--accent) 12%, var(--surface)); border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); }
.closedBarTag { background: var(--bear); color: white; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
.closedBarText { flex: 1 1 260px; font-size: 13px; color: var(--text); line-height: 1.45; }
.closedBarBtn { padding: 8px 14px; font-size: 13px; white-space: nowrap; }
.firstTradeCard { position: relative; margin: 12px 24px 0; padding: 16px 44px 14px 18px; border-radius: 12px; background: color-mix(in srgb, var(--bull) 9%, var(--surface)); border: 1px solid color-mix(in srgb, var(--bull) 45%, var(--border)); }
.firstTradeClose { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; border-radius: 6px; }
.firstTradeClose:hover { color: var(--text); background: color-mix(in srgb, var(--text) 8%, transparent); }
.firstTradeTitle { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; color: var(--text); }
.firstTradeText { margin: 8px 0 10px; font-size: 13px; line-height: 1.55; color: var(--text-dim); }
.firstTradeText b { color: var(--text); }
.firstTradeSteps { margin: 0; padding-left: 20px; display: grid; gap: 8px; font-size: 13px; color: var(--text); }
.firstTradeSteps li::marker { color: var(--text-dim); font-weight: 700; }
.firstTradeBtn { padding: 8px 14px; font-size: 13px; }
.buyGlow { animation: buyGlow 1.4s ease-in-out infinite; }
@keyframes buyGlow { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--bull) 70%, transparent); } 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--bull) 0%, transparent); } }
@media (prefers-reduced-motion: reduce) { .buyGlow { animation: none; outline: 2px solid var(--bull); outline-offset: 2px; } }
.closedOrderHint { display: grid; gap: 8px; margin-top: -4px; }
.closedPracticeBtn { width: 100%; font-size: 12.5px; }
.phoneGateIntro { margin: 0 0 16px; font-size: 13px; color: var(--text); }
.phoneGatePromises { margin: 16px 0 0; padding-left: 18px; color: var(--text-dim); font-size: 11.5px; line-height: 1.6; text-align: left; }
.phonePrivacyNote { margin: -4px 0 12px; text-align: left; }
@media (max-width: 700px) { .closedBar { padding: 10px 16px; } .firstTradeCard { margin: 12px 16px 0; } .closedBarBtn { width: 100%; justify-content: center; } }
.replayBarClock { font-size: 13px; font-weight: 600; margin-right: 6px; }
.replayProgress { flex: 1; min-width: 80px; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; margin-right: 6px; }
.replayProgress div { height: 100%; background: var(--amber); }
.replayExitBtn { margin-left: auto; }
.replayTitle { margin: 0 0 12px; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 16px; }
.replaySlider { flex: 2; min-width: 140px; accent-color: var(--amber); cursor: pointer; }
.rtl { flex-basis: 100%; padding: 22px 10px 2px; user-select: none; }
.rtlTrack { position: relative; height: 22px; cursor: pointer; outline: none; touch-action: none; }
.rtlTrack:focus-visible .rtlThumb { box-shadow: 0 0 0 4px color-mix(in srgb, var(--amber) 40%, transparent); }
.rtlRail, .rtlPlayed, .rtlFuture { position: absolute; top: 8px; height: 6px; border-radius: 999px; }
.rtlRail { left: 0; right: 0; background: var(--surface-2); border: 1px solid var(--border); }
.rtlPlayed { left: 0; background: var(--amber); }
.rtlFuture { right: 0; background: repeating-linear-gradient(45deg, var(--border) 0 4px, transparent 4px 8px); cursor: not-allowed; }
.rtlTick { position: absolute; top: 4px; width: 1px; height: 14px; background: var(--text-dim); opacity: 0.5; transform: translateX(-0.5px); }
.rtlThumb { position: absolute; top: 2px; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: var(--amber); border: 3px solid var(--surface); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
.rtlDragging .rtlThumb { transform: scale(1.15); }
.rtlThumbLabel, .rtlHover { position: absolute; bottom: 22px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; pointer-events: none; }
.rtlThumbLabel { background: var(--amber); color: #241800; }
.rtlHover { bottom: 22px; background: var(--surface); color: var(--text); border: 1px solid var(--border); margin-left: 0; }
.rtlLabels { position: relative; height: 18px; margin-top: 2px; }
.rtlLabel { position: absolute; transform: translateX(-50%); background: none; border: none; padding: 0 2px; font-size: 10px; color: var(--text-dim); cursor: pointer; }
.rtlLabel:hover:not(:disabled) { color: var(--text); text-decoration: underline; }
.rtlLabel:disabled { opacity: 0.4; cursor: not-allowed; }
.rtlLabel:first-child { transform: none; }
.rtlLabel:last-child { transform: translateX(-100%); }
.popWrap { height: 100vh; overflow: hidden; }
.popTop { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 18px; border-bottom: 1px solid var(--border); background: var(--surface); flex-wrap: wrap; }
.popTopRight { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.popLinked { background: color-mix(in srgb, var(--amber) 20%, transparent); color: var(--amber); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.popHint { font-size: 11px; }
.popDateLabel { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.popDateLabel .qtyInput { width: 150px; text-align: left; }
.popBody { display: flex; height: calc(100vh - 58px); }
.popList { width: 210px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--surface); padding-bottom: 12px; }
.popListHead { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; padding: 12px 14px 6px; }
.popListRow { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 8px 14px; background: none; border: none; border-left: 3px solid transparent; cursor: pointer; color: var(--text); text-align: left; }
.popListRow:hover { background: var(--surface-2); }
.popListRowActive { background: var(--surface-2); border-left-color: var(--accent); }
.popMain { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 14px 20px; gap: 12px; }
.popHead { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
.popHead h1 { margin: 0; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 24px; }
.popHead .dim { font-size: 12.5px; }
.popPrice { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.popHL { font-size: 11px; }
.popChartCard { position: relative; flex: 1; min-height: 260px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px; }
.popChart { width: 100%; height: 100%; }
.popOverlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5; font-size: 13px; text-align: center; padding: 20px; }
.popTrade { width: 280px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--border); background: var(--surface); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.popTradeHead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.popTradeHead h3 { margin: 0; font-size: 15px; }
.popModeTag { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 8px; border-radius: 4px; background: var(--bear); color: white; white-space: nowrap; }
.popModeLive { background: var(--bull); color: #06231A; }
.popModeReplay { background: var(--amber); color: #241800; }
.popTradeStats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.popTradeStats > div { display: flex; flex-direction: column; gap: 2px; font-size: 12px; background: color-mix(in srgb, var(--text) 4%, transparent); border-radius: 8px; padding: 8px 10px; }
.popTradeStats .mono { font-size: 14px; color: var(--text); }
.popTradeBlock { background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.5; }
.popTradeBlock p { margin: 0; }
.popTradeBlockBtn { margin-top: 10px; width: 100%; justify-content: center; font-size: 12.5px; }
.popTradeMsg { font-size: 12.5px; line-height: 1.4; }
.popPositions { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--border); padding-top: 10px; }
.popPositions .popListHead { padding: 0 0 4px; }
.popPosRow { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; font-size: 12.5px; }
.popPosSym { background: none; border: none; padding: 0; color: var(--text); font-weight: 700; cursor: pointer; text-align: left; font-size: 12.5px; }
.popPosClose { padding: 3px 8px; font-size: 11px; }
.popTradeTabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: color-mix(in srgb, var(--text) 5%, transparent); padding: 3px; border-radius: 8px; }
.popTradeTab { background: none; border: none; color: var(--text-dim); padding: 6px; border-radius: 6px; font-weight: 600; font-size: 12.5px; cursor: pointer; }
.popTradeTabActive { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.popOptForm { display: flex; flex-direction: column; gap: 8px; }
.popOptTypes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.popOptType { border: 1px solid var(--border); background: none; color: var(--text-dim); padding: 7px; border-radius: 8px; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.popOptCall { border-color: var(--bull); color: var(--bull); background: color-mix(in srgb, var(--bull) 10%, transparent); }
.popOptPut { border-color: var(--bear); color: var(--bear); background: color-mix(in srgb, var(--bear) 10%, transparent); }
.popSelect { width: 120px; }
.popOptNote { font-size: 11px; line-height: 1.45; }
.popTradeFoot { font-size: 11px; line-height: 1.5; margin-top: auto; }
.popLiveTag { color: var(--bull); font-weight: 800; font-size: 12px; letter-spacing: 0.5px; padding: 0 6px; }
@media (max-width: 1050px) { .popTrade { width: 240px; } }
@media (max-width: 760px) { .popBody { flex-direction: column; } .popTrade { width: auto; border-left: none; border-top: 1px solid var(--border); } }
.popControls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; }
.popPlay { flex: none; min-width: 96px; }
.popClock { font-size: 16px; font-weight: 700; color: var(--amber); min-width: 70px; text-align: center; }
.popSliderWrap { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.popSlider { width: 100%; }
.popTicks { display: flex; justify-content: space-between; font-size: 10px; }
.popFoot { font-size: 11px; }
@media (max-width: 760px) { .popList { display: none; } .popWrap { height: auto; overflow: auto; } .popBody { height: auto; } .popChartCard { height: 420px; flex: none; } }
.chainWrap { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.expiryTabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.expiryTab { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 6px 14px; border-radius: 20px; font-size: 12px; cursor: pointer; }
.expiryTabActive { background: var(--accent); color: white; border-color: var(--accent); }
.chainTableWrap { overflow-x: auto; }
.chainTable { width: 100%; border-collapse: collapse; font-size: 12px; }
.chainTable th, .chainTable td { padding: 7px 10px; text-align: center; white-space: nowrap; }
.chainSideHead { font-size: 11px; letter-spacing: 1px; padding-bottom: 10px; }
.callHead { color: var(--bull); text-align: left; }
.putHead { color: var(--bear); text-align: right; }
.callSide { color: var(--bull); }
.putSide { color: var(--bear); }
.strikeHead { color: var(--amber); }
.subhead th { color: var(--text-dim); font-weight: 400; font-size: 10px; border-bottom: 1px solid var(--border); }
.subhead th[title] { cursor: help; text-decoration: underline dotted; text-underline-offset: 3px; }
.strikeCell { font-weight: 700; color: var(--amber); background: var(--surface-2); }
.chainGutter { width: 4px; padding: 0; }
.premCell { cursor: pointer; border-radius: 6px; transition: background 0.12s; }
.premCell:hover { background: var(--surface-2); }
.itmCall { background: rgba(20,232,160,0.18); font-weight: 700; box-shadow: inset 3px 0 0 var(--bull); }
.itmPut { background: rgba(255,84,112,0.18); font-weight: 700; box-shadow: inset -3px 0 0 var(--bear); }
.otmCall, .otmPut { opacity: 0.55; font-weight: 400; }
.atmRow td { border-top: 1px dashed var(--amber); border-bottom: 1px dashed var(--amber); }
.chainNote { margin-top: 12px; font-size: 11px; color: var(--text-dim); }
.lockPanel { background: var(--surface); border: 1px dashed var(--border); border-radius: 12px; padding: 44px 24px; text-align: center; }
.lockPanelIcon { width: 44px; height: 44px; border-radius: 50%; background: var(--surface-2); color: var(--amber); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
.lockPanel h3 { margin-bottom: 8px; }
.lockPanel p { max-width: 34ch; margin: 0 auto 18px; font-size: 13px; line-height: 1.6; }
.lockPanelBtn { flex: none; display: inline-flex; padding: 9px 18px; }

.posWrap h3, .histWrap h3 { font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 14px; margin: 0 0 10px; }
.histHead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.histHead h3 { margin: 0; }
.exportBtn { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 7px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: color 0.15s ease, border-color 0.15s ease; }
.exportBtn:hover { color: var(--text); border-color: var(--accent); }
.allocWrap { margin-bottom: 26px; }
.allocBar { display: flex; height: 14px; border-radius: 8px; overflow: hidden; background: var(--surface-2); margin-bottom: 12px; }
.allocSeg { height: 100%; transition: opacity 0.15s ease; }
.allocSeg:hover { opacity: 0.8; }
.allocLegend { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.allocLegendItem { display: flex; align-items: center; gap: 7px; font-size: 12px; }
.allocSwatch { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.ordersHint { margin-top: 14px; font-size: 11.5px; line-height: 1.5; }
.newsList { display: flex; flex-direction: column; gap: 10px; }
.newsItem { display: flex; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; text-decoration: none; color: var(--text); transition: border-color 0.15s ease; }
.newsItem:hover { border-color: var(--accent); }
.newsThumb { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
.newsThumbFallback { display: flex; align-items: center; justify-content: center; background: var(--surface-2); color: var(--text-dim); }
.newsBody { display: flex; flex-direction: column; gap: 6px; min-width: 0; justify-content: center; }
.newsTitle { font-size: 13.5px; font-weight: 600; line-height: 1.4; }
.newsMeta { font-size: 11px; }
.mt { margin-top: 26px; }
.empty { color: var(--text-dim); font-size: 13px; padding: 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; text-align: center; }
.posTable { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.posTable th { text-align: left; font-size: 10px; color: var(--text-dim); text-transform: uppercase; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.posTable td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.posTable tr:last-child td { border-bottom: none; }
.newPill { display: inline-block; margin-left: 6px; padding: 2px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; line-height: 1.4; vertical-align: middle; color: #fff; background: linear-gradient(135deg, #7B61FF 0%, #3D8BFF 100%); box-shadow: 0 0 0 0 rgba(123, 97, 255, 0.55); animation: newPillPulse 2.6s ease-out infinite; }
@keyframes newPillPulse { 0% { box-shadow: 0 0 0 0 rgba(123, 97, 255, 0.55); } 70% { box-shadow: 0 0 0 7px rgba(123, 97, 255, 0); } 100% { box-shadow: 0 0 0 0 rgba(123, 97, 255, 0); } }
.bottomNavItem { position: relative; }
.navDot { position: absolute; top: 6px; right: calc(50% - 16px); width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg, #7B61FF, #3D8BFF); box-shadow: 0 0 0 2px var(--surface); }
.stratNudge { position: fixed; left: 24px; bottom: 24px; z-index: 60; width: min(380px, calc(100vw - 32px)); display: flex; gap: 14px; padding: 18px 18px 16px; border-radius: 16px; background: linear-gradient(180deg, color-mix(in srgb, #7B61FF 10%, var(--surface)) 0%, var(--surface) 60%); border: 1px solid color-mix(in srgb, #7B61FF 45%, var(--border)); box-shadow: 0 18px 50px rgba(15, 20, 40, 0.28); animation: stratNudgeIn 0.35s ease-out; }
@keyframes stratNudgeIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.stratNudgeIcon { flex: none; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; background: linear-gradient(135deg, #7B61FF 0%, #3D8BFF 100%); }
.stratNudgeBody { min-width: 0; }
.stratNudgeEyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em; color: color-mix(in srgb, #7B61FF 72%, var(--text)); margin-bottom: 4px; }
.stratNudgeTitle { font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 17px; font-weight: 700; margin-bottom: 6px; }
.stratNudgeBody p { margin: 0 0 14px; font-size: 13px; line-height: 1.55; color: var(--text-dim); }
.stratNudgeActions { display: flex; gap: 8px; flex-wrap: wrap; }
.stratNudgeActions .btn { flex: none; padding: 9px 14px; font-size: 13px; }
.stratNudgeX { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 4px; }
@media (max-width: 760px) { .stratNudge { right: 16px; left: 16px; width: auto; bottom: auto; top: 44px; } }
.posWrap h3.mt { margin-top: 26px; }
.wlLoading { font-size: 12px; font-style: italic; }
.setupKeyRow .btn { flex: none; width: auto; padding: 0 14px; }
.posHero { position: relative; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, var(--surface)) 0%, var(--surface) 140px); border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border)); border-radius: 18px; padding: 22px 24px 24px; box-shadow: 0 1px 0 color-mix(in srgb, var(--accent) 20%, transparent) inset, 0 18px 40px -24px rgba(20, 16, 60, 0.35); }
.posHeroHead { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.posEyebrow { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; }
.posWrap .posHero h3 { font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; margin: 0; display: flex; align-items: center; gap: 10px; }
.posHeroCount { background: var(--accent); color: #fff; font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 700; border-radius: 999px; min-width: 22px; height: 22px; display: inline-grid; place-items: center; padding: 0 7px; }
.posHeroPnl { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.15; }
.posHeroPnl b { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.optCards { display: flex; flex-direction: column; gap: 14px; }
.optCard { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px 16px 24px; overflow: hidden; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.optCard::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--bull); }
.optCardDown::before { background: var(--bear); }
.optCard:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); box-shadow: 0 10px 28px -18px rgba(0,0,0,0.35); }
.optCardTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.optTags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.sideTag, .expTag { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 8px; border-radius: 6px; white-space: nowrap; }
.sideShort { background: color-mix(in srgb, var(--bear) 14%, transparent); color: var(--bear); }
.sideLong { background: color-mix(in srgb, var(--bull) 14%, transparent); color: color-mix(in srgb, var(--bull) 75%, var(--text)); }
.expTag { background: var(--surface-2); color: var(--text-dim); border: 1px solid var(--border); }
.expToday { background: color-mix(in srgb, var(--amber) 16%, transparent); color: color-mix(in srgb, var(--amber) 70%, var(--text)); border-color: color-mix(in srgb, var(--amber) 45%, transparent); }
.optName { font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; white-space: nowrap; }
.optName .mono { font-family: 'JetBrains Mono', monospace; font-size: 20px; letter-spacing: -0.5px; }
.optRight { font-size: 14px; font-weight: 700; color: var(--text-dim); margin-left: 2px; }
.optSpot { font-size: 12.5px; margin-top: 4px; }
.optSpot .mono { color: var(--text); }
.optItm { color: color-mix(in srgb, var(--amber) 75%, var(--text)); font-weight: 600; }
.optPnl { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; text-align: right; }
.optPnl b { font-size: 24px; font-weight: 700; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.1; }
.optPnlPct { font-size: 12px; font-weight: 600; white-space: nowrap; opacity: 0.9; }
.optStats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1px; margin: 16px 0 14px; background: var(--border); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.optStats > div { background: var(--surface-2); padding: 10px 14px; min-width: 0; }
.optStats dt { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 4px; white-space: nowrap; }
.optStats dd { margin: 0; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.optActions { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.optActionsLeft { display: flex; gap: 8px; flex-wrap: wrap; }
.posBtn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease; }
.posBtn:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
.posBtn:active { transform: translateY(1px); }
.posBtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.posBtnExit { background: var(--bear); border-color: var(--bear); color: #fff; padding: 0 20px; }
.posBtnExit:hover { background: color-mix(in srgb, var(--bear) 86%, #000); border-color: color-mix(in srgb, var(--bear) 86%, #000); color: #fff; }
.posTableNum th:not(:first-child):not(:last-child), .posTableNum td:not(:first-child):not(:last-child) { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.posTableNum td.orderRowActions { justify-content: flex-end; }
@media (max-width: 700px) {
  .posHero { padding: 16px 14px 16px; border-radius: 16px; }
  .posHeroPnl { align-items: flex-start; }
  .posHeroPnl b { font-size: 24px; }
  .optStats > div:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .optCard { padding: 14px 14px 14px 18px; }
  .optName { font-size: 19px; } .optName .mono { font-size: 17px; }
  .optPnl { align-items: flex-start; text-align: left; }
  .optStats { grid-template-columns: 1fr 1fr; }
  .optActions { flex-direction: column; align-items: stretch; }
  .optActionsLeft { display: grid; grid-template-columns: 1fr 1fr; }
  .posBtn { height: 44px; }
}
.closeBtn { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.orderRowActions { display: flex; gap: 6px; }
.closeBtn:hover { color: var(--bear); border-color: var(--bear); }

.alertsWrap { display: flex; flex-direction: column; }
.alertForm { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.alertFormRow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
.alertSelect { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 6px; font-size: 12px; }
.alertAddBtn { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 14px; }
.alertHint { margin-top: 10px; font-size: 11px; line-height: 1.5; }
.replayWrap { display: flex; flex-direction: column; gap: 20px; }
.replayControls { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.replayControlsRow { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.replayField { display: flex; flex-direction: column; gap: 6px; }
.replayField label { font-size: 11px; color: var(--text-dim); }
.replayLoadBtn { flex: none; padding: 9px 20px; }
.replayHint { margin-top: 12px; font-size: 11.5px; line-height: 1.6; max-width: 70ch; }
.replayStats { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
.replayResetBtn { margin-left: auto; }
.alertStatus { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.alertActive { background: rgba(255,176,32,0.15); color: var(--amber); }
.alertTriggered { background: rgba(20,232,160,0.15); color: var(--bull); }

.modalOverlay { position: fixed; inset: 0; background: rgba(5,6,10,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(2px); }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; width: 340px; }
.modal h3 { margin: 0 0 8px; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; }
.modal p { color: var(--text-dim); font-size: 13px; margin: 0 0 18px; }
.modalBtns { display: flex; gap: 8px; }
.upgradeModal h3 { display: flex; align-items: center; gap: 8px; }
.proBadgeIcon { color: var(--amber); }
.upgradeList { list-style: none; padding: 0; margin: 0 0 18px; display: flex; flex-direction: column; gap: 8px; }
.upgradeList li { font-size: 13px; padding-left: 20px; position: relative; color: var(--text); }
.upgradeList li::before { content: "✓"; position: absolute; left: 0; color: var(--bull); font-weight: 700; }
.upgradeFinePrint { margin-top: 14px !important; font-size: 11px !important; text-align: center; }
.ticketModal { width: 380px; }
.ticketHead { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.ticketHead h3 { margin: 4px 0 2px; font-size: 20px; }
.typeBadge { font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 700; }
.typeBadge.call { background: rgba(20,232,160,0.15); color: var(--bull); }
.typeBadge.put { background: rgba(255,84,112,0.15); color: var(--bear); }
.ticketSection { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; margin: 4px 0 6px; }
.shortTag { background: rgba(255,84,112,0.15); color: var(--bear); font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-right: 6px; letter-spacing: 0.4px; }
.iconBtn { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text-dim); padding: 6px; cursor: pointer; }
.greeksGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: var(--surface-2); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
.greeksGrid div { display: flex; flex-direction: column; gap: 2px; }
.greeksGrid .dim { font-size: 10px; text-transform: uppercase; }
.greeksGrid .dim[title] { cursor: help; text-decoration: underline dotted; text-underline-offset: 2px; }

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 90vw; text-align: center; }
.toast-bull { background: var(--bull); color: #06231A; }
.toast-bear { background: var(--bear); color: #2B0710; }

.tickerTapeWrap { background: rgba(0,0,0,0.35); border-bottom: 1px solid rgba(255,255,255,0.08); overflow: hidden; white-space: nowrap; padding: 7px 0; position: relative; z-index: 1; }
.tickerTape { display: inline-block; padding-left: 100%; animation: tickerScroll 32s linear infinite; }
.tickerItem { display: inline-block; margin-right: 36px; font-size: 13px; font-weight: 600; color: #F3F6FB; }
.tickerItem b { color: #FFB020; font-weight: 700; margin-right: 6px; }
@keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

.heroLivePrice { display: flex; align-items: center; gap: 8px; font-size: 13px; background: var(--surface-2); border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; margin: 14px 0 4px; }
.heroLiveDot { width: 7px; height: 7px; border-radius: 50%; background: var(--bull); animation: liveDotPulse 1.6s ease-in-out infinite; flex-shrink: 0; }
.heroLivePriceVal { font-weight: 700; color: var(--text); }
@keyframes liveDotPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.miniHeroChart { width: 100%; height: 90px; margin-top: 4px; }

@keyframes heroFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.heroReveal { opacity: 0; animation: heroFadeUp 0.6s ease forwards; }
.heroReveal-1 { animation-delay: 0.05s; }
.heroReveal-2 { animation-delay: 0.15s; }
.heroReveal-3 { animation-delay: 0.25s; }
.heroReveal-4 { animation-delay: 0.35s; }
.heroReveal-5 { animation-delay: 0.45s; }

@keyframes ctaGlow { 0%, 100% { box-shadow: 0 0 0 rgba(20,232,160,0); } 50% { box-shadow: 0 0 22px rgba(20,232,160,0.45); } }
.landingCta.btnBull { animation: ctaGlow 2.6s ease-in-out infinite; }

.landingStats { display: flex; align-items: center; justify-content: center; gap: 36px; max-width: 900px; margin: 0 auto; padding: 0 40px 60px; flex-wrap: wrap; position: relative; z-index: 1; }
.landingStatItem { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.landingStatNum { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 22px; background: linear-gradient(100deg, var(--bull), var(--amber)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.landingStatLabel { font-size: 12px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
.landingStatDivider { width: 1px; height: 34px; background: rgba(255,255,255,0.16); }
@media (max-width: 700px) {
  .landingStatDivider { display: none; }
  .landingStats { gap: 22px; }
}

.landingMovers { max-width: 900px; margin: 0 auto; padding: 20px 40px 70px; text-align: center; position: relative; z-index: 1; }
.moversGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; text-align: left; }
.moversCol { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
.moversColUp { border-top: 3px solid var(--bull); }
.moversColDown { border-top: 3px solid var(--bear); }
.moversColTitle { display: flex; align-items: center; gap: 6px; font-family: 'Instrument Sans', sans-serif; font-size: 14px; margin: 0 0 12px; }
.moverRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; }
.moverRow:last-child { border-bottom: none; }
.moverSym { font-weight: 700; }
.moverPrice { flex: 1; text-align: right; }
.moverChg { min-width: 62px; text-align: right; font-weight: 600; }
@media (max-width: 700px) {
  .moversGrid { grid-template-columns: 1fr; }
}

.landingHero::before {
  content: ""; position: absolute; inset: -40px; z-index: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 26px 26px;
  animation: gridDrift 40s linear infinite;
  -webkit-mask-image: radial-gradient(circle at 30% 30%, black, transparent 70%);
  mask-image: radial-gradient(circle at 30% 30%, black, transparent 70%);
}
@keyframes gridDrift { from { background-position: 0 0; } to { background-position: 260px 260px; } }

.landingFeatureGrid .landingFeatureCard:nth-child(1) { transition-delay: 0s; }
.landingFeatureGrid .landingFeatureCard:nth-child(2) { transition-delay: 0.08s; }
.landingFeatureGrid .landingFeatureCard:nth-child(3) { transition-delay: 0.16s; }
.landingFeatureGrid .landingFeatureCard:nth-child(4) { transition-delay: 0.24s; }
.landingFeatureGrid .landingFeatureCard:nth-child(5) { transition-delay: 0.32s; }
.landingFeatureGrid .landingFeatureCard:nth-child(6) { transition-delay: 0.4s; }

.landingWhoFor { padding: 20px 40px 70px; max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }
.whoForGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.whoForCard { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 18px; transition: border-color 0.15s ease, transform 0.15s ease; }
.whoForCard:hover { border-color: rgba(255,255,255,0.25); transform: translateY(-2px); }
.whoForIcon { width: 30px; height: 30px; border-radius: 8px; background: rgba(255,255,255,0.08); color: var(--bull); display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
.whoForCard h3 { font-family: 'Instrument Sans', sans-serif; font-size: 14px; margin: 0 0 6px; }
.whoForCard p { font-size: 12.5px; line-height: 1.55; margin: 0; }

.replaySpotlight {
  display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center;
  max-width: 1080px; margin: 20px auto 80px; padding: 44px 48px; position: relative; z-index: 1;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bull) 10%, transparent), rgba(255,255,255,0.03));
  border: 1px solid color-mix(in srgb, var(--bull) 35%, transparent);
  border-radius: 22px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--bull) 12%, transparent), 0 30px 70px rgba(0,0,0,0.35), 0 0 60px color-mix(in srgb, var(--bull) 18%, transparent);
}
.replaySpotlightText { font-size: 14.5px; line-height: 1.65; margin: 0 0 18px; }
.replayVisual { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.25); }
.replaySvg { width: 100%; height: 120px; display: block; }
.replayPlayBadge { position: absolute; top: 14px; right: 14px; display: inline-flex; align-items: center; gap: 6px; background: rgba(20,232,160,0.15); color: var(--bull); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; }

.mistakesSection { max-width: 900px; margin: 0 auto; padding: 20px 40px 70px; text-align: center; position: relative; z-index: 1; }
.mistakesIntro { margin: -20px 0 34px; font-size: 14.5px; }
.mistakesList { display: flex; flex-direction: column; gap: 18px; text-align: left; }
.mistakeRow { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 18px 20px; }
.mistakeRow h3 { font-family: 'Instrument Sans', sans-serif; font-size: 15px; margin: 0 0 12px; }
.mistakeCols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mistakeColLabel { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 5px; }
.mistakeCol p { font-size: 12.5px; line-height: 1.55; margin: 0; }

.landingLearn { max-width: 1080px; margin: 0 auto; padding: 20px 40px 80px; text-align: center; position: relative; z-index: 1; }
.learnLinks { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.learnLinkBtn { flex: none; text-decoration: none; }

.landingFaq { max-width: 800px; margin: 0 auto; padding: 20px 40px 80px; position: relative; z-index: 1; }
.faqList { display: flex; flex-direction: column; gap: 14px; }
.faqItem { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 14px; }
.faqItem h3 { font-family: 'Instrument Sans', sans-serif; font-size: 14.5px; margin: 0 0 8px; }
.faqItem p { font-size: 13px; line-height: 1.6; margin: 0; }

@media (max-width: 900px) {
  .whoForGrid { grid-template-columns: 1fr; }
  .replaySpotlight { grid-template-columns: 1fr; padding: 28px 24px; margin-left: 20px; margin-right: 20px; }
  .mistakeCols { grid-template-columns: 1fr; }
  .landingWhoFor, .mistakesSection, .landingLearn, .landingFaq { padding-left: 20px; padding-right: 20px; }
}

.landingWrap {
  min-height: 100vh; font-family: 'Inter', sans-serif;
  background: linear-gradient(160deg, #071A40 0%, #0E3A8F 45%, #2E7CF6 100%);
  background-image:
    radial-gradient(900px 560px at 10% -8%, rgba(255,255,255,0.10), transparent 60%),
    radial-gradient(700px 460px at 92% 8%, color-mix(in srgb, var(--bull) 22%, transparent), transparent 60%),
    linear-gradient(160deg, #071A40 0%, #0E3A8F 45%, #2E7CF6 100%);
  background-repeat: no-repeat;
  color: #E7ECF6 !important;
}
.landingWrap .dim { color: #D2DBEB !important; }
.landingWrap .landingSub { color: #E3E9F4 !important; }
.landingWrap .landingHeroCard,
.landingWrap .landingFeatureCard {
  color: var(--text);
}
.landingWrap .landingHeroCard .dim,
.landingWrap .landingFeatureCard .dim {
  color: #D2DBEB !important;
}
.landingWrap .landingFooterLinks a { color: #E3E9F4 !important; }
.landingWrap .landingFooterLinks a:hover { color: #FFFFFF !important; }
.landingWrap .landingFooterNote { color: #D2DBEB !important; }
.landingNav { display: flex; align-items: center; justify-content: space-between; padding: 20px 40px; border-bottom: 1px solid rgba(255,255,255,0.14); flex-wrap: wrap; gap: 12px; position: relative; z-index: 1; }
.landingNavActions { display: flex; align-items: center; gap: 10px; }
.landingWrap .landingNav { z-index: 30; }
html { scroll-behavior: smooth; }
#features, #how-it-works, #replay, #faq { scroll-margin-top: 20px; }
.landingMenu { display: flex; align-items: center; gap: 26px; font-family: 'Instrument Sans', sans-serif; font-size: 15px; font-weight: 600; }
.landingMenu > a, .landingMenuDrop > summary { color: #E3E9F4; text-decoration: none; cursor: pointer; padding: 6px 0; border-bottom: 2px solid transparent; transition: color 0.15s ease, border-color 0.15s ease; }
.landingMenu > a:hover, .landingMenuDrop > summary:hover, .landingMenuDrop[open] > summary { color: #FFFFFF; border-bottom-color: var(--amber); }
.landingMenuDrop { position: relative; }
.landingMenuDrop > summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; }
.landingMenuDrop > summary::-webkit-details-marker { display: none; }
.landingMenuDrop > summary::after { content: ""; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-2px) rotate(45deg); transition: transform 0.15s ease; }
.landingMenuDrop[open] > summary::after { transform: translateY(1px) rotate(-135deg); }
.landingMenuPanel { position: absolute; top: calc(100% + 10px); left: -14px; min-width: 250px; background: #FFFFFF; border-radius: 12px; box-shadow: 0 16px 40px rgba(4, 14, 38, 0.35); padding: 8px; display: flex; flex-direction: column; z-index: 20; }
.landingMenuPanel a { color: #12151C; text-decoration: none; font-size: 14.5px; font-weight: 600; padding: 10px 12px; border-radius: 8px; }
.landingMenuPanel a:hover { background: #F1F4F9; }
@media (max-width: 980px) {
  .landingMenu { order: 3; width: 100%; gap: 6px 20px; flex-wrap: wrap; font-size: 14px; padding-top: 4px; }
}
@media (max-width: 560px) {
  .landingMenu { overflow-x: auto; flex-wrap: nowrap; white-space: nowrap; scrollbar-width: none; padding-bottom: 2px; }
  .landingMenu::-webkit-scrollbar { display: none; }
  .landingMenuDrop { position: static; }
  .landingMenuPanel { left: 16px; right: 16px; min-width: 0; position: absolute; }
}
.landingNavBtn { flex: none; padding: 9px 16px; }

.landingHero {
  display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 48px; align-items: center;
  padding: 64px 40px; max-width: 1180px; margin: 0 auto; position: relative;
}
.landingHeroCopy { display: flex; flex-direction: column; align-items: flex-start; position: relative; z-index: 1; }
.landingEyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.6px; color: var(--amber); text-transform: uppercase; background: rgba(255,176,32,0.1); border: 1px solid rgba(255,176,32,0.25); padding: 5px 12px; border-radius: 20px; margin-bottom: 20px; }
.landingH1 { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 44px; line-height: 1.12; letter-spacing: -0.6px; margin: 0 0 18px; }
.landingGradientText { background: linear-gradient(100deg, var(--bull), var(--accent) 55%, var(--amber)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.landingSub { color: var(--text-dim); font-size: 16px; line-height: 1.6; max-width: 52ch; margin: 0 0 26px; }
.landingHeroBtns { display: flex; gap: 10px; margin-bottom: 34px; }
.landingCta { flex: none; padding: 12px 22px; font-size: 14px; }
.heroCandles { width: 260px; height: 78px; }
@keyframes candleIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .heroCandles g { animation: none !important; } }

.landingHeroCard { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; position: relative; z-index: 1; box-shadow: 0 20px 60px rgba(0,0,0,0.28); }
.landingHeroCard .authSub { margin: 6px 0 0; text-align: left; }
.landingHeroCard .authSubmit { margin-top: 18px; }

.whatsNew { max-width: 1120px; margin: 0 auto; padding: 56px 24px 24px; text-align: center; }
.whatsNewEyebrow { display: inline-block; margin-bottom: 10px; }
.newGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; text-align: left; }
.newCard { position: relative; background: var(--surface); border: 1px solid color-mix(in srgb, var(--bull) 35%, var(--border)); border-radius: 14px; padding: 20px; opacity: 0; transform: translateY(14px); transition: opacity 0.5s ease, transform 0.5s ease, box-shadow 0.15s ease; }
.newCard.revealed { opacity: 1; transform: none; }
.newCard:hover { box-shadow: 0 14px 34px rgba(0,0,0,0.22); }
.newGrid .newCard:nth-child(2) { transition-delay: 0.08s; }
.newGrid .newCard:nth-child(3) { transition-delay: 0.16s; }
.newGrid .newCard:nth-child(4) { transition-delay: 0.24s; }
.newCardTop { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.newIcon { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--bull) 16%, transparent); color: var(--bull); }
.newTag { font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: var(--bull); background: color-mix(in srgb, var(--bull) 12%, transparent); padding: 4px 8px; border-radius: 999px; white-space: nowrap; }
.newCard h3 { margin: 0 0 8px; font-size: 16px; }
.newCard p { margin: 0; font-size: 13.5px; line-height: 1.55; }
.whatsNewCta { margin-top: 26px; display: flex; justify-content: center; }
.heroClosedNote { margin-top: 16px; padding: 10px 14px; border-radius: 10px; background: color-mix(in srgb, var(--bull) 12%, transparent); border: 1px solid color-mix(in srgb, var(--bull) 40%, transparent); font-size: 13.5px; line-height: 1.5; max-width: 560px; }
.heroClosedDot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--bull); margin-right: 4px; vertical-align: 1px; box-shadow: 0 0 0 0 var(--bull); animation: heroDot 1.8s ease-out infinite; }
@keyframes heroDot { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--bull) 70%, transparent); } 100% { box-shadow: 0 0 0 9px transparent; } }
@media (prefers-reduced-motion: reduce) { .newCard { opacity: 1; transform: none; transition: none; } .heroClosedDot { animation: none; } }
@media (max-width: 980px) { .newGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .newGrid { grid-template-columns: 1fr; } .whatsNew { padding: 40px 16px 16px; } }
.landingH2 { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.3px; text-align: center; margin: 0 0 36px; }
.landingFeatures { padding: 70px 40px; max-width: 1180px; margin: 0 auto; }
.landingFeatHead { text-align: center; max-width: 720px; margin: 0 auto 34px; }
.landingFeatHead .landingEyebrow { display: inline-block; margin-bottom: 14px; }
.landingFeatHead .landingH2 { margin-bottom: 10px; }
.landingFeatSub { font-size: 16px; line-height: 1.6; margin: 0; }
.heroInside { margin-top: 18px; text-align: left; }
.heroInsideHead { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px; }
.heroInsideList { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 9px 14px; }
.heroInsideList li { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 1.3; color: var(--text); }
.heroInsideIcon { flex-shrink: 0; width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center; color: var(--bull); background: color-mix(in srgb, var(--bull) 14%, transparent); }
.heroInsideMore { display: inline-block; margin: 14px 0 16px; font-size: 13px; font-weight: 600; color: var(--bull); text-decoration: none; }
.heroInsideMore:hover { text-decoration: underline; }
@media (max-width: 700px) { .heroInsideList { grid-template-columns: 1fr; } .landingFeatSub { font-size: 14.5px; } }
.landingFeatureGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.landingFeatureCard { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--accent); border-radius: 12px; padding: 22px; transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease, opacity 0.5s ease; }
.landingFeatureCard:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(0,0,0,0.22); }
.landingFeatureIcon { width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
.landingFeatureCard h3 { font-family: 'Instrument Sans', sans-serif; font-size: 15px; margin: 0 0 8px; }
.landingFeatureCard p { font-size: 13px; line-height: 1.55; margin: 0; }

.landingTrial {
  text-align: center; padding: 64px 40px 80px; max-width: 640px; margin: 0 auto; position: relative;
}
.landingTrial::before {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: radial-gradient(480px 280px at 50% 20%, color-mix(in srgb, var(--amber) 16%, transparent), transparent 70%);
}
.landingTrial .proBadgeIcon { display: block; margin: 0 auto 14px; }
.landingTrialSub { font-size: 14.5px; line-height: 1.6; margin: 0 auto 26px; max-width: 46ch; }

.landingFeatureCard, .landingTrial { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
.landingFeatureCard.revealed, .landingTrial.revealed { opacity: 1; transform: translateY(0); }

.whoForCard, .replaySpotlight, .mistakeRow, .faqItem { opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
.whoForCard.revealed, .replaySpotlight.revealed, .mistakeRow.revealed, .faqItem.revealed { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .tickerTape { animation: none; }
  .heroLiveDot { animation: none; }
  .landingFeatureCard, .landingTrial { opacity: 1 !important; transform: none !important; transition: none; }
  .whoForCard, .replaySpotlight, .mistakeRow, .faqItem { opacity: 1 !important; transform: none !important; transition: none; }
  .heroReveal { opacity: 1 !important; animation: none !important; }
  .landingCta.btnBull { animation: none !important; }
  .landingHero::before { animation: none !important; }
}

.landingFooter { border-top: 1px solid rgba(255,255,255,0.14); padding: 28px 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; }
.landingFooterLinks { display: flex; gap: 20px; flex-wrap: wrap; }
.heroTrust { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: -12px 0 24px; font-size: 13px; color: var(--text-dim); }
.heroTrust span::before { content: "✓"; color: var(--bull); font-weight: 700; margin-right: 6px; }
.realityBand { max-width: 1000px; margin: 10px auto 40px; padding: 26px 30px; display: flex; align-items: center; gap: 30px; border: 1px solid rgba(255,255,255,0.1); border-left: 4px solid var(--amber); border-radius: 14px; background: rgba(255,255,255,0.03); position: relative; z-index: 1; }
.realityNum { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 54px; line-height: 1; color: var(--amber); white-space: nowrap; letter-spacing: -1px; }
.realityCopy h2 { font-family: 'Instrument Sans', sans-serif; font-size: 20px; margin: 0 0 8px; }
.realityCopy p { font-size: 14px; line-height: 1.6; margin: 0 0 8px; }
.realitySrc { font-size: 13px; font-style: italic; color: var(--amber); }
.howSteps { max-width: 1080px; margin: 0 auto; padding: 20px 40px 70px; text-align: center; position: relative; z-index: 1; }
.howStepsRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; text-align: left; }
.howStepNum { display: inline-flex; width: 30px; height: 30px; border-radius: 50%; align-items: center; justify-content: center; background: var(--bull); color: #06231A; font-weight: 700; font-family: 'Instrument Sans', sans-serif; margin-bottom: 10px; }
.howStepsLink { display: inline-block; margin-top: 22px; color: var(--amber); font-size: 14px; font-weight: 600; text-decoration: none; }
.howStepsLink:hover { text-decoration: underline; }
@media (max-width: 760px) {
  .realityBand { flex-direction: column; align-items: flex-start; gap: 10px; margin: 10px 16px 30px; padding: 20px; }
  .realityNum { font-size: 40px; }
  .howSteps { padding: 10px 16px 50px; }
  .howStepsRow { grid-template-columns: 1fr; }
}
.landingFooterLinks a { color: var(--text-dim); font-size: 12.5px; text-decoration: none; }
.landingFooterLinks a:hover { color: var(--text); }
.landingFooterNote { font-size: 11.5px; width: 100%; text-align: center; order: 3; }
/* ---- landing readability: light secondary text, larger sizes, darker card backing on the bright blue ---- */
.landingWrap { --text-dim: #D2DBEB; overflow-x: clip; }
html, body { overflow-x: clip; }
.landingWrap .dim { color: #D2DBEB; }
.landingWrap .landingSub { color: #E3E9F4; font-size: 17px; }
.landingWrap .heroTrust { color: #E3E9F4; font-size: 14px; }
.landingWrap .whoForCard, .landingWrap .mistakeCol, .landingWrap .faqItem, .landingWrap .realityBand, .landingWrap .moversCard { background: rgba(4, 14, 38, 0.55); border-color: rgba(255,255,255,0.14); }
.landingWrap .whoForCard h3, .landingWrap .landingFeatureCard h3 { font-size: 16px; color: #FFFFFF; }
.landingWrap .whoForCard p, .landingWrap .landingFeatureCard p, .landingWrap .mistakeCol p { font-size: 14.5px; line-height: 1.6; color: #D2DBEB; }
.landingWrap .faqItem h3 { font-size: 16px; color: #FFFFFF; }
.landingWrap .faqItem p { font-size: 14.5px; color: #D2DBEB; }
.landingWrap .mistakesIntro { font-size: 16px; color: #E3E9F4; }
.landingWrap .mistakeColLabel { font-size: 12px; }
.landingWrap .landingStatLabel { font-size: 13px; color: #D2DBEB; }
.landingWrap .moverRow { font-size: 14px; }
.landingWrap .realityCopy p { font-size: 15.5px; color: #E3E9F4; }
.landingWrap .realityCopy h2 { font-size: 22px; color: #FFFFFF; }
.landingWrap .landingTrialSub { font-size: 15px; color: #E3E9F4; }
.landingWrap .landingFooterLinks a { font-size: 14px; color: #E3E9F4; }
.landingWrap .landingFooterNote { font-size: 13px; color: #D2DBEB; line-height: 1.6; }
.landingWrap .landingEyebrow { font-size: 12px; }
/* ---- light content cards with black text on the blue landing background ---- */
.landingWrap .whoForCard, .landingWrap .landingFeatureCard, .landingWrap .mistakeRow, .landingWrap .faqItem, .landingWrap .realityBand {
  background: #FFFFFF !important; color: #12151C !important;
  border-left: 1px solid #E3E7EF !important; border-right: 1px solid #E3E7EF !important; border-bottom: 1px solid #E3E7EF !important;
  box-shadow: 0 10px 28px rgba(4, 14, 38, 0.22);
}
.landingWrap .whoForCard, .landingWrap .faqItem, .landingWrap .mistakeRow { border-top: 1px solid #E3E7EF !important; }
.landingWrap .realityBand { border-left: 5px solid #E89A00 !important; border-top: 1px solid #E3E7EF !important; }
.landingWrap .faqItem { border-radius: 12px; padding: 18px 20px !important; }
.landingWrap .whoForCard h3, .landingWrap .landingFeatureCard h3, .landingWrap .mistakeRow h3, .landingWrap .faqItem h3, .landingWrap .realityBand h2 { color: #0B1220 !important; }
.landingWrap .whoForCard p, .landingWrap .whoForCard .dim, .landingWrap .landingFeatureCard p, .landingWrap .landingFeatureCard .dim,
.landingWrap .mistakeRow p, .landingWrap .mistakeRow .dim, .landingWrap .faqItem p, .landingWrap .faqItem .dim, .landingWrap .realityBand p, .landingWrap .realityBand .dim {
  color: #1F2533 !important;
}
.landingWrap .mistakeCol { background: #F4F6FA !important; border: 1px solid #E3E7EF !important; }
.landingWrap .mistakeRow .bull, .landingWrap .whoForCard .whoForIcon { color: #08865B !important; }
.landingWrap .mistakeRow .bear { color: #C8213E !important; }
.landingWrap .whoForIcon { background: #E6F6EF !important; }
.landingWrap .realityNum { color: #C77700 !important; }
.landingWrap .realitySrc { color: #9A5B00 !important; }
.landingWrap .whoForCard:hover, .landingWrap .landingFeatureCard:hover { box-shadow: 0 14px 34px rgba(4, 14, 38, 0.3); }

.authBackBtn { position: absolute; top: 18px; left: 18px; background: none; border: none; color: var(--text-dim); font-size: 12.5px; cursor: pointer; padding: 6px 4px; }
.authBackBtn:hover { color: var(--text); }

@media (max-width: 900px) {
  .landingHero { grid-template-columns: 1fr; padding: 40px 20px; gap: 32px; }
  .landingH1 { font-size: 32px; }
  .landingFeatureGrid { grid-template-columns: 1fr; }
  .landingFeatures, .landingTrial { padding-left: 20px; padding-right: 20px; }
  .landingNav { padding: 16px 20px; }
}

@media (max-width: 900px) {
  .body { flex-direction: column; }
  .watchlist { width: 100%; max-height: 260px; }
  .tradeGrid { grid-template-columns: 1fr; }
}

/* ================= usability additions ================= */
/* keyboard focus is always visible */
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, [role="tab"]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* auth */
.authGoogleNote { font-size: 11px; color: var(--text-dim); text-align: center; margin: -8px 0 14px; }
.authForgotLink { display: block; margin: -4px 0 12px auto; background: none; border: none; color: var(--accent); font-size: 12px; cursor: pointer; padding: 2px 0; }
.authForgot { background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 12px; line-height: 1.55; color: var(--text); }
.authForgotTitle { display: flex; align-items: center; gap: 6px; font-weight: 700; margin-bottom: 6px; }
.authForgot ol { margin: 0 0 10px; padding-left: 18px; color: var(--text-dim); }
.authForgot ol b { color: var(--text); }
.authForgotBtn { width: 100%; box-sizing: border-box; text-decoration: none; }

/* payment status */
.paymentBar { display: flex; align-items: center; gap: 12px; margin: 12px 24px 0; padding: 12px 16px; border-radius: 12px; background: color-mix(in srgb, var(--amber) 12%, var(--surface)); border: 1px solid color-mix(in srgb, var(--amber) 45%, var(--border)); font-size: 13px; line-height: 1.5; flex-wrap: wrap; }
.paymentBarIcon { color: var(--amber); flex-shrink: 0; }
.paymentBarText { flex: 1; min-width: 220px; }
.paymentBarBtns { display: flex; gap: 8px; align-items: center; }
.paymentBarBtns .btn { flex: none; padding: 8px 12px; font-size: 12px; text-decoration: none; }

/* language switch */
.firstTradeTitleRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.langSwitch { display: inline-flex; gap: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px; }
.langBtn { background: none; border: none; color: var(--text-dim); font-size: 12px; padding: 5px 11px; border-radius: 999px; cursor: pointer; }
.langBtnActive { background: var(--accent); color: #fff; font-weight: 600; }
.landingLangSwitch { display: flex; width: fit-content; margin: 0 auto 14px; }

/* watchlist empty state */
.wlEmptyTitle { font-weight: 600; color: var(--text); margin-bottom: 6px; }
.wlEmptyTips { font-size: 12px; margin-bottom: 12px; }
.wlEmptyBtns { display: flex; gap: 8px; }
.wlEmptyBtns .btn { padding: 8px; font-size: 12px; }

/* order ticket */
.qtyChips { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 12px; }
.qtyChip { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 6px 11px; font-size: 12px; cursor: pointer; font-family: inherit; }
.qtyChip:hover:not(:disabled) { border-color: var(--accent); }
.qtyChip:disabled { opacity: 0.4; cursor: not-allowed; }
.qtyChipActive { background: color-mix(in srgb, var(--accent) 22%, var(--surface-2)); border-color: var(--accent); font-weight: 600; }
.lotExplain { font-size: 12px; margin: -4px 0 10px; }
.orderSizeHint { font-size: 12px; margin: -6px 0 12px; }
.slPlan { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; background: var(--surface-2); }
.slPlanToggle { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.slPlanToggle input { width: 16px; height: 16px; accent-color: var(--bull); }
.slPlanRow { margin: 10px 0 8px; }
.riskBox { font-size: 12px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--bull) 10%, transparent); border: 1px solid color-mix(in srgb, var(--bull) 35%, transparent); }
.riskBoxHigh { background: color-mix(in srgb, var(--bear) 10%, transparent); border-color: color-mix(in srgb, var(--bear) 40%, transparent); }
.closeBtnExit { color: var(--bear); }

/* performance */
.perfGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.perfStat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.perfVal { font-size: 18px; font-weight: 700; color: var(--text); }
.perfVal.bull { color: var(--bull); } .perfVal.bear { color: var(--bear); }
.perfCurveCard { margin-top: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.perfCurveLabel { font-size: 12px; margin-bottom: 6px; }
.perfCurve { width: 100%; height: 140px; display: block; }
.perfTips { margin-top: 14px; background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); border-radius: 10px; padding: 12px 16px; }
.perfTips h4 { margin: 0 0 6px; font-size: 13px; }
.perfTips ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
.chargesCard { margin-top: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.chargesHead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.chargesHead h4 { margin: 0 0 4px; font-size: 14px; }
.chargesHead p { margin: 0; font-size: 12.5px; line-height: 1.5; }
.chargesHead .indSwitch { flex-shrink: 0; margin-top: 2px; }
.chargesTotal { margin-top: 10px; font-size: 12px; }

/* learn tab */
.learnTabHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.learnTabHead h3 { display: flex; align-items: center; gap: 8px; margin: 0; }
.learnGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; }
.learnMistakes { display: grid; gap: 10px; margin-top: 10px; }
.learnCard { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.learnCard h4 { margin: 0 0 6px; font-size: 14px; }
.learnCard p { margin: 4px 0; font-size: 13px; line-height: 1.55; }
.learnLbl { font-weight: 600; }
.learnLinksRow { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.learnLinksRow .btn { flex: none; text-decoration: none; }

/* landing footer: links as visible pills */
.landingWrap .landingFooterLinks { gap: 10px; align-items: center; }
.landingWrap .landingFooterLinks a { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); color: #FFFFFF !important; font-weight: 600; font-size: 14px; text-decoration: none; transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease; }
.landingWrap .landingFooterLinks a:hover { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.55); color: #FFFFFF !important; }
.landingWrap .landingFooterLinks a:active { transform: scale(0.97); }
@media (max-width: 560px) { .landingWrap .landingFooterLinks { justify-content: center; } .landingWrap .landingFooterLinks a { padding: 8px 13px; font-size: 13px; } }

.tab { padding: 10px 12px; }
@media (max-width: 1280px) { .tab { padding: 9px 9px; font-size: 12.5px; } }

/* mobile-only pieces are hidden on desktop by default */
.bottomNav, .mTradeBar, .mSectionHead { display: none; }

@media (max-width: 760px), (pointer: coarse) and (max-height: 500px) {
  .mHidden { display: none !important; }
  .topbar { padding: 10px 14px; gap: 8px; }
  .brandSub { display: none; }
  .topbarActions { display: none; }
  .stats { gap: 4px; flex-wrap: nowrap; overflow-x: auto; width: 100%; scrollbar-width: none; }
  .stats::-webkit-scrollbar { display: none; }
  .stat { flex-shrink: 0; }
  .replayBar { overflow-x: auto; flex-wrap: nowrap; }
  .firstTradeCard, .paymentBar { margin: 10px 14px 0; }
  .body { flex-direction: column; }
  .watchlist { width: 100%; max-height: none; border-right: none; min-height: calc(100vh - 200px); }
  .wlRow { padding-top: 12px; padding-bottom: 12px; }
  .main { padding: 14px 14px 150px; }
  .tabs { display: none; }
  .mSectionHead { display: block; margin-bottom: 12px; }
  .mSectionHead h2 { margin: 0; font-size: 18px; }
  .tradeGrid { grid-template-columns: 1fr; }
  .posWrap, .ordersWrap, .histWrap, .alertsWrap { overflow-x: auto; }
  .closeBtn { padding: 8px 12px; font-size: 12px; }
  .qtyChip { padding: 8px 13px; font-size: 13px; }
  .toastMobile { bottom: 140px; }
  .paymentBarBtns { width: 100%; }
  .paymentBarBtns .btn { flex: 1; }

  .bottomNav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; background: var(--surface); border-top: 1px solid var(--border); padding: 4px 4px calc(4px + env(safe-area-inset-bottom)); }
  .bottomNavItem { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; background: none; border: none; color: var(--text-dim); font-size: 10.5px; padding: 6px 2px; cursor: pointer; border-radius: 8px; min-height: 52px; justify-content: center; }
  .bottomNavItemActive { color: var(--accent); font-weight: 600; background: color-mix(in srgb, var(--accent) 10%, transparent); }

  .mTradeBar { display: flex; align-items: center; gap: 8px; position: fixed; left: 0; right: 0; bottom: calc(62px + env(safe-area-inset-bottom)); z-index: 39; background: var(--surface); border-top: 1px solid var(--border); padding: 8px 12px; box-shadow: 0 -6px 18px rgba(0,0,0,0.18); }
  .mTradeBarPrice { flex: 1.4; display: flex; flex-direction: column; font-size: 12px; line-height: 1.3; min-width: 0; }
  .mTradeBarPrice span:first-child { font-weight: 700; font-size: 13px; }
  .mTradeBar .btn { padding: 12px 10px; font-size: 14px; }

  .sheetOverlay { align-items: flex-end; }
  .sheet { width: 100%; background: var(--surface); border-top-left-radius: 18px; border-top-right-radius: 18px; border: 1px solid var(--border); padding: 8px 16px calc(80px + env(safe-area-inset-bottom)); max-height: 85vh; overflow-y: auto; }
  .sheetGrab { width: 40px; height: 4px; border-radius: 4px; background: var(--border); margin: 4px auto 12px; }
  .sheetUser { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 12px; flex-wrap: wrap; }
  .sheetGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .sheetItem { display: flex; flex-direction: column; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 12px 4px; color: var(--text); font-size: 11px; cursor: pointer; text-align: center; }
  .sheetItemActive { border-color: var(--accent); color: var(--accent); }
  .sheetActions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .sheetActions .btn { padding: 12px 8px; font-size: 12.5px; text-decoration: none; }
  .sheetLang { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; font-size: 12px; flex-wrap: wrap; }
}

.chartLoading { border-radius: 10px; background: linear-gradient(90deg, var(--surface-2), color-mix(in srgb, var(--surface-2) 70%, var(--surface)), var(--surface-2)); background-size: 200% 100%; animation: chartShimmer 1.2s linear infinite; }
@keyframes chartShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .chartLoading { animation: none; } }

/* ================= growth & retention ================= */
.srOnly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.linkBtn { background: none; border: none; color: var(--accent); cursor: pointer; padding: 0; font-size: inherit; text-decoration: underline; text-underline-offset: 2px; }
a.resetBtn { text-decoration: none; }
.installBtn { border-color: color-mix(in srgb, var(--bull) 55%, var(--border)) !important; color: var(--bull) !important; }
.histCharges { font-size: 10.5px; margin-top: 2px; }
.journalBtn { white-space: nowrap; }
.journalBtnOn { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }

.tagChips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.tagChip { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 6px 11px; font-size: 12px; cursor: pointer; }
.tagChipsCompact .tagChip { padding: 4px 9px; font-size: 11.5px; }
.tagChip:hover { border-color: var(--accent); }
.tagChipActive { background: color-mix(in srgb, var(--accent) 24%, var(--surface-2)); border-color: var(--accent); font-weight: 600; }
.tagChipWarn.tagChipActive { background: color-mix(in srgb, var(--bear) 18%, var(--surface-2)); border-color: var(--bear); }
.tagPrompt { margin-top: 12px; padding: 10px 12px; border: 1px dashed var(--border); border-radius: 10px; }
.tagPromptQ { font-size: 12.5px; font-weight: 600; }
.tagPrompt .tagChips { margin-bottom: 0; }
.journalModal { width: 420px; max-width: calc(100vw - 28px); }
.journalLabel { font-size: 12px; margin: -4px 0 10px; word-break: break-word; }
.journalQ { font-size: 12.5px; display: block; margin-top: 6px; }
.journalNote { width: 100%; box-sizing: border-box; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 10px; font: inherit; font-size: 13px; margin: 6px 0 4px; resize: vertical; }

.perfExtras { display: grid; gap: 14px; margin-top: 14px; }
.shareRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
.shareRow .btn { flex: none; padding: 9px 14px; }
.journalCard, .achCard, .inviteCard { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
.journalCard h4, .achCard h4, .inviteCard h4 { margin: 0 0 8px; font-size: 14px; }
.journalCard p { margin: 0; font-size: 13px; line-height: 1.5; }
.tagRecent { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
.tagRecentHead { font-size: 13px; font-weight: 600; }
.tagRecentRow { display: flex; flex-direction: column; gap: 6px; }
.tagRecentTrade { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.journalTable { margin-top: 4px; }
.journalInsight { margin-top: 10px !important; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--bear) 10%, transparent); border: 1px solid color-mix(in srgb, var(--bear) 35%, transparent); }
.achGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.achItem { display: flex; flex-direction: column; gap: 3px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); opacity: 0.45; filter: grayscale(1); }
.achOn { opacity: 1; filter: none; border-color: color-mix(in srgb, var(--amber) 55%, var(--border)); background: color-mix(in srgb, var(--amber) 8%, var(--surface-2)); }
.achIcon { font-size: 22px; line-height: 1; }
.achTitle { font-weight: 700; font-size: 12.5px; }
.achDesc { font-size: 11px; line-height: 1.35; }

.inviteCard { margin-top: 14px; }
.inviteCard p { margin: 0 0 10px; font-size: 13px; line-height: 1.5; }
.inviteLinkRow { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.inviteLinkRow .qtyInput { flex: 1; min-width: 0; text-align: left; }
.inviteLinkRow .btn { flex: none; padding: 9px 14px; }
.inviteBtns { display: flex; gap: 8px; margin-top: 8px; }
.inviteBtns .btn { flex: none; text-decoration: none; padding: 10px 16px; }
.inviteStats { font-size: 12px; margin-top: 10px; }

.lbWrap { display: grid; gap: 16px; }
.lbHero { display: flex; gap: 24px; justify-content: space-between; align-items: center; flex-wrap: wrap; padding: 24px 26px; border-radius: 16px; color: #EEF1FA;
  background: radial-gradient(120% 140% at 100% 0%, rgba(123, 97, 255, 0.45) 0%, rgba(123, 97, 255, 0) 55%), linear-gradient(135deg, #141A33 0%, #1E2550 100%); box-shadow: 0 10px 30px rgba(20, 26, 51, 0.18); }
.lbHeroCopy { max-width: 460px; }
.lbKicker { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #FFC85C; }
.lbHero h3 { margin: 6px 0 8px; font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 24px; font-weight: 700; color: #fff; }
.lbHero p { margin: 0; font-size: 13.5px; line-height: 1.55; color: #B9C1D9; }
.lbStats { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; }
.lbStat { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 86px; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
.lbStatMain { min-width: 120px; }
.lbStatLabel { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9AA4C2; }
.lbStatValue { font-size: 20px; font-weight: 700; color: #fff; }
.lbStatMain .lbStatValue { font-size: 26px; }
.lbHero .lbUp { color: #3DF2B0; } .lbHero .lbDown { color: #FF7A90; }
.lbShare { align-self: center; flex: none; padding: 10px 16px; border-radius: 10px; background: #fff; color: #141A33; border: none; font-weight: 600; }
.lbShare:hover { background: #E9ECF7; }
.lbUp { color: var(--bull); } .lbDown { color: var(--bear); }
.lbEmpty { padding: 28px 20px; text-align: center; font-size: 13.5px; line-height: 1.6; color: var(--text-dim); background: var(--surface); border: 1px dashed var(--border); border-radius: 14px; }
.lbEmpty b { color: var(--text); }
.lbJoin { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; font-size: 13px; }
.lbJoinTitle { font-family: 'Instrument Sans', 'Inter', system-ui, sans-serif; font-size: 16px; font-weight: 700; }
.lbJoinSub { font-size: 12.5px; margin: 2px 0 12px; }
.lbJoinRow { display: flex; gap: 10px; flex-wrap: wrap; }
.lbJoinInput { flex: 1 1 220px; min-width: 0; padding: 11px 14px; font-size: 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); }
.lbJoinInput:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent); }
.lbJoinBtn { flex: none; padding: 11px 20px; border-radius: 10px; }
.lbAgree { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 12.5px; color: var(--text-dim); cursor: pointer; }
.lbAgree input { margin-top: 2px; accent-color: var(--accent); }
.lbAvatar { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); }
.lbAvatarMe { background: var(--accent); border-color: var(--accent); color: #fff; }
.lbYou { margin-left: 8px; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; background: var(--accent); vertical-align: middle; }
.lbPodium { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: end; }
.lbPod { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 22px 12px 16px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); text-align: center; }
.lbPod .lbAvatar { width: 48px; height: 48px; font-size: 16px; }
.lbPod1 { padding-top: 30px; padding-bottom: 22px; border-color: #E0B44C; background: linear-gradient(180deg, color-mix(in srgb, #E0B44C 14%, var(--surface)) 0%, var(--surface) 70%); }
.lbPod1 .lbAvatar { width: 58px; height: 58px; font-size: 19px; }
.lbPodMe { box-shadow: 0 0 0 2px var(--accent); }
.lbMedal { position: absolute; top: -12px; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; font-size: 12px; font-weight: 800; color: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18); }
.lbMedal1 { background: linear-gradient(135deg, #F3CF6A, #C9962F); }
.lbMedal2 { background: linear-gradient(135deg, #CBD3DE, #8E9AAB); }
.lbMedal3 { background: linear-gradient(135deg, #E2A877, #A86A3D); }
.lbPodName { font-weight: 600; font-size: 14px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbPodRet { font-size: 20px; font-weight: 700; }
.lbPod1 .lbPodRet { font-size: 24px; }
.lbPodTrades { font-size: 12px; }
.lbList { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.lbRow { display: grid; grid-template-columns: 56px minmax(0, 1.6fr) minmax(0, 1.4fr) 70px; align-items: center; gap: 12px; padding: 10px 18px; border-top: 1px solid var(--border); font-size: 13.5px; }
.lbRowHead { border-top: none; padding-top: 12px; padding-bottom: 10px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); background: var(--surface-2); }
.lbRowMe { background: color-mix(in srgb, var(--accent) 9%, var(--surface)); box-shadow: inset 3px 0 0 var(--accent); }
.lbRank { color: var(--text-dim); font-weight: 600; }
.lbTrader { display: flex; align-items: center; gap: 10px; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lbRet { display: flex; align-items: center; gap: 10px; font-weight: 600; }
.lbRet .mono { min-width: 64px; }
.lbBar { flex: 1; height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.lbBarUp, .lbBarDown { display: block; height: 100%; border-radius: 999px; }
.lbBarUp { background: var(--bull); } .lbBarDown { background: var(--bear); }
.lbNum { text-align: right; }
.lbFoot { font-size: 12px; }
@media (max-width: 760px) {
  .lbHero { padding: 18px; }
  .lbStats { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .lbStat { min-width: 0; padding: 10px 12px; }
  .lbStatMain .lbStatValue { font-size: 22px; }
  .lbShare { grid-column: 1 / -1; width: 100%; }
  .lbPodium { gap: 8px; }
  .lbPod { padding: 18px 6px 12px; }
  .lbPod .lbAvatar { width: 38px; height: 38px; font-size: 13px; }
  .lbPod1 .lbAvatar { width: 44px; height: 44px; }
  .lbPodRet { font-size: 16px; } .lbPod1 .lbPodRet { font-size: 18px; }
  .lbPodName { font-size: 12.5px; }
  .lbRow { grid-template-columns: 34px minmax(0, 1fr) 92px; padding: 10px 12px; }
  .lbRow > :last-child { display: none; }
  .lbBar { display: none; }
}

.notifRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; }
.notifRow .btn { flex: none; padding: 8px 12px; }
.notifRow span { display: inline-flex; align-items: center; gap: 6px; }
.iosHint { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 12px; line-height: 1.5; flex-wrap: wrap; }

.tourLayer { position: fixed; inset: 0; z-index: 80; }
.tourDim { position: absolute; inset: 0; background: rgba(4,6,12,0.7); }
.tourSpot { position: fixed; border-radius: 12px; box-shadow: 0 0 0 9999px rgba(4,6,12,0.7), 0 0 0 3px var(--accent); transition: all 0.25s ease; pointer-events: none; }
.tourCard { position: fixed; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; box-shadow: 0 18px 50px rgba(0,0,0,0.45); transition: top 0.25s ease, left 0.25s ease; }
.tourCard h4 { margin: 4px 0 6px; font-size: 16px; }
.tourCard p { margin: 0 0 14px; font-size: 13.5px; line-height: 1.55; }
.tourStep { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.tourBtns { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tourNav { display: flex; gap: 8px; }
.tourNav .btn { flex: none; padding: 9px 14px; }
@media (prefers-reduced-motion: reduce) { .tourSpot, .tourCard { transition: none; } }

.installBar { display: flex; align-items: center; gap: 10px; margin: 10px 14px 0; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 14%, var(--surface)); border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)); }
.installBarIcon { color: var(--accent); flex-shrink: 0; }
.installBarText { flex: 1; display: flex; flex-direction: column; font-size: 13px; line-height: 1.35; min-width: 0; }
.installBarText .dim { font-size: 11.5px; }
.installBar .btn { flex: none; padding: 9px 14px; }
.installModal { width: 400px; max-width: calc(100vw - 28px); }
.installWhy { font-size: 13px; line-height: 1.5; margin: 0 0 10px; }
.installSteps { margin: 0 0 6px; padding-left: 20px; font-size: 14px; line-height: 1.7; }
.heroInstall { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: #fff; border-radius: 999px; padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }

.topbarActions { flex-wrap: wrap; row-gap: 8px; }
.topbarActions > * { white-space: nowrap; flex-shrink: 0; }
.userBadge .proBadge { white-space: nowrap; }

/* highlighted in-app links: Install app (green) and Feedback (purple) */
.hlBtn { font-weight: 700 !important; }
.installBtn.hlBtn { background: var(--bull) !important; border-color: var(--bull) !important; color: #06281A !important; box-shadow: 0 2px 10px color-mix(in srgb, var(--bull) 35%, transparent); }
.installBtn.hlBtn:hover { filter: brightness(1.07); }
.feedbackBtn.hlBtn { background: color-mix(in srgb, var(--accent) 18%, var(--surface-2)) !important; border-color: var(--accent) !important; color: var(--text) !important; }
.feedbackBtn.hlBtn svg { color: var(--accent); }
.feedbackBtn.hlBtn:hover { background: color-mix(in srgb, var(--accent) 28%, var(--surface-2)) !important; }
.feedbackSheetBtn { background: color-mix(in srgb, var(--accent) 18%, var(--surface-2)); border: 1px solid var(--accent); color: var(--text); font-weight: 700; text-decoration: none; }
.feedbackSheetBtn svg { color: var(--accent); }

/* landing additions */
.liveCount { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13.5px; color: #E3E9F4; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); padding: 6px 12px; border-radius: 999px; }
.liveCountDot { width: 8px; height: 8px; border-radius: 50%; background: var(--bull); box-shadow: 0 0 0 4px color-mix(in srgb, var(--bull) 25%, transparent); }
.landingMenuAll { font-weight: 700; }
.demoSection { max-width: 980px; margin: 0 auto; padding: 30px 40px 70px; display: grid; grid-template-columns: 1fr 300px; gap: 40px; align-items: center; position: relative; z-index: 1; }
.demoCopy p { font-size: 16px; line-height: 1.6; margin: 0 0 18px; }
.demoCopy .landingCta { flex: none; }
.demoPhone { justify-self: center; width: 280px; padding: 10px; border-radius: 34px; background: #05070D; box-shadow: 0 20px 60px rgba(0,0,0,0.45), inset 0 0 0 2px rgba(255,255,255,0.12); }
.demoVideo { display: block; width: 100%; aspect-ratio: 9 / 16; border-radius: 26px; background: #000; object-fit: cover; }
.pricingSection { max-width: 900px; margin: 0 auto; padding: 20px 40px 70px; text-align: center; position: relative; z-index: 1; }
.pricingGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; text-align: left; }
.priceCard { position: relative; background: rgba(8,16,40,0.55); border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 22px; display: flex; flex-direction: column; }
.priceCardPro { border-color: var(--amber); box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
.priceBadge { position: absolute; top: -12px; right: 18px; background: var(--amber); color: #2A1A00; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; }
.priceName { font-weight: 700; font-size: 15px; color: #E3E9F4; }
.priceAmt { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 38px; color: #fff; margin: 4px 0 12px; }
.priceAmt span { font-size: 14px; font-weight: 500; color: #D2DBEB; margin-left: 4px; }
.priceCard ul { margin: 0 0 18px; padding-left: 18px; color: #E3E9F4; font-size: 14px; line-height: 1.75; flex: 1; }
.priceCard .landingCta { width: 100%; }
.priceFine { font-size: 12px; margin-top: 10px; line-height: 1.5; }
.landingWrap .landingFooterLinks a.footerInstall { background: #fff; border-color: #fff; color: #0C2354 !important; }
@media (max-width: 760px) {
  .demoSection { grid-template-columns: 1fr; padding: 10px 20px 50px; gap: 24px; text-align: center; }
  .demoCopy h2 { text-align: center !important; }
  .pricingSection { padding: 10px 16px 50px; }
  .pricingGrid { grid-template-columns: 1fr; }
  .shareRow .btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .bottomNavItem, .qtyChip { transition: none; } }

/* ================= phone friendliness ================= */
@media (max-width: 760px), (pointer: coarse) and (max-height: 500px) {
  /* no zoom-in when tapping a text box on iPhone (needs 16px+) */
  input, select, textarea { font-size: 16px !important; }
  button, a, input, select, textarea { touch-action: manipulation; }
  html { -webkit-text-size-adjust: 100%; }

  /* header: three key numbers in a tidy row instead of a cut-off strip */
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px 6px; overflow: visible; }
  .statSecondary { display: none !important; }
  .stat { padding: 2px 0; min-width: 0; }
  .statLabel { font-size: 10px; }
  .statValue { font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* trade screen fits the phone width (the chart can't push the order ticket off-screen) */
  .tradeGrid { grid-template-columns: minmax(0, 1fr) !important; }
  .tradeGrid > *, .chartCard, .orderCard { min-width: 0; max-width: 100%; }
  .orderCard { padding: 14px; }
  .orderRow { gap: 10px; }
  .orderRow .qtyInput { width: 130px; min-width: 0; }
  .mainHead h1 { font-size: 23px; }
  .bigPrice { font-size: 20px; }
  .firstTradeCard { padding: 12px 40px 10px 14px; }
  .firstTradeText { font-size: 13px; margin: 6px 0; }
  .chartHint { display: none; }

  /* tables become easy-to-read cards */
  .posTable:not(.lbTable):not(.journalTable) { border: none; background: transparent; }
  .posTable:not(.lbTable):not(.journalTable) thead { display: none; }
  .posTable:not(.lbTable):not(.journalTable) tbody tr { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; margin-bottom: 10px; }
  .posTable:not(.lbTable):not(.journalTable) td { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 5px 0 !important; border: none !important; text-align: right; font-size: 13.5px; min-height: 26px; }
  .posTable:not(.lbTable):not(.journalTable) td::before { content: attr(data-label); color: var(--text-dim); font-family: 'Inter', sans-serif; font-size: 12px; text-align: left; flex-shrink: 0; }
  .posTable:not(.lbTable):not(.journalTable) td:first-child { font-size: 15px; font-weight: 700; padding-bottom: 8px !important; border-bottom: 1px solid var(--border) !important; margin-bottom: 4px; justify-content: flex-start; text-align: left; flex-wrap: wrap; }
  .posTable:not(.lbTable):not(.journalTable) td:first-child::before { display: none; }
  .posTable:not(.lbTable):not(.journalTable) td[data-label=""]::before { display: none; }
  .posTable:not(.lbTable):not(.journalTable) td.orderRowActions, .posTable:not(.lbTable):not(.journalTable) td[data-label=""] { justify-content: flex-start; flex-wrap: wrap; gap: 8px; padding-top: 10px !important; }
  .posTable:not(.lbTable):not(.journalTable) td .closeBtn { padding: 9px 14px; font-size: 13px; }
  .posWrap, .ordersWrap, .histWrap, .alertsWrap { overflow-x: visible; }
  .allocLegendItem { font-size: 12.5px; }

  /* options chain: calls and puts both visible, bigger tap targets */
  .chainTable { width: 100%; font-size: 13px; }
  .chainTable td, .chainTable th { padding: 9px 4px !important; }
  .premCell { font-weight: 600; }
  .expiryTabs { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
  .expiryTab { flex-shrink: 0; }
  .chainTapHint { color: var(--text); }

  /* popups slide up from the bottom, easy to reach with one thumb */
  .modalOverlay:not(.sheetOverlay) { align-items: flex-end; }
  .modalOverlay:not(.sheetOverlay) > .modal { width: 100%; max-width: none; box-sizing: border-box; border-radius: 18px 18px 0 0; max-height: 90vh; overflow-y: auto; padding: 20px 18px calc(20px + env(safe-area-inset-bottom)); animation: sheetUp 0.22s ease-out; }
  .modalBtns .btn { padding: 13px 10px; font-size: 14px; }
  .ticketModal .orderBtns .btn { padding: 13px 8px; }

  /* section tabs inside screens scroll sideways instead of wrapping */
  .tfTabs, .indToggles, .exchangeTabs, .orderTypeTabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .tfTabs::-webkit-scrollbar, .indToggles::-webkit-scrollbar, .expiryTabs::-webkit-scrollbar { display: none; }
  .tfTab, .indToggle { flex-shrink: 0; min-height: 34px; }
  .exTab { min-height: 36px; }
  .orderTypeTab { min-height: 40px; }
}
@keyframes sheetUp { from { transform: translateY(24px); opacity: 0.6; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .modal { animation: none !important; } }

/* strategies */
.stratWrap { max-width: 760px; }
.stratHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.stratHead h3 { margin: 0; }
.stratWrap h4 { margin: 18px 0 8px; font-size: 13px; }
.stratChips { display: flex; flex-wrap: wrap; gap: 6px; }
.stratChip { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); border-radius: 18px; padding: 7px 12px; font: inherit; font-size: 12.5px; cursor: pointer; min-height: 34px; }
.stratChipOn { background: color-mix(in srgb, var(--accent) 22%, transparent); border-color: var(--accent); color: var(--text); font-weight: 600; }
.stratRow { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
.stratRow label { flex: 1 1 130px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
.stratWrap select, .stratWrap input { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px; font: inherit; font-size: 13px; min-width: 0; box-sizing: border-box; width: 100%; color-scheme: dark; }
.stratDesc { font-size: 12.5px; line-height: 1.5; margin: 8px 0 0; }
.stratLegs { display: flex; flex-direction: column; gap: 6px; }
.stratLeg { display: grid; grid-template-columns: 54px 54px minmax(0, 1fr) 76px 30px; gap: 6px; align-items: center; }
.stratToggle { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 4px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.stratPrem { font-size: 12.5px; text-align: right; }
.stratRemove { background: none; border: none; color: var(--text-dim); font-size: 18px; cursor: pointer; padding: 4px; }
.stratAdd { margin-top: 8px; }
.stratEmpty { padding: 14px 0; font-size: 13px; }
.payoffChart { display: block; width: 100%; height: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.payoffAxis { stroke: var(--text-dim); stroke-width: 1; opacity: 0.6; }
.payoffSpot { stroke: var(--amber); stroke-width: 1; stroke-dasharray: 4 4; }
.payoffGain, .payoffLoss { fill: none; stroke-width: 2.4; }
.payoffGain { stroke: var(--bull); }
.payoffLoss { stroke: var(--bear); }
.payoffText { fill: var(--text-dim); font-size: 12px; }
.stratStats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 12px; }
.stratStat { display: flex; flex-direction: column; gap: 3px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
.stratStat b { font-size: 14px; overflow-wrap: anywhere; }
.stratPlace { width: 100%; margin-top: 14px; justify-content: center; }
.stratNote { font-size: 12px; margin-top: 10px; line-height: 1.5; }
.stratError { margin-top: 10px; color: var(--bear); font-size: 13px; }
.stratLog { max-height: 320px; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
.stratLog table { width: 100%; border-collapse: collapse; font-size: 12px; }
.stratLog th, .stratLog td { padding: 7px 8px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
.rtPos { color: var(--bull); } .rtNeg { color: var(--bear); }
.rtWarn { margin-top: 8px; padding: 8px 10px; border-radius: 8px; font-size: 12.5px; color: var(--amber); background: color-mix(in srgb, var(--amber) 12%, transparent); }
.rtRule { margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; line-height: 1.5; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.rtCanvas { display: block; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.rtDayBar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.rtDayBar select { width: auto !important; min-width: 140px; }
.rtVerdict { font-size: 16px; font-weight: 600; margin: 10px 0 8px; }
.rtCheck { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: var(--text-dim); margin-top: 10px; }
.rtCheck input { width: auto !important; }
.rtLabel { font-size: 12px; color: var(--text-dim); margin: 12px 0 6px; }
.rtFull { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-dim); }
.rtSel td { background: color-mix(in srgb, var(--accent) 14%, transparent); }

/* Angel One connection */
.angelCard { max-width: 440px; }
.angelCard h1 { font-size: 20px; margin: 12px 0 8px; }
.angelCard ol { margin: 14px 0; padding-left: 20px; font-size: 13.5px; line-height: 1.6; }
.angelCard label { display: block; font-size: 12.5px; margin-bottom: 6px; }
.angelCard input { width: 100%; box-sizing: border-box; padding: 11px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font: inherit; margin-bottom: 12px; }
.angelNote { font-size: 12px; line-height: 1.5; margin-top: 12px; }
.angelCard h2 { font-size: 15.5px; margin: 10px 0 6px; }
.angelCard p { font-size: 13.5px; line-height: 1.55; margin: 0 0 12px; }
.setupLangs { display: flex; gap: 4px; margin: 10px 0 0; }
.setupLangs button { background: none; border: 1px solid var(--border); color: var(--text-dim); border-radius: 14px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.setupLangs .setupLangOn { border-color: var(--accent); color: var(--text); }
.setupProgress { height: 5px; border-radius: 3px; background: var(--surface-2); margin-top: 14px; overflow: hidden; }
.setupProgress span { display: block; height: 100%; background: var(--bull); transition: width 0.2s ease; }
.setupStepNo { font-size: 12px; margin-top: 6px; }
.setupRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.setupRow > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.setupRow b { overflow-wrap: anywhere; font-size: 13px; }
.setupRow .btn { flex: none; padding: 7px 10px; font-size: 12.5px; }
.setupBrokers { display: grid; gap: 8px; margin: 14px 0; }
.setupBrokers .btn { padding: 13px; font-size: 15px; justify-content: center; }
.setupOpen { display: block; text-align: center; text-decoration: none; padding: 10px; }
.setupNav { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.setupNav .btn { padding: 9px 16px; }
.setupLink { background: none; border: none; color: var(--text-dim); text-decoration: underline; font: inherit; font-size: 12.5px; cursor: pointer; padding: 10px 0 0; }
.setupHelp { margin-top: 10px; font-size: 12.5px; color: var(--text-dim); }
.setupHelp ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.5; }
.rtGuide { margin: 4px 0 18px; border: 1px solid color-mix(in srgb, #7B61FF 35%, var(--border)); border-radius: 12px; background: color-mix(in srgb, #7B61FF 6%, var(--surface)); }
.rtGuide summary { cursor: pointer; padding: 12px 14px; font-weight: 600; font-size: 13.5px; list-style: none; }
.rtGuide summary::-webkit-details-marker { display: none; }
.rtGuide summary::before { content: "▸"; display: inline-block; margin-right: 8px; color: #7B61FF; transition: transform 0.15s ease; }
.rtGuide[open] summary::before { transform: rotate(90deg); }
.rtGuideBody { padding: 0 16px 14px; font-size: 13px; line-height: 1.6; }
.rtGuideBody p { margin: 8px 0; }
.rtGuideBody ol, .rtGuideBody ul { margin: 6px 0 10px; padding-left: 20px; }
.rtGuideBody li { margin: 4px 0; }

/* phone order screen */
.orderCard.mOrderClosed { display: none; }
.orderCard.orderScreen { position: fixed; inset: 0; z-index: 45; max-width: none; margin: 0; border: none; border-radius: 0; height: auto; overflow-y: auto; padding: 0 16px calc(16px + env(safe-area-inset-bottom)); animation: sheetUp 0.18s ease-out; }
.orderScreenTop { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 8px; margin: 0 -16px 12px; padding: 10px 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
.orderScreenBack { display: flex; background: none; border: none; color: var(--text); padding: 10px; cursor: pointer; }
.orderScreenTitle { display: flex; flex-direction: column; gap: 2px; font-size: 15px; min-width: 0; }
.orderScreenTitle .mono { font-size: 12.5px; }
.orderScreen .pickPriceBtn { display: none; }
.orderScreen .orderBtns { position: sticky; bottom: 0; z-index: 2; background: var(--surface); padding: 10px 0; }
.orderScreen .orderBtns .btn { flex: 1; padding: 14px; font-size: 15px; }
@media (prefers-reduced-motion: reduce) { .orderCard.orderScreen { animation: none; } }

/* phone held sideways: keep the screen for content */
@media (pointer: coarse) and (max-height: 500px) {
  .orderCard.mOrderClosed { display: block; }
  .tradeGrid > .tagPrompt { display: none; }
  .mTradeBar { display: none !important; }
  .main { padding-bottom: 90px; }
  .bottomNavItem { min-height: 44px; flex-direction: row; gap: 6px; font-size: 12px; }
  .toastMobile { bottom: 70px; }
  .installBar, .firstTradeCard { margin-top: 6px; }
  .topbar { flex-wrap: nowrap; padding: 6px 14px; gap: 16px; }
  .topbar .brand { flex-shrink: 0; }
  .stats { width: auto; flex: 1; max-width: 520px; margin-left: auto; }
  .installBar { padding: 6px 10px; }
  .installBarText .dim { display: none; }
}

/* landing menu on phones: two tidy rows instead of a cut-off strip */
@media (max-width: 560px) {
  .landingWrap .landingMenu { flex-wrap: wrap !important; overflow: visible !important; gap: 8px 18px !important; white-space: nowrap; }
  .landingNavActions .landingNavBtn { padding: 9px 14px; }
}

/* ---- 3D top-bar buttons ---- */
.topbarActions .resetBtn, .topbarActions .themeBtn, .topbarActions .upgradeBtn, .topbarActions .userBadgeBtn {
  position: relative;
  background-image: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%);
  box-shadow: 0 3px 0 color-mix(in srgb, var(--border) 70%, #000), 0 6px 14px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.14);
  transform: translateY(0);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.15s ease, color 0.15s, border-color 0.15s;
}
.topbarActions .resetBtn:hover:not(:disabled), .topbarActions .themeBtn:hover, .topbarActions .upgradeBtn:hover, .topbarActions .userBadgeBtn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 0 color-mix(in srgb, var(--border) 70%, #000), 0 10px 20px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.18);
}
.topbarActions .resetBtn:active:not(:disabled), .topbarActions .themeBtn:active, .topbarActions .upgradeBtn:active, .topbarActions .userBadgeBtn:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--border) 70%, #000), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1);
}
.topbarActions .installBtn.hlBtn { box-shadow: 0 3px 0 color-mix(in srgb, var(--bull) 55%, #000), 0 8px 18px color-mix(in srgb, var(--bull) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.35) !important; }
.topbarActions .installBtn.hlBtn:hover { box-shadow: 0 5px 0 color-mix(in srgb, var(--bull) 55%, #000), 0 12px 22px color-mix(in srgb, var(--bull) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.35) !important; }
.topbarActions .practiceTopBtn { box-shadow: 0 3px 0 color-mix(in srgb, var(--accent) 55%, #000), 0 8px 18px color-mix(in srgb, var(--accent) 35%, transparent), inset 0 1px 0 rgba(255,255,255,0.3); }
.topbarActions .practiceTopBtn:hover:not(:disabled) { box-shadow: 0 5px 0 color-mix(in srgb, var(--accent) 55%, #000), 0 12px 22px color-mix(in srgb, var(--accent) 40%, transparent), inset 0 1px 0 rgba(255,255,255,0.3); }
.topbarActions .feedbackBtn.hlBtn { box-shadow: 0 3px 0 color-mix(in srgb, var(--accent) 45%, #000), 0 6px 14px color-mix(in srgb, var(--accent) 22%, transparent), inset 0 1px 0 rgba(255,255,255,0.18); }
.topbarActions .upgradeBtn { box-shadow: 0 3px 0 color-mix(in srgb, var(--amber) 55%, #000), 0 8px 18px color-mix(in srgb, var(--amber) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.4); }
.userBadgeBtn { cursor: pointer; font: inherit; font-size: 12px; }
.userBadgeBtn:hover { color: var(--text); border-color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .topbarActions .resetBtn, .topbarActions .themeBtn, .topbarActions .upgradeBtn, .topbarActions .userBadgeBtn { transition: none; transform: none !important; } }

/* ---- Account details panel ---- */
.accountModal { width: min(380px, calc(100vw - 32px)); }
.accountModal h3 { display: flex; align-items: center; gap: 8px; }
.accountList { margin: 6px 0 14px; display: grid; gap: 2px; }
.accountRow { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.accountRow:last-child { border-bottom: none; }
.accountRow dt { color: var(--text-dim); flex-shrink: 0; }
.accountRow dd { margin: 0; color: var(--text); font-weight: 600; text-align: right; word-break: break-word; }
.modal p.accountNote { font-size: 12px; margin: 0 0 14px; }
`;
