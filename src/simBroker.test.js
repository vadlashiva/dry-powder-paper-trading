import { activeBroker, chooseBroker, fetchQuotes, answerFeedRequest, isSimulated, BROKERS } from "./brokers";

beforeEach(() => localStorage.clear());

test("choosing the practice market makes it the active, connected broker", async () => {
  expect(isSimulated()).toBe(false);
  BROKERS.sim.api.saveCredentials();
  chooseBroker("sim");
  expect(activeBroker().id).toBe("sim");
  expect(isSimulated()).toBe(true);
  expect(activeBroker().api.hasSession()).toBe(true);
  const q = await fetchQuotes(["RELIANCE.NS", "^NSEI"]);
  expect(q["RELIANCE.NS"].price).toBeGreaterThan(0);
  expect(q["^NSEI"].prevClose).toBeGreaterThan(0);
});

test("chart requests are answered from the simulated feed", async () => {
  BROKERS.sim.api.saveCredentials();
  chooseBroker("sim");
  const r = await answerFeedRequest("https://x.invalid/feed?symbol=TCS.NS&interval=5m&range=5d");
  const res = r.chart.result[0];
  expect(res.timestamp.length).toBeGreaterThan(0);
  expect(res.indicators.quote[0].close.every((c) => c > 0)).toBe(true);
  const s = await answerFeedRequest("https://x.invalid/feed?type=search&q=axis");
  expect(s.quotes[0].symbol).toBe("AXISBANK.NS");
});

test("the practice market is not offered in the real-broker list", () => {
  expect(BROKERS.sim.simulated).toBe(true);
  expect(Object.values(BROKERS).filter((b) => !b.simulated).map((b) => b.id)).toEqual(["angel", "fyers", "upstox"]);
});
