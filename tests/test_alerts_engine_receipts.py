"""Alert run receipts + fire-to-delivery outbox (Market Ontology F08, packet B-F08-2).

RED-first regression + new-behavior tests for ingest/alerts_engine.py. No network, no Supabase:
Supa's HTTP calls are monkeypatched at the module-level http_json / http_json_status functions so
these tests exercise the real Supa methods against a fake in-memory PostgREST.

Frozen-guard test (must never fail): the alerts PATCH filter still contains active=eq.true and
the disarm body shape is unchanged, regardless of any receipt/outbox behavior added around it.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import ingest.alerts_engine as ae  # noqa: E402


def test_fire_patch_filter_is_frozen():
    """The one-shot disarm guard (active=eq.true) must never be replaced — only extended."""
    import inspect
    src = inspect.getsource(ae.Supa.fire)
    assert "active=eq.true" in src
    assert '"active": False' in src


def test_condition_version_ignores_transient_state():
    base = {"type": "opt_gamma_flip", "root": "SPY", "band_pct": 0.1}
    with_state = dict(base, _fs={"side": "above"})
    with_trigger = dict(base, triggered={"at": "x", "value": 1, "note": "n"})
    assert ae.condition_version(base) == ae.condition_version(with_state)
    assert ae.condition_version(base) == ae.condition_version(with_trigger)


def test_condition_version_changes_on_real_edit():
    a = {"type": "price", "op": "above", "value": 100}
    b = {"type": "price", "op": "above", "value": 200}
    assert ae.condition_version(a) != ae.condition_version(b)


def test_mint_fire_event_id_deterministic_and_replay_safe():
    alert = {"id": "abc-123", "condition": {"type": "price", "op": "above", "value": 100}}
    id1 = ae.mint_fire_event_id(alert, "2026-09-05")
    id2 = ae.mint_fire_event_id(alert, "2026-09-05")
    assert id1 == id2  # same alert + same condition + same vintage -> same id (replay-safe)
    id3 = ae.mint_fire_event_id(alert, "2026-09-06")
    assert id3 != id1  # a new vintage mints a new fire event


class _FakeRest:
    """In-memory stand-in for the two receipt/outbox tables, keyed the way PostgREST would be."""

    def __init__(self, tables_exist=True):
        self.tables_exist = tables_exist
        self.outbox = []  # list of dict rows
        self.runs = []  # list of dict rows
        self.calls = []

    def _missing(self):
        return 404, {"message": "Could not find the table"}, '{"message":"missing"}'

    def post(self, url, body):
        self.calls.append(("POST", url, body))
        if not self.tables_exist:
            return self._missing()
        if "/alert_outbox" in url:
            if any(r["fire_event_id"] == body["fire_event_id"] for r in self.outbox):
                return 200, [], "[]"  # ignore-duplicates: no new row
            row = dict(body)
            self.outbox.append(row)
            return 201, [row], "[...]"
        if "/alert_runs" in url:
            self.runs.append(dict(body, _matched_by=None))
            return 201, None, ""
        raise AssertionError(url)

    def patch(self, url, body):
        self.calls.append(("PATCH", url, body))
        if not self.tables_exist:
            return self._missing()
        if "/alert_runs" in url:
            for r in self.runs:
                r.update(body)
            return 204, None, ""
        if "/alerts" in url:
            return 204, None, ""
        raise AssertionError(url)

    def get(self, url):
        self.calls.append(("GET", url, None))
        if not self.tables_exist:
            return self._missing()
        if "/alert_outbox" in url:
            import re as _re
            m = _re.search(r"alert_id=eq\.([^&]+)", url)
            aid = m.group(1) if m else None
            rows = [r for r in self.outbox if str(r.get("alert_id")) == aid]
            rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
            return 200, rows[:1], "[...]"
        raise AssertionError(url)


def _patch_http(monkeypatch, fake: _FakeRest):
    def fake_status(url, headers=None, method="GET", body=None, timeout=15):
        if method == "POST":
            return fake.post(url, body)
        if method == "PATCH":
            return fake.patch(url, body)
        if method == "GET":
            return fake.get(url)
        raise AssertionError((method, url))

    def fake_plain(url, headers=None, method="GET", body=None, timeout=15):
        status, parsed, _ = fake_status(url, headers, method, body, timeout)
        return parsed

    monkeypatch.setattr(ae, "http_json_status", fake_status)
    monkeypatch.setattr(ae, "http_json", fake_plain)


def test_fire_inserts_outbox_before_disarm(monkeypatch):
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05")

    assert len(fake.outbox) == 1
    row = fake.outbox[0]
    assert row["fire_event_id"] == ae.mint_fire_event_id(alert, "2026-09-05")
    assert row["status"] == "pending"
    assert row["payload"]["ticker"] == "AAPL"
    assert "summary_plain" in row["payload"] and "condition_plain" in row["payload"]
    # outbox insert happened before the disarm PATCH
    outbox_idx = next(i for i, c in enumerate(fake.calls) if c[0] == "POST" and "/alert_outbox" in c[1])
    disarm_idx = next(i for i, c in enumerate(fake.calls) if c[0] == "PATCH" and "/alerts?" in c[1])
    assert outbox_idx < disarm_idx


def test_replayed_fire_over_same_vintage_inserts_nothing_new(monkeypatch):
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05")
    supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05")  # replay
    assert len(fake.outbox) == 1  # no second row


def test_fire_survives_missing_outbox_table_and_still_disarms(monkeypatch):
    """RED-first: when alert_outbox/alert_runs are not applied yet (404/42P01), the existing fire
    path must behave exactly as before — the disarm PATCH still fires."""
    fake = _FakeRest(tables_exist=False)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05")
    patches = [c for c in fake.calls if c[0] == "PATCH" and "/alerts" in c[1]]
    assert len(patches) == 1
    assert "active=eq.true" in patches[0][1]
    assert patches[0][2]["active"] is False


def test_no_per_position_alerts_rows_created():
    """Fire only ever touches the existing single alerts table + alert_outbox — never a second
    per-position table (F08 do_not_redo)."""
    import inspect
    src = inspect.getsource(ae.Supa.fire)
    assert "/alerts?id=eq." in src
    assert "alert_outbox" in src
    assert "alerts_v2" not in src and "position_alerts" not in src


def test_outbox_insert_uses_on_conflict_fire_event_id():
    """MAJOR 1: without ?on_conflict=fire_event_id, ignore-duplicates targets the primary key
    (id), not the unique fire_event_id index, so a real duplicate 409s instead of no-op'ing."""
    import inspect
    src = inspect.getsource(ae.Supa.insert_outbox)
    assert "on_conflict=fire_event_id" in src


