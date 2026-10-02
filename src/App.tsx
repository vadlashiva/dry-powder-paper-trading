#!/usr/bin/env python3
# WINBANNU FIX SCRIPT - lot size + NSE holidays
# DO NOT paste this into App.tsx. Save it next to package.json and run:
#     python winbannu_fix.py
import os, re, shutil, sys

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join("src", "App.tsx")
if not os.path.exists(path):
    sys.exit(f"ABORT: {path} not found. Run this from the project folder (where package.json is).")
src = open(path, encoding="utf-8").read()

if src.lstrip().startswith("#!/usr/bin/env python") or "import re, shutil, sys" in src:
    sys.exit("ABORT: App.tsx contains Python code, not your app. Restore App.tsx from GitHub history first.")
if "function TradingApp" not in src:
    sys.exit("ABORT: this doesn't look like the Winbannu App.tsx.")

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit(f"ABORT (nothing written): expected {count} match(es), found {n}:\n  {old[:90]}")
    src = src.replace(old, new)

def rex(pattern, new, count=1, flags=0):
    global src
    src, n = re.subn(pattern, new, src, flags=flags)
    if n != count:
        sys.exit(f"ABORT (nothing written): pattern matched {n} time(s), expected {count}:\n  {pattern[:90]}")

# ---------------- PART 1: lot size ----------------
if "LOT_SIZES" in src:
    print("Lot-size fix already present - skipped.")
else:
    rep("const MULTIPLIER = 1;",
        "// Index option lot sizes (NSE revised Jan 2026). Reviewed every ~6 months.\n"
        "const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };\n"
        "const lotSizeFor = (symbol) => LOT_SIZES[displayTicker(symbol)] ?? 1;\n"
        "// Positions opened before this change were stored in units, not lots.\n"
        "const posMultiplier = (p) => (p.lotBased ? lotSizeFor(p.symbol) : 1);")
    rep("return sum + price * MULTIPLIER * p.qty;", "return sum + price * posMultiplier(p) * p.qty;")
    rep("const premiumTotal = price * MULTIPLIER * qty;",
        "const lot = lotSizeFor(ticket.symbol);\n    const premiumTotal = price * lot * qty;")
    rep("p.strike === ticket.strike && p.expiry === ticket.expiry;",
        "p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased;", count=2)
    rep("(existing.avgPremium * existing.qty + premiumTotal) / totalQty",
        "(existing.avgPremium * existing.qty + price * qty) / totalQty")
    rep("expiry: ticket.expiry, qty, avgPremium: price }];",
        "expiry: ticket.expiry, qty, avgPremium: price, lotBased: true }];")
    rep("${qty}x ${label}", '${qty} lot${qty > 1 ? "s" : ""} (${qty * lot} units) ${label}', count=4)
    rep("const total = price * MULTIPLIER * pos.qty;", "const total = price * posMultiplier(pos) * pos.qty;")
    rep("const mv = price * MULTIPLIER * p.qty;", "const mv = price * posMultiplier(p) * p.qty;")
    rep("p.avgPremium * MULTIPLIER * p.qty", "p.avgPremium * posMultiplier(p) * p.qty")
    rex(r'(\{fmtDate\(new Date\(p\.expiry\)\)\}</td>\s*<td className="mono">)\{p\.qty\}',
        r'\1{p.lotBased ? `${p.qty} × ${lotSizeFor(p.symbol)}` : p.qty}')
    rep("const greeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);",
        "const greeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);\n"
        "  const lot = lotSizeFor(ticket.symbol);")
    rex(r'<label>Quantity</label>(\s*<input type="number" min="1" className="qtyInput mono" value=\{qty\})',
        r'<label>Lots <span className="dim">(1 lot = {lot})</span></label>\1')
    rep("Est. total: <span>{fmtMoney(greeks.price * MULTIPLIER * qty)}</span> · Held: {heldQty}</div>",
        'Est. total ({qty * lot} units): <span>{fmtMoney(greeks.price * lot * qty)}</span> · Held: {heldQty} lot{heldQty === 1 ? "" : "s"}</div>')
    rep("Quantities are per unit, not exchange lot size.",
        "Quantities are in exchange lots (NIFTY 65, BANKNIFTY 30, SENSEX 20).")
    rep("p.strike === ticket.strike && p.expiry === ticket.expiry)?.qty ?? 0}",
        "p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased)?.qty ?? 0}")
    if "MULTIPLIER" in src:
        sys.exit("ABORT (nothing written): a MULTIPLIER reference is still left.")
    print("Lot-size fix applied.")

# ---------------- PART 2: NSE holidays ----------------
HOLIDAY_CODE = r'''// NSE equity & F&O trading holidays (weekdays only). Update each December from nseindia.com.
const NSE_HOLIDAYS = {
  "2026-01-15": "Maharashtra Municipal Election", "2026-01-26": "Republic Day",
  "2026-03-03": "Holi", "2026-03-26": "Ram Navami", "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday", "2026-04-14": "Ambedkar Jayanti", "2026-05-01": "Maharashtra Day",
  "2026-05-28": "Bakri Id", "2026-06-26": "Muharram", "2026-09-14": "Ganesh Chaturthi",
  "2026-10-02": "Gandhi Jayanti", "2026-10-20": "Dussehra", "2026-11-10": "Diwali Balipratipada",
  "2026-11-24": "Guru Nanak Jayanti", "2026-12-25": "Christmas",
};

function getMarketStatus() {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const key = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  const holiday = NSE_HOLIDAYS[key];
  if (holiday) return { isOpen: false, label: `Market Closed · ${holiday} holiday` };
  const isOpen = day >= 1 && day <= 5 && mins >= 555 && mins <= 930; // 9:15 AM - 3:30 PM IST
  return { isOpen, label: isOpen ? "Market Open" : "Market Closed · Opens 9:15 AM Mon–Fri" };
}
'''
if "NSE_HOLIDAYS" in src:
    print("Holiday fix already present - skipped.")
else:
    rex(r"function getMarketStatus\(\) \{.*?\n\}\n", lambda m: HOLIDAY_CODE, flags=re.S)
    print("Holiday fix applied.")

shutil.copy(path, path + ".bak")
open(path, "w", encoding="utf-8").write(src)
print(f"\nDONE. {path} updated (backup saved as {path}.bak).")
print("Next: delete winbannu_fix.py and App.tsx.bak, then git add src/App.tsx, commit, push.")
