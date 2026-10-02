#!/usr/bin/env python3
"""Apply the NIFTY/BANKNIFTY/SENSEX lot-size fix to Winbannu App.tsx.
Usage:  python fix_lot_size.py src/App.tsx
Creates App.tsx.bak before writing. Stops without changes if anything doesn't match."""
import re, shutil, sys

path = sys.argv[1] if len(sys.argv) > 1 else "src/App.tsx"
src = open(path, encoding="utf-8").read()

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.exit(f"ABORT: expected {count} match(es), found {n}:\n  {old[:90]}")
    src = src.replace(old, new)

def rex(pattern, new, count=1):
    global src
    src, n = re.subn(pattern, new, src)
    if n != count:
        sys.exit(f"ABORT: regex expected {count} match(es), found {n}:\n  {pattern[:90]}")

# 1. Lot-size config
rep("const MULTIPLIER = 1;",
    "// Index option lot sizes (NSE revised Jan 2026). Reviewed every ~6 months.\n"
    "const LOT_SIZES = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };\n"
    "const lotSizeFor = (symbol) => LOT_SIZES[displayTicker(symbol)] ?? 1;\n"
    "// Positions opened before this change were stored in units, not lots.\n"
    "const posMultiplier = (p) => (p.lotBased ? lotSizeFor(p.symbol) : 1);")

# 2. Portfolio option market value
rep("return sum + price * MULTIPLIER * p.qty;",
    "return sum + price * posMultiplier(p) * p.qty;")

# 3. placeOptionOrder
rep("const premiumTotal = price * MULTIPLIER * qty;",
    "const lot = lotSizeFor(ticket.symbol);\n    const premiumTotal = price * lot * qty;")
rep("p.strike === ticket.strike && p.expiry === ticket.expiry;",
    "p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased;", count=2)
rep("(existing.avgPremium * existing.qty + premiumTotal) / totalQty",
    "(existing.avgPremium * existing.qty + price * qty) / totalQty")
rep("expiry: ticket.expiry, qty, avgPremium: price }];",
    "expiry: ticket.expiry, qty, avgPremium: price, lotBased: true }];")
rep("${qty}x ${label}", '${qty} lot${qty > 1 ? "s" : ""} (${qty * lot} units) ${label}', count=4)

# 4. closeOptionPosition
rep("const total = price * MULTIPLIER * pos.qty;",
    "const total = price * posMultiplier(pos) * pos.qty;")

# 5. Option positions table
rep("const mv = price * MULTIPLIER * p.qty;", "const mv = price * posMultiplier(p) * p.qty;")
rep("p.avgPremium * MULTIPLIER * p.qty", "p.avgPremium * posMultiplier(p) * p.qty")
rex(r'(\{fmtDate\(new Date\(p\.expiry\)\)\}</td>\s*<td className="mono">)\{p\.qty\}',
    r'\1{p.lotBased ? `${p.qty} × ${lotSizeFor(p.symbol)}` : p.qty}')

# 6. OptionTicket modal
rep("const greeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);",
    "const greeks = blackScholes(spot, ticket.strike, T, RISK_FREE, sigma, ticket.type);\n"
    "  const lot = lotSizeFor(ticket.symbol);")
rex(r'<label>Quantity</label>(\s*<input type="number" min="1" className="qtyInput mono" value=\{qty\})',
    r'<label>Lots <span className="dim">(1 lot = {lot})</span></label>\1')
rep("Est. total: <span>{fmtMoney(greeks.price * MULTIPLIER * qty)}</span> · Held: {heldQty}</div>",
    'Est. total ({qty * lot} units): <span>{fmtMoney(greeks.price * lot * qty)}</span> · Held: {heldQty} lot{heldQty === 1 ? "" : "s"}</div>')

# 7. Chain note
rep("Quantities are per unit, not exchange lot size.",
    "Quantities are in exchange lots (NIFTY 65, BANKNIFTY 30, SENSEX 20).")

# 8. heldQty prop counts only lot-based positions
rep("p.strike === ticket.strike && p.expiry === ticket.expiry)?.qty ?? 0}",
    "p.strike === ticket.strike && p.expiry === ticket.expiry && p.lotBased)?.qty ?? 0}")

if "MULTIPLIER" in src:
    sys.exit("ABORT: a MULTIPLIER reference is still left — nothing written.")

shutil.copy(path, path + ".bak")
open(path, "w", encoding="utf-8").write(src)
print(f"Done. Lot-size fix applied to {path} (backup: {path}.bak)")
