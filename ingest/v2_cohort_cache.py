"""Sector-cohort cache for GC v2 — built ONCE per nightly ingest run, persisted to disk.

The v2 recipe (``confluence_v2.recipe_score_on_3d``) needs, per symbol:
  * ``sector_basket``      — equal-weight index level of the symbol's sector peers,
  * ``panel_basket``       — equal-weight index of the whole universe (RS-both-falling veto),
  * ``cohort_frac_daily``  — daily fraction of sector peers in a 2W-StochRSI-oversold state
                             (the washout leg, fires at >= 0.40).

Computing these per symbol would be O(n²) (each name re-reads every peer). Instead this
module resolves each symbol's GICS sector, loads every ``<SYM>.json`` close ONCE, builds the
baskets and the per-sector cohort fractions a SINGLE time, and hands the ingest layer O(1)
per-symbol lookups. The math is the disclosed D5 adaptation ported from ``e_factors``
(equal-weight peer basket; no SPDR/SPY series in the terminal feed).

Sector resolution order (per symbol):
  1. ``<SYM>.fund.json`` ``profile.sector`` in ``data_dir`` — 5,260 files on prod carry this.
  2. Macro-repo ``industry_map.json`` (path: ``$MACRO_REPO/data/sp500_heatmap/industry_map.json``)
     ``[SYM]["sector"]`` — S&P 500 fallback (503 entries; catches any flagship not yet in fund.json).
  3. None found → symbol scores ``score_basis:"partial"`` (cohort legs 0, spec contract).

A symbol with no resolved sector, or whose sector has fewer than 5 peers with data, gets
``cohort=None``/``basket=None`` from the lookup — ``build_v2`` then scores the
cohort-dependent legs as 0 and records ``score_basis:"partial"`` (the spec contract).

Design notes:
  * Built from the SAME ``<SYM>.json`` deep closes the slices run on (chart-parity).
  * Weekly/2W math is the study's (factors.py) 2W-StochRSI, ported here so the cache has no
    cross-repo import; identical to ``e_factors._factors_2w_oversold_daily``.
  * Everything is close-only-safe (CN/HK names with only closes still contribute to and
    read from the cohort).

Memory design (SINGLE-PASS STREAMING — never holds all symbols' series at once):
  * The prod box is 1.9 GB; retaining ~5,384 full daily close series OOM-killed the v1 build.
  * Each ``<SYM>.json`` is loaded ONCE, folded into slot-indexed per-sector/panel
    accumulators, then dropped before the next file is opened. The union daily index is NOT
    pre-computed with a second disk pass: date→slot assignments grow as new dates are first
    seen (the union emerges from the slot-map keys) and everything is re-sorted into date
    order once, at finalize. Peak additional RSS stays well under ~300 MB for the full
    ~8,700-symbol universe (dominated by the single largest per-symbol Series plus a ~16k
    date→slot dict, not the symbol count).
  * The cohort's reindex+ffill-onto-union semantics survive the single pass exactly: a
    symbol's ffilled 0/1 oversold contribution is a step function, so it is recorded as
    ±1 DELTAS at its own bar dates (value at first bar; change at each flip; membership +1
    at first bar) and recovered with a cumulative sum over the date-sorted union. All
    quantities are integer-valued float64, so the recovered sums are bit-identical to the
    two-pass ``reindex(union, ffill)`` accumulation this replaces.
  * The public API is unchanged: ``build_cohort_cache(data_dir, manifest, macro_repo=None)``
    and ``CohortCache.for_symbol(sym) -> (sector_basket, panel_basket, cohort_frac_daily)``,
    with the same pandas Series shapes and the same numbers the two-pass build produced.

Persistence (build once per NIGHT, not once per consumer):
  * The nightly cron (``terminal-data``) runs build_polygon_universe.py and later
    gen_slices_all.py — each used to rebuild this cache from scratch (~24 min each on the
    1.9 GB box). The finished cache is now persisted to
    ``<data_dir>/_cache/v2_cohort_cache.json`` (atomic tmp+rename; a subdirectory so no
    top-level ``*.json`` glob ever mistakes it for a symbol OHLC file).
  * ``build_cohort_cache`` first tries the persisted file and reuses it when it is fresh
    (< ``V2_COHORT_MAX_AGE_H`` hours old, default 20 — yesterday's 21:30 UTC build is ~24 h
    old at tonight's cron, so the FIRST nightly consumer always rebuilds from the current
    on-disk data and every later consumer that night loads in seconds).
  * JSON round-trips float64 exactly (repr shortest-round-trip), and the DatetimeIndex is
    stored as int64 ticks PLUS its resolution unit so a [us] index is NOT silently
    reinterpreted as [ns] on load. No new dependencies (pyarrow not required).
  * Set ``V2_COHORT_REBUILD=1`` to bypass the persisted file and force a fresh build.
  * An empty build (no data files) is returned but never persisted.

Accumulator semantics (must match the v1 concat-based build exactly):
  * BASKET (sector + panel): equal-weight mean of per-symbol closes normalized to 1.0 at each
    symbol's first bar. A symbol contributes to a date only where it has a REAL bar on that
    date (no ffill) — reproducing v1's ``pd.concat(axis=1).mean(axis=1)`` (NaN-skipping mean).
    Index = union of member dates.
  * COHORT (per sector): daily fraction of peers 2W-oversold. Each symbol's daily-oversold
    boolean is reindexed onto the panel union index WITH ffill (matching v1's
    ``concat(...).reindex(union_daily).ffill()``): it counts at every union date >= its first
    bar, ffilled forward past its last bar. ``frac = sum / count`` where ``count >= 5`` else NaN.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from signal_layer import confluence_v2 as V2

COHORT_MIN_PEERS = 5
COHORT_WASHOUT_FRAC = 0.40

CACHE_VERSION = 1
CACHE_SUBDIR = "_cache"
CACHE_FILENAME = "v2_cohort_cache.json"
CACHE_MAX_AGE_H = 20.0   # < one nightly cadence: tonight's first consumer always rebuilds

# ── sector resolution helpers ────────────────────────────────────────────────

def _load_industry_map(macro_repo: str | None = None) -> dict:
    """Load $MACRO_REPO/data/sp500_heatmap/industry_map.json.

    Returns an empty dict (not an error) when the path is absent — the fund.json
    source alone is still used for the 5,260 symbols that have it.
    """
    root = macro_repo or os.environ.get("MACRO_REPO", "")
    if not root:
        return {}
    p = Path(root) / "data" / "sp500_heatmap" / "industry_map.json"
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def _fund_sector(data_dir: Path, sym: str) -> str | None:
    """Read profile.sector from <SYM>.fund.json; return None on any miss."""
    try:
        d = json.loads((data_dir / f"{sym}.fund.json").read_text())
        return (d.get("profile") or {}).get("sector") or None
    except Exception:
        return None


def _sector_for(data_dir: Path, stem: str, industry_map: dict) -> str | None:
    """Resolve one symbol's GICS sector: fund.json profile.sector → industry_map → None."""
    sec = _fund_sector(data_dir, stem)
    if sec:
        return sec
    entry = industry_map.get(stem)
    if isinstance(entry, dict):
        return entry.get("sector") or None
    return None


