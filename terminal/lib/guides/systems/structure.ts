// Suite-level learning guide for Structure Core.
// Original Mastermind wording only; module behavior is sourced from the live suite implementation.

export const en = `# Structure Core Playbook

Structure Core is a map, not a pile of trade signals. Its nine modules answer four different questions: who controls price, where a decision matters, what confirms the reaction, and where the idea is wrong. The chart becomes readable when each visible layer has exactly one of those jobs.

## System map

- **Market Structure** establishes the swing sequence and marks BOS, CHoCH, CISD, projected levels, and optional swing annotations.
- **Premium & Discount, Smart S/R, and Money Flow Profile** describe location. They answer whether price is high or low inside a range, near a repeatedly defended level, or trading around a concentrated participation area.
- **Order Blocks and Fair Value Gaps** describe zones left by displacement. They are possible reaction areas, not automatic entries.
- **Liquidity and Swing Failure** describe failed auctions around prior extremes. They become useful when price runs a visible pool and then reclaims it.
- **Auto Patterns** connects confirmed pivots into trendlines or channels and can project one measured objective after a confirmed break.

Think in four verbs: **map, locate, trigger, manage**. Market Structure maps. One value tool and one zone tool locate. Liquidity or Swing Failure can trigger. Structure, zone boundaries, and confirmed pattern geometry manage risk and objectives.

## Reading order

1. **Read Market Structure alone.** Decide whether confirmed swings are advancing, declining, or alternating. A CHoCH warns that control may be changing; a later BOS in the new direction is stronger confirmation.
2. **Choose one location lens.** Premium & Discount is best for position inside the active swing range. Smart S/R is best for repeated horizontal reactions. Money Flow Profile is best for acceptance around a point of control and value-area edges.
3. **Choose one zone family.** Use Order Blocks when the origin of displacement matters. Use Fair Value Gaps when the imbalance left by displacement matters. Showing both can be useful, but only when an overlap tells a clearer story than either layer alone.
4. **Wait for a reaction.** A liquidity sweep, SFP close back inside, FVG retest, order-block rejection, or fresh structure event turns a location into a decision.
5. **Define the failure before the entry.** If the boundary that supports the thesis closes through, the trade idea is invalid even if another decorative layer remains bullish.

## Timeframe roles

Every Structure Core module recalculates from the bars on the **current chart timeframe**. Changing the chart timeframe changes the pivots, ranges, zones, and events; there is no hidden fixed 3-day or weekly calculation behind the suite.

The one optional coarse layer is **Macro blocks** inside Order Blocks. It groups the loaded chart bars in fixed groups of four and runs the same detector on that shorter series. A daily chart therefore produces roughly four-day blocks, not calendar-week candles. A group is used only after it has completed and the following chart bar has opened, so the macro layer arrives late by design and does not revise a forming group. It is context, not an independent higher-timeframe feed.

For a multi-timeframe workflow, use a separate chart timeframe to establish broad structure, then return to the execution chart for the actual trigger. Do not mix a level from one timeframe with an entry from another without recording which chart created each level.

## Clean-first recipe

Start with **Market Structure only**. Keep the event history short enough to see the latest sequence, and hide optional swing labels, diamonds, double tops/bottoms, or projections that do not answer the current question.

Then add exactly one of these:

- **Fair Value Gaps** for a clean displacement-and-retest view.
- **Order Blocks** for origin zones; reduce Show Last and hide volume internals when the capsules obscure price.
- **Premium & Discount** for a simple range-location map.

Add **Liquidity or Swing Failure** only when prior highs or lows are central to the setup. Add Smart S/R, Money Flow Profile, or Auto Patterns for a specific question, then remove them when that question is answered.

A practical visual budget is **one structure layer + one location/zone layer + one trigger layer**. The default **Structure Focus** recipe keeps Market Structure alone. When you are ready for a complete but still restrained process, **Structure Workflow** adds Fair Value Gaps and Premium & Discount: direction, one imbalance layer, and one range-location layer.

## Setup → trigger → invalidation → management

**Setup:** confirmed structure supplies direction. Price then approaches a location that matters in that direction: discount in an advancing range, premium in a declining range, a fresh same-side block or gap, or a ranked support/resistance area.

**Trigger:** demand evidence at the location. Examples include a sweep and reclaim, a confirmed SFP, a rejection close from a zone, or a CHoCH followed by BOS. A touch is information; the close and subsequent structure decide whether buyers or sellers actually took control.

**Invalidation:** use the boundary whose failure disproves the thesis. That may be the outer edge of an order block, the swing that formed an SFP, the opposite side of an active gap, or the confirmed structural low/high. Do not widen risk because another module still shows a nearby band.

**Management:** target the next opposing swing, liquidity pool, ranked level, value-area edge, or confirmed measured objective. If price closes through the supporting zone, accept the invalidation. A breaker or inverted FVG is a new piece of context, not permission to keep the original trade open.

## False-positive guardrails

- A zone can remain correctly drawn while price ignores it. Require a reaction.
- BOS and CHoCH depend on confirmed pivots, so they are deliberately later than a raw wick. Do not treat the lag as a defect or anticipate an unconfirmed label.
- Divergent structure layers usually mean the chart is mixing scales or the market is ranging. Reduce size or wait for a clearer sequence.
- Volume grading, buy/sell splits, and money-flow estimates are derived from the loaded candles. They are not exchange-level order-flow data and become less useful on thin symbols.
- A previously touched or deeply mitigated zone is weaker context than a fresh one.
- Macro blocks can lag by several chart bars. Never use their late arrival as if it were an entry at the origin candle.
- If the chart looks like a wall of rectangles and labels, the system is not giving more confirmation; it is hiding which condition actually matters.

## Signals & alerts

Alert Center exposes the implemented Structure events: **bos, choch, cisd, ob_touch, ob_break, fvg_retest, ifvg, liq_grab, sfp, and pd_golden_touch**. Direction and strength filters are available only where the owning event supplies them.

Useful two-step sequences must stay inside the same suite. Examples are **liquidity grab → bullish CHoCH**, **FVG retest → BOS**, or **order-block touch → CHoCH** within a chosen bar window. A sequence records order; it does not prove profitability.

Several other chart events remain visual context only. Smart S/R, Money Flow Profile, and Auto Patterns do not currently add creatable Alert Center conditions. Alerts evaluate the actual suite modules on confirmed data, but an alert is still a notification to inspect the chart, not an instruction to trade.
`;

