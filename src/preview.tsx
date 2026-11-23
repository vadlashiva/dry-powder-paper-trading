// @ts-nocheck
// A read-only look at PaperRally for people who haven't connected a broker yet.
// Everything here is made-up sample data drawn on the device: no prices are fetched,
// nothing is saved, and no trade can be placed. Trading opens once the broker is connected.
import { useMemo, useState } from "react";
import { track } from "./growth";

const TABS = [["chart", "Chart"], ["chain", "Option chain"], ["portfolio", "Portfolio"]];

// Small seeded random generator, so the sample looks the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function sampleCandles() {
  const r = rng(240115);
  let p = 24012;
  const out = [];
  for (let i = 0; i < 60; i++) {
    const drift = i < 20 ? 2.2 : i < 38 ? -1.6 : 2.8;
    const o = p;
    const c = o + drift + (r() - 0.5) * 26;
    const h = Math.max(o, c) + r() * 10;
    const l = Math.min(o, c) - r() * 10;
    out.push({ o, h, l, c });
    p = c;
  }
  return out;
}

const fmt = (n, d = 2) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

function Candles({ data }) {
  const W = 600, H = 240, pad = 8;
  const hi = Math.max(...data.map((k) => k.h)), lo = Math.min(...data.map((k) => k.l));
  const y = (v) => pad + ((hi - v) / (hi - lo)) * (H - 2 * pad);
  const step = W / data.length;
  return (
    <svg className="pvChart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Sample NIFTY 50 candlestick chart">
      {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="pvGrid" />)}
      {data.map((k, i) => {
        const x = i * step + step / 2, up = k.c >= k.o;
        return (
          <g key={i} className={up ? "pvUp" : "pvDown"}>
            <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} />
            <rect x={x - step * 0.32} width={step * 0.64} y={y(Math.max(k.o, k.c))} height={Math.max(1, Math.abs(y(k.o) - y(k.c)))} />
          </g>
        );
      })}
    </svg>
  );
}

function sampleChain(spot) {
  const atm = Math.round(spot / 50) * 50;
  const r = rng(77);
  return [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((k) => {
    const strike = atm + k * 50;
    const call = Math.max(2, spot - strike) + 95 * Math.exp(-Math.abs(spot - strike) / 210);
    const put = Math.max(2, strike - spot) + 95 * Math.exp(-Math.abs(spot - strike) / 210);
    const oi = (base) => Math.round((base + r() * 40) * 1e5 * (1.3 - Math.abs(k) * 0.08));
    return { strike, atm: k === 0, call, put, callOi: oi(k > 0 ? 60 : 25), putOi: oi(k < 0 ? 60 : 25) };
  });
}

const POSITIONS = [
  { name: "NIFTY 24100 CE", qty: 75, avg: 112.4, ltp: 131.85 },
  { name: "RELIANCE", qty: 20, avg: 1418.2, ltp: 1409.6 },
  { name: "TCS", qty: 8, avg: 3291.0, ltp: 3342.75 },
];

export function AppPreview({ brand, onConnect, onPractice }) {
  const [tab, setTab] = useState("chart");
  const [locked, setLocked] = useState(false);
  const candles = useMemo(sampleCandles, []);
  const last = candles[candles.length - 1].c;
  const chg = last - candles[0].o;
  const chain = useMemo(() => sampleChain(last), [last]);
  const pick = (id) => { setTab(id); setLocked(false); track("preview_tab", { tab: id }); };
  const tryTrade = (what) => { setLocked(true); track("preview_trade_attempt", { tab, what }); };
  const connect = (from) => { track("preview_connect_click", { tab, from }); onConnect(); };
  const pnl = POSITIONS.reduce((s, p) => s + (p.ltp - p.avg) * p.qty, 0);

  return (
    <div className="authCard pvCard">
      {brand}
      <h1>Take a look around</h1>
      <div className="authSub">This is how PaperRally works. You start trading once your broker is connected.</div>
      <div className="pvBadge" role="note">Sample data, not live prices</div>
      <div className="pvTabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "pvTabOn" : ""} onClick={() => pick(id)}>{label}</button>
        ))}
      </div>

      {tab === "chart" && (
        <div role="tabpanel">
          <div className="pvQuote">
            <b>NIFTY 50</b>
            <span className="mono">{fmt(last)}</span>
            <span className={`mono ${chg >= 0 ? "pvPos" : "pvNeg"}`}>{chg >= 0 ? "+" : ""}{fmt(chg)} ({fmt((chg / candles[0].o) * 100)}%)</span>
          </div>
          <Candles data={candles} />
          <div className="pvActions">
            <button type="button" className="btn btnBull" onClick={() => tryTrade("buy")}>Buy</button>
            <button type="button" className="btn pvSell" onClick={() => tryTrade("sell")}>Sell</button>
          </div>
        </div>
      )}

      {tab === "chain" && (
        <div role="tabpanel" className="pvTableWrap">
          <table className="pvTable">
            <thead><tr><th>Call OI</th><th>Call LTP</th><th>Strike</th><th>Put LTP</th><th>Put OI</th></tr></thead>
            <tbody>
              {chain.map((c) => (
                <tr key={c.strike} className={c.atm ? "pvAtm" : ""}>
                  <td className="mono dim">{(c.callOi / 1e5).toFixed(1)}L</td>
                  <td><button type="button" className="pvLtp mono" onClick={() => tryTrade("call")}>{fmt(c.call)}</button></td>
                  <td className="mono"><b>{c.strike}</b></td>
                  <td><button type="button" className="pvLtp mono" onClick={() => tryTrade("put")}>{fmt(c.put)}</button></td>
                  <td className="mono dim">{(c.putOi / 1e5).toFixed(1)}L</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dim pvHint">Tap a price to buy that option.</div>
        </div>
      )}

      {tab === "portfolio" && (
        <div role="tabpanel">
          <div className="pvTiles">
            <div><span className="dim">Virtual capital</span><b className="mono">₹10,00,000</b></div>
            <div><span className="dim">Open P&amp;L</span><b className={`mono ${pnl >= 0 ? "pvPos" : "pvNeg"}`}>{pnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(pnl))}</b></div>
          </div>
          {POSITIONS.map((p) => {
            const v = (p.ltp - p.avg) * p.qty;
            return (
              <div key={p.name} className="pvPos_row">
                <div><b>{p.name}</b><span className="dim mono">{p.qty} × {fmt(p.avg)}</span></div>
                <div className="pvRight"><span className="mono">{fmt(p.ltp)}</span><span className={`mono ${v >= 0 ? "pvPos" : "pvNeg"}`}>{v >= 0 ? "+" : "−"}{fmt(Math.abs(v))}</span></div>
                <button type="button" className="btn btnGhost pvExit" onClick={() => tryTrade("exit")}>Exit</button>
              </div>
            );
          })}
        </div>
      )}

      {locked && (
        <div className="pvLock" role="status">
          Trading opens once your broker is connected, so every price you trade at is a real market price.
        </div>
      )}
      <button type="button" className="btn btnBull authSubmit pvCta" onClick={() => connect(locked ? "lock" : "cta")}>Connect your broker to start trading</button>
      {onPractice && <button type="button" className="btn btnGhost authSubmit pvCta practiceBlink" style={{ marginTop: 8 }} onClick={() => onPractice(locked ? "preview_lock" : "preview")}>No broker? Practise with a simulated market</button>}
      <div className="dim angelNote">Takes about 3 minutes, once. All trades use virtual money; PaperRally can't place real orders.</div>
    </div>
  );
}