def _resolve_sectors(data_dir: Path, syms: list[str],
                     industry_map: dict) -> dict[str, str]:
    """Return {SYM: sector_string} for every symbol that has one.

    Resolution order: fund.json profile.sector → industry_map → skip.
    Single-pass over fund.json files; O(1) industry_map dict lookup.
    """
    sector_of: dict[str, str] = {}
    for sym in syms:
        sec = _sector_for(data_dir, sym, industry_map)
        if sec:
            sector_of[sym] = sec
    return sector_of


def _closes_from_json(path: Path) -> pd.Series | None:
    try:
        d = json.loads(path.read_text())
        bars = d.get("bars") or []
        if len(bars) < 60:
            return None
        idx = pd.to_datetime([b[0] for b in bars])
        return pd.Series([float(b[4]) for b in bars], index=idx, name=path.stem)
    except Exception:
        return None


def _2w_oversold_daily(close: pd.Series) -> pd.Series:
    """factors two_week_stoch_oversold_daily (VERBATIM): 2W StochRSI min(k,d) < 20, ffilled
    to daily. Close-only (the study primitive only needs the 2W close bar)."""
    two_w, _ = V2._f_tf_bars(
        pd.DataFrame({"close": close, "high": close, "low": close, "volume": np.nan}),
        "2W-FRI")
    if two_w.empty or two_w["close"].dropna().empty:
        return pd.Series(False, index=close.index)
    s = V2._f_stoch_rsi(two_w["close"])
    os = (s[["k", "d"]].min(axis=1) < 20.0)
    return os.reindex(close.index, method="ffill").fillna(False).astype(bool)


