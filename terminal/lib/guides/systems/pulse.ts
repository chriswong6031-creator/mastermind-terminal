// Suite-level learning guide for Pulse Oscillator.
// Original Mastermind wording only; module behavior is sourced from the live suite implementation.

export const en = `# Pulse Timing Playbook

Pulse is an execution suite, not a directional oracle. It is deliberately good at showing momentum rotation before price structure confirms, which is useful only when another part of the chart has already told you which side is worth trading.

## System map

- **Pulse Wave** is the shared engine. It normalizes momentum, colors four phases, and owns the Scalper, Day Trader, and Swing Trader profiles used by dependent modules.
- **Pulse Signals** converts selected wave turns into buy/sell reversals, continuation diamonds, extreme dots, and optional gapped crosses.
- **Divergences** compare confirmed price pivots with confirmed Pulse pivots and include regular, hidden, and stacked forms.
- **Volume Mapping** places relative-volume participation in the same pane as the wave.
- **Money Flows** adds MFI and estimated cumulative-volume-delta pressure beside the wave.
- **MTF Dashboard** summarizes state, the latest signal, and the latest divergence for Chart, completed 2×, and completed 4× bar groups.

The workflow is **bring bias → observe stretch → wait for rotation → grade confirmation**. Pulse should answer when, not what.

## Reading order

1. **Bring a price-based bias.** Use trend, market structure, or a level outside the Pulse pane to choose long, short, or no trade.
2. **Read the Wave phase.** An extreme beyond the rail is stretch, not a signal. The first useful change is the slope turning and the phase leaving decay.
3. **Wait for a confirmed marker.** The buy/sell reversal family prints after the relevant turn becomes knowable. Gapped crosses and dip diamonds are earlier or softer context.
4. **Grade the turn.** Relative volume, MFI, and estimated CVD can show whether participation agrees. They do not turn a countertrend setup into a trend trade.
5. **Check completed coarse state.** Chart is the timing column. Completed 2× and 4× columns show whether the broader fixed-group state supports or opposes it.

## Timeframe roles

Pulse Wave and every dependent pane module calculate from the **current chart bars**. Changing the chart timeframe changes the wave and all signals that read it.

The MTF Dashboard's 2× and 4× columns are not independently fetched timeframes. They group the loaded chart bars by count, rebuild OHLCV for each complete group, and rerun Pulse on those shorter series. On a daily chart they represent two-day and four-day groups, not weekly and monthly candles.

The newest coarse group is excluded until complete. A 4× cell can therefore remain unchanged for up to three chart bars, and the shorter grouped history needs more loaded source bars to warm up. Use the completed cells as slow context and Chart as the trigger.

## Clean-first recipe

Start with **Pulse Wave + Pulse Signals** on the Day Trader profile. Keep the gapped companion visible, but hide optional Peak Dots and Gapped Crosses until the main four-phase grammar is familiar.

Leave Divergences, Volume Mapping, Money Flows, and the MTF Dashboard off at first. Then add only the module needed to answer one question:

- **Divergences** when the quality of a price push is in doubt.
- **Volume Mapping** when participation on the turn is the question.
- **Money Flows** when price-volume pressure agreement matters.
- **MTF Dashboard** when fast timing needs slower fixed-group context.

Changing the Pulse Profile changes the engine used by Signals, Divergences, and the Dashboard. Treat a profile change as a recalibration of the whole suite, not a cosmetic preference.

## Setup → trigger → invalidation → management

**Setup:** an external trend or structure bias is already established. Pulse moves into the opposite extreme during a pullback, or loses force as price reaches a meaningful level.

**Trigger:** require the wave to rotate. A Pulse buy/sell marker is the cleanest suite trigger. A gapped cross can arrive earlier but needs stronger price confirmation. Divergence can improve the setup, but it is not the trigger.

**Invalidation:** stops belong to price. Use the swing or level that produced the Pulse turn. An oscillator can rotate twice while price remains inside the same structure, so placing risk at an arbitrary wave value does not define what proves the trade wrong.

**Management:** while the wave rises through constructive phases, momentum is delivering. A roll into decay, a zero-line loss, opposing price structure, or the planned price target can govern the exit. Volume and money-flow disagreement should reduce confidence; it should not automatically reverse the position.

## False-positive guardrails

- A normalized oscillator can remain pinned beyond ±60 or ±80 during a strong trend. Extreme does not mean reversal.
- Regular divergence is especially dangerous in the first fast leg of a trend; it can repeat while price keeps extending.
- Hidden divergence is continuation context and still needs the existing trend to remain intact.
- Pulse buy/sell markers are timing events. Against the external bias they are countertrend fades.
- Volume Mapping uses relative chart volume. Money Flows uses candle-derived MFI and estimated CVD, not exchange-level signed order flow.
- A faster Profile increases responsiveness and noise at the same time. It does not reveal a truer market.
- Chart/2×/4× disagreement is expected near turns. Do not describe an incomplete coarse group as confirmation.

## Signals & alerts

Alert Center exposes **pulse_buy, pulse_sell, and pulse_div**. Buy and sell events come from Pulse Signals; divergence comes from the confirmed divergence module.

Useful same-suite sequences include **Pulse divergence → Pulse buy**, **Pulse divergence → Pulse sell**, or a reversal in one direction followed by the opposite reversal within a chosen window as a failed-turn warning. Only events present in the Alert Center catalog can be used as sequence steps.

Wave zero crosses, extreme entries/exits, dip diamonds, gapped crosses, volume changes, money-flow changes, and MTF cells remain chart-only context today. Every confirmed marker is final on its bar, but no oscillator event replaces the need to verify price and define risk.
`;

