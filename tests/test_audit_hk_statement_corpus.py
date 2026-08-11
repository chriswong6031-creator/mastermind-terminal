from __future__ import annotations

import collections
import json

import pytest

from scripts.audit_hk_statement_corpus import (
    DuplicateJsonKey,
    Problems,
    _row_family,
    _validate_statement_set,
    completed_cycle_facts,
    expected_industrial_debt,
    legacy_month_labels_have_duplicate,
    normalize_cache_json_file,
    source_statement_currency,
    strict_json_loads,
    validate_statement_currency,
)


def test_cache_json_normalizer_atomically_replaces_only_nonfinite_values(tmp_path):
    cache = tmp_path / "0778.HK.json"
    cache.write_text(
        '{"ticker":"0778.HK","financials":{"income":[],"balance":[],"cashflow":[]},'
        '"yf":{"beta":NaN,"target":Infinity,"floor":-Infinity}}'
    )

    changed, normalized = normalize_cache_json_file(cache)

    assert changed is True
    assert cache.read_bytes() == normalized
    assert json.loads(normalized) == {
        "ticker": "0778.HK",
        "financials": {"income": [], "balance": [], "cashflow": []},
        "yf": {"beta": None, "target": None, "floor": None},
    }
    assert strict_json_loads(normalized)["yf"] == {
        "beta": None,
        "target": None,
        "floor": None,
    }


def test_cache_json_normalizer_leaves_strict_bytes_unchanged(tmp_path):
    cache = tmp_path / "0823.HK.json"
    original = b'{"ticker":"0823.HK","yf":{"beta":null}}'
    cache.write_bytes(original)

    changed, returned = normalize_cache_json_file(cache)

    assert changed is False
    assert returned == original
    assert cache.read_bytes() == original


def test_cache_json_normalizer_refuses_duplicate_keys_without_rewriting(tmp_path):
    cache = tmp_path / "0778.HK.json"
    original = b'{"ticker":"0778.HK","ticker":"wrong","yf":{"beta":NaN}}'
    cache.write_bytes(original)

    with pytest.raises(DuplicateJsonKey):
        normalize_cache_json_file(cache)

    assert cache.read_bytes() == original


def test_source_cycle_and_retired_label_census_are_calendar_independent():
    rows = [
        {"end": "2023-09-30", "date_type": "002"},
        {"end": "2024-03-31", "date_type": "001"},
        {"end": "2024-09-30", "date_type": "002"},
        {"end": "2025-03-31", "date_type": "001"},
        {"end": "2025-06-30", "date_type": "003"},  # open cycle: excluded
    ]

    facts = completed_cycle_facts(rows)

    assert facts == {
        "completed": 2,
        "with_interim": 2,
        "with_interim_rows_2": 2,
        "exact_h1_fy": 2,
    }
    assert legacy_month_labels_have_duplicate(
        ["2023-01-31", "2023-02-28", "2024-01-31", "2024-02-29"]
    ) is True
    assert legacy_month_labels_have_duplicate(
        ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31"]
    ) is False


def test_statement_currency_is_nullable_and_never_defaults_unknown_to_hkd():
    assert source_statement_currency({"yf": {}}) is None
    assert source_statement_currency({"yf": {"financial_currency": "CNY"}}) == "CNY"

    problems = Problems()
    validate_statement_currency({"stmt_currency": None}, None, "0001.HK", problems)
    assert problems.ok

    validate_statement_currency({"stmt_currency": "HKD"}, None, "0001.HK", problems)
    validate_statement_currency({"stmt_currency": "  "}, None, "0002.HK", problems)
    assert problems.counts["stmt_currency_provenance"] == 2
    assert problems.counts["stmt_currency_shape"] == 1


def test_ambiguous_family_detection_and_industrial_debt_sum():
    assert _row_family({"004001999": 1, "003003999": 2}, {}) == "ambiguous"
    assert _row_family({"004001999": 1, "004007999": 2}, {}) == "industrial"
    assert expected_industrial_debt(
        {
            "004011006": 2,
            "004011010": 10,
            "004011021": 3,
            "004020001": 20,
            "004020005": 5,
            "004020007": 4,
            "004020018": 6,
        }
    ) == 50
    assert expected_industrial_debt({}) is None