# ── streaming data-file iterator ─────────────────────────────────────────────

def _iter_data_files(data_dir: Path):
    """Yield the <SYM>.json paths that carry OHLC (skips manifest/staging/derived files).

    Sorted for a deterministic accumulation order (bit-stable float sums run-to-run).
    Non-recursive: the persisted cache under ``_cache/`` is never yielded.
    """
    for jf in sorted(Path(data_dir).glob("*.json")):
        nm = jf.name
        if nm == "manifest.json" or "staging" in nm or nm.endswith(
                (".slice.json", ".intel.json", ".backtest.json")):
            continue
        yield jf


class CohortCache:
    """Built once; ``for_symbol(sym)`` returns the (sector_basket, panel_basket,
    cohort_frac_daily) triple for one symbol (any of the first/third may be None)."""

    def __init__(self, baskets: dict, panel_basket: pd.Series,
                 cohort_frac: dict, sector_of: dict):
        self._baskets = baskets
        self._panel = panel_basket
        self._cohort = cohort_frac
        self._sector_of = sector_of

    def for_symbol(self, sym: str):
        sec = self._sector_of.get(sym.upper())
        basket = self._baskets.get(sec) if sec else None
        cohort = self._cohort.get(sec) if sec else None
        return basket, self._panel, cohort


# ── persistence layer ────────────────────────────────────────────────────────

def _cache_path(data_dir: Path) -> Path:
    return Path(data_dir) / CACHE_SUBDIR / CACHE_FILENAME


def _series_to_doc(s: pd.Series, union_pos: dict) -> dict:
    """Encode a Series whose index is a subset of the union index as positions+values.

    ``union_pos`` is keyed by int64 ticks (Python-int hashing; np.datetime64 scalar
    hashing is ~100x slower) — all indexes share the union's resolution by construction.
    """
    vals = [None if not np.isfinite(v) else float(v) for v in s.to_numpy(dtype=np.float64)]
    return {"p": [union_pos[ts] for ts in s.index.asi8.tolist()], "v": vals}


def _series_from_doc(doc: dict, union_idx: pd.DatetimeIndex) -> pd.Series:
    pos = np.asarray(doc["p"], dtype=np.int64)
    vals = np.array([np.nan if v is None else v for v in doc["v"]], dtype=np.float64)
    return pd.Series(vals, index=union_idx[pos])


