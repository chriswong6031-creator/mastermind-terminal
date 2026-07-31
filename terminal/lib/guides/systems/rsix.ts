// Suite-level learning guide for RSI Ultimate.
// Original Mastermind wording only; module behavior is sourced from the live suite implementation.

export const en = `# RSI Ultimate Playbook

RSI Ultimate turns one oscillator into a staged decision process. The Engine describes state, Signals waits for a confirmed turn, Channels asks whether the move is unusual for this RSI, Divergence grades the quality of price's push, and the Dashboard compares the same logic at three completed bar-group depths.

## System map

- **RSI Engine** is the shared source of truth. It calculates Wilder RSI from the selected price source, optionally smooths it, and gives the entire suite the same 65 overbought, 35 oversold, and 50 regime references.
- **RSI Signals** marks one confirmed reversal per extreme excursion, projects Deviation +1 and +2 follow-through levels, and shows RSI-versus-smoothing crosses outside the 45–55 neutral band.
- **RSI Divergence** compares confirmed price and RSI pivots. It includes regular reversal context and hidden continuation context.
- **RSI Channels** surrounds RSI with a Bollinger, Keltner, or Donchian envelope so a reading can be judged against the oscillator's own recent behavior.
- **MTF Dashboard** summarizes RSI value, latest signal, and latest divergence for Chart, completed 2×, and completed 4× bar groups.

The system path is **calibrate → classify → rotate → verify delivery**. An extreme creates attention. Rotation creates timing. Price defines the trade.

## Reading order

1. **Calibrate the Engine first.** Choose length, source, and smoothing before reading another module. Every dependent module uses that same live RSI.
2. **Classify state before looking for a reversal.** RSI holding above 50 supports positive momentum; below 50 supports negative momentum. A print beyond 65 or 35 is stretch, not permission to fade it.
3. **Use one definition of unusual.** Fixed 65/35 zones answer whether RSI reached the suite's shared extreme. Channels answer whether it also escaped its own adaptive envelope.
4. **Wait for rotation.** A reversal triangle confirms after the extreme pivots. A crossover dot can show an earlier handover outside the neutral band, but it is the softer event.
5. **Grade, then manage.** Divergence can improve or weaken the setup. Deviation +1/+2 reports oscillator follow-through. Completed 2×/4× cells show whether the slower fixed groups agree.

## Timeframe roles

All five modules calculate from the **current chart bars**. Changing the chart timeframe changes RSI, its pivots, channels, signals, and divergence. The suite does not secretly hold itself to a fixed daily, three-day, or weekly feed.

The MTF Dashboard does not request independent higher-timeframe candles. It groups the bars already loaded on the chart into fixed sets of two and four, rebuilds OHLCV for each complete set, and reruns the shared RSI settings on those shorter series. On a three-day chart, for example, 2× is a completed six-day bar group and 4× is a completed twelve-day bar group; neither is a calendar timeframe.

The forming 2× or 4× group is excluded. A completed 4× cell can remain unchanged for three new chart bars, and its shorter history needs more source bars to warm up. Use Chart for timing and completed coarse cells for context. If you need an actual weekly judgment, open a weekly chart.

## Clean-first recipe

Begin with the default **RSI Focus** recipe: RSI Engine alone. Learn the relationship among 35, 50, 65, the wave, and its smoothing line without any markers competing for attention.

Move to **RSI Workflow** when that grammar is clear. It adds Signals, giving you confirmed reversal triangles, follow-through ladders, and neutral-gated crossover dots.

Leave Divergence, Channels, and the MTF Dashboard off until one of them answers a specific question:

- Add **Channels** when a fixed 65/35 reading needs to be compared with the oscillator's recent volatility.
- Add **Divergence** when price makes a new extreme and you need to judge the efficiency of that push.
- Add **MTF Dashboard** when a fast Chart turn needs completed 2×/4× context.

Changing Engine length, source, or smoothing recalibrates the modules that read it. Do not compare signals before and after a setting change as if they came from the same system.

## Setup → trigger → invalidation → management

**Setup:** establish a price-based direction and level first. For a long, that may be an intact uptrend pulling into support while RSI moves into oversold or below an adaptive lower channel. For a short, mirror the logic at resistance.

**Trigger:** require rotation rather than a first extreme touch. The clean suite trigger is a confirmed reversal triangle. An out-of-neutral-band smoothing crossover may be used earlier only when price confirms the same turn. Divergence and a channel break improve context but are not independent entries.

**Invalidation:** define failure on price: below the swing or level that produced a long trigger, or above the equivalent short structure. RSI can revisit an extreme without invalidating the same price thesis, so an arbitrary oscillator number is not a stop.

**Management:** Deviation +1 and +2 show whether the oscillator delivered its normal follow-through; they are not price take-profit levels. A quick +1 supports holding or tightening to the price structure. Failure to reach +1 during its twelve-bar life is evidence that the turn stalled. Use the 50 line, opposing price structure, a planned price target, or an opposite confirmed reversal to manage the remainder.

## False-positive guardrails

- RSI can stay above 65 or below 35 through a strong trend. Extreme means stretched, not finished.
- A first touch of a fixed rail or adaptive channel is context. Require a close, rotation, or price reaction.
- Regular divergence can repeat through the first fast leg of a trend. It describes deteriorating efficiency, not the date of reversal.
- Hidden divergence is continuation context only while the existing price trend remains intact.
- A Bollinger channel responds fastest and can produce more shallow breaks; Keltner is smoother; Donchian is stepped and more selective. Model choice changes the question being asked.
- Reversal triangles confirm one bar after their extreme. That delay is the cost of a fixed marker, not a missed real-time signal.
- A very short RSI or smoothing length increases both speed and noise. It does not uncover a more accurate market.
- Completed 2×/4× cells deliberately lag. Do not use a forming coarse group or relabel fixed groups as calendar timeframes.

## Signals & alerts

Alert Center exposes **rsix_reversal, rsix_div, and rsix_chan_break**. They come from the Signals, Divergence, and Channels modules respectively.

Useful same-suite two-step sequences include **RSI divergence → RSI reversal** and **RSI channel break → RSI reversal** within a chosen bar window. The order can reduce noise, but it cannot replace a price level or make a countertrend trade safe.

Engine zone entries and 50-line crosses, Deviation touches, smoothing crossover dots, and MTF cells remain chart-only context today. Alerts use confirmed events even if Show Last has hidden an older drawing. A notification is a request to inspect price and risk, not an automatic order.
`;

