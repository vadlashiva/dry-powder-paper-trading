/* Smart Money Concepts (SMC) — port of the owner's TradingView Pine v5 script.
   computeSMC() reproduces the script bar by bar with its default inputs:
   swing + internal BOS / CHoCH, order blocks, fair value gaps, equal highs/lows,
   premium / equilibrium / discount zones, strong / weak high & low, and the
   previous day's high / low. SMCPrimitive draws the result on a
   lightweight-charts series. Candle x positions are bar indexes. */

export const SMC_DEFAULTS = {
  showSwing: true, swingLen: 50,
  showInternal: true, internalLen: 5,
  bullColor: "#089981", bearColor: "#F23645",
  showOB: true, obFromSwing: true, obFromInternal: true, maxOB: 5, obMitSrc: "Close",
  showFVG: true, fvgMinAtr: 0, maxFVG: 10,
  showEQ: true, eqLen: 3, eqThr: 0.1,
  showPD: true,
  showSW: true,
  showDaily: true, dailyColor: "#2962FF",
  atrLen: 200,
};

const rgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/* Wilder ATR as ta.atr(len). Pine gives 0 (nz of na) until `len` bars exist; an
   intraday chart here often has fewer than 200 candles, so until then the plain
   average of the true ranges seen so far is used instead of 0. */
function atrSeries(c, len) {
  const out = new Array(c.length).fill(0);
  let sum = 0, atr = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low
      : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < len) { sum += tr; atr = sum / (i + 1); } else atr = (atr * (len - 1) + tr) / len;
    out[i] = atr;
  }
  return out;
}

/* ta.pivothigh / ta.pivotlow (len left, len right), evaluated on bar i for the
   candidate bar i - len. Returns the pivot price or null. */
function pivotAt(c, i, len, isHigh) {
  const p = i - len;
  if (p - len < 0) return null;
  const v = isHigh ? c[p].high : c[p].low;
  for (let j = p + 1; j <= i; j++) {
    const w = isHigh ? c[j].high : c[j].low;
    if (isHigh ? w > v : w < v) return null;
  }
  for (let j = p - len; j < p; j++) {
    const w = isHigh ? c[j].high : c[j].low;
    if (isHigh ? w >= v : w <= v) return null;
  }
  return v;
}

function makeStructure(len) {
  return { len, hi: null, hiBar: null, hiX: true, lo: null, loBar: null, loX: true, trend: 0 };
}
/* One bar of f_structure(): updates pivots, then reports breaks of structure. */
function stepStructure(s, c, i) {
  const ph = pivotAt(c, i, s.len, true);
  const pl = pivotAt(c, i, s.len, false);
  if (ph != null) { s.hi = ph; s.hiBar = i - s.len; s.hiX = false; }
  if (pl != null) { s.lo = pl; s.loBar = i - s.len; s.loX = false; }
  const out = { bull: false, bear: false, bullChoch: false, bearChoch: false };
  if (!s.hiX && c[i].close > s.hi) { out.bull = true; out.bullChoch = s.trend === -1; s.hiX = true; s.trend = 1; }
  if (!s.loX && c[i].close < s.lo) { out.bear = true; out.bearChoch = s.trend === 1; s.loX = true; s.trend = -1; }
  return out;
}

/* candles: [{ time (seconds; any fixed offset), open, high, low, close }] in
   ascending time order. Returns shapes to draw plus a short summary. */
