// Guide content for the structure/ob premium-suite module — bundled (NOT served from public/):
// Next's standalone server does not serve public/ files added after the build, and guides
// ship with the build rather than being rsync'd like /data. Lazily imported by GuidePanel.
// Markdown is rendered through lib/md.ts (escape-safe).

export const en = `# Order Blocks

A block is the last opposing candle within five bars before a qualifying impulse. It marks the range that launched displacement; it does not prove that institutional orders remain there.

## Read the chart

- **Tinted band** — the origin candle's full range or body. Bullish blocks sit below the impulse; bearish blocks sit above it.
- **Heavy outer edge** — the invalidation side: bottom for bullish, top for bearish.
- **Dotted midline** — the 50% fill reference, not an automatic entry.
- **WEAK / BALANCED / HIGH / STRONG** — a relative grade built from formation volume, estimated imbalance, and impulse size versus the previous 200 bars. It is not a win probability.
- **Buy/sell capsules and delta** — estimates from each candle's close inside its range, not order-book data. The right chips show block volume, its share of the visible blocks, and estimated delta.
- **Breaker Block** — a retired block redrawn from the other side when Breaker blocks is enabled.

## Use it

- A block gives a **location**, not a trigger. Favor bullish blocks below price in an uptrend and bearish blocks above price in a downtrend.
- Let price return. A wick into the band followed by a close back toward the impulse is rejection; an untouched band alone is not confirmation.
- Put risk beyond the outer edge. With the default **Close** mitigation, a close through that edge retires the block. Touch, Wick, and Average retire it sooner.
- A successful rejection points first to the impulse swing. A failed block ends the original thesis; an enabled breaker may then be tested from the opposite side.

Skip thin symbols and charts packed with overlapping blocks. Their volume grade and estimated delta carry little information.

## Settings

- **Detection** — Volume requires an ATR-sized impulse plus heavy relative volume; Price Action requires a close through a confirmed pivot; Peak finds a volume-peak expansion and confirms one bar later.
- **Impulse × ATR / Volume percentile** — tighten or loosen the Volume detector.
- **Zone bounds / Mitigation** — choose full range or body, then define when the block retires: Touch, Wick, Close, or Average (midline).
- **Block type / Show last / Extend right** — filter direction, limit visible live blocks, and choose indefinite or 15-bar bands.
- **Breaker blocks** — retain retired zones as role-flipped breakers.
- **Volume internals / Rating bar / Tier label size** — display controls only; they do not change detection.

## Signals & alerts

- **ob_created** — a block is confirmed; chart event only.
- **ob_touch** — price overlaps a live block, limited to once per five bars for each block; available in Alert Center.
- **ob_break** — the selected mitigation rule retires the block; available in Alert Center.

## Macro blocks

Macro blocks run the same detector on groups of four chart bars. They are an approximate 4× view, not a true higher-timeframe feed, and grouping starts at the left edge of loaded history.

Only completed groups count, so a macro block can appear up to four source bars late but does not repaint. Use it as context: a normal block nested inside a same-direction macro block has alignment; a nearby opposing macro block is conflict. Macro blocks omit volume internals because that would be an estimate built on another estimate.
`;

export const zh = `# 订单块（Order Blocks）

订单块是合格推动出现前五根 K 线内，最后一根反方向 K 线。它标出推动行情的起点区间，但不能证明那里仍有机构挂单。

## 读图

- **色带** —— 起点 K 线的完整区间或实体。看涨块位于上冲起点下方；看跌块位于下跌起点上方。
- **加粗外沿** —— 失效边界：看涨块看下沿，看跌块看上沿。
- **点状中线** —— 50% 回补参考，不是自动进场位。
- **弱 / 均衡 / 高 / 强** —— 形成期成交量、估算失衡与推动幅度相对过去 200 根 K 线的综合排名；不是胜率。
- **买卖胶囊与净量** —— 根据收盘在单根 K 线区间中的位置估算，并非订单簿数据。右侧标签显示块内成交量、其在当前可见块中的占比，以及估算净量。
- **破位块（Breaker Block）** —— 启用 Breaker blocks 后，从另一侧显示的已退役订单块。

## 怎么用

- 订单块只给**位置**，不给触发。上升趋势优先看价格下方的看涨块；下降趋势反之。
- 等价格回来。影线进入色带、随后收盘回到推动方向，才是拒绝；仅有一条未触碰色带，不算确认。
- 风险放在加粗外沿之外。默认 **Close** 模式下，收盘穿过外沿才退役；Touch、Wick、Average 会更早退役。
- 拒绝成立，先看推动行情的摆动高低点；订单块失效，原方向逻辑结束。若启用破位块，再观察它从另一侧被回测。

成交清淡或订单块大量重叠时跳过。此时成交量评级与估算净量信息很弱。

## 设置

- **Detection** —— Volume 要求达到 ATR 门槛的推动与较高相对成交量；Price Action 要求收盘突破已确认转折；Peak 寻找成交量峰值推动，并延后一根确认。
- **Impulse × ATR / Volume percentile** —— 调节 Volume 识别门槛。
- **Zone bounds / Mitigation** —— 选择完整区间或实体，并规定何时退役：Touch、Wick、Close、Average（中线）。
- **Block type / Show last / Extend right** —— 筛选方向、限制可见有效块数量，并选择持续延伸或 15 根后停止。
- **Breaker blocks** —— 把退役区间保留为角色反转的破位块。
- **Volume internals / Rating bar / Tier label size** —— 只控制显示，不改变识别结果。

## 信号与提醒

- **ob_created** —— 订单块确认；仅图表事件。
- **ob_touch** —— 价格与有效块重叠；每个块五根 K 线内最多一次，可在提醒中心选择。
- **ob_break** —— 达到所选 Mitigation 条件，订单块退役；可在提醒中心选择。

## 宏观订单块（Macro blocks）

宏观订单块把图上 K 线每四根合成一组，再运行同一检测器。它只是近似 4× 视图，不是真正的高周期数据；分组从已加载历史的左边缘开始。

只有完整收线的分组参与计算，因此最晚会延后四根原周期 K 线出现，但不会重绘。它只用于背景：普通块嵌在同方向宏观块中代表方向一致；附近有反向宏观块则代表冲突。宏观块不显示买卖拆分，因为那会是估算之上的估算。
`;
