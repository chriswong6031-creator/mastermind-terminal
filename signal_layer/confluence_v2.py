"""GC v2 signal emitter — the validated no-cut / graded / display program.

WHY THIS FILE EXISTS
--------------------
The 2026-07-06 pre-registered evaluation (memory: gc-v2-signal-program) validated a
three-layer product on top of the immutable oracle ``confluence.py``:

  * SCORED    = **no-cut** exits: exit on ``CS & ~strong_bull`` ONLY. ``revSell`` is
                DEMOTED to a display caution — it is NOT a scored exit (removing it as a
                scored exit is the whole X1 win: WR 51.4→56.5, expectancy +48%, shakeouts
                11.1→3.9%, 2022 improves).
  * GRADED    = recipe **quality tier** per BUY/REBUY (A+ ≥80 / Quality ≥65 / base),
                ported VERBATIM from the E-phase ``e_factors.SCORE_LEGS/VETOES`` recipe.
                NEVER a hard gate (third repeat of the program-wide score-not-gate law).
  * DISPLAY   = keeper **quality** per BUY/REBUY (take/block/pending, the CHARTER §7
                contract, ported VERBATIM from ``buy_filters.buy_filter_verdict``); the
                early anticipation **dot** (GRID_GATE form (a)); the ⚠ ARM / ⛔
                CONFIRM structure-break **warnings** (X-phase ARM→CONFIRM, DISPLAY only).

The oracle ``confluence.py`` is UNTOUCHED (it is the parity artifact). Everything here
composes its output frame. Every stream is **close-only-safe** (no intrabar OHLC
required) so CN/HK names — which only have daily closes — get the full v2 surface.
Volume-dependent recipe legs degrade to 0 with ``score_basis="partial"`` when volume is
absent, and cohort-dependent legs degrade to 0 with ``score_basis="partial"`` when the
symbol has no sector or fewer than 5 sector peers with data.

Reference implementations reproduced (see the pre-reg lab, /tmp/gc-lab):
  * exits + entry            : confluence.simulate(fixed=True) minus revSell
  * keeper verdict + shift   : research/signal_engine/buy_filters.py, markers_x6.py
  * recipe score legs/vetoes : harness/e_factors.py production_score_on_3d
  * ARM/CONFIRM warnings      : harness/x_exits.py _arm_event_daily_stream + swing lows
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from . import confluence as C
from .washout_override import (RECLAIM_OVERRIDE_TAKE_QUALITY, atr14,
                               reclaim_override_quality_reason, stop_reference)

_log = logging.getLogger(__name__)

# ── graded-tier thresholds (pre-reg locked; e_factors SCORE_THRESH + §9 A+ bar) ──
TIER_QUALITY = 65      # Quality tier: score >= 65
TIER_APLUS = 80        # A+ tier:      score >= 80
COHORT_MIN_PEERS = 5   # recipe cohort legs need >= 5 sector peers with data (else partial)

# ── recipe factor point allocation (VERBATIM from e_factors.SCORE_LEGS) ──
SCORE_LEG_POINTS = {
    "washout": 25, "rs_inflection": 20, "anti_chase": 20,
    "structure": 15, "volume": 10, "monthly": 10,
}

# ── X-phase ARM constants (VERBATIM from x_exits.py; NOT tuned) ──
ARM_K3_MIN = 75          # ARM leg A gate: 3D k>=75 OR d>=75
ARM_KSHIFT_MIN = 80      # ARM leg B: 3D stoch bear cross with k.shift(1)>=80
ARMED_WINDOW = 15        # ARMED window in daily sessions, then disarm
PIVOT_RADIUS = 3         # CONFIRM swing low: local close min, radius 3

# ── keep the side-channel arrays bounded (spec: last 40 each) ──
SIDE_CHANNEL_CAP = 40

# ── repair grammar (RE-ENTRY lane, 2026-07-15 Mag7 rotation-miss directive) ──
# A gate verdict is evaluated once, on its own bar; these two event forms answer
# "the engine said no / said exit — and the market then repaired it".
RECLAIM_DEBOUNCE_BARS = 4   # 3D bars flat after a SELL before a reclaim may fire (~12 sessions)
REPAIR_WINDOW_BARS = 8      # a blocked entry may re-fire while its cross is live, within this window

# ── own-name bottom-watch grammar (display/watch only; frozen research definition) ──
DD_LOOKBACK_3D = 84        # W2a: approximately 252 sessions on the 3D grid
DD_MIN = -0.35             # W2a: drawdown from the trailing high
MO_DWELL_MIN = 3           # W2b: consecutive prior-closed monthly StochRSI-D<20 bars
OS_WINDOW = 8              # W3: a 3D StochRSI-D<20 visit within the last 8 bars
BOTTOM_STOP_ATR_MULT = 0.5

# A structure stop remains valid risk control. This second, display-only lane recognizes
# the failed-breakdown shape when price closes back over that exact level quickly.
STOP_SWEEP_WINDOW_SESSIONS = 5
STOP_SWEEP_ATR_MULT = 0.5

# Symbol-class eligibility: trend-reclaim semantics require an asset that can HOLD a
# reclaimed price level. Leveraged/inverse products and futures-roll wrappers decay by
# construction, so "price back above the old sell level" carries no information there —
# the 2026-07-15 panel's only structural losers were exactly this class (SOXS −25%,
# SQQQ −21%, BITO −12% per-name reclaim expectancy vs +6.3% panel median).
# Name-based (works across the full universe without a new metadata field) and
# conservative: only unambiguous decay markers on fund-like names disqualify.
import re as _re

_FUNDISH = (" etf", " etn", " shares", " fund", " trust",
            "proshares", "direxion", "graniteshares", "ipath")
_SHORT_TERM = _re.compile(r"short[\s-]term", _re.I)
_LEVERED = _re.compile(r"\b\d(?:\.\d+)?x\b", _re.I)                  # 2x / 3X / 1.5x
_ULTRA = _re.compile(r"\bultra(?:pro|short)?\b", _re.I)              # ProShares Ultra family
# "strategy" on a fund-like name = a 40-Act futures wrapper (Bitcoin Strategy, Managed
# Futures Strategy…) — contango decay, same class as VIX products.
_FUTURES = _re.compile(r"\bfutures?\b|\bstrategy\b|\bvix\b", _re.I)
# metadata backstop: decay-class tickers the NAME rule cannot see — VIX-family rows that
# ship no name to classify, plus futures-roll commodity wrappers whose names carry no
# decay marker ("United States Oil Fund" holds WTI futures; contango drag, same class).
_TICKER_BACKSTOP = {"UVXY", "SVXY", "VIXY", "VXX", "TVIX", "VIXM", "USO", "UNG"}


def reclaim_eligible(name: str | None, sym: str | None = None) -> bool:
    """True when the RE-ENTRY repair lane may fire for this security."""
    if sym and sym.upper() in _TICKER_BACKSTOP:
        return False
    if not name:
        return True                       # unknown names stay eligible (conservative default)
    n = f" {name.lower()} "
    if _re.search(r"\bvix\b", n):
        return False                      # VIX products decay regardless of wrapper branding
    if not any(k in n for k in _FUNDISH):
        return True                       # operating companies are always eligible
    if _LEVERED.search(n):
        return False
    if "inverse" in n or _re.search(r"\bbear\b", n):
        return False
    # fixed-income names use "short"/"ultra-short" as MATURITY words (iShares Short
    # Treasury Bond, JPMorgan Ultra-Short Income) — not a short position; keep eligible.
    if _re.search(r"\b(treasur|bond|income|duration|bill)\w*\b", n):
        return True
    if _ULTRA.search(n):
        return False
    if _re.search(r"\bshort\b", n) and not _SHORT_TERM.search(n):
        return False
    if _FUTURES.search(n):
        return False
    return True


# ════════════════════════════════════════════════ v2 exit / entry streams ═══
def _override_series(rows: pd.DataFrame, override_ok) -> pd.Series:
    """Normalize the override input to a bool Series on ``rows``. Absent ⇒ all-False.

    Accepts the ``{positional row index: ctx}`` map ``override_entries`` returns (the
    production shape), any bool array/Series of the right length, or None.
    """
    if override_ok is None:
        return pd.Series(False, index=rows.index)
    if isinstance(override_ok, dict):
        arr = np.zeros(len(rows), dtype=bool)
        for pos in override_ok:
            i = int(pos)
            if 0 <= i < len(arr):
                arr[i] = True
        return pd.Series(arr, index=rows.index)
    if isinstance(override_ok, pd.Series):
        return override_ok.reindex(rows.index).fillna(False).astype(bool)
    return pd.Series(np.asarray(override_ok, dtype=bool), index=rows.index)


def v2_streams(sig: pd.DataFrame, override_ok=None) -> dict:
    """The GC v2 SCORED entry/exit event streams on the 3D-row grid.

    ENTER  = (CB | revBuy) & (~bear_block | override_ok)   (era gc_v2_wo1)
    EXIT   = (CS & ~strong_bull)                  (revSell DROPPED — the no-cut change)

    ``override_ok`` is the washout-override grant per row (``override_entries``): the
    ratified conditional that a ``bear_block``-vetoed CB/revBuy IS taken when the name's
    thematic-basket peers sit at or below the notch (packet §2, 25%). It is EXACTLY one
    logical condition wide — pre-fence the enter mask read ``& ~bear_block``, and with no
    grant (``override_ok=None``, the artifact-absent fallback) it still does, bit for bit.

    Returns bool Series aligned to the non-NaN signal rows (matching the sim contract).
    This is the exact stream the X1FULL / X6 lab exits used, minus revSell on exit.

    Note the ASYMMETRY with ``keeper_quality_map`` below, which is the whole fidelity
    ruling: a granted fire enters HERE but is never keeper-graded, because the keeper's
    counter-trend leg would re-refuse it (see that function's docstring)."""
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    ovr = _override_series(rows, override_ok)
    enter = ((rows["CB"] | rows["revBuy"]) & (~rows["bear_block"] | ovr)).astype(bool)
    exit_ = (rows["CS"] & ~rows["strong_bull"]).astype(bool)
    return {"enter": enter, "exit": exit_}


def override_entries(sig: pd.DataFrame, symbol: str | None, gate) -> dict:
    """Ask the live washout gate about every ``bear_block``-vetoed raw buy in this name.

    Returns ``{positional row index (non-NaN grid): override_ctx}`` — the fires the gate
    TAKES. ``gate`` is any object with ``override_for(ticker, ts, known_ts) -> ctx | None``
    (production: ``washout_override.WashoutStamper``); None ⇒ ``{}``, which is the
    artifact-absent fallback and leaves the emission identical to the pre-fence era.

    Both coordinates are passed because they answer different questions: ``ts`` (the 3D bar
    OPEN) is the ledger's identity for this fire, and ``known_ts`` (the session it became
    observable) is what the point-in-time rule compares against the basket state's date.
    """
    if gate is None or not symbol:
        return {}
    need = {"macd", "sig", "k", "d", "rsi14"}
    if not len(sig) or not need.issubset(sig.columns) or "bear_block" not in sig.columns:
        return {}
    rows = sig.dropna(subset=list(need))
    if not len(rows):
        return {}
    cand = ((rows["CB"] | rows["revBuy"]) & rows["bear_block"]).to_numpy(dtype=bool)
    if not cand.any():
        return {}
    known = rows["known_ts"] if "known_ts" in rows.columns else None
    out: dict[int, dict] = {}
    for pos in np.flatnonzero(cand):
        pos = int(pos)
        ts = rows.index[pos].strftime("%Y-%m-%d")
        kts = ts
        if known is not None:
            kv = known.iloc[pos]
            if kv is not None and not pd.isna(kv):
                kts = pd.Timestamp(kv).strftime("%Y-%m-%d")
        try:
            ctx = gate.override_for(symbol, ts, kts)
        except Exception as e:  # noqa: BLE001 — a gate fault refuses, it never breaks a slice
            _log.warning("washout override gate failed for %s %s (%s) — fire stays refused",
                         symbol, ts, e)
            continue
        if isinstance(ctx, dict) and ctx:
            out[pos] = ctx
    return out


# ════════════════════════════════════════════════ keeper quality (display) ══
# VERBATIM port of research/signal_engine/buy_filters.py (the CHARTER §5 KEEPER).
# Kept self-contained here so signal_layer has no cross-repo import; the math is
# identical function-for-function (swing_highs / bearish_divergence / reclaim_and_hold /
# buy_filter_verdict) and produces the exact take/block/pending strings of the chart
# marker contract (CHARTER §7).
def _swing_highs(s: pd.Series, w: int = 2) -> list[int]:
    v = s.to_numpy()
    return [i for i in range(w, len(v) - w) if v[i] == v[i - w:i + w + 1].max()]


def _bearish_divergence(i, close, macd, hi, look: int = 12) -> bool:
    cv, mv = close.to_numpy(), macd.to_numpy()
    rh = [h for h in hi if i - look < h <= i]
    return bool(len(rh) >= 2 and cv[rh[-1]] > cv[rh[-2]] and mv[rh[-1]] < mv[rh[-2]])


def _reclaim_and_hold(i, sig, n):
    """The keeper's two-leg confirmation. Returns ``(ok, reason, relievable)``.

    THE MATH IS UNCHANGED — verbatim from the CHARTER §5 keeper. The third return value is
    new and is pure BOOKKEEPING about which branch produced the answer: ``relievable`` is
    True at exactly one place, the counter-trend leg where the next-bar HOLD PASSED and only
    the 200-reclaim failed. That is the Arm-T waiver's cohort (Macro Dashboard
    research/RECLAIM_VETO_CONDITIONAL_PREREG.md §5, RATIFIED 2026-08-10).

    WHY A FLAG AND NOT THE REASON STRING (the whole point of the adjudication): the string
    ``"counter-trend, no 200-reclaim/hold"`` is returned for BOTH ``held=False`` and
    ``reclaim=False``. Selecting the waiver's cohort by that literal would sweep in hold-leg
    failures — the mis-specification that had to be corrected pre-ratification, and the same
    collapsed-literal trap the macro engine hit in #4583. The branch knows which leg failed;
    the string does not. Read the flag.
    """
    c, a = sig["close"], sig["above200"]
    if i + 1 >= n:
        return None, "pending confirmation", False
    held = bool(c.iloc[i + 1] > c.iloc[i])
    below, wkdn = (not bool(a.iloc[i])), (not bool(sig["w_bull"].iloc[i]))
    if below and wkdn:                                   # counter-trend: raise the bar
        if i + 2 >= n:
            return None, "pending confirmation", False
        reclaim = bool(a.iloc[i + 1]) or bool(a.iloc[i + 2])
        ok = held and reclaim
        # RELIEVABLE ⇔ the hold leg carried and only the reclaim leg did not. ``held and not
        # reclaim`` — never ``not ok``, which would also be true when the hold leg failed.
        return (ok,
                ("reclaimed 200 & held" if ok else "counter-trend, no 200-reclaim/hold"),
                bool(held and not reclaim))
    return held, ("held confirmation" if held else "failed reclaim-and-hold"), False


def _keeper_verdict_ex(i: int, sig_reset: pd.DataFrame, hi: list[int]) -> tuple[str, str, bool]:
    """``keeper_verdict`` + the relievable flag. The form ``keeper_quality_map`` needs.

    ``relievable`` is False on every bearish-divergence block by construction: that veto
    returns before the reclaim legs are ever evaluated, so a bear-div block is not a
    reclaim failure and the waiver must never see one (prereg §4 — bearish-divergence
    keeper blocks are untouched by this family).
    """
    n = len(sig_reset)
    if _bearish_divergence(i, sig_reset["close"], sig_reset["macd"], hi):
        return "block", "veto: bearish divergence", False
    ok, reason, relievable = _reclaim_and_hold(i, sig_reset, n)
    if ok is None:
        return "pending", reason, False
    return ("take" if ok else "block"), reason, (relievable and not ok)


def keeper_verdict(i: int, sig_reset: pd.DataFrame, hi: list[int]) -> tuple[str, str]:
    """Grade a raw confluence buy at *positional* row ``i`` of the reset-index frame
    ``sig_reset``. Returns ``(verdict, reason)`` with verdict in {take, block, pending}.
    ``hi`` = precomputed ``_swing_highs(sig_reset['close'])`` (compute once per name).
    Order of operations identical to buy_filters.buy_filter_verdict / signal_quality.

    The PRE-WAIVER verdict, unchanged and unwaivable: this is the parity surface every
    engine diff is taken against, so the washout waiver deliberately does not reach it.
    ``keeper_quality_map`` is where the ratified conditional applies."""
    verdict, reason, _ = _keeper_verdict_ex(i, sig_reset, hi)
    return verdict, reason


def keeper_quality_map(sig: pd.DataFrame, *, symbol: str | None = None, gate=None) -> dict:
    """Map each raw BUY/REBUY bar (CB|revBuy & ~bear_block) to its keeper verdict.

    Returns ``{bar_index(int, positional in the non-NaN rows): {verdict, reason,
    relievable, override_ctx}}``. ``override_ctx`` is present only on a WAIVED fire.
    The counter-trend fill shift (used for MARKER placement, not for the verdict) is
    ``2 if below200 & ~w_bull else 1`` — mirrored in ``build_v2`` when it stamps quality
    onto the emitted signal. Only bars where a raw buy fired are graded (KEEPER contract).

    THE WASHOUT-OVERRIDE (bear_block) CLASS IS DELIBERATELY ABSENT FROM THIS MASK — do not
    "fix" it. ``& ~bear_block`` here is not a duplicate of the enter mask; it is the KEEPER's
    cohort, and a washout-override fire must never enter it. ``bear_block`` requires
    below-200, so every override fire is by construction counter-trend, and
    ``_reclaim_and_hold``'s counter-trend leg would re-refuse nearly all of them. Routing
    override fires through here would ship a far stricter rule than the one the packet
    gauntleted — a silent substitution nothing downstream could detect. That construction
    enters on the fire itself, so a granted fire bypasses the keeper entirely and is emitted
    as ``contracts.OVERRIDE_TAKE_QUALITY``.

    ── THE RECLAIM WAIVER (era gc_v2_wo2, Arm T) ────────────────────────────────────────
    This function is where the OTHER ratified waiver lands, and it is a different animal:
    it does not bypass the keeper, it relaxes ONE LEG of it, in place, for one cohort.
    ``symbol`` + ``gate`` wire it (both required; either absent ⇒ this function is
    bit-identical to the pre-wo2 build). At a block that is RELIEVABLE — the counter-trend
    branch where the next-bar HOLD PASSED and only the 200-reclaim failed — the gate is
    asked whether the name qualifies in the washout state at the fire's own known date. If
    it does, the verdict becomes ``reclaim_override_take``: a take-class entry that scores
    off the ordinary recipe like any other keeper take.

    THREE THINGS THIS WAIVER MUST NEVER DO, each load-bearing (prereg §4/§5):
      * relieve a HOLD-leg failure. The gauntlet ran on the relievable subset only; the
        HL 2026-06-16 shape is a hold failure and stays blocked. ``relievable`` comes from
        the BRANCH, never from the reason string, which collapses both legs into one
        literal — the mis-specification that had to be corrected pre-ratification;
      * touch a bearish-divergence block. That veto returns before the reclaim legs run, so
        ``_keeper_verdict_ex`` reports ``relievable=False`` and the gate is never asked;
      * reach backwards. The gate's PIT rule refuses a fire that predates the state, so a
        waiver can no more act on history than the enter mask can.
    """
    src = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    rows = src.reset_index(drop=True)
    if len(rows) < 3:
        return {}
    hi = _swing_highs(rows["close"])
    raw_buy = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).to_numpy()
    ask = getattr(gate, "reclaim_override_for", None) if (gate is not None and symbol) else None
    known = src["known_ts"] if "known_ts" in src.columns else None
    out = {}
    for pos in np.flatnonzero(raw_buy):
        pos = int(pos)
        verdict, reason, relievable = _keeper_verdict_ex(pos, rows, hi)
        entry = {"verdict": verdict, "reason": reason, "relievable": relievable}
        if relievable and ask is not None:
            ts = src.index[pos].strftime("%Y-%m-%d")
            kts = ts
            if known is not None:
                kv = known.iloc[pos]
                if kv is not None and not pd.isna(kv):
                    kts = pd.Timestamp(kv).strftime("%Y-%m-%d")
            try:
                ctx = ask(symbol, ts, kts)
            except Exception as e:  # noqa: BLE001 — a gate fault refuses, never breaks a slice
                _log.warning("reclaim waiver gate failed for %s %s (%s) — block stands",
                             symbol, ts, e)
                ctx = None
            if isinstance(ctx, dict) and ctx:
                entry["verdict"] = RECLAIM_OVERRIDE_TAKE_QUALITY
                entry["reason"] = reclaim_override_quality_reason(ctx)
                entry["override_ctx"] = ctx
        out[pos] = entry
    return out


