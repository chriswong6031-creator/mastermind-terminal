import gzip
import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def _body(root: Path, sym: str, tx_id: str, *, payload: dict | None = None) -> Path:
    path = root / sym / f"{tx_id}.json.gz"
    path.parent.mkdir(parents=True, exist_ok=True)
    value = payload or {
        "schema": "mastermind.tx/v1",
        "ticker": sym,
        "id": tx_id,
        "period": f"Q{tx_id[-1]} FY{tx_id[:4]}",
        "date": "2026-07-31",
        "title": f"{sym} Earnings Call",
        "segments": [
            {"speaker": "Jane Doe", "role": "CEO", "text": "Prepared remarks."},
            {"speaker": "Operator", "role": "Operator", "text": "We will now begin questions and answers."},
            {"speaker": "Alex Smith", "role": "Analyst", "text": "What changed?"},
        ],
    }
    with gzip.open(path, "wt") as handle:
        json.dump(value, handle)
    return path


def test_builds_enriched_indexes_and_publishes_global_last(tmp_path: Path, monkeypatch):
    mod = _load("build_tx_index", ROOT / "ingest" / "build_transcript_index.py")
    tx_root = tmp_path / "tx"
    _body(tx_root, "AAPL", "2026Q3")
    _body(tx_root, "AAPL", "2026Q2")
    _body(tx_root, "NVDA", "2027Q1")
    _body(tx_root, "AAPL", "bad-id")
    legacy_out = tmp_path / "legacy.json"
    writes: list[Path] = []
    real_write = mod._atomic_write_json

    def recorded_write(path, payload):
        writes.append(path)
        real_write(path, payload)

    monkeypatch.setattr(mod, "_atomic_write_json", recorded_write)
    global_index, legacy = mod.write_transcript_indexes(
        tx_root, write_public=True, legacy_out=legacy_out
    )

    assert global_index["schema"] == "mastermind.tx-index/v1"
    assert global_index["body_count"] == 3
    assert global_index["symbol_count"] == 2
    assert legacy == {"AAPL": ["2026Q2", "2026Q3"], "NVDA": ["2027Q1"]}
    ticker = json.loads((tx_root / "AAPL" / "index.json").read_text())
    assert [call["id"] for call in ticker["calls"]] == ["2026Q3", "2026Q2"]
    newest = ticker["calls"][0]
    assert newest["url"] == "/data/tx/AAPL/2026Q3.json.gz"
    assert newest["segment_count"] == 3
    assert newest["speaker_count"] == 3
    assert newest["qa_start"] == 1
    assert newest["has_qa"] is True
    assert newest["source"] == "DefeatBeta"
    assert writes[-1] == tx_root / "index.json"
    assert json.loads(legacy_out.read_text()) == legacy


def test_no_write_scan_does_not_create_indexes(tmp_path: Path):
    mod = _load("build_tx_scan", ROOT / "ingest" / "build_transcript_index.py")
    tx_root = tmp_path / "tx"
    _body(tx_root, "AAPL", "2026Q3")

    global_index, legacy, per_symbol = mod.build_transcript_indexes(tx_root)

    assert global_index["body_count"] == 1
    assert legacy == {"AAPL": ["2026Q3"]}
    assert per_symbol["AAPL"]["n"] == 1
    assert not (tx_root / "index.json").exists()
    assert not (tx_root / "AAPL" / "index.json").exists()


def test_corrupt_or_mismatched_body_aborts_scan(tmp_path: Path):
    mod = _load("build_tx_corrupt", ROOT / "ingest" / "build_transcript_index.py")
    tx_root = tmp_path / "tx"
    path = _body(tx_root, "AAPL", "2026Q3")
    path.write_bytes(b"not gzip")
    with pytest.raises(ValueError, match="invalid transcript body"):
        mod.build_transcript_indexes(tx_root)

    path.unlink()
    _body(tx_root, "AAPL", "2026Q3", payload={
        "schema": "mastermind.tx/v1",
        "ticker": "NVDA",
        "id": "2026Q3",
        "period": "Q3 FY2026",
        "date": None,
        "title": "Mismatch",
        "segments": [],
    })
    with pytest.raises(ValueError, match="ticker mismatch"):
        mod.build_transcript_indexes(tx_root)


