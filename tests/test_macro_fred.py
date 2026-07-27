"""The FRED daily-series leg: catalog wiring + CSV→bars parse + nightly-safe manifest merge.

No network. The parse tests feed the exact bytes fredgraph.csv returns — the current
``observation_date`` header, the legacy ``DATE`` header, "." holes on holidays — so the shape
is pinned without a live fetch, and main() runs against a stubbed fetch in a tmp dir.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

import ingest.fetch_fred_daily as fred
from ingest.macro_catalog import duplicates, fred_symbols, manifest_rows, yahoo_symbols

FRED_SYMS = {"DFII10", "DFII5", "T10YIE", "T5YIE"}

ROOT = Path(__file__).resolve().parents[1]
# The two runtime routers that must know these symbols have no live leg. Both declare the set
# with the same JS/TS syntax, so one pattern reads both.
ROUTERS = [
    ROOT / "terminal" / "lib" / "macroSymbols.ts",   # fetchQuotes / fetchIntraday
    ROOT / "hub" / "lib" / "quotes.js",              # /quotes demand pass + response
]
_DAILY_ONLY_RE = re.compile(r"DAILY_ONLY\s*=\s*new Set\(\[([^\]]*)\]\)")


def _router_daily_only(path: Path) -> set[str]:
    """The DAILY_ONLY set a router declares.

    Raises rather than returning an empty set when the declaration is renamed or moved: a drift
    guard that quietly matches nothing passes forever while guarding nothing.
    """
    assert path.exists(), f"{path} is missing — the router this guard protects is gone"
    m = _DAILY_ONLY_RE.search(path.read_text())
    assert m, f"no `DAILY_ONLY = new Set([...])` in {path} — update this guard, do not delete it"
    syms = set(re.findall(r'"([^"]+)"', m.group(1)))
    assert syms, f"DAILY_ONLY in {path} parsed as empty"
    return syms


# ── catalog ────────────────────────────────────────────────────────────────────────────────
def test_catalog_has_no_duplicates():
    assert duplicates() == []


def test_fred_symbols_is_exactly_the_fred_section():
    assert set(fred_symbols()) == FRED_SYMS


def test_fred_symbols_never_reach_the_yahoo_leg():
    # yahoo_symbols() selects by SHAPE (^ prefix, =F/=X suffix, DX-Y.NYB). A bare FRED series id
    # matches none of them, so the Yahoo builder must not try to price DFII10 — it would 404 on
    # every symbol every night and quietly log a failed batch.
    assert not FRED_SYMS & set(yahoo_symbols())


@pytest.mark.parametrize("router", ROUTERS, ids=lambda p: p.name)
def test_every_fred_series_is_declared_daily_only_in_both_routers(router):
    """A FRED series added here but not to a router gets a FABRICATED freshness claim.

    Bare series ids match no macro shape and no classify() branch, so the fallthrough is "us":
    the hub polygon-subscribes AM.<SYM> (one of 500 shared LRU slots on a ticker Polygon does
    not carry), burns one of the 30 shared ext slots, and serves a manifest placeholder stamped
    source "polygon-delayed" / basis DELAYED_15M / ts:now — 15-minute freshness on a number
    published once a day — which the chart then splices in as a flat bar dated today.

    Nothing about the catalog entry makes that visible, and nothing at runtime cross-checks the
    two hand-maintained sets. This is that cross-check.
    """
    assert _router_daily_only(router) == set(fred_symbols())


def test_the_two_routers_agree_with_each_other():
    ts, js = (_router_daily_only(p) for p in ROUTERS)
    assert ts == js, "terminal and hub must route the same symbols to nothing"


def test_fred_rows_are_bilingual_bonds_rows():
    rows = manifest_rows()
    for sym in FRED_SYMS:
        row = rows[sym]
        assert row["sec"] == "Bonds", sym       # quoted in percent — never beside a price index
        assert row["mkt"] == "US", sym
        assert row["name"] and row["zh"], sym   # the UI is bilingual; a blank zh leaks English
        assert row["zh"] != row["name"], sym
        assert row["col"].startswith("#"), sym


# ── CSV parse ──────────────────────────────────────────────────────────────────────────────
CURRENT = "observation_date,DFII10\n2026-07-20,1.85\n2026-07-21,.\n2026-07-22,1.9\n"
LEGACY = "DATE,DFII10\n2026-07-20,1.85\n2026-07-22,1.9\n"


def test_parse_skips_current_header_and_drops_missing_prints():
    bars = fred.parse_csv(CURRENT)
    # the "." holiday row is dropped, not forward-filled as a real flat print
    assert [b[0] for b in bars] == ["2026-07-20", "2026-07-22"]
    assert [b[4] for b in bars] == [1.85, 1.9]


def test_parse_drops_the_empty_value_holiday_row_fredgraph_actually_sends():
    # The live graph endpoint does NOT write "." — it leaves the field empty. A 10y DFII10 pull
    # carries 110 of these (US market holidays); parsing them as 0.0 would print a 0% real yield
    # on Thanksgiving.
    text = "observation_date,DFII10\n2016-09-02,0.05\n2016-09-05,\n2016-09-06,0.06\n"
    assert [b[0] for b in fred.parse_csv(text)] == ["2016-09-02", "2016-09-06"]


def test_parse_accepts_the_legacy_date_header():
    assert [b[0] for b in fred.parse_csv(LEGACY)] == ["2026-07-20", "2026-07-22"]


def test_parse_writes_flat_bars_with_zero_volume():
    # one number a day: o=h=l=c so the candles collapse to a line and no range is invented
    for bar in fred.parse_csv(CURRENT):
        assert bar[1] == bar[2] == bar[3] == bar[4]
        assert bar[5] == 0
        assert len(bar) == 6                    # positional shape ChartPanel indexes b[0]..b[5]


def test_parse_tolerates_bom_blanks_and_a_trailing_footer():
    text = "\ufeffobservation_date,DFII10\n\n2026-07-20,1.85\n\nSource: FRED\n"
    assert [b[0] for b in fred.parse_csv(text)] == ["2026-07-20"]


def test_parse_sorts_ascending_and_dedupes_by_date():
    text = "observation_date,X\n2026-07-22,2.0\n2026-07-20,1.0\n2026-07-22,2.5\n"
    bars = fred.parse_csv(text)
    assert [b[0] for b in bars] == ["2026-07-20", "2026-07-22"]
    assert bars[-1][4] == 2.5                   # the later row for a repeated date wins


def test_parse_empty_and_header_only():
    assert fred.parse_csv("") == []
    assert fred.parse_csv("observation_date,DFII10\n") == []


def test_parse_drops_unparseable_values_without_raising():
    assert fred.parse_csv("observation_date,X\n2026-07-20,n/a\n2026-07-21,1.5\n")[0][0] == "2026-07-21"


# ── document + summary ─────────────────────────────────────────────────────────────────────
def test_doc_envelope_matches_the_house_ohlc_shape():
    doc = fred.doc_for("DFII10", fred.parse_csv(CURRENT))
    assert doc["t"] == "DFII10" and doc["o"] == 1 and doc["src"] == "fred"
    # NOT "real_ohlc": golden_gate.py reads that as "intrabar highs/lows are genuine", which a
    # single daily print cannot honour.
    assert doc["bar_quality"] == "single_value_daily"
    assert isinstance(doc["bars"][0], list)


def test_summary_is_last_value_and_percent_change():
    s = fred.summary(fred.parse_csv(CURRENT))
    assert s["last"] == 1.9
    assert s["chg"] == round((1.9 - 1.85) / 1.85 * 100, 4)


def test_summary_null_change_on_a_single_bar():
    assert fred.summary([["2026-07-20", 1.85, 1.85, 1.85, 1.85, 0]])["chg"] is None


def test_summary_empty_series():
    assert fred.summary([]) == {}


def test_user_agent_is_not_a_forged_browser():
    # FRED's WAF swallows "Mozilla/5.0 …": TLS completes, the request is sent, and the read
    # hangs to timeout with zero bytes. Copying build_macro_symbols.py's UA here breaks the leg.
    assert "Mozilla" not in fred.UA["User-Agent"]


# ── main(): writes, merges, survives partial failure ───────────────────────────────────────
def _csv(sym: str, n: int = 40, base: float = 1.5) -> str:
    import datetime as dt
    d0 = dt.date(2026, 5, 1)
    rows = [f"{d0 + dt.timedelta(days=i)},{base + i * 0.01:.2f}" for i in range(n)]
    return f"observation_date,{sym}\n" + "\n".join(rows) + "\n"


def _run(monkeypatch, tmp_path, argv_extra, fetch=None, env=None):
    monkeypatch.delenv("TERMINAL_MANIFEST", raising=False)
    monkeypatch.delenv("TERMINAL_DATA_DIR", raising=False)
    for k, v in (env or {}).items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(fred.time, "sleep", lambda *_: None)
    monkeypatch.setattr(fred, "fetch_csv", fetch or (lambda sym, start, timeout=30: _csv(sym)))
    monkeypatch.setattr(sys, "argv", ["fetch_fred_daily.py", "--out", str(tmp_path), *argv_extra])
    return fred.main()


def test_main_writes_a_file_per_series_and_merges_rows(monkeypatch, tmp_path):
    man = tmp_path / "manifest.json"
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)]) == 0
    symbols = json.loads(man.read_text())["symbols"]
    for sym in FRED_SYMS:
        doc = json.loads((tmp_path / f"{sym}.json").read_text())
        assert doc["t"] == sym and len(doc["bars"]) == 40
        assert symbols[sym]["sec"] == "Bonds"
        assert symbols[sym]["last"] == doc["bars"][-1][4]
        assert symbols[sym]["chg"] is not None


def test_main_writes_rows_to_the_staging_manifest_env(monkeypatch, tmp_path):
    # The nightly builds a STAGING manifest and swaps it over live at the very end. Writing to
    # $TERMINAL_MANIFEST is exactly what makes these rows survive that swap.
    stage = tmp_path / "manifest.staging.json"
    assert _run(monkeypatch, tmp_path, [], env={"TERMINAL_MANIFEST": str(stage)}) == 0
    assert set(json.loads(stage.read_text())["symbols"]) == FRED_SYMS
    assert not (tmp_path / "manifest.json").exists()   # live manifest untouched mid-run


def test_main_never_touches_foreign_rows_and_keeps_foreign_keys(monkeypatch, tmp_path):
    man = tmp_path / "manifest.json"
    man.write_text(json.dumps({"symbols": {
        "AAPL": {"name": "Apple Inc.", "last": 250.0, "verdict": "BUY"},
        "DFII10": {"name": "stale", "last": 0.01, "hi52": 2.4},
    }}))
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)]) == 0
    symbols = json.loads(man.read_text())["symbols"]
    assert symbols["AAPL"] == {"name": "Apple Inc.", "last": 250.0, "verdict": "BUY"}
    # our keys refresh (existing-wins would freeze last/chg at the first run's value)…
    assert symbols["DFII10"]["name"] == "US 10-Year Real Yield (TIPS)"
    assert symbols["DFII10"]["last"] != 0.01
    # …while a key another writer owns survives
    assert symbols["DFII10"]["hi52"] == 2.4


def test_main_is_idempotent(monkeypatch, tmp_path):
    man = tmp_path / "manifest.json"
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)]) == 0
    first = man.read_text(), (tmp_path / "DFII10.json").read_text()
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)]) == 0
    assert (man.read_text(), (tmp_path / "DFII10.json").read_text()) == first


def test_main_survives_a_single_failed_series(monkeypatch, tmp_path):
    def flaky(sym, start, timeout=30):
        if sym == "T5YIE":
            raise TimeoutError("read timed out")
        return _csv(sym)

    man = tmp_path / "manifest.json"
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)], fetch=flaky) == 0   # nightly proceeds
    assert not (tmp_path / "T5YIE.json").exists()
    row = json.loads(man.read_text())["symbols"]["T5YIE"]
    assert row["sec"] == "Bonds" and "last" not in row   # searchable, no fabricated price


def test_main_returns_nonzero_only_when_every_series_failed(monkeypatch, tmp_path):
    def dead(sym, start, timeout=30):
        raise TimeoutError("read timed out")

    man = tmp_path / "manifest.json"
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man)], fetch=dead) == 1
    assert set(json.loads(man.read_text())["symbols"]) == FRED_SYMS   # rows still merged


def test_main_skips_a_series_too_short_to_chart(monkeypatch, tmp_path):
    man = tmp_path / "manifest.json"
    rc = _run(monkeypatch, tmp_path, ["--manifest", str(man)],
              fetch=lambda sym, start, timeout=30: _csv(sym, n=5))
    assert rc == 1                                        # every series short = every series failed
    assert not (tmp_path / "DFII10.json").exists()        # a stub never replaces a real file


def test_main_no_bars_does_not_touch_the_network(monkeypatch, tmp_path):
    def explode(sym, start, timeout=30):
        raise AssertionError("--no-bars must not fetch")

    man = tmp_path / "manifest.json"
    assert _run(monkeypatch, tmp_path, ["--manifest", str(man), "--no-bars"], fetch=explode) == 0
    assert set(json.loads(man.read_text())["symbols"]) == FRED_SYMS
