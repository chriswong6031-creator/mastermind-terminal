"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import GuideVisual from "@/components/guides/GuideVisual";
import GuideSystemVisual from "@/components/guides/GuideSystemVisual";
import GuideWorkflow, {
  moduleGuideWorkflow,
  type GuideWorkflowItem,
} from "@/components/guides/GuideWorkflow";
import { parseGuideDocument, type GuideSectionKind, type ParsedGuideDocument } from "@/lib/guides/document";
import { loadGuide } from "@/lib/guides/registry";
import {
  SYSTEM_GUIDE_LIST,
  getSystemGuide,
  loadSystemGuide,
  localizeSystemGuide,
  type SystemGuideDescriptor,
} from "@/lib/guides/systems/registry";
import { useLang, useT } from "@/lib/i18n";
import { SUITE_ALERT_EVENTS } from "@/lib/suiteAlerts";
import { ACS_UPGRADE_URL } from "@/components/settings/types";
import {
  MODULE_CATALOG,
  MODULE_CATEGORIES,
  getSuiteModuleCatalogEntry,
  suiteModuleId,
  type SuiteModuleCatalogEntry,
} from "@/lib/suites/catalog";
import {
  matchSuitePreset,
  suitePresetsFor,
  type SuitePresetId,
} from "@/lib/suites/presets";
import type { SuiteField, SuiteTier } from "@/lib/indicator-canvas/types";

export interface GuidePanelProps {
  suiteKey: string;
  moduleKey?: string;
  systemKey?: string;
  moduleLabel: string;
  activeModules?: ReadonlySet<string>;
  activeSuites?: ReadonlySet<string>;
  suiteParams?: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>;
  userTier?: SuiteTier;
  onToggleModule?: (id: string) => void;
  onConfigureModule?: (id: string) => void;
  onApplyPreset?: (suiteKey: string, presetId: SuitePresetId) => void;
  onClose: () => void;
}

type Status = "loading" | "ready" | "missing";

const TIER_RANK: Record<SuiteTier, number> = { free: 0, insider: 1, pro: 2 };
const SECTION_ICON: Record<GuideSectionKind, "eye" | "route" | "tune" | "bell" | "book"> = {
  anatomy: "eye",
  playbook: "route",
  settings: "tune",
  alerts: "bell",
  detail: "book",
};

function Icon({ name }: { name: "add" | "arrow" | "bell" | "book" | "close" | "eye" | "lock" | "remove" | "route" | "search" | "tune" }) {
  if (name === "close") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
  if (name === "add") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>;
  if (name === "remove") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>;
  if (name === "lock") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></svg>;
  if (name === "arrow") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
  if (name === "eye") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.7 12s3.4-5.2 9.3-5.2 9.3 5.2 9.3 5.2-3.4 5.2-9.3 5.2S2.7 12 2.7 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  if (name === "route") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M7.8 17.1c4.4-1.4 1.4-5.3 5.7-6.4 1.5-.4 2.8-1.2 3.6-3" /></svg>;
  if (name === "tune") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>;
  if (name === "bell") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 5 2 7h-15c0-2 2-2 2-7ZM10 20h4" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z" /><path d="M8 20a3 3 0 0 1 3-3h9M9 8h5M9 11h5" /></svg>;
}

function surfaceLabel(surface: SuiteModuleCatalogEntry["surface"], zh: boolean): string {
  const labels = {
    overlay: zh ? "主图叠加" : "Chart overlay",
    pane: zh ? "副图指标" : "Oscillator pane",
    dashboard: zh ? "仪表盘" : "Dashboard",
    candles: zh ? "K线着色" : "Candle layer",
  };
  return labels[surface];
}

function bestUse(entry: SuiteModuleCatalogEntry, zh: boolean): string {
  if (entry.surface === "dashboard") return zh ? "在执行前快速确认多周期状态。" : "Confirm multi-resolution state before execution.";
  if (entry.surface === "candles") return zh ? "无需增加图表杂讯即可快速扫描状态。" : "Scan regime changes without adding chart clutter.";
  if (entry.suiteKey === "structure") return zh ? "先建立市场背景，再确认具体入场。" : "Build market context before confirming an entry.";
  if (entry.suiteKey === "trend") return zh ? "判断方向，并在趋势中管理仓位。" : "Set direction and manage the position through a trend.";
  return zh ? "先由结构或趋势定方向，再用它做择时。" : "Time entries after structure or trend establishes direction.";
}

