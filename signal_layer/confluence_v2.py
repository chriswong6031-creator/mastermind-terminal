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

import numpy as np
import pandas as pd

from . import confluence as C

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
# "the engine said no / said exit — and the market then repaired it". DISPLAY lane
# only (scored:false) until the panel backtest promotes them.
RECLAIM_DEBOUNCE_BARS = 4   # 3D bars flat after a SELL before a reclaim may fire (~12 sessions)
REPAIR_WINDOW_BARS = 8      # a blocked entry may re-fire while its cross is live, within this window


# ════════════════════════════════════════════════ v2 exit / entry streams ═══
def v2_streams(sig: pd.DataFrame) -> dict:
    """The GC v2 SCORED entry/exit event streams on the 3D-row grid.

    ENTER  = (CB | revBuy) & ~bear_block          (== confluence.simulate fixed enter)
    EXIT   = (CS & ~strong_bull)                  (revSell DROPPED — the no-cut change)

    Returns bool Series aligned to the non-NaN signal rows (matching the sim contract).
    This is the exact stream the X1FULL / X6 lab exits used, minus revSell on exit."""
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    enter = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).astype(bool)
    exit_ = (rows["CS"] & ~rows["strong_bull"]).astype(bool)
    return {"enter": enter, "exit": exit_}


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
    c, a = sig["close"], sig["above200"]
    if i + 1 >= n:
        return None, "pending confirmation"
    held = bool(c.iloc[i + 1] > c.iloc[i])
    below, wkdn = (not bool(a.iloc[i])), (not bool(sig["w_bull"].iloc[i]))
    if below and wkdn:                                   # counter-trend: raise the bar
        if i + 2 >= n:
            return None, "pending confirmation"
        reclaim = bool(a.iloc[i + 1]) or bool(a.iloc[i + 2])
        ok = held and reclaim
        return ok, ("reclaimed 200 & held" if ok else "counter-trend, no 200-reclaim/hold")
    return held, ("held confirmation" if held else "failed reclaim-and-hold")


def keeper_verdict(i: int, sig_reset: pd.DataFrame, hi: list[int]) -> tuple[str, str]:
    """Grade a raw confluence buy at *positional* row ``i`` of the reset-index frame
    ``sig_reset``. Returns ``(verdict, reason)`` with verdict in {take, block, pending}.
    ``hi`` = precomputed ``_swing_highs(sig_reset['close'])`` (compute once per name).
    Order of operations identical to buy_filters.buy_filter_verdict / signal_quality."""
    n = len(sig_reset)
    if _bearish_divergence(i, sig_reset["close"], sig_reset["macd"], hi):
        return "block", "veto: bearish divergence"
    ok, reason = _reclaim_and_hold(i, sig_reset, n)
    if ok is None:
        return "pending", reason
    return ("take" if ok else "block"), reason


