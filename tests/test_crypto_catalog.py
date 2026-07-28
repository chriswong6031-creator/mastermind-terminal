"""Invariants for the expanded crypto universe and its OHLC lane.

The universe went from 24 hand-written pairs to 152 generated ones (see
ingest/gen_crypto_catalog.py). At that size the failure modes stop being typos a reviewer would
catch and become structural, so they are pinned here:

  * a row that cannot chart or cannot price — the exact state the 20 July majors shipped in,
    searchable with a 404 for their OHLC;
  * a blank Chinese name, which renders an EMPTY row label in the zh UI (displayName falls back
    across languages, but not to nothing);
  * the candle remap silently transposing high/low, which draws a plausible-looking wrong chart;
  * crypto tickers crowding equities out of short-prefix search results, the stated reason the
    catalog was kept small in the first place.

Offline only. The network-facing selection rule lives in the generator, which is run by hand.
"""
from __future__ import annotations

import datetime as dt

import pytest

from ingest.macro_catalog import CATALOG, RETIRED, retired_symbols, manifest_rows
from ingest import refresh_crypto_ohlc as rc

CRYPTO = [s for s in CATALOG if s.sec == "Crypto"]


# ── catalog shape ──────────────────────────────────────────────────────────────────────────
def test_crypto_universe_is_substantial():
    """A regression here means the paste from the generator lost rows."""
    assert len(CRYPTO) >= 120, f"only {len(CRYPTO)} crypto rows — did the generated block truncate?"


def test_every_pair_is_a_usd_pair_on_the_crypto_market():
    for s in CRYPTO:
        assert s.sym.endswith("-USD"), f"{s.sym}: hub/lib/coinbase.js only subscribes to -USD rows"
        assert s.mkt == "Crypto", f"{s.sym}: mkt={s.mkt!r} would file it under an equity market"


def test_no_duplicate_symbols():
    syms = [s.sym for s in CATALOG]
    assert len(syms) == len(set(syms)), \
        f"duplicates: {sorted({s for s in syms if syms.count(s) > 1})}"


def test_names_are_present_in_both_languages():
    """A blank zh renders an empty row name in the Chinese UI — English fallback is the floor."""
    for s in CRYPTO:
        assert s.name.strip(), f"{s.sym}: blank English name"
        assert s.zh.strip(), f"{s.sym}: blank Chinese name — fall back to the English name"


def test_majors_survived_the_regeneration():
    """The MAJORS floor in the generator exists so a slow month cannot drop recognizable coins."""
    have = {s.sym for s in CRYPTO}
    for sym in ("BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "DOGE-USD", "ADA-USD", "LINK-USD",
                "LTC-USD", "BCH-USD", "UNI-USD", "ATOM-USD", "AAVE-USD", "XLM-USD", "ARB-USD",
                "OP-USD", "APT-USD", "NEAR-USD", "ALGO-USD", "FIL-USD", "ETC-USD", "SHIB-USD"):
        assert sym in have, f"{sym} fell out of the universe"


def test_the_delisted_matic_row_is_retired_not_merely_absent():
    """Dropping a row from the catalog does NOT remove it from the manifest — the merge is
    additive. RETIRED is the only mechanism that actually deletes one."""
    live = {s.sym for s in CATALOG}
    assert "MATIC-USD" not in live, "Coinbase delisted MATIC — it can never price or chart"
    assert "MATIC-USD" in RETIRED, "an absent row lingers in the live manifest forever"
    assert "MATIC-USD" in retired_symbols()


def test_retired_never_fights_the_live_catalog():
    """A symbol in both lists would be written and then deleted every night."""
    live = {s.sym for s in CATALOG}
    assert not (set(RETIRED) & live), f"listed AND retired: {sorted(set(RETIRED) & live)}"


def test_pol_replaces_matic_so_polygon_is_still_reachable():
    have = {s.sym for s in CRYPTO}
    assert "POL-USD" in have, "the Polygon token migrated MATIC -> POL; the universe must follow"


def test_manifest_rows_carry_the_fields_search_reads():
    rows = manifest_rows()
    for s in CRYPTO:
        row = rows[s.sym]
        # `sec` drives the search Crypto tab (lib/searchCategory.ts CAT_OF) and the crypto
        # market filter (lib/markets.ts marketOf); `col` is the row avatar.
        assert row["sec"] == "Crypto"
        assert row["mkt"] == "Crypto"
        assert row["col"].startswith("#") and len(row["col"]) == 7, f"{s.sym}: col={row['col']!r}"


