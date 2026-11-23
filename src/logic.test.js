// Unit tests for PaperRally's core calculations. Run with: npm test -- --watchAll=false
import { STRATEGIES, buildLegs, payoffAt, summarizePayoff } from "./strategyMath";
import { computeCharges } from "./extras";
import { cleanKey, keyProblem } from "./brokerSetup";
import { BASE, groupDays, runAll } from "./ruleTester";

const near = (a, b, eps = 0.01) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("option strategy payoff", () => {
  const withPremium = (legs, prem) => legs.map((l, i) => ({ ...l, premium: prem[i] }));

  test("long call: loses the premium below the strike, breaks even at strike + premium", () => {
    const legs = withPremium(buildLegs(STRATEGIES.find((s) => s.id === "long_call"), 25000, 50), [100]);
    expect(payoffAt(legs, 24000, 65, 1)).toBe(-100 * 65);
    expect(payoffAt(legs, 25300, 65, 1)).toBe(200 * 65);
    const sum = summarizePayoff(legs, 65, 1);
    expect(sum.maxProfit).toBe(Infinity);
    expect(sum.maxLoss).toBe(-6500);
    expect(sum.breakevens).toEqual([25100]);
  });

  test("iron condor: limited profit and limited loss", () => {
    const legs = withPremium(buildLegs(STRATEGIES.find((s) => s.id === "iron_condor"), 25000, 50), [60, 20, 55, 18]);
    const sum = summarizePayoff(legs, 65, 1);
    const credit = (60 - 20 + 55 - 18) * 65;
    near(sum.maxProfit, credit);
    near(sum.maxLoss, -(200 * 65 - credit)); // wing width 4 strikes × 50 = 200 points
    expect(sum.breakevens.length).toBe(2);
  });
});

describe("realistic charges", () => {
  test("equity buy of ₹1,00,000: brokerage capped at ₹20, no STT, stamp duty applies", () => {
    const c = computeCharges("BUY 10 RELIANCE", -100000);
    expect(c.brokerage).toBe(20);
    expect(c.stt).toBe(0);
    near(c.stamp, 3);
    near(c.total, 20 + 2.97 + 0.1 + 3 + (20 + 2.97 + 0.1) * 0.18);
  });
  test("equity sell pays STT, not stamp duty", () => {
    const c = computeCharges("SELL 10 RELIANCE", 100000);
    near(c.stt, 25);
    expect(c.stamp).toBe(0);
  });
  test("option buy: flat ₹20 brokerage, no STT", () => {
    const c = computeCharges("BTO 1 NIFTY 25000 CE", -5000);
    expect(c.brokerage).toBe(20);
    expect(c.stt).toBe(0);
  });
  test("nothing traded, no charges", () => {
    expect(computeCharges("BUY 0 X", 0)).toBeNull();
  });
});

describe("broker key cleaning", () => {
  test("strips spaces, hidden characters, quotes and labels", () => {
    expect(cleanKey(" Ab3dE9xQ \n")).toBe("Ab3dE9xQ");
    expect(cleanKey("API Key: Ab3dE9xQ")).toBe("Ab3dE9xQ");
    expect(cleanKey("​Ab3d E9xQ")).toBe("Ab3dE9xQ");
    expect(cleanKey("'Ab3dE9xQ'")).toBe("Ab3dE9xQ");
    expect(cleanKey("KeyAb12cd")).toBe("KeyAb12cd"); // a key that merely starts with "Key" is kept
  });
  test("explains what is wrong", () => {
    expect(keyProblem("angel", "")).toBe("empty");
    expect(keyProblem("angel", "3f2a9c1e-77b4-4d2e-9a10-5c8e2b7d1f00")).toBe("secret");
    expect(keyProblem("upstox", "3f2a9c1e-77b4-4d2e-9a10-5c8e2b7d1f00")).toBe(""); // Upstox keys are UUIDs
    expect(keyProblem("angel", "Ab3")).toBe("short");
    expect(keyProblem("angel", "Ab3d:E9xQ")).toBe("chars");
    expect(keyProblem("angel", "Ab3dE9xQ")).toBe("");
  });
});

