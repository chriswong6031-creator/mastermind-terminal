"""Tests for the R2 stockdata sync leg (nw-d7-terminal-r2).

The sync touches the network only via _r2_fetch, which is a seam tests can patch.
All tests are fully hermetic — no real HTTP requests, no disk writes to tracked paths.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ingest.pull_macro_intel import sync_r2_stockdata, _r2_fetch, _R2_UA, _R2_META


# ── helpers ────────────────────────────────────────────────────────────────────

def _manifest_body(names: list[str]) -> bytes:
    return json.dumps({"files": names}).encode()


# ── unit: _r2_fetch User-Agent ─────────────────────────────────────────────────

def test_r2_fetch_sends_custom_ua(tmp_path):
    """_r2_fetch must set the mastermind-feed/1.0 User-Agent; Cloudflare WAF
    blocks the default Python-urllib UA with a 403."""
    captured = {}

    class FakeResponse:
        def read(self): return b'{"files":[]}'
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def headers(self): return {}
        headers = {"ETag": ""}

    def fake_urlopen(req, timeout=None):
        captured["ua"] = req.get_header("User-agent")
        return FakeResponse()

    with patch("urllib.request.urlopen", fake_urlopen):
        _r2_fetch("https://example.com/test")

    assert captured.get("ua") == _R2_UA, (
        f"User-Agent must be {_R2_UA!r}, got {captured.get('ua')!r}"
    )


# ── unit: sync_r2_stockdata ────────────────────────────────────────────────────

class TestSyncR2Stockdata:

    def test_returns_none_on_manifest_fetch_failure(self, tmp_path):
        """When the manifest fetch fails, return None (don't raise)."""
        with patch("ingest.pull_macro_intel._r2_fetch", return_value=None):
            result = sync_r2_stockdata(tmp_path / "stockdata")
        assert result is None

    def test_returns_none_on_malformed_manifest(self, tmp_path):
        """Corrupt manifest body → return None, no crash."""
        with patch("ingest.pull_macro_intel._r2_fetch", return_value=(b"not-json", "")):
            result = sync_r2_stockdata(tmp_path / "stockdata")
        assert result is None

    def test_etag_fastpath_skips_download(self, tmp_path):
        """Same ETag + local file count matching → return 0 without pulling files."""
        dest = tmp_path / "stockdata"
        dest.mkdir()
        names = ["SPY.json", "AAPL.json"]
        tag = "abc123"
        # Pre-populate: stamp + two files
        (dest / _R2_META).write_text(json.dumps({"etag": tag, "count": 2}))
        for n in names:
            (dest / n).write_bytes(b"{}")

        manifest_resp = (_manifest_body(names), tag)
        with patch("ingest.pull_macro_intel._r2_fetch", return_value=manifest_resp):
            result = sync_r2_stockdata(dest)

        assert result == 0

    def test_etag_mismatch_triggers_download(self, tmp_path):
        """Stale ETag → pulls all files, returns count."""
        dest = tmp_path / "stockdata"
        dest.mkdir()
        names = ["SPY.json", "AAPL.json"]
        old_tag = "old"
        new_tag = "new"
        (dest / _R2_META).write_text(json.dumps({"etag": old_tag, "count": 2}))

        file_body = b'{"asof":"2026-07-04"}'

        def fake_fetch(url: str):
            if url.endswith("_manifest.json"):
                return _manifest_body(names), new_tag
            return file_body, ""

        with patch("ingest.pull_macro_intel._r2_fetch", side_effect=fake_fetch):
            result = sync_r2_stockdata(dest)

        assert result == len(names)
        # Verify files were written
        for n in names:
            assert (dest / n).read_bytes() == file_body
        # Verify stamp was updated
        stamp = json.loads((dest / _R2_META).read_text())
        assert stamp["etag"] == new_tag
        assert stamp["count"] == len(names)

    def test_partial_failure_does_not_stamp(self, tmp_path):
        """If some files fail to download, the ETag stamp must NOT be written."""
        dest = tmp_path / "stockdata"
        dest.mkdir()
        names = ["SPY.json", "AAPL.json", "MSFT.json"]
        tag = "xyz"

        call_count = [0]

        def fake_fetch(url: str):
            if url.endswith("_manifest.json"):
                return _manifest_body(names), tag
            call_count[0] += 1
            # Fail the second file
            if call_count[0] == 2:
                return None
            return b'{"ok":true}', ""

        with patch("ingest.pull_macro_intel._r2_fetch", side_effect=fake_fetch):
            result = sync_r2_stockdata(dest)

        # Should be 2 (2 of 3 succeeded)
        assert result == 2
        # Stamp must NOT have been written (partial sync)
        assert not (dest / _R2_META).exists()

    def test_creates_dest_dir_if_absent(self, tmp_path):
        """sync_r2_stockdata must create MACRO_STOCKDATA if it doesn't exist."""
        dest = tmp_path / "nonexistent" / "stockdata"
        assert not dest.exists()

        names = ["SPY.json"]
        tag = "t1"

        def fake_fetch(url: str):
            if url.endswith("_manifest.json"):
                return _manifest_body(names), tag
            return b'{}', ""

        with patch("ingest.pull_macro_intel._r2_fetch", side_effect=fake_fetch):
            result = sync_r2_stockdata(dest)

        assert dest.is_dir()
        assert result == 1

    def test_atomic_write_via_tmp(self, tmp_path):
        """Files must be written via a tmp-rename so partial writes don't corrupt."""
        dest = tmp_path / "stockdata"
        dest.mkdir()
        names = ["SPY.json"]
        tag = "t2"
        body = b'{"asof":"2026-07-04","sym":"SPY"}'

        def fake_fetch(url: str):
            if url.endswith("_manifest.json"):
                return _manifest_body(names), tag
            return body, ""

        with patch("ingest.pull_macro_intel._r2_fetch", side_effect=fake_fetch):
            sync_r2_stockdata(dest)

        out = dest / "SPY.json"
        assert out.exists()
        assert out.read_bytes() == body
        # No tmp file left behind
        assert not list(dest.glob(".*.tmp"))

    def test_never_raises_on_network_error(self, tmp_path):
        """Any network failure must return None, never raise."""
        def explode(url):
            raise RuntimeError("network down")

        with patch("ingest.pull_macro_intel._r2_fetch", side_effect=explode):
            result = sync_r2_stockdata(tmp_path / "stockdata")

        assert result is None