def _ambiguous_annual_statement():
    null_income = {
        field: [None]
        for field in {
            "revenue",
            "cogs",
            "gross_profit",
            "opex",
            "op_income",
            "nonop_income",
            "pretax_income",
            "taxes",
            "net_income",
            "eps_basic",
            "eps_diluted",
            "ebitda",
        }
    }
    null_balance = {
        field: [None]
        for field in {
            "assets",
            "assets_st",
            "assets_lt",
            "liabilities",
            "liab_st",
            "liab_lt",
            "equity",
            "debt",
            "cash",
            "net_debt",
        }
    }
    return {
        "periods": ["2025"],
        "period_start": ["2025-01-01"],
        "source_period_start": ["2025-01-01"],
        "period_end": ["2025-12-31"],
        "fiscal_year": ["2025"],
        "period_kind": ["full_year"],
        "period_number": [None],
        "source_period_label": ["FY 2025"],
        "is_cumulative": [False],
        "normalization_method": ["as_reported"],
        "source_family_by_period": ["ambiguous"],
        "reporting_cadence": "annual",
        "flow_basis": "as_reported",
        "source_market": "hk",
        "source_family": "ambiguous",
        "income": null_income,
        "balance": null_balance,
        "cashflow": {
            "cfo": [10],
            "cfi": [-2],
            "cff": [-1],
            "capex": [-3],
            "fcf": [None],
        },
    }


def test_ambiguous_periods_fail_closed_for_income_balance_and_fcf():
    statement = _ambiguous_annual_statement()
    fact = {
        "dominant": "other",
        "merged": {
            "2025-12-31": {
                "family": "ambiguous",
                "start": "2025-01-01",
                "date_type": "001",
                "bal": {"003005999": 50, "004009999": 60},
            }
        },
    }
    problems = Problems()
    _validate_statement_set(
        "0767.HK",
        "annual",
        statement,
        fact,
        problems,
        collections.Counter(),
    )
    assert problems.ok

    statement["income"]["revenue"] = [1]
    statement["balance"]["assets"] = [2]
    statement["cashflow"]["fcf"] = [7]
    problems = Problems()
    _validate_statement_set(
        "0767.HK",
        "annual",
        statement,
        fact,
        problems,
        collections.Counter(),
    )
    assert problems.counts["ambiguous_family_value"] == 2
    assert problems.counts["structural_null"] == 1


def test_industrial_debt_must_sum_every_supported_interest_bearing_component():
    statement = _ambiguous_annual_statement()
    statement["source_family"] = "industrial"
    statement["source_family_by_period"] = ["industrial"]
    statement["balance"]["debt"] = [50]
    statement["balance"]["cash"] = [5]
    statement["balance"]["net_debt"] = [45]
    statement["cashflow"]["fcf"] = [7]
    source_balance = {
        "004011006": 2,
        "004011010": 10,
        "004011021": 3,
        "004020001": 20,
        "004020005": 5,
        "004020007": 4,
        "004020018": 6,
    }
    fact = {
        "dominant": "industrial",
        "merged": {
            "2025-12-31": {
                "family": "industrial",
                "start": "2025-01-01",
                "date_type": "001",
                "bal": source_balance,
            }
        },
    }
    counts = collections.Counter()
    problems = Problems()

    _validate_statement_set(
        "1378.HK", "annual", statement, fact, problems, counts
    )

    assert problems.ok
    assert counts["industrial_debt_populated_periods"] == 1
    assert counts["industrial_debt_multi_component_periods"] == 1

    statement["balance"]["debt"] = [10]
    statement["balance"]["net_debt"] = [5]
    problems = Problems()
    _validate_statement_set(
        "1378.HK", "annual", statement, fact, problems, collections.Counter()
    )
    assert problems.counts["industrial_debt_mapping"] == 1
