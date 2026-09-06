"""Tests for the supabase/migrations namespace guard.

See scripts/check_supabase_migration_namespace.py for the rules. The load-bearing
property under test is the join direction in `check_files_are_reserved`: it walks
on-disk files looking them up in the ledger, never the reverse, so a `taken`/`reserved`
prefix whose file has not merged yet is a Disclosure, not a Finding.
"""
from __future__ import annotations

import warnings
from pathlib import Path

from scripts.check_supabase_migration_namespace import (
    HEADER_SCAN_LINES,
    MIGRATIONS_DIR,
    RESERVATIONS_PATH,
    check_all,
    check_files_are_reserved,
    check_migration_header,
    check_prefix_collisions,
    collect,
    disclosures,
    format_report,
    load_reservations,
    parse_prefix,
    validate_reservations,
)


def reservations_doc(**overrides) -> dict:
    doc = {
        "$schema_note": "test fixture",
        "version": 1,
        "project_ref": "fsldfzlxyavsuwqbceod",
        "prefix_width": 4,
        "header_required_from": "0015",
        "header_required_note": "test fixture",
        "claim_before_you_write": "test fixture",
        "prefixes": {
            "0001": {
                "state": "historical",
                "file": "0001_init.sql",
                "packet": None,
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            },
        },
    }
    doc.update(overrides)
    return doc


def write_tree(tmp_path: Path, files: dict, doc: dict) -> "tuple[Path, Path]":
    migrations_dir = tmp_path / "migrations"
    migrations_dir.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (migrations_dir / name).write_text(text, encoding="utf-8")

    reservations_path = tmp_path / "RESERVATIONS.json"
    import json

    reservations_path.write_text(json.dumps(doc), encoding="utf-8")
    return migrations_dir, reservations_path


# --- 1 -----------------------------------------------------------------------

def test_reservations_file_parses_and_matches_schema():
    doc = load_reservations(RESERVATIONS_PATH)
    assert validate_reservations(doc) == []


# --- 2 -----------------------------------------------------------------------

def test_every_on_disk_migration_prefix_is_reserved():
    doc = load_reservations(RESERVATIONS_PATH)
    on_disk = sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))
    assert on_disk, "expected at least one migration file on disk"
    findings = check_files_are_reserved(on_disk, doc)
    unreserved = [f for f in findings if f.code == "UNRESERVED_PREFIX"]
    assert unreserved == []


# --- 3 -----------------------------------------------------------------------

def test_repo_is_clean_under_the_guard():
    findings, _notes = collect()
    assert findings == [], format_report(findings, [])


# --- 4 -----------------------------------------------------------------------

def test_duplicate_prefix_is_detected():
    filenames = ["0099_a.sql", "0099_b.sql"]
    findings = check_prefix_collisions(filenames)
    codes = [f.code for f in findings]
    assert "DUPLICATE_PREFIX" in codes

    report = format_report(findings, [])
    # LIVE PROOF (packet §6): surface the rendered report through the warnings
    # channel so `pytest -q`'s default warnings summary prints it verbatim in the
    # CI check log, next to the green pass count, with no extra flags needed.
    warnings.warn(
        "migration-namespace guard proof — synthetic duplicate 0099 fixture raised:\n" + report,
        UserWarning,
        stacklevel=2,
    )


# --- 5 -----------------------------------------------------------------------

def test_unreserved_prefix_is_detected(tmp_path):
    doc = reservations_doc()
    findings = check_files_are_reserved(["0098_x.sql"], doc)
    assert any(f.code == "UNRESERVED_PREFIX" and f.prefix == "0098" for f in findings)


# --- 6 -----------------------------------------------------------------------

def test_reserved_prefix_without_owner_packet_is_detected():
    doc = reservations_doc(
        prefixes={
            "0015": {
                "state": "reserved",
                "file": None,
                "packet": None,
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            }
        }
    )
    findings = validate_reservations(doc)
    assert any(f.code == "RESERVATION_WITHOUT_OWNER" and f.prefix == "0015" for f in findings)


# --- 7 -----------------------------------------------------------------------

def test_missing_ledger_row_header_is_detected():
    doc = reservations_doc(header_required_from="0015")
    text = "-- Rollback: drop table if exists foo;\ncreate table foo();\n"
    findings = check_migration_header("0099_x.sql", text, doc)
    assert any(f.code == "MISSING_LEDGER_ROW_HEADER" for f in findings)


# --- 8 -----------------------------------------------------------------------

def test_missing_rollback_header_is_detected():
    doc = reservations_doc(header_required_from="0015")
    text = "-- Ledger row: NONE: fixture\ncreate table foo();\n"
    findings = check_migration_header("0099_x.sql", text, doc)
    assert any(f.code == "MISSING_ROLLBACK_HEADER" for f in findings)


# --- 9 -----------------------------------------------------------------------

def test_header_rule_does_not_retro_fail_pre_floor_files():
    doc = reservations_doc(header_required_from="0015")
    body = "create table alert_runs_outbox();\n"
    findings_13 = check_migration_header("0013_alert_runs_outbox.sql", body, doc)
    findings_14 = check_migration_header("0014_tenancy_foundation.sql", body, doc)
    assert findings_13 == []
    assert findings_14 == []

    notes = disclosures(["0013_alert_runs_outbox.sql"], doc)
    assert any("header rule starts at 0015" in n.text for n in notes)


# --- 10 (acceptance 4) ---------------------------------------------------------

