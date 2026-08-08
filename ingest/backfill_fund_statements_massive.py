"""Backfill deep statement history into terminal/public/data/<SYM>.fund.json from Massive.

`gen_fund_us.py` builds each file from the yfinance cache, which carries ~5 fiscal periods.
The Stocks Advanced plan entitles `vX/reference/financials`, which serves SEC XBRL-derived
statements back to the 2009 XBRL mandate (AAPL: 17 fiscal years / 69 quarters, measured
2026-08-08). This pass EXTENDS the existing files in place — it does not rebuild them and
does not introduce a second store.

MERGE CONTRACT (deliberately conservative — a backfill must never degrade a live file):

  1. Key on the FISCAL LABEL, never the raw period-end date. The two sources disagree on
     the date for the SAME fiscal year — yfinance normalises AAPL FY2025 to 2025-09-30,
     the vendor reports the true 52/53-week close 2025-09-27. Keying on the date would
     have produced two columns for one fiscal year. Labels are derived with gen_fund_us's
     OWN `fy_label` / `fiscal_q_label` (imported, never re-implemented) so both halves of
     the pipeline share one fiscal calendar.
  2. NEVER overwrite an existing non-null value. Vendor data only (a) prepends periods
     older than anything on file and (b) fills per-field null holes. The richer yfinance
     rows (which carry EBITDA / cash / debt / capex / FCF — see massive_financials
     UNCOVERED) therefore survive untouched.
  3. `period_end` for an existing label keeps its existing value, so StatementsPage's
     transcript join (exact period_end ↔ earnings.q[].end) is unaffected.
  4. Per-period provenance is recorded in `statements.<tf>.src_by_period[]` and the
     uncovered-field set in `statements.<tf>.vendor_gaps`, so the UI discloses in plain
     words which rows the deep-history filings do not carry instead of showing bare dashes.
  5. When two vendor rows carry the SAME fiscal label — an original filing and the amendment
     that restates it — the LATER FILING WINS, by `row_filing_date`, under a total order
     (see `vendor_rows_newest_filing_first`). The chosen filing date lands in
     `statements.<tf>.filed_by_period[]` and a period we hold more than one filing for is
     flagged in `statements.<tf>.restated_by_period[]`, so a restatement is disclosable
     rather than silent.

     ⚠ THIS IS NOT FULL POINT-IN-TIME. A restatement still REWRITES the published column; we
     make the rewrite deterministic and visible, we do not preserve what was published before
     it. Latching each column to the figures as first published (and serving the restatement
     as a second, versioned read) is follow-up work — it needs a per-period version store this
     file deliberately does not introduce.

⚠ OPERATIONAL COROLLARY of rule 2: because the merge never overwrites, changing the vendor
  field mapping does NOT heal already-written files on a re-run — the old value is non-null
  and therefore wins. After a mapping change, re-emit the affected symbols with
  `gen_fund_us.py` first, then re-run this pass against the fresh files.

Usage (any Python 3.11+; no third-party deps):
    python3 ingest/backfill_fund_statements_massive.py --only AAPL,CROX
    python3 ingest/backfill_fund_statements_massive.py --limit 50
    python3 ingest/backfill_fund_statements_massive.py --dry-run --only AAPL
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gen_fund_us import atomic_write, dump, fiscal_q_label, fy_label  # noqa: E402
from massive_financials import (  # noqa: E402
    SOURCE_LABEL,
    api_key,
    fetch_financials,
    map_row,
    row_end_date,
    row_filing_date,
    statement_coverage,
    vendor_label,
)

CA_ROOT = Path(__file__).resolve().parents[1]
OUT = CA_ROOT / "terminal" / "public" / "data"

BLOCKS = ("income", "balance", "cashflow")

# Exchange suffixes the vendor's US filings API does not cover. The data dir is ~1,500
# files and all but a handful are CN/HK/KR listings fed by tushare/akshare, so an
# unfiltered sweep would spend ~3,000 round trips to be told "no results" — real quota on
# the shared key, every night. ADRs carry no suffix and are covered, so they still run.
NON_US_SUFFIXES = {
    "SZ", "SS", "SH", "BJ",   # mainland China
    "HK",                      # Hong Kong
    "KS", "KQ",               # Korea
    "T", "TW", "TWO",         # Japan / Taiwan
    "L", "PA", "DE", "AS", "SW", "MI", "MC", "ST", "OL", "HE", "CO",  # Europe
    "AX", "NZ", "SI", "BK", "NS", "BO", "SA", "MX", "TO", "V",        # rest of world
}


def is_vendor_market(sym: str) -> bool:
    """True when the symbol is a US listing (or ADR) the vendor can serve."""
    _, dot, suffix = sym.rpartition(".")
    if not dot:
        return True
    return suffix.upper() not in NON_US_SUFFIXES


def fy_end_month_from(dates: list[str]) -> int:
    """Fiscal-year-end month from the NEWEST annual period-end; December if unknown.

    Mirrors gen_fund_us.fy_end_month's intent (which reads the yfinance frame) for a
    caller that only has the emitted file plus the vendor rows.
    """
    for iso in reversed([d for d in dates if d]):
        try:
            return dt.date.fromisoformat(iso[:10]).month
        except ValueError:
            continue
    return 12


def label_for(end_iso: str, fy_end_m: int, timeframe: str) -> str | None:
    """Fiscal label from a period-end date — gen_fund_us's own arithmetic, never re-implemented."""
    return (
        fy_label(end_iso, fy_end_m)
        if timeframe == "annual"
        else fiscal_q_label(end_iso, fy_end_m, style="short")
    )