describe("rule tester engine", () => {
  // Build one trading day of 5-minute candles from a list of [HH:MM, open, high, low, close].
  const IST = 19800000;
  const day = (date, bars) => bars.map(([t, o, h, l, c]) => ({ time: Date.parse(`${date}T${t}:00Z`) - IST, open: o, high: h, low: l, close: c }));
  const flat = (from, to, p) => {
    const out = [];
    for (let m = from; m < to; m += 5) out.push([`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, p, p + 1, p - 1, p]);
    return out;
  };

  test("15-min opening breakout: long entry, target hit, +2R", () => {
    const bars = [
      ["09:15", 100, 110, 100, 105], ["09:20", 105, 110, 101, 106], ["09:25", 106, 110, 102, 107], // 1st 15-min candle: high 110, low 100
      ["09:30", 107, 111, 106, 110], ["09:35", 110, 112, 109, 111], ["09:40", 111, 113, 110, 112], // 2nd closes 112 > 110: buy at 112
      ["09:45", 112, 125, 111, 124], ["09:50", 124, 137, 123, 136],                                // target = 112 + 2 × 12 = 136
      ...flat(595, 930, 136),
    ];
    const { trades } = runAll(groupDays(day("2026-11-23", bars)), { ...BASE });
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.side).toBe(1);
    expect(t.entry).toBe(112);
    expect(t.stop).toBe(100);
    expect(t.target).toBe(136);
    expect(t.reason).toBe("target");
    near(t.R, 2);
  });

  test("when stop and target fall in the same 5-min candle it counts as a stop by default", () => {
    const bars = [
      ["09:15", 100, 110, 100, 105], ["09:20", 105, 110, 101, 106], ["09:25", 106, 110, 102, 107],
      ["09:30", 107, 111, 106, 110], ["09:35", 110, 112, 109, 111], ["09:40", 111, 113, 110, 112],
      ["09:45", 112, 140, 95, 120], // both 100 and 136 inside one candle
      ...flat(590, 930, 120),
    ];
    const { trades } = runAll(groupDays(day("2026-11-23", bars)), { ...BASE });
    expect(trades[0].reason).toBe("stop*");
    near(trades[0].R, -1);
  });

  test("no breakout, no trade", () => {
    const bars = [["09:15", 100, 110, 100, 105], ["09:20", 105, 110, 101, 106], ["09:25", 106, 110, 102, 107], ...flat(570, 930, 105)];
    const { trades } = runAll(groupDays(day("2026-11-23", bars)), { ...BASE });
    expect(trades).toHaveLength(0);
  });
});

// ---- Lot sizes, option P&L and margin (positionMath.js) ----------------------------
import fs from "fs";
import path from "path";
import { monthKey, lotSizeFrom, positionMultiplier, optionPnl, optionMarketValue, shortMarginPerLot, savePortfolioVersionedWith } from "./positionMath";

// Expiry at 3:30 PM IST on a given date
const expIST = (y, m, d) => Date.UTC(y, m - 1, d, 10, 0);
// Fixed table in the same shape as public/lot-sizes.json (real file changes when NSE revises lots)
const TABLE = {
  COCHINSHIP: { "NOV-26": 400, "DEC-26": 400, "JAN-27": 400 },
  TCS: { "NOV-26": 225, "DEC-26": 225, "JAN-27": 250 },
  NIFTY: { "NOV-26": 65, "DEC-26": 65, "JAN-27": 65 },
};

describe("F&O lot sizes", () => {
  test("expiry month uses the Indian calendar day", () => {
    expect(monthKey(expIST(2026, 12, 29))).toBe("DEC-26");
    expect(monthKey(Date.UTC(2026, 11, 31, 20, 0))).toBe("JAN-27"); // 1:30 AM IST on 1 Jan
  });
  test("stock options use NSE's lot, never 1", () => {
    expect(lotSizeFrom(TABLE, "COCHINSHIP", expIST(2026, 12, 29))).toBe(400);
  });
  test("a lot revision applies only from its expiry month", () => {
    expect(lotSizeFrom(TABLE, "TCS", expIST(2026, 12, 29))).toBe(225);
    expect(lotSizeFrom(TABLE, "TCS", expIST(2027, 1, 26))).toBe(250);
  });
  test("SENSEX lot is 20 until Dec-2026 expiries and 25 from Jan-2027", () => {
    expect(lotSizeFrom(TABLE, "SENSEX", expIST(2026, 12, 24))).toBe(20);
    expect(lotSizeFrom(TABLE, "SENSEX", expIST(2027, 1, 7))).toBe(25);
  });
  test("unknown stock or missing table gives no lot (trade refused), indices fall back", () => {
    expect(lotSizeFrom(TABLE, "NOTANFOSTOCK", expIST(2026, 12, 29))).toBeNull();
    expect(lotSizeFrom(null, "COCHINSHIP", expIST(2026, 12, 29))).toBeNull();
    expect(lotSizeFrom(null, "NIFTY", expIST(2026, 12, 29))).toBe(65);
  });
  test("the shipped lot-size file is complete and sane", () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "public", "lot-sizes.json"), "utf8"));
    const lots = file.lots;
    expect(Object.keys(lots).length).toBeGreaterThan(150);
    for (const sym of ["NIFTY", "BANKNIFTY", "RELIANCE", "SBIN", "TCS"]) expect(lots[sym]).toBeDefined();
    for (const [sym, months] of Object.entries(lots)) {
      for (const v of Object.values(months)) {
        if (!(Number.isInteger(v) && v >= 1 && v <= 100000)) throw new Error(`bad lot for ${sym}: ${v}`);
      }
    }
  });
});

describe("option position value", () => {
  const shortCall = { symbol: "COCHINSHIP.NS", side: "short", lotBased: true, lot: 400, qty: 1, avgPremium: 45.07 };
  test("short stock option: P&L and market value scale by the lot", () => {
    near(optionPnl(shortCall, 43.85, positionMultiplier(shortCall, "COCHINSHIP")), (45.07 - 43.85) * 400);
    near(optionMarketValue(shortCall, 43.85, 400), -43.85 * 400);
  });
  test("long index option: 2 lots of NIFTY", () => {
    const p = { side: "long", lotBased: true, lot: 65, qty: 2, avgPremium: 100 };
    near(optionPnl(p, 130, positionMultiplier(p, "NIFTY")), 30 * 65 * 2);
  });
  test("positions saved before lots were stored keep their original lot", () => {
    expect(positionMultiplier({ lotBased: true, qty: 1 }, "COCHINSHIP")).toBe(1);
    expect(positionMultiplier({ lotBased: true, qty: 1 }, "NIFTY")).toBe(65);
  });
  test("short margin grows with the lot and is at least 4% of contract value", () => {
    const m1 = shortMarginPerLot(1100, 1120, "call", 1);
    const m400 = shortMarginPerLot(1100, 1120, "call", 400);
    near(m400, 0.09 * 1100 * 400 - 0.5 * 20 * 400, 1);
    expect(m400).toBeGreaterThan(m1 * 300);
    expect(shortMarginPerLot(25000, 30000, "call", 65)).toBe(Math.round(0.04 * 25000 * 65));
  });
});

// ---- Two devices saving the same portfolio --------------------------------------
function fakeStore(initialVersion) {
  const row = { updated_at: initialVersion, data: null };
  const q = (result) => ({ maybeSingle: async () => result, then: (res) => res(result) });
  const client = {
    row,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { updated_at: row.updated_at }, error: null }) }) }),
      upsert: (v) => ({ select: () => { row.updated_at = v.updated_at; row.data = v.data; return q({ data: { updated_at: v.updated_at }, error: null }); } }),
      update: (v) => ({ eq: () => ({ eq: (_c, ver) => ({ select: async () => {
        if (row.updated_at !== ver) return { data: [], error: null };
        row.updated_at = v.updated_at; row.data = v.data; return { data: [{ updated_at: v.updated_at }], error: null };
      } }) }) }),
    }),
  };
  return client;
}

describe("multi-device portfolio saves", () => {
  test("a device saves when nothing changed since it loaded", async () => {
    const c = fakeStore("2026-11-23T06:00:00.000+00:00");
    const r = await savePortfolioVersionedWith(c, "u", { cash: 1 }, "2026-11-23T06:00:00.000+00:00", "2026-11-23T06:01:00.000Z");
    expect(r).toEqual({ ok: true, version: "2026-11-23T06:01:00.000Z" });
    expect(c.row.data).toEqual({ cash: 1 });
  });
  test("a stale device (phone) cannot overwrite what the laptop saved", async () => {
    const c = fakeStore("2026-11-23T06:00:00.000+00:00");
    await savePortfolioVersionedWith(c, "u", { cash: "laptop" }, "2026-11-23T06:00:00.000+00:00", "2026-11-23T06:05:00.000Z");
    const phone = await savePortfolioVersionedWith(c, "u", { cash: "phone-old" }, "2026-11-23T06:00:00.000+00:00", "2026-11-23T06:06:00.000Z");
    expect(phone).toEqual({ conflict: true });
    expect(c.row.data).toEqual({ cash: "laptop" });
  });
  test("same instant written in another format is not treated as a conflict", async () => {
    const c = fakeStore("2026-11-23T06:00:00+00:00");
    const r = await savePortfolioVersionedWith(c, "u", { cash: 2 }, "2026-11-23T06:00:00.000Z", "2026-11-23T06:02:00.000Z");
    expect(r.ok).toBe(true);
    expect(c.row.data).toEqual({ cash: 2 });
  });
  test("first save of a new account creates the row", async () => {
    const c = fakeStore(null);
    const r = await savePortfolioVersionedWith(c, "u", { cash: 3 }, null, "2026-11-23T06:03:00.000Z");
    expect(r.ok).toBe(true);
    expect(c.row.data).toEqual({ cash: 3 });
  });
});

// ---- Intraday (MIS) vs carry-forward ------------------------------------------------
import { productOf, isIntraday, stockCashNeeded, stockPositionValue, stockSaleCash, squareOffDue, intradayClosed } from "./positionMath";
const istMs = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3600 * 1000;

test("old positions without a product count as carry-forward", () => {
  expect(productOf({})).toBe("CF");
  expect(isIntraday({ product: "MIS" })).toBe(true);
});

test("intraday stock buy blocks 20%, delivery the full value", () => {
  expect(stockCashNeeded(1000, 10, "MIS")).toBe(2000);
  expect(stockCashNeeded(1000, 10, "CF")).toBe(10000);
});

test("intraday stock value and sale return margin plus P&L", () => {
  const p = { product: "MIS", qty: 10, avgPrice: 1000, margin: 2000 };
  expect(stockPositionValue(p, 1050)).toBe(2500);
  expect(stockSaleCash(p, 950, 10)).toBe(1500);
  expect(stockSaleCash(p, 1100, 5)).toBe(1500);
  const d = { qty: 10, avgPrice: 1000 };
  expect(stockPositionValue(d, 1050)).toBe(10500);
  expect(stockSaleCash(d, 1050, 4)).toBe(4200);
});

test("intraday money round trip: buy then sell leaves cash changed by P&L only", () => {
  let cash = 100000;
  const need = stockCashNeeded(500, 100, "MIS");
  cash -= need;
  const p = { product: "MIS", qty: 100, avgPrice: 500, margin: need };
  cash += stockSaleCash(p, 512.5, 100);
  expect(cash).toBeCloseTo(100000 + 1250, 6);
});

test("square-off is due from 3:20 PM IST, and on any later day", () => {
  const opened = istMs(2026, 11, 23, 10, 0);
  expect(squareOffDue(opened, istMs(2026, 11, 23, 15, 19))).toBe(false);
  expect(squareOffDue(opened, istMs(2026, 11, 23, 15, 20))).toBe(true);
  expect(squareOffDue(opened, istMs(2026, 11, 24, 9, 0))).toBe(true);
  expect(intradayClosed(istMs(2026, 11, 23, 15, 25))).toBe(true);
  expect(intradayClosed(istMs(2026, 11, 23, 9, 30))).toBe(false);
});
