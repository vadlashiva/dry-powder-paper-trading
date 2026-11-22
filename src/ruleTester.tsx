// @ts-nocheck
// Rule tester: write an intraday rule (opening-candle breakout, EMA cross, RSI bounce or
// previous-day high/low break), then test it on months of real 5-minute index candles from
// the user's own broker connection. Every trade is checked on 5-minute bars, so it is clear
// whether the stop or the target came first.
import { track } from "./growth";
import { useEffect, useMemo, useRef, useState } from "react";

const INDEXES = [["^NSEI", "NIFTY"], ["^NSEBANK", "BANKNIFTY"], ["^BSESN", "SENSEX"]];
const PERIODS = [[1, "1 month"], [3, "3 months"], [6, "6 months"], [12, "1 year"]];
const IST = 19800000;
const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const fmt = (x, d = 2) => (x == null || isNaN(x) ? "–" : x.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const plus = (x, d = 1) => (x > 0 ? "+" : "") + fmt(x, d);
const tone = (x) => (x > 0 ? "rtPos" : x < 0 ? "rtNeg" : "");

export const BASE = { tf: 15, dir: "both", setup: "orb", trig: "second", maxR: 0, useTrend: false, et: 50, win1: "09:15", win2: "14:30", maxT: 1,
  stop: "orb", sn: 3, an: 14, am: 1.5, pts: 40, pct: 0.3, rr: 2, noTgt: false, exitT: "15:15", worst: true, cost: 0, ef: 9, es: 26, rn: 14, ros: 30, rob: 70 };
const PRESETS = [
  ["orb5", "5-min opening candle breakout", { tf: 5 }],
  ["orb15", "15-min opening candle breakout", {}],
  ["orb30", "30-min opening candle breakout", { tf: 30 }],
  ["ema", "EMA 9 / 26 crossover", { setup: "ema", stop: "swing", maxT: 3 }],
  ["emaTrend", "EMA cross + 50-EMA trend filter", { setup: "ema", stop: "swing", maxT: 3, useTrend: true }],
  ["rsi", "RSI 30 / 70 bounce (5-min)", { tf: 5, setup: "rsi", stop: "atr", rr: 1.5, maxT: 3, win1: "09:30" }],
  ["pdh", "Previous-day high / low breakout", { setup: "pdh", stop: "signal" }],
];

/* ---------------- data ---------------- */
// [{ d: "YYYY-MM-DD", b: [["09:15", o, h, l, c], ...] }] from 5-minute candles
export function groupDays(rows) {
  const days = new Map();
  for (const r of rows) {
    const ist = new Date(r.time + IST).toISOString();
    const d = ist.slice(0, 10), t = ist.slice(11, 16);
    if (t < "09:15" || t > "15:29") continue;
    if (!days.has(d)) days.set(d, new Map());
    days.get(d).set(t, [t, r.open, r.high, r.low, r.close]);
  }
  return [...days.keys()].sort().map((d) => ({ d, b: [...days.get(d).values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) })).filter((x) => x.b.length >= 6);
}
const aggCache = new WeakMap();
function agg(day, tf) {
  if (tf <= 5) return day.b;
  let m = aggCache.get(day); if (!m) { m = {}; aggCache.set(day, m); }
  if (m[tf]) return m[tf];
  const out = [];
  for (const k of day.b) {
    const lab = hhmm(555 + Math.floor((mins(k[0]) - 555) / tf) * tf), o = out[out.length - 1];
    if (o && o[0] === lab) { o[2] = Math.max(o[2], k[2]); o[3] = Math.min(o[3], k[3]); o[4] = k[4]; }
    else out.push([lab, k[1], k[2], k[3], k[4]]);
  }
  return (m[tf] = out);
}

/* ---------------- indicators ---------------- */
function ema(src, n) { const a = 2 / (n + 1), o = []; let e = null; src.forEach((v, i) => { e = e == null ? v : e + a * (v - e); o[i] = i >= n - 1 ? e : null; }); return o; }
function rsi(src, n) {
  const o = new Array(src.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
    if (i <= n) { g += up / n; l += dn / n; if (i === n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return o;
}
function atr(S, n) {
  const o = new Array(S.length).fill(null); let a = 0;
  S.forEach((k, i) => { const pc = i ? S[i - 1][4] : k[1]; const tr = Math.max(k[2] - k[3], Math.abs(k[2] - pc), Math.abs(k[3] - pc));
    if (i < n) { a += tr / n; if (i === n - 1) o[i] = a; } else { a = (a * (n - 1) + tr) / n; o[i] = a; } });
  return o;
}
function buildSeries(days, s) {
  const S = [], off = {};
  days.forEach((d) => { off[d.d] = S.length; agg(d, s.tf).forEach((k) => S.push(k)); });
  const C = S.map((k) => k[4]);
  return { S, off, fast: ema(C, s.ef), slow: ema(C, s.es), trend: ema(C, s.et), rsi: rsi(C, s.rn), atr: atr(S, s.an) };
}

/* ---------------- engine ---------------- */
function signalAt(s, I, B, i, g, ctx) {
  const c = B[i]; let side = 0;
  if (s.setup === "orb") { if (i < 1 || (s.trig === "second" && i !== 1)) return 0; side = c[4] > ctx.H ? 1 : c[4] < ctx.L ? -1 : 0; }
  else if (s.setup === "ema") { const f0 = I.fast[g - 1], s0 = I.slow[g - 1], f1 = I.fast[g], s1 = I.slow[g];
    if ([f0, s0, f1, s1].some((v) => v == null)) return 0; side = f0 <= s0 && f1 > s1 ? 1 : f0 >= s0 && f1 < s1 ? -1 : 0; }
  else if (s.setup === "rsi") { const r0 = I.rsi[g - 1], r1 = I.rsi[g]; if (r0 == null || r1 == null) return 0;
    side = r0 < s.ros && r1 >= s.ros ? 1 : r0 > s.rob && r1 <= s.rob ? -1 : 0; }
  else if (s.setup === "pdh") { if (ctx.PDH == null) return 0; const pc = i === 0 ? c[1] : I.S[g - 1][4];
    side = c[4] > ctx.PDH && pc <= ctx.PDH ? 1 : c[4] < ctx.PDL && pc >= ctx.PDL ? -1 : 0; }
  if ((side > 0 && s.dir === "short") || (side < 0 && s.dir === "long")) return 0;
  if (side && s.useTrend) { const t = I.trend[g]; if (t == null || (side > 0 && c[4] <= t) || (side < 0 && c[4] >= t)) return 0; }
  return side;
}
function stopFor(s, I, B, i, g, side, entry, ctx) {
  const c = B[i];
  switch (s.stop) {
    case "orb": return side > 0 ? ctx.L : ctx.H;
    case "orbmid": return (ctx.H + ctx.L) / 2;
    case "signal": return side > 0 ? c[3] : c[2];
    case "swing": { let lo = Infinity, hi = -Infinity; for (let j = Math.max(0, g - s.sn + 1); j <= g; j++) { lo = Math.min(lo, I.S[j][3]); hi = Math.max(hi, I.S[j][2]); } return side > 0 ? lo : hi; }
    case "atr": { const a = I.atr[g]; return a == null ? null : entry - side * a * s.am; }
    case "points": return entry - side * s.pts;
    case "pct": return entry * (1 - (side * s.pct) / 100);
    default: return null;
  }
}
function dayRun(day, s, I, prev) {
  const B = agg(day, s.tf), b5 = day.b;
  if (B.length < 3) return { trades: [], skip: "not enough candles" };
  if (B[0][0] !== "09:15") return { trades: [], skip: "no 9:15 candle" };
  const ctx = { H: B[0][2], L: B[0][3], PDH: prev ? Math.max(...prev.b.map((k) => k[2])) : null, PDL: prev ? Math.min(...prev.b.map((k) => k[3])) : null };
  if (s.setup === "orb" && s.maxR > 0 && ctx.H - ctx.L > s.maxR) return { trades: [], skip: "1st candle too wide", ctx };
  const g0 = I.off[day.d], trades = []; let busy = "00:00", why = "no signal";
  for (let i = 0; i < B.length && trades.length < s.maxT; i++) {
    const c = B[i], closeT = hhmm(mins(c[0]) + s.tf), g = g0 + i;
    if (c[0] < s.win1) continue; if (c[0] > s.win2 || closeT > s.exitT) break;
    if (trades.length && closeT <= busy) continue;
    const side = signalAt(s, I, B, i, g, ctx); if (!side) continue;
    const entry = c[4], stop = stopFor(s, I, B, i, g, side, entry, ctx), risk = stop == null ? NaN : (entry - stop) * side;
    if (!(risk > 0)) { why = "stop on wrong side"; continue; }
    const target = s.noTgt ? null : entry + side * risk * s.rr;
    let exit = null, reason = "", exT = "";
    for (const k of b5) {
      if (k[0] < closeT) continue;
      if (k[0] >= s.exitT) { exit = k[1]; reason = "time"; exT = k[0]; break; }
      const hitS = side > 0 ? k[3] <= stop : k[2] >= stop, hitT = target != null && (side > 0 ? k[2] >= target : k[3] <= target);
      if (hitS && hitT) { exit = s.worst ? stop : target; reason = s.worst ? "stop*" : "target*"; exT = k[0]; break; }
      if (hitS) { exit = stop; reason = "stop"; exT = k[0]; break; }
      if (hitT) { exit = target; reason = "target"; exT = k[0]; break; }
    }
    if (exit == null) { const k = b5[b5.length - 1]; exit = k[4]; reason = "close"; exT = k[0]; }
    const pts = (exit - entry) * side - s.cost;
    trades.push({ d: day.d, side, inT: closeT, entry, stop, target, exit, exT, reason, pts, R: pts / risk, sigIdx: i });
    busy = exT;
  }
  return { trades, skip: trades.length ? null : why, ctx };
}
export function runAll(days, s) {
  const I = buildSeries(days, s), trades = [], skips = {};
  days.forEach((d, i) => { const r = dayRun(d, s, I, days[i - 1]); trades.push(...r.trades); if (r.skip) skips[r.skip] = (skips[r.skip] || 0) + 1; });
  return { trades, skips, I };
}
function stats(tr) {
  const n = tr.length, w = tr.filter((t) => t.pts > 0), l = tr.filter((t) => t.pts <= 0);
  const tot = tr.reduce((a, t) => a + t.pts, 0), gw = w.reduce((a, t) => a + t.pts, 0), gl = -l.reduce((a, t) => a + t.pts, 0);
  let eq = 0, pk = 0, dd = 0, run = 0, maxL = 0; const curve = [0];
  tr.forEach((t) => { eq += t.pts; curve.push(eq); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); run = t.pts <= 0 ? run + 1 : 0; maxL = Math.max(maxL, run); });
  const kind = (k) => tr.filter((t) => t.reason.startsWith(k)).length;
  return { n, wins: w.length, win: n ? w.length / n : 0, tot, avgR: n ? tr.reduce((a, t) => a + t.R, 0) / n : 0, pf: gl ? gw / gl : gw ? Infinity : 0,
    dd, maxL, curve, avgW: w.length ? gw / w.length : 0, avgL: l.length ? -gl / l.length : 0, tgt: kind("target"), stp: kind("stop") };
}
function ruleText(s) {
  const tf = `${s.tf}-min`;
  const setup = {
    orb: `Mark the first ${tf} candle (9:15–${hhmm(555 + s.tf)}). When ${s.trig === "second" ? `the 2nd ${tf} candle` : `any later ${tf} candle`} closes above its high, go long; below its low, go short.`,
    ema: `On ${tf} candles, go long when EMA ${s.ef} crosses above EMA ${s.es}; short when it crosses below.`,
    rsi: `On ${tf} candles, go long when RSI(${s.rn}) climbs back above ${s.ros}; short when it falls back below ${s.rob}.`,
    pdh: `On ${tf} candles, go long on the first close above yesterday's high; short on the first close below yesterday's low.`,
  }[s.setup];
  const stop = { orb: "the other side of the 1st candle", orbmid: "the middle of the 1st candle", signal: "the entry candle's low / high", swing: `the low / high of the last ${s.sn} candles`, atr: `${s.am} × ATR(${s.an})`, points: `${s.pts} points`, pct: `${s.pct}%` }[s.stop];
  return `${setup}${s.dir === "long" ? " Longs only." : s.dir === "short" ? " Shorts only." : ""}${s.useTrend ? ` Only longs above / shorts below EMA ${s.et}.` : ""} Enter at the candle's close, between ${s.win1} and ${s.win2}. Stop at ${stop}; ${s.noTgt ? "no target" : `target 1 : ${s.rr}`}. Exit everything at ${s.exitT}. Up to ${s.maxT} trade${s.maxT > 1 ? "s" : ""} a day.`;
}

/* ---------------- small UI pieces ---------------- */
function Chips({ items, value, onPick, label }) {
  return (
    <div className="stratChips" role="group" aria-label={label}>
      {items.map(([id, name]) => <button key={id} type="button" className={`stratChip ${value === id ? "stratChipOn" : ""}`} aria-pressed={value === id} onClick={() => onPick(id)}>{name}</button>)}
    </div>
  );
}
const Num = ({ label, v, on, step = 1, min }) => <label>{label}<input type="number" value={v} step={step} min={min} onChange={(e) => on(e.target.value === "" ? 0 : +e.target.value)} /></label>;
const Time = ({ label, v, on }) => <label>{label}<input type="time" step={300} value={v} onChange={(e) => e.target.value && on(e.target.value)} /></label>;
const Stat = ({ k, v, cls }) => <div className="stratStat"><span className="dim">{k}</span><b className={cls}>{v}</b></div>;

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888"; }
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const paint = () => { const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.font = "11px ui-monospace, monospace"; draw(g, w, h); };
    paint(); window.addEventListener("resize", paint); return () => window.removeEventListener("resize", paint);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
function Equity({ curve }) {
  const ref = useCanvas((g, w, h) => {
    const p = { l: 52, r: 8, t: 8, b: 16 }, mn = Math.min(0, ...curve), mx = Math.max(0, ...curve), sp = mx - mn || 1;
    const X = (i) => p.l + (w - p.l - p.r) * (curve.length > 1 ? i / (curve.length - 1) : 0), Y = (v) => p.t + (h - p.t - p.b) * (1 - (v - mn) / sp);
    g.strokeStyle = css("--border"); g.fillStyle = css("--text-dim");
    for (let k = 0; k <= 4; k++) { const v = mn + (sp * k) / 4; g.beginPath(); g.moveTo(p.l, Y(v)); g.lineTo(w - p.r, Y(v)); g.stroke(); g.fillText(fmt(v, 0), 2, Y(v) + 4); }
    if (curve.length < 2) return;
    g.strokeStyle = curve[curve.length - 1] >= 0 ? css("--bull") : css("--bear"); g.lineWidth = 2; g.beginPath();
    curve.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
  }, [curve]);
  return <canvas ref={ref} className="rtCanvas" style={{ height: 170 }} aria-label="Equity curve in points" />;
}
function DayChart({ day, s, I, run, revealed }) {
  const ref = useCanvas((g, w, h) => {
    const B = agg(day, s.tf), tr = run.trades, t0 = tr[0], g0 = I.off[day.d];
    const upto = t0 && !revealed ? t0.sigIdx : B.length - 1, p = { l: 56, r: 46, t: 10, b: 18 };
    const lv = [...B.map((x) => x[2]), ...B.map((x) => x[3])]; tr.forEach((t) => { lv.push(t.stop); if (t.target != null) lv.push(t.target); });
    if (s.setup === "pdh" && run.ctx?.PDH != null) lv.push(run.ctx.PDH, run.ctx.PDL);
    let mn = Math.min(...lv), mx = Math.max(...lv); const pad = (mx - mn) * 0.04 || 1; mn -= pad; mx += pad;
    const cw = (w - p.l - p.r) / B.length, X = (i) => p.l + cw * (i + 0.5), Y = (v) => p.t + (h - p.t - p.b) * (1 - (v - mn) / (mx - mn));
    g.strokeStyle = css("--border"); g.fillStyle = css("--text-dim");
    for (let k = 0; k <= 4; k++) { const v = mn + ((mx - mn) * k) / 4; g.beginPath(); g.moveTo(p.l, Y(v)); g.lineTo(w - p.r, Y(v)); g.stroke(); g.fillText(fmt(v, 0), 2, Y(v) + 4); }
    if (s.setup === "orb" || s.stop === "orb" || s.stop === "orbmid") { g.fillStyle = "rgba(123,97,255,0.14)"; g.fillRect(p.l, Y(B[0][2]), w - p.l - p.r, Y(B[0][3]) - Y(B[0][2])); }
    const hl = (v, lab) => { g.strokeStyle = css("--amber"); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(p.l, Y(v)); g.lineTo(w - p.r, Y(v)); g.stroke(); g.setLineDash([]); g.fillStyle = css("--amber"); g.fillText(lab, w - p.r + 3, Y(v) + 4); };
    if (s.setup === "pdh" && run.ctx?.PDH != null) { hl(run.ctx.PDH, "PDH"); hl(run.ctx.PDL, "PDL"); }
    const every = Math.max(1, Math.round(60 / s.tf)); g.fillStyle = css("--text-dim"); B.forEach((k, i) => { if (i % every === 0) g.fillText(k[0], X(i) - 14, h - 4); });
    const line = (arr, col) => { g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); let on = false; for (let i = 0; i <= upto; i++) { const v = arr[g0 + i]; if (v == null || v < mn || v > mx) { on = false; continue; } on ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); on = true; } g.stroke(); };
    if (s.setup === "ema") { line(I.fast, css("--amber")); line(I.slow, css("--accent")); }
    if (s.useTrend) line(I.trend, css("--text-dim"));
    B.slice(0, upto + 1).forEach((k, i) => { const up = k[4] >= k[1]; g.strokeStyle = g.fillStyle = up ? css("--bull") : css("--bear"); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X(i), Y(k[2])); g.lineTo(X(i), Y(k[3])); g.stroke();
      const y1 = Y(Math.max(k[1], k[4])), y2 = Y(Math.min(k[1], k[4])); g.fillRect(X(i) - cw * 0.32, y1, cw * 0.64, Math.max(1, y2 - y1)); });
    const seg = (t, end) => { let i1 = B.length - 1; if (end) B.forEach((k, i) => { if (k[0] <= t.exT) i1 = i; });
      const L = (v, col, dash) => { g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = 1.3; g.beginPath(); g.moveTo(X(t.sigIdx), Y(v)); g.lineTo(X(i1) + cw / 2, Y(v)); g.stroke(); g.setLineDash([]); };
      L(t.entry, css("--accent")); L(t.stop, css("--bear"), [5, 4]); if (t.target != null) L(t.target, css("--bull"), [5, 4]);
      g.fillStyle = css("--accent"); g.beginPath(); g.arc(X(t.sigIdx), Y(t.entry), 4.5, 0, 7); g.fill();
      if (end) { g.fillStyle = t.pts > 0 ? css("--bull") : css("--bear"); g.beginPath(); g.arc(X(i1), Y(t.exit), 4.5, 0, 7); g.fill(); } };
    if (t0 && !revealed) seg(t0, false); else tr.forEach((t) => seg(t, true));
  }, [day, s, I, run, revealed]);
  return <canvas ref={ref} className="rtCanvas" style={{ height: 280 }} aria-label="Candles for the chosen day with entry, stop and target" />;
}