def vendor_row_label(raw: dict, end_iso: str, fy_end_m: int, timeframe: str) -> str | None:
    """Label for a vendor row: the vendor's stated fiscal period first, date arithmetic second.

    See massive_financials.vendor_label — the date arithmetic mis-buckets 52/53-week quarters
    that close on the 1st of a month, which silently collapses two real quarters into one
    column. The vendor's own fiscal_year/fiscal_period is authoritative and collision-free.
    """
    return vendor_label(raw, timeframe) or label_for(end_iso, fy_end_m, timeframe)


def vendor_rows_newest_filing_first(vendor_rows: list[dict]) -> list[dict]:
    """Vendor rows in a documented, restatement-aware order: NEWEST FILING FIRST.

    WHY THIS ORDER IS LOAD-BEARING. Two vendor rows can carry the SAME fiscal label — an
    original 10-Q and the 10-Q/A that restates it. The merge below is first-writer-wins by
    design (rule 2: never overwrite a non-null value), so whichever of the two the loop reaches
    first becomes published history. The API is asked for `sort=period_of_report_date&order=asc`
    but that column comes back NULL on live payloads, so the server order is arbitrary: the same
    fetch could publish the original one night and the restatement the next, with no version
    marker and no tell. Sorting here makes the winner a property of the DATA, not of the wire.

    Key: (filing date, period end, source index), descending. Filing date is the restatement
    anchor — the later filing supersedes. Period end and the original index are pure tiebreaks
    so the order is total: a row with no filing date sorts below every dated row (we only
    promote a row over another on evidence), and two rows identical on all three keys are
    impossible because the index is unique.

    Consequence for gap-filling: the newest filing creates the column, and OLDER filings can
    still contribute fields the restatement omitted — filling a null is not overwriting.
    """
    return [
        raw
        for _, raw in sorted(
            enumerate(vendor_rows),
            key=lambda pair: (
                row_filing_date(pair[1]) or "",
                row_end_date(pair[1]) or "",
                pair[0],
            ),
            reverse=True,
        )
    ]