export const zh = `# RSI Ultimate 作战手册

RSI Ultimate 把一条振荡器整理成分阶段决策流程。引擎描述状态，信号模块等待确认转折，通道判断本次波动对当前 RSI 是否异常，背离评估价格推动质量，面板则用三种已完成K线分组深度比较同一套逻辑。

## 系统地图

- **RSI Engine 引擎**是共享数据源。它按所选价格源计算 Wilder RSI，可选择平滑，并让整套工具统一使用 65 超买、35 超卖和 50 状态中轴。
- **RSI Signals 信号**为每次极值越界标记一个已确认反转，投射 Deviation +1 与 +2 跟进位，并显示 45–55 中性带之外的 RSI／平滑线交叉。
- **RSI Divergence 背离**比较已确认的价格拐点与 RSI 拐点，包括常规反转背景和隐藏延续背景。
- **RSI Channels 通道**用 Bollinger、Keltner 或 Donchian 包络围住 RSI，使读数能与振荡器自身近期行为比较。
- **MTF Dashboard 多分辨率面板**汇总 Chart、已完成2×、已完成4×分组的 RSI 数值、最近信号与最近背离。

系统路径是：**校准 → 分类 → 旋转 → 验证兑现**。极值负责引起注意，旋转负责择时，价格负责定义交易。

## 阅读顺序

1. **先校准引擎。** 阅读其他模块之前，先确定周期、数据源与平滑。所有依赖模块都会使用同一条实时 RSI。
2. **先判断状态，再找反转。** RSI 持续在 50 上方支持正动量，在 50 下方支持负动量。越过 65 或 35 只是延伸，不代表可以立即逆向。
3. **一次只用一种“异常”定义。** 固定 65／35 区域回答 RSI 是否进入套件共用极值；通道回答它是否也越过自身自适应包络。
4. **等待旋转。** 反转三角在极值拐点确认后出现。中性带外的交叉圆点可以更早显示动量易手，但属于较柔和事件。
5. **评估质量，再做管理。** 背离可以改善或削弱准备条件；Deviation +1／+2 说明振荡器是否跟进；已完成2×／4×单元格说明更慢固定分组是否同意。

## 周期角色

五个模块都根据**当前图表K线**计算。切换图表周期会改变 RSI、拐点、通道、信号与背离；套件不会暗中固定在日线、三日线或周线。

MTF 面板不会请求独立高周期K线。它把图上已加载K线固定按两根和四根分组，为每个完整分组重建 OHLCV，再用共享 RSI 参数在更短序列上重算。例如三日图上的2×是已完成六日分组，4×是已完成十二日分组；两者都不是自然周期。

形成中的2×或4×会被剔除。一个已完成4×单元格可以连续三根新图表K线不变，较短的粗序列也需要更多源K线预热。用 Chart 负责择时，用已完成粗格负责背景。需要真正周线判断时，请直接打开周线图。

## 清爽起步方案

先使用默认 **RSI Focus** 方案：只打开 RSI 引擎。在没有标记争夺注意力时，先熟悉 35、50、65、波线与平滑线之间的关系。

掌握语法后切换到 **RSI Workflow**。它加入信号模块，提供已确认反转三角、跟进阶梯与中性带过滤后的交叉圆点。

一开始关闭背离、通道与 MTF 面板，只有它们能回答一个明确问题时再加入：

- 固定 65／35 读数需要与振荡器近期波动比较时，加**通道**。
- 价格创新极值、需要评估推动效率时，加**背离**。
- 快速 Chart 转折需要已完成2×／4×背景时，加 **MTF 面板**。

更改引擎周期、数据源或平滑，会重新校准所有读取它的模块。设置改变前后的信号不应被当作同一套系统直接比较。

## 准备 → 触发 → 失效 → 管理

**准备：**先建立基于价格的方向与水平位。做多可以是完整上升趋势回踩支撑，同时 RSI 进入超卖或跌破自适应下轨；做空则在阻力处使用镜像逻辑。

**触发：**要求旋转，而不是第一次触及极值。最干净的套件触发是已确认反转三角。中性带外的平滑线交叉可以更早使用，但必须有同方向价格确认。背离与通道突破能够改善背景，却不是独立入场点。

**失效：**把失败定义在价格上：多头触发对应的摆动点或水平位下方，空头则在相反结构上方。RSI 可以在同一价格逻辑仍有效时再次进入极值，因此任意振荡器数字都不应充当止损。

**管理：**Deviation +1 与 +2 说明振荡器是否完成正常跟进，它们不是价格止盈位。快速触及 +1 支持继续持有，或按价格结构收紧风险；在十二根有效期内无法到达 +1，则说明转折可能停滞。剩余仓位可用 50 中轴、相反价格结构、预定价格目标或反向已确认反转管理。

## 假信号防线

- 强趋势中，RSI 可以长期停留在 65 上方或 35 下方；极值代表延伸，不代表结束。
- 第一次触及固定轨道或自适应通道只是背景，必须等待收盘、旋转或价格反应。
- 常规背离可以在新趋势第一段快速推动中反复出现；它描述效率恶化，不负责给出反转日期。
- 隐藏背离只有在原有价格趋势保持完整时，才具有延续意义。
- Bollinger 反应最快，也可能产生更多浅突破；Keltner 更平滑；Donchian 呈阶梯且更克制。模型选择会改变你提出的问题。
- 反转三角在极值后一根才确认。这种延迟是固定标记的代价，不是漏掉实时信号。
- 很短的 RSI 或平滑周期会同时提高速度与噪音，并不会揭示更准确的市场。
- 已完成2×／4×刻意滞后。不要使用形成中的粗分组，也不要把固定分组改名成自然周期。

## 信号与提醒

提醒中心开放 **rsix_reversal、rsix_div、rsix_chan_break**，分别来自信号、背离与通道模块。

有价值的同套件两步序列包括**RSI 背离 → RSI 反转**和**RSI 通道突破 → RSI 反转**，并设置允许的K线窗口。顺序可以减少噪音，但不能替代价格水平位，也不能让逆势交易自动变安全。

引擎进入极值与穿越 50、Deviation 触及、平滑线交叉圆点以及 MTF 单元格，目前都只是图表背景。即使 Show Last 已隐藏较旧绘图，提醒仍会使用已确认事件。通知只是请你检查价格与风险，不是自动下单指令。
`;
