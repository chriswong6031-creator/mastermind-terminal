"""MACRO_TZ ↔ _INDICES cross-language sync guard.

terminal/lib/macroSymbols.ts carries a hand-kept MACRO_TZ map — symbol → home IANA timezone
for every macro symbol whose market does not run on US Eastern wall clock. The intraday
chart stamps each bar with its market-local wall-clock reading ("display epoch"), so an
international index added to _INDICES in ingest/macro_catalog.py WITHOUT a MACRO_TZ entry
silently renders its session on ET: the Nikkei plots as 20:00–02:00 and Day Trade Mode
paints US RTH bands over Tokyo hours — the exact bug class #221 fixed.

Until now the sync was enforced only by comments in both files plus a longhand list in
terminal/lib/__tests__/macroSymbols.test.ts. This is the mechanical cross-check, in the
same shape as the DAILY_ONLY guard in test_macro_fred.py: import the Python catalog,
regex-parse the TS literal, and fail CI the moment either side drifts.
"""
from __future__ import annotations

import re
import zoneinfo
from pathlib import Path

from ingest.macro_catalog import _INDICES, yahoo_symbols

ROOT = Path(__file__).resolve().parents[1]
MACRO_SYMBOLS_TS = ROOT / "terminal" / "lib" / "macroSymbols.ts"

# Markets whose cash session runs on US Eastern wall clock, where macroDisplayTz()'s ET
# default is already correct: US venues, and Toronto (^GSPTSE trades 09:30–16:00 Eastern).
ET_WALL_CLOCK_MKTS = {"US", "TSX"}
ET_TZ = "America/New_York"

_MACRO_TZ_RE = re.compile(r"MACRO_TZ\s*:[^=]*=\s*\{([^}]*)\}")


def _ts_macro_tz() -> dict[str, str]:
    """The MACRO_TZ literal the terminal router declares.

    Raises rather than returning an empty map when the declaration is renamed or moved: a
    drift guard that quietly matches nothing passes forever while guarding nothing.
    """
    assert MACRO_SYMBOLS_TS.exists(), f"{MACRO_SYMBOLS_TS} is missing — the router this guard protects is gone"
    m = _MACRO_TZ_RE.search(MACRO_SYMBOLS_TS.read_text())
    assert m, f"no `MACRO_TZ … = {{…}}` literal in {MACRO_SYMBOLS_TS} — update this guard, do not delete it"
    tz = dict(re.findall(r'"([^"]+)"\s*:\s*"([^"]+)"', m.group(1)))
    assert tz, f"MACRO_TZ in {MACRO_SYMBOLS_TS} parsed as empty"
    return tz


def _non_et_yahoo_indices() -> set[str]:
    """The _INDICES rows that reach macroDisplayTz() and are NOT on ET wall clock.

    The mainland-China codes (000001.SS, 399001.SZ, …) are non-ET but deliberately EXEMPT:
    they match none of the Yahoo-leg symbol shapes (no ^ prefix, no =F/=X suffix), so
    isMacroSymbol() is false, macroDisplayTz() is never consulted, and their intraday chart
    rides the pre-existing Tencent A-share path, whose session clock is China's by
    construction. yahoo_symbols() mirrors isMacroSymbol()'s shape rule, so the exemption is
    derived from the same routing rule the runtime applies — not from a hand-kept suffix
    list that could drift on its own.
    """
    on_yahoo_leg = set(yahoo_symbols())
    return {s.sym for s in _INDICES if s.mkt not in ET_WALL_CLOCK_MKTS and s.sym in on_yahoo_leg}


def test_every_non_et_index_has_a_home_timezone():
    """Catalog → TS: a row added without a MACRO_TZ entry ships an ET axis under a foreign session."""
    expected = _non_et_yahoo_indices()
    assert expected, "no non-ET Yahoo-leg indices parsed from _INDICES — this guard has gone vacuous"
    missing = expected - set(_ts_macro_tz())
    assert not missing, (
        f"{sorted(missing)} are in _INDICES on a non-ET market but have no MACRO_TZ entry in "
        f"{MACRO_SYMBOLS_TS} — their intraday charts will silently render on US Eastern time. "
        f'Add \'"<sym>": "<Area/City>"\' for each.'
    )


def test_no_macro_tz_entry_is_orphaned():
    """TS → catalog: a key with no backing catalog row is dead weight that masks real drift.

    Also intentionally rejects entries for ET-wall-clock rows (e.g. ^GSPTSE): the map exists
    to OVERRIDE the ET default, and an entry that restates the default contradicts the
    documented design in both files. A deliberate change to that design updates this guard.
    """
    orphaned = set(_ts_macro_tz()) - _non_et_yahoo_indices()
    assert not orphaned, (
        f"MACRO_TZ keys {sorted(orphaned)} match no non-ET Yahoo-leg row in _INDICES — "
        f"remove the stale entries from {MACRO_SYMBOLS_TS} (or fix the catalog row they "
        f"were meant to cover)."
    )


def test_exempt_rows_are_exactly_the_tencent_china_codes():
    """Pin the exemption: skipping non-Yahoo-leg rows must skip ONLY the mainland .SS/.SZ codes.

    If a non-ET index ever lands in _INDICES with a shape the Yahoo leg does not match and a
    symbol that is not a Tencent sh/sz code, it routes to no intraday leg at all — that is a
    catalog bug, not a timezone exemption, and it must not slide through this guard silently.
    """
    skipped = {s.sym for s in _INDICES if s.mkt not in ET_WALL_CLOCK_MKTS} - _non_et_yahoo_indices()
    not_china = {sym for sym in skipped if not sym.endswith((".SS", ".SZ"))}
    assert not not_china, (
        f"{sorted(not_china)} are non-ET _INDICES rows outside the Yahoo macro leg that are "
        f"not Tencent .SS/.SZ codes — they would route to no intraday source. Fix the symbol "
        f"or extend this guard consciously."
    )


def test_macro_tz_values_are_real_iana_zones():
    for sym, tz in _ts_macro_tz().items():
        try:
            zoneinfo.ZoneInfo(tz)
        except zoneinfo.ZoneInfoNotFoundError:
            raise AssertionError(
                f'MACRO_TZ["{sym}"] = "{tz}" is not a real IANA zone — a typo here throws a '
                f"RangeError in Intl at render time."
            ) from None
        assert tz != ET_TZ, (
            f'MACRO_TZ["{sym}"] restates the ET default — the map only carries overrides; '
            f"remove the entry."
        )