def merge_period_set(
    existing: dict | None,
    vendor_rows: list[dict],
    fy_end_m: int,
    timeframe: str,
    base_src: str,
) -> tuple[dict, dict]:
    """Merge vendor rows into one StatementPeriodSet. Returns (merged_set, stats).

    Pure — no I/O — so the merge contract is unit-testable.
    """
    existing = existing or {}
    ex_periods: list[str] = list(existing.get("periods") or [])
    ex_ends: list[str] = list(existing.get("period_end") or [])
    # Provenance already on file. This pass is re-run nightly, and by rule 2 a column whose
    # values are all filled accepts nothing new — so a restatement that supplied this column
    # LAST night contributes nothing tonight. Without carrying the stamps forward, the filing
    # date and the restated flag would silently blank on the second run.
    ex_filed: list = list(existing.get("filed_by_period") or [])
    ex_restated: list = list(existing.get("restated_by_period") or [])

    # label → {end, values:{block:{field:v}}, src}
    merged: dict[str, dict] = {}
    order: list[str] = []

    def existing_at(block: str, index: int) -> dict:
        """Existing values for one block at one period index; short arrays read as null."""
        fields = existing.get(block) or {}
        out: dict = {}
        for field, arr in fields.items():
            seq = arr if isinstance(arr, list) else []
            out[field] = seq[index] if index < len(seq) else None
        return out

    for i, label in enumerate(ex_periods):
        if not label:
            continue
        merged[label] = {
            "end": ex_ends[i] if i < len(ex_ends) else None,
            "values": {b: existing_at(b, i) for b in BLOCKS},
            "src": [base_src],
            # Filing provenance (rule 5). `filed` is the filing whose values this column
            # actually took; `filings` is every distinct vendor filing seen THIS run, so ">1"
            # is the restatement tell; `restated` carries a tell an earlier run established.
            "filed": ex_filed[i] if i < len(ex_filed) else None,
            "filings": set(),
            "restated": bool(ex_restated[i]) if i < len(ex_restated) else False,
        }
        order.append(label)

    added, filled = 0, 0
    for raw in vendor_rows_newest_filing_first(vendor_rows):
        end = row_end_date(raw)
        if not end:
            continue
        label = vendor_row_label(raw, end, fy_end_m, timeframe)
        if not label:
            continue
        mapped = map_row(raw)
        filed = row_filing_date(raw)
        slot = merged.get(label)
        if slot is None:
            merged[label] = {
                "end": end,
                "values": {b: dict(mapped[b]) for b in BLOCKS},
                "src": [SOURCE_LABEL],
                "filed": filed,
                "filings": {filed} if filed else set(),
                "restated": False,
            }
            order.append(label)
            added += 1
            continue
        if filed:
            slot["filings"].add(filed)
        # existing label → fill null holes only; never overwrite, never move period_end
        touched = False
        for b in BLOCKS:
            for field, v in mapped[b].items():
                if v is None:
                    continue
                cur = slot["values"].setdefault(b, {}).get(field)
                if cur is None:
                    slot["values"][b][field] = v
                    touched = True
        if touched:
            filled += 1
            if SOURCE_LABEL not in slot["src"]:
                slot["src"].append(SOURCE_LABEL)
            # Rows arrive newest-filing-first, so the first one to supply a value is the newest
            # filing that supplied one. A row that contributed nothing never claims the column,
            # and an older filing never displaces a later one already stamped (this run or a
            # previous one) — ISO dates compare lexicographically.
            if filed and (slot["filed"] is None or filed > slot["filed"]):
                slot["filed"] = filed

    # oldest→newest by period-end (the contract's array order), label as a stable tiebreak
    order = sorted(set(order), key=lambda lab: (merged[lab]["end"] or "", lab))

    fields = {b: sorted({f for lab in order for f in merged[lab]["values"].get(b, {})}) for b in BLOCKS}
    out: dict = {
        "periods": order,
        "period_end": [merged[lab]["end"] for lab in order],
    }
    for b in BLOCKS:
        out[b] = {
            f: [merged[lab]["values"].get(b, {}).get(f) for lab in order] for f in fields[b]
        }
    out["src_by_period"] = ["+".join(merged[lab]["src"]) for lab in order]
    out["filed_by_period"] = [merged[lab].get("filed") for lab in order]
    out["restated_by_period"] = [
        bool(merged[lab].get("restated")) or len(merged[lab].get("filings") or ()) > 1
        for lab in order
    ]
    out["vendor_gaps"] = statement_coverage()

    return out, {"added": added, "filled": filled, "total": len(order), "before": len(ex_periods)}


