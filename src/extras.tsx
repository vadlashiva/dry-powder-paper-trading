// @ts-nocheck
import { useEffect, useMemo, useState } from "react";

/* ---------------- viewport ---------------- */
// Phones in portrait, plus phones held sideways (touch screen, short height).
export function useIsMobile(maxWidth = 760) {
  const query = `(max-width: ${maxWidth}px), (pointer: coarse) and (max-height: 500px)`;
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.matchMedia(query).matches; } catch { return false; }
  });
  useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return; }
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [query]);
  return isMobile;
}

/* ---------------- per-user settings (this browser) ---------------- */
export function loadSetting(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function saveSetting(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/* ---------------- realistic charges ----------------
   Approximate discount-broker charges for Indian markets. Rates change with
   budgets and exchange circulars — keep them in this one table so they're easy
   to update. Equity uses intraday-style rates; options are charged on premium.
   STT checked Oct 2026: equity intraday 0.025% (sell), options 0.15% of premium (sell, from 1 Apr 2026). */
export const CHARGE_RATES = {
  equity: { brokeragePct: 0.0003, brokerageCap: 20, sttSellPct: 0.00025, exchPct: 0.0000297, stampBuyPct: 0.00003 },
  option: { brokerageFlat: 20, sttSellPct: 0.0015, exchPct: 0.0003503, stampBuyPct: 0.00003 },
  sebiPct: 0.000001, // ₹10 per crore
  gstPct: 0.18,       // on brokerage + exchange + SEBI fees
};

const OPTION_RE = /\b(BTO|STO|STC|BTC)\b/;
// label/amount come straight from logTrade(): amount is the cash impact (negative = money out).
export function computeCharges(label, amount) {
  const turnover = Math.abs(amount || 0);
  if (!turnover) return null;
  const r = CHARGE_RATES;
  let brokerage, stt, exch, stamp;
  if (OPTION_RE.test(label)) {
    const sell = /\b(STO|STC)\b/.test(label);
    brokerage = r.option.brokerageFlat;
    stt = sell ? turnover * r.option.sttSellPct : 0;
    exch = turnover * r.option.exchPct;
    stamp = sell ? 0 : turnover * r.option.stampBuyPct;
  } else {
    const sell = amount > 0;
    brokerage = Math.min(r.equity.brokerageCap, turnover * r.equity.brokeragePct);
    stt = sell ? turnover * r.equity.sttSellPct : 0;
    exch = turnover * r.equity.exchPct;
    stamp = sell ? 0 : turnover * r.equity.stampBuyPct;
  }
  const sebi = turnover * r.sebiPct;
  const gst = (brokerage + exch + sebi) * r.gstPct;
  const total = brokerage + stt + exch + sebi + stamp + gst;
  return { brokerage, stt, exch, sebi, stamp, gst, total: Math.round(total * 100) / 100 };
}

/* ---------------- performance ---------------- */
export function computePerformance(trades) {
  const closes = trades.filter((t) => t.realized != null).slice().reverse(); // oldest first
  const wins = closes.filter((t) => t.realized > 0);
  const losses = closes.filter((t) => t.realized < 0);
  const sum = (a) => a.reduce((s, t) => s + t.realized, 0);
  const grossWin = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  let streak = 0, worstStreak = 0;
  closes.forEach((t) => {
    if (t.realized < 0) { streak++; worstStreak = Math.max(worstStreak, streak); } else streak = 0;
  });
  let cum = 0;
  const curve = closes.map((t) => (cum += t.realized));
  const charges = trades.reduce((s, t) => s + (t.charges || 0), 0);
  const slExits = closes.filter((t) => /^SL hit|^STOP SELL/.test(t.label)).length;
  return {
    count: closes.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closes.length ? (wins.length / closes.length) * 100 : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    best: closes.length ? Math.max(...closes.map((t) => t.realized)) : 0,
    worst: closes.length ? Math.min(...closes.map((t) => t.realized)) : 0,
    net: grossWin - grossLoss,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    worstStreak,
    charges,
    slExits,
    curve,
  };
}

function Sparkline({ values }) {
  if (values.length < 2) return null;
  const W = 600, H = 140, pad = 8;
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const x = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= 0;
  return (
    <svg className="perfCurve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Cumulative realised P&L over your closed trades">
      <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeDasharray="4 4" />
      <polyline points={pts} fill="none" stroke={up ? "var(--bull)" : "var(--bear)"} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PerformancePanel({ trades, fmtMoney, chargesOn, onToggleCharges, replayActive }) {
  const p = useMemo(() => computePerformance(trades), [trades]);
  const tips = [];
  if (p.count >= 3 && p.avgLoss > p.avgWin) tips.push("Your average loss is bigger than your average win. Try setting stop-losses closer to your entry, or letting winners run longer.");
  if (p.losses >= 3 && p.slExits === 0) tips.push("None of your exits came from a stop-loss. Placing a stop before you enter keeps one bad trade from undoing several good ones.");
  if (p.worstStreak >= 4) tips.push(`Your longest losing streak was ${p.worstStreak} trades. After 2–3 losses in a row, it often helps to pause and review before trading again.`);
  if (p.count >= 5 && p.winRate >= 50 && p.net > 0) tips.push("Good discipline — you're winning more often than not and net positive. Keep the same rules and review weekly.");

  const card = (label, value, tone = "") => (
    <div className="perfStat">
      <span className="dim">{label}</span>
      <span className={`mono perfVal ${tone}`}>{value}</span>
    </div>
  );

  return (
    <div className="perfWrap">
      <div className="histHead">
        <h3>Performance{replayActive ? " · this replay session" : ""}</h3>
      </div>
      {p.count === 0 ? (
        <div className="empty">No closed trades yet. Once you sell or close a position, your win rate, average win and loss, and habits show up here.</div>
      ) : (
        <>
          <div className="perfGrid">
            {card("Closed trades", p.count)}
            {card("Win rate", `${p.winRate.toFixed(0)}%`, p.winRate >= 50 ? "bull" : "bear")}
            {card("Net realised P&L", fmtMoney(p.net, 0), p.net >= 0 ? "bull" : "bear")}
            {card("Average win", fmtMoney(p.avgWin, 0), "bull")}
            {card("Average loss", fmtMoney(-p.avgLoss, 0), "bear")}
            {card("Profit factor", p.profitFactor == null ? "—" : p.profitFactor.toFixed(2), p.profitFactor != null && p.profitFactor >= 1 ? "bull" : "bear")}
            {card("Best trade", fmtMoney(p.best, 0), "bull")}
            {card("Worst trade", fmtMoney(p.worst, 0), "bear")}
            {card("Exits by stop-loss", `${p.slExits} of ${p.count}`)}
            {card("Longest losing streak", p.worstStreak)}
          </div>
          {p.curve.length >= 2 && (
            <div className="perfCurveCard">
              <div className="dim perfCurveLabel">Cumulative realised P&amp;L, trade by trade</div>
              <Sparkline values={p.curve} />
            </div>
          )}
          {tips.length > 0 && (
            <div className="perfTips">
              <h4>What your trades are telling you</h4>
              <ul>{tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
        </>
      )}

      <div className="chargesCard">
        <div className="chargesHead">
          <div>
            <h4>Realistic charges</h4>
            <p className="dim">Deduct approximate brokerage, STT, exchange fees, GST and stamp duty on every trade, like a real discount broker. Small intraday profits shrink fast once charges are counted.</p>
          </div>
          <button className={`indSwitch ${chargesOn ? "indSwitchOn" : ""}`} role="switch" aria-checked={chargesOn} aria-label="Deduct realistic charges on every trade" onClick={onToggleCharges}><span /></button>
        </div>
        {chargesOn && <div className="dim mono chargesTotal">Charges paid so far: {fmtMoney(p.charges)}</div>}
      </div>
    </div>
  );
}
