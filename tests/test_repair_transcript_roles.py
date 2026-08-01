import gzip
import json
from pathlib import Path

import pytest

from ingest.repair_transcript_roles import plan_role_repairs, repair_roles


def _write_body(path: Path, segments: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "mastermind.tx/v1",
        "ticker": path.parent.name,
        "id": path.name.removesuffix(".json.gz"),
        "period": "Q2 FY2026",
        "date": "2026-05-01",
        "title": "AAPL Earnings Call Q2 FY2026",
        "segments": segments,
    }
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle)


def _read_body(path: Path) -> dict:
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def test_dry_run_plans_but_does_not_mutate(tmp_path: Path) -> None:
    path = tmp_path / "AAPL" / "2026Q2.json.gz"
    _write_body(path, [{
        "speaker": "Suhasini Chandramouli",
        "role": "CEO",
        "text": (
            "My name is Suhasini Chandramouli, Director of Investor Relations. "
            "Speaking first today is Apple's CEO, Tim Cook."
        ),
    }])
    before = path.read_bytes()

    summary = repair_roles(tmp_path)

    assert summary["write"] is False
    assert summary["bodies_changed"] == 1
    assert summary["roles_changed"] == 1
    assert summary["bodies_written"] == 0
    assert path.read_bytes() == before


def test_write_repairs_false_roles_and_preserves_schema(tmp_path: Path) -> None:
    path = tmp_path / "AAPL" / "2026Q2.json.gz"
    _write_body(path, [
        {
            "speaker": "Suhasini Chandramouli",
            "role": "CEO",
            "text": (
                "My name is Suhasini Chandramouli, Director of Investor Relations. "
                "Speaking first today is Apple's CEO, Tim Cook."
            ),
        },
        {
            "speaker": "Suhasini Chandramouli",
            "role": "Operator",
            "text": "Operator, may we have the first question, please?",
        },
        {
            "speaker": "Tim Cook, Chief Executive Officer",
            "role": "CEO",
            "text": "Thank you, Suhasini.",
        },
    ])

    summary = repair_roles(tmp_path, write=True)
    payload = _read_body(path)

    assert summary["write"] is True
    assert summary["bodies_written"] == 1
    assert [segment["role"] for segment in payload["segments"]] == ["IR", "IR", "CEO"]
    assert payload["schema"] == "mastermind.tx/v1"
    assert payload["id"] == "2026Q2"


def test_invalid_body_aborts_before_any_write(tmp_path: Path) -> None:
    valid = tmp_path / "AAPL" / "2026Q2.json.gz"
    _write_body(valid, [{
        "speaker": "Jane Doe",
        "role": "CEO",
        "text": "I'll now hand it to our CEO, John Smith.",
    }])
    before = valid.read_bytes()
    corrupt = tmp_path / "MSFT" / "2026Q2.json.gz"
    corrupt.parent.mkdir(parents=True)
    corrupt.write_bytes(b"not gzip")

    with pytest.raises(ValueError, match="invalid transcript body"):
        plan_role_repairs(tmp_path)

    assert valid.read_bytes() == before


def test_empty_or_missing_root_fails_closed(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="contains no versioned gzip bodies"):
        repair_roles(tmp_path, write=True)
    with pytest.raises(ValueError, match="missing or not a directory"):
        repair_roles(tmp_path / "missing", write=True)


def test_second_write_is_idempotent_and_preserves_metadata(tmp_path: Path) -> None:
    path = tmp_path / "AAPL" / "2026Q2.json.gz"
    _write_body(path, [{
        "speaker": "Suhasini Chandramouli",
        "role": "CEO",
        "text": "My name is Suhasini Chandramouli, Director of Investor Relations.",
    }])
    first = repair_roles(tmp_path, write=True)
    after_first = path.read_bytes()
    payload = _read_body(path)

    second = repair_roles(tmp_path, write=True)

    assert first["bodies_written"] == 1
    assert second["bodies_changed"] == 0
    assert second["bodies_written"] == 0
    assert path.read_bytes() == after_first
    assert payload["date"] == "2026-05-01"
    assert payload["title"] == "AAPL Earnings Call Q2 FY2026"
    assert payload["segments"][0]["text"].startswith("My name is Suhasini")