def test_exact_append_only_guard_rejects_a_remap_with_same_count():
    mod = _load("build_tx_pairs", ROOT / "ingest" / "build_transcript_index.py")
    old = {"AAPL": ["2026Q2", "2026Q3"]}
    remapped = {"AAPL": ["2026Q3"], "NVDA": ["2027Q1"]}

    with pytest.raises(ValueError, match="AAPL/2026Q2"):
        mod.assert_append_only(remapped, old)


def test_missing_index_cannot_erase_published_links(tmp_path: Path, monkeypatch):
    mod = _load("gen_fund_guard", ROOT / "ingest" / "gen_fund_us.py")
    out = tmp_path / "out"
    out.mkdir()
    (out / "AAPL.fund.json").write_text(json.dumps({
        "ticker": "AAPL", "earnings": {"q": [{"tx": "2026Q3"}]}
    }))
    monkeypatch.setattr(mod, "OUT", out)
    monkeypatch.setattr(mod, "TX_INDEX", tmp_path / "absent.json")

    with pytest.raises(RuntimeError, match="refusing to erase"):
        mod.load_tx_index()


def test_one_missing_published_pair_is_rejected(tmp_path: Path, monkeypatch):
    mod = _load("gen_fund_pair_guard", ROOT / "ingest" / "gen_fund_us.py")
    out = tmp_path / "out"
    out.mkdir()
    (out / "AAPL.fund.json").write_text(json.dumps({
        "ticker": "AAPL",
        "earnings": {"q": [{"tx": "2026Q2"}, {"tx": "2026Q3"}]},
    }))
    # Same aggregate count, but AAPL/2026Q2 was silently remapped to NVDA.
    index = tmp_path / "index.json"
    index.write_text(json.dumps({"AAPL": ["2026Q3"], "NVDA": ["2027Q1"]}))
    monkeypatch.setattr(mod, "OUT", out)
    monkeypatch.setattr(mod, "TX_INDEX", index)

    with pytest.raises(RuntimeError, match="AAPL/2026Q2"):
        mod.load_tx_index()


def test_collection_universe_includes_cache_only_and_index_only_symbols(tmp_path: Path, monkeypatch):
    mod = _load("collect_tx_universe_union", ROOT / "ingest" / "collect_transcripts.py")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({"symbols": {"AAPL": {}, "BRK.B": {}}}))
    us_fund = tmp_path / "us_fund"
    us_fund.mkdir()
    (us_fund / "MSFT.json").write_text("{}")
    tx_index = us_fund / "_tx_index.json"
    tx_index.write_text(json.dumps({"NVDA": ["2026Q3"]}))
    monkeypatch.setattr(mod, "MANIFEST", manifest)
    monkeypatch.setattr(mod, "US_FUND", us_fund)
    monkeypatch.setattr(mod, "TX_INDEX", tx_index)

    assert mod._load_universe() == ["AAPL", "BRK.B", "MSFT", "NVDA"]


def test_collection_universe_rejects_excluded_markets_crypto_and_unsafe_names(tmp_path: Path, monkeypatch):
    mod = _load("collect_tx_universe_filter", ROOT / "ingest" / "collect_transcripts.py")
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps({
        "symbols": {
            "aapl": {},
            "0700.HK": {},
            "000001.SS": {},
            "SHOP.TO": {},
            "BTC-USD": {},
            "../ESCAPE": {},
            "BAD/NAME": {},
        }
    }))
    us_fund = tmp_path / "us_fund"
    us_fund.mkdir()
    (us_fund / "MSFT.json").write_text("{}")
    (us_fund / "NIO.SZ.json").write_text("{}")
    tx_index = us_fund / "_tx_index.json"
    tx_index.write_text(json.dumps({"NVDA": ["2026Q3"], "ETH-USD": ["2026Q2"]}))
    monkeypatch.setattr(mod, "MANIFEST", manifest)
    monkeypatch.setattr(mod, "US_FUND", us_fund)
    monkeypatch.setattr(mod, "TX_INDEX", tx_index)

    assert mod._load_universe() == ["AAPL", "MSFT", "NVDA"]