export const zh = `# 结构核心作战手册

Structure Core 是一张地图，不是一堆交易信号。九个模块分别回答四类问题：谁在控制价格、哪里值得决策、什么能确认反应，以及哪里证明逻辑错误。每个可见图层只承担一个任务时，图表才真正可读。

## 系统地图

- **Market Structure 市场结构**建立摆动序列，并标记 BOS、CHoCH、CISD、投影水平与可选摆动注释。
- **Premium & Discount 溢价折价、Smart S/R 智能支撑阻力、Money Flow Profile 资金流分布**负责位置：价格位于当前区间高位还是低位、是否靠近反复防守的水平位、是否处于成交参与集中的区域。
- **Order Blocks 订单块与 Fair Value Gaps 公平价值缺口**描述位移留下的区域。它们是潜在反应区，不是自动入场点。
- **Liquidity 流动性与 Swing Failure 摆动失败**描述前高前低附近的失败拍卖。价格扫过明显流动性池并收回时，它们最有价值。
- **Auto Patterns 自动形态**用已确认拐点连接趋势线或通道，并可在确认突破后投射一个测量目标。

记住四个动词：**画地图、找位置、等触发、做管理**。市场结构画地图；一种价值工具和一种区域工具找位置；流动性或摆动失败可以触发；结构边界、区域边界和已确认形态几何负责风险与目标。

## 阅读顺序

1. **先只看市场结构。** 判断已确认摆动是在抬高、下移，还是来回交替。CHoCH 提醒控制权可能变化；之后同方向 BOS 的确认力度更高。
2. **只选一种位置视角。** 溢价折价适合判断价格在有效摆动区间中的位置；智能支撑阻力适合观察反复水平反应；资金流分布适合观察控制点与价值区边缘附近的接受或拒绝。
3. **只选一种区域家族。** 关注位移起点时用订单块；关注位移留下的失衡时用公平价值缺口。两者可以同时使用，但前提是重叠真的比单独一层讲出更清晰的故事。
4. **等待价格反应。** 扫流动性、SFP 收回区间、FVG 回测、订单块拒绝，或新的结构事件，才把“位置”变成“决策”。
5. **入场前先定义失败。** 支撑逻辑的边界被收盘穿越后，即使另一层装饰仍显示看涨，原交易逻辑也已经失效。

## 周期角色

Structure Core 的每个模块都根据**当前图表周期**的K线重新计算。切换图表周期会改变拐点、区间、区域与事件；套件背后没有隐藏的固定三日线或周线计算。

唯一可选的粗粒度图层，是订单块中的 **Macro blocks 宏观订单块**。它把已加载图表K线按固定四根一组，再在更短的合成序列上运行同一检测器。因此日线图产生的是大约四日块，而不是自然周K线。只有整组完成且下一根图表K线已经开出后，该组才会参与计算，所以宏观层会刻意延迟，也不会改写仍在形成的分组。它是背景，不是独立高周期行情源。

若要进行多周期分析，请在单独的高周期图上确定大结构，再回到执行周期等待真正触发。不要在没有记录来源的情况下，把一个周期的水平位与另一个周期的入场混为一谈。

## 清爽起步方案

先只打开**市场结构**。把事件保留数量降到只需看清最近序列，并关闭当前问题不需要的摆动标签、菱形、双顶双底或投影。

然后只添加以下一种：

- **公平价值缺口**：获得清楚的位移与回测视图。
- **订单块**：观察起始区域；胶囊与数字遮挡价格时，降低 Show Last 并关闭成交量内部信息。
- **溢价与折价**：获得最简洁的区间位置地图。

只有当前高低点是形态核心时，才添加**流动性或摆动失败**。智能支撑阻力、资金流分布、自动形态也都应针对一个明确问题开启，问题回答后就关闭。

实用的视觉预算是：**一个结构层 + 一个位置／区域层 + 一个触发层**。默认的 **Structure Focus 结构聚焦**方案只保留市场结构。熟悉之后，需要完整但仍克制的流程时，可切换到 **Structure Workflow 结构工作流**；它加入公平价值缺口与溢价折价，分别负责方向、失衡区域和区间位置。

## 准备 → 触发 → 失效 → 管理

**准备：**已确认结构先提供方向。随后价格接近同方向的重要位置，例如上升区间的折价区、下降区间的溢价区、新鲜同向订单块或缺口、评级较高的支撑阻力区域。

**触发：**要求该位置出现证据，例如扫单后收回、已确认 SFP、从区域拒绝收盘，或 CHoCH 后接 BOS。触碰只代表信息；收盘与后续结构才说明买卖双方是否真正取得控制。

**失效：**选择一条能证明逻辑错误的边界。它可能是订单块外沿、形成 SFP 的摆动点、有效缺口另一侧，或已确认结构低点／高点。不要因为另一模块附近还有一条色带就扩大风险。

**管理：**目标可以是下一个反向摆动点、流动性池、评级水平位、价值区边缘或已确认测量目标。价格收盘穿越支撑区域时，应接受失效。破坏块或反转 FVG 是新的背景信息，不是继续保留原交易的理由。

## 假信号防线

- 区域可以被正确绘制，但价格仍可能完全无视它；必须等待反应。
- BOS 与 CHoCH 依赖已确认拐点，因此必然晚于原始影线。不要把这种延迟当成错误，也不要预判尚未确认的标签。
- 结构图层互相冲突，通常代表混合了不同尺度或市场正在震荡；应减小仓位或等待更清楚的序列。
- 成交量评级、买卖拆分与资金流都是从已加载K线推算，不是交易所级订单流；流动性很差的标的上意义更低。
- 已多次触碰或深度回补的区域，通常不如新鲜区域有价值。
- 宏观订单块可能落后数根图表K线，绝不能把它的延迟出现当成起始K线上的入场信号。
- 如果图上已经是一堵矩形与标签的墙，系统不是在提供更多确认，而是在掩盖真正关键的条件。

## 信号与提醒

提醒中心目前开放以下结构事件：**bos、choch、cisd、ob_touch、ob_break、fvg_retest、ifvg、liq_grab、sfp、pd_golden_touch**。只有拥有方向或强度数据的事件，才可使用对应过滤器。

有价值的两步序列必须来自同一个套件，例如**流动性扫单 → 看涨 CHoCH**、**FVG 回测 → BOS**，或**订单块触及 → CHoCH**，并设置允许的K线间隔。序列只记录事件顺序，并不证明组合具有盈利能力。

还有一些事件只保留为图表背景。智能支撑阻力、资金流分布与自动形态目前没有可创建的提醒中心条件。提醒会在已确认数据上运行真实套件模块，但它仍然只是通知你检查图表，而不是自动交易指令。
`;
