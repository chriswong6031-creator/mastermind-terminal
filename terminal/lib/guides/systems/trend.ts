// Suite-level learning guide for Trend Waves.
// Original Mastermind wording only; module behavior is sourced from the live suite implementation.

export const en = `# Trend Waves Playbook

Trend Waves is the suite that can carry a trade from direction to exit. The Trend Engine owns the adaptive rail, entry flips, retests, target ladder, and stop model. The other four modules should clarify that path, not compete with it.

## System map

- **Trend Engine** is the execution spine: adaptive bands, BUY/SELL flips, stronger signal tiers, retests, TP1–TP6, and fixed or trailing stops.
- **Flow Band** combines trend and volume into a directional cloud with turns, retests, and quality scores.
- **Volt Bands** frame volatility expansion and identify excursions outside the envelope followed by a return inside.
- **Candle Painter** colors price by trend, momentum, volume, or a combined state. It is an ambient scan layer, not a separate signal.
- **Market Dashboard** summarizes volatility, compression, trend, pressure, rating, and the Trend Engine side on Chart, completed 2×, and completed 4× groups.

The clean workflow is **bias → execution → invalidation → management**. Trend Engine answers every stage. Flow Band and the Dashboard can confirm direction. Volt Bands can warn that an entry is extended. Candle Painter makes state changes faster to scan.

## Reading order

1. **Read the Trend Engine rail.** Price above a rising support-side rail is constructive; price below a falling resistance-side rail is defensive. A flip begins a new episode, but the distance from the rail determines how much risk that episode requires.
2. **Check participation.** A Flow Band pointing the same way and expanding cleanly strengthens the trend read. A fading or opposing cloud lowers confidence.
3. **Check extension.** Price far outside Volt Bands may still continue, but a new entry is paying for movement that already happened. A close back inside is the module's actual reversal confirmation.
4. **Check coarse state if the Dashboard is enabled.** Chart reacts first. Completed 2× and 4× cells trade speed for stability. A chart flip against both coarse cells is countertrend until those cells or price structure confirm otherwise.
5. **Read the risk path before acting.** Know whether the selected stop is trailing, fixed, or off and how many target rungs are visible.

## Timeframe roles

Trend Engine, Flow Band, Volt Bands, and Candle Painter all calculate from the **current chart timeframe**. Their signals and levels change when the chart timeframe changes.

Market Dashboard does not fetch separate higher-timeframe candles. Its **Chart, 2×, and 4×** cells group the bars already loaded on the chart. A 2× group is two chart bars and a 4× group is four, regardless of calendar boundaries. The latest coarse group is excluded until complete, so a 4× cell may lag by as many as three chart bars. Once a completed cell appears, a forming group does not revise it.

Use Chart for execution and completed 2×/4× for context. If you need a true weekly or 3-day view, open that actual chart timeframe; do not rename a fixed bar grouping as a calendar timeframe.

## Clean-first recipe

Start with **Trend Engine only** and keep **Show Last** at one or two episodes. Leave the adaptive band, pills, three dynamic targets, and trailing stop visible. This is enough to understand direction, current invalidation, and target progress.

Then add one confirmation layer:

- **Flow Band** when you want participation and retest quality.
- **Market Dashboard** when you want a compact state checklist and completed coarse confirmation.
- **Volt Bands** when overextension and return-inside behavior are central to the setup.

Use **Candle Painter** instead of extra overlays when the goal is fast scanning. Avoid running combined Candle Painter, background tint, multiple clouds, Volt Bands, and the full Dashboard merely because each is available; they can repeat the same state in five visual languages.

## Setup → trigger → invalidation → management

**Setup:** the rail establishes a directional regime. Prefer episodes where Flow Band agrees, the Dashboard is not warning of opposing coarse state, and price is not already far beyond the volatility envelope.

**Trigger:** a confirmed Trend Engine flip is the earliest entry. The first orderly retest of the rail or Flow Band is usually a tighter execution because the invalidation is closer. A Power signal describes a stronger episode, but it does not remove the need for a price-based risk level.

**Invalidation:** the selected stop model defines the mechanical line. With a trailing stop, the adaptive rail ratchets behind price and does not give ground until the regime flips. With a fixed stop, the percentage is measured from the signal episode. If your price structure fails before the mechanical stop, the trade thesis may already be wrong.

**Management:** the TP ladder records expansion from the entry. A check mark means price traded through that rung; it does not mean an order was executed. Use TP1 as evidence that the episode delivered initial follow-through, then decide whether later rungs or the trailing stop govern the remainder. A sell flip or stop event ends the long episode; the short side mirrors the same logic.

## False-positive guardrails

- Adaptive trend rails flip repeatedly in sideways markets. Compression can be useful, but repeated flips inside a narrow range are not a trend.
- A BUY pill after a large gap or extended candle may be directionally correct and still offer poor reward relative to the rail.
- A Flow Band score grades its own retest; it is not a probability of profit.
- Volt Band contact is not a reversal. The close back inside and price confirmation matter.
- Chart, 2×, and 4× disagreement is information, not an error. It says the fast and slow groupings are describing different phases.
- Dynamic targets are calculated projections, not guaranteed liquidity or fills. Fixed-percent targets are equally mechanical.
- Candle color is a summary of the selected model. It should never override a stop, structure failure, or opposing risk level.

## Signals & alerts

Alert Center exposes **te_flip, te_power, te_tp_hit, fb_turn, and vb_retest**. Each belongs to the module that computes it and can carry direction and strength.

Two-step same-suite sequences can reduce noise. Examples include **Flow Band turn → Trend Engine flip**, **Trend Engine flip → TP1 hit**, or **Volt Band retest → Trend Engine flip** within a defined bar window. A TP-hit alert reports that price crossed a rung; it does not place or confirm a broker order.

Trend Engine also produces stop and retest context on the chart, while Market Dashboard rating changes and Candle Painter states are not currently creatable Alert Center conditions. Use alerts to bring the chart back into view, then verify the rail, price structure, and current target/stop state before acting.
`;

