"use client";

import type { SuiteModuleCatalogEntry } from "@/lib/suites/catalog";

export interface GuideWorkflowItem {
  id: string;
  title: string;
  summary: string;
  modules?: readonly string[];
}

interface GuideWorkflowProps {
  items: readonly GuideWorkflowItem[];
  label: string;
  eyebrow?: string;
}

export default function GuideWorkflow({
  items,
  label,
  eyebrow,
}: GuideWorkflowProps) {
  return (
    <div className="gp-workflow" aria-label={label}>
      <div className="gp-workflow-head">
        <span>{eyebrow ?? label}</span>
        <small>{items.length} steps</small>
      </div>
      <ol>
        {items.map((item, index) => (
          <li key={item.id}>
            <span className="gp-workflow-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="gp-workflow-copy">
              <strong>{item.title}</strong>
              <small>{item.summary}</small>
              {!!item.modules?.length && (
                <span className="gp-workflow-modules">
                  {item.modules.map((module) => <code key={module}>{module}</code>)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function moduleGuideWorkflow(
  entry: SuiteModuleCatalogEntry,
  zh: boolean,
): readonly GuideWorkflowItem[] {
  const name = entry.label;
  const oscillator = entry.suiteKey === "pulse" || entry.suiteKey === "rsix" || entry.suiteKey === "macdx";
  const context = entry.suiteKey === "structure"
    ? (zh ? "先确认当前摆动方向与有效区间。" : "Confirm the active swing direction and range first.")
    : entry.suiteKey === "trend"
      ? (zh ? "先确定执行周期与更高周期的趋势偏向。" : "Set the execution and higher-timeframe trend bias.")
      : (zh ? "先由价格结构或趋势确定交易方向。" : "Bring direction from price structure or trend.");
  const setup = entry.surface === "dashboard"
    ? (zh ? "等待各状态单元完成后再比较协同。" : "Wait for state cells to complete before comparing alignment.")
    : entry.surface === "candles"
      ? (zh ? "观察状态颜色持续，而不是单根闪变。" : "Look for a durable state, not a one-candle color flicker.")
      : (zh ? `等待 ${name} 的形态进入有效区域。` : `Wait for the ${name} setup to enter its valid area.`);
  const trigger = entry.surface === "dashboard"
    ? (zh ? "把仪表盘作为确认，不把它当成独立入场信号。" : "Use the dashboard as confirmation, not a standalone entry.")
    : oscillator
      ? (zh ? "要求动量旋转，并由价格或第二项证据确认。" : "Demand momentum rotation plus price or a second confirmation.")
      : (zh ? "等待收盘、重测或结构事件确认反应。" : "Wait for a close, retest, or structure event to confirm the reaction.");
  const invalidation = entry.suiteKey === "trend"
    ? (zh ? "用趋势轨道或形态背后的价格摆动定义失效。" : "Anchor invalidation to the trend rail or the price swing behind the setup.")
    : oscillator
      ? (zh ? "若动量重新转回且价格未跟进，原择时逻辑失效。" : "The timing thesis fails when momentum rotates back without price follow-through.")
      : (zh ? "用能证明原逻辑错误的价格边界定义风险。" : "Use the price boundary that proves the original thesis wrong.");
  const exit = entry.suiteKey === "trend"
    ? (zh ? "按目标阶梯减仓，让追踪风险决定剩余仓位。" : "Scale at the target ladder and let trailing risk manage the remainder.")
    : (zh ? "在下一结构、流动性或预先定义目标处管理退出。" : "Manage the exit at the next structure, liquidity, or predefined objective.");

  return [
    { id: "context", title: zh ? "环境" : "Context", summary: context },
    { id: "setup", title: zh ? "准备" : "Setup", summary: setup },
    { id: "trigger", title: zh ? "触发" : "Trigger", summary: trigger },
    { id: "invalidation", title: zh ? "失效" : "Invalidation", summary: invalidation },
    { id: "exit", title: zh ? "退出" : "Exit", summary: exit },
  ];
}