def backfill_symbol(sym: str, path: Path, key: str, dry_run: bool = False) -> dict:
    """Fetch + merge one symbol. Returns a per-symbol stats dict (never raises on vendor gaps)."""
    fund = json.loads(path.read_text())
    stmts = fund.get("statements") or {}
    base_src = ((fund.get("src") or {}).get("statements")) or "unknown"

    try:
        ann_rows = fetch_financials(sym, "annual", key=key)
        qtr_rows = fetch_financials(sym, "quarterly", key=key)
    except RuntimeError as exc:
        return {"sym": sym, "status": "vendor-error", "detail": str(exc)}

    if not ann_rows and not qtr_rows:
        # A real coverage gap (foreign private issuers filing 20-F/40-F carry no XBRL
        # financials here). Leave the file untouched — an empty vendor answer is not a
        # reason to erase what yfinance already published.
        return {"sym": sym, "status": "no-vendor-coverage"}

    ann_ends = list((stmts.get("annual") or {}).get("period_end") or [])
    ann_ends += [row_end_date(r) or "" for r in ann_rows]
    fy_end_m = fy_end_month_from(ann_ends)

    ann, ann_stats = merge_period_set(stmts.get("annual"), ann_rows, fy_end_m, "annual", base_src)
    qtr, qtr_stats = merge_period_set(stmts.get("quarterly"), qtr_rows, fy_end_m, "quarterly", base_src)

    fund["statements"] = {"annual": ann, "quarterly": qtr}
    src = dict(fund.get("src") or {})
    if src.get("statements") and SOURCE_LABEL not in str(src["statements"]):
        src["statements"] = f"{src['statements']}+{SOURCE_LABEL}"
    elif not src.get("statements"):
        src["statements"] = SOURCE_LABEL
    fund["src"] = src

    if not dry_run:
        atomic_write(path, dump(fund))

    return {
        "sym": sym,
        "status": "ok",
        "fy_end_month": fy_end_m,
        "annual": ann_stats,
        "quarterly": qtr_stats,
    }


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--only", help="comma-separated symbols (default: every *.fund.json)")
    ap.add_argument("--limit", type=int, default=0, help="cap the number of symbols processed")
    ap.add_argument("--dry-run", action="store_true", help="fetch + merge but do not write")
    args = ap.parse_args(argv)

    if args.only:
        syms = [s.strip().upper() for s in args.only.split(",") if s.strip()]
        paths = [(s, OUT / f"{s}.fund.json") for s in syms]
        missing = [s for s, p in paths if not p.exists()]
        if missing:
            print(f"no fund.json for: {', '.join(missing)} — run gen_fund_us.py first", file=sys.stderr)
        paths = [(s, p) for s, p in paths if p.exists()]
    else:
        # A bare sweep is US-only: see NON_US_SUFFIXES. An explicit --only is honoured as
        # given, so a one-off probe of a suffixed ticker is still possible.
        paths = sorted(
            (p.name.removesuffix(".fund.json"), p)
            for p in OUT.glob("*.fund.json")
            if is_vendor_market(p.name.removesuffix(".fund.json"))
        )
    if args.limit:
        paths = paths[: args.limit]

    key = api_key()
    ok = added = filled = gaps = errs = 0
    for sym, path in paths:
        st = backfill_symbol(sym, path, key, dry_run=args.dry_run)
        if st["status"] == "ok":
            ok += 1
            added += st["annual"]["added"] + st["quarterly"]["added"]
            filled += st["annual"]["filled"] + st["quarterly"]["filled"]
            print(
                f"{sym:8s} annual {st['annual']['before']:>3}→{st['annual']['total']:<3} "
                f"quarterly {st['quarterly']['before']:>3}→{st['quarterly']['total']:<3} "
                f"(+{st['annual']['added'] + st['quarterly']['added']} periods, "
                f"{st['annual']['filled'] + st['quarterly']['filled']} gap-filled)"
            )
        elif st["status"] == "no-vendor-coverage":
            gaps += 1
            print(f"{sym:8s} no vendor coverage — file left unchanged")
        else:
            errs += 1
            print(f"{sym:8s} {st['status']}: {st.get('detail', '')}", file=sys.stderr)

    print(
        f"\ndone: {ok} updated, {gaps} without vendor coverage, {errs} errors; "
        f"+{added} periods added, {filled} periods gap-filled"
        + (" (DRY RUN — nothing written)" if args.dry_run else "")
    )
    return 1 if errs and not ok else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
