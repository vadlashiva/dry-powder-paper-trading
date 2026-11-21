// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { STRATEGIES, buildLegs, payoffAt, summarizePayoff, runBacktest } from "./strategyMath";
import { RuleTester } from "./ruleTester";

const INDEXES = [["^NSEI", "NIFTY"], ["^NSEBANK", "BANKNIFTY"], ["^BSESN", "SENSEX"]];
const MAX_LEGS = 6;
const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const showDate = (ms) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" });

function Chips({ items, value, onPick, label }) {
  return (
    <div className="stratChips" role="group" aria-label={label}>
      {items.map(([id, name]) => (
        <button key={id} type="button" className={`stratChip ${value === id ? "stratChipOn" : ""}`} aria-pressed={value === id} onClick={() => onPick(id)}>{name}</button>
      ))}
    </div>
  );
}

function PayoffChart({ legs, lot, lots, spot }) {
  const W = 640, H = 220, PAD = 24;
  const strikes = legs.map((l) => l.strike);
  const low = Math.min(spot, ...strikes), high = Math.max(spot, ...strikes);
  const margin = Math.max((high - low) * 0.6, spot * 0.04);
  const x0 = Math.max(low - margin, 1), x1 = high + margin;
  const pts = [];
  for (let i = 0; i <= 160; i++) { const S = x0 + ((x1 - x0) * i) / 160; pts.push([S, payoffAt(legs, S, lot, lots)]); }
  const ys = pts.map((p) => p[1]);
  const top = Math.max(...ys, 1), bottom = Math.min(...ys, -1);
  const px = (S) => PAD + ((S - x0) / (x1 - x0)) * (W - PAD * 2);
  const py = (v) => PAD + ((top - v) / (top - bottom)) * (H - PAD * 2);
  const line = pts.map(([S, v]) => `${px(S).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const zero = py(0);
  const id = `pay${Math.round(zero)}`;
  return (
    <svg className="payoffChart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Profit and loss at expiry across index levels">
      <defs>
        <clipPath id={`${id}a`}><rect x="0" y="0" width={W} height={zero} /></clipPath>
        <clipPath id={`${id}b`}><rect x="0" y={zero} width={W} height={H - zero} /></clipPath>
      </defs>
      <line x1={PAD} x2={W - PAD} y1={zero} y2={zero} className="payoffAxis" />
      <line x1={px(spot)} x2={px(spot)} y1={PAD - 8} y2={H - PAD} className="payoffSpot" />
      <text x={px(spot)} y={13} textAnchor="middle" className="payoffText">Now {Math.round(spot)}</text>
      <polyline points={line} clipPath={`url(#${id}a)`} className="payoffGain" />
      <polyline points={line} clipPath={`url(#${id}b)`} className="payoffLoss" />
      <text x={PAD} y={H - 6} className="payoffText">{Math.round(x0)}</text>
      <text x={W - PAD} y={H - 6} textAnchor="end" className="payoffText">{Math.round(x1)}</text>
    </svg>
  );
}

function EquityChart({ curve }) {
  const W = 640, H = 170, PAD = 12;
  const vals = [0, ...curve];
  const top = Math.max(...vals), bottom = Math.min(...vals), span = top - bottom || 1;
  const x = (i) => PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2);
  const y = (v) => PAD + ((top - v) / span) * (H - PAD * 2);
  return (
    <svg className="payoffChart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Running profit and loss across backtest trades">
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="payoffAxis" />
      <polyline points={vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} className={curve[curve.length - 1] >= 0 ? "payoffGain" : "payoffLoss"} />
    </svg>
  );
}

const Stat = ({ label, value, tone = "" }) => (
  <div className="stratStat"><span className="dim">{label}</span><b className={`mono ${tone}`}>{value}</b></div>
);

