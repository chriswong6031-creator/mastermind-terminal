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


def _patch_http(monkeypatch, fake: _FakeRest):
    def fake_status(url, headers=None, method="GET", body=None, timeout=15):
        if method == "POST":
            return fake.post(url, body)
        if method == "PATCH":
            return fake.patch(url, body)
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
