// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";
import { createClient } from "@supabase/supabase-js";
import {TrendingUp, TrendingDown, RotateCcw, X, Flame, Activity, LogOut, Lock, User as UserIcon, Bell, Trash2, Maximize2, Download, Newspaper, Crosshair, Sparkles,Eye, EyeOff, LineChart, Layers, Play, GraduationCap,
} from "lucide-react";
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
const MULTIPLIER = 1;
const TRIAL_DAYS = 7;
function trialDaysRemaining(createdAtIso) {
  if (!createdAtIso) return 0;
  const start = new Date(createdAtIso).getTime();
  const elapsedDays = (Date.now() - start) / 86400000;
  return Math.max(0, Math.ceil(TRIAL_DAYS - elapsedDays));
}

const TIMEFRAMES = {
  "1m": { interval: "1m", range: "1d" },
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "5d" },
  "1H": { interval: "60m", range: "1mo" },
  "1D": { interval: "1d", range: "6mo" },
};
const TIMEFRAME_MS = { "1m": 60000, "5m": 300000, "15m": 900000, "1H": 3600000, "1D": 86400000 };

function getMarketStatus() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 = Sun, 6 = Sat
  const totalMinutes = ist.getHours() * 60 + ist.getMinutes();
  const marketOpen = 9 * 60 + 15;   // 9:15 AM
  const marketClose = 15 * 60 + 30; // 3:30 PM
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && totalMinutes >= marketOpen && totalMinutes <= marketClose;
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
      ma: sma ? sma[i] : null,
      rsi: rsi ? rsi[i] : null,
      macdLine: macd ? macd.macdLine[i] : null,
      signalLine: macd ? macd.signalLine[i] : null,
      hist: macd ? macd.hist[i] : null,
    };
  });
}

function prepLW(data) {
  const out = [];
  let lastT = -Infinity;
  for (const d of data) {
    const t = Math.floor(d.time / 1000);
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

function PriceChart({ data, showMA, syncGroupRef, pickMode, onPricePick, draftPrice, pendingLines, chartType, resetKey }) {
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
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 340,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: true, mouse: true },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: LW_COLORS.bull, downColor: LW_COLORS.bear, borderVisible: false,
      wickUpColor: LW_COLORS.bull, wickDownColor: LW_COLORS.bear,
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: LW_COLORS.accent, lineWidth: 2, priceLineVisible: true, lastValueVisible: true, visible: false,
    });
    const maSeries = chart.addSeries(LineSeries, { color: LW_COLORS.amber, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });

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
    if (chartRef.current) chartRef.current.timeScale().fitContent();
  }, [data, showMA]);

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
      <div ref={legendRef} className="lwLegend mono" />
      <div className="lwChartOuter" style={{ position: "relative" }}>
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

