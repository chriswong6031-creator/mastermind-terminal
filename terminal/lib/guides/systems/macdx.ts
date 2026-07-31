// Suite-level learning guide for MACD Ultimate.
// Original Mastermind wording only; module behavior is sourced from the live suite implementation.

export const en = `# MACD Ultimate Playbook

MACD Ultimate separates momentum into jobs that classic MACD often compresses into one picture. The Engine describes normalized state, the Histogram reveals acceleration and contraction, Signals waits for a correctly directed cross at an extreme, Divergence grades the push, Phase Trend locks a persistent side, and the Dashboard compares the same engine across completed bar groups.

## System map

- **MACD Engine** calculates the fast-minus-slow average, normalizes it against its trailing 250-bar range to ±100, and smooths that normalized curve into the signal line.
- **MACD Signals** prints only correctly directed MACD/signal crosses inside the selected extreme zone. Ordinary mid-range crosses are intentionally silent.
- **Histogram** shows the normalized MACD-to-signal spread. Sign gives direction, opacity shows whether the spread is expanding or contracting, and a plus marks a two-bar-confirmed side flip.
- **MACD Divergence** compares confirmed price pivots with confirmed normalized-MACD pivots, including regular and hidden classes.
- **Phase Trend** is a binary persistence ribbon. It commits up or down only when MACD is on the matching side of its signal line and has moved that way for three consecutive bars.
- **MTF Dashboard** summarizes MACD state, the latest extreme-zone signal, and the committed phase for Chart, completed 2×, and completed 4× bar groups.

The system path is **state → acceleration → rotation → persistence**. No single layer has to pretend to answer all four.

## Reading order

1. **Read the Engine relationship.** Note the side of zero, slope, distance from the ±100 rails, and position relative to the signal line.
2. **Read Histogram opacity before height.** Solid columns say the MACD/signal spread is still expanding; translucent columns say it is contracting. A confirmed sign flip is later but firmer.
3. **Use Phase Trend as a filter.** Its up/down lane reports committed persistence, not an entry. A fresh opposing signal against a locked phase is countertrend until price proves otherwise.
4. **Demand the right rotation.** Signals only marks an up-cross in the negative extreme or a down-cross in the positive extreme. Silence in the middle is a feature.
5. **Grade the turn.** Divergence changes conviction, while completed 2×/4× cells show whether the fast Chart change has spread to slower fixed groups.

## Timeframe roles

Every module begins with the bars on the **current chart timeframe**. Changing the chart timeframe changes the moving averages, trailing normalization range, pivots, crosses, histogram, and phase. The suite is not pinned to a hidden weekly or three-day MACD.

The Dashboard's 2× and 4× columns are completed fixed bar groups built from the chart's loaded bars. They are not independent timeframe requests. A daily chart creates two-day and four-day groups anchored to the loaded series, not calendar weeks or months.

The newest coarse group is omitted until full. Its MACD is then recomputed using the same live Engine parameters and the same Signals extreme threshold. A 4× cell may remain unchanged for three chart bars and needs deeper source history because it has only one quarter as many observations. Use Chart for execution, completed 2×/4× for context, and an actual higher-timeframe chart when calendar alignment matters.

## Clean-first recipe

Begin with the default **MACD Focus** recipe: Engine alone. Learn the zero line, ±100 saturation rails, signal relationship, and chosen color mode before adding more encodings.

Move to **MACD Workflow** for practical execution. It adds Signals and Histogram: one sparse extreme-rotation layer and one continuous acceleration layer.

Keep Divergence, Phase Trend, and MTF Dashboard off until each earns its space:

- Add **Phase Trend** when you need a persistent directional filter that ignores one-bar noise.
- Add **Divergence** when price extends but normalized momentum does not.
- Add **MTF Dashboard** when a Chart turn needs completed coarse-group confirmation.

All satellite modules read the Engine's live fast, slow, signal, and average settings. Retuning the Engine recalibrates the whole suite. Raising the Signals extreme threshold is a separate choice: it removes shallower turns but does not change the Engine itself.

## Setup → trigger → invalidation → management

**Setup:** bring a price trend or structure thesis first. Then look for normalized MACD to stretch against the opposing rail during a pullback or to lose efficiency near an important price level. Histogram contraction or divergence can warn that the current push is tiring.

**Trigger:** the clean mean-reversion trigger is an extreme-zone MACD Signal in the thesis direction plus price confirmation. A confirmed Histogram flip can be used as an earlier momentum handover, but mid-range flips occur often and need stronger price structure. Phase Trend is deliberately too late to be the trigger.

**Invalidation:** define the stop from the price swing or level that produced the setup. The oscillator may recross its signal or histogram zero while price remains inside the same valid structure. A pane value does not prove the price thesis wrong.

**Management:** expanding Histogram opacity supports the active push; several contracting bars warn against adding. A confirmed flip against the position, loss of zero, a mirrored extreme signal, opposing price structure, or the planned price target can manage the exit. Treat Phase alignment and completed 2×/4× agreement as confidence inputs, not reasons to widen risk.

## False-positive guardrails

- ±100 means strongest momentum relative to the trailing normalization window. It is not a reversal probability, price target, or guarantee of exhaustion.
- Saturation can persist through a powerful trend. Wait for a correctly directed cross and price reaction.
- The Signals module intentionally rejects mid-range crosses and wrong-way crosses inside an extreme. Recreating every classic MACD cross defeats its noise filter.
- Histogram flips mark a change in the MACD/signal spread, not necessarily a price-trend reversal. Strong trends can flip during ordinary pauses.
- Regular divergence can form several times before price turns. Hidden divergence still requires an intact price trend.
- Phase Trend is binary up/down persistence. Its names do not claim institutional accumulation or distribution, and its three-bar lock makes it a filter rather than an early entry.
- Gaps, thin trading, and bad prints can dominate a trailing normalization range and manufacture an apparent extreme.
- Completed coarse cells deliberately lag and depend on enough loaded history. Disagreement among Chart, 2×, and 4× is information, not an error.

## Signals & alerts

Alert Center exposes **macdx_signal, macdx_div, and macdx_hist_flip**. These come from Signals, Divergence, and Histogram.

Useful same-suite two-step sequences include **MACD divergence → MACD signal** and **Histogram flip → MACD signal** inside a chosen bar window. The first asks for deteriorating efficiency before extreme rotation; the second asks for a momentum handover before the sparse reversal marker. Neither sequence supplies price invalidation.

The Engine's zero cross and Phase Trend's phase commit remain chart-only events, and the MTF Dashboard emits no events. Hiding Histogram flip glyphs or reducing Show Last does not silence the underlying alert tape. Confirmed alerts do not repaint, but they still need price inspection before action.
`;

