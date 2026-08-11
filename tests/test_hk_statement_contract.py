"""Source-grounded HK statement cadence and taxonomy regression coverage.

The vendor publishes interim income/cash-flow values as cumulative fiscal-year-to-date
milestones.  These fixtures deliberately use tiny numbers so a wrong label, subtraction,
or statement-family adapter is immediately visible in an assertion failure.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

import ingest.collect_cn_hk_fund as collector
import ingest.gen_fund_hk as generator
from ingest.collect_cn_hk_fund import _hk_report
from ingest.gen_fund_hk import build_statements


def test_collector_import_does_not_require_tushare_token(tmp_path: Path):
    env = os.environ.copy()
    env.pop("TUSHARE_TOKEN", None)
    env["MACRO_REPO"] = str(tmp_path)
    result = subprocess.run(
        [sys.executable, "-c", "import ingest.collect_cn_hk_fund as c; assert c.TOKEN is None"],
        cwd=Path(__file__).resolve().parents[1],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def _period(
    end: str,
    date_type: str,
    *,
    income: dict[str, float | None],
    balance: dict[str, float | None] | None = None,
    cashflow: dict[str, float | None] | None = None,
    start: str = "2025-01-01",
    fiscal_year_end: str = "2025-12-31",
) -> dict:
    return {
        "end": end,
        "start": start,
        "date_type": date_type,
        "fiscal_year_end": fiscal_year_end,
        "income": income,
        "balance": balance or {},
        "cashflow": cashflow or {},
    }


def _financials(*periods: dict) -> dict:
    def rows(kind: str) -> list[dict]:
        return [
            {
                "end": period["end"],
                "start": period["start"],
                "date_type": period["date_type"],
                "fiscal_year_end": period["fiscal_year_end"],
                "items": period[kind],
            }
            for period in periods
        ]

    return {"income": rows("income"), "balance": rows("balance"), "cashflow": rows("cashflow")}


def _industrial_income(revenue: float | None, eps: float | None) -> dict[str, float | None]:
    return {
        "004001999": revenue,
        "004007999": None if revenue is None else revenue * 0.6,
        "004005001": None if revenue is None else revenue * 0.2,
        "004010999": None if revenue is None else revenue * 0.4,
        "004011999": None if revenue is None else revenue * 0.35,
        "004012001": None if revenue is None else revenue * 0.05,
        "004025002": None if revenue is None else revenue * 0.3,
        "004027002": eps,
        "004027003": eps,
    }


def _industrial_balance(assets: float) -> dict[str, float]:
    return {
        "004009999": assets,
        "004002999": assets * 0.4,
        "004001999": assets * 0.6,
        "004025999": assets * 0.7,
        "004036999": assets * 0.3,
        "004002010": assets * 0.1,
    }


def _cashflow(cfo: float | None, capex: float | None) -> dict[str, float | None]:
    return {
        "003999": cfo,
        "005999": None if cfo is None else -cfo * 0.2,
        "007999": None if cfo is None else -cfo * 0.3,
        "005005": capex,
    }


def test_collector_preserves_source_interval_and_item_name(monkeypatch: pytest.MonkeyPatch):
    frame = pd.DataFrame([
        {
            "REPORT_DATE": "2025-06-30 00:00:00",
            # A sparse first item must not erase report-level identity available on later items.
            "START_DATE": None,
            "DATE_TYPE_CODE": None,
            "FISCAL_YEAR": None,
            "STD_ITEM_CODE": "001003999",
            "STD_ITEM_NAME": "经营收入总额",
            "AMOUNT": 123.0,
        },
        {
            "REPORT_DATE": "2025-06-30 00:00:00",
            "START_DATE": "2025-01-01 00:00:00",
            "DATE_TYPE_CODE": "002",
            "FISCAL_YEAR": "12-31",
            "STD_ITEM_CODE": "001011999",
            "STD_ITEM_NAME": "利润总额",
            "AMOUNT": 45.0,
        },
    ])
    fake = SimpleNamespace(stock_financial_hk_report_em=lambda **_kwargs: frame)
    monkeypatch.setitem(sys.modules, "akshare", fake)

    rows = _hk_report("0005.HK", "利润表")

    assert rows == [{
        "end": "2025-06-30",
        "start": "2025-01-01",
        "date_type": "002",
        "fiscal_year_end": "12-31",
        "items": {"001003999": 123.0, "001011999": 45.0},
        "item_names": {"001003999": "经营收入总额", "001011999": "利润总额"},
    }]


def test_statements_only_refresh_preserves_each_empty_vendor_block(
    monkeypatch: pytest.MonkeyPatch, tmp_path,
):
    old_income = [{"end": "2024-12-31", "items": {"001003999": 90}}]
    old_balance = [{"end": "2024-12-31", "items": {"001001999": 900}}]
    old_cashflow = [{"end": "2024-12-31", "items": {"003999": 30}}]
    cache = tmp_path / "0005.HK.json"
    cache.write_text(json.dumps({
        "ticker": "0005.HK",
        "financials": {
            "income": old_income,
            "balance": old_balance,
            "cashflow": old_cashflow,
        },
        "yf": {"sector": "Financial Services"},
    }))
    fresh_income = [{"end": "2025-06-30", "items": {"001003999": 50}}]
    fresh_cashflow = [{"end": "2025-06-30", "items": {"003999": 20}}]
    monkeypatch.setattr(collector, "HK_OUT", tmp_path)
    monkeypatch.setattr(collector, "_fetch_hk", lambda *_args, **_kwargs: {
        "ticker": "0005.HK",
        "financials": {"income": fresh_income, "balance": [], "cashflow": fresh_cashflow},
        "yf": {},
    })

    collector.collect_hk_fund(["0005.HK"], force=True, statements_only=True)

    refreshed = json.loads(cache.read_text())
    assert refreshed["financials"] == {
        "income": fresh_income,
        "balance": old_balance,
        "cashflow": fresh_cashflow,
    }
    assert refreshed["yf"] == {"sector": "Financial Services"}


def test_ordinary_stale_refresh_also_preserves_each_empty_vendor_block(
    monkeypatch: pytest.MonkeyPatch, tmp_path,
):
    old_balance = [{"end": "2024-12-31", "items": {"001001999": 900}}]
    cache = tmp_path / "0005.HK.json"
    cache.write_text(json.dumps({
        "ticker": "0005.HK",
        "financials": {"income": [], "balance": old_balance, "cashflow": []},
        "yf": {"sector": "Old", "financial_currency": "CNY"},
    }))
    fresh_income = [{"end": "2025-06-30", "items": {"001003999": 50}}]
    fresh_cashflow = [{"end": "2025-06-30", "items": {"003999": 20}}]
    monkeypatch.setattr(collector, "HK_OUT", tmp_path)
    monkeypatch.setattr(collector, "_fetch_hk", lambda *_args, **_kwargs: {
        "ticker": "0005.HK",
        "financials": {"income": fresh_income, "balance": [], "cashflow": fresh_cashflow},
        "yf": {"sector": "Fresh", "financial_currency": None},
    })

    collector.collect_hk_fund(["0005.HK"], force=True, statements_only=False)

    refreshed = json.loads(cache.read_text())
    assert refreshed["financials"] == {
        "income": fresh_income,
        "balance": old_balance,
        "cashflow": fresh_cashflow,
    }
    assert refreshed["yf"] == {"sector": "Fresh", "financial_currency": "CNY"}


def test_semiannual_h1_and_fy_become_h1_and_h2_without_quarter_fiction():
    statements = build_statements(_financials(
        _period(
            "2025-06-30",
            "002",
            income=_industrial_income(300, 2.0),
            balance=_industrial_balance(1_000),
            cashflow=_cashflow(60, 12),
        ),
        _period(
            "2025-12-31",
            "001",
            income=_industrial_income(700, 5.0),
            balance=_industrial_balance(1_300),
            cashflow=_cashflow(150, 30),
        ),
    ))["quarterly"]

    assert statements["periods"] == ["H1 2025", "H2 2025"]
    assert statements["period_kind"] == ["half_year", "half_year"]
    assert statements["period_number"] == [1, 2]
    assert statements["reporting_cadence"] == "semiannual"
    assert statements["flow_basis"] == "discrete_period"
    assert statements["source_period_start"] == ["2025-01-01", "2025-01-01"]
    assert statements["period_start"] == ["2025-01-01", "2025-07-01"]
    assert statements["income"]["revenue"] == [300, 400]
    assert statements["income"]["opex"] == [None, None]
    assert statements["income"]["eps_basic"] == [2.0, None]
    assert statements["cashflow"]["cfo"] == [60, 90]
    assert statements["balance"]["assets"] == [1_000, 1_300]


def test_full_cumulative_ladder_differences_additive_flows_but_not_eps():
    dates_and_values = [
        ("2025-03-31", "003", 100, 1.0, 10, 2, 1_000),
        ("2025-06-30", "002", 250, 2.2, 35, 6, 1_100),
        ("2025-09-30", "004", 480, 3.3, 65, 12, 1_200),
        ("2025-12-31", "001", 800, 4.4, 110, 20, 1_300),
    ]
    periods = [
        _period(
            end,
            date_type,
            income=_industrial_income(revenue, eps),
            balance=_industrial_balance(assets),
            cashflow=_cashflow(cfo, capex),
        )
        for end, date_type, revenue, eps, cfo, capex, assets in dates_and_values
    ]

    statements = build_statements(_financials(*periods))["quarterly"]

    assert statements["periods"] == ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"]
    assert statements["income"]["revenue"] == [100, 150, 230, 320]
    assert statements["income"]["eps_basic"] == [1.0, None, None, None]
    assert statements["income"]["eps_diluted"] == [1.0, None, None, None]
    assert statements["cashflow"]["cfo"] == [10, 25, 30, 45]
    assert statements["cashflow"]["capex"] == [-2, -4, -6, -8]
    assert statements["cashflow"]["fcf"] == [8, 21, 24, 37]
    # Balance-sheet rows are point-in-time snapshots, never differenced.
    assert statements["balance"]["assets"] == [1_000, 1_100, 1_200, 1_300]


def test_decreasing_cumulative_capex_magnitude_fails_closed():
    statements = build_statements(_financials(
        _period(
            "2025-06-30", "002",
            income=_industrial_income(300, 2.0),
            cashflow=_cashflow(60, 10),
        ),
        _period(
            "2025-12-31", "001",
            income=_industrial_income(700, 5.0),
            cashflow=_cashflow(150, 6),
        ),
    ))["quarterly"]

    assert statements["cashflow"]["cfo"] == [60, 90]
    assert statements["cashflow"]["capex"] == [-10, None]
    assert statements["cashflow"]["fcf"] == [50, None]


def test_normalizes_full_history_before_trimming_the_display_window():
    rows = [
        _period("2022-03-31", "003", start="2022-01-01", fiscal_year_end="12-31",
                income=_industrial_income(100, 1.0)),
        _period("2022-06-30", "002", start="2022-01-01", fiscal_year_end="12-31",
                income=_industrial_income(250, 2.0)),
    ]
    for year in range(2023, 2034):
        rows.append(_period(
            f"{year}-12-31", "001", start=f"{year}-01-01", fiscal_year_end="12-31",
            income=_industrial_income(500 + year, 3.0),
        ))

    statements = build_statements(_financials(*rows))["quarterly"]

    assert len(statements["periods"]) == 12
    assert statements["periods"][0] == "Q2 2022"
    # Q1 fell outside the emitted tail, but it was still available during normalization.
    assert statements["income"]["revenue"][0] == 150


def test_duplicate_base_milestones_keep_source_identity_instead_of_guessing_a_quarter():
    statements = build_statements(_financials(
        _period("2025-03-30", "003", income=_industrial_income(90, 0.9)),
        _period("2025-03-31", "003", income=_industrial_income(100, 1.0)),
        _period("2025-06-30", "002", income=_industrial_income(250, 2.0)),
    ))["quarterly"]

    assert statements["periods"][-1] == "H1 2025"
    assert statements["period_kind"][-1] == "half_year"
    assert statements["income"]["revenue"][-1] == 250


def test_fiscal_year_transition_disambiguates_duplicate_canonical_identity():
    statements = build_statements(_financials(
        _period(
            "2023-09-30", "002", start="2023-04-01", fiscal_year_end="03-31",
            income=_industrial_income(100, 1.0),
        ),
        _period(
            "2024-06-30", "002", start="2024-01-01", fiscal_year_end="12-31",
            income=_industrial_income(120, 1.2),
        ),
    ))["quarterly"]

    assert statements["periods"] == [
        "H1 2024 · 2023-09-30",
        "H1 2024 · 2024-06-30",
    ]
    assert len(set(statements["periods"])) == len(statements["periods"])


def test_annual_fiscal_year_transition_disambiguates_duplicate_year_identity():
    annual = build_statements(_financials(
        _period(
            "2022-06-30", "001", start="2021-07-01", fiscal_year_end="06-30",
            income=_industrial_income(100, 1.0),
        ),
        _period(
            "2022-12-31", "001", start="2022-01-01", fiscal_year_end="12-31",
            income=_industrial_income(120, 1.2),
        ),
        _period(
            "2023-12-31", "001", start="2023-01-01", fiscal_year_end="12-31",
            income=_industrial_income(150, 1.5),
        ),
    ))["annual"]

    assert annual["periods"] == [
        "2022 · 2022-06-30",
        "2022 · 2022-12-31",
        "2023",
    ]
    assert len(set(annual["periods"])) == len(annual["periods"])


def test_non_december_fiscal_year_uses_source_fiscal_boundary_not_calendar_quarters():
    periods = [
        _period(
            end,
            date_type,
            income=_industrial_income(revenue, eps),
            start="2024-04-01",
            fiscal_year_end="2025-03-31",
        )
        for end, date_type, revenue, eps in [
            ("2024-06-30", "003", 100, 1.0),
            ("2024-09-30", "002", 220, 2.1),
            ("2024-12-31", "004", 360, 3.0),
            ("2025-03-31", "001", 520, 4.0),
        ]
    ]

    statements = build_statements(_financials(*periods))["quarterly"]

    assert statements["periods"] == ["Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"]
    assert statements["fiscal_year"] == ["2025", "2025", "2025", "2025"]


def test_derived_period_fails_closed_when_the_cumulative_base_value_is_missing():
    statements = build_statements(_financials(
        _period(
            "2025-03-31",
            "003",
            income=_industrial_income(None, None),
            balance=_industrial_balance(500),
            cashflow=_cashflow(None, None),
        ),
        _period(
            "2025-06-30",
            "002",
            income=_industrial_income(250, 2.0),
            balance=_industrial_balance(700),
            cashflow=_cashflow(40, 8),
        ),
    ))["quarterly"]

    assert statements["periods"] == ["Q1 2025", "Q2 2025"]
    assert statements["normalization_method"] == ["as_reported_ytd", "difference_from_prior_ytd"]
    assert statements["income"]["revenue"] == [None, None]
    assert statements["cashflow"]["cfo"] == [None, None]
    assert statements["balance"]["assets"] == [500, 700]


@pytest.mark.parametrize(
    ("family", "income", "balance", "expected"),
    [
        (
            "bank",
            {
                "001003999": 111, "001005999": 40, "001010999": 71,
                "001011999": 70, "001012001": 10, "001025002": 60,
                "001027002": 6, "001027003": 5.9,
            },
            {"001001999": 1_000, "001002999": 800, "001011999": 200, "001001001": 100},
            {"revenue": 111, "opex": 40, "assets": 1_000, "cash": 100, "debt": None},
        ),
        (
            "insurer",
            {
                "002003999": 222, "002007999": 90, "002010999": 132,
                "002011999": 130, "002012001": 20, "002014002": 110,
                "002027002": 11, "002027003": 10.8,
            },
            {
                "002001999": 2_000, "002002999": 1_700, "002011999": 300,
                "002001001": 20, "002002008": 90,
            },
            {"revenue": 222, "opex": 90, "assets": 2_000, "cash": 20, "debt": 90},
        ),
        (
            "financial_services",
            {
                "003003999": 333, "003007999": 120, "003010999": 213,
                "003011999": 210, "003012001": 30, "003015002": 180,
                "003027002": 18, "003027003": 17.7,
            },
            {
                "003005999": 3_000, "003002999": 1_200, "003001999": 1_800,
                "003019999": 2_400, "003007999": 900, "003015999": 1_500,
                "003029999": 600, "003002010": 150,
            },
            {"revenue": 333, "opex": 120, "assets": 3_000, "cash": 150, "debt": None},
        ),
    ],
)
def test_financial_statement_family_adapters_map_core_totals_without_industrial_fiction(
    family: str,
    income: dict[str, float],
    balance: dict[str, float],
    expected: dict[str, float | None],
):
    annual = build_statements(_financials(_period(
        "2025-12-31",
        "001",
        income=income,
        balance=balance,
    )))["annual"]

    assert annual["source_family"] == family
    assert annual["income"]["revenue"] == [expected["revenue"]]
    assert annual["income"]["opex"] == [expected["opex"]]
    assert annual["income"]["gross_profit"] == [None]
    assert annual["income"]["cogs"] == [None]
    assert annual["balance"]["assets"] == [expected["assets"]]
    assert annual["balance"]["cash"] == [expected["cash"]]
    assert annual["balance"]["debt"] == [expected["debt"]]


def test_statement_family_is_selected_per_period_when_vendor_schema_changes():
    annual = build_statements(_financials(
        _period(
            "2024-12-31",
            "001",
            start="2024-01-01",
            fiscal_year_end="2024-12-31",
            income={"004001999": 100, "004007999": 60, "004025002": 20},
            balance={"004009999": 1_000, "004002010": 100},
        ),
        _period(
            "2025-12-31",
            "001",
            income={"003003999": 220, "003015002": 44},
            balance={"003005999": 2_000, "003002010": 250},
        ),
    ))["annual"]

    assert annual["source_family_by_period"] == ["industrial", "financial_services"]
    assert annual["income"]["revenue"] == [100, 220]
    assert annual["income"]["gross_profit"] == [60, None]
    assert annual["balance"]["assets"] == [1_000, 2_000]
    assert annual["balance"]["cash"] == [100, 250]


def test_cumulative_base_must_use_the_same_statement_family():
    statements = build_statements(_financials(
        _period(
            "2025-03-31", "003",
            income={"004001999": 172_803_932.73, "004010999": 121_921_581.55},
        ),
        _period(
            "2025-06-30", "002",
            income={"003003999": 76_768_000.0, "003010999": 20_000_000.0},
        ),
    ))["quarterly"]

    assert statements["periods"] == ["Q1 2025", "H1 2025"]
    assert statements["normalization_method"] == ["as_reported_ytd", "as_reported_ytd"]
    assert statements["income"]["revenue"] == [172_803_932.73, 76_768_000.0]
    assert statements["income"]["op_income"] == [121_921_581.55, 20_000_000.0]


def test_same_row_multiple_statement_namespaces_fail_closed_instead_of_using_item_majority():
    annual = build_statements(_financials(_period(
        "2025-12-31",
        "001",
        income={
            "003003999": 33_582_621.60,
            "003015002": 3_000_000,
            "004001999": 19_142_048.64,
            "004025002": 3_000_000,
            # More 004 items must not turn an ambiguous row into an industrial row.
            "004007999": 10_000_000,
            "004010999": 4_000_000,
        },
    ))) ["annual"]

    assert annual["source_family"] == "ambiguous"
    assert annual["source_family_by_period"] == ["ambiguous"]
    assert all(values == [None] for values in annual["income"].values())


def test_industrial_debt_includes_loans_bonds_notes_and_finance_leases():
    annual = build_statements(_financials(_period(
        "2025-12-31",
        "001",
        income=_industrial_income(500, 2.0),
        balance={
            **_industrial_balance(1_000),
            "004011010": 10,
            "004020001": 20,
            "004011021": 30,
            "004020007": 40,
            "004011006": 50,
            "004020005": 60,
            "004020018": 70,
        },
    )))["annual"]

    assert annual["balance"]["debt"] == [280]
    assert annual["balance"]["cash"] == [100]
    assert annual["balance"]["net_debt"] == [180]


def test_missing_statement_currency_stays_null_instead_of_assuming_hkd():
    fund = generator.build_fund("0700.HK", {
        "financials": _financials(_period(
            "2025-12-31", "001", income=_industrial_income(500, 2.0),
        )),
        "yf": {"currency": "HKD", "financial_currency": None},
    })

    assert fund["quote_currency"] == "HKD"
    assert fund["stmt_currency"] is None


def test_generator_main_returns_nonzero_for_missing_cache(
    monkeypatch: pytest.MonkeyPatch, tmp_path,
):
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    out_dir = tmp_path / "out"
    monkeypatch.setattr(generator, "HK_FUND", cache_dir)

    result = generator.main(["--only", "9999.HK", "--out", str(out_dir), "--no-merge"])

    assert result == 1
