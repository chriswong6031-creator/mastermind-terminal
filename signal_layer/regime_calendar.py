"""Static macro-regime reference calendar (1970–2027) for the seasonal-outlook engine.

This is the ONE curated-knowledge layer. Each US calendar year is tagged with:

  * cycle_pos   — US presidential-cycle position, DERIVED (not curated) from year % 4
                  with 2024 = election:  0=election, 1=post_election, 2=midterm, 3=pre_election.
  * recession   — NBER recession overlapped this calendar year (peak-trough). This list is
                  factual/verifiable (14 years) and was red-team-confirmed against NBER.
  * rate_dir    — Fed-funds DIRECTION over the year: "hiking" | "holding" | "cutting" | "whipsaw".
                  We DELIBERATELY do NOT encode an absolute high/low level: it is era-relative
                  (9% was "normal" in 1985, "restrictive" now) and adds free parameters on a
                  tiny sample. Direction is the part that actually co-moves with risk-asset
                  seasonality. "whipsaw" = a genuine mid-year pivot (both directions) — its
                  single annual label is lossy, so the engine SOFT-matches whipsaw years.
  * flags       — anomaly buckets that skew a year's price path away from "normal" seasonality:
                  crisis, war_oil_shock, mania_bubble, covid, high_inflation. Used for the
                  exception filter: a flagged year is dropped from a stock's analog set UNLESS
                  the current year carries the same flag.

HONESTY: `rate_dir` and `flags` are a human judgment layer; the recession/cycle columns are
factual. Years 2025–2027 are PROVISIONAL (the current year is not over; its label is an as-of
estimate, and — unlike the completed analog years, which carry full-year hindsight — it will be
revised). The engine surfaces that asymmetry rather than hiding it.

REGIME_TABLE_VERSION bumps whenever a tag changes (so a downstream artifact hash changes too).
"""
from __future__ import annotations

from dataclasses import dataclass, field

REGIME_TABLE_VERSION = "1.1.0"

# The election-year anchor: 2024 was a US presidential election. cycle_pos is pure arithmetic.
_ELECTION_MOD = 0  # year % 4 == 0 → election (…2016, 2020, 2024, 2028)
_CYCLE_NAME = {0: "election", 1: "post_election", 2: "midterm", 3: "pre_election"}


def cycle_pos(year: int) -> str:
    """Presidential-cycle position — derived, never curated."""
    return _CYCLE_NAME[year % 4]


def is_midterm(year: int) -> bool:
    return year % 4 == 2


def is_election(year: int) -> bool:
    return year % 4 == 0


# NBER recessions that overlap each calendar year (peak→trough). Factual, 14 years.
RECESSION_YEARS = frozenset({1970, 1973, 1974, 1975, 1980, 1981, 1982,
                             1990, 1991, 2001, 2007, 2008, 2009, 2020})

# Fed-funds annual DIRECTION. Curated from Fed-funds history; whipsaw = genuine mid-year pivot.
# Red-team fixes applied: 1980/1981/1989/1995/2019/2024 tagged whipsaw (mid-year pivots), not a
# clean hold. 2025–2027 provisional.
RATE_DIR: dict[int, str] = {
    1970: "cutting", 1971: "cutting", 1972: "holding", 1973: "hiking", 1974: "whipsaw",
    1975: "cutting", 1976: "holding", 1977: "hiking", 1978: "hiking", 1979: "hiking",
    1980: "whipsaw", 1981: "whipsaw", 1982: "cutting", 1983: "holding", 1984: "whipsaw",
    1985: "cutting", 1986: "cutting", 1987: "hiking", 1988: "hiking", 1989: "whipsaw",
    1990: "cutting", 1991: "cutting", 1992: "cutting", 1993: "holding", 1994: "hiking",
    1995: "whipsaw", 1996: "holding", 1997: "holding", 1998: "cutting", 1999: "hiking",
    2000: "hiking", 2001: "cutting", 2002: "cutting", 2003: "cutting", 2004: "hiking",
    2005: "hiking", 2006: "hiking", 2007: "cutting", 2008: "cutting", 2009: "holding",
    2010: "holding", 2011: "holding", 2012: "holding", 2013: "holding", 2014: "holding",
    2015: "holding", 2016: "hiking", 2017: "hiking", 2018: "hiking", 2019: "whipsaw",
    2020: "cutting", 2021: "holding", 2022: "hiking", 2023: "hiking", 2024: "whipsaw",
    2025: "cutting", 2026: "holding", 2027: "holding",
}