def test_taken_prefix_with_absent_file_is_not_an_error():
    doc = reservations_doc(
        prefixes={
            "0013": {
                "state": "taken",
                "file": "0013_alert_runs_outbox.sql",
                "packet": "B-F08-2",
                "pr": 513,
                "pr_state": "open",
                "note": "fixture",
            },
            "0014": {
                "state": "taken",
                "file": "0014_tenancy_foundation.sql",
                "packet": "B-F12-1",
                "pr": 514,
                "pr_state": "open",
                "note": "fixture",
            },
        }
    )
    on_disk: list[str] = []  # neither file present -- both PRs are unmerged

    findings = check_files_are_reserved(on_disk, doc)
    assert findings == []

    notes = disclosures(on_disk, doc)
    text_513 = next(n.text for n in notes if n.prefix == "0013")
    text_514 = next(n.text for n in notes if n.prefix == "0014")
    assert "#513" in text_513 and "absent from this checkout by design" in text_513
    assert "#514" in text_514 and "absent from this checkout by design" in text_514


# --- 11 -----------------------------------------------------------------------

def test_free_prefix_with_a_file_present_is_detected():
    doc = reservations_doc(
        prefixes={
            "0017": {
                "state": "free",
                "file": None,
                "packet": None,
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            }
        }
    )
    findings = check_files_are_reserved(["0017_oops.sql"], doc)
    assert any(f.code == "FREE_PREFIX_HAS_FILE" and f.prefix == "0017" for f in findings)


# --- 11b (major fix: reserved prefix with file=null must not vouch for an occupant) -----

def test_reserved_prefix_occupied_by_a_file_is_detected():
    """RESERVATIONS.json diff:482-497 shape: 0015/0016 are `reserved` for
    B-F12-3/B-F12-4 with file=null (the owner has claimed the number but not
    written the .sql yet). A non-owner lane dropping a file at that prefix
    used to pass silently because `expected_file != name` short-circuited on
    the null `file`. It must fail loudly instead, naming the owning packet so
    the log points at who actually holds the prefix.
    """
    doc = reservations_doc(
        prefixes={
            "0015": {
                "state": "reserved",
                "file": None,
                "packet": "B-F12-3",
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            }
        }
    )
    findings = check_files_are_reserved(["0015_anything.sql"], doc)
    assert any(f.code == "RESERVED_PREFIX_OCCUPIED" and f.prefix == "0015" for f in findings)
    assert not any(f.code == "UNRESERVED_PREFIX" for f in findings)
    detail = next(f.detail for f in findings if f.code == "RESERVED_PREFIX_OCCUPIED")
    assert "B-F12-3" in detail


def test_taken_prefix_with_null_file_cannot_vouch_for_any_name():
    """Defense in depth for the same join-skip shape on state=taken: even if
    RESERVATIONS.json schema validation is bypassed and a `taken` entry somehow
    carries file=null, the join must not let an arbitrary on-disk name pass.
    """
    doc = reservations_doc(
        prefixes={
            "0015": {
                "state": "taken",
                "file": None,
                "packet": "B-F12-3",
                "pr": 600,
                "pr_state": "open",
                "note": "fixture (schema-invalid on purpose)",
            }
        }
    )
    findings = check_files_are_reserved(["0015_anything.sql"], doc)
    assert any(f.code == "RESERVED_NAME_MISMATCH" and f.prefix == "0015" for f in findings)


# --- 12 (acceptance 2) ----------------------------------------------------------

def test_reservations_records_the_known_collision_surface():
    doc = load_reservations(RESERVATIONS_PATH)
    prefixes = doc["prefixes"]

    assert prefixes["0012"]["state"] == "taken"
    assert prefixes["0012"]["packet"] == "F11-1"
    assert prefixes["0012"]["pr"] == 502

    assert prefixes["0013"]["state"] == "taken"
    assert prefixes["0013"]["packet"] == "B-F08-2"
    assert prefixes["0013"]["pr"] == 513
    assert prefixes["0013"]["pr_state"] == "open"

    assert prefixes["0014"]["state"] == "taken"
    assert prefixes["0014"]["packet"] == "B-F12-1"
    assert prefixes["0014"]["pr"] == 514
    assert prefixes["0014"]["pr_state"] == "open"

    assert prefixes["0015"]["state"] == "reserved"
    assert prefixes["0015"]["packet"] == "B-F12-3"
    assert prefixes["0015"]["pr"] is None

    assert prefixes["0016"]["state"] == "reserved"
    assert prefixes["0016"]["packet"] == "B-F12-4"
    assert prefixes["0016"]["pr"] is None

    for prefix in ("0017", "0018", "0019"):
        assert prefixes[prefix]["state"] == "free"

    assert doc["claim_before_you_write"].strip() != ""


# --- 13 -----------------------------------------------------------------------

def test_report_prints_nulls_in_plain_words_and_is_not_vacuous():
    doc = reservations_doc(
        prefixes={
            "0015": {
                "state": "reserved",
                "file": None,
                "packet": "B-F12-3",
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            },
            "0017": {
                "state": "free",
                "file": None,
                "packet": None,
                "pr": None,
                "pr_state": None,
                "note": "fixture",
            },
        }
    )
    notes = disclosures([], doc)
    report = format_report([], notes)

    assert "None" not in report
    assert "no pull request opened yet" in report
    assert "claim" in report

    empty_dir = MIGRATIONS_DIR.parent / "__does_not_exist__"
    findings, _ = collect(migrations_dir=empty_dir, reservations=RESERVATIONS_PATH)
    assert any(f.code == "MIGRATIONS_DIR_EMPTY" for f in findings)