export const PREVIEW_CSS = `
.practiceBlink { border: 1px solid #F5B82E; color: #FFE3A3; animation: practiceBlink 1.6s ease-in-out infinite; }
@keyframes practiceBlink {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,184,46,0); background: var(--surface-2); }
  50% { box-shadow: 0 0 0 6px rgba(245,184,46,0.28); background: color-mix(in srgb, #F5B82E 18%, var(--surface-2)); }
}
@media (prefers-reduced-motion: reduce) { .practiceBlink { animation: none; box-shadow: 0 0 0 3px rgba(245,184,46,0.35); } }
.pvCard { max-width: 480px; width: 100%; box-sizing: border-box; }
.pvCard h1 { font-size: 20px; margin: 12px 0 8px; }
.pvBadge { display: inline-block; margin: 12px 0 4px; font-size: 11.5px; font-weight: 600; color: var(--amber); background: color-mix(in srgb, var(--amber) 14%, transparent); padding: 4px 10px; border-radius: 20px; }
.pvTabs { display: flex; gap: 4px; margin: 10px 0 12px; border-bottom: 1px solid var(--border); }
.pvTabs button { background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-dim); font: inherit; font-size: 13px; font-weight: 600; padding: 8px 10px; cursor: pointer; }
.pvTabs .pvTabOn { color: var(--text); border-bottom-color: var(--accent); }
.pvQuote { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 14px; margin-bottom: 8px; }
.pvChart { width: 100%; height: 200px; display: block; background: var(--surface-2); border-radius: 8px; }
.pvGrid { stroke: var(--border); stroke-width: 1; }
.pvUp line, .pvUp rect { stroke: var(--bull); fill: var(--bull); }
.pvDown line, .pvDown rect { stroke: var(--bear); fill: var(--bear); }
.pvPos { color: var(--bull); }
.pvNeg { color: var(--bear); }
.pvActions { display: flex; gap: 8px; margin-top: 10px; }
.pvSell { background: var(--bear); color: white; }
.pvTableWrap { overflow-x: auto; }
.pvTable { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pvTable th { color: var(--text-dim); font-weight: 600; font-size: 11.5px; padding: 6px 4px; text-align: center; border-bottom: 1px solid var(--border); }
.pvTable td { text-align: center; padding: 3px 4px; border-bottom: 1px solid var(--border); }
.pvAtm td { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.pvLtp { background: none; border: 1px solid transparent; border-radius: 6px; color: var(--text); font-size: 12.5px; padding: 4px 6px; cursor: pointer; }
.pvLtp:hover { border-color: var(--accent); }
.pvHint { font-size: 12px; margin-top: 8px; }
.pvTiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
.pvTiles > div { background: var(--surface-2); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.pvTiles b { font-size: 16px; }
.pvPos_row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.pvPos_row > div:first-child { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pvRight { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.pvExit { flex: none; padding: 6px 10px; font-size: 12px; }
.pvLock { margin-top: 12px; font-size: 13px; line-height: 1.5; padding: 10px 12px; border-radius: 8px; background: color-mix(in srgb, var(--accent) 16%, transparent); border: 1px solid var(--accent); }
.pvCta { margin-top: 14px; width: 100%; }
.setupChoices { display: grid; gap: 8px; margin: 16px 0 6px; }
.setupChoices .btn { padding: 13px; font-size: 15px; }
.setupVideo { display: flex; justify-content: center; margin: 4px 0 12px; text-decoration: none; padding: 10px; }
.setupShot { display: block; width: 100%; border-radius: 8px; border: 1px solid var(--border); margin: 4px 0 12px; }
`;
