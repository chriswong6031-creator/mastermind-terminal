// Guide content for the structure/mfp premium-suite module — bundled (NOT served from public/):
// Next's standalone server does not serve public/ files added after the build, and guides
// ship with the build rather than being rsync'd like /data. Lazily imported by GuidePanel.
// Markdown is rendered through lib/md.ts (escape-safe).

export const en = `# Money Flow Profile

A rolling volume map by price. It shows where the current lookback found balance, where participation thinned out, and whether price is being accepted outside that balance.

## Read the chart

- **Horizontal bar length** — total volume in that price bin relative to the busiest bin.
- **Bar color and bright slice** — estimated sell/buy pressure and estimated buy share. Both come from candle shape, not trade tape or an order book.
- **POC** — the winning bin under the selected metric. With the default Money flow metric, it is the bin with the largest sum of price × volume; Level strength instead selects the highest-volume bin.
- **VAH / VAL** — the value-area edges. Starting at POC, the profile adds the heavier neighboring bin until it contains the selected share of volume.
- **Strength %** — that bin's volume versus the busiest bin, shown only on heavier rows.

## Use it

- **Inside VAH–VAL:** price is in balance. POC is the center of business, not a directional signal.
- **Close outside, then hold the edge:** acceptance. Continuation remains valid while price stays outside the value area.
- **Probe outside, then close back inside:** rejection. In a balanced market, POC is the first mean-reversion reference.
- **Thin rows:** little volume traded there. Price may cross them quickly; they are not guaranteed gaps.

After a gap or regime break, the lookback mixes two markets. Shorten Lookback or wait for the profile to rebuild.

## Settings

- **Lookback (100–1000, default 400)** — bars included in the rolling profile.
- **Levels (10–40, default 24)** — number of price bins.
- **POC Metric** — Money flow, Delta +, Delta −, or Level strength (total volume).
- **Value Area / Value Area % (50–90, default 70)** — show VAH/VAL and set the enclosed volume share.
- **Labels** — show POC, VAH/VAL, and heavier-row strength values.

## Signals & alerts

**mfp_poc_touch** prints when consecutive closes cross the current POC, with a five-bar cooldown. It is chart-only and cannot be selected in Alert Center.

The profile and POC recalculate as the rolling window moves. Treat the event as contact with the **current** profile, not a permanent historical level.
`;

export const zh = `# 资金流剖面

按价格统计的滚动成交量地图。它显示当前回看窗口内的平衡区、低参与区，以及价格是否在平衡区外获得接受。

## 读图

- **横条长度** —— 该价位档的成交量，相对最繁忙价位档的比例。
- **颜色与亮色切片** —— 估算卖压/买压与估算买方占比。两者都来自 K 线形态，不是逐笔成交或订单簿数据。
- **POC** —— 所选指标的最高价位档。默认 Money flow 选择 price × volume 总和最高的价位档；Level strength 才选择成交量最高的价位档。
- **VAH / VAL** —— 价值区上下沿。从 POC 开始，每次纳入成交量更大的相邻价位档，直到覆盖设定成交量比例。
- **Strength %** —— 该价位档成交量相对最繁忙价位档的比例；只在较重价位档显示。

## 怎么用

- **价格在 VAH–VAL 内：** 市场处于平衡。POC 是成交中心，不是方向信号。
- **收盘离开价值区，随后守住边界：** 接受。价格保持在区外，延续逻辑才成立。
- **刺出价值区，随后收回区内：** 拒绝。平衡行情中，POC 是第一个均值回归参考。
- **细价位档：** 历史成交较少，价格可能快速穿过，但不是必然的真空区。

跳空或行情性质突变后，回看窗口会混合两个市场。缩短 Lookback，或等待剖面重建。

## 设置

- **Lookback（100–1000，默认 400）** —— 参与滚动剖面的 K 线数量。
- **Levels（10–40，默认 24）** —— 价格分档数量。
- **POC Metric** —— Money flow、Delta +、Delta − 或 Level strength（总成交量）。
- **Value Area / Value Area %（50–90，默认 70）** —— 显示 VAH/VAL，并设定价值区须覆盖的成交量比例。
- **Labels** —— 显示 POC、VAH/VAL 与较重价位档的强度值。

## 信号与提醒

连续两个收盘价穿越当前 POC 时，会产生 **mfp_poc_touch**；同类事件有五根 K 线冷却。它目前只用于图表，不能在提醒中心选择。

剖面与 POC 会随滚动窗口重新计算。请把该事件理解为价格接触**当前**剖面，而不是永久不变的历史价位。
`;