export const zh = `# MACD Ultimate 作战手册

MACD Ultimate 把经典 MACD 经常压在一张图里的动量信息拆成不同任务。引擎描述标准化状态，柱状图揭示加速与收缩，信号只等待极值区内方向正确的交叉，背离评估推动质量，Phase Trend 锁定持续方向，面板则比较已完成K线分组上的同一套引擎。

## 系统地图

- **MACD Engine 引擎**计算快慢均线差，再按过去250根区间把它标准化到±100，并对标准化曲线平滑得到信号线。
- **MACD Signals 信号**只打印所选极值区内、方向正确的 MACD／信号线交叉。普通中区交叉被刻意保持沉默。
- **Histogram 柱状图**显示标准化 MACD 与信号线之间的差。正负代表方向，透明度表示差值正在扩张还是收缩，加号标记经过两根确认的换边。
- **MACD Divergence 背离**比较已确认价格拐点与标准化 MACD 拐点，包括常规与隐藏类别。
- **Phase Trend 阶段趋势**是一条二元持续状态带。只有 MACD 位于信号线对应一侧，并连续三根向该方向移动时，才锁定多头或空头阶段。
- **MTF Dashboard 多分辨率面板**汇总 Chart、已完成2×、已完成4×分组上的 MACD 状态、最近极值区信号与已锁定阶段。

系统路径是：**状态 → 加速度 → 旋转 → 持续性**。没有任何单层需要假装同时回答四个问题。

## 阅读顺序

1. **先读引擎关系。** 观察零轴哪一侧、斜率、距离±100轨道多远，以及 MACD 与信号线的相对位置。
2. **先读柱状透明度，再读高度。** 实色柱说明 MACD／信号线差仍在扩张，半透明柱说明正在收缩；已确认换边更晚，但更坚实。
3. **把 Phase Trend 当过滤器。** 多空泳道报告已经锁定的持续状态，不是入场点。新出现的反向信号若对抗锁定阶段，在价格证明之前都属于逆势。
4. **要求正确旋转。** 信号模块只标记负极值区的上穿，或正极值区的下穿；中区保持沉默是功能，不是缺失。
5. **评估转折。** 背离改变信心；已完成2×／4×单元格说明快速 Chart 变化是否传导到更慢固定分组。

## 周期角色

所有模块都从**当前图表周期**的K线开始。切换图表周期会改变均线、滚动标准化区间、拐点、交叉、柱状图与阶段；套件不会固定使用隐藏周线或三日线 MACD。

面板的2×与4×列，是从图上已加载K线构建的已完成固定分组，并非独立周期请求。日线图产生两日与四日分组，并以已加载序列为锚点，不是自然周或自然月。

最新粗分组凑满之前会被剔除。完成后，它使用引擎当前参数与信号模块当前极值阈值重新计算。4×单元格可以连续三根图表K线不变，并且因为观察数量只有四分之一，需要更深源历史。用 Chart 负责执行，用已完成2×／4×负责背景；需要自然周期对齐时，直接打开真实高周期图。

## 清爽起步方案

先使用默认 **MACD Focus** 方案：只打开引擎。加入更多编码之前，先掌握零轴、±100饱和轨道、信号线关系与所选配色模式。

进入实际执行阶段后切换到 **MACD Workflow**。它加入信号与柱状图：一层稀疏的极值旋转标记，加一层连续的加速度信息。

先关闭背离、Phase Trend 与 MTF 面板，只有它们值得占据空间时再加入：

- 需要忽略单根噪音的持续方向过滤器时，加 **Phase Trend**。
- 价格继续延伸但标准化动量没有跟随时，加**背离**。
- Chart 转折需要已完成粗分组确认时，加 **MTF 面板**。

所有卫星模块都读取引擎当前的快、慢、信号与均线参数。重新调整引擎会校准整套工具。调高信号极值阈值属于另一项选择：它剔除较浅转折，却不会改变引擎本身。

## 准备 → 触发 → 失效 → 管理

**准备：**先带入价格趋势或结构逻辑。随后寻找标准化 MACD 在回踩时到达相反轨道，或者在重要价格水平附近失去推动效率。柱状收缩或背离可以提醒当前这一推正在疲劳。

**触发：**最干净的均值回归触发，是逻辑方向上的极值区 MACD 信号，再加价格确认。已确认柱状翻转可以作为更早的动量易手，但中区翻转频繁，需要更强价格结构。Phase Trend 刻意太晚，不适合充当触发。

**失效：**止损取自形成设置的价格摆动点或水平位。振荡器可以在同一有效价格结构内再次穿越信号线或柱状零轴；子窗读数不能证明价格逻辑错误。

**管理：**柱状透明度持续扩张，支持当前推动；连续数根收缩则提醒停止加仓。逆向已确认翻转、跌破或升破零轴、镜像极值信号、相反价格结构或预定价格目标，都可以管理退出。把 Phase 协同和已完成2×／4×一致性当作信心输入，而不是扩大风险的理由。

## 假信号防线

- ±100 表示相对于滚动标准化窗口的最强动量，不是反转概率、价格目标或耗尽保证。
- 强趋势中饱和可以持续很久；必须等待方向正确的交叉与价格反应。
- 信号模块刻意拒绝中区交叉，以及极值区内方向错误的交叉。重新显示每个经典 MACD 交叉，会破坏它的降噪价值。
- 柱状翻转代表 MACD／信号线差改变方向，不一定等于价格趋势反转。强趋势在普通停顿中也会翻转。
- 常规背离可以在价格真正转向前连续形成；隐藏背离仍然要求价格趋势完整。
- Phase Trend 是二元多空持续状态，其名称不声称机构吸筹或派发；三根锁定规则决定它是过滤器，而不是早期入场。
- 跳空、流动性很薄和坏价可能主导滚动标准化区间，制造表面极值。
- 已完成粗格刻意滞后，也依赖足够加载历史。Chart、2×、4×不一致是信息，不是错误。

## 信号与提醒

提醒中心开放 **macdx_signal、macdx_div、macdx_hist_flip**，分别来自信号、背离与柱状图。

有价值的同套件两步序列包括**MACD 背离 → MACD 信号**，以及在限定K线窗口内的**柱状翻转 → MACD 信号**。前者要求极值旋转前先出现推动效率恶化，后者要求稀疏反转标记前先出现动量易手。两者都不能提供价格失效位。

引擎零轴交叉与 Phase Trend 阶段锁定目前都是图表事件，MTF 面板不产生事件。隐藏柱状翻转字形或减少 Show Last，不会让底层提醒事件带停用。已确认提醒不会重绘，但行动前仍必须检查价格。
`;
