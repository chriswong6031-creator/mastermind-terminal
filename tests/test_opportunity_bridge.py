"""Durable Macro opportunity receipt bridge and fast-writer preservation."""
from __future__ import annotations

import json
from pathlib import Path

from ingest import fast_flagship
from ingest import pull_macro_opportunities as bridge
from ingest.slice_document import write_slice_preserving_siblings


def _artifact(**overrides) -> dict:
    doc = {
        "schema": "opportunity_timeline.v1",
        "as_of": "2026-08-10",
        "priced_through": {"us": "2026-08-07", "cn": "2026-08-10"},
        "symbols": {
            "NEM": {"events": [{
                "id": "us_prophet_v2:NEM:2026-07-24",
                "system": "prophet_board",
                "authority": "candidate",
                "surfaced_at": "2026-07-24",
                "entry_price": 93.47,
            }]},
        },
    }
    doc.update(overrides)
    return doc


def _write_slice(data_dir: Path, symbol: str, **siblings) -> Path:
    path = data_dir / f"{symbol}.slice.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "indicator": {"state": {"last_signal": "BUY"}},
        "backtest": {"metrics": {"win_rate": 0.61}},
        "future_contract": {"keep": [1, 2, 3]},
        **siblings,
    }))
    return path


def test_valid_artifact_embeds_receipts_without_reconstructing_the_slice(tmp_path):
    path = _write_slice(tmp_path, "NEM")
    before = json.loads(path.read_text())

    valid = bridge.validate_source(_artifact())
    stats = bridge.embed_opportunities(valid, tmp_path)

    after = json.loads(path.read_text())
    assert stats == {"updated": 1, "missing_slice": 0, "bad_slice": 0, "write_error": 0}
    assert after["indicator"] == before["indicator"]
    assert after["backtest"] == before["backtest"]
    assert after["future_contract"] == before["future_contract"]
    assert after["opportunities"] == {
        "schema": "opportunity_timeline.v1",
        "as_of": "2026-08-10",
        "priced_through": {"us": "2026-08-07", "cn": "2026-08-10"},
        "events": _artifact()["symbols"]["NEM"]["events"],
    }
    assert not list(tmp_path.glob("*.tmp"))
    assert not list(tmp_path.glob(".*.tmp"))


def test_explicit_empty_events_clear_only_that_symbols_stale_receipts(tmp_path):
    stale = {"schema": "opportunity_timeline.v1", "events": [{"id": "stale"}]}
    nem = _write_slice(tmp_path, "NEM", opportunities=stale)
    hl = _write_slice(tmp_path, "HL", opportunities=stale)
    valid = bridge.validate_source(_artifact(symbols={"NEM": {"events": []}}))

    bridge.embed_opportunities(valid, tmp_path)

    assert json.loads(nem.read_text())["opportunities"]["events"] == []
    # Omission is not evidence of deletion: leave another symbol's last-good block alone.
    assert json.loads(hl.read_text())["opportunities"] == stale


def test_missing_slice_is_not_created(tmp_path):
    stats = bridge.embed_opportunities(bridge.validate_source(_artifact()), tmp_path)
    assert stats["missing_slice"] == 1
    assert not (tmp_path / "NEM.slice.json").exists()


def test_invalid_source_is_rejected_before_any_slice_is_touched(tmp_path, monkeypatch):
    path = _write_slice(tmp_path, "NEM", opportunities={"events": [{"id": "keep"}]})
    before = path.read_bytes()
    source = tmp_path / "opportunity_timeline.json"
    source.write_text(json.dumps(_artifact(schema="opportunity_timeline.v0")))
    monkeypatch.setattr(bridge, "SOURCE", source)
    monkeypatch.setattr(bridge, "DATA_DIR", tmp_path)

    assert bridge.main() == 0
    assert path.read_bytes() == before


