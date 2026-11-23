#!/usr/bin/env python3
"""Download NSE's permitted lot sizes (fo_mktlots.csv) and write public/lot-sizes.json.

The CSV has one row per underlying and one column per expiry month, e.g.
    UNDERLYING, SYMBOL, NOV-26, DEC-26, JAN-27
so lot-size revisions (which apply from a given expiry month) are kept.
Run by .github/workflows/lot-sizes.yml every trading day; safe to run by hand.
"""
import csv, io, json, sys, urllib.request, datetime, os

URL = "https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "lot-sizes.json")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/csv,*/*", "Referer": "https://www.nseindia.com/",
}

def main():
    req = urllib.request.Request(URL, headers=HEADERS)
    raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
    rows = list(csv.reader(io.StringIO(raw)))
    head = [h.strip().upper() for h in rows[0]]
    months = [(i, h) for i, h in enumerate(head) if len(h) == 6 and h[3] == "-"]  # NOV-26
    if "SYMBOL" not in head or not months:
        sys.exit(f"Unexpected CSV header: {head}")
    si = head.index("SYMBOL")
    lots = {}
    for r in rows[1:]:
        if len(r) <= si or not r[si].strip() or r[si].strip().upper() == "SYMBOL":
            continue
        sym = r[si].strip().upper()
        m = {}
        for i, h in months:
            v = r[i].strip() if i < len(r) else ""
            if v.isdigit() and int(v) > 0:
                m[h] = int(v)
        if m:
            lots[sym] = m
    if len(lots) < 100:
        sys.exit(f"Only {len(lots)} symbols parsed; refusing to overwrite")
    data = {"source": URL, "updated": datetime.date.today().isoformat(), "lots": dict(sorted(lots.items()))}
    old = None
    if os.path.exists(OUT):
        with open(OUT) as f:
            old = json.load(f)
    if old and old.get("lots") == data["lots"]:
        print("No change in lot sizes"); return
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Wrote {len(lots)} symbols, months {[h for _, h in months]}")

if __name__ == "__main__":
    main()