export const zh = `# 脉冲择时作战手册

Pulse 是执行套件，不是方向预言器。它刻意擅长在价格结构确认之前显示动量旋转；只有图表其他部分已经告诉你哪一侧值得交易时，这种提前才有价值。

## 系统地图

- **Pulse Wave 脉冲波**是共享引擎。它把动量标准化、用四种颜色表示阶段，并拥有 Scalper、Day Trader、Swing Trader 三种配置，供依赖模块共同使用。
- **Pulse Signals 脉冲信号**把选定的波形转折转换成买卖反转、延续菱形、极值圆点与可选的间隔交叉。
- **Divergences 背离**比较已确认的价格拐点与脉冲拐点，包括常规、隐藏与叠加背离。
- **Volume Mapping 成交量映射**把相对成交参与度放进同一个脉冲窗口。
- **Money Flows 资金流**在脉冲波旁加入 MFI 与估算累计成交量差压力。
- **MTF Dashboard 多分辨率面板**汇总 Chart、已完成2×、已完成4×分组上的状态、最近信号与最近背离。

工作流是：**先带入偏向 → 观察延伸 → 等待旋转 → 评估确认**。Pulse 应该回答“何时”，而不是“做哪边”。

## 阅读顺序

1. **先带入基于价格的偏向。** 使用趋势、市场结构或脉冲窗外的重要水平位，决定做多、做空或不交易。
2. **读取脉冲波阶段。** 越过极值轨道代表延伸，不是信号。第一个可用变化是斜率转向，并从衰减阶段离开。
3. **等待已确认标记。** 买卖反转只有在相关转折可以确定后才出现；间隔交叉与回踩菱形属于更早或更柔和的背景。
4. **评估转折质量。** 相对成交量、MFI 与估算 CVD 可以说明参与度是否同意，但不能把逆势设置变成顺势交易。
5. **检查已完成粗粒度状态。** Chart 是择时列；已完成2×与4×说明更大固定分组背景是否支持或反对它。

## 周期角色

脉冲波与所有依赖模块都根据**当前图表K线**计算。切换图表周期会改变脉冲波以及读取它的所有信号。

MTF 面板的2×与4×不是独立获取的周期。它按根数对已加载图表K线分组，为每个完整分组重建 OHLCV，再在更短序列上重新运行 Pulse。日线图上它们表示两日与四日分组，不是周线与月线。

最新粗分组在完成前会被剔除，所以4×单元格最多可以连续三根图表K线不变；更短的分组序列也需要更深的源历史才能预热。用已完成单元格负责慢背景，用 Chart 负责触发。

## 清爽起步方案

先用 Day Trader 配置只打开**脉冲波 + 脉冲信号**。保留较慢的间隔伴随线，但在熟悉四阶段语法之前，先隐藏可选 Peak Dots 与 Gapped Crosses。

一开始关闭背离、成交量映射、资金流与 MTF 面板。之后只添加能回答当前问题的模块：

- 怀疑价格推动质量时，加**背离**。
- 想判断转折是否有成交参与时，加**成交量映射**。
- 关注价量压力是否一致时，加**资金流**。
- 快速择时需要慢速固定分组背景时，加**MTF 面板**。

改变 Pulse Profile 会同时改变信号、背离与面板使用的引擎。应把配置变化视为整个套件重新校准，而不是外观偏好。

## 准备 → 触发 → 失效 → 管理

**准备：**外部趋势或结构偏向已经建立。回踩过程中 Pulse 进入相反极值，或者价格到达重要水平时动量开始失去力量。

**触发：**必须等待波形旋转。Pulse 买卖标记是最干净的套件触发；间隔交叉可以更早，但需要更强的价格确认。背离可以改善准备条件，却不是触发本身。

**失效：**止损属于价格。使用产生 Pulse 转折的摆动点或水平位。振荡器可以在同一价格结构内旋转两次，因此随意用某个波值放置风险，并不能说明什么会证明交易错误。

**管理：**脉冲波持续经过建设性上升阶段，代表动量正在兑现。转入衰减、跌回零轴、出现相反价格结构，或达到预定价格目标，都可以成为退出依据。成交量与资金流不一致应降低信心，而不是自动反向开仓。

## 假信号防线

- 强趋势中，标准化振荡器可以长期停留在±60或±80以外；极值不等于反转。
- 常规背离在新趋势第一段快速推动中最危险，它可以反复出现，而价格继续延伸。
- 隐藏背离属于延续背景，仍然要求原趋势结构保持完整。
- Pulse 买卖标记只是择时事件；与外部偏向相反时，就是逆势交易。
- 成交量映射使用图表相对成交量；资金流使用K线推导的 MFI 与估算 CVD，不是真实交易所签名订单流。
- 更快配置会同时提高反应速度与噪音，并不代表看到更“真实”的市场。
- Chart／2×／4×在转折附近不一致属于正常现象，绝不能把未完成粗分组称为确认。

## 信号与提醒

提醒中心开放 **pulse_buy、pulse_sell、pulse_div**。买卖事件来自脉冲信号，背离事件来自已确认背离模块。

有价值的同套件序列包括**脉冲背离 → Pulse Buy**、**脉冲背离 → Pulse Sell**，或者某方向反转后在限定窗口内出现相反反转，用作失败转折警告。只有提醒中心目录中存在的事件才能作为序列步骤。

零轴交叉、进入／离开极值、回踩菱形、间隔交叉、成交量变化、资金流变化与 MTF 单元格目前都只是图表背景。每个已确认标记在对应K线上都是最终结果，但任何振荡器事件都不能替代价格验证与风险定义。
`;
