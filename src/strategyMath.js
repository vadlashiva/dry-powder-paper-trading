// Option strategy maths for the Strategies tab. Plain functions with no UI, so they can be checked on their own.
const leg = (side, type, off = 0) => ({ side, type, off });

export const STRATEGIES = [
  { id: "long_call", name: "Long Call", view: "Bullish", desc: "Buy a call. Profits if the price rises.", legs: [leg("buy", "call")] },
  { id: "long_put", name: "Long Put", view: "Bearish", desc: "Buy a put. Profits if the price falls.", legs: [leg("buy", "put")] },
  { id: "bull_call", name: "Bull Call Spread", view: "Bullish", desc: "Buy a call, sell a higher call. Limited risk and reward.", legs: [leg("buy", "call"), leg("sell", "call", 4)] },
  { id: "bear_put", name: "Bear Put Spread", view: "Bearish", desc: "Buy a put, sell a lower put. Limited risk and reward.", legs: [leg("buy", "put"), leg("sell", "put", -4)] },
  { id: "long_straddle", name: "Long Straddle", view: "Volatile", desc: "Buy a call and a put at one strike. Needs a big move.", legs: [leg("buy", "call"), leg("buy", "put")] },
  { id: "long_strangle", name: "Long Strangle", view: "Volatile", desc: "Buy an out-of-the-money call and put. A cheaper bet on a big move.", legs: [leg("buy", "call", 4), leg("buy", "put", -4)] },
  { id: "short_straddle", name: "Short Straddle", view: "Neutral", desc: "Sell a call and a put at one strike. Unlimited risk.", legs: [leg("sell", "call"), leg("sell", "put")] },
  { id: "short_strangle", name: "Short Strangle", view: "Neutral", desc: "Sell an out-of-the-money call and put. Unlimited risk.", legs: [leg("sell", "call", 4), leg("sell", "put", -4)] },
  { id: "iron_condor", name: "Iron Condor", view: "Neutral", desc: "Sell a strangle and buy protection on both sides. Limited risk.", legs: [leg("sell", "call", 4), leg("buy", "call", 8), leg("sell", "put", -4), leg("buy", "put", -8)] },
  { id: "iron_fly", name: "Iron Butterfly", view: "Neutral", desc: "Sell a straddle and buy protection on both sides. Limited risk.", legs: [leg("sell", "call"), leg("sell", "put"), leg("buy", "call", 6), leg("buy", "put", -6)] },
];

export const buildLegs = (strategy, atm, step) =>
  strategy.legs.map((l) => ({ side: l.side, type: l.type, strike: atm + l.off * step }));

const intrinsic = (type, strike, S) => (type === "call" ? Math.max(S - strike, 0) : Math.max(strike - S, 0));

// Profit or loss in rupees at expiry if the index closes at S. Each leg carries its entry premium.
export function payoffAt(legs, S, lot, lots) {
  return legs.reduce((sum, l) => {
    const sign = l.side === "buy" ? 1 : -1;
    return sum + sign * (intrinsic(l.type, l.strike, S) - l.premium) * lot * lots;
  }, 0);
}

export const netPremium = (legs, lot, lots) =>
  legs.reduce((sum, l) => sum + (l.side === "sell" ? 1 : -1) * l.premium * lot * lots, 0);

// Payoffs are straight lines between strikes, so checking 0 and every strike finds the exact extremes.
export function summarizePayoff(legs, lot, lots) {
  if (!legs.length) return { maxProfit: 0, maxLoss: 0, breakevens: [], net: 0 };
  const strikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  const xs = [0, ...strikes];
  const ys = xs.map((x) => payoffAt(legs, x, lot, lots));
  const slope = legs.reduce((s, l) => s + (l.type === "call" ? (l.side === "buy" ? 1 : -1) : 0), 0) * lot * lots;
  const breakevens = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [y0, y1] = [ys[i], ys[i + 1]];
    if (y0 === 0 && xs[i] > 0) breakevens.push(xs[i]);
    else if (y0 * y1 < 0) breakevens.push(xs[i] + ((xs[i + 1] - xs[i]) * -y0) / (y1 - y0));
  }
  const last = ys[ys.length - 1];
  if (last === 0) breakevens.push(xs[xs.length - 1]);
  else if (slope !== 0 && last * slope < 0) breakevens.push(xs[xs.length - 1] - last / slope);
  return {
    maxProfit: slope > 0 ? Infinity : Math.max(...ys),
    maxLoss: slope < 0 ? -Infinity : Math.min(...ys),
    breakevens: breakevens.map((b) => Math.round(b * 100) / 100),
    net: netPremium(legs, lot, lots),
  };
}

const YEAR_MS = 365 * 24 * 3600 * 1000;
const IST_MS = 19800000;
const closeTimeOf = (t) => {
  const d = new Date(t + IST_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0); // 3:30 PM IST
};
const weekNumber = (close) => Math.floor((close / 86400000 + 3) / 7); // weeks start on Monday

/* Replays a strategy over daily index candles. Each trade enters at a day's close at the nearest strike, and
   exits at the close `hold` trading days later or on expiry, whichever is first.
   opts: { strategy, step, lot, lots, hold, entry: "weekly" | "daily", expiryFor(ms), price(S, K, Tyears, type) } */
export function runBacktest(candles, opts) {
  const { strategy, step, lot, lots, hold, entry, expiryFor, price } = opts;
  const days = candles.map((c) => ({ ...c, closeAt: closeTimeOf(c.time) }));
  const trades = [];
  let lastWeek = null;
  days.forEach((day, i) => {
    const week = weekNumber(day.closeAt);
    const isEntry = entry === "daily" || week !== lastWeek;
    lastWeek = week;
    if (!isEntry) return;
    const expiry = expiryFor(day.closeAt);
    if (!expiry || expiry <= day.closeAt) return;
    let j = i;
    while (j + 1 < days.length && j - i < hold && days[j + 1].closeAt <= expiry) j++;
    if (j === i) return;
    if (j - i < hold && days[j].closeAt < expiry) return; // the data ends before this trade finishes
    const atm = Math.round(day.close / step) * step;
    const legs = buildLegs(strategy, atm, step);
    const T0 = (expiry - day.closeAt) / YEAR_MS;
    const T1 = Math.max(0, (expiry - days[j].closeAt) / YEAR_MS);
    const pnl = legs.reduce((sum, l) => {
      const open = price(day.close, l.strike, T0, l.type);
      const close = T1 > 0 ? price(days[j].close, l.strike, T1, l.type) : intrinsic(l.type, l.strike, days[j].close);
      return sum + (l.side === "buy" ? 1 : -1) * (close - open) * lot * lots;
    }, 0);
    trades.push({ entryAt: day.closeAt, exitAt: days[j].closeAt, entrySpot: day.close, exitSpot: days[j].close, atm, pnl: Math.round(pnl) });
  });
  let equity = 0, peak = 0, maxDrawdown = 0;
  const curve = trades.map((t) => {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    return equity;
  });
  const wins = trades.filter((t) => t.pnl > 0).length;
  return {
    trades, curve, net: equity, maxDrawdown, wins,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    best: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worst: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
  };
}
