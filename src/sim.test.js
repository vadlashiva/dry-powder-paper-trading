import { simQuote, simCandles, searchStocks } from "./sim";
const ist = (y, mo, d, h, mi, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s) - 5.5 * 3600 * 1000;

test("prices are deterministic and identical for NSE and BSE listings", () => {
  const t = ist(2026, 11, 23, 11, 7, 30);
  expect(simQuote("RELIANCE.NS", t)).toEqual(simQuote("RELIANCE.NS", t));
  expect(simQuote("RELIANCE.NS", t)).toEqual(simQuote("RELIANCE.BO", t));
});

test("prices stay realistic: positive, on a 5-paisa tick, near the starting level", () => {
  for (const s of ["^NSEI", "^NSEBANK", "^BSESN", "TCS.NS", "COCHINSHIP.NS", "UNKNOWNCO.NS"]) {
    const { price, prevClose } = simQuote(s, ist(2026, 11, 23, 14, 0));
    expect(price).toBeGreaterThan(0);
    expect(Math.abs(price * 20 - Math.round(price * 20))).toBeLessThan(1e-6);
    expect(Math.abs(price / prevClose - 1)).toBeLessThan(0.12); // no absurd daily jumps
  }
  const n = simQuote("^NSEI", ist(2026, 11, 23, 14, 0)).price;
  expect(n).toBeGreaterThan(24600 / 2);
  expect(n).toBeLessThan(24600 * 2);
});

test("5-minute candles cover the session so far and end at the live price", () => {
  const now = ist(2026, 11, 23, 10, 3, 20);
  const c = simCandles({ symbol: "INFY.NS", interval: "5m", fromMs: ist(2026, 11, 23, 0, 0), toMs: now }, now);
  expect(c.length).toBe(10); // 9:15 ... 10:00
  expect(c[0].t * 1000).toBe(ist(2026, 11, 23, 9, 15));
  expect(c[c.length - 1].c).toBe(simQuote("INFY.NS", now).price);
  c.forEach((k) => { expect(k.h).toBeGreaterThanOrEqual(Math.max(k.o, k.c)); expect(k.l).toBeLessThanOrEqual(Math.min(k.o, k.c)); });
});

test("no candles on weekends; Monday opens near Friday's close", () => {
  const sat = simCandles({ symbol: "SBIN.NS", interval: "5m", fromMs: ist(2026, 11, 21, 0, 0), toMs: ist(2026, 11, 22, 23, 0) }, ist(2026, 11, 23, 0, 0));
  expect(sat.length).toBe(0);
  const d = simCandles({ symbol: "SBIN.NS", interval: "1d", fromMs: ist(2026, 11, 20, 0, 0), toMs: ist(2026, 11, 23, 23, 0) }, ist(2026, 11, 24, 0, 0));
  expect(d.length).toBe(2);
  expect(Math.abs(d[1].o / d[0].c - 1)).toBeLessThan(0.03);
});

test("before the open and at the weekend the quote is the last session's close", () => {
  const fri = simCandles({ symbol: "ITC.NS", interval: "1d", fromMs: ist(2026, 11, 20, 0, 0), toMs: ist(2026, 11, 20, 23, 0) }, ist(2026, 11, 21, 0, 0));
  expect(simQuote("ITC.NS", ist(2026, 11, 22, 12, 0)).price).toBe(fri[0].c);
  expect(simQuote("ITC.NS", ist(2026, 11, 23, 8, 0)).price).toBe(fri[0].c);
});

test("search finds practice stocks by ticker or name", async () => {
  expect((await searchStocks("tata")).map((r) => r.symbol)).toEqual(expect.arrayContaining(["TATAMOTORS.NS", "TATASTEEL.NS"]));
});

test("the market mixes rising and falling weeks", () => {
  const now = ist(2026, 11, 23, 16, 0);
  for (const s of ["^NSEI", "RELIANCE.NS", "TCS.NS"]) {
    const d = simCandles({ symbol: s, interval: "1d", fromMs: ist(2026, 5, 25, 0, 0), toMs: now }, now);
    const weeks = [];
    for (let i = 0; i + 5 <= d.length; i += 5) weeks.push(d[i + 4].c > d[i].o);
    const up = weeks.filter(Boolean).length / weeks.length;
    expect(up).toBeGreaterThan(0.3);
    expect(up).toBeLessThan(0.7);
    let run = 1, maxRun = 1;
    for (let i = 1; i < weeks.length; i++) { run = weeks[i] === weeks[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
    expect(maxRun).toBeLessThanOrEqual(5);
  }
});

describe("practice market clock (Start market)", () => {
  const { simNow, simIsOpen, startSimMarket } = require("./sim");
  beforeEach(() => localStorage.clear());

  test("keeps real time until Start market is pressed", () => {
    const real = ist(2026, 11, 23, 22, 0);
    expect(simNow(real)).toBe(real);
    expect(simIsOpen(real)).toBe(false);
  });

  test("Start market at 10 PM opens the next session at 9:15 and runs in real time", () => {
    const real = ist(2026, 11, 23, 22, 0); // Monday night
    const open = startSimMarket(real);
    expect(open).toBe(ist(2026, 11, 24, 9, 15));
    expect(simNow(real)).toBe(open);
    expect(simIsOpen(simNow(real + 60000))).toBe(true);
    expect(simNow(real + 30 * 60000)).toBe(ist(2026, 11, 24, 9, 45));
  });

  test("pressing it again during a session changes nothing; after the close it moves on, never back", () => {
    const real = ist(2026, 11, 27, 21, 0); // Friday night: next session is Monday
    const open = startSimMarket(real);
    expect(open).toBe(ist(2026, 11, 30, 9, 15));
    expect(startSimMarket(real + 3600000)).toBe(simNow(real + 3600000));
    const afterClose = real + 6.5 * 3600000; // 3:45 PM practice time
    expect(simIsOpen(simNow(afterClose))).toBe(false);
    const next = startSimMarket(afterClose);
    expect(next).toBe(ist(2026, 12, 1, 9, 15));
    expect(next).toBeGreaterThan(simNow(afterClose - 1));
  });

  test("Start market before 9:15 on a weekday opens today's session", () => {
    expect(startSimMarket(ist(2026, 11, 24, 7, 0))).toBe(ist(2026, 11, 24, 9, 15));
  });
});
