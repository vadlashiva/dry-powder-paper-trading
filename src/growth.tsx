// @ts-nocheck
// Growth & retention features: weekly leaderboard, shareable P&L cards, referrals,
// trade journal tags, achievements, the guided tour and first-party analytics.
import { useEffect, useLayoutEffect, useMemo, useState } from "react";

/* ================= time helpers (IST) ================= */
const IST_MS = 5.5 * 3600 * 1000;
// ISO week key in India time, e.g. "2026-W44". Weeks start on Monday.
export function isoWeekIST(ms = Date.now()) {
  const d = new Date((typeof ms === "number" ? ms : new Date(ms).getTime()) + IST_MS);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ================= telemetry (first-party, privacy-friendly) ================= */
let sb = null;
let errorsSent = 0;
const seenErrors = new Set();
const sessionId = (() => {
  try {
    let s = sessionStorage.getItem("pr_sid");
    if (!s) { s = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem("pr_sid", s); }
    return s;
  } catch { return "nosession"; }
})();

export function initTelemetry(client) {
  if (sb || typeof window === "undefined") return;
  sb = client;
  const report = (message, stack) => {
    if (!message || errorsSent >= 10) return;
    const key = String(message).slice(0, 200);
    if (seenErrors.has(key)) return;
    seenErrors.add(key);
    errorsSent++;
    sb.from("client_errors").insert({
      message: String(message).slice(0, 1000),
      stack: stack ? String(stack).slice(0, 4000) : null,
      url: location.pathname.slice(0, 300),
      user_agent: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  };
  window.addEventListener("error", (e) => {
    if (!e.message || /ResizeObserver loop/.test(e.message)) return;
    report(e.message, e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const msg = r?.message || String(r);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return; // flaky mobile networks, not bugs
    report(msg, r?.stack);
  });
  // Optional hosted analytics: set REACT_APP_UMAMI_WEBSITE_ID in Vercel to enable Umami.
  const umamiId = process.env.REACT_APP_UMAMI_WEBSITE_ID;
  if (umamiId && !document.querySelector("script[data-website-id]")) {
    const s = document.createElement("script");
    s.defer = true;
    s.src = process.env.REACT_APP_UMAMI_SRC || "https://cloud.umami.is/script.js";
    s.setAttribute("data-website-id", umamiId);
    document.head.appendChild(s);
  }
}

export function track(name, props = {}) {
  try { window.umami?.track?.(name, props); } catch { /* ignore */ }
  if (!sb) return;
  sb.from("app_events").insert({ session_id: sessionId, name, props, path: location.pathname.slice(0, 200) }).then(() => {}, () => {});
}

const isMissingTable = (err) => err && (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202" || /does not exist|schema cache|Could not find/i.test(err.message || ""));

/* ================= trade journal ================= */
export const TAGS = ["Planned setup", "Breakout", "Pullback", "News", "Tip from someone", "FOMO", "Revenge trade", "Just testing"];
const BAD_TAGS = new Set(["FOMO", "Revenge trade", "Tip from someone"]);

// A stable key for "the same instrument", used to link exits back to the tagged entry.
export function tradeKey(label = "") {
  const opt = label.match(/\b(CALL|PUT)\s+(\S+)\s+(\d+(?:\.\d+)?)/);
  if (opt) return `${opt[1]} ${opt[2]} ${opt[3]}`;
  const stk = label.match(/\b(?:BUY|SELL)\s+\d+\s+(\S+)\s+@/);
  return stk ? stk[1] : null;
}

// Each closed trade's P&L is credited to the tag of the most recent tagged entry on that instrument.
export function journalStats(trades) {
  const lastTag = {};
  const by = {};
  trades.slice().reverse().forEach((t) => {
    if (t.realized == null) { if (t.tag && t.key) lastTag[t.key] = t.tag; return; }
    const tag = t.tag || (t.key && lastTag[t.key]);
    if (!tag) return;
    const s = (by[tag] ||= { tag, count: 0, wins: 0, net: 0 });
    s.count++; s.net += t.realized; if (t.realized > 0) s.wins++;
  });
  return Object.values(by).sort((a, b) => b.count - a.count);
}

export function TagChips({ value, onPick, compact = false }) {
  return (
    <div className={`tagChips ${compact ? "tagChipsCompact" : ""}`} role="group" aria-label="Why did you take this trade?">
      {TAGS.map((t) => (
        <button key={t} type="button" className={`tagChip ${value === t ? "tagChipActive" : ""} ${BAD_TAGS.has(t) ? "tagChipWarn" : ""}`} aria-pressed={value === t} onClick={() => onPick(value === t ? null : t)}>{t}</button>
      ))}
    </div>
  );
}

export function JournalModal({ trade, onSave, onClose }) {
  const [tag, setTag] = useState(trade.tag || null);
  const [note, setNote] = useState(trade.note || "");
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal journalModal" role="dialog" aria-modal="true" aria-label="Trade journal" onClick={(e) => e.stopPropagation()}>
        <h3>Trade journal</h3>
        <p className="mono dim journalLabel">{trade.label}</p>
        <div className="dim journalQ">Why did you take this trade?</div>
        <TagChips value={tag} onPick={setTag} />
        <label className="dim journalQ" htmlFor="journalNote">Notes (optional)</label>
        <textarea id="journalNote" className="journalNote" rows={3} maxLength={300} placeholder="What was the plan? What happened?" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="modalBtns">
          <button className="btn btnGhost" onClick={onClose}>Cancel</button>
          <button className="btn btnBull" onClick={() => onSave({ tag, note: note.trim() })}>Save</button>
        </div>
      </div>
    </div>
  );
}

export function JournalStatsCard({ trades, fmtMoney }) {
  const rows = useMemo(() => journalStats(trades), [trades]);
  const tagged = trades.filter((t) => t.tag).length;
  return (
    <div className="journalCard">
      <h4>Your trades by reason</h4>
      {rows.length === 0 ? (
        <p className="dim">Tag your trades (in History, or right after you place one) to see which reasons make you money and which cost you.{tagged ? " Close a tagged position to see its result here." : ""}</p>
      ) : (
        <table className="posTable journalTable">
          <thead><tr><th>Reason</th><th>Closed</th><th>Win rate</th><th>Net P&amp;L</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag}>
                <td>{r.tag}</td>
                <td className="mono">{r.count}</td>
                <td className={`mono ${r.wins / r.count >= 0.5 ? "bull" : "bear"}`}>{Math.round((r.wins / r.count) * 100)}%</td>
                <td className={`mono ${r.net >= 0 ? "bull" : "bear"}`}>{fmtMoney(r.net, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.some((r) => BAD_TAGS.has(r.tag) && r.net < 0) && (
        <p className="journalInsight">Trades driven by FOMO, revenge or tips are costing you money. Skipping them is the cheapest improvement you can make.</p>
      )}
    </div>
  );
}

/* ================= achievements ================= */
export const ACHIEVEMENTS = [
  { id: "first_trade", icon: "🎯", title: "First trade", desc: "Placed your first practice trade" },
  { id: "first_profit", icon: "💰", title: "In the green", desc: "Closed a trade in profit" },
  { id: "stop_loss", icon: "🛡️", title: "Stop-loss honoured", desc: "Let a stop-loss close a trade for you" },
  { id: "ten_trades", icon: "🔟", title: "Ten trades", desc: "Closed 10 trades" },
  { id: "fifty_trades", icon: "🏃", title: "Fifty trades", desc: "Closed 50 trades — enough to judge a method" },
  { id: "options", icon: "⚙️", title: "Options explorer", desc: "Traded your first option" },
  { id: "writer", icon: "✍️", title: "Option writer", desc: "Sold (wrote) an option" },
  { id: "replay", icon: "⏪", title: "Time traveller", desc: "Traded a past day in Replay" },
  { id: "journal", icon: "📓", title: "Journal keeper", desc: "Tagged 5 trades with a reason" },
  { id: "green_week", icon: "📈", title: "Green week", desc: "Finished a week with a positive return" },
  { id: "challenger", icon: "🏆", title: "Challenger", desc: "Joined the weekly leaderboard" },
  { id: "installed", icon: "📲", title: "On your home screen", desc: "Installed the PaperRally app" },
];

export function computeAchievements(trades, flags = {}) {
  const got = new Set();
  const closes = trades.filter((t) => t.realized != null);
  if (trades.length) got.add("first_trade");
  if (closes.some((t) => t.realized > 0)) got.add("first_profit");
  if (trades.some((t) => /^SL hit|^STOP SELL/.test(t.label))) got.add("stop_loss");
  if (closes.length >= 10) got.add("ten_trades");
  if (closes.length >= 50) got.add("fifty_trades");
  if (trades.some((t) => /\b(BTO|STO|STC|BTC)\b/.test(t.label))) got.add("options");
  if (trades.some((t) => /\bSTO\b/.test(t.label))) got.add("writer");
  if (trades.filter((t) => t.tag).length >= 5) got.add("journal");
  ["replay", "green_week", "challenger", "installed"].forEach((f) => { if (flags[f]) got.add(f); });
  return got;
}

export function AchievementsGrid({ unlocked }) {
  const set = new Set(unlocked || []);
  return (
    <div className="achCard">
      <h4>Achievements <span className="dim">{set.size}/{ACHIEVEMENTS.length}</span></h4>
      <div className="achGrid">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={`achItem ${set.has(a.id) ? "achOn" : ""}`} title={a.desc}>
            <span className="achIcon" aria-hidden="true">{a.icon}</span>
            <span className="achTitle">{a.title}</span>
            <span className="achDesc dim">{a.desc}</span>
            {!set.has(a.id) && <span className="srOnly">(locked)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= shareable P&L card ================= */
export async function makeShareImage({ title, bigValue, positive, lines }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  try { await document.fonts?.ready; } catch { /* ignore */ }
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#081234"); grad.addColorStop(1, "#1A5CEB");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(860, 260, 20, 860, 260, 620);
  glow.addColorStop(0, "rgba(120,170,255,0.35)"); glow.addColorStop(1, "rgba(120,170,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  const sans = "'Instrument Sans', 'Inter', system-ui, sans-serif";
  g.fillStyle = "#FFB020"; g.font = `700 54px ${sans}`; g.fillText("🔥", 80, 140);
  g.fillStyle = "#FFFFFF"; g.font = `700 56px ${sans}`; g.fillText("PaperRally", 160, 138);
  g.fillStyle = "#C9D6F2"; g.font = `600 44px ${sans}`; g.fillText(title, 80, 330);
  g.fillStyle = positive ? "#14E8A0" : "#FF5470"; g.font = `800 190px ${sans}`; g.fillText(bigValue, 72, 540);
  g.font = `600 48px ${sans}`;
  lines.forEach((ln, i) => {
    const y = 700 + i * 92;
    g.fillStyle = "rgba(255,255,255,0.10)";
    g.beginPath(); g.roundRect ? g.roundRect(70, y - 62, 940, 80, 22) : g.rect(70, y - 62, 940, 80); g.fill();
    g.fillStyle = "#C9D6F2"; g.fillText(ln[0], 100, y);
    g.fillStyle = "#FFFFFF"; const w = g.measureText(ln[1]).width; g.fillText(ln[1], 980 - w, y);
  });
  g.fillStyle = "#FFFFFF";
  g.beginPath(); g.roundRect ? g.roundRect(80, 1130, 560, 100, 50) : g.rect(80, 1130, 560, 100); g.fill();
  g.fillStyle = "#081234"; g.font = `800 50px ${sans}`; g.fillText("paperrally.in", 120, 1197);
  g.fillStyle = "#AFC0E6"; g.font = `500 30px ${sans}`;
  g.fillText("Virtual money · paper trading for learning", 80, 1290);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.9));
}

export async function shareImage(blob, text, filename = "paperrally-week.jpg") {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/* ================= referrals ================= */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function captureReferralFromUrl() {
  try {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref && UUID_RE.test(ref)) localStorage.setItem("pr_ref", ref.toLowerCase());
  } catch { /* ignore */ }
}
export const REFERRAL_DAYS = 7;
export const MAX_REFERRAL_REWARDS = 4;

// Records "who invited me" once for a brand-new account, then returns bonus trial days.
export async function syncReferrals(supabase, userId) {
  try {
    const pending = localStorage.getItem("pr_ref");
    if (pending && pending !== userId) {
      const { error } = await supabase.from("referrals").insert({ referred_id: userId, referrer_id: pending });
      if (!error) track("referral_recorded");
    }
    if (pending) localStorage.removeItem("pr_ref");
  } catch { /* ignore */ }
  try {
    const { data, error } = await supabase.from("referrals").select("referrer_id, referred_id");
    if (error) return { available: !isMissingTable(error), invited: 0, wasReferred: false, bonusDays: 0 };
    const invited = data.filter((r) => r.referrer_id === userId).length;
    const wasReferred = data.some((r) => r.referred_id === userId);
    const bonusDays = (wasReferred ? REFERRAL_DAYS : 0) + REFERRAL_DAYS * Math.min(invited, MAX_REFERRAL_REWARDS);
    return { available: true, invited, wasReferred, bonusDays };
  } catch { return { available: false, invited: 0, wasReferred: false, bonusDays: 0 }; }
}

export function InvitePanel({ userId, referral, inTrial, isPaidPro, showToast }) {
  const link = `https://paperrally.in/?ref=${userId}`;
  const msg = `I'm practising stock & NIFTY options trading on PaperRally with ₹10 lakh of virtual money — no real risk. Join with my link and we both get 7 extra free days of Pro:`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); showToast("Invite link copied", "bull"); }
    catch { showToast(link, "bull"); }
    track("invite_copied");
  };
  const rewarded = Math.min(referral?.invited || 0, MAX_REFERRAL_REWARDS);
  return (
    <div className="inviteCard">
      <h4>Invite friends, get free Pro days</h4>
      <p className="dim">Each friend who signs up with your link gets <b>7 extra free days</b> of every feature, and so do you (up to {MAX_REFERRAL_REWARDS} friends = 28 days).</p>
      <div className="inviteLinkRow">
        <input className="qtyInput mono inviteLink" readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.target.select()} />
        <button className="btn btnGhost" onClick={copy}>Copy</button>
      </div>
      <div className="inviteBtns">
        <a className="btn btnBull" href={`https://wa.me/?text=${encodeURIComponent(`${msg} ${link}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => track("invite_whatsapp")}>Share on WhatsApp</a>
      </div>
      {referral?.available !== false && (
        <div className="dim inviteStats">
          {referral?.invited ? `${referral.invited} friend${referral.invited > 1 ? "s" : ""} joined · ${rewarded * REFERRAL_DAYS} bonus days earned` : "No friends joined yet."}
          {isPaidPro && referral?.invited ? " (bonus days apply to the free trial; your paid Pro is unaffected)" : ""}
        </div>
      )}
    </div>
  );
}

/* ================= leaderboard ================= */
export function LeaderboardPanel({ supabase, userId, prefs, defaultName, weekKey, weekReturn, weekTrades, resetThisWeek, onJoin, onLeave, onShare, fmtPct }) {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | missing | error
  const [name, setName] = useState(prefs.lbName || defaultName);
  const [agree, setAgree] = useState(false);
  const joined = !!prefs.lbJoined;

  const load = async () => {
    const { data, error } = await supabase.from("leaderboard").select("user_id, display_name, return_pct, trades").eq("week", weekKey).order("return_pct", { ascending: false }).limit(50);
    if (error) { setStatus(isMissingTable(error) ? "missing" : "error"); return; }
    setRows(data); setStatus("ok");
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [weekKey, joined]);

  const cleanName = name.trim().replace(/\s+/g, " ");
  const nameOk = /^[\p{L}\p{N} _.\-]{2,20}$/u.test(cleanName);
  const myIdx = rows ? rows.findIndex((r) => r.user_id === userId) : -1;

  return (
    <div className="lbWrap">
      <div className="lbHero">
        <div>
          <div className="lbKicker">Weekly challenge · {weekKey.replace("-W", " · week ")}</div>
          <h3>Best % return wins the week</h3>
          <p className="dim">Everyone starts the week where their portfolio is on Monday. The board ranks by % return, updates live, and resets every Monday. Virtual money only — bragging rights, no prizes.</p>
        </div>
        <div className="lbMine">
          <span className="dim">Your week</span>
          <span className={`mono lbMineVal ${weekReturn >= 0 ? "bull" : "bear"}`}>{fmtPct(weekReturn)}</span>
          <span className="dim">{weekTrades} trade{weekTrades === 1 ? "" : "s"} · {myIdx >= 0 ? `rank #${myIdx + 1}` : joined ? "not in top 50 yet" : "not joined"}</span>
          <button className="btn btnGhost" onClick={onShare}>Share my week</button>
        </div>
      </div>

      {status === "missing" && <div className="empty">The leaderboard opens soon — check back in a little while.</div>}
      {status === "error" && <div className="empty">Couldn't load the leaderboard. Check your connection and try again.</div>}

      {status !== "missing" && !joined && (
        <div className="lbJoin">
          {resetThisWeek ? (
            <p className="dim">You reset your account this week, so you can join again from Monday.</p>
          ) : (
            <>
              <label htmlFor="lbName" className="dim">Name to show on the board</label>
              <div className="inviteLinkRow">
                <input id="lbName" className="qtyInput" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
                <button className="btn btnBull" disabled={!nameOk || !agree} onClick={() => onJoin(cleanName)}>Join this week</button>
              </div>
              {!nameOk && <div className="orderHint bear">2–20 letters, numbers, spaces, dots or dashes.</div>}
              <label className="slPlanToggle lbAgree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>Show this name and my weekly % return to other PaperRally users</span></label>
            </>
          )}
        </div>
      )}

      {status === "ok" && (
        rows.length === 0 ? <div className="empty">No one on the board yet this week — be the first.</div> : (
          <table className="posTable lbTable">
            <thead><tr><th>#</th><th>Trader</th><th>Return</th><th>Trades</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className={r.user_id === userId ? "lbMe" : ""}>
                  <td className="mono">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td>
                  <td>{r.display_name}{r.user_id === userId ? " (you)" : ""}</td>
                  <td className={`mono ${Number(r.return_pct) >= 0 ? "bull" : "bear"}`}>{fmtPct(Number(r.return_pct))}</td>
                  <td className="mono">{r.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {joined && (
        <div className="lbFoot dim">
          Showing as <b>{prefs.lbName}</b>. Resetting your account takes you off this week's board.{" "}
          <button className="linkBtn" onClick={onLeave}>Leave the leaderboard</button>
        </div>
      )}
    </div>
  );
}

/* ================= guided tour ================= */
export function TourOverlay({ steps, onDone }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = step?.target?.();
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height) {
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      setRect(null);
    };
    const el = step?.target?.();
    if (el && el.scrollIntoView) {
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight - 80) el.scrollIntoView({ block: "center" });
    }
    raf = requestAnimationFrame(measure);
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", on); window.removeEventListener("scroll", on, true); };
  }, [i, step]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onDone(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!step) return null;
  const next = () => (i + 1 < steps.length ? setI(i + 1) : onDone(true));
  const pad = 8;
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(340, vw - 32);
  let cardStyle = { width: cardW, left: (vw - cardW) / 2, top: vh / 2 - 90 };
  if (rect) {
    const cardH = 200;
    const below = rect.top + rect.height + pad + 12;
    const above = rect.top - pad - 12 - cardH;
    const centredLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16);
    const sideTop = Math.min(Math.max(16, rect.top + 24), vh - cardH - 16);
    if (below + cardH < vh) cardStyle = { width: cardW, left: centredLeft, top: below };
    else if (above > 12) cardStyle = { width: cardW, left: centredLeft, top: above };
    else if (vw - (rect.left + rect.width) > cardW + 32) cardStyle = { width: cardW, left: rect.left + rect.width + pad + 16, top: sideTop };
    else if (rect.left > cardW + 32) cardStyle = { width: cardW, left: rect.left - pad - 16 - cardW, top: sideTop };
    else cardStyle = { width: cardW, left: (vw - cardW) / 2, top: vh - cardH - 16 };
  }
  return (
    <div className="tourLayer" role="dialog" aria-modal="true" aria-label={`Tour step ${i + 1} of ${steps.length}: ${step.title}`}>
      {rect ? (
        <div className="tourSpot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : (
        <div className="tourDim" />
      )}
      <div className="tourCard" style={cardStyle}>
        <div className="tourStep dim">Step {i + 1} of {steps.length}</div>
        <h4>{step.title}</h4>
        <p>{step.text}</p>
        <div className="tourBtns">
          <button className="linkBtn" onClick={() => onDone(false)}>Skip tour</button>
          <div className="tourNav">
            {i > 0 && <button className="btn btnGhost" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn btnBull" onClick={next} autoFocus>{i + 1 < steps.length ? "Next" : "Start trading"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
