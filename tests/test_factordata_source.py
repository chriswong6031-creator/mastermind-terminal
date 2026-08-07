"""Tests for the factordata local-source resolution (tech_lab.json / tech_events/).

Macro PR #3393 regwalled /factordata/* and carved out exactly the two payload
paths this ingest pulled anonymously.  pull_macro_intel now prefers a LOCAL
factordata directory (env path / file:// URL / $MACRO_REPO / ~/.mm-factordata /
sibling checkout) and keeps anonymous HTTPS only as the fallback, so the
carve-out can close.

Invariants under test:
  1. FACTORDATA_BASE as a filesystem path or file:// URL → local reads.
  2. A usable local dir is AUTHORITATIVE — a missing tech_events/<SYM>.json is
     "symbol not covered" (None) and must NOT trigger an HTTPS request.
  3. An unusable local FACTORDATA_BASE (no tech_lab.json) falls back to HTTPS.
  4. No env → $MACRO_REPO/site/factordata is auto-derived (the VPS lane).
  5. No usable local candidate anywhere → the legacy HTTPS base (unchanged).
  6. Graceful degradation everywhere: malformed/missing payloads → None, never
     an exception (tech block omitted, core intel write unaffected).

All tests are hermetic: no real HTTP, all local candidates redirected to tmp.
"""
from __future__ import annotations

import json
import sys
import urllib.error
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.pull_macro_intel as pmi  # noqa: E402


TECH_LAB = {
    "generated_utc": "2026-07-18T02:00:00Z",
    "signals": {
        "sig_a": {"name": "Signal A", "family": "trend"},
        "sig_b": {"name": "Signal B", "family": "meanrev"},
    },
}
TECH_EVENTS_AAPL = {
    "generated_utc": "2026-07-18T02:00:00Z",
    "signals": {"sig_a": {"fires": ["2026-07-01", "2026-07-10"]}},
}