export function computeSMC(candles, opts = {}) {
  const o = { ...SMC_DEFAULTS, ...opts };
  const c = candles;
  const n = c.length;
  const lines = [], boxes = [], labels = [], events = [];
  const empty = { lines, boxes, labels, events, summary: { swingTrend: 0, internalTrend: 0, orderBlocks: 0, fvgs: 0, lastEvent: null } };
  if (n < 3) return empty;

  const atr = atrSeries(c, o.atrLen);
  const sw = makeStructure(o.swingLen);
  const inr = makeStructure(o.internalLen);
  let obs = [], fvgs = [];
  let lastEqH = null, lastEqHBar = null, lastEqL = null, lastEqLBar = null;
  let trTop = null, trTopBar = null, trBot = null, trBotBar = null;
  let prevSHi = null, prevSLo = null;

  const addOB = (isBull, pivBar, i) => {
    const cnt = Math.min(i - pivBar, 499);
    if (cnt < 1) return;
    let best = isBull ? 1e10 : -1e10, bi = 1;
    for (let k = 1; k <= cnt; k++) {
      const v = isBull ? c[i - k].low : c[i - k].high;
      if (isBull ? v < best : v > best) { best = v; bi = k; }
    }
    obs.push({ left: i - bi, top: c[i - bi].high, bot: c[i - bi].low, bull: isBull });
    if (obs.length > o.maxOB) obs.shift();
  };
  const record = (s, r, i, internal, show) => {
    const push = (isBull) => {
      const choch = isBull ? r.bullChoch : r.bearChoch;
      const from = isBull ? s.hiBar : s.loBar, price = isBull ? s.hi : s.lo;
      const color = isBull ? o.bullColor : o.bearColor;
      events.push({ bar: i, bull: isBull, choch, internal, price });
      if (!show) return;
      lines.push({ x1: from, y1: price, x2: i, y2: price, color, dash: internal ? "dashed" : "solid" });
      labels.push({ x: Math.round((from + i) / 2), y: price, text: choch ? "CHoCH" : "BOS", color, pos: isBull ? "above" : "below", size: internal ? 9 : 11 });
    };
    if (r.bull) push(true);
    if (r.bear) push(false);
  };

  for (let i = 0; i < n; i++) {
    const b = c[i];
    const sR = stepStructure(sw, c, i);
    const iR = stepStructure(inr, c, i);
    record(sw, sR, i, false, o.showSwing);
    record(inr, iR, i, true, o.showInternal);

    if (o.showOB) {
      // mitigated blocks are removed before new ones are created
      obs = obs.filter((x) => !(x.bull ? (o.obMitSrc === "Close" ? b.close : b.low) < x.bot : (o.obMitSrc === "Close" ? b.close : b.high) > x.top));
      if (sR.bull && o.obFromSwing) addOB(true, sw.hiBar, i);
      if (sR.bear && o.obFromSwing) addOB(false, sw.loBar, i);
      if (iR.bull && o.obFromInternal) addOB(true, inr.hiBar, i);
      if (iR.bear && o.obFromInternal) addOB(false, inr.loBar, i);
    }

    if (o.showFVG) {
      fvgs = fvgs.filter((x) => !(x.bull ? b.low < x.bot : b.high > x.top));
      if (i >= 2) {
        const p2 = c[i - 2], p1 = c[i - 1];
        const bullF = b.low > p2.high && p1.close > p2.high && b.low - p2.high > o.fvgMinAtr * atr[i];
        const bearF = b.high < p2.low && p1.close < p2.low && p2.low - b.high > o.fvgMinAtr * atr[i];
        if (bullF || bearF) {
          fvgs.push({ left: i - 2, top: bullF ? b.low : p2.low, bot: bullF ? p2.high : b.high, bull: bullF });
          if (fvgs.length > o.maxFVG) fvgs.shift();
        }
      }
    }

    const eqPH = pivotAt(c, i, o.eqLen, true);
    const eqPL = pivotAt(c, i, o.eqLen, false);
    if (eqPH != null) {
      if (lastEqH != null && Math.abs(eqPH - lastEqH) < o.eqThr * atr[i] && o.showEQ) {
        lines.push({ x1: lastEqHBar, y1: lastEqH, x2: i - o.eqLen, y2: eqPH, color: o.bearColor, dash: "dotted" });
        labels.push({ x: Math.round((lastEqHBar + i - o.eqLen) / 2), y: eqPH, text: "EQH", color: o.bearColor, pos: "above", size: 9 });
      }
      lastEqH = eqPH; lastEqHBar = i - o.eqLen;
    }
    if (eqPL != null) {
      if (lastEqL != null && Math.abs(eqPL - lastEqL) < o.eqThr * atr[i] && o.showEQ) {
        lines.push({ x1: lastEqLBar, y1: lastEqL, x2: i - o.eqLen, y2: eqPL, color: o.bullColor, dash: "dotted" });
        labels.push({ x: Math.round((lastEqLBar + i - o.eqLen) / 2), y: eqPL, text: "EQL", color: o.bullColor, pos: "below", size: 9 });
      }
      lastEqL = eqPL; lastEqLBar = i - o.eqLen;
    }

    // trailing extremes for the strong / weak high & low
    if (sw.hi != null && sw.hi !== (prevSHi ?? 0)) { trTop = sw.hi; trTopBar = sw.hiBar; }
    if (sw.lo != null && sw.lo !== (prevSLo ?? 0)) { trBot = sw.lo; trBotBar = sw.loBar; }
    if (trTop != null && b.high > trTop) { trTop = b.high; trTopBar = i; }
    if (trBot != null && b.low < trBot) { trBot = b.low; trBotBar = i; }
    prevSHi = sw.hi; prevSLo = sw.lo;
  }

  const last = n - 1;
  obs.forEach((x) => {
    const col = x.bull ? o.bullColor : o.bearColor;
    boxes.push({ x1: x.left, x2: null, top: x.top, bot: x.bot, fill: rgba(col, 0.2), stroke: rgba(col, 0.6) });
  });
  fvgs.forEach((x) => boxes.push({ x1: x.left, x2: null, top: x.top, bot: x.bot, fill: rgba(x.bull ? o.bullColor : o.bearColor, 0.15) }));

  if (o.showPD && sw.hi != null && sw.lo != null && sw.hi > sw.lo) {
    const rng = sw.hi - sw.lo, left = Math.min(sw.hiBar, sw.loBar), right = last + 10;
    boxes.push({ x1: left, x2: right, top: sw.hi, bot: sw.hi - 0.05 * rng, fill: rgba(o.bearColor, 0.15), text: "Premium", textColor: o.bearColor });
    boxes.push({ x1: left, x2: right, top: sw.lo + 0.525 * rng, bot: sw.lo + 0.475 * rng, fill: "rgba(120, 123, 134, 0.15)", text: "Equilibrium", textColor: "#787B86" });
    boxes.push({ x1: left, x2: right, top: sw.lo + 0.05 * rng, bot: sw.lo, fill: rgba(o.bullColor, 0.15), text: "Discount", textColor: o.bullColor });
  }

  if (o.showSW && trTop != null && trBot != null) {
    const xEnd = last + 5;
    lines.push({ x1: trTopBar, y1: trTop, x2: xEnd, y2: trTop, color: o.bearColor, dash: "dotted" });
    labels.push({ x: xEnd, y: trTop, text: sw.trend === -1 ? "Strong High" : "Weak High", color: o.bearColor, pos: "right", size: 11 });
    lines.push({ x1: trBotBar, y1: trBot, x2: xEnd, y2: trBot, color: o.bullColor, dash: "dotted" });
    labels.push({ x: xEnd, y: trBot, text: sw.trend === 1 ? "Strong Low" : "Weak Low", color: o.bullColor, pos: "right", size: 11 });
  }

  // Previous day high / low, taken from the candles themselves (the script reads the
  // daily timeframe). Only drawn on intraday charts that reach back into an earlier day.
  if (o.showDaily) {
    const day = (t) => Math.floor(t / 86400);
    const today = day(c[last].time);
    let start = last;
    while (start > 0 && day(c[start - 1].time) === today) start--;
    if (start > 0 && last - start >= 1) {
      const prevDay = day(c[start - 1].time);
      let h = -Infinity, l = Infinity;
      for (let j = start - 1; j >= 0 && day(c[j].time) === prevDay; j--) { h = Math.max(h, c[j].high); l = Math.min(l, c[j].low); }
      [[h, "PDH"], [l, "PDL"]].forEach(([price, text]) => {
        lines.push({ x1: start, y1: price, x2: null, y2: price, color: o.dailyColor, dash: "dashed" });
        labels.push({ x: null, y: price, text, color: o.dailyColor, pos: "edge", size: 11 });
      });
    }
  }

  return {
    lines: lines.slice(-500), boxes, labels: labels.slice(-500), events,
    summary: { swingTrend: sw.trend, internalTrend: inr.trend, orderBlocks: obs.length, fvgs: fvgs.length, lastEvent: events.length ? events[events.length - 1] : null },
  };
}

