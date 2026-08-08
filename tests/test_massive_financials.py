"""Tests for the Massive (polygon.io) statements backfill.

Two defects these pin, both found against live payloads on 2026-08-08:

  1. FISCAL-LABEL COLLISION. gen_fund_us.fiscal_q_label buckets a quarter by the calendar
     MONTH of its period-end. 52/53-week filers close quarters on the 1st of a month often
     enough that this bumps them a full quarter forward — AAPL's fiscal Q3 2017 ended
     2017-07-01 and derived as "Q4 '17", colliding with the real Q4. Two real quarters would
     collapse into one column. `vendor_label` reads the vendor's own fiscal_year/
     fiscal_period instead.

  2. OPEX SEMANTICS. The vendor's `operating_expenses` EXCLUDES cost of revenue, matching
     yfinance's "Operating Expense". Summing the two would have written a COGS-inclusive
     total into a field every consumer reads as excl-COGS.

Plus the merge contract itself: backfill-only, never overwrite, arrays stay aligned.
"""
from __future__ import annotations

from ingest.backfill_fund_statements_massive import (
    fy_end_month_from,
    is_vendor_market,
    merge_period_set,
    vendor_row_label,
)
from ingest.massive_financials import map_row, statement_coverage, vendor_label


# ── fixtures shaped exactly like the live payload ────────────────────────────
def cell(v):
    return {"value": v, "unit": "USD", "order": 100}


def vrow(fy: str, fp: str, end: str, **over):
    """A vendor row with the AAPL FY2025 line items, overridable per test."""
    inc = {
        "revenues": cell(416_161_000_000.0),
        "cost_of_revenue": cell(220_960_000_000.0),
        "gross_profit": cell(195_201_000_000.0),
        "operating_expenses": cell(62_151_000_000.0),
        "operating_income_loss": cell(133_050_000_000.0),
        "nonoperating_income_loss": cell(-321_000_000.0),
        "income_loss_from_continuing_operations_before_tax": cell(132_729_000_000.0),
        "income_tax_expense_benefit": cell(20_719_000_000.0),
        "net_income_loss": cell(112_010_000_000.0),
        "basic_earnings_per_share": cell(7.49),
        "diluted_earnings_per_share": cell(7.46),
    }
    bal = {
        "assets": cell(359_241_000_000.0),
        "current_assets": cell(147_957_000_000.0),
        "noncurrent_assets": cell(211_284_000_000.0),
        "liabilities": cell(285_508_000_000.0),
        "current_liabilities": cell(165_631_000_000.0),
        "noncurrent_liabilities": cell(119_877_000_000.0),
        "equity": cell(73_733_000_000.0),
        "long_term_debt": cell(90_678_000_000.0),
    }
    cfs = {
        "net_cash_flow_from_operating_activities": cell(111_482_000_000.0),
        "net_cash_flow_from_investing_activities": cell(15_195_000_000.0),
        "net_cash_flow_from_financing_activities": cell(-120_686_000_000.0),
    }
    row = {
        "fiscal_year": fy,
        "fiscal_period": fp,
        "end_date": end,
        "period_of_report_date": None,  # live payloads return null here
        "financials": {"income_statement": inc, "balance_sheet": bal, "cash_flow_statement": cfs},
    }
    row.update(over)
    return row


# ── 1. fiscal labels ─────────────────────────────────────────────────────────
def test_vendor_label_shapes_match_the_contract():
    assert vendor_label(vrow("2025", "FY", "2025-09-27"), "annual") == "2025"
    assert vendor_label(vrow("2026", "Q3", "2026-06-27"), "quarterly") == "Q3 '26"
    assert vendor_label(vrow("2009", "Q1", "2008-12-27"), "quarterly") == "Q1 '09"


def test_52_53_week_quarter_ending_on_the_first_does_not_collide():
    """AAPL fiscal Q3 2017 ended 2017-07-01; Q4 ended 2017-09-30 (fy_end_month=9).

    Date arithmetic labels BOTH "Q4 '17". The vendor's own fiscal_period keeps them apart.
    """
    q3 = vrow("2017", "Q3", "2017-07-01")
    q4 = vrow("2017", "Q4", "2017-09-30")
    assert vendor_row_label(q3, "2017-07-01", 9, "quarterly") == "Q3 '17"
    assert vendor_row_label(q4, "2017-09-30", 9, "quarterly") == "Q4 '17"


def test_label_falls_back_to_date_arithmetic_when_the_vendor_omits_fiscal_fields():
    bare = vrow("", "", "2022-06-30")
    bare["fiscal_year"] = None
    bare["fiscal_period"] = None
    assert vendor_row_label(bare, "2022-06-30", 12, "quarterly") == "Q2 '22"
    assert vendor_row_label(bare, "2022-06-30", 12, "annual") == "2022"


def test_fy_end_month_reads_the_newest_annual_period_end():
    assert fy_end_month_from(["2023-12-31", "2024-12-31", "2025-09-27"]) == 9
    assert fy_end_month_from([]) == 12  # unknown → December
    assert fy_end_month_from(["", "not-a-date"]) == 12


# ── 2. field mapping ─────────────────────────────────────────────────────────
def test_opex_excludes_cogs_and_reconciles_to_operating_income():
    inc = map_row(vrow("2025", "FY", "2025-09-27"))["income"]
    assert inc["opex"] == 62_151_000_000.0  # NOT cogs + operating_expenses
    assert inc["gross_profit"] - inc["opex"] == inc["op_income"]


