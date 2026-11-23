// Pure money and lot-size logic, kept here so it can be unit tested (see logic.test.js).
// Any change to how positions are valued must keep those tests passing.

export const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };
export const MONTHS3 = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const IST_MS = 5.5 * 3600 * 1000;

// "DEC-26" for an expiry time, using the Indian calendar day.
export const monthKey = (ms) => {
  const d = new Date(ms + IST_MS);
  return `${MONTHS3[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};
const monthOrder = (k) => MONTHS3.indexOf(k.slice(0, 3)) + 12 * Number(k.slice(4));

// Lot size of a contract on `ticker` (display ticker, e.g. "COCHINSHIP") expiring at `expiryMs`,
// from NSE's per-month table. Returns null when it is not known.
export function lotSizeFrom(table, ticker, expiryMs) {
  if (ticker === "SENSEX") return expiryMs >= Date.UTC(2027, 0, 1) - IST_MS ? 25 : 20; // BSE: 25 from Jan-2027 expiries
  const row = table?.[ticker];
  if (row) {
    const exact = row[monthKey(expiryMs)];
    if (exact) return exact;
    const keys = Object.keys(row).sort((a, b) => monthOrder(a) - monthOrder(b));
    // later than the table: newest known lot; earlier than the table: oldest known lot
    if (!keys.length) return null;
    return monthOrder(monthKey(expiryMs)) > monthOrder(keys[keys.length - 1]) ? row[keys[keys.length - 1]] : row[keys[0]];
  }
  return LOT_SIZES[ticker] ?? null;
}

// Units per lot for a held option position: the lot it was opened with. Positions saved
// before lots were stored used the fixed index lots, or 1 for stock options.
export const positionMultiplier = (p, ticker) => (p.lot ? p.lot : p.lotBased ? (LOT_SIZES[ticker] ?? 1) : 1);

export const isShortPos = (p) => p.side === "short";
export const optionPnl = (p, price, mult) => (isShortPos(p) ? p.avgPremium - price : price - p.avgPremium) * mult * p.qty;
export const optionMarketValue = (p, price, mult) => (isShortPos(p) ? -1 : 1) * price * mult * p.qty;

// Simplified exchange margin for selling one lot.
export function shortMarginPerLot(spot, strike, type, lot) {
  const contract = spot * lot;
  const otm = Math.max(0, type === "call" ? strike - spot : spot - strike) * lot;
  return Math.round(Math.max(0.09 * contract - 0.5 * otm, 0.04 * contract));
}

// ---- Portfolio storage with versioning, so two devices never overwrite each other ----
export async function fetchPortfolioVersionWith(client, userId) {
  const { data, error } = await client.from("portfolios").select("updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.updated_at ?? null;
}
// Saves only if nobody else saved since `version`. Returns { ok, version } | { conflict: true } | { ok: false }.
export async function savePortfolioVersionedWith(client, userId, payload, version, now = new Date().toISOString()) {
  if (!version) {
    const { data, error } = await client.from("portfolios").upsert({ user_id: userId, data: payload, updated_at: now }).select("updated_at").maybeSingle();
    if (error) { console.error("portfolio save failed", error); return { ok: false }; }
    return { ok: true, version: data?.updated_at ?? now };
  }
  const { data, error } = await client.from("portfolios").update({ data: payload, updated_at: now }).eq("user_id", userId).eq("updated_at", version).select("updated_at");
  if (error) { console.error("portfolio save failed", error); return { ok: false }; }
  if (!data || data.length === 0) {
    // If the stored version is still ours, the mismatch was only a timestamp-format difference.
    const cur = await fetchPortfolioVersionWith(client, userId).catch(() => undefined);
    if (!cur || Date.parse(cur) !== Date.parse(version)) return { conflict: true };
    const r = await client.from("portfolios").upsert({ user_id: userId, data: payload, updated_at: now }).select("updated_at").maybeSingle();
    if (r.error) { console.error("portfolio save failed", r.error); return { ok: false }; }
    return { ok: true, version: r.data?.updated_at ?? now };
  }
  return { ok: true, version: data[0].updated_at };
}

// ---- Product type: intraday (MIS) or carry-forward (CNC for stocks, NRML for F&O) ----
// Positions saved before product types existed have no `product` and count as carry-forward.
export const MIS = "MIS";
export const CF = "CF";
export const productOf = (p) => (p && p.product === MIS ? MIS : CF);
export const isIntraday = (p) => productOf(p) === MIS;
// Intraday stock trades block 20% of the order value (5x leverage), like a discount broker.
export const MIS_STOCK_MARGIN = 0.2;
// Cash an order of `qty` shares at `price` takes from the account.
export const stockCashNeeded = (price, qty, product) => price * qty * (product === MIS ? MIS_STOCK_MARGIN : 1);
// What a stock position is worth in the account at `price`: shares for delivery,
// blocked margin plus profit or loss for intraday.
export const stockPositionValue = (p, price) =>
  isIntraday(p) ? (p.margin || 0) + (price - p.avgPrice) * p.qty : price * p.qty;
// Cash returned when `qty` shares of position `p` are sold at `price`.
export const stockSaleCash = (p, price, qty) =>
  isIntraday(p) ? (p.margin || 0) * (qty / p.qty) + (price - p.avgPrice) * qty : price * qty;

// Intraday positions are squared off at 3:20 PM IST on the day they were opened.
export const SQUARE_OFF_MIN = 15 * 60 + 20;
const istDay = (ms) => Math.floor((ms + IST_MS) / 86400000);
const istMinute = (ms) => Math.floor(((ms + IST_MS) % 86400000) / 60000);
// True once 3:20 PM IST has passed on the day `openedAt` falls on (or a later day has started).
export const squareOffDue = (openedAt, now) =>
  istDay(now) > istDay(openedAt ?? now) || istMinute(now) >= SQUARE_OFF_MIN;
// True when new intraday orders are no longer accepted today.
export const intradayClosed = (now) => istMinute(now) >= SQUARE_OFF_MIN;