/* ---------------- panel ---------------- */
const STORE = "pr_rule_tester";
const loadSaved = () => { try { return { ...BASE, ...(JSON.parse(localStorage.getItem(STORE) || "{}")) }; } catch (e) { return { ...BASE }; } };

export function RuleTester({ api }) {
  const [sym, setSym] = useState("^NSEI");
  const [months, setMonths] = useState(3);
  const [cache, setCache] = useState({}); // `${sym}|${months}` -> days
  const [loading, setLoading] = useState(""); const [err, setErr] = useState("");
  const [s, setS] = useState(loadSaved);
  const [preset, setPreset] = useState("");
  const [cost, setCost] = useState(s.cost);
  const [lots, setLots] = useState(1);
  const [pick, setPick] = useState(null); const [practice, setPractice] = useState(false); const [revealed, setRevealed] = useState(true);
  const [compare, setCompare] = useState(null);
  const set = (k) => (v) => { setPreset(""); setS((o) => ({ ...o, [k]: v })); };
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }, [s]);
  useEffect(() => { setS((o) => ({ ...o, cost })); }, [cost]);

  const key = `${sym}|${months}`, days = cache[key];
  const load = async () => {
    setErr(""); const to = Date.now(), from = to - months * 31 * 86400000, rows = [];
    try {
      for (let a = from, n = 1, total = Math.ceil((to - from) / (30 * 86400000)); a < to; a += 30 * 86400000, n++) {
        setLoading(`Loading 5-minute candles… ${n} / ${total}`);
        const b = Math.min(a + 30 * 86400000, to);
        rows.push(...(await api.fetchIntraday(sym, Math.floor(a / 1000), Math.floor(b / 1000))));
      }
      const d = groupDays(rows);
      if (!d.length) throw new Error("no candles came back");
      setCache((c) => ({ ...c, [key]: d })); setPick(null); setCompare(null);
    } catch (e) { setErr(`Couldn't load candles from your broker (${e.message || e}). Check that your broker is connected, then try again.`); }
    finally { setLoading(""); }
  };

  const res = useMemo(() => (days ? runAll(days, s) : null), [days, s]);
  useEffect(() => { if (res) track("rule_test_run", { trades: res.trades?.length ?? 0 }); }, [res]);
  const st = useMemo(() => (res ? stats(res.trades) : null), [res]);
  const lot = api.lotFor ? api.lotFor(sym) : 1;
  const name = INDEXES.find((x) => x[0] === sym)[1];

  const pickDay = (d) => { if (!days) return; setPick(d); setRevealed(!practice); };
  const random = () => { if (!days) return; let d; do { d = days[Math.floor(Math.random() * days.length)].d; } while (days.length > 1 && d === pick); pickDay(d); };
  const step = (n) => { if (!days) return; let i = days.findIndex((x) => x.d === pick); i = Math.max(0, Math.min(days.length - 1, (i < 0 ? days.length : i) + n)); pickDay(days[i].d); };
  const dayIdx = days && pick ? days.findIndex((x) => x.d === pick) : -1;
  const dayRes = dayIdx >= 0 ? dayRun(days[dayIdx], s, res.I, days[dayIdx - 1]) : null;

  const runCompare = () => {
    const tfs = [5, 15, 30, 60].map((tf) => [tf, stats(runAll(days, { ...s, tf }).trades)]);
    const stops = [["orb", "1st candle other side"], ["orbmid", "1st candle middle"], ["signal", "Entry candle"], ["swing", `Swing ${s.sn}`], ["atr", `${s.am}× ATR`], ["points", `${s.pts} pts`]];
    const rrs = [1, 1.5, 2, 2.5, 3];
    const grid = stops.map(([k, lab]) => [lab, rrs.map((rr) => stats(runAll(days, { ...s, stop: k, rr, noTgt: false }).trades))]);
    setCompare({ tfs, grid, rrs, tf: s.tf });
  };

  const verdict = (() => {
    if (!dayRes) return null;
    const t0 = dayRes.trades[0];
    if (!t0) return <span className="dim">No trade · {dayRes.skip}</span>;
    if (!revealed) return <span style={{ color: "var(--accent)" }}>{t0.side > 0 ? "LONG" : "SHORT"} at {fmt(t0.entry)} · stop {fmt(t0.stop)} · target {t0.target == null ? "none" : fmt(t0.target)}</span>;
    const lab = (t) => (t.reason.startsWith("target") ? "🎯 Target hit" : t.reason.startsWith("stop") ? "🛑 Stop-loss hit" : `⏱ Out at ${t.exT}`);
    if (dayRes.trades.length === 1) return <span className={tone(t0.pts)}>{lab(t0)} · {plus(t0.pts)} pts ({plus(t0.R, 2)}R)</span>;
    const tot = dayRes.trades.reduce((a, t) => a + t.pts, 0);
    return <span className={tone(tot)}>{dayRes.trades.length} trades · {plus(tot)} pts</span>;
  })();

  const summary = (() => {
    if (!st) return null;
    if (!st.n) return <p className="stratDesc"><b>No trades.</b> Nothing met these rules on the {days.length} days loaded. Try a wider entry window, the "any later candle" trigger or another timeframe.</p>;
    const top = [...res.trades].sort((a, b) => b.pts - a.pts).slice(0, 3).reduce((a, t) => a + t.pts, 0);
    const warns = [];
    if (st.n < 30) warns.push(`Only ${st.n} trades. Under about 30, a result like this can easily be luck; load more months before trusting it.`);
    if (!s.cost) warns.push("Costs are 0. Real trades pay brokerage, taxes and slippage, so set a few points per trade.");
    return (
      <>
        <p className="stratDesc"><b>{st.tot >= 0 ? "Made" : "Lost"} {fmt(Math.abs(st.tot), 0)} points over {st.n} trades</b> ({days.length} days). Won {st.wins} of {st.n} ({fmt(st.win * 100, 0)}%). Wins averaged <span className="rtPos">+{fmt(st.avgW, 0)}</span>, losses <span className="rtNeg">{fmt(st.avgL, 0)}</span> points. Worst run: {st.maxL} losses in a row; deepest dip {fmt(st.dd, 0)} points.
          {st.tot > 0 && st.n > 4 && top > st.tot * 0.8 ? ` The best 3 trades made ${fmt(top, 0)} points, so the result leans on a few big days.` : ""}</p>
        {warns.map((w) => <div key={w} className="rtWarn">⚠ {w}</div>)}
      </>
    );
  })();

  const stopOpts = [["orb", "Other side of 1st candle"], ["orbmid", "Middle of 1st candle"], ["signal", "Low / high of the entry candle"], ["swing", "Low / high of last N candles"], ["atr", "ATR × multiple"], ["points", "Fixed points"], ["pct", "Fixed %"]];

  return (
    <div>
      <p className="stratDesc dim">Write an intraday rule and see how it would have done on every day, using real 5-minute candles from your broker. Then open any single day to see whether the stop or the target came first.</p>
      <details className="rtGuide" onToggle={(e) => { if (e.currentTarget.open) track("rule_guide_open"); }}>
        <summary>How the Rule tester works <span className="dim">· 2-minute guide</span></summary>
        <div className="rtGuideBody">
          <p><b>What it does.</b> You describe a trading rule — when to enter, where your stop-loss goes and where you take profit. PaperRally replays that rule on every trading day in the period you choose, using real 5-minute candles from your broker, and shows what would have happened. In seconds you see whether an idea has an edge before you risk money on it.</p>
          <ol>
            <li><b>Pick the market and history.</b> Choose NIFTY, BANKNIFTY or SENSEX and how far back to test (1 month to 1 year), then press <b>Load candles</b>.</li>
            <li><b>Choose a rule.</b> The quickest start is a <b>preset</b>, such as the 15-minute opening candle breakout. You can then change any setting: the candle timeframe, long or short, entry hours, and how many trades a day.</li>
            <li><b>Set the stop-loss and target.</b> Pick where the stop goes (for example the other side of the first candle) and a risk : reward such as 1 : 2, which puts the target at twice the risk. Every open trade is closed at the exit time you set.</li>
            <li><b>Add costs.</b> Enter a few points per trade for brokerage, taxes and slippage. A rule that only wins before costs doesn't really win.</li>
            <li><b>Read the results.</b> See the summary below.</li>
          </ol>
          <p><b>Reading the results</b></p>
          <ul>
            <li><b>Win rate</b>: how many trades made money. A rule can win less than half the time and still profit if its wins are bigger than its losses.</li>
            <li><b>Total points and ₹</b>: the overall result, and what it means for the number of lots you entered.</li>
            <li><b>Avg R per trade</b>: average profit measured in units of risk. Above 0 means the rule made money on average; +0.3R means 30% of your risk on each trade.</li>
            <li><b>Profit factor</b>: money won ÷ money lost. Above 1.5 is good; below 1 means it loses.</li>
            <li><b>Max drawdown</b>: the deepest fall from a high point. Ask yourself whether you could sit through it.</li>
            <li><b>Target / Stop / Time</b>: how trades ended. The equity curve shows how the result built up over time.</li>
          </ul>
          <p><b>Check single days.</b> Under <b>Test one day</b>, open any day to see the candles with entry, stop and target marked. Tick <b>Practice: hide the result</b> to guess the outcome first, then reveal it.</p>
          <p><b>Compare variations.</b> <b>Compare timeframes &amp; stop / R:R variations</b> runs the same idea on 5, 15, 30 and 60-minute candles and with different stops and targets, so you can see which version holds up.</p>
          <p><b>Use it honestly.</b></p>
          <ul>
            <li>Test at least 30 trades. Fewer than that and a good result can easily be luck.</li>
            <li>Be careful of tuning settings until the past looks perfect. A rule that only works with very exact numbers rarely works in future.</li>
            <li>When the stop and the target fall in the same 5-minute candle, the tester counts it as a stop by default, the safer assumption.</li>
            <li>Past results do not guarantee future profit. This is for learning, not advice.</li>
          </ul>
          <p className="dim">Once a rule looks good here, practise it live or in Replay with virtual money before trading it for real.</p>
        </div>
      </details>

      <h4>Market</h4>
      <Chips label="Index" items={INDEXES} value={sym} onPick={(v) => { setSym(v); setPick(null); setCompare(null); }} />
      <div className="stratRow" style={{ alignItems: "flex-end" }}>
        <label>History<select value={months} onChange={(e) => { setMonths(+e.target.value); setPick(null); setCompare(null); }}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="btn btnBull" style={{ flex: "1 1 130px", justifyContent: "center" }} onClick={load} disabled={!!loading}>{days ? "Reload" : "Load candles"}</button>
      </div>
      {loading && <div className="stratNote dim">{loading}</div>}
      {err && <div className="stratError">{err}</div>}
      {days && <div className="stratNote dim">{name}: {days.length} trading days, {days[0].d} → {days[days.length - 1].d}</div>}

      <h4>Rule</h4>
      <label className="rtFull">Start from a preset<select value={preset} onChange={(e) => { const p = PRESETS.find((x) => x[0] === e.target.value); setPreset(e.target.value); if (p) setS({ ...BASE, ...p[2], cost: s.cost }); }}>
        <option value="">— choose —</option>{PRESETS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
      <div className="rtLabel">Candle timeframe</div>
      <Chips label="Timeframe" items={[[5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "60 min"]]} value={s.tf} onPick={set("tf")} />
      <div className="stratRow">
        <label>Setup<select value={s.setup} onChange={(e) => set("setup")(e.target.value)}>
          <option value="orb">Opening candle breakout</option><option value="ema">EMA crossover</option><option value="rsi">RSI bounce</option><option value="pdh">Previous-day high / low break</option></select></label>
        <label>Direction<select value={s.dir} onChange={(e) => set("dir")(e.target.value)}><option value="both">Long and short</option><option value="long">Long only</option><option value="short">Short only</option></select></label>
      </div>
      {s.setup === "orb" && <div className="stratRow">
        <label>Trigger<select value={s.trig} onChange={(e) => set("trig")(e.target.value)}><option value="second">2nd candle closes beyond the 1st</option><option value="any">Any later candle closes beyond the 1st</option></select></label>
        <Num label="Skip if 1st candle wider than (pts)" v={s.maxR} on={set("maxR")} min={0} /></div>}
      {s.setup === "ema" && <div className="stratRow"><Num label="Fast EMA" v={s.ef} on={set("ef")} min={1} /><Num label="Slow EMA" v={s.es} on={set("es")} min={2} /></div>}
      {s.setup === "rsi" && <div className="stratRow"><Num label="RSI period" v={s.rn} on={set("rn")} min={2} /><Num label="Oversold" v={s.ros} on={set("ros")} /><Num label="Overbought" v={s.rob} on={set("rob")} /></div>}
      <div className="stratRow">
        <Time label="Entries from" v={s.win1} on={set("win1")} /><Time label="Entries until" v={s.win2} on={set("win2")} />
        <Num label="Max trades a day" v={s.maxT} on={set("maxT")} min={1} />
      </div>
      <label className="rtCheck"><input type="checkbox" checked={s.useTrend} onChange={(e) => set("useTrend")(e.target.checked)} /> Trade with the trend only: longs above, shorts below EMA</label>
      {s.useTrend && <div className="stratRow"><Num label="Trend EMA" v={s.et} on={set("et")} min={2} /></div>}

      <div className="stratRow">
        <label>Stop-loss<select value={s.stop} onChange={(e) => set("stop")(e.target.value)}>{stopOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {s.stop === "swing" && <Num label="N candles" v={s.sn} on={set("sn")} min={1} />}
        {s.stop === "atr" && <><Num label="ATR period" v={s.an} on={set("an")} min={2} /><Num label="Multiple" v={s.am} on={set("am")} step={0.25} /></>}
        {s.stop === "points" && <Num label="Points" v={s.pts} on={set("pts")} min={1} />}
        {s.stop === "pct" && <Num label="Percent" v={s.pct} on={set("pct")} step={0.05} />}
      </div>
      <div className="stratRow">
        <Num label="Risk : reward (1 : x)" v={s.rr} on={set("rr")} step={0.25} min={0.25} />
        <Time label="Exit all by" v={s.exitT} on={set("exitT")} />
        <Num label="Costs per trade (pts)" v={cost} on={setCost} step={0.5} min={0} />
        <Num label="Lots" v={lots} on={setLots} min={1} />
      </div>
      <label className="rtCheck"><input type="checkbox" checked={s.noTgt} onChange={(e) => set("noTgt")(e.target.checked)} /> No target: hold until the stop or the exit time</label>
      <label className="rtCheck"><input type="checkbox" checked={s.worst} onChange={(e) => set("worst")(e.target.checked)} /> If stop and target fall in the same 5-min candle, count it as a stop</label>
      <div className="rtRule">{ruleText(s)}</div>

      {days && st && <>
        <h4>Test one day</h4>
        <div className="rtDayBar">
          <button className="btn btnBull" onClick={random}>🎲 Random day</button>
          <button className="btn btnGhost" onClick={() => step(-1)} aria-label="Previous day">◀</button>
          <select value={pick || ""} onChange={(e) => pickDay(e.target.value)} aria-label="Day">
            <option value="">Pick a day</option>{[...days].reverse().map((d) => <option key={d.d} value={d.d}>{d.d}</option>)}</select>
          <button className="btn btnGhost" onClick={() => step(1)} aria-label="Next day">▶</button>
          <label className="rtCheck" style={{ margin: 0 }}><input type="checkbox" checked={practice} onChange={(e) => { setPractice(e.target.checked); setRevealed(!e.target.checked); }} /> Practice: hide the result</label>
        </div>
        {dayRes && <>
          <div className="rtVerdict">{verdict}</div>
          <DayChart day={days[dayIdx]} s={s} I={res.I} run={dayRes} revealed={revealed} />
          {!revealed && dayRes.trades[0] && <button className="btn btnGhost" style={{ marginTop: 8 }} onClick={() => setRevealed(true)}>Reveal result</button>}
          {revealed && dayRes.trades.length > 0 && <div className="stratNote dim">{dayRes.trades.map((t) => `${t.side > 0 ? "Long" : "Short"} ${t.inT} at ${fmt(t.entry)} → ${t.reason} ${t.exT} at ${fmt(t.exit)} (${plus(t.pts)} pts, ₹${fmt(t.pts * lot * lots, 0)})`).join(" · ")}</div>}
        </>}

        <h4>Every day</h4>
        {summary}
        <div className="stratStats">
          <Stat k="Trades" v={`${st.n} / ${days.length} days`} />
          <Stat k="Win rate" v={`${fmt(st.win * 100, 1)}%`} />
          <Stat k="Total points" v={plus(st.tot)} cls={tone(st.tot)} />
          <Stat k={`₹ (${lots} × ${lot} qty)`} v={plus(st.tot * lot * lots, 0)} cls={tone(st.tot)} />
          <Stat k="Avg R per trade" v={plus(st.avgR, 2)} cls={tone(st.avgR)} />
          <Stat k="Profit factor" v={st.pf === Infinity ? "∞" : fmt(st.pf, 2)} />
          <Stat k="Max drawdown" v={fmt(-st.dd, 1)} cls={st.dd ? "rtNeg" : ""} />
          <Stat k="🎯 Target / 🛑 Stop / ⏱ Time" v={`${st.tgt} / ${st.stp} / ${st.n - st.tgt - st.stp}`} />
        </div>
        <div style={{ marginTop: 12 }}><Equity curve={st.curve} /></div>
        {Object.keys(res.skips).length > 0 && <div className="stratNote dim">Days with no trade: {Object.entries(res.skips).map(([k, v]) => `${v} ${k}`).join(" · ")}</div>}

        <button className="btn btnGhost stratPlace" onClick={runCompare}>Compare timeframes &amp; stop / R:R variations</button>
        {compare && <>
          <h4>Same rule, different timeframes</h4>
          <div className="stratLog"><table><thead><tr><th>Timeframe</th><th>Trades</th><th>Win %</th><th>Points</th><th>Avg R</th><th>Max DD</th></tr></thead>
            <tbody>{compare.tfs.map(([tf, x]) => <tr key={tf}><td>{tf} min{tf === compare.tf ? " ◀" : ""}</td><td>{x.n}</td><td>{fmt(x.win * 100, 0)}</td><td className={tone(x.tot)}>{plus(x.tot)}</td><td>{fmt(x.avgR, 2)}</td><td>{fmt(-x.dd, 0)}</td></tr>)}</tbody></table></div>
          <h4>Stop × risk:reward at {compare.tf}-min: points (win %)</h4>
          <div className="stratLog"><table><thead><tr><th>Stop</th>{compare.rrs.map((r) => <th key={r}>1 : {r}</th>)}</tr></thead>
            <tbody>{compare.grid.map(([lab, row]) => <tr key={lab}><td>{lab}</td>{row.map((x, i) => <td key={i} className={tone(x.tot)}>{plus(x.tot, 0)} <span className="dim">({fmt(x.win * 100, 0)}%)</span></td>)}</tr>)}</tbody></table></div>
          <div className="stratNote dim">With few trades the best cell is often luck. Prefer settings whose neighbours also do well.</div>
        </>}

        <h4>Trades</h4>
        <div className="stratLog"><table><thead><tr><th>Date</th><th>Side</th><th>In</th><th>Entry</th><th>Stop</th><th>Target</th><th>Out</th><th>Why</th><th>Points</th><th>R</th></tr></thead>
          <tbody>{res.trades.length ? [...res.trades].reverse().map((t, i) => (
            <tr key={i} className={t.d === pick ? "rtSel" : ""} onClick={() => pickDay(t.d)} style={{ cursor: "pointer" }}>
              <td>{t.d}</td><td>{t.side > 0 ? "LONG" : "SHORT"}</td><td>{t.inT}</td><td>{fmt(t.entry)}</td><td>{fmt(t.stop)}</td><td>{t.target == null ? "–" : fmt(t.target)}</td><td>{t.exT}</td><td>{t.reason}</td>
              <td className={tone(t.pts)}>{plus(t.pts)}</td><td className={tone(t.R)}>{plus(t.R, 2)}</td></tr>)) : <tr><td colSpan={10}>No trades with these settings.</td></tr>}</tbody></table></div>
        <div className="stratNote dim">Points are index points; option premiums move differently (delta, decay, IV), so ₹ is an index-points estimate, not options P&amp;L. Entry is at the signal candle's close; real fills may differ. Index data has no volume, so VWAP rules are not available.</div>
      </>}
    </div>
  );
}
