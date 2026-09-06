"""Alert run receipts + fire-to-delivery outbox (Market Ontology F08, packet B-F08-2).

RED-first regression + new-behavior tests for ingest/alerts_engine.py. No network, no Supabase:
Supa's HTTP calls are monkeypatched at the module-level http_json / http_json_status functions so
these tests exercise the real Supa methods against a fake in-memory PostgREST.

Frozen-guard test (must never fail): the alerts PATCH filter still contains active=eq.true and
the disarm body shape is unchanged, regardless of any receipt/outbox behavior added around it.
"""
from __future__ import annotations

import json
import re as _re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

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


class _FakeAlertsRest(_FakeRest):
    """_FakeRest + GET /alerts?active=eq.true and disarm tracking, for end-to-end run_once()
    tests. `outbox_status`, when set, forces every alert_outbox insert to fail with that HTTP
    status (used to simulate MAJOR 3's hard-error case) instead of behaving like a real table."""

    def __init__(self, alerts: list[dict], tables_exist: bool = True, outbox_status: int | None = None):
        super().__init__(tables_exist=tables_exist)
        self.alerts = {a["id"]: dict(a) for a in alerts}
        self.outbox_status = outbox_status
        self.disarmed: set[str] = set()

    def get(self, url):
        if "/alerts?active=eq.true" in url:
            self.calls.append(("GET", url, None))
            return 200, [a for a in self.alerts.values() if a.get("active", True)], "[...]"
        return super().get(url)

    def post(self, url, body):
        if "/alert_outbox" in url and self.outbox_status is not None:
            self.calls.append(("POST", url, body))
            return self.outbox_status, None, "forced error"
        return super().post(url, body)

    def patch(self, url, body):
        if "/alerts?id=eq." in url:
            self.calls.append(("PATCH", url, body))
            m = _re.search(r"id=eq\.([^&]+)", url)
            aid = m.group(1) if m else None
            if aid in self.alerts:
                self.alerts[aid].update(body)
                self.disarmed.add(aid)
            return 204, None, ""
        return super().patch(url, body)


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


def test_fire_survives_missing_outbox_table_and_still_disarms(monkeypatch, capsys):
    """RED-first: when alert_outbox/alert_runs are not applied yet (404/42P01), the existing fire
    path must behave exactly as before — the disarm PATCH still fires, with a typed
    READ_UNAVAILABLE line and zero outbox rows (Meta-CEO ruling item 4, table-absent case)."""
    fake = _FakeRest(tables_exist=False)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    result = supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05T10:01Z")
    assert result is True
    assert fake.outbox == []
    patches = [c for c in fake.calls if c[0] == "PATCH" and "/alerts" in c[1]]
    assert len(patches) == 1
    assert "active=eq.true" in patches[0][1]
    assert patches[0][2]["active"] is False
    assert "READ_UNAVAILABLE" in capsys.readouterr().out


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


def test_transport_error_does_not_raise_and_leaves_alert_armed(monkeypatch):
    """A socket timeout / connection reset on the outbox insert must not propagate (it is a
    caught, classified status — 599 — not a raised exception), and per the Meta-CEO ruling item
    2 a network error is one of the 'ANY other non-2xx' cases that must NOT disarm: the fire is
    deferred, not lost, so the next run retries it. This supersedes the prior round's 'a
    transport blip must still disarm' expectation, which predates the ruling. Patches urlopen
    (the real network boundary) so the actual http_json_status exception handling is exercised,
    not mocked out."""
    import urllib.error

    def raising_urlopen(req, data=None, timeout=15):
        raise urllib.error.URLError("connection reset")
    monkeypatch.setattr(ae.urllib.request, "urlopen", raising_urlopen)
    calls = []

    def patched_http_json(url, headers=None, method="GET", body=None, timeout=15):
        calls.append((method, url, body))
        return None
    monkeypatch.setattr(ae, "http_json", patched_http_json)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    result = supa.fire(alert, 101, "price 101 above 100 (LIVE)", vintage="2026-09-05T10:01Z")  # must not raise
    assert result is False
    assert calls == []  # the disarm PATCH (routed through http_json) never ran