# ════════════════════════════════════════════════ recipe score (graded) ═════
# VERBATIM port of harness/e_factors.py: the §9 bottom_signal recipe as per-fire code.
# The STUDY's own indicator math (factors.py) is reproduced distinct from the oracle so
# the port stays faithful. Cohort/RS/sector-fresh legs use the equal-weight sector-peer
# basket (the disclosed D5 adaptation); the caller passes those in as cohort fractions.
def _f_rsi(close: pd.Series, n: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / n, adjust=False, min_periods=n).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _f_macd(close: pd.Series, fast=12, slow=26, signal=9) -> pd.DataFrame:
    line = (close.ewm(span=fast, adjust=False, min_periods=slow).mean()
            - close.ewm(span=slow, adjust=False, min_periods=slow).mean())
    sig = line.ewm(span=signal, adjust=False, min_periods=signal).mean()
    return pd.DataFrame({"macd": line, "signal": sig, "hist": line - sig})


def _f_stoch_rsi(close, rsi_n=14, stoch_n=14, k_n=3, d_n=3) -> pd.DataFrame:
    rr = _f_rsi(close, rsi_n)
    lo = rr.rolling(stoch_n, min_periods=stoch_n).min()
    hi = rr.rolling(stoch_n, min_periods=stoch_n).max()
    raw = 100 * (rr - lo) / (hi - lo).replace(0, np.nan)
    k = raw.rolling(k_n, min_periods=k_n).mean()
    d = k.rolling(d_n, min_periods=d_n).mean()
    return pd.DataFrame({"rsi": rr, "k": k, "d": d})