function RSIChart({ data, syncGroupRef }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 110,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, visible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const series = chart.addSeries(LineSeries, { color: LW_COLORS.accent, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
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

function MACDChart({ data, syncGroupRef }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const histRef = useRef(null);
  const macdRef = useRef(null);
  const signalRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 110,
      layout: { background: { color: "transparent" }, textColor: LW_COLORS.text, fontFamily: "JetBrains Mono, monospace", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { color: LW_COLORS.grid }, horzLines: { color: LW_COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: LW_COLORS.grid },
      timeScale: { borderColor: LW_COLORS.grid, timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });
    const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    const macdLine = chart.addSeries(LineSeries, { color: LW_COLORS.bull, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const signalLine = chart.addSeries(LineSeries, { color: LW_COLORS.bear, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });

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
const fmtDate = (d) => d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
const uid = () => Math.random().toString(36).slice(2, 10);

const SUPABASE_URL = "https://qfzepvorvvajqpnfwceq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_-pw1tSkYhKymxQZHNqT66w_GOPnWEQN";
const YAHOO_PROXY_URL = `${SUPABASE_URL}/functions/v1/yahoo-proxy`;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function normalizePhoneInput(phone) {
  const digits = phone.trim();
  if (digits.startsWith("+")) return digits;
  return `+91${digits.replace(/\D/g, "")}`;
}

async function registerPhoneForUser(userId, phone) {
  const p = normalizePhoneInput(phone);
  if (!/^\+\d{8,15}$/.test(p)) return { error: { message: "Enter a valid mobile number." } };
  const { error } = await supabase.from("phone_registry").insert({ phone: p, user_id: userId });
  if (error) {
    if (error.code === "23505") {
      return { error: { message: "This phone number is already linked to a Winbannu account. Please log in with your original account instead." } };
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

async function fetchYahooRange(symbol, interval, period1, period2) {
  const res = await fetch(
    `${YAHOO_PROXY_URL}?type=chart&symbol=${encodeURIComponent(symbol)}&interval=${interval}&period1=${period1}&period2=${period2}`
  );
  if (!res.ok) throw new Error("bad response");
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error("no data for this date");
  const ts = result.timestamp || [];
  const q0 = result.indicators.quote[0];
  const opens = q0.open || [], highs = q0.high || [], lows = q0.low || [], closes = q0.close || [];
  return ts
    .map((t, i) => ({ time: t * 1000, price: closes[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] }))
    .filter((p) => typeof p.price === "number" && typeof p.open === "number" && typeof p.high === "number" && typeof p.low === "number");
}

async function fetchYahoo(symbol, interval = "5m", range = "1d") {
  const res = await fetch(
    `${YAHOO_PROXY_URL}?type=chart&symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`
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

async function searchYahooSymbols(query) {
  const res = await fetch(
    `${YAHOO_PROXY_URL}?type=search&q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
  );
  if (!res.ok) throw new Error("search failed");
  const json = await res.json();
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
  const res = await fetch(
    `${YAHOO_PROXY_URL}?type=search&q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8`
  );
  if (!res.ok) throw new Error("news fetch failed");
  const json = await res.json();
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
  { icon: Activity, title: "Live Market Data", desc: "Real NSE & BSE prices, updated continuously during market hours — not delayed, not simulated ticks." },
  { icon: Layers, title: "Options Chain & Greeks", desc: "Live Black-Scholes pricing with Delta, Gamma, Theta, and Vega across every strike and expiry." },
  { icon: LineChart, title: "Charts & Indicators", desc: "Candlestick and line charts with MA, RSI, and MACD, across five timeframes." },
  { icon: Bell, title: "Price Alerts", desc: "Get notified the moment a stock crosses the price you're watching for." },
  { icon: Download, title: "Trade History Export", desc: "Download your full trade log as a CSV whenever you want to review your performance." },
];

const WHO_FOR = [
  { icon: GraduationCap, title: "Beginners", desc: "Learn what an order, a position, and a stop-loss actually feel like — before any of it involves real money." },
  { icon: Sparkles, title: "Students", desc: "Understand how markets move alongside your coursework, with ₹10,00,000 in virtual capital and nothing at stake." },
  { icon: Activity, title: "Intraday Traders", desc: "Rehearse entries and exits against live, moving prices during real market hours." },
  { icon: LineChart, title: "Swing Traders", desc: "Plan a setup, hold it across sessions, and see how your thesis actually plays out." },
  { icon: Layers, title: "Options Traders", desc: "Work through calls, puts, and spreads against live Greeks before risking real premium." },
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

const LEARN_LINKS = [
  { label: "NSE India (official)", url: "https://www.nseindia.com" },
  { label: "NSE: Candlestick & Chart Reading Module", url: "https://www.nseindia.com/static/learn/self-study-ncfm-modules-intermediate-technical-analysis-module" },
  { label: "BSE India (official)", url: "https://www.bseindia.com" },
  { label: "SEBI Investor Education", url: "https://investor.sebi.gov.in" },
];

const FAQ_ITEMS = [
  { q: "Is the money on Winbannu real?", a: "No. Every account starts with ₹10,00,000 in virtual cash. Trades, profits, and losses are simulated and have no monetary value." },
  { q: "Is the market data live or delayed?", a: "Live. Winbannu pulls real NSE & BSE prices during market hours — not a delayed feed." },
  { q: "Do I need a broker or demat account?", a: "No. Winbannu isn't a broker — just sign up with Google and a phone number, and you're trading virtual capital immediately." },
  { q: "What is Replay Mode?", a: "Pick any weekday from the last 30 days and Winbannu replays that day's real price action candle by candle, with its own separate ₹10,00,000 balance — so practicing in Replay never touches your live portfolio." },
  { q: "Is Winbannu free?", a: "Every new account gets a full 7-day Pro trial, no card required. After that, core paper trading stays free — Pro features like the options chain, alerts, and CSV export need an active subscription." },
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
      const results = await Promise.allSettled(symbols.map((s) => fetchYahoo(s)));
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
    const iv = setInterval(pull, 20000);
    return () => { cancelled = true; clearInterval(iv); };
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
    const iv = setInterval(pull, 8000);
    return () => { cancelled = true; clearInterval(iv); };
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

function MiniHeroChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
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
    const series = chart.addSeries(CandlestickSeries, {
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
    const iv = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return <div ref={containerRef} className="miniHeroChart" />;
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

function LandingPage({ themeIdx, onEnter }) {
  useEffect(() => {
    const els = document.querySelectorAll(".landingFeatureCard, .landingTrial, .whoForCard, .replaySpotlight, .mistakeRow, .faqItem");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("revealed"); }),
      { threshold: 0.15 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="landingWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>

      <LiveTicker />

      <header className="landingNav">
        <div className="authBrand" style={{ justifyContent: "flex-start" }}>
          <Flame size={22} className="brandIcon" />
          <span>WINBANNU</span>
        </div>
        <div className="landingNavActions">
          <button className="btn btnGhost landingNavBtn" onClick={() => onEnter("login")}>Log In</button>
          <button className="btn btnBull landingNavBtn" onClick={() => onEnter("register")}>Get Started Free</button>
        </div>
      </header>

      <section className="landingHero">
        <div className="landingHeroCopy">
          <div className="landingEyebrow heroReveal heroReveal-1">Free forever · 7-day Pro trial included</div>
          <h1 className="landingH1 heroReveal heroReveal-2">Practice trading NSE &amp; BSE with <span className="landingGradientText">real prices</span>. Zero risk.</h1>
          <p className="landingSub heroReveal heroReveal-3">
            WINBANNU is a paper trading terminal for Indian stocks, options, and indices. Trade with
            ₹10,00,000 in virtual cash against live market data — build real skill before you risk real money.
          </p>
          <div className="landingHeroBtns heroReveal heroReveal-4">
            <button className="btn btnBull landingCta" onClick={() => onEnter("register")}><Sparkles size={15} /> Get Started Free</button>
            <button className="btn btnGhost landingCta" onClick={() => onEnter("login")}>Log In</button>
          </div>
          <div className="heroReveal heroReveal-5">
            <MiniHeroChart />
          </div>
        </div>
        <div className="landingHeroCard heroReveal heroReveal-3">
          <div className="authBrand">
            <Flame size={20} className="brandIcon" />
            <span>WINBANNU</span>
          </div>
          <div className="authSub">Start trading in under a minute</div>
          <LiveHeroPrice />
          <ul className="upgradeList" style={{ marginTop: "18px" }}>
            <li>₹10,00,000 virtual starting balance</li>
            <li>Live NSE &amp; BSE market data</li>
            <li>No card required to sign up</li>
          </ul>
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
          <span className="landingStatLabel">Live market data</span>
        </div>
        <div className="landingStatDivider" />
        <div className="landingStatItem">
          <span className="landingStatNum">7 Days</span>
          <span className="landingStatLabel">Full Pro trial, free</span>
        </div>
      </section>

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

      <section className="replaySpotlight">
        <div className="replaySpotlightCopy">
          <div className="landingEyebrow">REPLAY MODE</div>
          <h2 className="landingH2" style={{ textAlign: "left", margin: "0 0 14px" }}>Practice Against a Real Day, Not a Guess.</h2>
          <p className="dim replaySpotlightText">
            Pick any weekday from the last 30 days and Winbannu replays that day's real NSE &amp; BSE price
            action candle by candle — as if it were happening live. Play, pause, or skip ahead at 0.5x, 1x, or 2x speed,
            and trade against it with a separate ₹10,00,000 balance that never touches your live portfolio.
          </p>
          <ul className="upgradeList">
            <li>Any weekday from the last 30 trading days</li>
            <li>Play / pause / skip to end, at three speeds</li>
            <li>A fully separate practice balance — your real portfolio is untouched</li>
          </ul>
        </div>
        <ReplaySpotlight />
      </section>

      <section className="landingFeatures">
        <h2 className="landingH2">Everything you need to learn the market</h2>
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

      <section className="mistakesSection">
        <h2 className="landingH2">Mistakes Are Part of Learning to Trade.</h2>
        <p className="dim mistakesIntro">They don't have to be expensive ones.</p>
        <div className="mistakesList">
          {MISTAKES.map((m) => (
            <div key={m.title} className="mistakeRow">
              <h3>{m.title}</h3>
              <div className="mistakeCols">
                <div className="mistakeCol mistakeColReal">
                  <span className="mistakeColLabel bear">With real money</span>
                  <p className="dim">{m.real}</p>
                </div>
                <div className="mistakeCol mistakeColPractice">
                  <span className="mistakeColLabel bull">On Winbannu</span>
                  <p className="dim">{m.practice}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landingLearn">
        <h2 className="landingH2">New to Reading Charts? Start Here.</h2>
        <p className="dim mistakesIntro">A 60-second primer on candlesticks, plus where to learn more about the exchanges themselves.</p>
        <div className="whoForGrid">
          {CANDLE_BASICS.map((c) => (
            <div key={c.title} className="whoForCard">
              <div className="whoForIcon"><c.icon size={17} /></div>
              <h3>{c.title}</h3>
              <p className="dim">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="learnLinks">
          {LEARN_LINKS.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="btn btnGhost landingCta learnLinkBtn">{l.label} →</a>
          ))}
        </div>
      </section>

      <section className="landingFaq">
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
        <h2 className="landingH2">Try every Pro feature free for 7 days</h2>
        <p className="dim landingTrialSub">Options chain, RSI &amp; MACD, price alerts, every chart timeframe, and more — no card required.</p>
        <button className="btn btnMarigold landingCta" onClick={() => onEnter("register")}>Start your free trial</button>
      </section>

      <footer className="landingFooter">
        <div className="authBrand" style={{ justifyContent: "flex-start", fontSize: "13px" }}>
          <Flame size={16} className="brandIcon" />
          <span>WINBANNU</span>
        </div>
        <div className="landingFooterLinks">
          <a href="/contact.html">Contact</a>
          <a href="/privacy.html">Privacy</a>
          <a href="/terms.html">Terms</a>
        </div>
        <div className="dim landingFooterNote">Paper trading only — no real money or securities are ever traded.</div>
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

  const normalizedPhone = () => {
    const digits = phone.trim();
    if (digits.startsWith("+")) return digits;
    // Assume a bare 10-digit Indian mobile number if no country code given
    return `+91${digits.replace(/\D/g, "")}`;
  };

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
      const p = normalizedPhone();
      if (!/^\+\d{8,15}$/.test(p)) return setError("Enter a valid mobile number.");
      if (password !== confirm) return setError("Passwords don't match.");
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const { data: signUpData, error: signUpError } = await signUpUser(uname, password);
        if (signUpError) {
          if (/registered/i.test(signUpError.message)) setError("That username is already taken.");
          else setError(signUpError.message);
          return;
        }
        const newUserId = signUpData?.user?.id;
        if (newUserId) {
          const { error: phoneErr } = await supabase
            .from("phone_registry")
            .insert({ phone: normalizedPhone(), user_id: newUserId });
          if (phoneErr) {
            if (phoneErr.code === "23505") {
              setError("This phone number is already linked to a Winbannu account. Please log in with your original account instead.");
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
            setError("Sign-in blocked pending email confirmation — turn off \"Confirm email\" in your Supabase project's Auth settings.");
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
          <span>WINBANNU</span>
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
              <UserIcon size={14} className="authIcon" />
              <input placeholder="Mobile number (e.g. 9876543210)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />
            </div>
          )}
          <div className="authField">
            <Lock size={14} className="authIcon" />
            <input type={showPw ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} />
            <button type="button" onClick={() => setShowPw((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 0 }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {mode === "register" && (
            <div className="authField">
              <Lock size={14} className="authIcon" />
              <input type={showPw ? "text" : "password"} placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          )}
          {error && <div className="authError">{error}</div>}
          <button type="submit" className="btn btnBull authSubmit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}</button>
        </form>

        <div className="authNote">
          {mode === "register"
            ? "One Winbannu account per mobile number."
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
          <span>WINBANNU</span>
        </div>
        <div className="authSub">{duplicateBlocked ? "This number's trial is already used" : "One last step"}</div>

        {duplicateBlocked ? (
          <>
            <div className="authError" style={{ marginBottom: "14px" }}>{error}</div>
            <p className="authNote" style={{ marginTop: 0, marginBottom: "18px" }}>
              This mobile number has already used its free Winbannu trial. You can still use this account by upgrading to Pro directly — no trial needed.
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
            <form onSubmit={submit}>
              <div className="authField">
                <UserIcon size={14} className="authIcon" />
                <input placeholder="Mobile number (e.g. 9876543210)" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" autoFocus />
              </div>
              {error && <div className="authError">{error}</div>}
              <button type="submit" className="btn btnBull authSubmit" disabled={busy}>{busy ? "Please wait…" : "Continue"}</button>
            </form>
            <div className="authNote">One Winbannu account per mobile number — this keeps things fair for everyone during the free trial.</div>
          </>
        )}
      </div>
    </div>
  );
}

function TradingApp({ username, userId, userEmail, initialPortfolio, isPro, isPaidPro, inTrial, trialDaysLeft, onRefreshSubscription, onLogout, themeIdx, cycleTheme }) {
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
  const [marketStatus, setMarketStatus] = useState(() => getMarketStatus());
  const marketStatusRef = useRef(marketStatus);
  useEffect(() => { marketStatusRef.current = marketStatus; }, [marketStatus]);
  useEffect(() => {
    const iv = setInterval(() => setMarketStatus(getMarketStatus()), 30000);
    return () => clearInterval(iv);
  }, []);
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
  const [customInstruments, setCustomInstruments] = useState(() => saved?.customInstruments ?? []);
  const [remoteResults, setRemoteResults] = useState([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  const allInstruments = useMemo(() => [...INSTRUMENTS, ...customInstruments], [customInstruments]);
  const allInstrumentsRef = useRef(allInstruments);
  useEffect(() => { allInstrumentsRef.current = allInstruments; }, [allInstruments]);

  const [timeframe, setTimeframe] = useState("1D");
  const [chartHistory, setChartHistory] = useState([]);
  const [indicators, setIndicators] = useState({ ma: true, rsi: false, macd: false });
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
  const [pickingPriceFromChart, setPickingPriceFromChart] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

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

  const expiries = useMemo(() => nextThursdays(4), []);
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      upsertPortfolio(userId, { cash, stockPositions, optionPositions, trades, alerts, pendingOrders, customInstruments });
    }, 600);
    return () => clearTimeout(saveTimerRef.current);
  }, [userId, cash, stockPositions, optionPositions, trades, alerts, pendingOrders, customInstruments]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const list = allInstrumentsRef.current;
      const results = await Promise.allSettled(list.map((s) => fetchYahoo(s.symbol)));
      if (cancelled) return;
      setQuotes((prev) => {
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
    const iv = setInterval(pull, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (!marketStatusRef.current.isOpen) return;
      setQuotes((prev) => {
        const next = { ...prev };
        allInstrumentsRef.current.forEach((s) => {
          const cur = prev[s.symbol];
          if (!cur) return;
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

  useEffect(() => {
    let cancelled = false;
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
    const iv = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selected, timeframe]);

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
  }, [quotes]);

  useEffect(() => {
    const orders = pendingOrdersRef.current;
    if (orders.length === 0) return;

    const remaining = [];
    const toFill = [];
    orders.forEach((o) => {
      const price = quotes[o.symbol]?.price;
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
        workingPositions[idx] = { ...workingPositions[idx], qty: workingPositions[idx].qty - fillQty };
        if (fillQty < o.qty) {
          partial.push({ ...o, filledQty: fillQty, remainingQty: o.qty - fillQty, resolution: "cancelled" });
        } else {
          filled.push({ ...o, filledQty: fillQty });
        }
      }
    });
    workingPositions = workingPositions.filter((p) => p.qty > 0);

    setPendingOrders(remaining);
    if (filled.length || partial.length || cancelled.length) {
      setCash(workingCash);
      setStockPositions(workingPositions);
    }
    filled.forEach((o) => {
      const label = `${o.kind.toUpperCase()} ${o.side.toUpperCase()} ${o.filledQty} ${displayTicker(o.symbol)} @ ${fmtMoney(o.fillPrice)}`;
      logTrade(label, o.side === "buy" ? -(o.fillPrice * o.filledQty) : o.fillPrice * o.filledQty);
      showToast(`${o.kind === "limit" ? "Limit" : "Stop"} order filled: ${o.side} ${o.filledQty} ${displayTicker(o.symbol)}`, o.side === "buy" ? "bull" : "bear");
    });
    partial.forEach((o) => {
      const label = `${o.kind.toUpperCase()} ${o.side.toUpperCase()} ${o.filledQty} ${displayTicker(o.symbol)} @ ${fmtMoney(o.fillPrice)} (partial)`;
      logTrade(label, o.side === "buy" ? -(o.fillPrice * o.filledQty) : o.fillPrice * o.filledQty);
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
    showToast(live ? `${displayTicker(result.symbol)} added to your watchlist` : `Added ${displayTicker(result.symbol)} (live price unavailable, using placeholder)`, live ? "bull" : "bear");
  };

  const q = quotes[selected];
  const meta = allInstruments.find((s) => s.symbol === selected);
  const isIndex = meta.exchange === "INDEX";
  const chartSeries = useMemo(() => buildChartSeries(chartHistory.length ? chartHistory : q.history, indicators), [chartHistory, q.history, indicators]);

  useEffect(() => { setPickingPriceFromChart(false); }, [selected, tab]);

  useEffect(() => {
    if (tab !== "news" || !isPro) return;
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
    const T = (p.expiry - Date.now()) / (365 * 24 * 3600 * 1000);
    const sigma = symMeta.iv * (1 + 0.15 * Math.abs(p.strike - spot) / spot);
    const { price } = blackScholes(spot, p.strike, T, RISK_FREE, sigma, p.type);
    return sum + price * MULTIPLIER * p.qty;
  }, 0);
  const equity = cash + stockMktValue + optionMktValue;
  const dayPnl = equity - STARTING_CASH;

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
  const logTrade = (label, amount) => {
    setTrades((prev) => [{ id: uid(), time: new Date(), label, amount }, ...prev].slice(0, 200));
  };

  const handleUpgrade = () => {
    setCheckoutBusy(true);
    startProCheckout({
      userEmail,
      onSuccess: () => {
        showToast("Complete the payment in the new tab — Pro unlocks once it's confirmed (usually within a few hours).", "bull");
        setUpgradeModalOpen(false);
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

  const placeStockOrder = (side) => {
    if (!marketStatus.isOpen) return showToast("Market is closed — orders can only be placed 9:15 AM–3:30 PM, Mon–Fri", "bear");
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
    const header = "Time,Trade,Cash Impact\n";
    const rows = trades
      .map((t) => `${t.time.toISOString()},${escapeCell(t.label)},${t.amount.toFixed(2)}`)
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `winbannu-history-${username}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Trade history exported", "bull");
  };

  const openTicket = (type, strike, expiry) => setTicket({ symbol: selected, type, strike, expiry: expiry.getTime() });

  const placeOptionOrder = (mode, qty) => {
    if (!marketStatus.isOpen) { showToast("Market is closed — orders can only be placed 9:15 AM–3:30 PM, Mon–Fri", "bear"); setTicket(null); return; }
    if (!ticket || qty <= 0) return;
    const spot = quotes[ticket.symbol]?.price ?? 0;
    const symMeta = allInstruments.find((s) => s.symbol === ticket.symbol);
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
    const symMeta = allInstruments.find((s) => s.symbol === pos.symbol);
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

  const filteredInstruments = allInstruments.filter((s) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || displayTicker(s.symbol).toLowerCase().includes(query) || s.name.toLowerCase().includes(query);
    const matchesExchange = query ? true : (exchangeFilter === "ALL" || s.exchange === exchangeFilter);
    return matchesExchange && matchesSearch;
  });

  const currentExpiry = expiries[expiryIdx];
  const chainStrikes = strikesAround(q?.price ?? meta.fallback);
  const T = currentExpiry ? (currentExpiry.getTime() - Date.now()) / (365 * 24 * 3600 * 1000) : 0;

  return (
    <div className="app" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>

      <div className="topbar">
        <div className="brand">
          <Flame size={20} className="brandIcon" />
          <span>WINBANNU</span>
          <span className="brandSub">paper terminal</span>
        </div>
        <div className="stats">
          <Stat label="Cash" value={fmtMoney(cash, 0)} />
          <Stat label="Equity" value={fmtMoney(equity, 0)} pulse={pulse} />
          <Stat label="Total P&L" value={fmtMoney(dayPnl, 0)} tone={dayPnl >= 0 ? "bull" : "bear"} />
        </div>
        <div className="topbarActions">
          <div className="userBadge">
            <UserIcon size={13} />{username}
            {isPaidPro && <span className="proBadge">PRO</span>}
            {inTrial && <span className="proBadge proBadgeTrial">TRIAL · {trialDaysLeft}D LEFT</span>}
          </div>
          {!isPaidPro && (
            <button className="upgradeBtn" onClick={() => setUpgradeModalOpen(true)}><Sparkles size={13} /> {inTrial ? "Upgrade Early" : "Upgrade to Pro"}</button>
          )}
          <button className="themeBtn" onClick={cycleTheme} title="Change background theme"><span className="themeEmoji">{THEMES[themeIdx].emoji}</span> {THEMES[themeIdx].name}</button>
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
            {filteredInstruments.length > 0 ? (
              filteredInstruments.map((s) => {
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
              })
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
            ) : search.trim().length >= 2 ? (
              <div className="wlEmpty dim">No symbols match &ldquo;{search}&rdquo; on NSE or BSE.</div>
            ) : (
              <div className="wlEmpty dim">No symbols match &ldquo;{search}&rdquo;.</div>
            )}
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
              <span className={`marketStatusBadge ${marketStatus.isOpen ? "marketOpen" : "marketClosed"}`}>{marketStatus.label}</span>
            </div>
          </div>

          <div className="tabs">
            {[["trade", "Chart & Trade"], ["chain", "Options Chain"], ["positions", "Positions"], ["orders", `Orders${pendingOrders.length ? ` (${pendingOrders.length})` : ""}`], ["alerts", `Alerts${activeAlerts ? ` (${activeAlerts})` : ""}`], ["news", "News"], ["history", "History"], ["replay", "Replay"]].map(([id, label]) => (
              <button key={id} className={`tab ${tab === id ? "tabActive" : ""}`} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>

          {tab === "trade" && (
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
                    {[["ma", "MA(20)", LW_COLORS.amber, false], ["rsi", "RSI(14)", LW_COLORS.accent, true], ["macd", "MACD", LW_COLORS.bull, true]].map(([key, label, dot, proOnly]) => {
                      const locked = proOnly && !isPro;
                      return (
                        <button
                          key={key}
                          className={`indToggle ${indicators[key] ? "indToggleActive" : ""}`}
                          onClick={() => (locked ? setUpgradeModalOpen(true) : setIndicators((prev) => ({ ...prev, [key]: !prev[key] })))}
                        >
                          {locked ? <Lock size={10} /> : <span className="indDot" style={{ background: dot }} />}{label}
                        </button>
                      );
                    })}
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
                  syncGroupRef={syncGroupRef}
                  pickMode={pickingPriceFromChart}
                  onPricePick={handleChartPricePick}
                  chartType={chartType}
                  resetKey={`${selected}-${timeframe}`}
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
                <div className="orderCard">
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
                    <label>Quantity</label>
                    <input type="number" min="1" className="qtyInput mono" value={orderQty} onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))} />
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
                    <span>{fmtMoney((orderType === "market" ? q.price : parseFloat(orderPrice) || q.price) * orderQty)}</span>
                  </div>

                  {orderType !== "market" && (
                    <div className="orderHint dim">
                      {orderType === "limit"
                        ? `Fills once ${displayTicker(selected)} trades at your price or better.`
                        : `Triggers a market order once ${displayTicker(selected)} trades through your stop price.`}
                    </div>
                  )}

                  <div className="orderBtns">
                    <button className="btn btnBull" disabled={!marketStatus.isOpen} onClick={() => (orderType === "market" ? placeStockOrder("buy") : placeConditionalOrder("buy"))}><TrendingUp size={14} /> Buy</button>
                    <button className="btn btnBear" disabled={!marketStatus.isOpen} onClick={() => (orderType === "market" ? placeStockOrder("sell") : placeConditionalOrder("sell"))}><TrendingDown size={14} /> Sell</button>
                  </div>
                  {!marketStatus.isOpen && (
                    <div className="orderHint dim" style={{ textAlign: "center", marginTop: "-6px" }}>Trading resumes when the market opens</div>
                  )}

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
            </div>
          )}

          {tab === "chain" && (
            !isPro ? (
              <ProLockPanel title="Options Chain is a Pro feature" description="Live Black-Scholes pricing and Greeks across every strike and expiry." onUpgrade={() => setUpgradeModalOpen(true)} />
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
                      <th colSpan={5} className="chainSideHead callHead">CALLS</th>
                      <th className="strikeHead">STRIKE</th>
                      <th colSpan={5} className="chainSideHead putHead">PUTS</th>
                    </tr>
                    <tr className="subhead">
                      <th title="Delta — how much the premium moves for a ₹1 move in the underlying. A call delta of 0.50 means the option gains roughly ₹0.50 for every ₹1 the stock rises.">Δ</th>
                      <th title="Theta — how much value the option loses per day, all else equal, purely from time passing. A theta of -0.80 means the premium erodes about ₹0.80 per day.">Θ</th>
                      <th title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</th>
                      <th>Premium</th><th></th>
                      <th></th>
                      <th></th><th>Premium</th>
                      <th title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</th>
                      <th title="Theta — how much value the option loses per day, all else equal, purely from time passing. A theta of -0.80 means the premium erodes about ₹0.80 per day.">Θ</th>
                      <th title="Delta — how much the premium moves for a ₹1 move in the underlying. A put delta of -0.50 means the option gains roughly ₹0.50 for every ₹1 the stock falls.">Δ</th>
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
                          <td className="mono callSide">{call.delta.toFixed(2)}</td>
                          <td className="mono callSide">{call.theta.toFixed(2)}</td>
                          <td className="mono callSide">{(sigma * 100).toFixed(0)}%</td>
                          <td className={`mono premCell callSide ${callITM ? "itmCall" : "otmCall"}`} onClick={() => openTicket("call", strike, currentExpiry)}>{fmtMoney(call.price)}</td>
                          <td className="chainGutter" />
                          <td className="strikeCell mono">{strike}</td>
                          <td className="chainGutter" />
                          <td className={`mono premCell putSide ${putITM ? "itmPut" : "otmPut"}`} onClick={() => openTicket("put", strike, currentExpiry)}>{fmtMoney(put.price)}</td>
                          <td className="mono putSide">{(sigma * 100).toFixed(0)}%</td>
                          <td className="mono putSide">{put.theta.toFixed(2)}</td>
                          <td className="mono putSide">{put.delta.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="chainNote">Premiums &amp; Greeks are modeled live from the underlying price via Black-Scholes — not a live exchange options feed. Quantities are per unit, not exchange lot size.</div>
              {!marketStatus.isOpen && (
                <div className="chainNote" style={{ color: "var(--bear)", fontWeight: 600 }}>Market Closed — you can browse the chain, but new orders are disabled until 9:15 AM Mon–Fri.</div>
              )}
            </div>
            )
          )}

          {tab === "positions" && (
            <div className="posWrap">
              {allocationItems.length > 0 && (
                <div className="allocWrap">
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
                          <td className="orderRowActions">
                            <button className="closeBtn" onClick={() => { setSelected(p.symbol); setTab("trade"); }}><LineChart size={12} /> Chart</button>
                            <button className="closeBtn" onClick={() => startStopLossFromPosition(p)}><Crosshair size={12} /> Stop-Loss</button>
                            <button className="closeBtn" onClick={() => closeStockPosition(p)}>Close</button>
                          </td>
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
                      const symMeta = allInstruments.find((s) => s.symbol === p.symbol);
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
                          <td className="orderRowActions">
                            <button className="closeBtn" onClick={() => { setSelected(p.symbol); setTab("trade"); }}><LineChart size={12} /> Chart</button>
                            <button className="closeBtn" onClick={() => closeOptionPosition(p)}>Close</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "orders" && (
            <div className="ordersWrap">
              {pendingOrders.length === 0 ? (
                <div className="empty">No pending orders. Place a limit or stop order from the Chart &amp; Trade tab.</div>
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
                          <button className="closeBtn" onClick={() => cancelOrder(o.id)}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="dim ordersHint">Orders are checked against live prices as they update and fill automatically — no need to keep this tab open.</div>
            </div>
          )}

          {tab === "alerts" && (
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
            )
          )}

          {tab === "news" && (
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

          {tab === "replay" && (
            <div className="replayWrap">
              <div className="replayControls">
                <div className="replayControlsRow">
                  <div className="replayField">
                    <label>Symbol</label>
                    <select className="alertSelect" value={replaySymbol} onChange={(e) => setReplaySymbol(e.target.value)}>
                      {allInstruments.map((s) => (
                        <option key={s.symbol} value={s.symbol}>{displayTicker(s.symbol)} ({s.exchange})</option>
                      ))}
                    </select>
                  </div>
                  <div className="replayField">
                    <label>Date</label>
                    <input
                      type="date"
                      className="qtyInput mono"
                      value={replayDate}
                      min={thirtyDaysAgoISO}
                      max={todayISO}
                      onChange={(e) => setReplayDate(e.target.value)}
                    />
                  </div>
                  <button className="btn btnBull replayLoadBtn" onClick={loadReplayDay} disabled={replayLoading}>
                    {replayLoading ? "Loading…" : "Load Day"}
                  </button>
                  <button className="btn btnGhost replayLoadBtn" onClick={() => setTab("trade")}>
                    ← Back to Live
                  </button>
                </div>
                <div className="dim replayHint">
                  Pick any weekday in the last 30 days. The chart replays that day's real price action candle by candle — practice trading as if it were happening live, with a separate {fmtMoney(REPLAY_CASH, 0)} practice balance that never touches your real portfolio.
                </div>
                {replayError && <div className="authError" style={{ marginTop: "8px" }}>{replayError}</div>}
              </div>

              {replayFullHistory.length > 0 && (
                <>
                  <div className="replayStats">
                    <Stat label="Replay Cash" value={fmtMoney(replayCash, 0)} />
                    <Stat label="Replay Equity" value={fmtMoney(replayEquity, 0)} />
                    <Stat label="Replay P&L" value={fmtMoney(replayEquity - REPLAY_CASH, 0)} tone={replayEquity - REPLAY_CASH >= 0 ? "bull" : "bear"} />
                    <button className="resetBtn replayResetBtn" onClick={resetReplaySession}><RotateCcw size={13} /> Reset Session</button>
                  </div>

                  <div className="tradeGrid">
                    <div className="chartCard">
                      <div className="chartHead">
                        <div className="tfTabs">
                          <button className={`tfTab ${replayPlaying ? "" : "tfTabActive"}`} onClick={() => setReplayPlaying(false)} disabled={!replayPlaying}>
                            <Lock size={0} />Pause
                          </button>
                          <button className={`tfTab ${replayPlaying ? "tfTabActive" : ""}`} onClick={() => setReplayPlaying(true)} disabled={replayDone}>
                            Play
                          </button>
                          <button className="tfTab" onClick={() => setReplayVisibleCount(replayFullHistory.length)} disabled={replayDone}>
                            Skip to End
                          </button>
                        </div>
                        <div className="indToggles">
                          <button className={`indToggle ${replayShowMA ? "indToggleActive" : ""}`} onClick={() => setReplayShowMA((v) => !v)}>
                            <span className="indDot" style={{ background: LW_COLORS.amber }} />MA(20)
                          </button>
                          <span style={{ width: "10px" }} />
                          {[["slow", "0.5x"], ["normal", "1x"], ["fast", "2x"]].map(([key, label]) => (
                            <button key={key} className={`indToggle ${replaySpeed === key ? "indToggleActive" : ""}`} onClick={() => setReplaySpeed(key)}>{label}</button>
                          ))}
                        </div>
                      </div>

                      <PriceChart
                        data={replayChartSeries}
                        showMA={replayShowMA}
                        syncGroupRef={replaySyncGroupRef}
                        pickMode={false}
                        onPricePick={() => {}}
                        chartType="candle"
                        resetKey={`${replaySymbol}-${replayDate}`}
                        draftPrice={null}
                        pendingLines={[]}
                      />

                      <div className="chartHint dim">
                        Candle {replayVisibleCount} of {replayFullHistory.length}{replayDone ? " — day complete" : ""}
                      </div>
                    </div>

                    <div className="orderCard">
                      <div className="orderCardHead">
                        <h3>Replay Order</h3>
                        <span className="orderCardSym mono">{displayTicker(replaySymbol)}</span>
                      </div>
                      <div className="orderRow">
                        <label>Quantity</label>
                        <input type="number" min="1" className="qtyInput mono" value={replayQty} onChange={(e) => setReplayQty(Math.max(1, parseInt(e.target.value) || 1))} />
                      </div>
                      <div className="orderEst mono">
                        <span className="dim">Current price</span>
                        <span>{replayCurrentPrice != null ? fmtMoney(replayCurrentPrice) : "—"}</span>
                      </div>
                      <div className="orderBtns">
                        <button className="btn btnBull" onClick={() => placeReplayOrder("buy")}><TrendingUp size={14} /> Buy</button>
                        <button className="btn btnBear" onClick={() => placeReplayOrder("sell")}><TrendingDown size={14} /> Sell</button>
                      </div>
                      {replayPos ? (
                        <div className="posSummary">
                          <div className="posSummaryRow">
                            <span className="dim">Held</span>
                            <span className="mono">{replayPos.qty} sh · avg {fmtMoney(replayPos.avgPrice)}</span>
                          </div>
                          <div className="posSummaryRow">
                            <span className="dim">Unrealized P&amp;L</span>
                            <span className={`mono ${replayCurrentPrice != null && (replayCurrentPrice - replayPos.avgPrice) >= 0 ? "bull" : "bear"}`}>
                              {replayCurrentPrice != null ? fmtMoney((replayCurrentPrice - replayPos.avgPrice) * replayPos.qty) : "—"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="held mono">Held: 0 shares</div>
                      )}
                    </div>
                  </div>

                  {replayTrades.length > 0 && (
                    <div className="mt">
                      <h3>Replay Trade Log</h3>
                      <table className="posTable">
                        <thead><tr><th>Trade</th><th>Cash Impact</th></tr></thead>
                        <tbody>
                          {replayTrades.map((t) => (
                            <tr key={t.id}>
                              <td className="mono">{t.label}</td>
                              <td className={`mono ${t.amount >= 0 ? "bull" : "bear"}`}>{fmtMoney(t.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
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
          heldQty={optionPositions.find((p) => p.symbol === ticket.symbol && p.type === ticket.type && p.strike === ticket.strike && p.expiry === ticket.expiry)?.qty ?? 0}
        />
      )}

      {editingOrder && (
        <div className="modalOverlay" onClick={() => setEditingOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
          <div className="modal upgradeModal" onClick={(e) => e.stopPropagation()}>
            <h3><Sparkles size={17} className="proBadgeIcon" /> Upgrade to Pro</h3>
            <p>Everything in Free, plus:</p>
            <ul className="upgradeList">
              <li>Limit &amp; stop-loss orders</li>
              <li>RSI, MACD, and every chart timeframe</li>
              <li>Options chain with live Greeks</li>
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

function OptionTicket({ ticket, quotes, instruments, onClose, onSubmit, heldQty, marketOpen }) {
  const [qty, setQty] = useState(1);
  const spot = quotes[ticket.symbol]?.price ?? 0;
  const symMeta = instruments.find((s) => s.symbol === ticket.symbol);
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
          <div><span className="dim" title="Delta — how much this option's premium moves for a ₹1 move in the underlying (e.g. 0.50 = about ₹0.50 of premium change per ₹1 move).">Delta</span>{greeks.delta.toFixed(3)}</div>
          <div><span className="dim" title="Gamma — how fast Delta itself changes as the underlying moves. Higher gamma means Delta shifts quickly, so risk can change fast near expiry or at-the-money.">Gamma</span>{greeks.gamma.toFixed(4)}</div>
          <div><span className="dim" title="Theta — how much premium this option loses per day purely from time passing, all else equal (e.g. -0.80 = about ₹0.80 lost per day).">Theta</span>{greeks.theta.toFixed(3)}</div>
          <div><span className="dim" title="Vega — how much the premium changes for a 1 percentage-point change in implied volatility. Higher vega means the price is more sensitive to shifts in market expectations.">Vega</span>{greeks.vega.toFixed(3)}</div>
          <div><span className="dim" title="Implied Volatility (IV) — the market's expectation of how much the underlying will swing, expressed as an annualized percentage. Higher IV means a pricier option.">IV</span>{(sigma * 100).toFixed(1)}%</div>
        </div>

        <div className="orderRow">
          <label>Quantity</label>
          <input type="number" min="1" className="qtyInput mono" value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
        <div className="orderEst mono">Est. total: <span>{fmtMoney(greeks.price * MULTIPLIER * qty)}</span> · Held: {heldQty}</div>

        <div className="orderBtns">
          <button className="btn btnBull" disabled={!marketOpen} onClick={() => onSubmit("buy", qty)}>Buy to Open</button>
          <button className="btn btnBear" disabled={!marketOpen} onClick={() => onSubmit("sell", qty)}>Sell to Close</button>
        </div>
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
        <div className="authBrand"><Flame size={22} className="brandIcon" /><span>WINBANNU</span></div>
        <div className="authSub">{label}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [themeIdx, setThemeIdx] = useState(() => loadThemeIdx());
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState("login");
  const [phoneStatus, setPhoneStatus] = useState("checking");

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

  const refreshSubscription = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setSubscription(await fetchSubscription(userId));
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
        onBack={() => setShowAuthForm(false)}
      />
    ) : (
      <LandingPage
        themeIdx={themeIdx}
        onEnter={(mode) => { setAuthInitialMode(mode); setShowAuthForm(true); }}
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
  if (portfolioLoading || !portfolioData || !subscription) return <SplashScreen label="Loading your portfolio…" themeIdx={themeIdx} />;

  const username = session.user.user_metadata?.username || session.user.email.split("@")[0];
  const isPaidPro = subscription.status === "active";
  const daysLeftInTrial = trialDaysRemaining(session.user.created_at);
  const inTrial = !isPaidPro && daysLeftInTrial > 0;
  const isPro = isPaidPro || inTrial;

  return (
    <TradingApp
      key={session.user.id}
      username={username}
      userId={session.user.id}
      userEmail={session.user.email}
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

.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 20px; flex-wrap: wrap; }
.tab { background: none; border: none; color: var(--text-dim); padding: 10px 16px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
.tab:hover { color: var(--text); }
.tabActive { color: var(--text); border-bottom: 2px solid var(--accent); }

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
.fitBtn { margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--border); border-radius: 0 6px 6px 0; }
.chartTypeBtn { margin-left: 6px; }
.subChart { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 10px; }
.subChartLabel { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.6px; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.chartHint { margin-top: 10px; font-size: 10px; text-align: center; }
.chartHintActive { margin-top: 10px; font-size: 11px; text-align: center; color: var(--amber); font-weight: 600; }
.lwChartPicking { cursor: crosshair; }
.lwWrap { position: relative; }
.lwChart { width: 100%; }
.lwLegend { position: absolute; top: 4px; left: 4px; z-index: 5; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0.2px; color: var(--text-dim); background: rgba(18,23,34,0.75); padding: 3px 9px; border-radius: 6px; pointer-events: none; }
.drawToolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.drawToolBtn { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim); padding: 5px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
.drawToolBtn:hover { color: var(--text); border-color: var(--accent); }
.drawToolBtnActive { background: var(--accent); color: white; border-color: var(--accent); }
.drawToolHint { font-size: 11px; margin-left: 4px; }
.lwChartOuter { position: relative; }
.lwDrawOverlay { position: absolute; top: 0; left: 0; pointer-events: none; }
.lwChart a[href*="tradingview.com"] { display: none !important; }

.orderCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; height: fit-content; transition: box-shadow 0.2s ease; }
.orderCard:hover { box-shadow: 0 10px 30px rgba(0,0,0,0.22); }
.orderCard h3 { margin: 0; font-family: 'Instrument Sans'; font-size: 14px; }
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

.posWrap h3, .histWrap h3 { font-family: 'Instrument Sans'; font-size: 14px; margin: 0 0 10px; }
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
.modal h3 { margin: 0 0 8px; font-family: 'Instrument Sans'; }
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
.tickerItem { display: inline-block; margin-right: 36px; font-size: 12px; color: var(--text-dim); }
.tickerItem b { color: var(--text); font-weight: 600; margin-right: 4px; }
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
.landingWrap .dim { color: #A9B4C9 !important; }
.landingWrap .landingSub { color: #C7D0E2 !important; }
.landingWrap .landingHeroCard,
.landingWrap .landingFeatureCard {
  color: var(--text);
}
.landingWrap .landingHeroCard .dim,
.landingWrap .landingFeatureCard .dim {
  color: var(--text-dim) !important;
}
.landingWrap .landingFooterLinks a { color: #C7D0E2 !important; }
.landingWrap .landingFooterLinks a:hover { color: #FFFFFF !important; }
.landingWrap .landingFooterNote { color: #A9B4C9 !important; }
.landingNav { display: flex; align-items: center; justify-content: space-between; padding: 20px 40px; border-bottom: 1px solid rgba(255,255,255,0.14); flex-wrap: wrap; gap: 12px; position: relative; z-index: 1; }
.landingNavActions { display: flex; align-items: center; gap: 10px; }
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

.landingH2 { font-family: 'Instrument Sans', sans-serif; font-weight: 700; font-size: 26px; letter-spacing: -0.3px; text-align: center; margin: 0 0 36px; }
.landingFeatures { padding: 70px 40px; max-width: 1180px; margin: 0 auto; }
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
.landingFooterLinks { display: flex; gap: 20px; }
.landingFooterLinks a { color: var(--text-dim); font-size: 12.5px; text-decoration: none; }
.landingFooterLinks a:hover { color: var(--text); }
.landingFooterNote { font-size: 11.5px; width: 100%; text-align: center; order: 3; }

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
`;