export const zh = `# 趋势波段作战手册

Trend Waves 是可以把一笔交易从方向一路带到退出的套件。趋势引擎负责自适应轨道、入场翻转、回测、目标阶梯与止损模型；其余四个模块应当让这条路径更清楚，而不是与它争夺注意力。

## 系统地图

- **Trend Engine 趋势引擎**是执行主轴：自适应带、BUY/SELL 翻转、更强信号等级、回测、TP1–TP6，以及固定或追踪止损。
- **Flow Band 流向带**把趋势与成交量结合成方向云带，并给出转向、回测与质量评分。
- **Volt Bands 波动带**框定波动扩张，识别价格越过包络后重新收回带内的过程。
- **Candle Painter 蜡烛着色**按趋势、动量、成交量或综合状态改变K线颜色。它是环境扫描层，不是独立信号。
- **Market Dashboard 市场仪表盘**汇总波动、压缩、趋势、压力、评级，以及 Chart、已完成2×、已完成4×分组上的趋势引擎方向。

清晰工作流是：**偏向 → 执行 → 失效 → 管理**。趋势引擎可以回答全部四步；流向带与仪表盘确认方向；波动带提醒入场是否已经过度延伸；蜡烛着色让状态变化更容易扫描。

## 阅读顺序

1. **先读趋势引擎轨道。** 价格位于上升的支撑侧轨道之上属于建设性状态；位于下降的阻力侧轨道之下属于防御性状态。翻转开启新一段行情，但价格离轨道多远，决定这段行情需要承担多少风险。
2. **检查参与度。** 流向带同向并干净扩张，会加强趋势判断；云带衰减或反向，则降低信心。
3. **检查延伸程度。** 价格远在波动带之外仍可能延续，但新入场是在为已经发生的波动付费。重新收盘回到带内，才是该模块真正的反转确认。
4. **若启用仪表盘，检查粗粒度状态。** Chart 反应最快；已完成2×与4×用速度换稳定。Chart 翻转但两个粗格仍反向，在粗格或价格结构确认之前都属于逆势设置。
5. **行动前读清风险路径。** 明确当前止损是追踪、固定还是关闭，并知道显示多少个目标阶梯。

## 周期角色

趋势引擎、流向带、波动带与蜡烛着色都根据**当前图表周期**计算。切换图表周期后，它们的信号与水平位也会改变。

市场仪表盘不会另行获取高周期K线。它的 **Chart、2×、4×** 单元格，只对图上已加载K线做分组。2×就是两根图表K线，4×就是四根，不考虑自然周期边界。最新粗分组在完成前会被剔除，因此4×最多可能落后三根图表K线；完整单元格一旦出现，就不会被形成中的分组修改。

用 Chart 负责执行，用已完成2×／4×负责背景。如果需要真正的周线或三日线，应打开对应实际图表周期，不要把固定K线分组误称为自然周期。

## 清爽起步方案

先只打开**趋势引擎**，并把 **Show Last** 保持在一到两个行情段。保留自适应带、信号标签、三个动态目标和追踪止损；这已经足以理解方向、当前失效位置与目标进度。

然后只添加一个确认层：

- 需要参与度与回测质量时，加**流向带**。
- 需要紧凑状态检查与粗粒度确认时，加**市场仪表盘**。
- 形态核心是过度延伸与回到带内时，加**波动带**。

如果目标只是快速扫描，使用**蜡烛着色**代替更多叠加层。不要仅仅因为功能都可用，就同时运行综合蜡烛着色、背景色、多个云带、波动带与完整仪表盘；它们可能只是用五种视觉语言重复同一个状态。

## 准备 → 触发 → 失效 → 管理

**准备：**轨道先建立方向状态。优先选择流向带同意、仪表盘没有相反粗粒度警告、且价格尚未远离波动包络的行情段。

**触发：**已确认趋势引擎翻转是最早入场。第一次有序回测轨道或流向带，通常提供更紧的执行，因为失效位更近。Power 信号代表更强的行情段，但仍然需要基于价格的风险边界。

**失效：**所选止损模型定义机械边界。追踪止损会让自适应轨道跟随价格单向推进，直到状态翻转；固定止损则从信号段起点按百分比测量。如果价格结构先于机械止损失败，交易逻辑可能已经错误。

**管理：**TP 阶梯记录从入场起的扩张。出现勾号表示价格交易穿过该级，并不代表订单已经成交。TP1 说明行情完成第一段跟进，之后再决定由后续目标还是追踪止损管理剩余仓位。卖出翻转或止损事件结束多头行情段；空头完全镜像处理。

## 假信号防线

- 自适应趋势轨道在横盘中会反复翻转。压缩状态可以提供背景，但窄区间内连续翻转不等于趋势。
- 大幅跳空或延伸K线后的 BUY 标签，方向可能正确，但相对轨道的盈亏比仍可能很差。
- 流向带评分只评估自己的回测质量，不是盈利概率。
- 触碰波动带不是反转；重新收盘回带内与价格确认才重要。
- Chart、2×、4×不一致是信息，不是错误，代表快速与慢速分组处于不同阶段。
- 动态目标只是计算投影，不保证存在流动性或成交；固定百分比目标同样是机械规则。
- K线颜色只是所选模型的摘要，绝不能覆盖止损、结构失败或相反风险水平。

## 信号与提醒

提醒中心开放 **te_flip、te_power、te_tp_hit、fb_turn、vb_retest**。每个事件都由真正计算它的模块拥有，并可携带方向与强度。

同套件两步序列可以降低噪音，例如**流向带转向 → 趋势引擎翻转**、**趋势引擎翻转 → TP1 达成**，或**波动带回测 → 趋势引擎翻转**，并设置允许的K线窗口。止盈触达提醒只表示价格越过阶梯，不代表券商订单已提交或成交。

趋势引擎还会在图上产生止损与回测背景；市场仪表盘评级变化与蜡烛着色状态目前不是可创建的提醒中心条件。提醒的作用是把你带回图表，行动前仍应检查轨道、价格结构以及当前目标／止损状态。
`;
