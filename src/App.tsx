// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo } from "react";
import { createChart, CrosshairMode, CandlestickSeries, LineSeries, HistogramSeries } from "lightweight-charts";
import { createClient } from "@supabase/supabase-js";
import {TrendingUp, TrendingDown, RotateCcw, X, Flame, Activity, LogOut, Lock, User as UserIcon, Bell, Trash2, Maximize2, Download, Newspaper, Crosshair, Sparkles,Eye, EyeOff,
} from "lucide-react";
declare global { interface Window { Razorpay: any; } }
/* ---------------- background themes ---------------- */
const THEMES = [
  { name: "Midnight", vars: { "--bg": "#0A0D14", "--surface": "#121722", "--surface-2": "#1A2130", "--border": "#232B3D", "--text": "#E7ECF6", "--text-dim": "#8B96AA" } },
  { name: "Slate", vars: { "--bg": "#0E1013", "--surface": "#16181C", "--surface-2": "#1F2226", "--border": "#2B2F35", "--text": "#ECEDEF", "--text-dim": "#9498A0" } },
  { name: "Ocean", vars: { "--bg": "#061821", "--surface": "#0C2733", "--surface-2": "#123542", "--border": "#1D4E5E", "--text": "#E3F4F8", "--text-dim": "#7FA9B5" } },
  { name: "Plum", vars: { "--bg": "#140B1E", "--surface": "#1E1129", "--surface-2": "#291736", "--border": "#3C2450", "--text": "#F1E9FA", "--text-dim": "#A78FC2" } },
  { name: "Daylight", vars: { "--bg": "#F3F4F7", "--surface": "#FFFFFF", "--surface-2": "#EEF0F4", "--border": "#DADDE3", "--text": "#12151C", "--text-dim": "#5B6270" } },
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

const displayTicker = (s) => s.replace(/\.(NS|BO)$/, "").replace(/^\^/, "");
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

function PriceChart({ data, showMA, syncGroupRef, pickMode, onPricePick, draftPrice, pendingLines, chartType }) {
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const lineRef = useRef(null);
  const maRef = useRef(null);
  const draftLineRef = useRef(null);
  const pendingLinesRef = useRef(new Map());
  const pickModeRef = useRef(pickMode);
  const onPricePickRef = useRef(onPricePick);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);
  useEffect(() => { onPricePickRef.current = onPricePick; }, [onPricePick]);

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
      if (!pickModeRef.current || !param.point) return;
      const activeSeries = candleRef.current?.options().visible ? candleRef.current : lineRef.current;
      if (!activeSeries) return;
      const price = activeSeries.coordinateToPrice(param.point.y);
      if (price != null && onPricePickRef.current) onPricePickRef.current(price);
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    lineRef.current = lineSeries;
    maRef.current = maSeries;
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

  return (
    <div className="lwWrap">
      <div ref={legendRef} className="lwLegend mono" />
      <div ref={containerRef} className={`lwChart ${pickMode ? "lwChartPicking" : ""}`} />
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

let razorpayScriptPromise = null;
function loadRazorpayScript() {
  if (razorpayScriptPromise) return razorpayScriptPromise;
  razorpayScriptPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

async function startProCheckout({ userEmail, onSuccess, onError }) {
  try {
    const { data, error } = await supabase.functions.invoke("create-razorpay-subscription");
    if (error || data?.error) throw new Error(data?.error || error?.message || "Could not start checkout");

    await loadRazorpayScript();
    const rzp = new window.Razorpay({
      key: data.keyId,
      subscription_id: data.subscriptionId,
      name: "TRADE FREE Pro",
      description: "Monthly subscription",
      prefill: { email: userEmail },
      theme: { color: "#7B61FF" },
      handler: () => onSuccess(),
      modal: { ondismiss: () => onError("Checkout closed before completing payment") },
    });
    rzp.on("payment.failed", () => onError("Payment failed"));
    rzp.open();
  } catch (e) {
    onError(e.message || "Could not start checkout");
  }
}

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

async function searchYahooSymbols(query) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
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
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=8`
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

function AuthGate({ themeIdx, cycleTheme }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const uname = username.trim();
    if (!uname || !password) return setError("Enter a username and password.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (!/^[a-zA-Z0-9_]+$/.test(uname)) return setError("Username can only use letters, numbers, and underscores.");

    setBusy(true);
    try {
      if (mode === "register") {
        if (password !== confirm) return setError("Passwords don't match.");
        const { error: signUpError } = await signUpUser(uname, password);
        if (signUpError) {
          if (/registered/i.test(signUpError.message)) setError("That username is already taken.");
          else setError(signUpError.message);
        }
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
        <span className="themeEmoji">🎨</span> {THEMES[themeIdx].name}
      </button>
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

        <div className="authNote">Your account and portfolio are saved on the server — log in with the same username and password on any device to pick up right where you left off.</div>
      </div>
    </div>
  );
}

function TradingApp({ username, userId, userEmail, initialPortfolio, isPro, onRefreshSubscription, onLogout, themeIdx, cycleTheme }) {
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
        showToast("Payment received — activating Pro…", "bull");
        setUpgradeModalOpen(false);
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          await onRefreshSubscription();
          if (attempts >= 10) { clearInterval(poll); setCheckoutBusy(false); }
        }, 2000);
        setTimeout(() => { clearInterval(poll); setCheckoutBusy(false); }, 20000);
      },
      onError: (msg) => {
        setCheckoutBusy(false);
        showToast(msg, "bear");
      },
    });
  };

  useEffect(() => { if (isPro) setCheckoutBusy(false); }, [isPro]);

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
    a.download = `trade-free-history-${username}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Trade history exported", "bull");
  };

  const openTicket = (type, strike, expiry) => setTicket({ symbol: selected, type, strike, expiry: expiry.getTime() });

  const placeOptionOrder = (mode, qty) => {
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
          <span>TRADE FREE</span>
          <span className="brandSub">paper terminal</span>
        </div>
        <div className="stats">
          <Stat label="Cash" value={fmtMoney(cash, 0)} />
          <Stat label="Equity" value={fmtMoney(equity, 0)} pulse={pulse} />
          <Stat label="Total P&L" value={fmtMoney(dayPnl, 0)} tone={dayPnl >= 0 ? "bull" : "bear"} />
        </div>
        <div className="topbarActions">
          <div className="userBadge"><UserIcon size={13} />{username}{isPro && <span className="proBadge">PRO</span>}</div>
          {!isPro && (
            <button className="upgradeBtn" onClick={() => setUpgradeModalOpen(true)}><Sparkles size={13} /> Upgrade to Pro</button>
          )}
          <button className="themeBtn" onClick={cycleTheme} title="Change background theme"><span className="themeEmoji">🎨</span> {THEMES[themeIdx].name}</button>
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
            {[["trade", "Chart & Trade"], ["chain", "Options Chain"], ["positions", "Positions"], ["orders", `Orders${pendingOrders.length ? ` (${pendingOrders.length})` : ""}`], ["alerts", `Alerts${activeAlerts ? ` (${activeAlerts})` : ""}`], ["news", "News"], ["history", "History"]].map(([id, label]) => (
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
                          <td><button className="closeBtn" onClick={() => closeOptionPosition(p)}>Close</button></td>
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
        </div>
      </div>

      {ticket && (
        <OptionTicket
          ticket={ticket}
          quotes={quotes}
          instruments={allInstruments}
          onClose={() => setTicket(null)}
          onSubmit={placeOptionOrder}
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
              <button className="btn btnMarigold" onClick={handleUpgrade} disabled={checkoutBusy}>{checkoutBusy ? "Processing…" : "Subscribe — ₹99/mo"}</button>
            </div>
            <p className="dim upgradeFinePrint">Billed monthly via Razorpay. Cancel anytime from Razorpay's subscription management.</p>
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

function OptionTicket({ ticket, quotes, instruments, onClose, onSubmit, heldQty }) {
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

function SplashScreen({ label, themeIdx }) {
  return (
    <div className="authWrap" style={THEMES[themeIdx].vars}>
      <style>{CSS}</style>
      <div className="authCard splashCard">
        <div className="authBrand"><Flame size={22} className="brandIcon" /><span>TRADE FREE</span></div>
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
  if (!session) return <AuthGate themeIdx={themeIdx} cycleTheme={cycleTheme} />;
  if (portfolioLoading || !portfolioData || !subscription) return <SplashScreen label="Loading your portfolio…" themeIdx={themeIdx} />;

  const username = session.user.user_metadata?.username || session.user.email.split("@")[0];
  const isPro = subscription.status === "active";

  return (
    <TradingApp
      key={session.user.id}
      username={username}
      userId={session.user.id}
      userEmail={session.user.email}
      initialPortfolio={portfolioData}
      isPro={isPro}
      onRefreshSubscription={refreshSubscription}
      onLogout={signOutUser}
      themeIdx={themeIdx}
      cycleTheme={cycleTheme}
    />
  );
}

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

.authWrap { position: relative; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.authCard { width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.splashCard { text-align: center; padding: 40px 28px; }
.splashCard .authSub { margin: 10px 0 0; }
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
.proBadge { background: var(--amber); color: #241800; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 999px; letter-spacing: 0.4px; }
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
.mainHead h1 { font-family: 'Space Grotesk', sans-serif; font-size: 26px; margin: 0; }
.mainHeadName { color: var(--text-dim); font-size: 13px; }
.mainHeadPrice { display: flex; flex-direction: column; align-items: flex-end; }
.bigPrice { font-size: 22px; font-weight: 700; }
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

.orderCard { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px; height: fit-content; transition: box-shadow 0.2s ease; }
.orderCard:hover { box-shadow: 0 10px 30px rgba(0,0,0,0.22); }
.orderCard h3 { margin: 0; font-family: 'Space Grotesk'; font-size: 14px; }
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
.lockPanel { background: var(--surface); border: 1px dashed var(--border); border-radius: 12px; padding: 44px 24px; text-align: center; }
.lockPanelIcon { width: 44px; height: 44px; border-radius: 50%; background: var(--surface-2); color: var(--amber); display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; }
.lockPanel h3 { margin-bottom: 8px; }
.lockPanel p { max-width: 34ch; margin: 0 auto 18px; font-size: 13px; line-height: 1.6; }
.lockPanelBtn { flex: none; display: inline-flex; padding: 9px 18px; }

.posWrap h3, .histWrap h3 { font-family: 'Space Grotesk'; font-size: 14px; margin: 0 0 10px; }
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
.alertStatus { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.alertActive { background: rgba(255,176,32,0.15); color: var(--amber); }
.alertTriggered { background: rgba(20,232,160,0.15); color: var(--bull); }

.modalOverlay { position: fixed; inset: 0; background: rgba(5,6,10,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(2px); }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 22px; width: 340px; }
.modal h3 { margin: 0 0 8px; font-family: 'Space Grotesk'; }
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

.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 90vw; text-align: center; }
.toast-bull { background: var(--bull); color: #06231A; }
.toast-bear { background: var(--bear); color: #2B0710; }

@media (max-width: 900px) {
  .body { flex-direction: column; }
  .watchlist { width: 100%; max-height: 260px; }
  .tradeGrid { grid-template-columns: 1fr; }
}
`;