def _f_tf_bars(df: pd.DataFrame, rule: str):
    groups, known = [], []
    for _, g in df.resample(rule, label="right", closed="right"):
        if g.empty:
            continue
        groups.append({"close": g["close"].iloc[-1], "high": g["high"].max(),
                       "low": g["low"].min(), "volume": g["volume"].sum(min_count=1)})
        known.append(g.index[-1])
    bars = pd.DataFrame(groups, index=pd.DatetimeIndex(known))
    return bars, pd.Series(known, index=bars.index)


def _bullish_divergence(price: pd.Series, osc: pd.Series, window: int = 40) -> pd.Series:
    half = max(10, window // 2)
    p_recent = price.rolling(half, min_periods=half).min()
    p_prior = price.shift(half).rolling(half, min_periods=half).min()
    o_recent = osc.where(price == p_recent).rolling(half, min_periods=1).min()
    o_prior = osc.shift(half).where(price.shift(half) == p_prior).rolling(half, min_periods=1).min()
    return ((p_recent <= p_prior * 1.03) & (o_recent > o_prior)).fillna(False)


def _monthly_oversold_dwell(is_os: pd.Series) -> pd.Series:
    vals, count = [], 0
    for flag in is_os.fillna(False):
        count = count + 1 if flag else 0
        vals.append(count)
    return pd.Series(vals, index=is_os.index)


def _bottom_signal_features(close, high, low, volume, have_volume: bool) -> pd.DataFrame:
    """Per-DAY factor legs (e_factors.bottom_signal_features VERBATIM). ``have_volume``
    False ⇒ the two volume legs contribute False (score_basis becomes partial upstream)."""
    c = close
    f = pd.DataFrame(index=c.index)
    df = pd.DataFrame({"close": c, "high": high, "low": low, "volume": volume})

    f["dist_60d_low"] = c / c.rolling(60, min_periods=20).min() - 1
    f["rsi14"] = _f_rsi(c, 14)
    f["rsi_bull_div_40d"] = _bullish_divergence(c, f["rsi14"], 40)
    hist = _f_macd(c)["hist"]
    f["macd_hist_bull_div_40d"] = _bullish_divergence(c, hist, 40)
    prior20 = df["low"].rolling(20, min_periods=10).min().shift(5)
    under = df["low"].rolling(5, min_periods=1).min() < prior20
    f["failed_breakdown_20d"] = under & (c > prior20)
    prior60 = df["low"].rolling(60, min_periods=20).min().shift(10)
    under60 = df["low"].rolling(10, min_periods=1).min() < prior60
    f["failed_breakdown_60d"] = under60 & (c > prior60)
    mid = c.rolling(20, min_periods=20).mean()
    sd = c.rolling(20, min_periods=20).std()
    lower = mid - 2 * sd
    f["bollinger_reclaim"] = (df["low"].rolling(5, min_periods=1).min() < lower) & (c > lower)

    if have_volume:
        vol20 = df["volume"].rolling(20, min_periods=10).mean()
        f["flush_vol_2p0"] = (df["volume"].rolling(10, min_periods=5).max() / vol20) > 2.0
        up_vol = df["volume"].where(c.pct_change() > 0).rolling(10, min_periods=5).sum()
        down_vol = df["volume"].where(c.pct_change() < 0).rolling(10, min_periods=5).sum()
        f["up_down_vol_ratio_10d"] = up_vol / down_vol.replace(0, np.nan)
    else:                                    # missing volume -> legs contribute 0 (partial)
        f["flush_vol_2p0"] = pd.Series(False, index=c.index)
        f["up_down_vol_ratio_10d"] = pd.Series(np.nan, index=c.index)

    m_bars, _mk = _f_tf_bars(df, "ME")
    ms = _f_stoch_rsi(m_bars["close"])
    dwell = _monthly_oversold_dwell(ms["d"] < 20)
    f["monthly_os_dwell"] = dwell.reindex(c.index, method="ffill")
    mm = _f_macd(m_bars["close"])
    f["monthly_macd_hist_rising"] = (mm["hist"] > mm["hist"].shift(1)).reindex(c.index, method="ffill")
    return f


def recipe_score_on_3d(sig, close, high, low, volume, *, have_volume,
                       sector_basket, panel_basket, cohort_frac_daily):
    """Per-3D-row recipe score (0..100) + tier, ported VERBATIM from
    e_factors.production_score_on_3d. Every daily leg is mapped to the 3D row by the
    bar's CLOSE session date (leak-free).

    Cohort inputs (the D5 disclosed adaptation):
      * ``cohort_frac_daily``  — daily fraction of sector peers in 2W-oversold state
        (>=0.40 fires the washout leg). None ⇒ washout leg 0 (partial).
      * ``sector_basket``      — equal-weight sector-peer index level (daily). None ⇒
        rs_inflection leg 0 + sector-fresh veto off (partial).
      * ``panel_basket``       — whole-panel equal-weight index (RS-both-falling veto).

    Returns ``(score: pd.Series, tier: pd.Series[str], partial: bool)`` indexed by the
    3D open dates. ``partial`` True when volume missing OR no sector basket/cohort — the
    slice then records ``score_basis:"partial"`` (spec)."""
    open_dates, close_dates, _px = C._3d_groups(close, 0)
    di = close.index
    cd = pd.DatetimeIndex(close_dates)
    dpos = np.clip(di.searchsorted(cd, side="left"), 0, len(di) - 1)

    feats = _bottom_signal_features(close, high, low, volume, have_volume)

    def leg_d2t(daily_bool):
        return daily_bool.reindex(di).fillna(False).to_numpy()[dpos]

    def num_d2t(daily_num):
        return daily_num.reindex(di).to_numpy()[dpos]

    dist60 = num_d2t(feats["dist_60d_low"])

    have_cohort = cohort_frac_daily is not None
    have_basket = sector_basket is not None
    partial = (not have_volume) or (not have_cohort) or (not have_basket)

    # washout leg (25)
    if have_cohort:
        wsh = num_d2t(cohort_frac_daily.reindex(di).ffill()) >= 0.40
    else:
        wsh = np.zeros(len(cd), dtype=bool)

    # RS-inflection leg (20)
    if have_basket:
        b = sector_basket.reindex(di).ffill()
        rs = close / b
        rs20 = rs / rs.shift(20) - 1
        rs_hl = (rs.rolling(20, min_periods=10).min()
                 > rs.rolling(20, min_periods=10).min().shift(20))
        rs_infl_daily = (rs20 > 0) | rs_hl.fillna(False)
    else:
        rs_infl_daily = pd.Series(False, index=di)
    rs_infl = leg_d2t(rs_infl_daily)

    anti = dist60 <= 0.12                                  # anti-chase leg (20)

    struct_daily = (feats["rsi_bull_div_40d"] | feats["macd_hist_bull_div_40d"]
                    | feats["failed_breakdown_20d"] | feats["failed_breakdown_60d"]
                    | feats["bollinger_reclaim"])
    struct = leg_d2t(struct_daily.fillna(False))          # structure leg (15)

    vol_daily = feats["flush_vol_2p0"].fillna(False) | (feats["up_down_vol_ratio_10d"] >= 1.3)
    vol = leg_d2t(vol_daily.fillna(False))                # volume leg (10)

    mon_daily = (((feats["monthly_os_dwell"] >= 1) & (feats["monthly_os_dwell"] <= 3))
                 | feats["monthly_macd_hist_rising"].fillna(False))
    mon = leg_d2t(mon_daily.fillna(False))                # monthly leg (10)

    score = (SCORE_LEG_POINTS["washout"] * wsh + SCORE_LEG_POINTS["rs_inflection"] * rs_infl
             + SCORE_LEG_POINTS["anti_chase"] * anti + SCORE_LEG_POINTS["structure"] * struct
             + SCORE_LEG_POINTS["volume"] * vol + SCORE_LEG_POINTS["monthly"] * mon)

    # ── hard vetoes (§9): a vetoed bar CANNOT reach a graded tier (score forced to 0) ──
    veto_above = dist60 > 0.15
    dwell3 = num_d2t(feats["monthly_os_dwell"])
    veto_dwell = dwell3 >= 6
    pb = panel_basket.reindex(di).ffill() if panel_basket is not None else None
    if pb is not None:
        rs_p = close / pb
        rs_p20 = rs_p / rs_p.shift(20) - 1
        rs_p_fall = num_d2t(rs_p20) < 0
    else:
        rs_p_fall = np.zeros(len(cd), dtype=bool)
    if have_basket:
        b = sector_basket.reindex(di).ffill()
        rs_s = close / b
        rs_s20 = rs_s / rs_s.shift(20) - 1
        rs_s_fall = num_d2t(rs_s20) < 0
        sec_fresh = b <= b.rolling(60, min_periods=20).min()
        veto_sec_fresh = leg_d2t(sec_fresh.fillna(False))
    else:
        rs_s_fall = np.ones(len(cd), dtype=bool)
        veto_sec_fresh = np.zeros(len(cd), dtype=bool)
    veto_rs_both = rs_p_fall & rs_s_fall
    vetoed = veto_above | veto_dwell | veto_rs_both | veto_sec_fresh

    # The raw §9 score is PRESERVED for display (matches e_factors byte-for-byte on
    # un-vetoed bars — validated). The TIER, however, is gated on the hard vetoes: a
    # vetoed bar can NEVER reach a graded tier (a §9 hard veto = "not a quality bottom"),
    # so it lands at "base" regardless of its raw point total. This mirrors e_factors'
    # ``passed = (score>=65) & ~vetoed`` (score-not-gate law): the score is a display
    # number, the veto is what disqualifies the grade.
    score = score.astype(float)
    graded_ok = (~vetoed)
    tier = np.where(graded_ok & (score >= TIER_APLUS), "aplus",
                    np.where(graded_ok & (score >= TIER_QUALITY), "quality", "base"))
    return (pd.Series(score, index=open_dates),
            pd.Series(tier, index=open_dates), bool(partial))


# ════════════════════════════════════════════════ early anticipation dot ════
def _known_dates(rows: pd.DataFrame) -> pd.DatetimeIndex:
    """Availability dates for 3D rows, with a legacy fallback to their chart labels."""
    if "known_ts" not in rows.columns:
        return pd.DatetimeIndex(rows.index)
    values = []
    for ts, value in zip(rows.index, rows["known_ts"]):
        values.append(ts if value is None or pd.isna(value) else pd.Timestamp(value))
    return pd.DatetimeIndex(values)


def _early_dot_mask(sig: pd.DataFrame, close: pd.Series) -> pd.Series:
    """GRID_GATE form (a), aligned to the valid 3D rows.

    The 2B resample label is the LEFT edge of a pandas bucket, not the date on which the
    bucket's last price was observable. Mapping that label directly onto a 3D bar lets a
    later 2B close leak backwards. We instead relabel every 2B value by the bucket's last
    actual trading session, then join it to each 3D row by that row's ``known_ts``.
    """
    need = {"macd", "sig", "k", "d", "rsi14"}
    if not len(sig) or not need.issubset(sig.columns):
        return pd.Series(dtype=bool)
    rows = sig.dropna(subset=list(need))
    if len(rows) < C.CONF_W + 2:
        return pd.Series(False, index=rows.index, dtype=bool)

    k, d = rows["k"], rows["d"]
    stoch_bull = C.crossover(k, d)
    from_os = d.rolling(C.CONF_W).min() < C.OS

    dc = close.dropna().sort_index()
    sm = dc.resample("2B").last().dropna()
    if sm.empty:
        return pd.Series(False, index=rows.index, dtype=bool)
    known2 = dc.index.to_series().resample("2B").max().reindex(sm.index)
    valid = known2.notna()
    sm = sm.loc[valid]
    known2 = pd.DatetimeIndex(pd.to_datetime(known2.loc[valid].to_numpy()))
    m2, s2 = C.rsi_macd(sm)
    rising2 = (m2 - s2 > (m2 - s2).shift(1)).fillna(False)

    # Relabel by availability, de-duplicate defensively, then take the latest 2B state that
    # was already known when the 3D row itself closed.
    rising_known = pd.Series(rising2.to_numpy(dtype=bool), index=known2)
    rising_known = rising_known[~rising_known.index.duplicated(keep="last")].sort_index()
    row_known = _known_dates(rows)
    pos = rising_known.index.searchsorted(row_known, side="right") - 1
    mapped = np.zeros(len(rows), dtype=bool)
    ok = pos >= 0
    mapped[ok] = rising_known.to_numpy(dtype=bool)[pos[ok]]

    return (stoch_bull & from_os & pd.Series(mapped, index=rows.index)).fillna(False)


def early_dots(sig: pd.DataFrame, close: pd.Series) -> list[str]:
    """GRID_GATE anticipation form (a) — the EARLY pre-cross dot (~4.6d lead, hollow):

        3D StochRSI **bull cross from oversold**  AND  the 2D RSI-MACD histogram is
        **RISING** (pre-cross momentum).

    "From oversold" = the 3D StochRSI D dipped below OS(20) within the last CONF_W bars
    (the oracle's ``b1_from_os`` primitive). All math is the ORACLE's. Close-only-safe.
    Returns the list of 3D-open-date strings on which the dot fires (chronological)."""
    dot = _early_dot_mask(sig, close)
    return [ts.strftime("%Y-%m-%d") for ts in dot.index[dot.to_numpy()]]


# ═════════════════════════════════════ own-name washout / bottom watch ══════
def _map_prior_closed_monthly_dwell(rows: pd.DataFrame, daily_close: pd.Series) -> pd.Series:
    """Frozen monthly-oversold dwell, mapped by real availability dates.

    ``shift(1)`` is the production/preregistered prior-closed-month convention. The extra
    relabeling step fixes a separate issue: ``resample('ME')`` uses a calendar month-end
    label that may not be a session. Values are joined by the last actual session in their
    source bucket and the 3D row's actual known date.
    """
    dc = daily_close.dropna().sort_index()
    mo = dc.resample("ME").last().dropna()
    if mo.empty:
        return pd.Series(0, index=rows.index, dtype=int)
    known = dc.index.to_series().resample("ME").max().reindex(mo.index)
    valid = known.notna()
    mo = mo.loc[valid]
    known = pd.DatetimeIndex(pd.to_datetime(known.loc[valid].to_numpy()))
    _mk, md = C.stoch_rsi_kd(mo)
    prior_dwell = _monthly_oversold_dwell(md < C.OS).shift(1).fillna(0)
    available = pd.Series(prior_dwell.to_numpy(dtype=float), index=known)
    available = available[~available.index.duplicated(keep="last")].sort_index()

    row_known = _known_dates(rows)
    pos = available.index.searchsorted(row_known, side="right") - 1
    mapped = np.zeros(len(rows), dtype=float)
    ok = pos >= 0
    mapped[ok] = available.to_numpy(dtype=float)[pos[ok]]
    return pd.Series(mapped.astype(int), index=rows.index)


def washout_context(sig: pd.DataFrame, daily_close: pd.Series) -> dict | None:
    """Frozen, point-in-time own-name washout context on valid 3D rows.

    W1 ``bear_block``; W2 either a <=-35% trailing drawdown or at least three consecutive
    prior-closed monthly StochRSI-D<20 bars; W3 a 3D StochRSI-D<20 visit in the last eight
    bars. This is context only: it never weakens the classic ``bear_block`` entry rule.
    """
    need = {"macd", "sig", "k", "d", "rsi14", "close", "bear_block"}
    if not len(sig) or not need.issubset(sig.columns):
        return None
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < 20:
        return None

    close3 = rows["close"].astype(float)
    drawdown = close3 / close3.rolling(DD_LOOKBACK_3D, min_periods=20).max() - 1
    monthly_dwell = _map_prior_closed_monthly_dwell(rows, daily_close)
    recent_os = rows["d"].rolling(OS_WINDOW, min_periods=1).min() < C.OS
    bear = rows["bear_block"].fillna(False).astype(bool)
    washed = bear & ((drawdown <= DD_MIN) | (monthly_dwell >= MO_DWELL_MIN)) & recent_os
    raw_buy = (rows["CB"].fillna(False).astype(bool)
               | rows["revBuy"].fillna(False).astype(bool))
    return {
        "rows": rows.index,
        "known_ts": _known_dates(rows),
        "drawdown": drawdown.to_numpy(dtype=float),
        "monthly_dwell": monthly_dwell.to_numpy(dtype=int),
        "recent_oversold": recent_os.to_numpy(dtype=bool),
        "washed": washed.to_numpy(dtype=bool),
        "trig": (raw_buy & washed).to_numpy(dtype=bool),
    }


def _event_risk_metadata(
    fire_ts: str,
    known_ts: str,
    bar_opens: list[str],
    daily_close: pd.Series,
    high: pd.Series | None,
    low: pd.Series | None,
) -> dict:
    """PIT sweep low + ATR stop; close-derived proxy is explicit when OHLC is absent."""
    dc = daily_close.dropna().sort_index()
    dc = dc.loc[dc.index <= pd.Timestamp(known_ts)]
    if dc.empty:
        return {}
    real_ohlc = high is not None and low is not None
    hs = (high.reindex(dc.index) if high is not None else dc).astype(float).fillna(dc)
    ls = (low.reindex(dc.index) if low is not None else dc).astype(float).fillna(dc)
    dates = [d.strftime("%Y-%m-%d") for d in dc.index]
    hvals, lvals, cvals = hs.to_list(), ls.to_list(), dc.astype(float).to_list()
    stop = stop_reference(fire_ts, bar_opens, dates, hvals, lvals, cvals,
                          mult=BOTTOM_STOP_ATR_MULT)
    try:
        j = bar_opens.index(fire_ts)
    except ValueError:
        return {}
    start = pd.Timestamp(bar_opens[max(0, j - 2)])
    sweep = float(ls.loc[ls.index >= start].min())
    av = atr14(hvals, lvals, cvals)
    atr = av[-1] if av else None
    out = {"sweep_low": round(sweep, 6),
           "risk_basis": "daily_ohlc_atr14" if real_ohlc else "close_proxy_atr14"}
    if atr is not None and np.isfinite(atr) and float(atr) > 0:
        out["atr14"] = round(float(atr), 6)
    if stop is not None and np.isfinite(stop) and float(stop) < sweep:
        out["stop_level"] = round(float(stop), 6)
    return out


def bottom_watch_events(
    sig: pd.DataFrame,
    daily_close: pd.Series,
    *,
    high: pd.Series | None = None,
    low: pd.Series | None = None,
) -> list[dict]:
    """Cross-market display/watch events for early or blocked turns in a washout.

    A raw blocked CB/revBuy is the stronger subtype and de-duplicates an anticipation dot
    on the same bar. Every event is explicitly ``scored:false``; no position, alert or
    backtest behavior changes.
    """
    ctx = washout_context(sig, daily_close)
    if ctx is None:
        return []
    rows = sig.loc[ctx["rows"]]
    dots = _early_dot_mask(sig, daily_close).reindex(rows.index).fillna(False).to_numpy(bool)
    candidates = (dots | ctx["trig"]) & ctx["washed"]
    bar_opens = [d.strftime("%Y-%m-%d") for d in rows.index]
    out: list[dict] = []
    for i in np.flatnonzero(candidates):
        i = int(i)
        trigger = bool(ctx["trig"][i])
        subtype = "blocked_trigger" if trigger else "early_dot"
        quality = "washout_trigger_watch" if trigger else "washout_early_watch"
        ts = rows.index[i].strftime("%Y-%m-%d")
        known_ts = pd.Timestamp(ctx["known_ts"][i]).strftime("%Y-%m-%d")
        dd = ctx["drawdown"][i]
        washout_ctx = {
            "rule": "bear_block & (dd252<=-35% | monthly_os_dwell>=3) & recent_3d_os",
            "drawdown_252": round(float(dd), 6) if np.isfinite(dd) else None,
            "monthly_oversold_dwell": int(ctx["monthly_dwell"][i]),
            "recent_3d_oversold": bool(ctx["recent_oversold"][i]),
        }
        event = {
            "ts": ts,
            "known_ts": known_ts,
            "trigger_ts": ts,
            "trigger_known_ts": known_ts,
            "kind": subtype,
            "quality": quality,
            "price": float(rows["close"].iloc[i]),
            "scored": False,
            "washout_ctx": washout_ctx,
        }
        event.update(_event_risk_metadata(
            ts, known_ts, bar_opens, daily_close, high, low))
        out.append(event)
    return out


# ════════════════════════════════════════════════ ⚠ ARM / ⛔ CONFIRM warns ══
def _confirmed_swing_lows_r3(close: pd.Series, radius: int = PIVOT_RADIUS) -> pd.DatetimeIndex:
    c = close.to_numpy(dtype="float64")
    n = len(c)
    idx = close.index
    lows = []
    for t in range(radius, n - radius):
        w = c[t - radius:t + radius + 1]
        if c[t] == w.min() and (w[:radius] > c[t]).all() and (w[radius + 1:] >= c[t]).all():
            lows.append(idx[t])
    return pd.DatetimeIndex(lows)


def _arm_event_daily(close: pd.Series, di: pd.DatetimeIndex) -> np.ndarray:
    """Daily bool stream: True where a fresh ARM (⚠) becomes KNOWABLE (x_exits legs, X5
    OR-form, close-only):
      A) 2D RSI-MACD bear cross WHILE (3D k>=75 OR d>=75)  [2D cross event-mapped;
         3D k/d state ffilled to daily by known date].
      B) 3D stoch bear cross with k.shift(1)>=80          [event-mapped at 3D known date].
    All indicator math is the ORACLE's; TF→daily uses the known-date (bucket close) map."""
    def tf(daily, n):
        # n-business-day bars + per-bar known-date (last real session in the bucket).
        # Vectorized: ``index.to_series().resample().max()`` == the reference
        # ``resample().apply(lambda x: x.dropna().index.max())`` byte-for-byte (verified),
        # but ~4× faster — the .apply-lambda path dominated per-symbol emit time.
        s = daily.resample(f"{n}B").last().dropna()
        kmax = daily.index.to_series().resample(f"{n}B").max().reindex(s.index).dropna()
        s = s.reindex(kmax.index)
        return s, pd.Series(pd.to_datetime(kmax.values), index=kmax.index)

    def to_daily(series, known, how):
        kd = pd.Series(series.to_numpy(), index=pd.to_datetime(known.to_numpy()))
        kd = kd[~kd.index.duplicated(keep="last")].sort_index()
        if how == "ffill":
            return kd.reindex(di, method="ffill")
        out = pd.Series(False, index=di)
        pos = di.searchsorted(kd.index, side="left")
        for p, v in zip(pos, kd.to_numpy()):
            if v and p < len(di):
                out.iloc[p] = True
        return out

    sm, smk = tf(close, 2)
    m2, s2 = C.rsi_macd(sm)
    bear2_d = to_daily(C.crossunder(m2, s2).fillna(False), smk, "event").astype(bool)

    ss3, sk3 = tf(close, 3)
    k3, d3 = C.stoch_rsi_kd(ss3)
    sb3 = C.crossunder(k3, d3)
    kprev3 = k3.shift(1)
    gate = ((k3 >= ARM_K3_MIN) | (d3 >= ARM_K3_MIN)).fillna(False)
    gate_d = to_daily(gate, sk3, "ffill").fillna(False).astype(bool)
    legB = (sb3 & (kprev3 >= ARM_KSHIFT_MIN)).fillna(False)
    legB_d = to_daily(legB, sk3, "event").astype(bool)
    legA_d = (bear2_d & gate_d).astype(bool)
    return (legA_d | legB_d).reindex(di).fillna(False).to_numpy()


def warn_events(close: pd.Series) -> list[dict]:
    """The two-stage DISPLAY warning stream (never a scored exit):

      ⚠ ARM     — distribution-zone armed (x_exits ARM legs). Extension caution.
      ⛔ CONFIRM — a STRUCTURE BREAK while armed: the daily close prints BELOW the last
                   CONFIRMED radius-3 swing low, within ARMED_WINDOW sessions of the arm.

    Strictly forward-walked, point-in-time (a pivot at position p is knowable only at
    p+radius; the ARMED window disarms after ARMED_WINDOW sessions with no re-arm).
    Close-only. Returns ``[{ts, kind, px}]`` chronological, kind in {"arm","confirm"}.

    ``px`` is the DAILY close on the event's OWN session — the price the rule actually
    tested (the confirm fires because THIS close broke the swing low). It exists so the
    contracts layer can stamp a point-in-time marker price: mapping a confirm onto its
    nearest-preceding 3D row and reading that row's close reads a bar that OPENED before
    the event and CLOSES up to 2 sessions after it (HK-O1 / forensic B2, 9988.HK 05-27)."""
    dclose = close.dropna()
    di = dclose.index
    dv = dclose.to_numpy(dtype="float64")
    if len(di) < PIVOT_RADIUS * 2 + 2:
        return []
    arm = _arm_event_daily(dclose, di)

    piv = _confirmed_swing_lows_r3(dclose, PIVOT_RADIUS)
    piv_pos = di.searchsorted(piv, side="left")
    know_pos = piv_pos + PIVOT_RADIUS
    confirmed_low = np.full(len(di), np.nan)
    order = np.argsort(know_pos)
    kp_sorted, pv_sorted = know_pos[order], piv_pos[order]
    j = 0
    cur = np.nan
    for t in range(len(di)):
        while j < len(kp_sorted) and kp_sorted[j] <= t:
            cur = dv[pv_sorted[j]]
            j += 1
        confirmed_low[t] = cur

    events = []
    armed_until = -1
    for t in range(len(di)):
        if arm[t]:
            fresh_arm = t > armed_until
            if fresh_arm:                             # fresh ARM (was disarmed) -> ⚠ event
                events.append({"ts": di[t].strftime("%Y-%m-%d"), "kind": "arm",
                               "px": float(dv[t])})
            armed_until = t + ARMED_WINDOW            # (re-)arm
            # A FRESH arm is learned from this session's close and cannot confirm from that
            # same close. A same-day RE-ARM while an earlier arm is already active does not
            # erase that prior information; it remains eligible to confirm below.
            if fresh_arm:
                continue
        if t <= armed_until:
            lvl = confirmed_low[t]
            if not np.isnan(lvl) and dv[t] < lvl:     # ⛔ structure break while armed
                events.append({"ts": di[t].strftime("%Y-%m-%d"), "kind": "confirm",
                               "px": float(dv[t]),    # the daily close that broke the low
                               "level": float(lvl)})  # the swing low it broke
                armed_until = -1                      # consume the arm on confirm
    return events


# ════════════════════════════════════════════════ repair grammar (re-entry) ═
def stop_sweep_reclaim_events(
    daily_close: pd.Series,
    sell_confirms: list[dict],
    *,
    high: pd.Series | None = None,
    low: pd.Series | None = None,
) -> list[dict]:
    """Display-only fast rearm after a failed structure break.

    A valid structure stop requires its own daily close below ``level``. Starting on the
    *next* session, the first close back above that level within five sessions emits a
    ``stop_sweep_reclaim``. It deliberately asks for neither weekly-bull nor above-200:
    those are confirmation rails and would recreate the delay this watch lane repairs.
    """
    dc = daily_close.dropna().sort_index().astype(float)
    if dc.empty or not sell_confirms:
        return []
    hs = (high.reindex(dc.index) if high is not None else dc).astype(float).fillna(dc)
    ls = (low.reindex(dc.index) if low is not None else dc).astype(float).fillna(dc)
    hvals, lvals, cvals = hs.to_list(), ls.to_list(), dc.to_list()
    atr = atr14(hvals, lvals, cvals)
    real_ohlc = high is not None and low is not None
    out: list[dict] = []
    for stop in sell_confirms:
        if stop.get("kind") != "confirm":
            continue
        try:
            level = float(stop.get("level"))
        except (TypeError, ValueError):
            continue
        if not np.isfinite(level):
            continue
        day = pd.Timestamp(stop.get("ts"))
        pos = int(dc.index.searchsorted(day, side="left"))
        if pos >= len(dc) or dc.index[pos] != day:
            continue
        stop_px = stop.get("px", dc.iloc[pos])
        try:
            stop_px = float(stop_px)
        except (TypeError, ValueError):
            continue
        if not np.isfinite(stop_px) or stop_px >= level:
            continue                              # not a valid close-through structure stop

        end = min(len(dc), pos + STOP_SWEEP_WINDOW_SESSIONS + 1)
        for i in range(pos + 1, end):             # never stop and rearm on the same close
            if float(dc.iloc[i]) <= level:
                continue
            sweep = float(ls.iloc[pos:i + 1].min())
            av = atr[i]
            event = {
                "ts": dc.index[i].strftime("%Y-%m-%d"),
                "known_ts": dc.index[i].strftime("%Y-%m-%d"),
                "kind": "stop_sweep_reclaim",
                "anchor_ts": day.strftime("%Y-%m-%d"),
                "price": float(dc.iloc[i]),
                "prior_stop_level": round(level, 6),
                "sweep_low": round(sweep, 6),
                "risk_basis": ("daily_ohlc_atr14" if real_ohlc
                               else "close_proxy_atr14"),
            }
            if av is not None and np.isfinite(av) and float(av) > 0:
                event["atr14"] = round(float(av), 6)
                new_stop = sweep - STOP_SWEEP_ATR_MULT * float(av)
                if np.isfinite(new_stop) and new_stop < sweep:
                    event["stop_level"] = round(float(new_stop), 6)
            out.append(event)
            break
    return out


def reclaim_events(sig: pd.DataFrame, sell_confirms: list[dict]) -> list[dict]:
    """The RE-ENTRY repair lane: display events (scored:false) for the two structural
    holes the 2026-07-15 Mag7 diagnosis verified in the entry grammar.

    TREND-RECLAIM — after a scored SELL, the first 3D close back ABOVE the sell row's
      close with weekly-bull + above-200 support, once RECLAIM_DEBOUNCE_BARS have
      passed. The debounce is load-bearing: without it AAPL re-fires 2026-06-10, one
      bar after the Jun-8 SELL, and rides the whole −9% drawdown the SELL dodged.

    BLOCK-REPAIR — a bear-blocked CB/revBuy re-fires when its block legs clear within
      REPAIR_WINDOW_BARS while the RSI-MACD cross is still live (macd>=sig). The gate
      was factually right on its bar; the flaw was never re-checking it (META: BUY
      blocked 2026-07-06 @603 — all three legs true — legs repaired 2026-07-09 @657
      and the engine had no way to say so).

    One event per anchor; any scored entry/exit resets the anchors. Emits
    ``[{ts, kind: "reclaim"|"block_repair", anchor_ts, price}]`` on the 3D-row grid,
    chronological. Close-only-safe; composes the oracle frame, never edits it."""
    need = {"macd", "sig", "k", "d", "rsi14"}
    if not len(sig) or not need.issubset(sig.columns):
        return []
    rows = sig.dropna(subset=list(need))
    n = len(rows)
    if n < RECLAIM_DEBOUNCE_BARS + 2:
        return []
    close = rows["close"].to_numpy(dtype=float)
    macd = rows["macd"].to_numpy(dtype=float)
    sigl = rows["sig"].to_numpy(dtype=float)
    wb = rows["w_bull"].to_numpy(dtype=bool)
    a200 = rows["above200"].to_numpy(dtype=bool)
    bblk = rows["bear_block"].to_numpy(dtype=bool)
    raw_buy = (rows["CB"] | rows["revBuy"]).to_numpy(dtype=bool)
    entry = raw_buy & ~bblk
    blocked = raw_buy & bblk

    # each SELL confirm (a daily-grid date) → its containing/nearest-preceding 3D row;
    # keep the confirm's own date so the reclaim reason cites the SELL marker users see
    sell_pos: dict[int, str] = {}
    for w in sell_confirms or []:
        j = int(rows.index.searchsorted(pd.Timestamp(w["ts"]), side="right")) - 1
        if j >= 0:
            sell_pos[j] = str(w["ts"])

    out: list[dict] = []
    long_ = False
    sell_anchor: tuple[int, float, str] | None = None  # (row, row close, confirm ts) of the live SELL
    block_anchor: int | None = None                    # row of the live blocked entry
    for t in range(n):
        if entry[t]:                               # scored entry: anchors are moot
            long_, sell_anchor, block_anchor = True, None, None
        if t in sell_pos:                          # scored exit: (re-)anchor the reclaim
            long_, sell_anchor, block_anchor = False, (t, close[t], sell_pos[t]), None
        if blocked[t]:                             # newest blocked entry owns the window
            block_anchor = t
        if block_anchor is not None and t > block_anchor:
            if t - block_anchor > REPAIR_WINDOW_BARS or macd[t] < sigl[t]:
                block_anchor = None                # window lapsed or the cross died
            elif not bblk[t]:
                out.append({"ts": rows.index[t].strftime("%Y-%m-%d"), "kind": "block_repair",
                            "anchor_ts": rows.index[block_anchor].strftime("%Y-%m-%d"),
                            "price": float(close[t])})
                sell_anchor = block_anchor = None  # one re-entry mark per episode
        if (not long_ and sell_anchor is not None
                and t - sell_anchor[0] >= RECLAIM_DEBOUNCE_BARS
                and close[t] > sell_anchor[1] and wb[t] and a200[t]):
            out.append({"ts": rows.index[t].strftime("%Y-%m-%d"), "kind": "reclaim",
                        "anchor_ts": sell_anchor[2],
                        "price": float(close[t])})
            sell_anchor = None
    return out


# ════════════════════════════════════════════════ the public emitter ════════
def build_v2(sig: pd.DataFrame, close: pd.Series, *,
             high: pd.Series | None = None, low: pd.Series | None = None,
             volume: pd.Series | None = None,
             sector_basket: pd.Series | None = None,
             panel_basket: pd.Series | None = None,
             cohort_frac_daily: pd.Series | None = None,
             reclaims_enabled: bool = True,
             symbol: str | None = None,
             override_gate=None) -> dict:
    """Compute the full v2 emission for one symbol from its oracle ``sig`` frame + close.

    ``high``/``low``/``volume`` optional (CN/HK close-only names pass none): the recipe
    substitutes close for high/low and marks volume-missing → score_basis "partial".
    ``sector_basket``/``panel_basket``/``cohort_frac_daily`` are the sector-cohort inputs
    the ingest layer precomputes once per nightly run (None ⇒ cohort legs 0, partial).

    ``symbol`` + ``override_gate`` wire the ratified washout-override enter-mask conditional
    (era ``gc_v2_wo1``, see ``v2_streams``). BOTH must be present for any fire to be taken;
    either absent — and the artifact-absent fallback, where the gate answers None to
    everything — leaves this emission bit-identical to the pre-fence era.

    Returns a dict the contracts layer folds into the indicator doc:
      { keeper: {bar_index:{verdict,reason,shift}}, recipe: {bar_index:{score,tier}},
        override: {bar_index: override_ctx},
        score_basis: "full"|"partial", early_dots: [ts...], warnings: [{ts,kind}...],
        sell_confirms: [{ts,kind}...], bottom_watches: [{ts,kind}...] }

    ``sell_confirms`` is the FULL (uncapped) list of CONFIRM warn events (kind=="confirm").
    It is the source of the UNIFIED-stream SELL signal (contracts._extract_signals maps each
    confirm date onto its nearest-preceding 3D row). It must NOT be capped: the traded SELL
    history spans the full chart, whereas ``warnings`` is the last-40 DISPLAY side channel
    OracleDash reads. Both derive from the SAME ``warn_events`` pass (computed once)."""
    if not len(sig) or not {"macd", "sig", "k", "d", "rsi14"}.issubset(sig.columns):
        return {"keeper": {}, "recipe": {}, "override": {}, "keeper_relievable": [],
                "score_basis": "partial",
                "early_dots": [], "warnings": [], "sell_confirms": [], "reclaims": [],
                "bottom_watches": []}
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < 20:
        return {"keeper": {}, "recipe": {}, "override": {}, "keeper_relievable": [],
                "score_basis": "partial",
                "early_dots": [], "warnings": [], "sell_confirms": [], "reclaims": [],
                "bottom_watches": []}

    have_volume = volume is not None and volume.notna().any()
    hi = high if high is not None else close
    lo = low if low is not None else close
    vol = volume if volume is not None else pd.Series(np.nan, index=close.index)

    # ── the washout-override grants: which bear_block-vetoed fires the mask TAKES ──
    # Asked before the keeper so the two cohorts are visibly disjoint: the keeper grades
    # (CB|revBuy) & ~bear_block, these are (CB|revBuy) & bear_block & override_ok, and a
    # granted fire is scored by the recipe below but never keeper-graded (fidelity ruling —
    # see keeper_quality_map's docstring for why that is the whole ballgame).
    override = override_entries(sig, symbol, override_gate)

    # keeper verdict + counter-trend fill shift per raw-buy bar. ``symbol``/``override_gate``
    # also carry the gc_v2_wo2 reclaim waiver into the keeper's own cohort (see
    # keeper_quality_map): same gate, same notch, same PIT rule, different refusal relieved.
    kmap = keeper_quality_map(sig, symbol=symbol, gate=override_gate)
    rows_reset = rows.reset_index(drop=True)
    keeper = {}
    relievable_ts = []
    for pos, k in kmap.items():
        below = not bool(rows_reset["above200"].iloc[pos])
        wkdn = not bool(rows_reset["w_bull"].iloc[pos])
        shift = 2 if (below and wkdn) else 1
        keeper[pos] = {"verdict": k["verdict"], "reason": k["reason"], "shift": shift}
        if "override_ctx" in k:
            keeper[pos]["override_ctx"] = k["override_ctx"]
        elif k.get("relievable"):
            # A block the waiver COULD have relieved but did not (the name did not qualify,
            # or the fire predates the state). Reported by DATE, not stamped on the event:
            # the retro projection needs the branch fact, and the emitted contract must stay
            # bit-identical to the pre-fence one whenever no artifact is in play.
            relievable_ts.append(rows.index[pos].strftime("%Y-%m-%d"))

    # recipe score + tier per bar (graded)
    score_s, tier_s, partial = recipe_score_on_3d(
        sig, close, hi, lo, vol, have_volume=have_volume,
        sector_basket=sector_basket, panel_basket=panel_basket,
        cohort_frac_daily=cohort_frac_daily)
    # index recipe by positional bar_index (aligned to the non-NaN rows)
    score_al = score_s.reindex(rows.index)
    tier_al = tier_s.reindex(rows.index)
    recipe = {}
    for pos, (sc, ti) in enumerate(zip(score_al.to_numpy(), tier_al.to_numpy())):
        # graded (buy) bars only — the keeper's cohort plus the override's. The recipe is
        # the §9 bottom-signal score and carries NO counter-trend leg, so an override fire
        # gets the standard tier off the standard scoring: the same number a non-blocked
        # fire on that bar would have carried.
        if pos in keeper or pos in override:
            recipe[pos] = {"score": None if not np.isfinite(sc) else int(round(float(sc))),
                           "tier": str(ti)}

    # ONE warn pass feeds both the capped DISPLAY side channel and the uncapped SELL source.
    warns_all = warn_events(close)
    sell_confirms = [w for w in warns_all if w.get("kind") == "confirm"]
    bottom_watches = bottom_watch_events(sig, close, high=high, low=low)
    promoted_dot_dates = {
        str(w.get("ts")) for w in bottom_watches if w.get("kind") == "early_dot"
    }
    # A deep-washout anticipation dot now has a proper amber EARLY marker. Keeping the old
    # gray side-channel dot underneath it would show one event twice and preserve the exact
    # ambiguity this lane removes. Ordinary anticipation dots remain unchanged.
    unpromoted_early_dots = [
        ts for ts in early_dots(sig, close) if ts not in promoted_dot_dates
    ]
    reclaims = []
    if reclaims_enabled:
        reclaims = reclaim_events(sig, sell_confirms)
        reclaims.extend(stop_sweep_reclaim_events(
            close, sell_confirms, high=high, low=low))
        reclaims.sort(key=lambda e: (e.get("ts", ""), e.get("kind", "")))

    return {
        "keeper": keeper,
        "recipe": recipe,
        # {positional bar index: override_ctx} — the taken washout-override fires. Empty on
        # every name, every night, until a qualifying basket meets a bear_block-vetoed fire.
        "override": override,
        # The 3D bar-open dates of keeper blocks that failed ONLY the 200-reclaim leg and
        # were NOT waived. Internal to this payload — deliberately not a field on the
        # emitted event, so an emission built with no washout artifact stays byte-identical
        # to the pre-fence one. The retro projection consumes it (washout_override.
        # mark_retro's ``relievable_ts``) to tell a relievable block from a hold-leg failure
        # without ever parsing the keeper's collapsed reason string.
        "keeper_relievable": relievable_ts,
        "score_basis": "partial" if partial else "full",
        "early_dots": unpromoted_early_dots[-SIDE_CHANNEL_CAP:],
        # Bright, cross-market watch candidates. These never touch the classic mask or
        # scored state; contracts stamps type=BOTTOM_WATCH + scored:false.
        "bottom_watches": bottom_watches,
        "warnings": warns_all[-SIDE_CHANNEL_CAP:],
        "sell_confirms": sell_confirms,
        # RE-ENTRY repair lane (see reclaim_events). Uncapped like sell_confirms: contracts
        # folds them into the stream, model_slice caps the tail. ``reclaims_enabled=False``
        # = the symbol-class exclusion (reclaim_eligible): decay instruments emit none.
        "reclaims": reclaims,
    }