const DASH = { solid: [], dashed: [5, 4], dotted: [1.5, 3] };

/* lightweight-charts series primitive: redrawn by the chart on every paint, so
   the shapes follow scrolling, zooming and price-scale changes. */
export class SMCPrimitive {
  constructor() {
    this._model = null;
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    const self = this;
    const renderer = { draw(target) { target.useMediaCoordinateSpace(({ context, mediaSize }) => self._draw(context, mediaSize)); } };
    this._views = [{ zOrder: () => "bottom", renderer: () => renderer }];
  }
  attached({ chart, series, requestUpdate }) { this._chart = chart; this._series = series; this._requestUpdate = requestUpdate; }
  detached() { this._chart = null; this._series = null; this._requestUpdate = null; }
  setModel(model) { this._model = model; if (this._requestUpdate) this._requestUpdate(); }
  updateAllViews() {}
  paneViews() { return this._views; }
  _draw(ctx, size) {
    const m = this._model;
    if (!m || !this._chart || !this._series) return;
    const ts = this._chart.timeScale();
    const X = (i) => (i == null ? size.width : ts.logicalToCoordinate(i));
    const Y = (p) => this._series.priceToCoordinate(p);
    ctx.save();
    ctx.textBaseline = "middle";
    m.boxes.forEach((b) => {
      const x1 = X(b.x1), x2 = X(b.x2), y1 = Y(b.top), y2 = Y(b.bot);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return;
      const h = Math.max(1, y2 - y1);
      ctx.fillStyle = b.fill;
      ctx.fillRect(x1, y1, x2 - x1, h);
      if (b.stroke) { ctx.strokeStyle = b.stroke; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, h); }
      if (b.text) {
        ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = b.textColor;
        ctx.fillText(b.text, Math.min(x2, size.width) - 4, y1 + h / 2);
      }
    });
    m.lines.forEach((l) => {
      const x1 = X(l.x1), x2 = X(l.x2), y1 = Y(l.y1), y2 = Y(l.y2);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return;
      ctx.beginPath(); ctx.strokeStyle = l.color; ctx.lineWidth = 1; ctx.setLineDash(DASH[l.dash] || []);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    });
    ctx.setLineDash([]);
    m.labels.forEach((t) => {
      const x = X(t.x), y = Y(t.y);
      if (x == null || y == null) return;
      ctx.font = `${t.size}px Inter, sans-serif`; ctx.fillStyle = t.color;
      if (t.pos === "edge") { ctx.textAlign = "right"; ctx.fillText(t.text, size.width - 4, y - (t.size / 2 + 2)); }
      else if (t.pos === "right") { ctx.textAlign = "left"; ctx.fillText(t.text, x + 4, y); }
      else { ctx.textAlign = "center"; ctx.fillText(t.text, x, y + (t.pos === "above" ? -(t.size / 2 + 3) : t.size / 2 + 3)); }
    });
    ctx.restore();
  }
}