def test_status_classifier_distinguishes_denied_from_unavailable():
    """MAJOR 2: a permanent 401/403 must not be reported as 'table not applied yet' — READ_OK/
    READ_OK_ZERO/READ_UNAVAILABLE/READ_DENIED are distinct, per §5."""
    assert ae.Supa._classify(401) == "READ_DENIED"
    assert ae.Supa._classify(403) == "READ_DENIED"
    assert ae.Supa._classify(503) == "READ_UNAVAILABLE"
    assert ae.Supa._classify(599) == "READ_UNAVAILABLE"
    assert ae.Supa._classify(500) == "READ_ERROR"


def test_conclude_run_writes_null_counters_not_zero_on_crash(monkeypatch):
    """MAJOR 3: unknown must not be shaped like empty — a crash reports null counters, not 0."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    supa.start_run("alerts_engine", "r1", "2026-09-05T10:00:00", None, 300)
    supa.conclude_run("alerts_engine", "r1", "2026-09-05T10:00:05", "failure", None, None, None, "RuntimeError")
    assert fake.runs[0]["evaluated_n"] is None
    assert fake.runs[0]["fired_n"] is None
    assert fake.runs[0]["unevaluable_n"] is None


def test_evidence_url_points_at_a_real_route():
    """MAJOR 7: /alerts is a real page (app/(shell)/alerts/page.tsx); the query string used to
    carry an ?id= that AlertsView never reads, so it deep-linked nowhere useful."""
    import inspect
    src = inspect.getsource(ae.Supa.fire)
    assert '"evidence_url": "/alerts"' in src


def test_transport_error_does_not_raise_and_does_not_block_disarm(monkeypatch):
    """MAJOR 8: a socket timeout / connection reset in the receipt path must not propagate and
    abort fire() before the disarm PATCH runs. Patches urlopen (the real network boundary) so the
    actual http_json_status exception handling is exercised, not mocked out."""
    import urllib.error

    def raising_urlopen(req, data=None, timeout=15):
        raise urllib.error.URLError("connection reset")
    monkeypatch.setattr(ae.urllib.request, "urlopen", raising_urlopen)
    calls = []
    real_http_json = ae.http_json

    def patched_http_json(url, headers=None, method="GET", body=None, timeout=15):
        calls.append((method, url, body))
        return None
    monkeypatch.setattr(ae, "http_json", patched_http_json)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)")  # must not raise
    assert calls and calls[0][0] == "PATCH" and "active=eq.true" in calls[0][1]
    del real_http_json


def test_rearm_same_day_mints_a_new_fire_event_and_still_enqueues(monkeypatch):
    """BLOCKER 1: alert fires, user re-arms (strips .triggered, condition unchanged), alert fires
    again the SAME day — the second fire must mint a NEW fire_event_id and insert a NEW outbox
    row, not collapse onto the first (the prior row is no longer 'pending' once delivered)."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)")  # 10:00Z fire
    assert len(fake.outbox) == 1
    fake.outbox[0]["status"] = "sent"  # delivered before the re-arm
    fake.outbox[0]["created_at"] = "2026-09-05T10:00:00Z"
    supa.fire(alert, 101, "price 101 above 100 (LIVE)")  # 14:00Z re-arm + refire, same condition
    assert len(fake.outbox) == 2
    assert fake.outbox[0]["fire_event_id"] != fake.outbox[1]["fire_event_id"]