# ── helpers ────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    """Reset the memoized source and detach every implicit local candidate from
    the machine running the tests (dev Macs really have a sibling checkout)."""
    monkeypatch.setattr(pmi, "_FACTORDATA_SOURCE", None)
    monkeypatch.setattr(pmi, "_FACTORDATA_HOME_CACHE", tmp_path / "no-home-cache")
    monkeypatch.setattr(pmi, "_FACTORDATA_SIBLING", tmp_path / "no-sibling")
    monkeypatch.delenv("FACTORDATA_BASE", raising=False)
    monkeypatch.delenv("MACRO_REPO", raising=False)
    pmi._TECH_LAB_LOG_ONCE.clear()
    yield


def _seed(d: Path, *, lab: object = TECH_LAB, events: dict | None = None) -> Path:
    """Write a factordata dir under *d* and return it."""
    d.mkdir(parents=True, exist_ok=True)
    if lab is not None:
        body = lab if isinstance(lab, str) else json.dumps(lab)
        (d / "tech_lab.json").write_text(body)
    (d / "tech_events").mkdir(exist_ok=True)
    for sym, payload in (events or {}).items():
        (d / "tech_events" / f"{sym}.json").write_text(json.dumps(payload))
    return d


def _forbid_network(monkeypatch):
    def _boom(*a, **k):  # pragma: no cover - only fires on regression
        raise AssertionError("urlopen called — local mode must not touch the network")
    monkeypatch.setattr(pmi.urllib.request, "urlopen", _boom)


# ── 1. env as filesystem path / file:// URL ────────────────────────────────────

def test_env_path_reads_local(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd", events={"AAPL": TECH_EVENTS_AAPL})
    monkeypatch.setenv("FACTORDATA_BASE", str(fd))
    _forbid_network(monkeypatch)

    assert pmi._factordata_source() == fd
    profiles = pmi._fetch_tech_lab_profiles()
    assert profiles is not None and set(profiles) == {"sig_a", "sig_b"}

    tech = pmi._build_tech_block("AAPL", profiles)
    assert tech is not None
    assert tech["events"] == TECH_EVENTS_AAPL
    assert set(tech["profiles"]) == {"sig_a"}  # only signals present in events
    assert tech["asof"] == "2026-07-18T02:00:00Z"


def test_env_file_url_reads_local(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd", events={"AAPL": TECH_EVENTS_AAPL})
    monkeypatch.setenv("FACTORDATA_BASE", fd.as_uri())  # file:///…
    _forbid_network(monkeypatch)

    assert pmi._factordata_source() == fd
    assert pmi._fetch_tech_lab_profiles() is not None


# ── 2. local mode is authoritative (no HTTPS fallback per file) ────────────────

def test_local_missing_events_returns_none_without_http(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd", events={"AAPL": TECH_EVENTS_AAPL})
    monkeypatch.setenv("FACTORDATA_BASE", str(fd))
    _forbid_network(monkeypatch)

    # MSFT has no tech_events file → "not covered", same semantic as the old 404.
    assert pmi._build_tech_block("MSFT", {"sig_a": {}}) is None


def test_local_malformed_events_returns_none(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd")
    (fd / "tech_events" / "AAPL.json").write_text("{not json")
    monkeypatch.setenv("FACTORDATA_BASE", str(fd))
    _forbid_network(monkeypatch)

    assert pmi._build_tech_block("AAPL", None) is None


def test_local_malformed_tech_lab_degrades_gracefully(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd", lab="{not json", events={"AAPL": TECH_EVENTS_AAPL})
    monkeypatch.setenv("FACTORDATA_BASE", str(fd))
    _forbid_network(monkeypatch)

    assert pmi._fetch_tech_lab_profiles() is None
    # events still forwarded without profiles (existing contract)
    tech = pmi._build_tech_block("AAPL", None)
    assert tech is not None and "profiles" not in tech


# ── 3. unusable local env value falls back to HTTPS ────────────────────────────

def test_env_path_without_tech_lab_falls_back_to_https(monkeypatch, tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setenv("FACTORDATA_BASE", str(empty))
    assert pmi._factordata_source() == pmi._FACTORDATA_HTTP_DEFAULT


def test_env_http_url_used_verbatim(monkeypatch):
    monkeypatch.setenv("FACTORDATA_BASE", "https://example.com/fd/")
    assert pmi._factordata_source() == "https://example.com/fd"


# ── 4. auto-derivation from MACRO_REPO (the VPS lane) ──────────────────────────

def test_macro_repo_site_factordata_auto_derived(monkeypatch, tmp_path):
    repo = tmp_path / "opt-macro"
    fd = _seed(repo / "site" / "factordata", events={"AAPL": TECH_EVENTS_AAPL})
    monkeypatch.setenv("MACRO_REPO", str(repo))
    _forbid_network(monkeypatch)

    assert pmi._factordata_source() == fd
    assert pmi._fetch_tech_lab_profiles() is not None


def test_macro_repo_without_factordata_falls_through(monkeypatch, tmp_path):
    repo = tmp_path / "cnhk-src"  # the Mac lane surface: no site/factordata
    (repo / "site").mkdir(parents=True)
    monkeypatch.setenv("MACRO_REPO", str(repo))
    # next candidate: the home cache
    cache = _seed(tmp_path / "mm-factordata")
    monkeypatch.setattr(pmi, "_FACTORDATA_HOME_CACHE", cache)
    assert pmi._factordata_source() == cache


# ── 5. no local candidate anywhere → legacy HTTPS default ──────────────────────

def test_default_is_https_when_nothing_local(monkeypatch):
    assert pmi._factordata_source() == pmi._FACTORDATA_HTTP_DEFAULT


def test_http_404_still_returns_none(monkeypatch):
    """The legacy HTTPS path keeps its graceful-degradation contract."""
    err = urllib.error.HTTPError("u", 404, "nf", hdrs=None, fp=None)
    with patch.object(pmi.urllib.request, "urlopen", side_effect=err):
        assert pmi._factordata_fetch("tech_events/ZZZ.json") is None


def test_http_network_error_still_returns_none(monkeypatch):
    with patch.object(pmi.urllib.request, "urlopen", side_effect=OSError("boom")):
        assert pmi._fetch_tech_lab_profiles() is None


# ── 6. memoization ─────────────────────────────────────────────────────────────

def test_source_is_memoized_per_run(monkeypatch, tmp_path):
    fd = _seed(tmp_path / "fd")
    monkeypatch.setenv("FACTORDATA_BASE", str(fd))
    assert pmi._factordata_source() == fd
    # env changes mid-run must not flip the source (one surface per run)
    monkeypatch.setenv("FACTORDATA_BASE", "https://example.com/other")
    assert pmi._factordata_source() == fd
