#!/usr/bin/env python3
"""Exploratory, causal comparison of Golden Oracle, Trend Waves, and Pulse.

This is deliberately a research harness, not production strategy code.  It exists to answer
three questions before the chart indicators are amalgamated:

1. When was each signal *knowable* (as opposed to where a retrospective glyph is drawn)?
2. How do the clean-room Trend/Pulse approximations behave on one canonical 2D/3D clock?
3. What happens when Golden entries use a frozen 3D-ATR partial-profit policy?

The harness uses:

* the full-history Macro Dashboard close store to warm up Golden Oracle and preserve its IPO phase;
* the Terminal's real daily OHLC files for next-session-open execution and daily TP/SL checks;
* closed derived bars carrying an explicit ``known_at`` timestamp;
* conservative same-day collision handling (the pre-existing stop wins before profit targets).

Results remain exploratory: the local universe is current-listing/survivorship biased, there is no
intraday path inside a daily candle, and trying several parameter variants creates selection bias.
Do not promote a winning row without a preregistered walk-forward/holdout rerun.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Literal

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from signal_layer import confluence as golden
from signal_layer import confluence_v2 as golden_v2


DEFAULT_TERMINAL_DATA = ROOT / "terminal" / "public" / "data"
DEFAULT_DEEP_DATA = Path("/Users/chriswong/Documents/Cluade/Macro Dashboard/data/stocks")

Direction = Literal[-1, 1]


@dataclass(frozen=True)
class Event:
    symbol: str
    family: str
    direction: Direction
    known_at: pd.Timestamp
    marker_at: pd.Timestamp
    source_tf: str
    strength: float | None = None
    source_bar_index: int | None = None


def load_terminal_ohlcv(path: Path) -> tuple[pd.DataFrame, dict]:
    """Read one Terminal OHLC artifact into canonical lower-case OHLCV columns."""
    doc = json.loads(path.read_text())
    rows = doc.get("bars") or []
    if not rows:
        return pd.DataFrame(columns=["o", "h", "l", "c", "v"]), doc
    frame = pd.DataFrame(rows, columns=["date", "o", "h", "l", "c", "v"])
    frame.index = pd.to_datetime(frame.pop("date"))
    for col in ["o", "h", "l", "c", "v"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame[~frame.index.duplicated(keep="last")].sort_index()
    valid = (
        frame[["o", "h", "l", "c"]].notna().all(axis=1)
        & (frame[["o", "h", "l", "c"]] > 0).all(axis=1)
        & (frame["h"] >= frame["l"])
    )
    return frame.loc[valid], doc


def session_bars(
    daily: pd.DataFrame,
    sessions: int,
    global_start: int,
    *,
    global_positions: np.ndarray | None = None,
) -> pd.DataFrame:
    """Build closed N-session bars on Golden's IPO-phased clock.

    Golden closes its first (IPO) bar at global session 0, then closes every ``sessions`` prints:
    for 3D the groups are [0], [1,2,3], [4,5,6], ... .  ``global_start`` is the IPO-session
    index of ``daily.iloc[0]``.  Partial leading/trailing groups are dropped.

    The returned index is ``known_at`` (the real last constituent session), while ``bar_start`` is
    retained separately for display.  This separation prevents an OPEN-date label from masquerading
    as the decision timestamp.
    """
    if sessions < 1:
        raise ValueError("sessions must be >= 1")
    if daily.empty:
        return pd.DataFrame(columns=["o", "h", "l", "c", "v", "bar_start", "known_at"])

    if global_positions is None:
        g = np.arange(len(daily), dtype=np.int64) + int(global_start)
    else:
        g = np.asarray(global_positions, dtype=np.int64)
        if len(g) != len(daily) or np.any(g < 0) or np.any(np.diff(g) <= 0):
            raise ValueError("global_positions must be a strictly increasing index for every row")
    gid = (g + sessions - 1) // sessions
    work = daily.copy()
    work["_g"] = g
    work["_gid"] = gid
    out: list[dict] = []
    for group_id, chunk in work.groupby("_gid", sort=True):
        start_g = 0 if int(group_id) == 0 else (int(group_id) - 1) * sessions + 1
        end_g = int(group_id) * sessions
        expected_g = np.arange(start_g, end_g + 1, dtype=np.int64)
        if not np.array_equal(chunk["_g"].to_numpy(dtype=np.int64), expected_g):
            continue
        out.append(
            {
                "o": float(chunk["o"].iloc[0]),
                "h": float(chunk["h"].max()),
                "l": float(chunk["l"].min()),
                "c": float(chunk["c"].iloc[-1]),
                "v": float(chunk["v"].sum()),
                "bar_start": pd.Timestamp(chunk.index[0]),
                "known_at": pd.Timestamp(chunk.index[-1]),
                "global_group": int(group_id),
            }
        )
    if not out:
        return pd.DataFrame(columns=["o", "h", "l", "c", "v", "bar_start", "known_at"])
    result = pd.DataFrame(out)
    return result.set_index("known_at", drop=False)


def validate_execution_alignment(daily: pd.DataFrame, full_close: pd.Series) -> tuple[bool, dict]:
    """Reject calendar holes and historical ticker/price-series mismatches.

    Terminal OHLC and Golden's long close store come from different artifacts.  The former
    is usable for fills only when it represents the same security and nearly the same
    session calendar.  A slowly varying adjusted-vs-unadjusted dividend ratio is tolerated;
    ticker reuse, symbol changes without backfill, and split-scale discontinuities are not.
    """
    if daily.empty or full_close.empty:
        return False, {"reason": "empty execution or signal series"}
    expected = full_close.loc[daily.index.min() : daily.index.max()].dropna()
    common = daily.index.intersection(expected.index)
    coverage = len(common) / len(expected) if len(expected) else 0.0
    if len(common) < 250:
        return False, {"reason": "fewer than 250 common sessions", "coverage": coverage}

    ratio = (
        daily.loc[common, "c"].astype(float)
        / expected.reindex(common).astype(float)
    ).replace([np.inf, -np.inf], np.nan).dropna()
    q05 = float(ratio.quantile(0.05)) if len(ratio) else np.nan
    q95 = float(ratio.quantile(0.95)) if len(ratio) else np.nan
    scale_span = q95 / q05 if np.isfinite(q05) and q05 > 0 else np.inf
    left_ret = daily.loc[common, "c"].pct_change()
    right_ret = expected.reindex(common).pct_change()
    return_corr = float(left_ret.corr(right_ret))
    detail = {
        "coverage": round(coverage, 6),
        "price_scale_p95_p05": round(scale_span, 6) if np.isfinite(scale_span) else None,
        "return_corr": round(return_corr, 6) if np.isfinite(return_corr) else None,
    }
    valid = coverage >= 0.995 and scale_span <= 1.25 and return_corr >= 0.97
    if not valid:
        detail["reason"] = "execution OHLC does not reliably align with Golden close history"
    return valid, detail


def weekly_bars(daily: pd.DataFrame) -> pd.DataFrame:
    """Closed calendar-week bars, indexed by the actual last session in each week."""
    out: list[dict] = []
    for _, chunk in daily.groupby(daily.index.to_period("W-FRI")):
        if chunk.empty:
            continue
        out.append(
            {
                "o": float(chunk["o"].iloc[0]),
                "h": float(chunk["h"].max()),
                "l": float(chunk["l"].min()),
                "c": float(chunk["c"].iloc[-1]),
                "v": float(chunk["v"].sum()),
                "bar_start": pd.Timestamp(chunk.index[0]),
                "known_at": pd.Timestamp(chunk.index[-1]),
            }
        )
    result = pd.DataFrame(out)
    return result.set_index("known_at", drop=False) if len(result) else result


def _trend_atr(bars: pd.DataFrame, length: int) -> np.ndarray:
    """Exact running-mean/Wilder recurrence used by the clean-room Trend Engine."""
    n = len(bars)
    out = np.zeros(n, dtype=float)
    seed_sum = 0.0
    prev = 0.0
    c = bars["c"].to_numpy(float)
    h = bars["h"].to_numpy(float)
    l = bars["l"].to_numpy(float)
    o = bars["o"].to_numpy(float)
    for i in range(n):
        pc = c[i - 1] if i else o[i]
        tr = max(h[i] - l[i], abs(h[i] - pc), abs(l[i] - pc))
        if i < length:
            seed_sum += max(tr, 0.0)
            prev = seed_sum / (i + 1)
        else:
            prev = (prev * (length - 1) + max(tr, 0.0)) / length
        out[i] = prev
    return out


def trend_state(bars: pd.DataFrame, sensitivity: int) -> pd.DataFrame:
    """Port the shipped Trend Waves ATR flip state (auto-optimization intentionally excluded)."""
    if bars.empty:
        return pd.DataFrame(index=bars.index)
    s = max(1, min(10, int(round(sensitivity))))
    # JavaScript Math.round(x) rounds positive .5 upward; Python's round uses bankers'
    # rounding and would give the wrong periods for odd sensitivities.
    period = math.floor(7 + s * 1.5 + 0.5)
    mult = 1.2 + s * 0.28
    atr = _trend_atr(bars, period)
    h = bars["h"].to_numpy(float)
    l = bars["l"].to_numpy(float)
    c = bars["c"].to_numpy(float)
    n = len(bars)
    dirs = np.zeros(n, dtype=np.int8)
    stops = np.full(n, np.nan)
    flips = np.zeros(n, dtype=np.int8)
    dir_: int = 0
    stop = np.nan
    for i in range(n):
        mid = (h[i] + l[i]) / 2
        if dir_ == 0:
            dir_ = 1 if c[i] >= mid else -1
            stop = mid - dir_ * mult * atr[i]
        elif dir_ == 1:
            stop = max(stop, mid - mult * atr[i])
            if c[i] < stop:
                dir_ = -1
                stop = mid + mult * atr[i]
                flips[i] = -1
        else:
            stop = min(stop, mid + mult * atr[i])
            if c[i] > stop:
                dir_ = 1
                stop = mid - mult * atr[i]
                flips[i] = 1
        dirs[i] = dir_
        stops[i] = stop

    roc = np.full(n, np.nan)
    if n > 10:
        roc[10:] = np.abs(c[10:] / c[:-10] - 1)
    momentum_pct = np.zeros(n)
    for i in range(n):
        if not np.isfinite(roc[i]):
            continue
        window = roc[max(0, i - 199) : i + 1]
        window = window[np.isfinite(window)]
        if len(window):
            momentum_pct[i] = math.floor(100 * np.mean(window <= roc[i]) + 0.5)
    return pd.DataFrame(
        {
            "atr": atr,
            "dir": dirs,
            "stop": stops,
            "flip": flips,
            "momentum_pct": momentum_pct,
            "strong": (momentum_pct >= 70) & (flips != 0),
        },
        index=bars.index,
    )


def trend_events(symbol: str, bars: pd.DataFrame, sensitivity: int, tf: str) -> list[Event]:
    state = trend_state(bars, sensitivity)
    result: list[Event] = []
    for i, (_, row) in enumerate(state.iterrows()):
        flip = int(row["flip"])
        if flip == 0:
            continue
        base = Event(
            symbol=symbol,
            family=f"trend_{tf}_s{sensitivity}",
            direction=1 if flip > 0 else -1,
            known_at=pd.Timestamp(bars["known_at"].iloc[i]),
            marker_at=pd.Timestamp(bars["known_at"].iloc[i]),
            source_tf=tf,
            strength=float(row["momentum_pct"]),
            source_bar_index=i,
        )
        result.append(base)
        if bool(row["strong"]):
            result.append(
                Event(
                    **{
                        **asdict(base),
                        "family": f"trend_{tf}_s{sensitivity}_strong",
                    }
                )
            )
    return result


PULSE_PROFILES = {
    "scalper": (7, 15, 6),
    "day": (13, 25, 9),
    "swing": (21, 40, 13),
}


def _ema_sma_seed(values: np.ndarray, length: int) -> np.ndarray:
    """SMA-seeded EMA used by the shipped Pulse clean-room implementation."""
    out = np.full(len(values), np.nan)
    k = 2 / (length + 1)
    seen = 0
    seed = 0.0
    prev = np.nan
    for i, value in enumerate(values):
        if not np.isfinite(value):
            continue
        seen += 1
        if seen < length:
            seed += value
        elif seen == length:
            seed += value
            prev = seed / length
            out[i] = prev
        else:
            prev = value * k + prev * (1 - k)
            out[i] = prev
    return out


def pulse_wave(bars: pd.DataFrame, profile: str) -> np.ndarray:
    short, long, _signal = PULSE_PROFILES[profile]
    close = bars["c"].to_numpy(float)
    diff = np.zeros(len(close))
    if len(close) > 1:
        diff[1:] = np.diff(close)
    mom = _ema_sma_seed(_ema_sma_seed(diff, long), short)
    wave = np.full(len(close), np.nan)
    for i, value in enumerate(mom):
        if not np.isfinite(value):
            continue
        window = mom[max(0, i - 199) : i + 1]
        finite = np.abs(window[np.isfinite(window)])
        denom = finite.max() if len(finite) else 0.0
        wave[i] = np.clip(100 * value / denom, -100, 100) if denom > 0 else 0.0
    return wave


def pulse_events(symbol: str, bars: pd.DataFrame, profile: str, tf: str) -> list[Event]:
    """Emit Pulse at its confirmation bar; retain the prior-bar glyph timestamp separately."""
    wave = pulse_wave(bars, profile)
    result: list[Event] = []
    last_fire = {1: -10_000, -1: -10_000}
    for i in range(2, len(wave)):
        w0, w1, w2 = wave[i], wave[i - 1], wave[i - 2]
        if not all(np.isfinite(x) for x in (w0, w1, w2)):
            continue
        direction = 0
        if w1 < w2 and w0 > w1 and w1 <= -60:
            direction = 1
        elif w1 > w2 and w0 < w1 and w1 >= 60:
            direction = -1
        if not direction or i - last_fire[direction] < 5:
            continue
        last_fire[direction] = i
        result.append(
            Event(
                symbol=symbol,
                family=f"pulse_{tf}_{profile}",
                direction=direction,  # type: ignore[arg-type]
                known_at=pd.Timestamp(bars["known_at"].iloc[i]),
                marker_at=pd.Timestamp(bars["known_at"].iloc[i - 1]),
                source_tf=tf,
                strength=float(min(100, math.floor(abs(w1) + 0.5))),
                source_bar_index=i,
            )
        )
    return result


def golden_events(symbol: str, full_close: pd.Series) -> tuple[list[Event], pd.DataFrame]:
    sig = golden.compute_signals(full_close.dropna())
    if sig.empty:
        return [], sig
    clean_close = full_close.dropna()
    open_dates, close_dates, _ = golden._3d_groups(clean_close, 0)
    close_positions = clean_close.index.get_indexer(pd.DatetimeIndex(close_dates))
    complete = (close_positions >= 0) & (close_positions % 3 == 0)
    known = pd.Series(
        pd.to_datetime(close_dates)[complete],
        index=pd.to_datetime(open_dates)[complete],
    )
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    rows = rows.loc[rows.index.isin(known.index)]
    enter = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).astype(bool)
    exit_ = (rows["CS"] & ~rows["strong_bull"]).astype(bool)
    events: list[Event] = []
    row_pos = {ts: i for i, ts in enumerate(rows.index)}
    for ts in rows.index[enter]:
        events.append(
            Event(
                symbol,
                "golden_buy",
                1,
                pd.Timestamp(known.loc[ts]),
                pd.Timestamp(ts),
                "3D",
                source_bar_index=row_pos[ts],
            )
        )
    for ts in rows.index[exit_]:
        events.append(
            Event(
                symbol,
                "golden_sell_internal",
                -1,
                pd.Timestamp(known.loc[ts]),
                pd.Timestamp(ts),
                "3D",
                source_bar_index=row_pos[ts],
            )
        )
    for warning in golden_v2.warn_events(full_close):
        if warning.get("kind") != "confirm":
            continue
        ts = pd.Timestamp(warning["ts"])
        events.append(Event(symbol, "golden_sell_structure_current", -1, ts, ts, "1D"))
    return events, sig


def golden_early_causal_events(
    symbol: str,
    full_close: pd.Series,
    sig: pd.DataFrame,
) -> list[Event]:
    """Rebuild Golden's early dot on canonical closed 2D/3D session bars.

    The production v2 helper currently uses calendar ``2B`` labels.  Those labels denote
    bucket starts, so they are not suitable as availability timestamps.  This research
    version uses the last real session in each IPO-phased 2D bar and only consumes a 2D
    histogram value once that session has closed.
    """
    close = full_close.dropna().astype(float)
    if len(close) < 300 or sig.empty:
        return []
    dummy = pd.DataFrame(
        {
            "o": close,
            "h": close,
            "l": close,
            "c": close,
            "v": np.zeros(len(close), dtype=float),
        },
        index=close.index,
    )
    bars2 = session_bars(dummy, 2, 0)
    if bars2.empty:
        return []
    m2, s2 = golden.rsi_macd(pd.Series(bars2["c"].to_numpy(), index=bars2.index))
    rising2 = ((m2 - s2) > (m2 - s2).shift(1)).fillna(False)

    open_dates, close_dates, _ = golden._3d_groups(close, 0)
    close_positions = close.index.get_indexer(pd.DatetimeIndex(close_dates))
    complete = (close_positions >= 0) & (close_positions % 3 == 0)
    known = pd.Series(
        pd.to_datetime(close_dates)[complete],
        index=pd.to_datetime(open_dates)[complete],
    )
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    rows = rows.loc[rows.index.isin(known.index)]
    k, d = rows["k"], rows["d"]
    stoch_bull = golden.crossover(k, d)
    from_os = d.rolling(golden.CONF_W).min() < golden.OS
    result: list[Event] = []
    for i, ts in enumerate(rows.index):
        if not bool(stoch_bull.loc[ts] and from_os.loc[ts]):
            continue
        known_at = pd.Timestamp(known.loc[ts])
        p = int(bars2.index.searchsorted(known_at, side="right")) - 1
        if p < 0 or not bool(rising2.iloc[p]):
            continue
        result.append(
            Event(
                symbol,
                "golden_early_causal_2D3D",
                1,
                known_at,
                known_at,
                "2D+3D",
                source_bar_index=i,
            )
        )
    return result


def _event_observation(
    event: Event,
    daily: pd.DataFrame,
    horizons: Iterable[int],
    commission_bps: float,
    slippage_bps: float,
) -> dict | None:
    """Directional forward result from the next real session OPEN."""
    if daily.empty or event.known_at < daily.index[0]:
        return None
    pos = int(daily.index.searchsorted(event.known_at, side="right"))
    if pos >= len(daily):
        return None
    entry = float(daily["o"].iloc[pos])
    if not np.isfinite(entry) or entry <= 0:
        return None
    commission = commission_bps / 10_000
    slip = slippage_bps / 10_000
    out = {
        "symbol": event.symbol,
        "family": event.family,
        "direction": event.direction,
        "known_at": event.known_at,
        "marker_at": event.marker_at,
        "entry_at": pd.Timestamp(daily.index[pos]),
        "marker_lead_calendar_days": int((event.known_at - event.marker_at).days),
    }
    for horizon in horizons:
        end = pos + int(horizon)
        if end >= len(daily):
            out[f"ret_{horizon}"] = np.nan
            out[f"mfe_{horizon}"] = np.nan
            out[f"mae_{horizon}"] = np.nan
            out[f"outcome_at_{horizon}"] = pd.NaT
            continue
        exit_px = float(daily["c"].iloc[end])
        path = daily.iloc[pos : end + 1]
        if event.direction > 0:
            entry_fill = entry * (1 + slip)
            exit_fill = exit_px * (1 - slip)
            net = exit_fill * (1 - commission) / (entry_fill * (1 + commission)) - 1
            mfe = float(path["h"].max()) / entry - 1
            mae = float(path["l"].min()) / entry - 1
        else:
            entry_fill = entry * (1 - slip)
            exit_fill = exit_px * (1 + slip)
            net = 1 - exit_fill * (1 + commission) / (entry_fill * (1 - commission))
            mfe = 1 - float(path["l"].min()) / entry
            mae = 1 - float(path["h"].max()) / entry
        out[f"ret_{horizon}"] = net
        out[f"mfe_{horizon}"] = mfe
        out[f"mae_{horizon}"] = mae
        out[f"outcome_at_{horizon}"] = pd.Timestamp(daily.index[end])
    return out


def comparable_event(event: Event, start: pd.Timestamp) -> bool:
    """Eligibility for cross-family efficacy comparisons (not app rendering parity)."""
    if event.known_at < start:
        return False
    if not event.family.startswith("pulse_"):
        return True
    if event.source_bar_index is None:
        return False
    profile = event.family.rsplit("_", 1)[-1]
    short, long, _ = PULSE_PROFILES[profile]
    # First finite double-EMA sample is at long+short-2. Wait a further 199
    # source bars so normalizeSigned's 200-bar window contains 200 finite samples.
    full_normalization_at = long + short - 2 + 199
    return event.source_bar_index >= full_normalization_at


def summarize_observations(
    obs: pd.DataFrame,
    split_at: pd.Timestamp,
    *,
    common_window: bool = False,
) -> list[dict]:
    if obs.empty:
        return []
    if common_window:
        ready = pd.to_datetime(obs["common_ready_at"], errors="coerce")
        obs = obs.loc[obs["known_at"] >= ready]
    rows: list[dict] = []
    for period, mask in [
        ("all", np.ones(len(obs), dtype=bool)),
        ("train", obs["known_at"] < split_at),
        ("holdout", obs["known_at"] >= split_at),
    ]:
        part = obs.loc[mask]
        for (family, direction), g in part.groupby(["family", "direction"]):
            record = {
                "period": period,
                "family": family,
                "direction": int(direction),
                "role": "long_entry" if int(direction) > 0 else "long_exit_or_short",
                "signals": int(len(g)),
                "symbols": int(g["symbol"].nunique()),
                "marker_lead_days_median": _round(g["marker_lead_calendar_days"].median()),
            }
            for horizon in (10, 21, 42):
                col = f"ret_{horizon}"
                eligible = np.isfinite(g[col])
                if period == "train":
                    # Purge outcomes whose forward measurement crosses into holdout.
                    eligible &= pd.to_datetime(g[f"outcome_at_{horizon}"]) < split_at
                finite = g.loc[eligible]
                record[f"samples_{horizon}"] = int(len(finite))
                record[f"win_{horizon}"] = _round((finite[col] > 0).mean()) if len(finite) else None
                record[f"mean_{horizon}"] = _round(finite[col].mean()) if len(finite) else None
                record[f"median_{horizon}"] = _round(finite[col].median()) if len(finite) else None
                # Equal-symbol mean prevents a high-frequency ticker from owning the pooled result.
                sym_mean = finite.groupby("symbol")[col].mean() if len(finite) else pd.Series(dtype=float)
                record[f"equal_symbol_mean_{horizon}"] = _round(sym_mean.mean()) if len(sym_mean) else None
                record[f"median_mfe_{horizon}"] = _round(finite[f"mfe_{horizon}"].median()) if len(finite) else None
                record[f"median_mae_{horizon}"] = _round(finite[f"mae_{horizon}"].median()) if len(finite) else None
            rows.append(record)
    return rows


def lead_conversion(
    events: list[Event],
    early_family: str,
    availability: dict[tuple[str, str], tuple[pd.Timestamp, pd.Timestamp]],
    max_days: int = 30,
) -> dict:
    """One-to-one bullish scout → later Golden conversion in common availability windows.

    Same-day events are not leads. A bearish event from the scout family invalidates an
    unmatched bullish episode. Each early event and Golden buy can participate in at most
    one match, preventing one broad regime turn from "covering" several Oracle entries.
    """
    symbols = sorted({symbol for symbol, family in availability if family == early_family})
    leads: list[int] = []
    eligible_oracle = 0
    eligible_early = 0
    matched = 0
    evaluated = 0
    for symbol in symbols:
        window = availability.get((symbol, early_family))
        if window is None:
            continue
        start, end = window
        family_events = sorted(
            [
                e
                for e in events
                if e.symbol == symbol
                and e.family == early_family
                and start <= e.known_at <= end
            ],
            key=lambda e: e.known_at,
        )
        early = [e for e in family_events if e.direction > 0]
        bearish = [e.known_at for e in family_events if e.direction < 0]
        oracle = sorted(
            [
                e
                for e in events
                if e.symbol == symbol
                and e.family == "golden_buy"
                and start <= e.known_at <= end
            ],
            key=lambda e: e.known_at,
        )
        eligible_oracle += len(oracle)
        eligible_early += len(early)
        evaluated += 1
        used: set[int] = set()
        for golden_event in oracle:
            for i in range(len(early) - 1, -1, -1):
                if i in used:
                    continue
                scout = early[i]
                days = int((golden_event.known_at - scout.known_at).days)
                if days <= 0:
                    continue
                if days > max_days:
                    break
                invalidated = any(scout.known_at < ts < golden_event.known_at for ts in bearish)
                if invalidated:
                    continue
                used.add(i)
                matched += 1
                leads.append(days)
                break
    return {
        "family": early_family,
        "symbols_evaluated": evaluated,
        "oracle_buys": eligible_oracle,
        "oracle_coverage": _round(matched / eligible_oracle) if eligible_oracle else None,
        "median_calendar_day_lead": _round(np.median(leads)) if leads else None,
        "early_signals": eligible_early,
        "conversion_to_golden": _round(matched / eligible_early) if eligible_early else None,
        "matched_one_to_one": matched,
    }


def _decision_positions(events: Iterable[Event], daily: pd.DataFrame, direction: int) -> set[int]:
    positions: set[int] = set()
    for event in events:
        if event.direction != direction:
            continue
        # Research windows start flat. Historical events before the first executable
        # session must not all collapse onto position zero via ``searchsorted``.
        if event.known_at < daily.index[0]:
            continue
        p = int(daily.index.searchsorted(event.known_at, side="right"))
        if p < len(daily):
            positions.add(p)
    return positions


def simulate_oracle_policy(
    daily: pd.DataFrame,
    oracle: list[Event],
    atr_by_known_at: pd.Series,
    *,
    trend_exits: list[Event] | None = None,
    targets: tuple[float, float, float] | None = None,
    target_weights: tuple[float, float, float] = (0.25, 0.25, 0.25),
    risk_stop_atr: float | None = None,
    ratchet_after_tp: bool = False,
    commission_bps: float = 3.0,
    slippage_bps: float = 1.0,
) -> dict:
    """Daily next-open ledger with optional frozen ATR targets and partial exits.

    Stop/target policy when enabled:
      * initial stop = entry - ``risk_stop_atr`` × frozen 3D ATR;
      * when ``ratchet_after_tp`` is enabled, TP1 moves the stop to entry and TP2
        moves it to TP1 beginning the NEXT session;
      * if the pre-existing stop and a target are both inside one daily candle, stop wins.
    """
    if daily.empty:
        return {}
    entries = _decision_positions(oracle, daily, 1)
    exits = _decision_positions(oracle, daily, -1)
    if trend_exits:
        exits |= _decision_positions(trend_exits, daily, -1)
    commission = commission_bps / 10_000
    slip = slippage_bps / 10_000

    cash = 1.0
    shares = 0.0
    entry_equity = 0.0
    entry_px = np.nan
    entry_date: pd.Timestamp | None = None
    initial_shares = 0.0
    frozen_atr = np.nan
    levels: list[float] = []
    hit = [False, False, False]
    stop: float | None = None
    next_stop: float | None = None
    trades: list[dict] = []
    equity: list[float] = []
    exposure = 0
    total_commission = 0.0
    exit_counts: dict[str, int] = {}

    def sell(qty: float, raw_px: float) -> None:
        nonlocal cash, shares, total_commission
        qty = min(max(qty, 0.0), shares)
        if qty <= 0:
            return
        px = raw_px * (1 - slip)
        notional = qty * px
        fee = notional * commission
        total_commission += fee
        cash += notional - fee
        shares -= qty

    def close_trade(raw_px: float, reason: str, date: pd.Timestamp) -> None:
        nonlocal cash, shares, entry_date
        sell(shares, raw_px)
        ret = cash / entry_equity - 1 if entry_equity > 0 else np.nan
        trades.append(
            {
                "entry": entry_date,
                "exit": date,
                "ret": ret,
                "reason": reason,
                "tp1": hit[0],
                "tp2": hit[1],
                "tp3": hit[2],
            }
        )
        exit_counts[reason] = exit_counts.get(reason, 0) + 1
        shares = 0.0
        entry_date = None

    for i, (date, bar) in enumerate(daily.iterrows()):
        date = pd.Timestamp(date)
        # Signal exits fill at the next session open and take priority over a same-open re-entry.
        closed_this_open = False
        if shares > 0 and i in exits:
            close_trade(float(bar["o"]), "signal", date)
            closed_this_open = True

        if shares <= 1e-15 and i in entries and not closed_this_open:
            entry_equity = cash
            raw_entry = float(bar["o"])
            entry_px = raw_entry * (1 + slip)
            fee_rate = commission
            shares = cash / (entry_px * (1 + fee_rate))
            notional = shares * entry_px
            total_commission += notional * commission
            cash = 0.0
            initial_shares = shares
            entry_date = date
            # Last fully known canonical 3D ATR at the decision session.
            decision_date = max(
                (
                    e.known_at
                    for e in oracle
                    if e.direction > 0
                    and e.known_at >= daily.index[0]
                    and int(daily.index.searchsorted(e.known_at, side="right")) == i
                ),
                default=date,
            )
            prior = atr_by_known_at.loc[:decision_date].dropna()
            frozen_atr = float(prior.iloc[-1]) if len(prior) else np.nan
            levels = [entry_px + k * frozen_atr for k in (targets or ())] if np.isfinite(frozen_atr) else []
            hit = [False, False, False]
            stop = entry_px - risk_stop_atr * frozen_atr if risk_stop_atr and np.isfinite(frozen_atr) else None
            next_stop = stop

        if shares > 0:
            exposure += 1
            # A stop ratchet caused by yesterday's TP becomes active today, never retroactively.
            stop = next_stop
            day_open, day_high, day_low = float(bar["o"]), float(bar["h"]), float(bar["l"])
            newly_hit: list[int] = []
            if stop is not None and day_open <= stop:
                close_trade(day_open, "stop_gap", date)
            else:
                # A long limit below a favorable opening gap is observably executable at
                # that open; process it before the later intraday path becomes ambiguous.
                for t, level in enumerate(levels):
                    if t >= len(target_weights) or hit[t] or day_open < level:
                        continue
                    sell(initial_shares * target_weights[t], day_open)
                    hit[t] = True
                    newly_hit.append(t)

            if shares > 0 and stop is not None and day_low <= stop:
                # For the remaining unknown intraday high/low ordering, use stop-first.
                close_trade(stop, "stop", date)
            elif shares > 0 and levels:
                for t, level in enumerate(levels):
                    if t >= len(target_weights) or hit[t] or day_high < level:
                        continue
                    sell(initial_shares * target_weights[t], level)
                    hit[t] = True
                    newly_hit.append(t)
            if shares > 0 and ratchet_after_tp:
                if 0 in newly_hit:
                    next_stop = max(next_stop or -np.inf, entry_px)
                if 1 in newly_hit:
                    next_stop = max(next_stop or -np.inf, levels[0])

        equity.append(cash + shares * float(bar["c"]))

    if shares > 0:
        close_trade(float(daily["c"].iloc[-1]), "eod", pd.Timestamp(daily.index[-1]))
        equity[-1] = cash

    eq = np.asarray(equity, dtype=float)
    if not len(eq):
        return {}
    rets = np.diff(eq, prepend=eq[0]) / np.where(
        np.concatenate(([eq[0]], eq[:-1])) != 0,
        np.concatenate(([eq[0]], eq[:-1])),
        1,
    )
    dd = eq / np.maximum.accumulate(eq) - 1
    years = max((daily.index[-1] - daily.index[0]).days / 365.25, 1 / 365.25)
    cagr = eq[-1] ** (1 / years) - 1 if eq[-1] > 0 else np.nan
    sd = float(np.std(rets, ddof=1)) if len(rets) > 1 else 0.0
    trade_rets = np.array([t["ret"] for t in trades], dtype=float)
    return {
        "trades": len(trades),
        "win_rate": _round(np.mean(trade_rets > 0)) if len(trade_rets) else None,
        "expectancy": _round(np.mean(trade_rets)) if len(trade_rets) else None,
        "total_return": _round(eq[-1] - 1),
        "cagr": _round(cagr),
        "max_drawdown": _round(np.min(dd)),
        "sharpe": _round(np.mean(rets) / sd * math.sqrt(252)) if sd > 0 else None,
        "exposure": _round(exposure / len(daily)),
        "tp1_rate": _round(np.mean([t["tp1"] for t in trades])) if trades and targets else None,
        "tp2_rate": _round(np.mean([t["tp2"] for t in trades])) if trades and targets else None,
        "tp3_rate": _round(np.mean([t["tp3"] for t in trades])) if trades and targets else None,
        "commission_paid": _round(total_commission),
        "exit_counts": exit_counts,
    }


def summarize_policies(rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    frame = pd.DataFrame(rows)
    out: list[dict] = []
    for (period, policy), g in frame.groupby(["period", "policy"]):
        record = {
            "period": period,
            "policy": policy,
            "symbols": int(g["symbol"].nunique()),
            "trades": int(g["trades"].sum()),
        }
        for col in [
            "win_rate",
            "expectancy",
            "total_return",
            "cagr",
            "max_drawdown",
            "sharpe",
            "exposure",
            "tp1_rate",
            "tp2_rate",
            "tp3_rate",
        ]:
            vals = pd.to_numeric(g[col], errors="coerce").dropna()
            record[f"median_{col}"] = _round(vals.median()) if len(vals) else None
            record[f"mean_{col}"] = _round(vals.mean()) if len(vals) else None
        out.append(record)
    return out


def _round(value: float | int | np.floating | None, digits: int = 4):
    if value is None:
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return round(x, digits) if math.isfinite(x) else None


def run(args: argparse.Namespace) -> dict:
    terminal_dir = Path(args.terminal_data)
    deep_dir = Path(args.deep_data)
    requested = [s.strip().upper() for s in args.symbols.split(",") if s.strip()] if args.symbols else []
    terminal_symbols = {p.stem for p in terminal_dir.glob("*.json") if "." not in p.stem}
    deep_symbols = {p.stem for p in deep_dir.glob("*.parquet")}
    symbols = sorted(terminal_symbols & deep_symbols)
    if requested:
        symbols = [s for s in requested if s in symbols]
    if args.limit:
        symbols = symbols[: args.limit]

    all_events: list[Event] = []
    observations: list[dict] = []
    policy_rows: list[dict] = []
    availability: dict[tuple[str, str], tuple[pd.Timestamp, pd.Timestamp]] = {}
    data_quality: dict[str, int] = {}
    skipped: dict[str, str] = {}

    trend_sens = [int(x) for x in args.trend_sens.split(",")]
    pulse_configs = [("2D", "day"), ("3D", "day"), ("3D", "swing")]

    for num, symbol in enumerate(symbols, 1):
        try:
            daily, doc = load_terminal_ohlcv(terminal_dir / f"{symbol}.json")
            full = pd.read_parquet(deep_dir / f"{symbol}.parquet", columns=["close"])["close"].dropna()
            if len(daily) < 300 or len(full) < 500:
                skipped[symbol] = "insufficient history"
                continue
            alignment_ok, alignment = validate_execution_alignment(daily, full)
            if not alignment_ok:
                skipped[symbol] = json.dumps(alignment, sort_keys=True)
                continue
            global_start = int(full.index.searchsorted(daily.index[0]))
            # Refuse a mismatched calendar rather than silently phasing off the wrong row.
            if global_start >= len(full) or pd.Timestamp(full.index[global_start]) != pd.Timestamp(daily.index[0]):
                skipped[symbol] = "terminal/deep calendars do not share the start session"
                continue
            global_positions = full.index.get_indexer(daily.index)
            if np.any(global_positions < 0):
                skipped[symbol] = "terminal has sessions missing from Golden close history"
                continue
            bars2 = session_bars(
                daily,
                2,
                global_start,
                global_positions=global_positions,
            )
            bars3 = session_bars(
                daily,
                3,
                global_start,
                global_positions=global_positions,
            )
            barsw = weekly_bars(daily)
            if min(len(bars2), len(bars3), len(barsw)) < 80:
                skipped[symbol] = "insufficient closed derived bars"
                continue

            quality = str(doc.get("bar_quality") or doc.get("src") or "unknown")
            data_quality[quality] = data_quality.get(quality, 0) + 1

            oracle, _sig = golden_events(symbol, full)
            events = list(oracle)
            events.extend(golden_early_causal_events(symbol, full, _sig))
            for sens in trend_sens:
                events.extend(trend_events(symbol, bars3, sens, "3D"))
            # A small fixed timeframe comparison, not a combinatorial optimizer.
            events.extend(trend_events(symbol, bars2, 5, "2D"))
            events.extend(trend_events(symbol, barsw, 5, "1W"))
            for tf, profile in pulse_configs:
                events.extend(pulse_events(symbol, bars2 if tf == "2D" else bars3, profile, tf))
            all_events.extend(events)

            available_end = pd.Timestamp(daily.index[-1])
            requested_start = pd.Timestamp(args.start)
            for sens in trend_sens:
                trend_window = (
                    max(requested_start, pd.Timestamp(bars3.index[0])),
                    available_end,
                )
                availability[(symbol, f"trend_3D_s{sens}")] = trend_window
                availability[(symbol, f"trend_3D_s{sens}_strong")] = trend_window
            availability[(symbol, "trend_2D_s5")] = (
                max(requested_start, pd.Timestamp(bars2.index[0])),
                available_end,
            )
            availability[(symbol, "trend_2D_s5_strong")] = availability[
                (symbol, "trend_2D_s5")
            ]
            availability[(symbol, "trend_1W_s5")] = (
                max(requested_start, pd.Timestamp(barsw.index[0])),
                available_end,
            )
            availability[(symbol, "trend_1W_s5_strong")] = availability[
                (symbol, "trend_1W_s5")
            ]
            for tf, profile in pulse_configs:
                source = bars2 if tf == "2D" else bars3
                short, long, _ = PULSE_PROFILES[profile]
                ready_i = long + short - 2 + 199
                if ready_i < len(source):
                    availability[(symbol, f"pulse_{tf}_{profile}")] = (
                        max(requested_start, pd.Timestamp(source.index[ready_i])),
                        available_end,
                    )
            availability[(symbol, "golden_early_causal_2D3D")] = (
                max(requested_start, pd.Timestamp(daily.index[0])),
                available_end,
            )
            common_starts = [
                window[0]
                for (sym, family), window in availability.items()
                if sym == symbol
                and family
                in {
                    "golden_early_causal_2D3D",
                    "trend_3D_s5",
                    "pulse_3D_day",
                    "pulse_3D_swing",
                }
            ]
            common_ready_at = max(common_starts) if len(common_starts) == 4 else pd.NaT

            for event in events:
                # Exact app rendering permits Pulse's shorter early normalization window,
                # but efficacy comparisons wait for 200 finite momentum samples.
                if not comparable_event(event, pd.Timestamp(args.start)):
                    continue
                obs = _event_observation(event, daily, (10, 21, 42), args.commission_bps, args.slippage_bps)
                if obs:
                    obs["data_quality"] = quality
                    obs["common_ready_at"] = common_ready_at
                    observations.append(obs)

            # Synthetic prior-close opens are useful for signal-shape diagnostics but are
            # not execution data. Never let them enter the TP/SL ledger.
            if quality != "real_ohlc":
                continue

            atr3 = trend_state(bars3, 5)["atr"]
            oracle_core = [
                e for e in oracle if e.family in {"golden_buy", "golden_sell_internal"}
            ]
            oracle_structure = [
                e
                for e in oracle
                if e.family in {"golden_buy", "golden_sell_structure_current"}
            ]
            variants = {
                "oracle_next_open": (oracle_core, dict()),
                "oracle_tp_1.5_2.5_3.5": (
                    oracle_core,
                    dict(targets=(1.5, 2.5, 3.5)),
                ),
                "oracle_tp_risk": (
                    oracle_core,
                    dict(
                        targets=(1.5, 2.5, 3.5),
                        risk_stop_atr=1.5,
                        ratchet_after_tp=True,
                    ),
                ),
                "oracle_tp_risk_trend_exit": (
                    oracle_core,
                    dict(
                        targets=(1.5, 2.5, 3.5),
                        risk_stop_atr=1.5,
                        ratchet_after_tp=True,
                        trend_exits=[e for e in events if e.family == "trend_3D_s5"],
                    ),
                ),
                "oracle_tp_risk_structure_replace": (
                    oracle_structure,
                    dict(
                        targets=(1.5, 2.5, 3.5),
                        risk_stop_atr=1.5,
                        ratchet_after_tp=True,
                    ),
                ),
                "oracle_tp_risk_structure_add": (
                    oracle_core,
                    dict(
                        targets=(1.5, 2.5, 3.5),
                        risk_stop_atr=1.5,
                        ratchet_after_tp=True,
                        trend_exits=[
                            e
                            for e in oracle
                            if e.family == "golden_sell_structure_current"
                        ],
                    ),
                ),
            }
            window_start = max(pd.Timestamp(args.start), pd.Timestamp(daily.index[0]))
            split = pd.Timestamp(args.split)
            policy_periods = {
                "all": daily.loc[daily.index >= window_start],
                "train": daily.loc[(daily.index >= window_start) & (daily.index < split)],
                "holdout": daily.loc[daily.index >= max(window_start, split)],
            }
            for policy, (policy_events, kwargs) in variants.items():
                for period, policy_daily in policy_periods.items():
                    if len(policy_daily) < 100:
                        continue
                    metrics = simulate_oracle_policy(
                        policy_daily,
                        policy_events,
                        atr3,
                        commission_bps=args.commission_bps,
                        slippage_bps=args.slippage_bps,
                        **kwargs,
                    )
                    if metrics and metrics.get("trades"):
                        policy_rows.append(
                            {
                                "symbol": symbol,
                                "period": period,
                                "policy": policy,
                                **metrics,
                            }
                        )
        except Exception as exc:  # keep a batch research run moving, but disclose every skip
            skipped[symbol] = f"{type(exc).__name__}: {exc}"
        if args.progress and (num % 25 == 0 or num == len(symbols)):
            print(f"processed {num}/{len(symbols)}", flush=True)

    obs_frame = pd.DataFrame(observations)
    split_at = pd.Timestamp(args.split)
    families = sorted({e.family for e in all_events})
    comparable_events = [
        e
        for e in all_events
        if comparable_event(e, pd.Timestamp(args.start))
    ]
    lead_rows = [
        lead_conversion(comparable_events, family, availability)
        for family in families
        if family.startswith("pulse_")
        or family.startswith("trend_")
        or family.startswith("golden_early_")
    ]
    if obs_frame.empty:
        real_obs = obs_frame
        proxy_obs = obs_frame
    else:
        real_obs = obs_frame.loc[obs_frame["data_quality"] == "real_ohlc"]
        proxy_obs = obs_frame.loc[obs_frame["data_quality"] != "real_ohlc"]
    result = {
        "meta": {
            "symbols_requested": len(symbols),
            "symbols_analyzed": len(set(e.symbol for e in all_events)),
            "events": len(all_events),
            "observations": len(observations),
            "start": args.start,
            "train_holdout_split": args.split,
            "commission_bps": args.commission_bps,
            "slippage_bps": args.slippage_bps,
            "data_quality": data_quality,
            "skipped": skipped,
            "limitations": [
                "current-listing/survivorship-biased local universe",
                "multiple hypotheses inspected; holdout is diagnostic, not untouched after this run",
                "daily OHLC cannot reveal TP-vs-SL ordering inside a candle; stop-first is used",
                "Trend and Pulse are the app's clean-room approximations, not BigBeluga formula parity",
                "canonical IPO-phased completed bars are a fusion counterfactual, not current ChartPanel clock parity",
                "real-OHLC execution and synthetic prior-close proxy cohorts are reported separately",
                "train and holdout policy rows independently reset flat at each window boundary",
                "the structure-exit row tests the current display warning clock, which still needs canonicalization",
            ],
        },
        "signal_summary_real_common": summarize_observations(
            real_obs,
            split_at,
            common_window=True,
        ),
        "signal_summary_real_available": summarize_observations(real_obs, split_at),
        "signal_summary_proxy_common": summarize_observations(
            proxy_obs,
            split_at,
            common_window=True,
        ),
        "lead_conversion": lead_rows,
        "policy_summary": summarize_policies(policy_rows),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--terminal-data", default=str(DEFAULT_TERMINAL_DATA))
    parser.add_argument("--deep-data", default=str(DEFAULT_DEEP_DATA))
    parser.add_argument("--symbols", default="", help="Comma-separated symbol allow-list")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--start", default="2021-01-01")
    parser.add_argument("--split", default="2024-01-01")
    parser.add_argument("--trend-sens", default="3,5,7")
    parser.add_argument("--commission-bps", type=float, default=3.0)
    parser.add_argument("--slippage-bps", type=float, default=1.0)
    parser.add_argument("--progress", action="store_true")
    parser.add_argument("--out", default="", help="Optional JSON output path")
    args = parser.parse_args()
    result = run(args)
    text = json.dumps(result, indent=2, default=str)
    if args.out:
        Path(args.out).write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