def _save_cache(path: Path, cache: CohortCache, n_files: int, build_secs: float) -> None:
    """Persist a built cache (atomic tmp+rename). Best-effort: failure never kills the build."""
    try:
        # union of every persisted index; cohort series carry the full union already.
        all_idx = cache._panel.index
        for s in list(cache._baskets.values()) + list(cache._cohort.values()):
            all_idx = all_idx.union(s.index)
        unit = np.datetime_data(all_idx.dtype)[0]           # 'us' under pandas 3.x parses
        union_pos = {ts: i for i, ts in enumerate(all_idx.asi8.tolist())}
        doc = {
            "version": CACHE_VERSION,
            "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "build_secs": round(build_secs, 1),
            "n_files": n_files,
            "unit": unit,
            "union_i8": all_idx.asi8.tolist(),
            "panel": _series_to_doc(cache._panel, union_pos),
            "baskets": {sec: _series_to_doc(s, union_pos)
                        for sec, s in cache._baskets.items()},
            "cohort": {sec: _series_to_doc(s, union_pos)
                       for sec, s in cache._cohort.items()},
            "sector_of": cache._sector_of,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(doc, separators=(",", ":")))
        os.replace(tmp, path)
        print(f"  cohort cache: persisted → {path} ({path.stat().st_size / 1e6:.1f} MB)",
              flush=True)
    except Exception as e:  # noqa: BLE001 — persistence is an optimization, never fatal
        print(f"  cohort cache: WARN persist failed ({e}) — continuing unpersisted",
              flush=True)


def _load_cache(path: Path) -> CohortCache | None:
    """Return the persisted cache when present, fresh (< max-age) and well-formed."""
    try:
        if os.environ.get("V2_COHORT_REBUILD") == "1":
            return None
        st = path.stat()
        max_age_h = float(os.environ.get("V2_COHORT_MAX_AGE_H", CACHE_MAX_AGE_H))
        age_h = (time.time() - st.st_mtime) / 3600.0
        if age_h >= max_age_h:
            return None
        doc = json.loads(path.read_text())
        if doc.get("version") != CACHE_VERSION or not doc.get("union_i8"):
            return None
        union_idx = pd.DatetimeIndex(
            np.asarray(doc["union_i8"], dtype=np.int64).view(f"M8[{doc['unit']}]"))
        cache = CohortCache(
            {sec: _series_from_doc(d, union_idx) for sec, d in doc["baskets"].items()},
            _series_from_doc(doc["panel"], union_idx),
            {sec: _series_from_doc(d, union_idx) for sec, d in doc["cohort"].items()},
            dict(doc["sector_of"]))
        print(f"  cohort cache: reusing persisted build ({age_h:.1f}h old, "
              f"built {doc.get('built_at')}, {doc.get('n_files')} files)", flush=True)
        return cache
    except Exception:
        return None   # any corruption/mismatch → rebuild from data


# ── build ────────────────────────────────────────────────────────────────────

def build_cohort_cache(data_dir: Path, manifest: dict,
                       macro_repo: str | None = None) -> CohortCache:
    """Return the sector-cohort cache for ``data_dir`` — persisted copy when fresh
    (< ~20 h; see module docstring), else a fresh single-pass streaming build that is
    then persisted for the night's remaining consumers.

    ``manifest`` is accepted for backward-compatibility (callers pass it) but GICS sector
    is no longer read from it — the manifest carries only ``sec`` (asset class), not a GICS
    sector field. Symbols with no resolved sector are still included in the PANEL basket.
    """
    data_dir = Path(data_dir)
    path = _cache_path(data_dir)
    cached = _load_cache(path)
    if cached is not None:
        return cached
    t0 = time.time()
    cache, n_files = _build_streaming(data_dir, macro_repo)
    if n_files:                       # never persist an empty build
        _save_cache(path, cache, n_files, time.time() - t0)
    return cache