def test_h1_genuine_refire_after_rearm_mints_two_distinct_events(monkeypatch):
    """H1 / BLOCKER 1, Meta-CEO RULED: identity comes ONLY from (alert id, condition version,
    evaluation vintage) — never from a prior-row lookup. A genuine second fire after a re-arm
    runs at a NEW evaluation vintage (the data moved on between the two fires) and must mint a
    NEW fire_event_id: two outbox rows, two disarm PATCHes, two distinct payload summaries —
    never the silent-swallow the old 'reuse the pending row' heuristic produced."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    assert supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z") is True
    assert supa.fire(alert, 140, "price 140 above 100 (live)", vintage="2026-09-05T10:40Z") is True
    assert len(fake.outbox) == 2
    disarms = [c for c in fake.calls if c[0] == "PATCH" and "/alerts?" in c[1]]
    assert len(disarms) == 2
    summaries = {row["payload"]["summary_plain"] for row in fake.outbox}
    assert len(summaries) == 2
    assert fake.outbox[0]["fire_event_id"] != fake.outbox[1]["fire_event_id"]


def test_crash_before_disarm_retry_over_same_vintage_reuses_the_event(monkeypatch):
    """Crash-retry mirror (Meta-CEO RULED): a retry over the SAME evaluation vintage — the
    process crashed between the outbox insert and the disarm PATCH, and the retry re-reads the
    same on-disk data before anything refreshes — collapses onto the same id by construction. No
    lookup is needed or performed; the outbox row's own status never matters to identity."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    assert supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z") is True
    assert fake.outbox[0]["status"] == "pending"
    # retry — same vintage (same data), alert still active because the crash happened before the
    # first PATCH landed
    assert supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z") is True
    assert len(fake.outbox) == 1


def test_deferred_row_crash_retry_same_vintage_still_one_row(monkeypatch):
    """BLOCKER 2, Meta-CEO RULED: once macro's drain has moved the row to 'deferred', a
    crash-retry over the SAME vintage must still collapse onto that one row — the outbox row's
    status (pending/deferred/sent/failed/suppressed) is irrelevant to identity."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z")
    fake.outbox[0]["status"] = "deferred"  # macro's drain tried delivery and deferred it
    supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z")  # crash-retry
    assert len(fake.outbox) == 1


def test_insert_hard_error_never_disarms(monkeypatch):
    """MAJOR 3, Meta-CEO RULED: any hard error on the outbox insert (5xx/401/400/network — NOT a
    table-absent schema-cache miss) must NOT disarm. fire() returns False so the caller can leave
    the alert armed and count it unevaluable for the next run's retry."""
    fake = _FakeRest(tables_exist=True)
    _patch_http(monkeypatch, fake)
    orig_post = fake.post

    def failing_post(url, body):
        if "/alert_outbox" in url:
            fake.calls.append(("POST", url, body))
            return 500, None, "boom"
        return orig_post(url, body)
    fake.post = failing_post

    supa = ae.Supa("https://x.example.co", "k")
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL",
              "condition": {"type": "price", "op": "above", "value": 100}}
    result = supa.fire(alert, 101, "price 101 above 100 (live)", vintage="2026-09-05T10:01Z")
    assert result is False
    assert fake.outbox == []
    disarms = [c for c in fake.calls if c[0] == "PATCH" and "/alerts?" in c[1]]
    assert disarms == []


def test_run_once_two_phase_receipt_and_success_outcome(tmp_path, monkeypatch):
    """Item 3: run_once() drives the REAL two-phase alert_runs receipt end to end — a 'started'
    row at run open, a terminal row with concluded_at/outcome once outputs are committed — and a
    genuine fire disarms the real alert row via the production fire() path (not re-derived
    arithmetic)."""
    (tmp_path / "manifest.json").write_text(json.dumps(
        {"as_of": "2026-09-05T09:30:00Z", "symbols": {"AAPL": {}}}
    ))
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL", "active": True,
              "condition": {"type": "price", "op": "above", "value": 100}}
    fake = _FakeAlertsRest([alert])
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    data = ae.Data(str(tmp_path), None)
    data.quotes = {"AAPL": {"last": 101.0}}  # a live quote as if hub priming had populated it

    receipt = ae.run_once(supa, data, datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc), "r1")

    assert receipt["outcome"] == "success"
    assert receipt["fired_n"] == 1
    assert receipt["evaluated_n"] == 1
    assert receipt["unevaluable_n"] == 0
    assert len(fake.runs) == 1
    assert fake.runs[0]["started_at"]
    assert fake.runs[0]["concluded_at"]
    assert fake.runs[0]["outcome"] == "success"
    assert fake.disarmed == {"a1"}


