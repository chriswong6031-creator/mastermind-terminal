"""Massive (polygon.io) `vX/reference/financials` → mastermind.fund/v1 statement blocks.

The Terminal's Statements / Revenue tabs read `statements.annual` / `statements.quarterly`
out of `terminal/public/data/<SYM>.fund.json`, which `gen_fund_us.py` builds from the
yfinance cache. yfinance only carries ~5 fiscal periods, so the deep history the tabs are
designed to page through was never there. The Stocks Advanced plan entitles the Financials
& Ratios API, which serves SEC XBRL-derived statements back to the 2009 XBRL mandate.

This module is the *mapping* half (pure functions + a thin HTTP client);
`backfill_fund_statements_massive.py` is the driver that merges the result into the
existing per-symbol files. Split so the mapping is unit-testable without a key or network.

MEASURED VENDOR SHAPE (AAPL, 2026-08-08) — the mapping is built from the payload, not docs:

  income_statement (23 keys)  revenues · cost_of_revenue · gross_profit · operating_expenses ·
                              operating_income_loss · nonoperating_income_loss ·
                              income_loss_from_continuing_operations_before_tax ·
                              income_tax_expense_benefit · net_income_loss ·
                              basic/diluted_earnings_per_share …
  balance_sheet (18 keys)     assets · current_assets · noncurrent_assets · liabilities ·
                              current_liabilities · noncurrent_liabilities · equity ·
                              long_term_debt · inventory · accounts_payable …
  cash_flow_statement (8)     net_cash_flow_from_{operating,investing,financing}_activities
                              (+ _continuing variants) · net_cash_flow

⚠ `operating_expenses` EXCLUDES cost of revenue. AAPL FY2025:
     gross_profit 195_201 − operating_expenses 62_151 = operating_income_loss 133_050.
   This matches the yfinance rows it merges into: gen_fund_us maps `opex` from yfinance's
   "Operating Expense", which is also excl-COGS (AAPL FY2025 = 62.2B, the same number). So
   `opex` passes through as-is and the two sources agree on the contract's meaning.

   The corollary is a PRE-EXISTING display bug this pass had to fix: StatementsPage rendered
   its "Operating expenses (excl. COGS)" row as `opex − cogs`, i.e. it assumed `opex` was the
   COGS-INCLUSIVE total. On AAPL FY2025 that printed −158_809M on the live tab. Deepening the
   history to 17 columns would have multiplied that fabricated negative, so the row now
   derives `gross_profit − op_income` (source-agnostic, always the true excl-COGS figure)
   and falls back to `opex`. NOTE gen_fund_us's fallback label for `opex` is "Total Expenses",
   which IS COGS-inclusive — one more reason the display derives rather than trusts the field.

⚠ HONEST NULLS — five contract line items have no vendor equivalent and stay null on
   vendor-only periods rather than being guessed or zero-filled:
     income.ebitda        no D&A line in the vendor cash-flow block, so it cannot be derived
     balance.cash         no cash-and-equivalents line
     balance.debt         only `long_term_debt` is served; emitting it as TOTAL debt would
                          understate leverage for any issuer with short-term borrowings
     balance.net_debt     needs cash
     cashflow.capex/fcf   no capital-expenditure line in the 8-key cash-flow block
   `statement_coverage()` reports this set so the UI can disclose it in plain words.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

CA_ROOT = Path(__file__).resolve().parents[1]

BASE = "https://api.polygon.io/vX/reference/financials"
SOURCE_LABEL = "massive"

# Contract line items that the vendor payload cannot fill (see module docstring).
UNCOVERED = {
    "income": ("ebitda",),
    "balance": ("cash", "debt", "net_debt"),
    "cashflow": ("capex", "fcf"),
}


# ───────────────────────────── key handling ─────────────────────────────
def api_key() -> str:
    """POLYGON_API_KEY / MASSIVE_API_KEY from the environment. Never logged.

    Same pair, same precedence as ingest/polygon_bars.py and
    terminal/lib/intradaySources.ts. The value is supplied by the caller's
    environment — `refresh_fund.sh` sources charting-app/.env before invoking the
    ingest children; a standalone run needs the var exported first:
        set -a; . /path/to/charting-app/.env; set +a
    """
    for var in ("POLYGON_API_KEY", "MASSIVE_API_KEY"):
        v = os.environ.get(var)
        if v and v.strip():
            return v.strip()
    raise RuntimeError(
        "POLYGON_API_KEY / MASSIVE_API_KEY not set — export it from charting-app/.env first"
    )


# ───────────────────────────── HTTP ─────────────────────────────
def _get(url: str, key: str, timeout: int = 60) -> dict:
    """One GET → parsed JSON. curl (not urllib) per ingest/polygon_bars.py: some edge
    endpoints 1010-block the default urllib user-agent."""
    sep = "&" if "?" in url else "?"
    out = subprocess.run(
        ["curl", "-s", "-m", str(timeout), "-w", "\n%{http_code}", f"{url}{sep}apiKey={key}"],
        capture_output=True,
        text=True,
    ).stdout
    body, _, code = out.rpartition("\n")
    code = code.strip()
    if code != "200":
        # Surface the status without ever echoing the URL (it carries the key).
        raise RuntimeError(f"financials HTTP {code or 'no-response'}")
    return json.loads(body)


def fetch_financials(
    ticker: str,
    timeframe: str,
    key: str | None = None,
    max_pages: int = 12,
    pause: float = 0.0,
) -> list[dict]:
    """All `timeframe` ('annual' | 'quarterly') rows for `ticker`, oldest→newest.

    Follows `next_url` (100/page). `max_pages` bounds a runaway cursor; 12 pages is
    1,200 periods — far past any issuer's filing history.
    """
    key = key or api_key()
    url = (
        f"{BASE}?ticker={ticker}&timeframe={timeframe}&limit=100"
        "&sort=period_of_report_date&order=asc"
    )
    rows: list[dict] = []
    pages = 0
    while url and pages < max_pages:
        payload = _get(url, key)
        rows.extend(payload.get("results") or [])
        url = payload.get("next_url")
        pages += 1
        if url and pause:
            time.sleep(pause)
    return rows


# ───────────────────────────── mapping ─────────────────────────────
def _v(block: dict, field: str):
    """Vendor blocks are {field: {value, unit, order, label}} — pull a finite float."""
    cell = (block or {}).get(field)
    if not isinstance(cell, dict):
        return None
    raw = cell.get("value")
    if raw is None or isinstance(raw, bool):
        return None
    try:
        f = float(raw)
    except (TypeError, ValueError):
        return None
    return None if f != f else f


def _first(*vals):
    """First non-null value. NOT `a or b` — a legitimate 0.0 cash flow is falsy."""
    for v in vals:
        if v is not None:
            return v
    return None


def row_end_date(raw: dict) -> str | None:
    """The period-end ISO date for a vendor row.

    `period_of_report_date` is documented but comes back null on live payloads, so
    `end_date` is the anchor. Verified 2026-08-08 against AAPL.
    """
    for field in ("period_of_report_date", "end_date"):
        v = raw.get(field)
        if isinstance(v, str) and len(v) >= 10:
            return v[:10]
    return None


def vendor_label(raw: dict, timeframe: str) -> str | None:
    """Fiscal label straight from the vendor's own `fiscal_year` / `fiscal_period`.

    ⚠ Why not re-derive from the period-end date: gen_fund_us's `fiscal_q_label` buckets a
    quarter by the CALENDAR MONTH of its end date. 52/53-week filers close a quarter on the
    1st of a month often enough that this bumps the quarter a full step forward —
    AAPL's fiscal Q3 2017 ended 2017-07-01 and derived as "Q4 '17", colliding with the real
    Q4 (ended 2017-09-30). Measured 2026-08-08: 2 such collisions on AAPL, 4 on NVDA. Each
    collision silently collapses two real quarters into one column.

    The month arithmetic is correct for yfinance (which normalises every period-end to a
    month-end, so the 1st-of-month case cannot arise) — the shared helper stays the fallback
    for rows where the vendor omits the fiscal fields.

    Label shapes match the fund.json contract exactly: annual "2025", quarterly "Q3 '26".
    """
    fy = raw.get("fiscal_year")
    fp = raw.get("fiscal_period")
    if not fy:
        return None
    try:
        year = int(str(fy)[:4])
    except (TypeError, ValueError):
        return None
    if timeframe == "annual":
        return str(year)
    fp = str(fp or "").upper()
    if len(fp) != 2 or fp[0] != "Q" or fp[1] not in "1234":
        return None
    return f"{fp} '{year % 100:02d}"


def map_row(raw: dict) -> dict:
    """One vendor row → {income, balance, cashflow} of contract line items.

    Every contract field is present; unavailable ones are None (never 0).
    """
    fin = raw.get("financials") or {}
    inc = fin.get("income_statement") or {}
    bal = fin.get("balance_sheet") or {}
    cfs = fin.get("cash_flow_statement") or {}

    cogs = _v(inc, "cost_of_revenue")
    return {
        "income": {
            "revenue": _v(inc, "revenues"),
            "cogs": cogs,
            "gross_profit": _v(inc, "gross_profit"),
            # contract `opex` EXCLUDES COGS — same convention as the yfinance rows this
            # merges into (see module docstring). Passed through as-is.
            "opex": _v(inc, "operating_expenses"),
            "op_income": _v(inc, "operating_income_loss"),
            "nonop_income": _v(inc, "nonoperating_income_loss"),
            "pretax_income": _v(inc, "income_loss_from_continuing_operations_before_tax"),
            "taxes": _v(inc, "income_tax_expense_benefit"),
            "net_income": _v(inc, "net_income_loss"),
            "eps_basic": _v(inc, "basic_earnings_per_share"),
            "eps_diluted": _v(inc, "diluted_earnings_per_share"),
            "ebitda": None,  # no D&A line in the vendor payload — never guessed
        },
        "balance": {
            "assets": _v(bal, "assets"),
            "assets_st": _v(bal, "current_assets"),
            "assets_lt": _v(bal, "noncurrent_assets"),
            "liabilities": _v(bal, "liabilities"),
            "liab_st": _v(bal, "current_liabilities"),
            "liab_lt": _v(bal, "noncurrent_liabilities"),
            "equity": _v(bal, "equity"),
            "debt": None,  # only long_term_debt is served — not TOTAL debt
            "cash": None,
            "net_debt": None,
        },
        "cashflow": {
            "cfo": _first(
                _v(cfs, "net_cash_flow_from_operating_activities"),
                _v(cfs, "net_cash_flow_from_operating_activities_continuing"),
            ),
            "cfi": _first(
                _v(cfs, "net_cash_flow_from_investing_activities"),
                _v(cfs, "net_cash_flow_from_investing_activities_continuing"),
            ),
            "cff": _first(
                _v(cfs, "net_cash_flow_from_financing_activities"),
                _v(cfs, "net_cash_flow_from_financing_activities_continuing"),
            ),
            "capex": None,
            "fcf": None,
        },
    }


def statement_coverage() -> dict:
    """Contract fields this vendor cannot fill, by block — drives the UI disclosure."""
    return {block: list(fields) for block, fields in UNCOVERED.items()}