def keeper_quality_map(sig: pd.DataFrame) -> dict:
    """Map each raw BUY/REBUY bar (CB|revBuy & ~bear_block) to its keeper verdict.

    Returns ``{bar_index(int, positional in the non-NaN rows): (verdict, reason)}``.
    The counter-trend fill shift (used for MARKER placement, not for the verdict) is
    ``2 if below200 & ~w_bull else 1`` — mirrored in ``build_v2`` when it stamps quality
    onto the emitted signal. Only bars where a raw buy fired are graded (KEEPER contract)."""
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"]).reset_index(drop=True)
    if len(rows) < 3:
        return {}
    hi = _swing_highs(rows["close"])
    raw_buy = ((rows["CB"] | rows["revBuy"]) & ~rows["bear_block"]).to_numpy()
    out = {}
    for pos in np.flatnonzero(raw_buy):
        out[int(pos)] = keeper_verdict(int(pos), rows, hi)
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
def early_dots(sig: pd.DataFrame, close: pd.Series) -> list[str]:
    """GRID_GATE anticipation form (a) — the EARLY pre-cross dot (~4.6d lead, hollow):

        3D StochRSI **bull cross from oversold**  AND  the 2D RSI-MACD histogram is
        **RISING** (pre-cross momentum).

    "From oversold" = the 3D StochRSI D dipped below OS(20) within the last CONF_W bars
    (the oracle's ``b1_from_os`` primitive). All math is the ORACLE's. Close-only-safe.
    Returns the list of 3D-open-date strings on which the dot fires (chronological)."""
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < C.CONF_W + 2:
        return []
    k, d = rows["k"], rows["d"]
    stoch_bull = C.crossover(k, d)
    from_os = d.rolling(C.CONF_W).min() < C.OS          # oracle b1_from_os primitive

    # 2D RSI-MACD histogram rising, mapped to 3D rows by each bar's CLOSE session date.
    open_dates, close_dates, _px = C._3d_groups(close, 0)
    sm = close.resample("2B").last().dropna()
    m2, s2 = C.rsi_macd(sm)
    hist2 = (m2 - s2)
    rising2 = (hist2 > hist2.shift(1)).fillna(False)
    if len(sm):
        wpos = sm.index.searchsorted(pd.DatetimeIndex(close_dates), side="right") - 1
        wok = wpos >= 0
        wci = np.clip(wpos, 0, len(rising2) - 1)
        rising_on3 = pd.Series(wok & rising2.to_numpy()[wci], index=open_dates)
    else:
        rising_on3 = pd.Series(False, index=open_dates)
    rising_on3 = rising_on3.reindex(rows.index).fillna(False)

    dot = (stoch_bull & from_os & rising_on3).fillna(False)
    return [ts.strftime("%Y-%m-%d") for ts in rows.index[dot.to_numpy()]]


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
    Close-only. Returns ``[{ts, kind}]`` chronological, kind in {"arm","confirm"}."""
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
            if t > armed_until:                       # fresh ARM (was disarmed) -> ⚠ event
                events.append({"ts": di[t].strftime("%Y-%m-%d"), "kind": "arm"})
            armed_until = t + ARMED_WINDOW            # (re-)arm
        if t <= armed_until:
            lvl = confirmed_low[t]
            if not np.isnan(lvl) and dv[t] < lvl:     # ⛔ structure break while armed
                events.append({"ts": di[t].strftime("%Y-%m-%d"), "kind": "confirm"})
                armed_until = -1                      # consume the arm on confirm
    return events


# ════════════════════════════════════════════════ repair grammar (re-entry) ═
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
             cohort_frac_daily: pd.Series | None = None) -> dict:
    """Compute the full v2 emission for one symbol from its oracle ``sig`` frame + close.

    ``high``/``low``/``volume`` optional (CN/HK close-only names pass none): the recipe
    substitutes close for high/low and marks volume-missing → score_basis "partial".
    ``sector_basket``/``panel_basket``/``cohort_frac_daily`` are the sector-cohort inputs
    the ingest layer precomputes once per nightly run (None ⇒ cohort legs 0, partial).

    Returns a dict the contracts layer folds into the indicator doc:
      { keeper: {bar_index:{verdict,reason,shift}}, recipe: {bar_index:{score,tier}},
        score_basis: "full"|"partial", early_dots: [ts...], warnings: [{ts,kind}...],
        sell_confirms: [{ts,kind}...] }

    ``sell_confirms`` is the FULL (uncapped) list of CONFIRM warn events (kind=="confirm").
    It is the source of the UNIFIED-stream SELL signal (contracts._extract_signals maps each
    confirm date onto its nearest-preceding 3D row). It must NOT be capped: the traded SELL
    history spans the full chart, whereas ``warnings`` is the last-40 DISPLAY side channel
    OracleDash reads. Both derive from the SAME ``warn_events`` pass (computed once)."""
    if not len(sig) or not {"macd", "sig", "k", "d", "rsi14"}.issubset(sig.columns):
        return {"keeper": {}, "recipe": {}, "score_basis": "partial",
                "early_dots": [], "warnings": [], "sell_confirms": [], "reclaims": []}
    rows = sig.dropna(subset=["macd", "sig", "k", "d", "rsi14"])
    if len(rows) < 20:
        return {"keeper": {}, "recipe": {}, "score_basis": "partial",
                "early_dots": [], "warnings": [], "sell_confirms": [], "reclaims": []}

    have_volume = volume is not None and volume.notna().any()
    hi = high if high is not None else close
    lo = low if low is not None else close
    vol = volume if volume is not None else pd.Series(np.nan, index=close.index)

    # keeper verdict + counter-trend fill shift per raw-buy bar
    kmap = keeper_quality_map(sig)
    rows_reset = rows.reset_index(drop=True)
    keeper = {}
    for pos, (verdict, reason) in kmap.items():
        below = not bool(rows_reset["above200"].iloc[pos])
        wkdn = not bool(rows_reset["w_bull"].iloc[pos])
        shift = 2 if (below and wkdn) else 1
        keeper[pos] = {"verdict": verdict, "reason": reason, "shift": shift}

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
        if pos in keeper:                     # only stamp graded tiers on graded (buy) bars
            recipe[pos] = {"score": None if not np.isfinite(sc) else int(round(float(sc))),
                           "tier": str(ti)}

    # ONE warn pass feeds both the capped DISPLAY side channel and the uncapped SELL source.
    warns_all = warn_events(close)
    sell_confirms = [w for w in warns_all if w.get("kind") == "confirm"]

    return {
        "keeper": keeper,
        "recipe": recipe,
        "score_basis": "partial" if partial else "full",
        "early_dots": early_dots(sig, close)[-SIDE_CHANNEL_CAP:],
        "warnings": warns_all[-SIDE_CHANNEL_CAP:],
        "sell_confirms": sell_confirms,
        # RE-ENTRY repair lane (display, scored:false — see reclaim_events). Uncapped like
        # sell_confirms: contracts folds them into the stream, model_slice caps the tail.
        "reclaims": reclaim_events(sig, sell_confirms),
    }