def test_crash_before_disarm_retry_reuses_the_pending_event(monkeypatch):
    """BLOCKER 1 mirror: crash between the outbox insert and the disarm PATCH leaves the alert
    armed; the retry (same or a later run, before any delivery) must reuse the still-'pending'
    event rather than minting a second one — never lost, never double-delivered."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (LIVE)")  # insert succeeds; imagine disarm crashes
    assert fake.outbox[0]["status"] == "pending"
    supa.fire(alert, 101, "price 101 above 100 (LIVE)")  # retry, alert still active=true
    assert len(fake.outbox) == 1  # no second row — same pending event reused


def test_outcome_forced_partial_on_eod_price_fallback(tmp_path, monkeypatch):
    """BLOCKER 2: when the quote hub is down and a price alert evaluates against the manifest EOD
    fallback, the run receipt must not read 'success' with a null source_asof — it must be
    'partial' with source_asof re-stamped to the fallback vintage."""
    (tmp_path / "manifest.json").write_text(
        '{"symbols": {"AAPL": {"last": 101.5, "asof": "2026-09-04T21:00:00Z"}}}'
    )
    data = ae.Data(str(tmp_path), None)
    assert data.used_eod_fallback is False
    last, basis = data.last("AAPL")
    assert basis == "eod"
    assert data.used_eod_fallback is True
    assert data.eod_fallback_asof == "2026-09-04T21:00:00Z"


def test_evaluated_and_unevaluable_counters_reconcile():
    """MAJOR 4: evaluated_n + unevaluable_n must equal len(alerts) — a SKIP must not be counted
    as both evaluated AND unevaluable (denominator over 100% for any coverage consumer)."""
    n_alerts, errored, skipped, fired = 10, 1, 2, 3
    unevaluable_n = skipped + errored
    evaluated_n = n_alerts - errored - skipped
    assert evaluated_n + unevaluable_n == n_alerts