# Anomaly flags per year (empty = "normal"). Kept deliberately sparse.
FLAGS: dict[int, set[str]] = {
    1973: {"war_oil_shock", "high_inflation"},
    1974: {"war_oil_shock", "high_inflation", "crisis"},
    1975: {"high_inflation"},
    1979: {"war_oil_shock", "high_inflation"},
    1980: {"war_oil_shock", "high_inflation"},
    1981: {"high_inflation"},
    1987: {"crisis"},                       # Black Monday
    1990: {"war_oil_shock"},                # Gulf War
    1998: {"crisis"},                       # LTCM / Asia-Russia
    1999: {"mania_bubble"},
    2000: {"mania_bubble"},
    2001: {"crisis"},                       # dot-com bust
    2008: {"crisis"},                       # GFC
    2020: {"covid", "crisis"},
    2021: {"covid", "mania_bubble", "high_inflation"},
    2022: {"high_inflation"},
    2023: {"high_inflation"},
}

# Years whose regime label is a partial-year AS-OF estimate (not full-year hindsight).
PROVISIONAL_YEARS = frozenset({2025, 2026, 2027})

FIRST_YEAR, LAST_YEAR = 1970, 2027


@dataclass(frozen=True)
class RegimeYear:
    year: int
    cycle_pos: str
    is_recession: bool
    rate_dir: str
    whipsaw: bool
    flags: frozenset = field(default_factory=frozenset)
    provisional: bool = False

    def as_dict(self) -> dict:
        return {
            "year": self.year,
            "cycle_pos": self.cycle_pos,
            "is_recession": self.is_recession,
            "rate_dir": self.rate_dir,
            "whipsaw": self.whipsaw,
            "flags": sorted(self.flags),
            "provisional": self.provisional,
        }


def regime(year: int) -> RegimeYear:
    """Full regime record for a year. Years outside the table degrade to derived-only tags."""
    rate = RATE_DIR.get(year, "unknown")
    return RegimeYear(
        year=year,
        cycle_pos=cycle_pos(year),
        is_recession=year in RECESSION_YEARS,
        rate_dir=rate,
        whipsaw=(rate == "whipsaw"),
        flags=frozenset(FLAGS.get(year, set())),
        provisional=year in PROVISIONAL_YEARS,
    )


def anomaly_flags(year: int) -> frozenset:
    """Every 'this year is not a normal seasonal template' bucket, incl. recession."""
    f = set(FLAGS.get(year, set()))
    if year in RECESSION_YEARS:
        f.add("recession")
    return frozenset(f)


# ── rate-direction affinity (monotone; the ONLY rate knob) ────────────────────
# Map direction to a scalar ease/tighten axis, then affinity = 1 - |Δ|/2 ∈ [0,1].
# whipsaw sits at 0 (ambiguous) AND is soft-capped by the engine (its annual label is lossy).
_RATE_SCALAR = {"hiking": 1.0, "holding": 0.0, "whipsaw": 0.0, "cutting": -1.0, "unknown": 0.0}


def rate_affinity(a: str, b: str) -> float:
    """Similarity of two rate directions in [0,1]. Direction-only, no free matrix."""
    return max(0.0, 1.0 - abs(_RATE_SCALAR.get(a, 0.0) - _RATE_SCALAR.get(b, 0.0)) / 2.0)


def all_years() -> list[int]:
    return list(range(FIRST_YEAR, LAST_YEAR + 1))