function guardrail(entry: SuiteModuleCatalogEntry, zh: boolean): string {
  if (entry.surface === "dashboard") {
    return zh ? "高倍周期仅使用已完成的重采样区块；正在形成的区块不会假装已确认。" : "Higher-factor cells use completed resampled blocks; forming blocks are never presented as confirmed.";
  }
  if (entry.moduleKey === "div") return zh ? "背离是背景，不是独立的入场扳机。" : "Divergence is context, not a standalone entry trigger.";
  if (entry.suiteKey === "pulse" || entry.suiteKey === "rsix" || entry.suiteKey === "macdx") {
    return zh ? "极值可以持续很久；等待转折或其他确认。" : "Extremes can persist; wait for a turn or a second confirmation.";
  }
  if (entry.suiteKey === "trend") return zh ? "用高周期定偏向，用当前周期找执行点。" : "Use a higher timeframe for bias and the chart timeframe for execution.";
  return zh ? "等待形态确认；区域和水平位本身不是自动交易信号。" : "Wait for confirmation; zones and levels are not automatic trades.";
}

function fieldDefault(field: SuiteField, value: unknown, zh: boolean): string {
  if (field.type === "bool") return value ? (zh ? "开启" : "On") : (zh ? "关闭" : "Off");
  const option = field.options?.find((candidate) => String(candidate.v) === String(value));
  if (option) return option.label;
  if (field.type === "color") return zh ? "自定义颜色" : "Custom color";
  return String(value ?? "—");
}

function fieldRange(field: SuiteField, zh: boolean): string | null {
  if (field.type === "number" && (field.min !== undefined || field.max !== undefined)) {
    return `${field.min ?? "−∞"}–${field.max ?? "∞"}${field.step !== undefined ? ` · ${zh ? "步长" : "step"} ${field.step}` : ""}`;
  }
  if (field.options?.length) return field.options.map((option) => option.label).join(" · ");
  return null;
}