def test_crypto_tickers_cannot_outrank_equities_on_a_short_prefix():
    """The stated reason the catalog stayed small: "a search for 'A' should not return sixty
    micro-cap tokens ahead of Apple". It cannot, because scoreSymbol penalises ticker length and
    every crypto pair carries a 4-character "-USD" suffix. Mirrors lib/markets.ts scoreSymbol's
    ticker-prefix tier so a change there trips this guard.
    """
    def prefix_score(sym: str, ql: str) -> int:
        return 800 - min(len(sym) - len(ql), 50)

    for s in CRYPTO:
        base = s.sym.split("-")[0]
        if not base[:1].isalpha():
            continue
        ql = base[0].lower()
        # Any equity ticker starting with the same letter is shorter than SYM-USD, so it wins.
        assert prefix_score("AA", ql) > prefix_score(s.sym, ql), \
            f"{s.sym} would outrank a 2-character equity on the query {ql!r}"


# ── the candle remap ───────────────────────────────────────────────────────────────────────
# Coinbase serves [time, low, high, open, close, volume] — NOT the OHLC order the name implies.
def test_candles_remap_to_the_positional_house_contract():
    raw = [[1_785_196_800, 1.0, 4.0, 2.0, 3.0, 100.0]]     # low 1, high 4, open 2, close 3
    bars = rc._to_bars(raw)
    assert len(bars) == 1
    day, o, h, l, c, v = bars[0]
    assert (o, h, l, c) == (2.0, 4.0, 1.0, 3.0), "high/low or open/close transposed"
    assert l <= o <= h and l <= c <= h
    assert v == 100.0
    assert day == dt.datetime.fromtimestamp(1_785_196_800, dt.UTC).strftime("%Y-%m-%d")


def test_bars_come_back_ascending_and_deduped():
    """Pages overlap at their boundaries; two candles for one day must collapse, not duplicate."""
    day = 86_400
    raw = [
        [3 * day, 1, 2, 1, 2, 10],
        [1 * day, 1, 2, 1, 2, 10],
        [2 * day, 1, 2, 1, 2, 10],
        [2 * day, 1, 2, 1, 2, 10],     # duplicate from the next page
    ]
    bars = rc._to_bars(raw)
    dates = [b[0] for b in bars]
    assert dates == sorted(dates), "consumers index bars positionally and assume ascending"
    assert len(dates) == len(set(dates)) == 3


def test_a_candle_with_no_close_is_skipped_not_forward_filled():
    raw = [[86_400, 1, 2, 1, None, 10], [172_800, 1, 2, 1, 2, 10]]
    assert len(rc._to_bars(raw)) == 1


def test_zero_prices_survive_because_a_token_can_genuinely_trade_at_dust():
    """Contrast with the CN/HK equity rule where OHLC=0 means MISSING: a sub-cent token price is
    a real print, so this lane must not apply the equity zero-guard and drop it."""
    raw = [[86_400, 0.0000031, 0.0000042, 0.0000033, 0.0000038, 1e9]]
    bars = rc._to_bars(raw)
    assert len(bars) == 1
    assert bars[0][4] == pytest.approx(0.0000038, rel=1e-6)


# ── the in-progress day ────────────────────────────────────────────────────────────────────
def test_the_current_utc_day_is_never_stored():
    """Crypto never closes, so today's candle is partial. append_recent_bars only adds dates
    strictly newer than the last stored bar, so a partial bar written tonight would be that
    day's bar forever — and the nightly runs ~01:30 UTC, i.e. 90 minutes in."""
    today = dt.date(2026, 7, 28)
    bars = [["2026-07-26", 1, 2, 1, 2, 5], ["2026-07-27", 1, 2, 1, 2, 5], ["2026-07-28", 1, 2, 1, 2, 5]]
    kept = rc.drop_incomplete(bars, today)
    assert [b[0] for b in kept] == ["2026-07-26", "2026-07-27"]


def test_dropping_the_current_day_leaves_completed_history_intact():
    today = dt.date(2026, 7, 28)
    bars = [["2026-07-26", 1, 2, 1, 2, 5]]
    assert rc.drop_incomplete(bars, today) == bars


# ── manifest selection ─────────────────────────────────────────────────────────────────────
def test_crypto_symbols_reads_the_same_sec_field_the_ui_categorises_by(tmp_path):
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        '{"symbols": {"BTC-USD": {"sec": "Crypto"}, "AAPL": {"sec": "Equities"},'
        ' "SPY": {"sec": "Funds"}, "ODD-USD": {}}}'
    )
    assert rc.crypto_symbols(manifest) == ["BTC-USD"]