def _build_streaming(data_dir: Path,
                     macro_repo: str | None = None) -> tuple[CohortCache, int]:
    """Read every ``<SYM>.json`` under ``data_dir`` ONCE, resolve GICS sectors, and build
    all sector baskets + panel basket + per-sector cohort fractions, streaming.

    Single pass: the union daily index is not known up front, so accumulators are indexed
    by a growing date→slot map (first-seen order) and re-sorted into date order at
    finalize. Cohort ffill-onto-union is recorded as step-function deltas at each symbol's
    own bar dates and recovered with a date-ordered cumulative sum — exactly equal (integer
    float64 arithmetic) to reindex+ffill against the final union.

    Memory: one symbol's Series at a time + fixed-width accumulators (~16k slots).
    """
    industry_map = _load_industry_map(macro_repo)

    # Slot keys are RAW int64 ticks (Python ints hash ~100x faster than boxed np.datetime64
    # scalars — the datetime64-keyed variant spent more time hashing than parsing). The
    # tick RESOLUTION is captured from the first index seen ([us] under pandas 3.x string
    # parsing) and any deviant index is converted onto it, so the final DatetimeIndex is
    # rebuilt with the correct unit — int64 ticks are NEVER blindly reinterpreted as [ns].
    slot: dict[int, int] = {}       # int64 tick -> column slot, first-seen order
    unit: str | None = None         # datetime64 resolution of the tick keys
    cap = 32768                     # accumulator capacity (doubles if the union outgrows it)

    def _new(dtype):
        return np.zeros(cap, dtype=dtype)

    def _grow(a: np.ndarray, new_cap: int) -> np.ndarray:
        out = np.zeros(new_cap, dtype=a.dtype)
        out[:len(a)] = a
        return out

    panel_bsum, panel_bcnt = _new(np.float64), _new(np.int32)
    sec_bsum: dict[str, np.ndarray] = {}
    sec_bcnt: dict[str, np.ndarray] = {}
    sec_odelta: dict[str, np.ndarray] = {}   # step deltas of Σ ffilled 0/1 oversold
    sec_ocnt_delta: dict[str, np.ndarray] = {}  # +1 at each member's first bar

    sector_of: dict[str, str] = {}  # UPPERCASE symbol -> sector (symbols WITH closes only)
    n_files = 0

    for jf in _iter_data_files(data_dir):
        c = _closes_from_json(jf)
        if c is None:
            continue
        n_files += 1
        up = jf.stem.upper()
        # resolve GICS sector inline (fund.json → industry_map), ORIGINAL-case stem for
        # the <SYM>.fund.json filename exactly like the two-pass _resolve_sectors did.
        sec = _sector_for(data_dir, jf.stem, industry_map)
        if sec:
            sector_of[up] = sec
            if sec not in sec_bsum:
                sec_bsum[sec] = _new(np.float64)
                sec_bcnt[sec] = _new(np.int32)
                sec_odelta[sec] = _new(np.float64)
                sec_ocnt_delta[sec] = _new(np.int32)

        # map this symbol's bar dates onto slots (inserting unseen dates)
        u = np.datetime_data(c.index.dtype)[0]
        if unit is None:
            unit = u
        elif u != unit:             # never seen in practice (all files parse identically);
            c.index = c.index.as_unit(unit)   # exact conversion keeps tick keys comparable
        n_slot = len(slot)
        get = slot.get
        rows_l = []
        for ts in c.index.asi8.tolist():
            p = get(ts)
            if p is None:
                p = n_slot
                if p >= cap:        # grow every accumulator in lock-step (zero-padded —
                    cap *= 2        # np.resize would tile the old values into the new tail)
                    panel_bsum = _grow(panel_bsum, cap)
                    panel_bcnt = _grow(panel_bcnt, cap)
                    for d_ in (sec_bsum, sec_bcnt, sec_odelta, sec_ocnt_delta):
                        for k in d_:
                            d_[k] = _grow(d_[k], cap)
                slot[ts] = p
                n_slot += 1
            rows_l.append(p)
        rows = np.asarray(rows_l, dtype=np.int64)

        # --- basket contribution (normalize to first bar; exact-date, no ffill) ---
        vals = c.to_numpy(dtype=np.float64)
        first = vals[0]
        if np.isfinite(first) and first != 0.0:
            norm = vals / first
            fin = np.isfinite(norm)
            r_fin = rows[fin]
            v_fin = norm[fin]
            # panel: every symbol with closes contributes
            np.add.at(panel_bsum, r_fin, v_fin)
            np.add.at(panel_bcnt, r_fin, 1)
            if sec is not None:
                np.add.at(sec_bsum[sec], r_fin, v_fin)
                np.add.at(sec_bcnt[sec], r_fin, 1)

        # --- cohort contribution (only sectored symbols) ---
        # The two-pass build reindex+ffilled each symbol's 0/1 oversold onto the union.
        # Same thing as step deltas at the symbol's OWN dates: value at the first bar
        # (membership +1 there too, counting forever after), ±1 at each flip. The
        # date-ordered cumsum at finalize recovers the ffilled sums exactly.
        if sec is not None:
            ov = _2w_oversold_daily(c).to_numpy(dtype=np.float64)   # 0.0 / 1.0
            sec_odelta[sec][rows[0]] += ov[0]
            sec_ocnt_delta[sec][rows[0]] += 1
            flips = np.flatnonzero(ov[1:] != ov[:-1]) + 1
            if len(flips):
                np.add.at(sec_odelta[sec], rows[flips], ov[flips] - ov[flips - 1])
        # c, vals, norm, ov drop out of scope on the next iteration

    if not slot:
        return CohortCache({}, pd.Series(dtype=float), {}, {}), 0

    # ── finalize: sort slots into date order, then reduce ───────────────────
    # dict preserves insertion order and slots were handed out sequentially, so the key
    # array is already in slot order; argsort gives slot→date-rank. The int64 ticks are
    # viewed back through the RECORDED unit ([us] under pandas 3.x) — never assumed [ns].
    keys = np.fromiter(slot.keys(), dtype=np.int64, count=len(slot))
    order = np.argsort(keys, kind="stable")
    union_idx = pd.DatetimeIndex(keys[order].view(f"M8[{unit}]"))
    n = len(union_idx)

    def _sorted(a: np.ndarray) -> np.ndarray:
        return a[:n][order]

    def _finalize_basket(bsum: np.ndarray, bcnt: np.ndarray) -> pd.Series:
        bsum, bcnt = _sorted(bsum), _sorted(bcnt)
        out = np.full(n, np.nan, dtype=np.float64)
        nz = bcnt > 0
        out[nz] = bsum[nz] / bcnt[nz]
        s = pd.Series(out, index=union_idx)
        # a sector basket's index is only that sector's member dates; positions where
        # NO member had a bar are absent (dropna reproduces the per-sector union).
        return s.dropna()

    baskets = {sec: _finalize_basket(sec_bsum[sec], sec_bcnt[sec])
               for sec in sorted(sec_bsum) if sec_bcnt[sec][:n].any()}
    panel_basket = _finalize_basket(panel_bsum, panel_bcnt)

    # cohort: cumsum the step deltas in date order → Σ ffilled oversold / member count.
    # Both are integer-valued float64/int32, so the sums are exact (== two-pass build).
    cohort_frac = {}
    for sec in sorted(sec_odelta):
        cnt = np.cumsum(_sorted(sec_ocnt_delta[sec]), dtype=np.int64)
        if not cnt.any():
            continue
        osum = np.cumsum(_sorted(sec_odelta[sec]))
        frac = np.full(n, np.nan, dtype=np.float64)
        nz = cnt > 0
        frac[nz] = osum[nz] / cnt[nz]
        s = pd.Series(frac, index=union_idx)
        # mask sub-quorum dates to NaN (frac.where(n_have >= COHORT_MIN_PEERS, np.nan))
        s = s.where(cnt >= COHORT_MIN_PEERS, np.nan)
        cohort_frac[sec] = s

    return CohortCache(baskets, panel_basket, cohort_frac, sector_of), n_files