function GuideSettings({ entry, zh }: { entry: SuiteModuleCatalogEntry; zh: boolean }) {
  if (entry.module.fields.length === 0) {
    return (
      <div className="gp-canonical-empty">
        <Icon name="tune" />
        <span>{zh ? "此模块没有输入项；它会自动继承套件的实时计算环境。" : "This module has no inputs; it inherits the suite's live calculation context automatically."}</span>
      </div>
    );
  }

  return (
    <div className="gp-settings-schema">
      <p className="gp-schema-note">
        {zh
          ? "字段名与实际设置面板保持一致；默认值与范围由当前模块架构实时生成，中文操作说明见下方。"
          : "Labels, defaults, and ranges are generated from the live module schema used by Settings."}
      </p>
      <div className="gp-settings-grid" aria-label={zh ? "当前设置项" : "Current settings schema"}>
        {entry.module.fields.map((field) => {
          const range = fieldRange(field, zh);
          const dependency = field.showIf
            ? `${zh ? "显示条件" : "Shown when"} ${field.showIf.key} = ${String(field.showIf.eq)}`
            : null;
          return (
            <div className="gp-setting-card" key={field.key}>
              <div className="gp-setting-title">
                <strong lang={zh ? "en" : undefined}>{field.label}</strong>
                <code>{field.key}</code>
              </div>
              <div className="gp-setting-meta">
                <span>{zh ? "默认" : "Default"} <b>{fieldDefault(field, entry.module.defaults[field.key], zh)}</b></span>
                {range && <span>{range}</span>}
              </div>
              {field.tip && <p lang={zh ? "en" : undefined}>{field.tip}</p>}
              {dependency && <small>{dependency}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideAlerts({ entry, zh }: { entry: SuiteModuleCatalogEntry; zh: boolean }) {
  const t = useT();
  const alertable = SUITE_ALERT_EVENTS.filter(
    (event) => event.suite === entry.suiteKey && event.module === entry.moduleKey,
  );
  return (
    <div className={`gp-alert-canonical${alertable.length === 0 ? " empty" : ""}`}>
      <div className="gp-alert-head">
        <span className="gp-alert-icon"><Icon name="bell" /></span>
        <span>
          <strong>{alertable.length > 0 ? (zh ? "可在提醒中心使用" : "Available in Alert Center") : (zh ? "提醒中心暂不可用" : "No Alert Center condition")}</strong>
          <small>
            {alertable.length > 0
              ? (zh ? "以下事件来自实时提醒引擎，而不只是图表标记。" : "These conditions come from the live alert engine, not merely chart markers.")
              : (zh ? "此模块目前没有可创建的套件提醒；下方指南会注明任何仅限图表的标记或事件。" : "This module has no creatable suite alert yet; the guide below notes any chart-only markers or events.")}
          </small>
        </span>
      </div>
      {alertable.length > 0 && (
        <div className="gp-event-list">
          {alertable.map((event) => (
            <div key={event.event}>
              <code>{event.event}</code>
              <span>{t(event.tkey, event.en)}</span>
              <small>{[event.dirs ? (zh ? "方向" : "direction") : "", event.strength ? (zh ? "强度" : "strength") : ""].filter(Boolean).join(" · ")}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function moduleMatches(entry: SuiteModuleCatalogEntry, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return `${entry.label} ${entry.tag} ${entry.description} ${entry.descriptionZh} ${entry.aliases.join(" ")} ${entry.aliasesZh.join(" ")}`
    .toLocaleLowerCase()
    .includes(normalized);
}

function systemMatches(descriptor: SystemGuideDescriptor, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const category = MODULE_CATEGORIES.find((candidate) => candidate.suiteKey === descriptor.suiteKey);
  return [
    descriptor.title.en,
    descriptor.title.zh,
    descriptor.summary.en,
    descriptor.summary.zh,
    category?.label,
    category?.description,
    category?.descriptionZh,
  ].filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized);
}

function SystemProfiles({
  descriptor,
  lang,
  params,
  active,
  userTier,
  onApplyPreset,
}: {
  descriptor: SystemGuideDescriptor;
  lang: "en" | "zh";
  params: Readonly<Record<string, unknown>> | undefined;
  active: boolean;
  userTier: SuiteTier;
  onApplyPreset?: (suiteKey: string, presetId: SuitePresetId) => void;
}) {
  const zh = lang === "zh";
  const current = active ? matchSuitePreset(descriptor.suiteKey, params) : null;
  return (
    <section className="gp-profile-lab" aria-label={zh ? "渐进式系统预设" : "Progressive system presets"}>
      <div className="gp-profile-head">
        <span>
          <small>{zh ? "控制图表复杂度" : "Control chart complexity"}</small>
          <strong>{zh ? "从聚焦开始，只在需要时增加证据" : "Start focused. Add evidence only when it earns its place."}</strong>
        </span>
        <span className="gp-profile-current">
          {active
            ? current
              ? (zh ? current.name.zh : current.name.en)
              : (zh ? "自定义组合" : "Custom mix")
            : (zh ? "尚未添加" : "Not on chart")}
        </span>
      </div>
      <div className="gp-profile-grid">
        {suitePresetsFor(descriptor.suiteKey).map((preset, index) => {
          const locked = TIER_RANK[userTier] < TIER_RANK[preset.minTier];
          const selected = active && current?.id === preset.id;
          const dense = preset.id === "research";
          return (
            <article className={`${selected ? "selected " : ""}${dense ? "dense" : ""}`} key={preset.id}>
              <div className="gp-profile-card-head">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{preset.minTier}</small>
              </div>
              <strong>{zh ? preset.name.zh : preset.name.en}</strong>
              <p>{zh ? preset.description.zh : preset.description.en}</p>
              <div className="gp-profile-modules">
                {preset.modules.map((moduleKey) => {
                  const moduleEntry = getSuiteModuleCatalogEntry(suiteModuleId(descriptor.suiteKey, moduleKey));
                  return <span key={moduleKey}>{moduleEntry?.tag ?? moduleKey}</span>;
                })}
              </div>
              {onApplyPreset && (
                locked ? (
                  <a href={ACS_UPGRADE_URL} target="_blank" rel="noopener">
                    <Icon name="lock" />{zh ? "升级解锁" : "Upgrade"}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={selected}
                    onClick={() => onApplyPreset(descriptor.suiteKey, preset.id)}
                  >
                    {selected
                      ? (zh ? "当前组合" : "Current")
                      : active
                        ? (zh ? "应用组合" : "Apply profile")
                        : (zh ? "添加到图表" : "Add to chart")}
                  </button>
                )
              )}
            </article>
          );
        })}
      </div>
      <p className="gp-profile-disclaimer">
        {zh
          ? "预设只改变模块开关；你调整过的参数、颜色与未来字段都会保留。完整研究组合故意较密集，适合探索，不建议作为默认执行视图。"
          : "Profiles change module switches only. Your tuned inputs, colors, and future fields stay intact. Complete Research is intentionally dense for investigation—not the default execution view."}
      </p>
    </section>
  );
}

export default function GuidePanel({
  suiteKey,
  moduleKey,
  systemKey,
  moduleLabel,
  activeModules,
  activeSuites,
  suiteParams,
  userTier = "free",
  onToggleModule,
  onConfigureModule,
  onApplyPreset,
  onClose,
}: GuidePanelProps) {
  const { lang } = useLang();
  const t = useT();
  const zh = lang === "zh";
  const initialId = systemKey
    ? `system:${systemKey}`
    : suiteModuleId(suiteKey, moduleKey ?? "");
  const [currentId, setCurrentId] = useState(initialId);
  const [expandedSuite, setExpandedSuite] = useState(suiteKey);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [document, setDocument] = useState<ParsedGuideDocument | null>(null);
  const [enFallback, setEnFallback] = useState(false);
  const [activeSection, setActiveSection] = useState("anatomy");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const guideSearchRef = useRef<HTMLInputElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const system = getSystemGuide(currentId)
    ?? (currentId === initialId && systemKey ? getSystemGuide(`system:${systemKey}`) : null);
  const entry = system
    ? null
    : getSuiteModuleCatalogEntry(currentId)
      ?? getSuiteModuleCatalogEntry(initialId);
  const title = document?.title
    || (system ? localizeSystemGuide(system.title, lang) : entry?.label)
    || moduleLabel;
  const currentSuite = system?.suiteKey ?? entry?.suiteKey ?? suiteKey;
  const currentModule = entry?.moduleKey ?? moduleKey ?? "";
  const currentModuleId = entry?.id ?? "";
  const suiteCategory = MODULE_CATEGORIES.find((category) => category.suiteKey === currentSuite);
  const localizedSuite = suiteCategory?.tkey ? t(suiteCategory.tkey, suiteCategory.label) : suiteCategory?.label;
  const onChart = !!activeModules?.has(currentModuleId);
  const locked = entry ? TIER_RANK[userTier] < TIER_RANK[entry.tier] : false;
  const systemOnChart = !!system && !!activeSuites?.has(system.suiteKey);
  const systemWorkflow: readonly GuideWorkflowItem[] = system?.workflow.map((stage) => ({
      id: stage.id,
      title: localizeSystemGuide(stage.title, lang),
      summary: localizeSystemGuide(stage.summary, lang),
      modules: stage.moduleKeys.map((moduleKey) => (
        getSuiteModuleCatalogEntry(suiteModuleId(system.suiteKey, moduleKey))?.tag ?? moduleKey
      )),
    })) ?? [];

  useEffect(() => {
    let alive = true;
    (async () => {
      // Cross the microtask boundary before the loading transition so this effect synchronizes
      // with the lazy guide source without a synchronous state cascade.
      await Promise.resolve();
      if (!alive) return;
      setStatus("loading");
      setDocument(null);
      setEnFallback(false);
      setActiveSection("anatomy");
      scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
      const guide = system
        ? await loadSystemGuide(system.id, lang)
        : await loadGuide(currentSuite, currentModule, lang);
      if (!alive) return;
      if (!guide) {
        setStatus("missing");
        return;
      }
      setDocument(parseGuideDocument(guide.text));
      setEnFallback(guide.fellBack);
      setStatus("ready");
    })();
    return () => {
      alive = false;
    };
  }, [currentModule, currentSuite, lang, system]);

  useEffect(() => {
    returnFocusRef.current = documentActiveElement();
    const previousBodyOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      globalThis.document.body.style.overflow = previousBodyOverflow;
      const target = returnFocusRef.current;
      window.requestAnimationFrame(() => {
        const libraryGuide = systemKey
          ? Array.from(
              globalThis.document.querySelectorAll<HTMLElement>("[data-guide-system]"),
            ).find((candidate) => candidate.dataset.guideSystem === systemKey)
          : Array.from(
              globalThis.document.querySelectorAll<HTMLElement>("[data-guide-module]"),
            ).find((candidate) => candidate.dataset.guideModule === initialId);
        const returnTarget = target?.isConnected && target !== globalThis.document.body
          ? target
          : libraryGuide;
        returnTarget?.focus({ preventScroll: true });
      });
    };
  }, [initialId, systemKey]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !document) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rootTop = root.getBoundingClientRect().top;
      let next = document.sections[0]?.id ?? "anatomy";
      for (const section of document.sections) {
        const node = root.querySelector<HTMLElement>(`#gp-section-${section.id}`);
        if (node && node.getBoundingClientRect().top - rootTop <= 150) next = section.id;
      }
      setActiveSection(next);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [document]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const current = dialogRef.current?.querySelector<HTMLElement>(".gp-library-modules [aria-current='page']");
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentModuleId]);

  const close = useCallback(() => onClose(), [onClose]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) {
        setQuery("");
        window.requestAnimationFrame(() => guideSearchRef.current?.focus({ preventScroll: true }));
        return;
      }
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const target = event.target as HTMLElement;
    if (target === dialogRef.current) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && target === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const selectModule = (next: SuiteModuleCatalogEntry, preserveFocus = false) => {
    if (!preserveFocus) dialogRef.current?.focus({ preventScroll: true });
    setStatus("loading");
    setDocument(null);
    setActiveSection("anatomy");
    setCurrentId(next.id);
    setExpandedSuite(next.suiteKey);
  };

  const selectSystem = (next: SystemGuideDescriptor, preserveFocus = false) => {
    if (!preserveFocus) dialogRef.current?.focus({ preventScroll: true });
    setStatus("loading");
    setDocument(null);
    setActiveSection("anatomy");
    setCurrentId(next.id);
    setExpandedSuite(next.suiteKey);
  };

  const jumpTo = (sectionId: string) => {
    const node = scrollRef.current?.querySelector<HTMLElement>(`#gp-section-${sectionId}`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  const onScrim = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const filteredCatalog = useMemo(
    () => MODULE_CATALOG.filter((candidate) => moduleMatches(candidate, query)),
    [query],
  );
  const filteredSystems = useMemo(
    () => SYSTEM_GUIDE_LIST.filter((candidate) => systemMatches(candidate, query)),
    [query],
  );

  const currentIndex = MODULE_CATALOG.findIndex((candidate) => candidate.id === currentModuleId);
  const previous = currentIndex > 0 ? MODULE_CATALOG[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < MODULE_CATALOG.length - 1 ? MODULE_CATALOG[currentIndex + 1] : null;
  const source = entry?.source ? getSuiteModuleCatalogEntry(entry.source) : null;
  const firstPlaybookIndex = document?.sections.findIndex((section) => section.kind === "playbook") ?? -1;

  return (
    <div className="gp-scrim" onMouseDown={onScrim}>
      <div
        ref={dialogRef}
        className="gp-center"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="gp-head">
          <div className="gp-brandmark" aria-hidden="true"><Icon name="book" /></div>
          <div className="gp-head-copy">
            <strong>{zh ? "指标学院" : "Indicator Academy"}</strong>
            <span>{localizedSuite}<i aria-hidden="true">/</i>{title}</span>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {status === "loading"
              ? (zh ? `正在载入${title}` : `Loading ${title}`)
              : status === "ready"
                ? (zh ? `${title}指南已载入` : `${title} guide loaded`)
                : (zh ? `${title}指南暂不可用` : `${title} guide unavailable`)}
          </span>
          {enFallback && <span className="gp-enchip" title={t("guideEnFallback", "English guide — no Chinese version yet.")}>EN</span>}
          <div className="gp-head-actions">
            {entry && onToggleModule && locked && (
              <a
                className="gp-chart-action upgrade"
                href={ACS_UPGRADE_URL}
                target="_blank"
                rel="noopener"
              >
                <Icon name="lock" />
                {zh ? "升级解锁" : "Upgrade"}
              </a>
            )}
            {entry && onToggleModule && !locked && (
              <button
                type="button"
                className={`gp-chart-action${onChart ? " on" : ""}`}
                aria-pressed={onChart}
                onClick={() => onToggleModule(entry.id)}
              >
                <Icon name={onChart ? "remove" : "add"} />
                {onChart ? (zh ? "已在图表" : "On chart") : (zh ? "添加到图表" : "Add to chart")}
              </button>
            )}
            {entry && onConfigureModule && (
              <button type="button" className="gp-configure" onClick={() => onConfigureModule(entry.id)}>
                <Icon name="tune" />{zh ? "配置" : "Configure"}
              </button>
            )}
            <button type="button" className="gp-close" onClick={close} aria-label={t("guideClose", "Close")}>
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="gp-layout">
          <aside className="gp-library" aria-label={zh ? "指标指南" : "Indicator guides"}>
            <div className="gp-library-head">
              <span>{zh ? "指南库" : "Guide library"}</span>
              <small>{MODULE_CATALOG.length + SYSTEM_GUIDE_LIST.length} {zh ? "节课程" : "lessons"}</small>
            </div>
            <div className="gp-guide-search" role="search">
              <Icon name="search" />
              <label className="sr-only" htmlFor="guide-center-search">{zh ? "搜索指南" : "Search guides"}</label>
              <input
                ref={guideSearchRef}
                id="guide-center-search"
                type="search"
                value={query}
                placeholder={zh ? "搜索系统或模块…" : "Search systems or modules…"}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="gp-guide-clear"
                  aria-label={zh ? "清除指南搜索" : "Clear guide search"}
                  onClick={() => {
                    setQuery("");
                    window.requestAnimationFrame(() => guideSearchRef.current?.focus({ preventScroll: true }));
                  }}
                >
                  <Icon name="close" />
                </button>
              )}
            </div>
            <div className="gp-library-scroll">
              {filteredSystems.length > 0 && (
                <div className="gp-library-systems">
                  <span>{zh ? "系统作战手册" : "System playbooks"}</span>
                  {filteredSystems.map((candidate) => {
                    const category = MODULE_CATEGORIES.find((item) => item.suiteKey === candidate.suiteKey);
                    return (
                      <button
                        type="button"
                        className={system?.id === candidate.id ? "on" : ""}
                        aria-current={system?.id === candidate.id ? "page" : undefined}
                        key={candidate.id}
                        onClick={() => selectSystem(candidate, true)}
                      >
                        <span aria-hidden="true">{category?.tag ?? "M"}</span>
                        <span>{localizeSystemGuide(candidate.title, lang)}</span>
                        <small>{zh ? "系统" : "system"}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {MODULE_CATEGORIES.map((category) => {
                const modules = filteredCatalog.filter((candidate) => candidate.suiteKey === category.suiteKey);
                if (query && modules.length === 0) return null;
                const expanded = query.length > 0 || expandedSuite === category.suiteKey;
                const label = category.tkey ? t(category.tkey, category.label) : category.label;
                return (
                  <div className={`gp-library-group${currentSuite === category.suiteKey ? " current" : ""}`} key={category.suiteKey}>
                    <button
                      type="button"
                      className="gp-library-suite"
                      aria-expanded={expanded}
                      onClick={() => setExpandedSuite(expanded && !query ? "" : category.suiteKey)}
                    >
                      <span className="gp-suite-tag" aria-hidden="true">{category.tag}</span>
                      <span>{label}</span>
                      <small>{modules.length}</small>
                      <Icon name="arrow" />
                    </button>
                    {expanded && (
                      <div className="gp-library-modules">
                        {modules.map((candidate) => (
                          <button
                            type="button"
                            className={candidate.id === currentModuleId ? "on" : ""}
                            aria-current={candidate.id === currentModuleId ? "page" : undefined}
                            key={candidate.id}
                            onClick={() => selectModule(candidate, true)}
                          >
                            <span aria-hidden="true">{candidate.tag}</span>
                            <span lang={zh ? "en" : undefined}>{candidate.label}</span>
                            <small>{candidate.tier}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredCatalog.length === 0 && filteredSystems.length === 0 && (
                <p className="gp-library-empty">{zh ? "没有匹配的指南。" : "No matching guides."}</p>
              )}
            </div>
          </aside>

          <main className="gp-article-wrap">
            <div className="gp-scroll" ref={scrollRef} aria-busy={status === "loading"}>
              {status === "loading" && (
                <div className="gp-skel" aria-hidden="true">
                  <span /><span /><span /><span />
                </div>
              )}
              {status === "missing" && (
                <div className="gp-empty">
                  <Icon name="book" />
                  <strong>{t("guideMissing", "Guide not written yet.")}</strong>
                </div>
              )}
              {status === "ready" && document && (entry || system) && (
                <article className="gp-article">
                  <section className={`gp-hero${system ? " gp-hero-system" : ""}`}>
                    <div className="gp-hero-copy">
                      <div className="gp-breadcrumb">
                        <span>{localizedSuite}</span>
                        <span>{system ? (zh ? "系统作战手册" : "System playbook") : surfaceLabel(entry!.surface, zh)}</span>
                        {entry && <span className={`gp-tier gp-tier-${entry.tier}`}>{entry.tier}</span>}
                      </div>
                      <h1 id="guide-center-title">{title}</h1>
                      <div className="gp-lede" dangerouslySetInnerHTML={{ __html: document.introHtml }} />
                    </div>
                    {system
                      ? <GuideSystemVisual descriptor={system} key={system.id} lang={lang} />
                      : <GuideVisual suiteKey={entry!.suiteKey} moduleKey={entry!.moduleKey} lang={lang} />}
                  </section>

                  <section className="gp-glance" aria-label={zh ? "快速了解" : "At a glance"}>
                    {system ? (
                      <>
                        <div>
                          <span>{zh ? "解决什么" : "What it solves"}</span>
                          <p>{localizeSystemGuide(system.summary, lang)}</p>
                        </div>
                        <div>
                          <span>{zh ? "正确顺序" : "Reading order"}</span>
                          <p>{system.workflow.map((stage) => localizeSystemGuide(stage.title, lang)).join(" → ")}</p>
                        </div>
                        <div>
                          <span>{zh ? "视觉预算" : "Visual budget"}</span>
                          <p>{zh ? "先用聚焦组合；每一层都必须回答一个不同问题。" : "Begin with the Focus profile. Every extra layer must answer a different question."}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span>{zh ? "显示什么" : "What it shows"}</span>
                          <p>{zh ? entry!.descriptionZh : entry!.description}</p>
                        </div>
                        <div>
                          <span>{zh ? "最佳用途" : "Best used for"}</span>
                          <p>{bestUse(entry!, zh)}</p>
                        </div>
                        <div>
                          <span>{zh ? "使用边界" : "Guardrail"}</span>
                          <p>{guardrail(entry!, zh)}</p>
                        </div>
                      </>
                    )}
                  </section>

                  {system && (
                    <SystemProfiles
                      active={systemOnChart}
                      descriptor={system}
                      lang={lang}
                      onApplyPreset={onApplyPreset}
                      params={suiteParams?.[system.suiteKey]}
                      userTier={userTier}
                    />
                  )}

                  <nav className="gp-mobile-toc" aria-label={zh ? "本页内容" : "On this guide"}>
                    {document.sections.map((section, index) => (
                      <button
                        type="button"
                        key={section.id}
                        className={activeSection === section.id ? "on" : ""}
                        aria-current={activeSection === section.id ? "location" : undefined}
                        onClick={() => jumpTo(section.id)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
                      </button>
                    ))}
                  </nav>

                  {document.sections.map((section, index) => (
                    <section
                      className={`gp-section gp-section-${section.kind}`}
                      id={`gp-section-${section.id}`}
                      key={section.id}
                    >
                      <div className="gp-section-heading">
                        <span className="gp-section-number">{String(index + 1).padStart(2, "0")}</span>
                        <span className="gp-section-icon"><Icon name={SECTION_ICON[section.kind]} /></span>
                        <h2>{section.title}</h2>
                      </div>
                      {index === firstPlaybookIndex && (
                        <GuideWorkflow
                          eyebrow={zh ? "决策工作流" : "Decision workflow"}
                          items={system ? systemWorkflow : moduleGuideWorkflow(entry!, zh)}
                          label={zh ? "从环境到退出的决策工作流" : "Decision workflow from context to exit"}
                        />
                      )}
                      {entry && section.kind === "settings" && <GuideSettings entry={entry} zh={zh} />}
                      {entry && section.kind === "alerts" && <GuideAlerts entry={entry} zh={zh} />}
                      <div
                        className={`gp-prose${entry && (section.kind === "settings" || section.kind === "alerts") ? " gp-prose-notes" : ""}`}
                        dangerouslySetInnerHTML={{ __html: section.html }}
                      />
                    </section>
                  ))}

                  {entry && (source || previous || next) && (
                    <footer className="gp-related">
                      <div>
                        <span>{zh ? "继续探索" : "Continue learning"}</span>
                        <strong>{zh ? "在同一个工作流里连接指标" : "Connect the indicator workflow"}</strong>
                      </div>
                      <div className="gp-related-grid">
                        {source && source.id !== entry.id && (
                          <button type="button" onClick={() => selectModule(source)}>
                            <span>{zh ? "计算来源" : "Calculation source"}</span>
                            <strong>{source.label}</strong>
                            <Icon name="arrow" />
                          </button>
                        )}
                        {previous && (
                          <button type="button" className="previous" onClick={() => selectModule(previous)}>
                            <span>{zh ? "上一指南" : "Previous guide"}</span>
                            <strong>{previous.label}</strong>
                            <Icon name="arrow" />
                          </button>
                        )}
                        {next && (
                          <button type="button" onClick={() => selectModule(next)}>
                            <span>{zh ? "下一指南" : "Next guide"}</span>
                            <strong>{next.label}</strong>
                            <Icon name="arrow" />
                          </button>
                        )}
                      </div>
                    </footer>
                  )}
                  {system && (
                    <footer className="gp-related">
                      <div>
                        <span>{zh ? "深入学习" : "Go deeper"}</span>
                        <strong>{zh ? "打开系统中的单模块图解课程" : "Open an animated lesson for each module"}</strong>
                      </div>
                      <div className="gp-related-grid gp-related-system">
                        {system.moduleKeys.map((moduleKey) => {
                          const moduleEntry = getSuiteModuleCatalogEntry(suiteModuleId(system.suiteKey, moduleKey));
                          if (!moduleEntry) return null;
                          return (
                            <button type="button" key={moduleEntry.id} onClick={() => selectModule(moduleEntry)}>
                              <span>{moduleEntry.tag} · {moduleEntry.tier}</span>
                              <strong>{moduleEntry.label}</strong>
                              <Icon name="arrow" />
                            </button>
                          );
                        })}
                      </div>
                    </footer>
                  )}
                </article>
              )}
            </div>
          </main>

          <aside className="gp-toc" aria-label={zh ? "本页内容" : "On this guide"}>
            <span>{zh ? "本页内容" : "On this guide"}</span>
            {document?.sections.map((section, index) => (
              <button
                type="button"
                key={section.id}
                className={activeSection === section.id ? "on" : ""}
                aria-current={activeSection === section.id ? "location" : undefined}
                onClick={() => jumpTo(section.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </button>
            ))}
            <div className="gp-toc-note">
              <span aria-hidden="true">M</span>
              <p>
                {system
                  ? (zh ? "作战手册解释模块如何协同；它不是经过验证的自动交易策略。" : "Playbooks explain how modules work together; they are not validated automated strategies.")
                  : (zh ? "指南描述的是 Mastermind 当前实际实现与默认值。" : "Guides describe the current Mastermind implementation and live defaults.")}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function documentActiveElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}
