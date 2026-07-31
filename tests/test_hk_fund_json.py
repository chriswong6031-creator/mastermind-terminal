"""Regression coverage for strict, browser-parseable HK fundamentals artifacts."""
from __future__ import annotations

import json
import math

from ingest.gen_fund_hk import build_fund, normalize_existing_artifacts, strict_json_dumps


def _hk_record() -> dict:
    return {
        "financials": {},
        "yf": {
            "currency": "HKD",
            "financial_currency": "HKD",
            "mktcap": 13_429_081_088.0,
            "eps_est": {
                "0q": {
                    "avg": math.nan,
                    "high": math.nan,
                    "low": math.nan,
                    "numberOfAnalysts": math.nan,
                },
                "+1q": {
                    "avg": math.nan,
                    "high": math.nan,
                    "low": math.nan,
                    "numberOfAnalysts": math.nan,
                },
                "0y": {
                    "avg": 0.07,
                    "high": 0.07,
                    "low": 0.07,
                    "numberOfAnalysts": 1.0,
                },
                "+1y": {
                    "avg": 0.095,
                    "high": 0.11,
                    "low": 0.08,
                    "numberOfAnalysts": 2.0,
                },
            },
            "rev_growth": 0.039,
            "eps_growth": math.inf,
        },
    }


def test_hk_fund_artifact_is_strict_json_and_preserves_market_cap():
    text = strict_json_dumps(build_fund("0697.HK", _hk_record()))

    assert "NaN" not in text
    assert "Infinity" not in text
    parsed = json.loads(text)
    assert parsed["stats"]["mktcap"] == 13_429_081_088.0
    assert parsed["estimates"]["eps_q"]["n"] == [None, None]
    assert parsed["estimates"]["growth"]["eps_yoy"] is None


def test_strict_json_dumps_sanitizes_nested_non_finite_values():
    parsed = json.loads(strict_json_dumps({
        "nested": [math.nan, math.inf, -math.inf, {"valid": 2.5}],
    }))

    assert parsed == {"nested": [None, None, None, {"valid": 2.5}]}


def test_output_only_artifacts_are_normalized_without_dropping_data(tmp_path):
    artifact = tmp_path / "9999.HK.fund.json"
    artifact.write_text('{"stats":{"mktcap":4200000000},"estimates":{"n":[NaN]}}')

    normalized, errors = normalize_existing_artifacts(tmp_path)

    assert (normalized, errors) == (1, 0)
    assert json.loads(artifact.read_text()) == {
        "stats": {"mktcap": 4_200_000_000},
        "estimates": {"n": [None]},
    }