def test_run_once_insert_error_leaves_alert_armed_and_counts_unevaluable(tmp_path, monkeypatch):
    """MAJOR 3, Meta-CEO RULED, end to end: a hard error on the outbox insert must not disarm —
    the run receipt counts the alert as unevaluable so the NEXT run re-evaluates and retries it,
    and the outcome reads 'partial', never a clean 'success'."""
    (tmp_path / "manifest.json").write_text(json.dumps(
        {"as_of": "2026-09-05T09:30:00Z", "symbols": {"AAPL": {}}}
    ))
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL", "active": True,
              "condition": {"type": "price", "op": "above", "value": 100}}
    fake = _FakeAlertsRest([alert], outbox_status=500)
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    data = ae.Data(str(tmp_path), None)
    data.quotes = {"AAPL": {"last": 101.0}}

    receipt = ae.run_once(supa, data, datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc), "r1")

    assert receipt["fired_n"] == 0
    assert receipt["unevaluable_n"] == 1
    assert receipt["outcome"] == "partial"
    assert fake.alerts["a1"]["active"] is True  # never disarmed
    assert fake.outbox == []
    assert fake.disarmed == set()


def test_run_once_crash_writes_failure_receipt_with_error_class(tmp_path, monkeypatch):
    """Item 3: a top-level crash during the run writes the failure half of the two-phase receipt
    with null counters (unknown, never shaped like zero) + the exception's class name, then
    re-raises — a genuine crash must never be swallowed."""
    (tmp_path / "manifest.json").write_text(json.dumps(
        {"as_of": "2026-09-05T09:30:00Z", "symbols": {"AAPL": {}}}
    ))
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL", "active": True,
              "condition": {"type": "price", "op": "above", "value": 100}}
    fake = _FakeAlertsRest([alert])
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    data = ae.Data(str(tmp_path), None)
    data.quotes = {"AAPL": {"last": 101.0}}

    def boom(alert, value, note, *, vintage):
        raise RuntimeError("disarm PATCH network failure")
    monkeypatch.setattr(supa, "fire", boom)

    with pytest.raises(RuntimeError):
        ae.run_once(supa, data, datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc), "r1")

    assert fake.runs[0]["outcome"] == "failure"
    assert fake.runs[0]["evaluated_n"] is None
    assert fake.runs[0]["fired_n"] is None
    assert fake.runs[0]["unevaluable_n"] is None
    assert fake.runs[0]["error_class"] == "RuntimeError"


def test_run_once_eod_fallback_forces_partial_outcome(tmp_path, monkeypatch):
    """BLOCKER 2, end to end via run_once(): a live-hub outage falls back to the manifest EOD
    last and the alert still fires on it — the run receipt must read 'partial' with source_asof
    re-stamped to the fallback vintage, never a clean 'success' over stale data."""
    (tmp_path / "manifest.json").write_text(json.dumps(
        {"as_of": "2026-09-04T21:00:00Z",
         "symbols": {"AAPL": {"last": 101.5, "asof": "2026-09-04T21:00:00Z"}}}
    ))
    alert = {"id": "a1", "user_id": "u1", "symbol": "AAPL", "active": True,
              "condition": {"type": "price", "op": "above", "value": 100}}
    fake = _FakeAlertsRest([alert])
    _patch_http(monkeypatch, fake)
    supa = ae.Supa("https://x.example.co", "k")
    data = ae.Data(str(tmp_path), None)  # no live quote primed -> falls back to manifest EOD last

    receipt = ae.run_once(supa, data, datetime(2026, 9, 5, 10, 0, tzinfo=timezone.utc), "r1")

    assert receipt["outcome"] == "partial"
    assert receipt["source_asof"] == "2026-09-04T21:00:00Z"
    assert fake.disarmed == {"a1"}  # the fallback forces 'partial', not a skip


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
