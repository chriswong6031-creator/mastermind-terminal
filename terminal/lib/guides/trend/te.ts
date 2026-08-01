// Guide content for the trend/te premium-suite module — bundled (NOT served from public/):
// Next's standalone server does not serve public/ files added after the build, and guides
// ship with the build rather than being rsync'd like /data. Lazily imported by GuidePanel.
// Markdown is rendered through lib/md.ts (escape-safe).

export const en = `# Trend Engine

An ATR rail that flips only after price closes through it. The flip starts an episode; the same rail defines direction, retests, and trailing risk.

## Read the chart

- **Rail below price:** bullish regime. **Rail above price:** bearish regime. It ratchets toward price and resets only on a confirmed close-through.
- **BUY / SELL:** the close that flipped the rail.
- **BUY+ / SELL+:** the same flip with absolute 10-bar momentum at or above its trailing 70th percentile. It is a strength grade, not a separate trigger.
- **POWER:** a bullish flip within ten bars of RSI reclaiming 25, or a bearish flip within ten bars of RSI falling back below 75.
- **Dot on the rail:** price touched the rail but closed on the trend side; the retest held.
- **TP ladder:** volatility-scaled or fixed-percentage targets. A check mark means price traded through that level.
- **SL trail:** the rail is the stop model. The optional Shadow Band sits one ATR farther away for context only.

## Use it

- The flip close is the earliest entry. The first held retest offers a tighter risk line but may never arrive.
- For a long, the thesis survives while closes stay above the rail; for a short, while closes stay below it. A close-through flips the regime and invalidates the prior direction.
- Read higher-timeframe rail direction before taking a lower-timeframe flip. A flip against it is countertrend, not confirmation.
- Use the target ladder to predefine exits. **+** and **POWER** grade the flip; they do not cancel the rail or stop rules.

Repeated flips around a flat rail are chop. Reduce participation or raise Sensitivity instead of treating every pill as a fresh trend.

## Settings

- **Sensitivity (1–10, default 5)** — 1 reacts fastest; 10 uses a wider, slower rail.
- **Auto-Optimize (off)** — chooses the best recent sensitivity. It retunes as data changes and can restyle past signals; leave it off for stable history.
- **Trend Band / Background Tint / Pills / Tiers / Retest Dots** — display controls.
- **Shadow Band** — optional second rail one ATR farther from price.
- **Take Profit** — Off, Dynamic ATR ladder (1–6 levels), or three Fixed % levels.
- **Stop Loss** — trailing rail, Fixed %, or Off.
- **Show Last (default 2)** — episodes that retain full TP/SL graphics. Older flips remain visible.

## Signals & alerts

The chart emits **te_flip**, **te_power**, **te_retest**, **te_tp_hit**, and **te_sl_hit**. A Fixed % stop can emit **te_sl_hit**; a trailing-rail exit appears as the next **te_flip**. Alert Center exposes **te_flip**, **te_power**, and **te_tp_hit**; retest and stop events remain chart-only.

With Auto-Optimize off, confirmed flips and event history are forward-only. TP/SL events are still evaluated when an older episode's ladder is hidden by Show Last.
`;

export const zh = `# 趋势引擎（Trend Engine）

一条只在收盘穿越后才翻转的 ATR 轨道。翻转开启一段行情；同一条轨道同时定义方向、回踩与跟踪风险。

## 读图

- **轨道在价格下方：** 多头状态；**轨道在价格上方：** 空头状态。轨道只向价格收紧，直到收盘穿越后重置。
- **BUY / SELL：** 让轨道翻转的那根收盘 K 线。
- **BUY+ / SELL+：** 同一次翻转，但 10 根绝对动能达到过去窗口的第 70 百分位或更高。它是强度评级，不是另一个触发。
- **POWER：** RSI 上穿 25 后十根内出现的看涨翻转，或 RSI 下穿 75 后十根内出现的看跌翻转。
- **轨道圆点：** 价格触及轨道，但收盘仍在趋势一侧；回踩守住。
- **TP 阶梯：** 按波动率或固定百分比计算的目标；打勾表示价格已触及该档。
- **SL trail：** 轨道就是跟踪止损模型。可选 Shadow Band 位于更外侧一个 ATR，只提供参考。

## 怎么用

- 翻转收盘是最早进场；第一次守住轨道的回踩能缩小风险，但不一定出现。
- 做多时，收盘保持在轨道上方，逻辑仍在；做空时反之。收盘穿越会翻转状态，并使原方向失效。
- 先看高周期轨道方向，再处理低周期翻转。逆高周期的翻转是逆势单，不是确认。
- 用 TP 阶梯预先定义出场。**+** 与 **POWER** 只给翻转评级，不会取消轨道或止损规则。

价格围绕走平轨道反复翻转，就是震荡。减少参与，或提高 Sensitivity；不要把每个标签都当作新趋势。

## 设置

- **Sensitivity（1–10，默认 5）** —— 1 反应最快；10 的轨道更宽、更慢。
- **Auto-Optimize（默认关闭）** —— 自动选择近期表现最好的灵敏度。它会随数据重新调参，并可能改变历史信号样式；需要稳定历史时保持关闭。
- **Trend Band / Background Tint / Pills / Tiers / Retest Dots** —— 显示开关。
- **Shadow Band** —— 比主轨道再远一个 ATR 的可选参考轨道。
- **Take Profit** —— Off、Dynamic ATR 阶梯（1–6 档）或三档 Fixed %。
- **Stop Loss** —— 跟踪轨道、Fixed % 或 Off。
- **Show Last（默认 2）** —— 保留完整 TP/SL 图形的最近行情段；更早的翻转仍显示。

## 信号与提醒

图表会产生 **te_flip**、**te_power**、**te_retest**、**te_tp_hit** 与 **te_sl_hit**。Fixed % 止损可产生 **te_sl_hit**；跟踪轨道离场则表现为下一次 **te_flip**。提醒中心开放 **te_flip**、**te_power**、**te_tp_hit**；回踩与止损事件仅用于图表。

关闭 Auto-Optimize 时，已确认翻转与事件历史只向前计算。旧行情段即使因 Show Last 隐藏了阶梯，仍会继续评估 TP/SL 事件。
`;
