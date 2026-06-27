// The user's flagship indicator, shown in the Pine editor (faithful to the Python
// oracle in signal_layer/confluence.py: RSI-based MACD + stoch-OF-RSI + weekly confirm).
export const FLAGSHIP_PINE = `//@version=6
indicator("RSI-MACD × StochRSI MTF Confluence", overlay=true, max_labels_count=500)

// ── inputs ────────────────────────────────────────────────
rsiLen    = input.int(14, "RSI length",             group="RSI / MACD")
fastLen   = input.int(14, "MACD fast (EMA of RSI)",  group="RSI / MACD")
slowLen   = input.int(60, "MACD slow (EMA of RSI)",  group="RSI / MACD")
sigLen    = input.int(5,  "MACD signal",             group="RSI / MACD")
confW     = input.int(8,  "Confluence window",       group="Confluence")
confTF    = input.timeframe("W", "Confirm timeframe", group="Confluence")
buyRsiMax = input.int(65, "Buy RSI max",             group="Confluence")
useMTF    = input.bool(true, "Require weekly confirm", group="Gates")
use200    = input.bool(true, "Gate above 200-EMA",   group="Gates")

// ── RSI-based MACD (NOT the standard price MACD) ──────────
rsi    = ta.rsi(close, rsiLen)
macd   = ta.ema(rsi, fastLen) - ta.ema(rsi, slowLen)
signal = ta.ema(macd, sigLen)

// ── StochRSI: stochastic OF the RSI series ────────────────
stoch = ta.stoch(rsi, rsi, rsi, 14)
k = ta.sma(stoch, 3)
d = ta.sma(k, 3)

// ── multi-timeframe weekly confirm (leak-free) ───────────
wMacd = request.security(syminfo.tickerid, confTF,
     ta.ema(ta.rsi(close, rsiLen), fastLen) - ta.ema(ta.rsi(close, rsiLen), slowLen))
wRsi  = request.security(syminfo.tickerid, confTF, ta.rsi(close, rsiLen))
wBull = wMacd > 0 and wRsi > 50

// ── regime gates ──────────────────────────────────────────
ema200   = ta.ema(close, 200)
above200 = close > ema200
recentB  = ta.barssince(ta.crossover(k, d)) <= confW

// ── confluence signals ────────────────────────────────────
confirmBull = (not useMTF or wBull) and (not use200 or above200)
CB = ta.crossover(macd, signal)  and recentB and confirmBull and rsi < buyRsiMax
CS = ta.crossunder(macd, signal) and (rsi > 70 or k > 80)

plotshape(CB, "BUY",  style=shape.labelup,   location=location.belowbar, color=color.teal, text="BUY")
plotshape(CS, "SELL", style=shape.labeldown, location=location.abovebar, color=color.red,  text="SELL")
`;

export const SAMPLE_MACD = `//@version=6
indicator("MACD", overlay=false)
fast = input.int(12, "Fast"), slow = input.int(26, "Slow"), sig = input.int(9, "Signal")
[macdLine, signalLine, hist] = ta.macd(close, fast, slow, sig)
plot(macdLine, color=color.blue)
plot(signalLine, color=color.orange)
plot(hist, style=plot.style_histogram, color = hist >= 0 ? color.teal : color.red)
`;
