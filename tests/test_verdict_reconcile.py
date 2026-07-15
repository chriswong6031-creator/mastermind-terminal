"""Tests for the flagship manifest-verdict reconcile (step 2 of the ORACLE_DESK_DIAGNOSIS fix program).

The nightly builder stages verdicts from a v2-less (SELL-free) emission; regen_flagship_slices then
rewrites the slices with the v2 stream. reconcile_flagship_verdicts() runs at the end of build_universe
so the published manifest verdict always equals the v2 slice's state.last_signal that the card reads,
and dead inherited rows (rich row, no slice on disk) are demoted to priced search rows instead of masquerading as live.

Reproduces the 2026-07-14 incident shape: manifest NVDA=REBUY / GOOGL=BUY while the slices say SELL.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.build_universe import reconcile_flagship_verdicts  # noqa: E402


def _slice(tmp: Path, sym: str, last_signal, *, with_state: bool = True, corrupt: bool = False) -> None:
    p = tmp / f"{sym}.slice.json"
    if corrupt:
        p.write_text("{not json")
        return
    ind: dict = {"signals": []}
    if with_state:
        ind["state"] = {"last_signal": last_signal, "position_hint": "flat"}
    p.write_text(json.dumps({"indicator": ind, "backtest": {"metrics": {}}}))


def _rich(verdict, wr=0.75, pf=100.0, cagr=0.5) -> dict:
    return {"name": "x", "sec": "Equities", "col": "#888", "mkt": "NASDAQ",
            "last": 210.0, "chg": 1.2, "hi52": 240.0,
            "verdict": verdict, "wr": wr, "pf": pf, "cagr": cagr, "regimeBull": False}


def test_rederives_manifest_to_slice_truth(tmp_path):
    # The live incident: builder staged REBUY/BUY; the v2 slices say SELL.
    _slice(tmp_path, "NVDA", "SELL")
    _slice(tmp_path, "GOOGL", "SELL")
    symbols = {"NVDA": _rich("REBUY"), "GOOGL": _rich("BUY")}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert symbols["NVDA"]["verdict"] == "SELL"
    assert symbols["GOOGL"]["verdict"] == "SELL"
    # wr/pf are the CS-sim metrics from the same build — reconcile only touches the verdict
    assert symbols["NVDA"]["wr"] == 0.75 and symbols["NVDA"]["pf"] == 100.0
    assert counts == {"rederived": 2, "demoted": 0, "matched": 0}


def test_already_consistent_is_untouched(tmp_path):
    _slice(tmp_path, "AAPL", "BUY")
    symbols = {"AAPL": _rich("BUY")}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert symbols["AAPL"]["verdict"] == "BUY"
    assert counts == {"rederived": 0, "demoted": 0, "matched": 1}


def test_dead_inherited_row_is_demoted_to_search_row(tmp_path):
    # Rich row with a stale verdict but NO slice on disk = a dead inherited record.
    symbols = {"DEAD": _rich("SELL", wr=0.6, pf=8.74, cagr=0.18)}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    # signal-derived keys are DELETED (demoted, not blanked) so the price lanes still fill it
    for k in ("verdict", "wr", "pf", "cagr", "regimeBull"):
        assert k not in symbols["DEAD"]
    # name + price fields survive so it stays a searchable, priceable row
    assert symbols["DEAD"]["name"] == "x" and symbols["DEAD"]["mkt"] == "NASDAQ"
    assert symbols["DEAD"]["last"] == 210.0 and symbols["DEAD"]["hi52"] == 240.0
    assert counts == {"rederived": 0, "demoted": 1, "matched": 0}


def test_plain_search_rows_and_too_short_flagship_are_skipped(tmp_path):
    # A folded-in search row (no verdict key) and a too-short flagship (verdict=None) both no-op,
    # even though no slice exists for them — they must NOT be counted as demoted.
    symbols = {
        "SEARCH": {"name": "s", "sec": "Equities", "col": "#888", "mkt": "SSE"},
        "SHORT": _rich(None, wr=None, pf=None, cagr=None),
    }
    before = json.dumps(symbols, sort_keys=True)
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert json.dumps(symbols, sort_keys=True) == before  # untouched
    assert counts == {"rederived": 0, "demoted": 0, "matched": 0}


def test_corrupt_slice_leaves_row_unchanged(tmp_path):
    # A transient/corrupt slice read must NOT blank a live name — leave the row as-is.
    _slice(tmp_path, "NVDA", None, corrupt=True)
    symbols = {"NVDA": _rich("REBUY")}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert symbols["NVDA"]["verdict"] == "REBUY"  # unchanged, not demoted
    assert counts == {"rederived": 0, "demoted": 0, "matched": 0}


def test_slice_without_state_last_signal_is_left_alone(tmp_path):
    _slice(tmp_path, "NVDA", None, with_state=False)  # indicator present, no state block
    symbols = {"NVDA": _rich("REBUY")}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert symbols["NVDA"]["verdict"] == "REBUY"
    assert counts == {"rederived": 0, "demoted": 0, "matched": 0}


def test_crypto_flagship_reconciles_like_equities(tmp_path):
    _slice(tmp_path, "BTC-USD", "BUY")
    symbols = {"BTC-USD": _rich("SELL")}
    counts = reconcile_flagship_verdicts(symbols, tmp_path)
    assert symbols["BTC-USD"]["verdict"] == "BUY"
    assert counts["rederived"] == 1