def test_uncovered_line_items_are_null_never_zero_or_guessed():
    m = map_row(vrow("2025", "FY", "2025-09-27"))
    assert m["income"]["ebitda"] is None
    # long_term_debt IS served but is not TOTAL debt — emitting it would understate leverage
    assert m["balance"]["debt"] is None
    assert m["balance"]["cash"] is None
    assert m["balance"]["net_debt"] is None
    assert m["cashflow"]["capex"] is None
    assert m["cashflow"]["fcf"] is None
    assert statement_coverage() == {
        "income": ["ebitda"],
        "balance": ["cash", "debt", "net_debt"],
        "cashflow": ["capex", "fcf"],
    }


def test_zero_cash_flow_is_kept_not_treated_as_missing():
    row = vrow("2025", "FY", "2025-09-27")
    cfs = row["financials"]["cash_flow_statement"]
    cfs["net_cash_flow_from_operating_activities"] = cell(0.0)
    cfs["net_cash_flow_from_operating_activities_continuing"] = cell(999.0)
    assert map_row(row)["cashflow"]["cfo"] == 0.0


def test_missing_block_maps_to_all_nulls_rather_than_raising():
    row = vrow("2025", "FY", "2025-09-27")
    row["financials"] = {}
    m = map_row(row)
    assert set(m) == {"income", "balance", "cashflow"}
    assert all(v is None for v in m["income"].values())


# ── 3. merge contract ────────────────────────────────────────────────────────
def existing_set():
    return {
        "periods": ["2024", "2025"],
        "period_end": ["2024-09-30", "2025-09-30"],
        "income": {"revenue": [391_035_000_000.0, None], "ebitda": [134_661_000_000.0, 144_748_000_000.0]},
        "balance": {"cash": [29_943_000_000.0, 35_934_000_000.0]},
        "cashflow": {"capex": [-9_447_000_000.0, -12_715_000_000.0]},
    }


def test_backfill_prepends_older_periods_oldest_first():
    out, stats = merge_period_set(
        existing_set(),
        [vrow("2022", "FY", "2022-09-24"), vrow("2023", "FY", "2023-09-30")],
        9,
        "annual",
        "yfinance",
    )
    assert out["periods"] == ["2022", "2023", "2024", "2025"]
    assert stats["added"] == 2
    assert out["src_by_period"] == ["massive", "massive", "yfinance", "yfinance"]


def test_merge_never_overwrites_an_existing_value_but_does_fill_a_null_hole():
    out, stats = merge_period_set(existing_set(), [vrow("2025", "FY", "2025-09-27")], 9, "annual", "yfinance")
    i = out["periods"].index("2025")
    # FY2025 revenue was null on file → filled from the vendor
    assert out["income"]["revenue"][i] == 416_161_000_000.0
    # …while the richer yfinance-only rows survive untouched
    assert out["income"]["ebitda"][i] == 144_748_000_000.0
    assert out["balance"]["cash"][i] == 35_934_000_000.0
    assert out["cashflow"]["capex"][i] == -12_715_000_000.0
    assert out["src_by_period"][i] == "yfinance+massive"
    assert stats["filled"] == 1 and stats["added"] == 0


def test_existing_period_end_is_not_moved_by_a_disagreeing_vendor_date():
    """yfinance normalises AAPL FY2025 to 2025-09-30; the vendor reports 2025-09-27.

    Keying on the DATE would make two columns for one fiscal year, and rewriting the stored
    date would break StatementsPage's exact-match transcript join.
    """
    out, _ = merge_period_set(existing_set(), [vrow("2025", "FY", "2025-09-27")], 9, "annual", "yfinance")
    assert out["periods"].count("2025") == 1
    assert out["period_end"][out["periods"].index("2025")] == "2025-09-30"


def test_every_array_stays_aligned_to_periods():
    out, _ = merge_period_set(
        existing_set(),
        [vrow(str(y), "FY", f"{y}-09-27") for y in range(2015, 2024)],
        9,
        "annual",
        "yfinance",
    )
    n = len(out["periods"])
    for block in ("income", "balance", "cashflow"):
        for field, arr in out[block].items():
            assert len(arr) == n, f"{block}.{field} is {len(arr)} long, expected {n}"


def test_empty_vendor_answer_leaves_the_published_series_intact():
    """A thin-coverage name (foreign private issuers file no XBRL financials here) must not
    lose what yfinance already published."""
    out, stats = merge_period_set(existing_set(), [], 9, "annual", "yfinance")
    assert out["periods"] == ["2024", "2025"]
    assert out["income"]["ebitda"] == [134_661_000_000.0, 144_748_000_000.0]
    assert stats["added"] == 0 and stats["filled"] == 0


def test_merging_into_an_absent_set_builds_one_from_the_vendor_alone():
    out, stats = merge_period_set(None, [vrow("2020", "FY", "2020-09-26")], 9, "annual", "yfinance")
    assert out["periods"] == ["2020"]
    assert out["income"]["revenue"] == [416_161_000_000.0]
    assert out["income"]["ebitda"] == [None]
    assert stats["before"] == 0 and stats["added"] == 1


def test_vendor_gaps_are_recorded_for_the_ui_disclosure():
    out, _ = merge_period_set(existing_set(), [vrow("2020", "FY", "2020-09-26")], 9, "annual", "yfinance")
    assert out["vendor_gaps"] == statement_coverage()


# ── 4. market filter (vendor quota) ──────────────────────────────────────────
def test_bare_sweep_targets_us_listings_only():
    """The data dir is ~1,500 files, nearly all CN/HK — an unfiltered sweep would spend
    ~3,000 round trips per night being told "no results"."""
    for sym in ("AAPL", "BRK.B", "NIO", "BF.A"):
        assert is_vendor_market(sym), sym
    for sym in ("000001.SZ", "0700.HK", "600519.SS", "005930.KS", "7203.T"):
        assert not is_vendor_market(sym), sym