def test_one_malformed_symbol_row_rejects_the_whole_artifact(tmp_path):
    path = _write_slice(tmp_path, "NEM")
    before = path.read_bytes()
    raw = _artifact(symbols={
        "NEM": {"events": [{"id": "would-have-written"}]},
        "HL": {"events": "not-an-array"},
    })

    try:
        bridge.validate_source(raw)
    except bridge.SourceError:
        pass
    else:
        raise AssertionError("malformed symbol row was accepted")

    assert path.read_bytes() == before


def test_source_loader_rejects_nonstandard_nan(tmp_path):
    source = tmp_path / "bad.json"
    source.write_text('{"schema":"opportunity_timeline.v1","x":NaN}')
    try:
        bridge.load_source(source)
    except bridge.SourceError:
        pass
    else:
        raise AssertionError("NaN is not valid browser JSON")


def test_fast_writer_replaces_only_indicator_and_preserves_all_siblings():
    existing = {
        "indicator": {"old": True},
        "backtest": {"metrics": {"profit_factor": 1.7}},
        "opportunities": {"schema": "opportunity_timeline.v1", "events": [{"id": "x"}]},
        "unknown_future_sibling": {"must": "survive"},
    }
    new_indicator = {"state": {"forming": True}}

    updated = fast_flagship._replace_indicator_preserving_siblings(existing, new_indicator)

    assert updated["indicator"] == new_indicator
    for key in ("backtest", "opportunities", "unknown_future_sibling"):
        assert updated[key] == existing[key]
    assert existing["indicator"] == {"old": True}


def test_all_nightly_slice_rebuilders_use_the_sibling_preserving_writer():
    """Pin the three overwrite seams that run before the opportunity bridge."""
    root = Path(__file__).resolve().parents[1]
    for rel in (
        "ingest/build_polygon_universe.py",
        "ingest/regen_flagship_slices.py",
        "ingest/gen_slices_all.py",
    ):
        source = (root / rel).read_text()
        assert "write_slice_preserving_siblings(" in source, rel
        assert 'owned_fields={"indicator", "backtest"}' in source, rel


def test_nightly_rebuilds_preserve_receipts_and_future_siblings(tmp_path):
    path = _write_slice(
        tmp_path,
        "NEM",
        opportunities={"schema": "opportunity_timeline.v1", "events": [{"id": "keep"}]},
    )
    before = json.loads(path.read_text())

    # Flagship build/regen own indicator+backtest; broad regen owns the same contract
    # while deliberately omitting the heavy backtest from its replacement payload.
    write_slice_preserving_siblings(
        path,
        {"indicator": {"phase": "flagship"}, "backtest": {"fresh": True}},
        owned_fields={"indicator", "backtest"},
    )
    write_slice_preserving_siblings(
        path,
        {"indicator": {"phase": "regen"}, "backtest": {"fresh": "still"}},
        owned_fields={"indicator", "backtest"},
    )
    write_slice_preserving_siblings(
        path,
        {"indicator": {"phase": "broad"}},
        owned_fields={"indicator", "backtest"},
    )

    after = json.loads(path.read_text())
    assert after["indicator"] == {"phase": "broad"}
    assert "backtest" not in after
    assert after["opportunities"] == before["opportunities"]
    assert after["future_contract"] == before["future_contract"]
    assert not list(tmp_path.glob(".*.slice.*.tmp"))


def test_invalid_bridge_source_after_rebuild_keeps_last_good_receipts(tmp_path, monkeypatch):
    path = _write_slice(
        tmp_path,
        "NEM",
        opportunities={"schema": "opportunity_timeline.v1", "events": [{"id": "last-good"}]},
    )
    write_slice_preserving_siblings(
        path,
        {"indicator": {"fresh": True}},
        owned_fields={"indicator", "backtest"},
    )
    before = path.read_bytes()
    source = tmp_path / "opportunity_timeline.json"
    source.write_text('{"schema":"opportunity_timeline.v0"}')
    monkeypatch.setattr(bridge, "SOURCE", source)
    monkeypatch.setattr(bridge, "DATA_DIR", tmp_path)

    assert bridge.main() == 0
    assert path.read_bytes() == before
    assert json.loads(path.read_text())["opportunities"]["events"] == [{"id": "last-good"}]
