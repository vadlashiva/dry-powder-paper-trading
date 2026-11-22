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