function Builder({ api }) {
  const { getSpot, expiriesFor, stepFor, lotFor, priceLeg, onPlace, marketOpen, fmtMoney, fmtExpiry, now } = api;
  const [sym, setSym] = useState("^NSEI");
  const [stratId, setStratId] = useState("iron_condor");
  const [expiryChoice, setExpiryChoice] = useState(null);
  const [lots, setLots] = useState(1);
  const [legs, setLegs] = useState([]);
  const spot = getSpot(sym);
  const step = stepFor(sym);
  const lot = lotFor(sym);
  const expiries = useMemo(() => expiriesFor(sym), [sym, expiriesFor]);
  // An expiry that's less than a day away has almost no premium left, so start on the next one.
  const expiryIdx = expiryChoice ?? (expiries[0] && expiries[0].getTime() - now() < 86400000 && expiries[1] ? 1 : 0);
  const expiry = (expiries[expiryIdx] ?? expiries[0])?.getTime();
  const atm = spot ? Math.round(spot / step) * step : null;
  const hasSpot = !!atm;
  const applyStrategy = (id) => {
    setStratId(id);
    const s = STRATEGIES.find((x) => x.id === id);
    if (s && atm) setLegs(buildLegs(s, atm, step));
  };
  useEffect(() => { applyStrategy(stratId); }, [sym, hasSpot]);

  const priced = legs.map((l) => ({ ...l, premium: expiry ? priceLeg(sym, l.strike, l.type, expiry) ?? 0 : 0 }));
  const sum = summarizePayoff(priced, lot, lots);
  const setLeg = (i, patch) => setLegs((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const money = (v) => (v === Infinity ? "Unlimited" : v === -Infinity ? "Unlimited" : fmtMoney(v, 0));
  const strat = STRATEGIES.find((s) => s.id === stratId);
  const strikeOptions = (cur) => {
    const base = atm ?? cur;
    const out = new Set([cur]);
    for (let i = -14; i <= 14; i++) out.add(base + i * step);
    return [...out].sort((a, b) => a - b);
  };
  if (!spot) return <div className="dim stratEmpty">Index price is still loading…</div>;
  return (
    <>
      <Chips label="Index" items={INDEXES} value={sym} onPick={(s) => { setSym(s); setExpiryChoice(null); }} />
      <div className="stratRow">
        <label>Expiry
          <select value={expiryIdx} onChange={(e) => setExpiryChoice(Number(e.target.value))}>
            {expiries.map((d, i) => <option key={d.getTime()} value={i}>{fmtExpiry(d)}</option>)}
          </select>
        </label>
        <label>Lots ({lot} units each)
          <input type="number" min="1" max="100" inputMode="numeric" value={lots} onChange={(e) => setLots(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))} />
        </label>
      </div>
      <h4>Ready-made strategies</h4>
      <Chips label="Strategy" items={STRATEGIES.map((s) => [s.id, s.name])} value={stratId} onPick={applyStrategy} />
      {strat && <p className="dim stratDesc"><b>{strat.view}.</b> {strat.desc}</p>}
      <h4>Legs</h4>
      <div className="stratLegs">
        {priced.map((l, i) => (
          <div className="stratLeg" key={i}>
            <button type="button" className={`stratToggle ${l.side === "buy" ? "bull" : "bear"}`} aria-label={`Leg ${i + 1}: ${l.side}. Switch side`} onClick={() => { setStratId(""); setLeg(i, { side: l.side === "buy" ? "sell" : "buy" }); }}>{l.side === "buy" ? "Buy" : "Sell"}</button>
            <button type="button" className="stratToggle" aria-label={`Leg ${i + 1}: ${l.type}. Switch type`} onClick={() => { setStratId(""); setLeg(i, { type: l.type === "call" ? "put" : "call" }); }}>{l.type === "call" ? "Call" : "Put"}</button>
            <select aria-label={`Leg ${i + 1} strike`} value={l.strike} onChange={(e) => { setStratId(""); setLeg(i, { strike: Number(e.target.value) }); }}>
              {strikeOptions(l.strike).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span className="mono stratPrem">{fmtMoney(l.premium)}</span>
            <button type="button" className="stratRemove" aria-label={`Remove leg ${i + 1}`} onClick={() => { setStratId(""); setLegs((ls) => ls.filter((_, n) => n !== i)); }}>×</button>
          </div>
        ))}
        {!priced.length && <div className="dim stratEmpty">Add a leg to start.</div>}
      </div>
      {legs.length < MAX_LEGS && (
        <button type="button" className="btn btnGhost stratAdd" onClick={() => { setStratId(""); setLegs((ls) => [...ls, { side: "buy", type: "call", strike: atm }]); }}>+ Add leg</button>
      )}
      {priced.length > 0 && (
        <>
          <h4>Profit or loss at expiry</h4>
          <PayoffChart legs={priced} lot={lot} lots={lots} spot={spot} />
          <div className="stratStats">
            <Stat label={sum.net >= 0 ? "Premium received" : "Premium paid"} value={fmtMoney(Math.abs(sum.net), 0)} />
            <Stat label="Max profit" value={money(sum.maxProfit)} tone="bull" />
            <Stat label="Max loss" value={money(sum.maxLoss)} tone="bear" />
            <Stat label="Breakeven" value={sum.breakevens.length ? sum.breakevens.map((b) => Math.round(b)).join(" / ") : "None"} />
          </div>
          <button type="button" className="btn btnBull stratPlace" disabled={!marketOpen} onClick={() => onPlace(sym, expiry, priced, lots)}>Place all {priced.length} leg{priced.length > 1 ? "s" : ""}</button>
          {!marketOpen && <div className="dim stratNote">Orders open during market hours. Press Practice today to try this in Replay.</div>}
        </>
      )}
    </>
  );
}

function Backtest({ api }) {
  const { fetchDaily, backtestConfig, fmtMoney } = api;
  const [sym, setSym] = useState("^NSEI");
  const [stratId, setStratId] = useState("iron_condor");
  const [from, setFrom] = useState(isoDaysAgo(365));
  const [to, setTo] = useState(isoDaysAgo(1));
  const [entry, setEntry] = useState("weekly");
  const [hold, setHold] = useState(5);
  const [lots, setLots] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const run = async () => {
    if (from >= to) return setError("The start date must be before the end date.");
    setBusy(true); setError(""); setResult(null);
    try {
      const candles = await fetchDaily(sym, from, to);
      const res = runBacktest(candles, { strategy: STRATEGIES.find((s) => s.id === stratId), lots, hold, entry, ...backtestConfig(sym) });
      if (!res.trades.length) setError("No complete trades in those dates. Try a longer period.");
      else setResult(res);
    } catch {
      setError("Couldn't load price history. Please try again.");
    }
    setBusy(false);
  };
  const tone = (v) => (v >= 0 ? "bull" : "bear");
  return (
    <>
      <p className="dim stratDesc">Replay a strategy on past index prices. Option prices here are calculated with a fixed volatility, not real historical premiums, and charges aren't included, so treat results as a rough learning guide.</p>
      <Chips label="Index" items={INDEXES} value={sym} onPick={setSym} />
      <h4>Strategy</h4>
      <Chips label="Strategy" items={STRATEGIES.map((s) => [s.id, s.name])} value={stratId} onPick={setStratId} />
      <div className="stratRow">
        <label>From<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} max={isoDaysAgo(1)} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="stratRow">
        <label>Enter
          <select value={entry} onChange={(e) => setEntry(e.target.value)}><option value="weekly">First trading day each week</option><option value="daily">Every day</option></select>
        </label>
        <label>Hold (trading days)
          <input type="number" min="1" max="30" inputMode="numeric" value={hold} onChange={(e) => setHold(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} />
        </label>
        <label>Lots
          <input type="number" min="1" max="100" inputMode="numeric" value={lots} onChange={(e) => setLots(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))} />
        </label>
      </div>
      <button type="button" className="btn btnBull stratPlace" disabled={busy} onClick={run}>{busy ? "Running…" : "Run backtest"}</button>
      {error && <div className="stratError" role="alert">{error}</div>}
      {result && (
        <>
          <div className="stratStats">
            <Stat label="Net P&L" value={fmtMoney(result.net, 0)} tone={tone(result.net)} />
            <Stat label="Trades" value={result.trades.length} />
            <Stat label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
            <Stat label="Max drawdown" value={fmtMoney(result.maxDrawdown, 0)} tone="bear" />
            <Stat label="Best trade" value={fmtMoney(result.best, 0)} tone="bull" />
            <Stat label="Worst trade" value={fmtMoney(result.worst, 0)} tone="bear" />
          </div>
          <h4>Running P&amp;L</h4>
          <EquityChart curve={result.curve} />
          <h4>Trades</h4>
          <div className="stratLog">
            <table>
              <thead><tr><th>Entry</th><th>Exit</th><th>Strike</th><th>Index move</th><th>P&amp;L</th></tr></thead>
              <tbody>
                {[...result.trades].reverse().map((t) => (
                  <tr key={t.entryAt}>
                    <td>{showDate(t.entryAt)}</td><td>{showDate(t.exitAt)}</td><td className="mono">{t.atm}</td>
                    <td className="mono">{Math.round(t.entrySpot)} → {Math.round(t.exitSpot)}</td>
                    <td className={`mono ${tone(t.pnl)}`}>{fmtMoney(t.pnl, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function StrategyPanel({ api }) {
  const [view, setView] = useState("builder");
  return (
    <div className="stratWrap">
      <div className="stratHead">
        <h3>Strategies</h3>
        <Chips label="Strategy tools" items={[["builder", "Builder"], ["backtest", "Backtest"], ["rules", "Rule tester"]]} value={view} onPick={setView} />
      </div>
      {view === "builder" ? <Builder api={api} /> : view === "backtest" ? <Backtest api={api} /> : <RuleTester api={api} />}
      <div className="dim stratNote">For education only. Premiums are model estimates, not exchange quotes, and nothing here is a recommendation.</div>
    </div>
  );
}
