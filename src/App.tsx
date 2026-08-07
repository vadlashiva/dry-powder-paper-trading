import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, RotateCcw, X, Flame, Activity, LogOut, Lock, User as UserIcon, Bell, Trash2,
} from "lucide-react";

/* ----------------------------------------------------------------------
   TRADE FREE — Paper Trading Terminal (NSE / BSE)
   Tokens
   bg #0A0D14  surface #121722  surface-2 #1A2130  border #232B3D
   text #E7ECF6  text-dim #8B96AA  bull #14E8A0  bear #FF5470
   accent #7B61FF  amber #FFB020
   Display: Space Grotesk / Body: Inter / Data: JetBrains Mono
------------------------------------------------------------------------- */

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

const STARTING_CASH = 1000000; // ₹10,00,000
const RISK_FREE = 0.065;
const MULTIPLIER = 1; // per-unit; real exchange lot sizes vary and aren't modeled here

const TIMEFRAMES = {
  "1m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1H": { interval: "60m", range: "1mo" },
  "1D": { interval: "1d", range: "6mo" },
};
const TIMEFRAME_MS = { "1m": 60000, "5m": 300000, "15m": 900000, "1H": 3600000, "1D": 86400000 };

const displayTicker = (s) => s.replace(/\.(NS|BO)$/, "").replace(/^\^/, "");
const exchangeBadge = (ex) => (ex === "INDEX" ? "IDX" : ex);

/* ---------------- option pricing math ---------------- */
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

function blackScholes(S, K, T, r, sigma, type) {
  T = Math.max(T, 1 / (365 * 24));
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

function nextThursdays(n) {
  const out = [];
  let d = new Date();
  d.setHours(15, 30, 0, 0);
  const day = d.getDay();
  let diff = (4 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  for (let i = 0; i < n; i++) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 7);
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
function strikesAround(spot, count = 9) {
  const step = strikeStep(spot);
  const center = Math.round(spot / step) * step;
  const half = Math.floor(count / 2);
  const out = [];
  for (let i = -half; i <= half; i++) out.push(+(center + i * step).toFixed(2));
  return out;
}

/* ---------------- realistic synthetic OHLC (used only when the live feed is unreachable) ---------------- */
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

/* ---------------- technical indicators ---------------- */
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
function buildChartSeries(history, ind) {
  const sma = ind.ma ? computeSMA(history, 20) : null;
  const rsi = ind.rsi ? computeRSI(history, 14) : null;
  const macd = ind.macd ? computeMACD(history) : null;
  return history.map((d, i) => {
    const open = d.open ?? d.price;
    const high = d.high ?? d.price;
    const low = d.low ?? d.price;
    const close = d.close ?? d.price;
    return {
      time: d.time,
      price: d.price,
      open, high, low, close,
      range: [low, high],
      ma: sma ? sma[i] : null,
      rsi: rsi ? rsi[i] : null,
      macdLine: macd ? macd.macdLine[i] : null,
      signalLine: macd ? macd.signalLine[i] : null,
      hist: macd ? macd.hist[i] : null,
    };
  });
}

/* ---------------- candlestick rendering ---------------- */
function CandleShape(props) {
  const { x, y, width, height, payload } = props;
  const { open, high, low, close } = payload;
  const cx = x + width / 2;
  if (high === low) {
    return <line x1={cx} x2={cx} y1={y} y2={y + height} stroke="var(--text-dim)" strokeWidth={1} />;
  }
  const isUp = close >= open;
  const color = isUp ? "var(--bull)" : "var(--bear)";
  const bodyTopVal = Math.max(open, close);
  const bodyBotVal = Math.min(open, close);
  const bodyTop = y + (height * (high - bodyTopVal)) / (high - low);
  const bodyBottom = y + (height * (high - bodyBotVal)) / (high - low);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  const bw = Math.max(width * 0.6, 1);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyHeight} fill={color} />
    </g>
  );
}
function CandleTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="candleTip mono">
      <div className="dim">{new Date(label).toLocaleString()}</div>
      <div>O <b>{d.open?.toFixed(2)}</b></div>
      <div>H <b>{d.high?.toFixed(2)}</b></div>
      <div>L <b>{d.low?.toFixed(2)}</b></div>
      <div>C <b>{d.close?.toFixed(2)}</b></div>
    </div>
  );
}

/* ---------------- formatting ---------------- */
const fmtMoney = (n, d = 2) =>
  (n < 0 ? "-\u20B9" : "\u20B9") + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const fmtDate = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- local persistence (accounts + portfolios stay saved in this browser) ---------------- */
const LS_USERS = "tf_users";
const LS_SESSION = "tf_session";
const portfolioKey = (username) => `tf_portfolio_${username}`;

function loadUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS)) || []; } catch { return []; }
}
function saveUsers(list) {
  try { localStorage.setItem(LS_USERS, JSON.stringify(list)); } catch { /* storage unavailable */ }
}
function loadSession() {
  try { return localStorage.getItem(LS_SESSION) || null; } catch { return null; }
}
function saveSession(username) {
  try { localStorage.setItem(LS_SESSION, username); } catch { /* storage unavailable */ }
}
function clearSession() {
  try { localStorage.removeItem(LS_SESSION); } catch { /* storage unavailable */ }
}
function loadPortfolio(username) {
  try {
    const raw = localStorage.getItem(portfolioKey(username));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...parsed, trades: (parsed.trades || []).map((t) => ({ ...t, time: new Date(t.time) })) };
  } catch { return null; }
}
function savePortfolio(username, data) {
  try { localStorage.setItem(portfolioKey(username), JSON.stringify(data)); } catch { /* storage unavailable */ }
}

/* ---------------- data layer ---------------- */
async function fetchYahoo(symbol, interval = "5m", range = "1d") {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`
  );
  if (!res.ok) throw new Error("bad response");
  const json = await res.json();
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

/* ======================================================================
   AUTH GATE (accounts persist in this browser via localStorage)
====================================================================== */
function AuthGate({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [users, setUsers] = useState(() => loadUsers());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setError("");
    const uname = username.trim();
    if (!uname || !password) return setError("Enter a username and password.");

    if (mode === "register") {
      if (password !== confirm) return setError("Passwords don't match.");
      if (users.some((u) => u.username.toLowerCase() === uname.toLowerCase()))
        return setError("That username is already taken.");
      const next = [...users, { username: uname, password }];
      setUsers(next);
      saveUsers(next);
      onAuth(uname);
    } else {
      const match = users.find(
        (u) => u.username.toLowerCase() === uname.toLowerCase() && u.password === password
      );
      if (!match) return setError("Invalid username or password.");
      onAuth(uname);
    }
  };

  return (
    <div className="authWrap">
      <style>{CSS}</style>
      <div className="authCard">
        <div className="authBrand">
          <Flame size={22} className="brandIcon" />
          <span>TRADE FREE</span>
        </div>
        <div className="authSub">Paper trading terminal &middot; NSE &amp; BSE</div>

        <div className="authTabs">
          <button className={`authTab ${mode === "login" ? "authTabActive" : ""}`} onClick={() => { setMode("login"); setError(""); }}>Log In</button>
          <button className={`authTab ${mode === "register" ? "authTabActive" : ""}`} onClick={() => { setMode("register"); setError(""); }}>Register</button>
        </div>

        <form onSubmit={submit}>
          <div className="authField">
            <UserIcon size={14} className="authIcon" />
            <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div className="authField">
            <Lock size={14} className="authIcon" />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} />
          </div>
          {mode === "register" && (
            <div className="authField">
              <Lock size={14} className="authIcon" />
              <input type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          )}
          {error && <div className="authError">{error}</div>}
          <button type="submit" className="btn btnBull authSubmit">{mode === "register" ? "Create account" : "Log in"}</button>
        </form>

        <div className="authNote">Accounts and portfolios are saved in this browser (localStorage) — refreshing keeps you logged in, and your positions stay put. They won't sync to another device or browser.</div>
      </div>
    </div>
  );
}

/* ======================================================================
   TRADING APP
====================================================================== */
function TradingApp({ username, onLogout }) {
  const saved = useMemo(() => loadPortfolio(username), [username]);

  const [quotes, setQuotes] = useState(() => {
    const q = {};
    INSTRUMENTS.forEach((s) => {
      const hist = genSyntheticHistory(s.fallback, 60, TIMEFRAME_MS["1D"]);
      q[s.symbol] = { price: s.fallback, prevClose: s.fallback, history: hist, live: false };
    });
    return q;
  });
  const [exchangeFilter, setExchangeFilter] = useState("ALL");
  const [selected, setSelected] = useState("RELIANCE.NS");
  const [tab, setTab] = useState("trade");
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

  const [timeframe, setTimeframe] = useState("1D");
  const [chartHistory, setChartHistory] = useState([]);
  const [indicators, setIndicators] = useState({ ma: true, rsi: false, macd: false });

  const [alerts, setAlerts] = useState(() => saved?.alerts ?? []);
  const [alertTarget, setAlertTarget] = useState("");
  const [alertDirection, setAlertDirection] = useState("above");

  const expiries = useMemo(() => nextThursdays(4), []);
  const quotesRef = useRef(quotes);
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);

  /* persist this user's portfolio whenever it changes */
  useEffect(() => {
    savePortfolio(username, { cash, stockPositions, optionPositions, trades, alerts });
  }, [username, cash, stockPositions, optionPositions, trades, alerts]);

  /* watchlist quotes: poll every 20s + realistic jitter every 2.2s */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const results = await Promise.allSettled(INSTRUMENTS.map((s) => fetchYahoo(s.symbol)));
      if (cancelled) return;
      setQuotes((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => {
          const sym = INSTRUMENTS[i].symbol;
          if (r.status === "fulfilled" && r.value.price) {
            const hist = r.value.history.length ? r.value.history.slice(-90) : prev[sym].history;
            next[sym] = { price: r.value.price, prevClose: r.value.prevClose, history: hist, live: true };
          }
        });
        return next;
      });
    };
    pull();
    const iv = setInterval(pull, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setQuotes((prev) => {
        const next = { ...prev };
        INSTRUMENTS.forEach((s) => {
          const cur = prev[s.symbol];
          const open = cur.price;
          const close = +(open + open * (Math.random() - 0.5) * 0.0015).toFixed(2);
          const wick = open * Math.random() * 0.0008;
          const high = +(Math.max(open, close) + wick).toFixed(2);
          const low = +(Math.min(open, close) - wick).toFixed(2);
          const history = [...cur.history, { time: Date.now(), price: close, open, high, low, close }].slice(-90);
          next[s.symbol] = { ...cur, price: close, history };
        });
        return next;
      });
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  /* chart-specific OHLC history for the selected symbol & timeframe */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { interval, range } = TIMEFRAMES[timeframe];
      try {
        const r = await fetchYahoo(selected, interval, range);
        if (!cancelled && r.history.length >= 5) {
          setChartHistory(r.history.slice(-200));
        } else if (!cancelled) {
          const base = quotesRef.current[selected]?.price ?? INSTRUMENTS.find((s) => s.symbol === selected)?.fallback ?? 100;
          setChartHistory(genSyntheticHistory(base, 90, TIMEFRAME_MS[timeframe]));
        }
      } catch {
        if (!cancelled) {
          const base = quotesRef.current[selected]?.price ?? INSTRUMENTS.find((s) => s.symbol === selected)?.fallback ?? 100;
          setChartHistory(genSyntheticHistory(base, 90, TIMEFRAME_MS[timeframe]));
        }
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selected, timeframe]);

  /* price alert checks */
  useEffect(() => {
    let changed = false;
    const next = alerts.map((a) => {
      if (a.triggered) return a;
      const price = quotes[a.symbol]?.price;
      if (price == null) return a;
      const hit = a.direction === "above" ? price >= a.target : price <= a.target;
      if (hit) {
        changed = true;
        showToast(`Alert: ${displayTicker(a.symbol)} crossed ${a.direction} ${fmtMoney(a.target)}`, a.direction === "above" ? "bull" : "bear");
        return { ...a, triggered: true };
      }
      return a;
    });
    if (changed) setAlerts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes]);

  const q = quotes[selected];
  const meta = INSTRUMENTS.find((s) => s.symbol === selected);
  const isIndex = meta.exchange === "INDEX";
  const chartSeries = useMemo(() => buildChartSeries(chartHistory.length ? chartHistory : q.history, indicators), [chartHistory, q.history, indicators]);

  const stockMktValue = stockPositions.reduce((sum, p) => sum + (quotes[p.symbol]?.price ?? 0) * p.qty, 0);
  const optionMktValue = optionPositions.reduce((sum, p) => {
    const spot = quotes[p.symbol]?.price ?? 0;
    const symMeta = INSTRUMENTS.find((s) => s.symbol === p.symbol);
    const T = (p.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
    const { price } = blackScholes(spot, p.strike, T, RISK_FREE, sigma, p.type);
    return sum + price * MULTIPLIER * p.qty;
  }, 0);
  const equity = cash + stockMktValue + optionMktValue;
  const dayPnl = equity - STARTING_CASH;

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
  const logTrade = (label, amount) => {
    setTrades((prev) => [{ id: uid(), time: new Date(), label, amount }, ...prev].slice(0, 200));
  };

  const placeStockOrder = (side) => {
    const price = q.price;
    const qty = orderQty;
    if (qty <= 0) return;
    const cost = price * qty;
    if (side === "buy") {
      if (cost > cash) return showToast("Insufficient buying power", "bear");
      setCash((c) => c - cost);
      setStockPositions((prev) => {
        const existing = prev.find((p) => p.symbol === selected);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPrice = (existing.avgPrice * existing.qty + cost) / totalQty;
          return prev.map((p) => (p.symbol === selected ? { ...p, qty: totalQty, avgPrice } : p));
        }
        return [...prev, { id: uid(), symbol: selected, qty, avgPrice: price }];
      });
      logTrade(`BUY ${qty} ${displayTicker(selected)} @ ${fmtMoney(price)}`, -cost);
      showToast(`Bought ${qty} ${displayTicker(selected)}`, "bull");
    } else {
      const existing = stockPositions.find((p) => p.symbol === selected);
      const held = existing?.qty ?? 0;
      if (qty > held) return showToast(`Only ${held} shares held`, "bear");
      setCash((c) => c + cost);
      setStockPositions((prev) => prev.map((p) => (p.symbol === selected ? { ...p, qty: p.qty - qty } : p)).filter((p) => p.qty > 0));
      logTrade(`SELL ${qty} ${displayTicker(selected)} @ ${fmtMoney(price)}`, cost);
      showToast(`Sold ${qty} ${displayTicker(selected)}`, "bear");
    }
  };

  const openTicket = (type, strike, expiry) => setTicket({ symbol: selected, type, strike, expiry: expiry.getTime() });

  const placeOptionOrder = (mode, qty) => {
    if (!ticket || qty <= 0) return;
    const spot = quotes[ticket.symbol]?.price ?? 0;
    const symMeta = INSTRUMENTS.find((s) => s.symbol === ticket.symbol);
    const T = (ticket.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(ticket.strike - spot) / spot);
    const { price } = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);
    const premiumTotal = price * MULTIPLIER * qty;
    const label = `${ticket.type.toUpperCase()} ${displayTicker(ticket.symbol)} ${ticket.strike} ${fmtDate(new Date(ticket.expiry))}`;

    if (mode === "buy") {
      if (premiumTotal > cash) return showToast("Insufficient buying power", "bear");
      setCash((c) => c - premiumTotal);
      setOptionPositions((prev) => {
        const key = (p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry;
        const existing = prev.find(key);
        if (existing) {
          const totalQty = existing.qty + qty;
          const avgPremium = (existing.avgPremium * existing.qty + premiumTotal) / totalQty;
          return prev.map((p) => (key(p) ? { ...p, qty: totalQty, avgPremium } : p));
        }
        return [...prev, { id: uid(), symbol: ticket.symbol, type: ticket.type, strike: ticket.strike, expiry: ticket.expiry, qty, avgPremium: price }];
      });
      logTrade(`BTO ${qty}x ${label} @ ${fmtMoney(price)}`, -premiumTotal);
      showToast(`Opened ${qty}x ${label}`, "bull");
    } else {
      const key = (p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry;
      const existing = optionPositions.find(key);
      const held = existing?.qty ?? 0;
      if (qty > held) return showToast(`Only ${held} held`, "bear");
      setCash((c) => c + premiumTotal);
      setOptionPositions((prev) => prev.map((p) => (key(p) ? { ...p, qty: p.qty - qty } : p)).filter((p) => p.qty > 0));
      logTrade(`STC ${qty}x ${label} @ ${fmtMoney(price)}`, premiumTotal);
      showToast(`Closed ${qty}x ${label}`, "bear");
    }
    setTicket(null);
  };

  const closeOptionPosition = (pos) => {
    const spot = quotes[pos.symbol]?.price ?? 0;
    const symMeta = INSTRUMENTS.find((s) => s.symbol === pos.symbol);
    const T = (pos.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(pos.strike - spot) / spot);
    const { price } = blackScholes(spot, pos.strike, T, RISK_FREE, sigma, pos.type);
    const total = price * MULTIPLIER * pos.qty;
    setCash((c) => c + total);
    setOptionPositions((prev) => prev.filter((p) => p.id !== pos.id));
    logTrade(`STC ${pos.qty}x ${pos.type.toUpperCase()} ${displayTicker(pos.symbol)} ${pos.strike} @ ${fmtMoney(price)}`, total);
    showToast("Position closed", "bear");
  };

  const closeStockPosition = (pos) => {
    const price = quotes[pos.symbol]?.price ?? 0;
    const total = price * pos.qty;
    setCash((c) => c + total);
    setStockPositions((prev) => prev.filter((p) => p.id !== pos.id));
    logTrade(`SELL ${pos.qty} ${displayTicker(pos.symbol)} @ ${fmtMoney(price)}`, total);
    showToast("Position closed", "bear");
  };

  const doReset = () => {
    setCash(STARTING_CASH);
    setStockPositions([]);
    setOptionPositions([]);
    setTrades([]);
    setAlerts([]);
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

  const filteredInstruments = INSTRUMENTS.filter((s) => {
    const matchesExchange = exchangeFilter === "ALL" || s.exchange === exchangeFilter;
    const matchesSearch = displayTicker(s.symbol).toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase());
    return matchesExchange && matchesSearch;
  });

  const currentExpiry = expiries[expiryIdx];
  const chainStrikes = strikesAround(q?.price ?? meta.fallback);
  const T = currentExpiry ? (currentExpiry.getTime() - Date.now()) / (365 * 24 * 3600 * 1000) : 0;

  return (
    <div className="app">
      <style>{CSS}</style>

      <div className="topbar">
        <div className="brand">
          <Flame size={20} className="brandIcon" />
          <span>TRADE FREE</span>
          <span className="brandSub">paper terminal</span>
        </div>
        <div className="stats">
          <Stat label="Cash" value={fmtMoney(cash, 0)} />
          <Stat label="Equity" value={fmtMoney(equity, 0)} pulse={pulse} />
          <Stat label="Total P&L" value={fmtMoney(dayPnl, 0)} tone={dayPnl >= 0 ? "bull" : "bear"} />
        </div>
        <div className="topbarActions">
          <div className="userBadge"><UserIcon size={13} />{username}</div>
          <button className="resetBtn" onClick={() => setConfirmReset(true)}><RotateCcw size={14} /> Reset</button>
          <button className="resetBtn" onClick={onLogout}><LogOut size={14} /> Log out</button>
        </div>
      </div>

      <div className="body">
        <div className="watchlist">
          <input className="search" placeholder="Search symbol…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="exchangeTabs">
            {["ALL", "NSE", "BSE", "INDEX"].map((ex) => (
              <button key={ex} className={`exTab ${exchangeFilter === ex ? "exTabActive" : ""}`} onClick={() => setExchangeFilter(ex)}>{ex === "INDEX" ? "Index" : ex}</button>
            ))}
          </div>
          <div className="wlHead">
            <span>Live via public market feed</span>
            <Activity size={12} className={quotes[selected]?.live ? "liveDot" : "liveDotOff"} />
          </div>
          <div className="wlList">
            {filteredInstruments.map((s) => {
              const qq = quotes[s.symbol];
              const chg = qq.prevClose ? ((qq.price - qq.prevClose) / qq.prevClose) * 100 : 0;
              const up = chg >= 0;
              return (
                <button key={s.symbol} className={`wlRow ${selected === s.symbol ? "wlRowActive" : ""}`} onClick={() => setSelected(s.symbol)}>
                  <div className="wlSym">
                    <span className="wlTicker">{displayTicker(s.symbol)}<span className={`exBadge exBadge-${s.exchange}`}>{exchangeBadge(s.exchange)}</span></span>
                    <span className="wlName">{s.name}</span>
                  </div>
                  <div className="wlPriceCol">
                    <span className="wlPrice mono">{fmtMoney(qq.price)}</span>
                    <span className={`wlChg mono ${up ? "bull" : "bear"}`}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{fmtPct(chg)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="main">
          <div className="mainHead">
            <div className="mainHeadLeft">
              <h1>{displayTicker(selected)}</h1>
              <span className={`exBadge exBadge-${meta.exchange}`}>{exchangeBadge(meta.exchange)}</span>
              <span className="mainHeadName">{meta.name}</span>
            </div>
            <div className="mainHeadPrice">
              <span className="mono bigPrice">{fmtMoney(q.price)}</span>
              <span className={`mono ${q.price >= q.prevClose ? "bull" : "bear"}`}>{fmtPct(((q.price - q.prevClose) / q.prevClose) * 100)}</span>
            </div>
          </div>

          <div className="tabs">
            {[["trade", "Chart & Trade"], ["chain", "Options Chain"], ["positions", "Positions"], ["alerts", `Alerts${activeAlerts ? ` (${activeAlerts})` : ""}`], ["history", "History"]].map(([id, label]) => (
              <button key={id} className={`tab ${tab === id ? "tabActive" : ""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "trade" && (
            <div className="tradeGrid">
              <div className="chartCard">
                <div className="chartHead">
                  <div className="tfTabs">
                    {Object.keys(TIMEFRAMES).map((tf) => (
                      <button key={tf} className={`tfTab ${timeframe === tf ? "tfTabActive" : ""}`} onClick={() => setTimeframe(tf)}>{tf}</button>
                    ))}
                  </div>
                  <div className="indToggles">
                    {[["ma", "MA(20)"], ["rsi", "RSI(14)"], ["macd", "MACD"]].map(([key, label]) => (
                      <button key={key} className={`indToggle ${indicators[key] ? "indToggleActive" : ""}`} onClick={() => setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))}>{label}</button>
                    ))}
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={indicators.rsi || indicators.macd ? 250 : 320}>
                  <ComposedChart data={chartSeries}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} stroke="var(--text-dim)" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} minTickGap={40} />
                    <YAxis domain={["auto", "auto"]} stroke="var(--text-dim)" tick={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }} width={70} tickFormatter={(v) => v.toFixed(0)} />
                    <ReferenceLine y={q.prevClose} stroke="var(--text-dim)" strokeDasharray="4 4" />
                    <Tooltip content={<CandleTooltip />} />
                    <Bar dataKey="range" shape={CandleShape} isAnimationActive={false} />
                    {indicators.ma && <Line type="monotone" dataKey="ma" stroke="var(--amber)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                  </ComposedChart>
                </ResponsiveContainer>

                {indicators.rsi && (
                  <div className="subChart">
                    <span className="subChartLabel">RSI (14)</span>
                    <ResponsiveContainer width="100%" height={90}>
                      <ComposedChart data={chartSeries}>
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, 100]} stroke="var(--text-dim)" tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} width={30} ticks={[30, 50, 70]} />
                        <ReferenceLine y={70} stroke="var(--bear)" strokeDasharray="3 3" />
                        <ReferenceLine y={30} stroke="var(--bull)" strokeDasharray="3 3" />
                        <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} formatter={(v) => [v?.toFixed?.(1), "RSI"]} labelFormatter={() => ""} />
                        <Line type="monotone" dataKey="rsi" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {indicators.macd && (
                  <div className="subChart">
                    <span className="subChartLabel">MACD (12, 26, 9)</span>
                    <ResponsiveContainer width="100%" height={90}>
                      <ComposedChart data={chartSeries}>
                        <XAxis dataKey="time" hide />
                        <YAxis stroke="var(--text-dim)" tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} width={40} />
                        <ReferenceLine y={0} stroke="var(--border)" />
                        <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} labelFormatter={() => ""} />
                        <Bar dataKey="hist" fill="var(--text-dim)" opacity={0.5} isAnimationActive={false} />
                        <Line type="monotone" dataKey="macdLine" stroke="var(--bull)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="signalLine" stroke="var(--bear)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {isIndex ? (
                <div className="orderCard">
                  <h3>Index</h3>
                  <p className="dim indexNote">{meta.name} isn't traded as a cash position here — head to the <b>Options Chain</b> tab to trade {displayTicker(selected)} options.</p>
                </div>
              ) : (
                <div className="orderCard">
                  <h3>Market Order</h3>
                  <div className="orderRow">
                    <label>Quantity</label>
                    <input type="number" min="1" className="qtyInput mono" value={orderQty} onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))} />
                  </div>
                  <div className="orderEst mono">Est. cost: <span>{fmtMoney(q.price * orderQty)}</span></div>
                  <div className="orderBtns">
                    <button className="btn btnBull" onClick={() => placeStockOrder("buy")}>Buy</button>
                    <button className="btn btnBear" onClick={() => placeStockOrder("sell")}>Sell</button>
                  </div>
                  <div className="held mono">Held: {stockPositions.find((p) => p.symbol === selected)?.qty ?? 0} shares</div>
                </div>
              )}
            </div>
          )}

          {tab === "chain" && (
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
                      <th colSpan={5} className="chainSideHead callHead">CALLS</th>
                      <th className="strikeHead">STRIKE</th>
                      <th colSpan={5} className="chainSideHead putHead">PUTS</th>
                    </tr>
                    <tr className="subhead">
                      <th>Δ</th><th>Θ</th><th>IV</th><th>Premium</th><th></th>
                      <th></th>
                      <th></th><th>Premium</th><th>IV</th><th>Θ</th><th>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainStrikes.map((strike) => {
                      const spot = q.price;
                      const sigma = meta.iv * (1 + 0.15 * Math.abs(strike - spot) / spot);
                      const call = blackScholes(spot, strike, T, RISK_FREE, sigma, "call");
                      const put = blackScholes(spot, strike, T, RISK_FREE, sigma, "put");
                      const isATM = Math.abs(strike - spot) < strikeStep(spot) / 2;
                      const callITM = strike < spot;
                      const putITM = strike > spot;
                      return (
                        <tr key={strike} className={isATM ? "atmRow" : ""}>
                          <td className="mono dim">{call.delta.toFixed(2)}</td>
                          <td className="mono dim">{call.theta.toFixed(2)}</td>
                          <td className="mono dim">{(sigma * 100).toFixed(0)}%</td>
                          <td className={`mono premCell ${callITM ? "itmCall" : ""}`} onClick={() => openTicket("call", strike, currentExpiry)}>{fmtMoney(call.price)}</td>
                          <td className="chainGutter" />
                          <td className="strikeCell mono">{strike}</td>
                          <td className="chainGutter" />
                          <td className={`mono premCell ${putITM ? "itmPut" : ""}`} onClick={() => openTicket("put", strike, currentExpiry)}>{fmtMoney(put.price)}</td>
                          <td className="mono dim">{(sigma * 100).toFixed(0)}%</td>
                          <td className="mono dim">{put.theta.toFixed(2)}</td>
                          <td className="mono dim">{put.delta.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="chainNote">Premiums &amp; Greeks are modeled live from the underlying price via Black-Scholes — not a live exchange options feed. Quantities are per unit, not exchange lot size.</div>
            </div>
          )}

          {tab === "positions" && (
            <div className="posWrap">
              <h3>Stock Positions</h3>
              {stockPositions.length === 0 ? (
                <div className="empty">No open stock positions. Buy something on the Chart &amp; Trade tab.</div>
              ) : (
                <table className="posTable">
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
                          <td><button className="closeBtn" onClick={() => closeStockPosition(p)}>Close</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <h3 className="mt">Option Positions</h3>
              {optionPositions.length === 0 ? (
                <div className="empty">No open option positions. Click a premium in the Options Chain to open one.</div>
              ) : (
                <table className="posTable">
                  <thead><tr><th>Contract</th><th>Qty</th><th>Avg Premium</th><th>Last</th><th>Mkt Value</th><th>P&L</th><th></th></tr></thead>
                  <tbody>
                    {optionPositions.map((p) => {
                      const spot = quotes[p.symbol]?.price ?? 0;
                      const symMeta = INSTRUMENTS.find((s) => s.symbol === p.symbol);
                      const pT = (p.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
                      const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
                      const { price } = blackScholes(spot, p.strike, pT, RISK_FREE, sigma, p.type);
                      const mv = price * MULTIPLIER * p.qty;
                      const pnl = mv - p.avgPremium * MULTIPLIER * p.qty;
                      return (
                        <tr key={p.id}>
                          <td className="mono">{p.type === "call" ? "C" : "P"} {displayTicker(p.symbol)} {p.strike} {fmtDate(new Date(p.expiry))}</td>
                          <td className="mono">{p.qty}</td>
                          <td className="mono">{fmtMoney(p.avgPremium)}</td>
                          <td className="mono">{fmtMoney(price)}</td>
                          <td className="mono">{fmtMoney(mv)}</td>
                          <td className={`mono ${pnl >= 0 ? "bull" : "bear"}`}>{fmtMoney(pnl)}</td>
                          <td><button className="closeBtn" onClick={() => closeOptionPosition(p)}>Close</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "alerts" && (
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
                <div className="dim alertHint">Alerts are checked against live prices and fire a notification here in the app — set one for the symbol currently selected in the watchlist.</div>
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
                        <td><button className="closeBtn" onClick={() => deleteAlert(a.id)}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="histWrap">
              {trades.length === 0 ? (
                <div className="empty">No trades yet. Your fills will show up here.</div>
              ) : (
                <table className="posTable">
                  <thead><tr><th>Time</th><th>Trade</th><th>Cash Impact</th></tr></thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.id}>
                        <td className="mono dim">{t.time.toLocaleTimeString()}</td>
                        <td className="mono">{t.label}</td>
                        <td className={`mono ${t.amount >= 0 ? "bull" : "bear"}`}>{fmtMoney(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {ticket && (
        <OptionTicket
          ticket={ticket}
          quotes={quotes}
          onClose={() => setTicket(null)}
          onSubmit={placeOptionOrder}
          heldQty={optionPositions.find((p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry)?.qty ?? 0}
        />
      )}

      {confirmReset && (
        <div className="modalOverlay" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Reset account?</h3>
            <p>This clears all positions, cash, and trade history back to {fmtMoney(STARTING_CASH, 0)}.</p>
            <div className="modalBtns">
              <button className="btn btnGhost" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="btn btnBear" onClick={doReset}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function Stat({ label, value, tone, pulse }) {
  return (
    <div className={`stat ${pulse ? `pulse-${pulse}` : ""}`}>
      <span className="statLabel">{label}</span>
      <span className={`statValue mono ${tone ? tone : ""}`}>{value}</span>
    </div>
  );
}

function OptionTicket({ ticket, quotes, onClose, onSubmit, heldQty }) {
  const [qty, setQty] = useState(1);
  const spot = quotes[ticket.symbol]?.price ?? 0;
  const symMeta = INSTRUMENTS.find((s) => s.symbol === ticket.symbol);
  const T = (ticket.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
  const sigma = symMeta.iv * (1 + 0.15 * Math.abs(ticket.strike - spot) / spot);
  const greeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal ticketModal" onClick={(e) => e.stopPropagation()}>
        <div className="ticketHead">
          <div>
            <span className={`typeBadge ${ticket.type}`}>{ticket.type.toUpperCase()}</span>
            <h3>{displayTicker(ticket.symbol)} {ticket.strike}</h3>
            <span className="dim">Exp {fmtDate(new Date(ticket.expiry))}</span>
          </div>
          <button className="iconBtn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="greeksGrid mono">
          <div><span className="dim">Premium</span>{fmtMoney(greeks.price)}</div>
          <div><span className="dim">Delta</span>{greeks.delta.toFixed(3)}</div>
          <div><span className="dim">Gamma</span>{greeks.gamma.toFixed(4)}</div>
          <div><span className="dim">Theta</span>{greeks.theta.toFixed(3)}</div>
          <div><span className="dim">Vega</span>{greeks.vega.toFixed(3)}</div>
          <div><span className="dim">IV</span>{(sigma * 100).toFixed(1)}%</div>
        </div>

        <div className="orderRow">
          <label>Quantity</label>
          <input type="number" min="1" className="qtyInput mono" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
        <div className="orderEst mono">Est. total: <span>{fmtMoney(greeks.price * MULTIPLIER * qty)}</span> · Held: {heldQty}</div>

        <div className="orderBtns">
          <button className="btn btnBull" onClick={() => onSubmit("buy", qty)}>Buy to Open</button>
          <button className="btn btnBear" onClick={() => onSubmit("sell", qty)}>Sell to Close</button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================================
   ROOT
====================================================================== */
export default function App() {
  const [user, setUser] = useState(() => loadSession());

  const handleAuth = (uname) => {
    saveSession(uname);
    setUser(uname);
  };
  const handleLogout = () => {
    clearSession();
    setUser(null);
  };

  if (!user) return <AuthGate onAuth={handleAuth} />;
  return <TradingApp username={user} onLogout={handleLogout} />;
}

/* ---------------------------------- CSS ---------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap');

.app, .authWrap {
  --bg: #0A0D14; --surface: #121722; --surface-2: #1A2130; --border: #232B3D;
  --text: #E7ECF6; --text-dim: #8B96AA; --bull: #14E8A0; --bear: #FF5470;
  --accent: #7B61FF; --amber: #FFB020;
  background: var(--bg); color: var(--text);
  font-family: 'Inter', sans-serif;
}
.app { min-height: 100vh; display: flex; flex-direction: column; }
.mono { font-family: 'JetBrains Mono', monospace; }
.bull { color: var(--bull); } .bear { color: var(--bear); } .dim { color: var(--text-dim); }

.authWrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.authCard { width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.authBrand { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; justify-content: center; }
.authSub { text-align: center; color: var(--text-dim); font-size: 12px; margin: 6px 0 22px; }
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
.brand { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: 0.5px; font-size: 16px; }
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
.resetBtn { display: flex; align-items: center; gap: 6px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
.resetBtn:hover { color: var(--text); border-color: var(--accent); }

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
.mainHead h1 { font-family: 'Space Grotesk', sans-serif; font-size: 26px; margin: 0; }
.mainHeadName { color: var(--text-dim); font-size: 13px; }
.mainHeadPrice { display: flex; flex-direction: column; align-items: flex-end; }
.bigPrice { font-size: 22px; font-weight: 700; }

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; flex-wrap: wrap; }
.tab { background: none; border: none; color: var(--text-dim); padding: 10px 16px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
.tab:hover { color: var(--text); }
.tabActive { color: var(--text); border-bottom: 2px solid var(--accent); }

.tradeGrid { display: grid; grid-template-columns: 1fr 260px; gap: 20px; }
.chartCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.chartHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.tfTabs, .indToggles { display: flex; gap: 4px; }
.tfTab { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; }
.tfTabActive { background: var(--accent); color: white; border-color: var(--accent); }
.indToggle { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; }
.indToggleActive { background: var(--amber); color: #241800; border-color: var(--amber); }
.subChart { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.subChartLabel { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.6px; }
.candleTip { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 11px; line-height: 1.6; }
.candleTip b { color: var(--text); font-weight: 600; margin-left: 4px; }

.orderCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; height: fit-content; }
.orderCard h3 { margin: 0 0 14px; font-family: 'Space Grotesk'; font-size: 14px; }
.indexNote { font-size: 12px; line-height: 1.6; margin: 0; }
.orderRow { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.orderRow label { font-size: 12px; color: var(--text-dim); }
.qtyInput { width: 90px; background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 6px; font-size: 13px; text-align: right; }
.orderEst { font-size: 12px; color: var(--text-dim); margin-bottom: 14px; }
.orderEst span { color: var(--text); }
.orderBtns { display: flex; gap: 8px; margin-bottom: 12px; }
.btn { flex: 1; padding: 10px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s; }
.btn:hover { opacity: 0.85; }
.btnBull { background: var(--bull); color: #06231A; }
.btnBear { background: var(--bear); color: #2B0710; }
.btnGhost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
.held { font-size: 11px; color: var(--text-dim); }

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
.strikeHead { color: var(--amber); }
.subhead th { color: var(--text-dim); font-weight: 400; font-size: 10px; border-bottom: 1px solid var(--border); }
.strikeCell { font-weight: 700; color: var(--amber); background: var(--surface-2); }
.chainGutter { width: 4px; padding: 0; }
.premCell { cursor: pointer; border-radius: 6px; transition: background 0.12s; }
.premCell:hover { background: var(--surface-2); }
.itmCall { background: rgba(20,232,160,0.08); }
.itmPut { background: rgba(255,84,112,0.08); }
.atmRow td { border-top: 1px dashed var(--amber); border-bottom: 1px dashed var(--amber); }
.chainNote { margin-top: 12px; font-size: 11px; color: var(--text-dim); }

.posWrap h3, .histWrap h3 { font-family: 'Space Grotesk'; font-size: 14px; margin: 0 0 10px; }
.mt { margin-top: 26px; }
.empty { color: var(--text-dim); font-size: 13px; padding: 20px; background: var(--surface); border: 1px dashed var(--border); border-radius: 10px; text-align: center; }
.posTable { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.posTable th { text-align: left; font-size: 10px; color: var(--text-dim); text-transform: uppercase; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.posTable td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
.posTable tr:last-child td { border-bottom: none; }
.closeBtn { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.closeBtn:hover { color: var(--bear); border-color: var(--bear); }

.alertsWrap { display: flex; flex-direction: column; }
.alertForm { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.alertFormRow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
.alertSelect { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 7px 10px; border-radius: 6px; font-size: 12px; }
.alertAddBtn { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 14px; }
.alertHint { margin-top: 10px; font-size: 11px; line-height: 1.5; }
.alertStatus { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.alertActive { background: rgba(255,176,32,0.15); color: var(--amber); }
.alertTriggered { background: rgba(20,232,160,0.15); color: var(--bull); }

.modalOverlay { position: fixed; inset: 0; background: rgba(5,6,10,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(2px); }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; width: 340px; }
.modal h3 { margin: 0 0 8px; font-family: 'Space Grotesk'; }
.modal p { color: var(--text-dim); font-size: 13px; margin: 0 0 18px; }
.modalBtns { display: flex; gap: 8px; }
.ticketModal { width: 380px; }
.ticketHead { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.ticketHead h3 { margin: 4px 0 2px; font-size: 20px; }
.typeBadge { font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 700; }
.typeBadge.call { background: rgba(20,232,160,0.15); color: var(--bull); }
.typeBadge.put { background: rgba(255,84,112,0.15); color: var(--bear); }
.iconBtn { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text-dim); padding: 6px; cursor: pointer; }
.greeksGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: var(--surface-2); border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
.greeksGrid div { display: flex; flex-direction: column; gap: 2px; }
.greeksGrid .dim { font-size: 10px; text-transform: uppercase; }

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 90vw; text-align: center; }
.toast-bull { background: var(--bull); color: #06231A; }
.toast-bear { background: var(--bear); color: #2B0710; }

@media (max-width: 900px) {
  .body { flex-direction: column; }
  .watchlist { width: 100%; max-height: 260px; }
  .tradeGrid { grid-template-columns: 1fr; }
}
`;
