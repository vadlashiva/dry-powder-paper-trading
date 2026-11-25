// The user's chosen broker. PaperRally keeps no price feed of its own: each user's prices
// come from their own broker connection, straight to their device.
import * as angel from "./angel";
import * as fyers from "./fyers";
import * as upstox from "./upstox";
import * as sim from "./sim";
import { read, write, isoDay } from "./brokerUtil";

export const BROKERS = {
  angel: { id: "angel", name: "Angel One", api: angel, site: "https://smartapi.angelone.in/", needsSecret: false, keyLabel: "SmartAPI key" },
  fyers: { id: "fyers", name: "FYERS", api: fyers, site: "https://myapi.fyers.in/dashboard", needsSecret: true, keyLabel: "App ID" },
  upstox: { id: "upstox", name: "Upstox", api: upstox, site: "https://account.upstox.com/developer/apps", needsSecret: true, keyLabel: "API key" },
  // Simulated prices for practising without a broker account (see sim.js).
  sim: { id: "sim", name: "Practice market", api: sim, site: "", needsSecret: false, keyLabel: "", simulated: true },
};
const STORE = "pr_broker";
export const activeBroker = () => BROKERS[read(STORE)] || (angel.hasCredentials() ? BROKERS.angel : null);
export const chooseBroker = (id) => { write(STORE, id); try { window.dispatchEvent(new Event("pr-broker-changed")); } catch { /* no window */ } };
export const isSimulated = () => !!activeBroker()?.simulated;
// The market's clock: real time with a broker; the practice market's own clock without one (see sim.js).
export const marketNow = () => { const b = activeBroker(); return b?.api.clockNow ? b.api.clockNow() : Date.now(); };
const api = () => {
  const b = activeBroker();
  if (!b) throw new Error("No broker connected");
  return b.api;
};

// Calls that need a broker reject (rather than throw at once) when none is connected, so a caller's
// .catch() handles it instead of it surfacing as an uncaught "No broker connected" error.
const viaApi = (fn) => { try { return Promise.resolve(fn(api())); } catch (e) { return Promise.reject(e); } };

export const fetchQuotes = (symbols) => viaApi((a) => a.fetchQuotes(symbols));
// Real option premiums, where the connected broker supplies them. Brokers without this return nothing,
// and the app falls back to its calculated premium.
export const fetchOptionQuotes = (contracts) => viaApi((a) => (a.fetchOptionQuotes ? a.fetchOptionQuotes(contracts) : {}));

const RANGE_DAYS = { "1d": 6, "5d": 8, "1mo": 32, "6mo": 190, "1y": 370 };
async function chartJson({ symbol, interval, range, period1, period2 }) {
  const now = marketNow();
  const toMs = period2 ? Math.min(Number(period2) * 1000, now) : now;
  const fromMs = period1 ? Number(period1) * 1000 : now - (RANGE_DAYS[range] ?? 8) * 86400000;
  let candles = await api().fetchCandles({ symbol, interval, fromMs, toMs });
  if (range === "1d" && candles.length) { // the latest session only
    const day = isoDay(candles[candles.length - 1].t * 1000);
    candles = candles.filter((k) => isoDay(k.t * 1000) === day);
  }
  const last = candles[candles.length - 1]?.c;
  const live = period1 ? null : (await fetchQuotes([symbol]))[symbol];
  return { chart: { result: [{
    meta: { regularMarketPrice: live?.price ?? last, previousClose: live?.prevClose ?? candles[0]?.o, chartPreviousClose: live?.prevClose ?? candles[0]?.o },
    timestamp: candles.map((k) => k.t),
    indicators: { quote: [{ open: candles.map((k) => k.o), high: candles.map((k) => k.h), low: candles.map((k) => k.l), close: candles.map((k) => k.c) }] },
  }] } };
}

// The app's price code still builds its old feed addresses. Each one is answered here from the user's broker.
export function answerFeedRequest(url) {
  const qs = new URL(url).searchParams;
  if (qs.get("type") === "search") {
    if (Number(qs.get("newsCount")) > 0) return Promise.resolve({ news: [] }); // brokers have no news feed here
    return viaApi((a) => a.searchStocks(qs.get("q"))).then((rows) => ({ quotes: rows.map((r) => ({ symbol: r.symbol, quoteType: "EQUITY", longname: r.name })) }));
  }
  return chartJson({ symbol: qs.get("symbol"), interval: qs.get("interval"), range: qs.get("range"), period1: qs.get("period1"), period2: qs.get("period2") });
}
