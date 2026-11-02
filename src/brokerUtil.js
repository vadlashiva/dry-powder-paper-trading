// Small helpers shared by the broker connections.
export const IST_MS = 19800000;
export const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
export const remove = (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } };
export const readJson = (k) => { try { return JSON.parse(read(k) || "null"); } catch { return null; } };
export const isoDay = (ms) => new Date(ms + IST_MS).toISOString().slice(0, 10);
const queues = {};
export function inTurn(group, gapMs, job) {
  const run = (queues[group] || Promise.resolve()).then(job, job);
  queues[group] = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, gapMs)));
  return run;
}
export const redirectUri = () => `${window.location.origin}/`;
export function stripLoginParams(names) {
  const qs = new URLSearchParams(window.location.search);
  names.forEach((n) => qs.delete(n));
  const rest = qs.toString();
  window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
}
export const sessionExpired = () => window.dispatchEvent(new Event("pr-broker-expired"));
export const parseSymbol = (symbol) => {
  const m = symbol.match(/^(.+)\.(NS|BO)$/);
  return m ? { name: m[1], exchange: m[2] === "NS" ? "NSE" : "BSE" } : null;
};
