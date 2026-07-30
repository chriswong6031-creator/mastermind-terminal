"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang, useT } from "@/lib/i18n";
import { type UserScript } from "@/lib/userScripts";
import { MODULE_CATALOG, MODULE_CATEGORIES, type SuiteModuleCatalogEntry } from "@/lib/suites/catalog";
import { SUITE_DEFS, SUITE_ORDER } from "@/lib/suites/registry";

type ClassicIndicator = { key: string; label: string; mm?: boolean; tkey?: string };

const CATS: Record<string, ClassicIndicator[]> = {
  Mastermind: [{ key: "_oracle", label: "Golden Oracle Confluence", mm: true }],
  Trend: [
    { key: "ema", label: "Moving Averages (EMA 20/50/200)" },
    { key: "bb", label: "Bollinger Bands" },
    { key: "vwap", label: "VWAP" },
    { key: "rvwap", label: "Rolling VWAP (20)", tkey: "indRvwap" },
    { key: "wvwap", label: "Weekly VWAP", tkey: "indWvwap" },
    { key: "avwap", label: "Anchored VWAP", tkey: "indAvwap" },
    { key: "macd", label: "MACD-RSI" },
  ],
  Momentum: [
    { key: "rsi", label: "RSI" },
    { key: "stochrsi", label: "Stochastic RSI" },
  ],
  "Price Action": [{ key: "gaps", label: "Gap Zones" }],
  Volume: [
    { key: "vol", label: "Volume" },
    { key: "vprofile", label: "Volume Profile", tkey: "indVprofile" },
  ],
  // Day Trade suite — spec §2 order: overlays then panes
  daytrade: [
    { key: "svwap", label: "Session VWAP", tkey: "indSvwap" },
    { key: "orb", label: "Opening Range", tkey: "indOrb" },
    { key: "slevels", label: "Session Levels", tkey: "indSlevels" },
    { key: "pivots", label: "Pivot Points", tkey: "indPivots" },
    { key: "rvol", label: "Relative Volume", tkey: "indRvol" },
    { key: "ttmsq", label: "TTM Squeeze", tkey: "indTtmsq" },
    { key: "adx", label: "ADX", tkey: "indAdx" },
    { key: "cvd", label: "Est. CVD (approx)", tkey: "indCvd" },
  ],
};

const CAT_TKEY: Record<string, string> = {
  Mastermind: "catMastermind",
  Trend: "catTrend",
  Momentum: "catMomentum",
  "Price Action": "catPriceAction",
  Volume: "catVolume",
  daytrade: "catDaytrade",
};

const ALL_INDICATORS = "__all__";
const MY_SCRIPTS = "__scripts__";
const SYSTEM_PRESETS = "__presets__";

type Tier = "free" | "insider" | "pro";
const TIER_RANK: Record<Tier, number> = { free: 0, insider: 1, pro: 2 };

/** A preset is addable at the lowest tier that unlocks any of its recommended modules. */
const suiteMinTier = (key: string): Tier => {
  const def = SUITE_DEFS[key];
  if (!def) return "pro";
  let min: Tier = "pro";
  for (const suiteModule of def.modules) {
    if (TIER_RANK[suiteModule.tier] < TIER_RANK[min]) min = suiteModule.tier;
  }
  return min;
};

/** Highest module tier — shown on the preset row so its full reach is explicit. */
const suiteTopTier = (key: string): Tier => {
  const def = SUITE_DEFS[key];
  if (!def) return "pro";
  let top: Tier = "free";
  for (const suiteModule of def.modules) {
    if (TIER_RANK[suiteModule.tier] > TIER_RANK[top]) top = suiteModule.tier;
  }
  return top;
};

const classicEntries = Object.entries(CATS).flatMap(([category, items]) =>
  items.map((item) => ({ category, item })),
);

const moduleCountByCategory = MODULE_CATALOG.reduce<Record<string, number>>((counts, item) => {
  counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
}, {});

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function LockMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function SettingsMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}

function GuideMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5Z" />
      <path d="M8 20a3 3 0 0 1 3-3h6M9 8h5M9 11h5" />
    </svg>
  );
}

function CloseMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export interface IndicatorsModalProps {
  open: boolean;
  active: Set<string>;
  activeModules?: ReadonlySet<string>;
  onClose: () => void;
  /** Classic indicators and the five optional recommended suite presets. */
  onToggle: (key: string) => void;
  /** Applies or reapplies a suite's recommended module mix without removing the suite. */
  onApplyPreset?: (key: string) => void;
  /** Qualified module ids (`suite:<suite>/<module>`) — never short module keys. */
  onToggleModule?: (id: string) => void;
  onOpenModuleSettings?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  scripts?: UserScript[];
  enabled?: Set<string>;
  onToggleScript?: (id: string) => void;
  onRenameScript?: (id: string, name: string) => void;
  onDeleteScript?: (id: string) => void;
  userTier?: Tier;
}

export default function IndicatorsModal({
  open,
  active,
  activeModules,
  onClose,
  onToggle,
  onApplyPreset,
  onToggleModule,
  onOpenModuleSettings,
  onOpenGuide,
  scripts = [],
  enabled,
  onToggleScript,
  onRenameScript,
  onDeleteScript,
  userTier = "free",
}: IndicatorsModalProps) {
  const t = useT();
  const { lang } = useLang();
  const [cat, setCat] = useState<string>(ALL_INDICATORS);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const copy = (en: string, zh: string) => (lang === "zh" ? zh : en);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setQuery("");
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const closeModal = () => {
    setQuery("");
    setRenaming(null);
    onClose();
  };

  const pickCategory = (next: string) => {
    setCat(next);
    setQuery("");
    searchRef.current?.focus();
  };

  const commitRename = (id: string) => {
    const name = draft.trim();
    if (name) onRenameScript?.(id, name);
    setRenaming(null);
  };

  const normalizedQuery = query.trim().toLocaleLowerCase(lang);
  const searching = normalizedQuery.length > 0;
  const searchModules = searching
    ? MODULE_CATALOG.filter((entry) =>
        `${entry.searchText} ${entry.searchTextZh}`.includes(normalizedQuery),
      )
    : [];
  const searchClassics = searching
    ? classicEntries.filter(({ item, category }) =>
        `${item.label} ${item.key} ${category} ${item.tkey ? t(item.tkey, item.label) : ""} ${t(CAT_TKEY[category] || category, category)}`
          .toLocaleLowerCase(lang)
          .includes(normalizedQuery),
      )
    : [];
  const searchScripts = searching
    ? scripts.filter((script) => script.name.toLocaleLowerCase(lang).includes(normalizedQuery))
    : [];
  const resultCount = searchModules.length + searchClassics.length + searchScripts.length;

  const renderClassic = (item: ClassicIndicator, category: string) => {
    const on = active.has(item.key);
    const label = item.tkey ? t(item.tkey, item.label) : item.label;
    return (
      <button
        type="button"
        key={item.key}
        className={`li li-classic${on ? " on" : ""}`}
        role="checkbox"
        aria-checked={on}
        aria-label={`${on ? copy("Remove", "移除") : copy("Add", "添加")} ${label}`}
        onClick={() => onToggle(item.key)}
      >
        <span className={`im-classic-mark${item.mm ? " mastermind" : ""}`} aria-hidden="true">
          {item.mm ? "M" : label.slice(0, 1)}
        </span>
        <span className="li-main-copy">
          <span className="li-nm">{label}</span>
          <span className="li-sub">{t(CAT_TKEY[category] || category, category)}</span>
        </span>
        <span className="chk" aria-hidden="true"><CheckMark /></span>
      </button>
    );
  };

  const renderModule = (entry: SuiteModuleCatalogEntry) => {
    const on = !!activeModules?.has(entry.id);
    const locked = TIER_RANK[userTier] < TIER_RANK[entry.tier];
    const description = lang === "zh" ? entry.descriptionZh : entry.description;
    const surfaceLabel = {
      overlay: copy("Overlay", "叠加"),
      pane: copy("Pane", "副图"),
      dashboard: copy("Dashboard", "仪表盘"),
      candles: copy("Candles", "蜡烛图"),
    }[entry.surface];
    const suiteLabel = entry.suiteTkey ? t(entry.suiteTkey, entry.suiteLabel) : entry.suiteLabel;
    const addLabel = `${on ? copy("Remove", "移除") : copy("Add", "添加")} ${entry.label}`;
    const disabled = locked || !onToggleModule;

    return (
      <div key={entry.id} className={`imod-row${on ? " on" : ""}${locked ? " locked" : ""}`}>
        <button
          type="button"
          className="imod-main"
          role="checkbox"
          aria-checked={on}
          aria-describedby={`imod-desc-${entry.suiteKey}-${entry.moduleKey}`}
          aria-label={locked ? `${entry.label} — ${copy("upgrade required", "需要升级")}` : addLabel}
          disabled={disabled}
          onClick={() => onToggleModule?.(entry.id)}
        >
          <span className="imod-mark" aria-hidden="true">{entry.tag}</span>
          <span className="imod-copy">
            <span className="imod-titleline">
              <strong>{entry.label}</strong>
              <span className={`im-tier im-tier-${entry.tier}`}>{entry.tier}</span>
            </span>
            <span className="imod-crumb">
              {suiteLabel}<span aria-hidden="true"> / </span>{surfaceLabel}
            </span>
            <span className="imod-desc" id={`imod-desc-${entry.suiteKey}-${entry.moduleKey}`}>
              {description}
            </span>
          </span>
          <span className={`imod-check${locked ? " locked" : ""}`} aria-hidden="true">
            {locked ? <LockMark /> : <CheckMark />}
          </span>
        </button>
        <span className="imod-actions">
          {onOpenGuide && (
            <button
              type="button"
              className="imod-action"
              title={`${t("guideOpen", "Guide")}: ${entry.label}`}
              aria-label={`${t("guideOpen", "Guide")}: ${entry.label}`}
              onClick={() => onOpenGuide(entry.id)}
            >
              <GuideMark /><span>{t("guideOpen", "Guide")}</span>
            </button>
          )}
          {onOpenModuleSettings && (
            <button
              type="button"
              className="imod-action icon"
              title={`${t("settings", "Settings")}: ${entry.label}`}
              aria-label={`${t("settings", "Settings")}: ${entry.label}`}
              onClick={() => {
                closeModal();
                onOpenModuleSettings(entry.id);
              }}
            >
              <SettingsMark />
            </button>
          )}
        </span>
      </div>
    );
  };

  const renderModuleSection = (categoryId: string, entries: readonly SuiteModuleCatalogEntry[]) => {
    const category = MODULE_CATEGORIES.find((candidate) => candidate.id === categoryId);
    if (!category || entries.length === 0) return null;
    const label = category.tkey ? t(category.tkey, category.label) : category.label;
    return (
      <section className="im-section" key={category.id} aria-labelledby={`im-section-${category.id}`}>
        <div className="im-section-head">
          <span className="im-section-tag" aria-hidden="true">{category.tag}</span>
          <span>
            <strong id={`im-section-${category.id}`}>{label}</strong>
            <small>{lang === "zh" ? category.descriptionZh : category.description}</small>
          </span>
          <span className="im-section-count">{entries.length}</span>
        </div>
        <div className="im-row-stack">{entries.map(renderModule)}</div>
      </section>
    );
  };

  const renderScripts = (items: UserScript[]) => {
    if (items.length === 0) {
      return (
        <div className="li-empty">
          {t("noScriptsYet")}{" "}
          <Link href="/scripts" className="li-link" onClick={closeModal}>{t("openPineEditor")}</Link>
        </div>
      );
    }
    return items.map((script) => {
      const on = !!enabled?.has(script.id);
      return (
        <div key={script.id} className={`li li-script${on ? " on" : ""}`}>
          {renaming === script.id ? (
            <input
              className="li-rename"
              autoFocus
              value={draft}
              aria-label={t("rename")}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename(script.id);
                else if (event.key === "Escape") {
                  event.stopPropagation();
                  setRenaming(null);
                }
              }}
              onBlur={() => commitRename(script.id)}
            />
          ) : (
            <button
              type="button"
              className="li-script-main"
              aria-pressed={on}
              onClick={() => onToggleScript?.(script.id)}
            >
              <span className="im-classic-mark script" aria-hidden="true">ƒ</span>
              <span className="li-main-copy">
                <span className="li-nm">{script.name}</span>
                <span className="li-sub">
                  {t("myScripts")}{script.locked ? ` · ${t("readOnly")}` : ""}
                </span>
              </span>
            </button>
          )}
          <span className="li-acts">
            {!script.locked && (
              <button
                type="button"
                className="li-ic"
                title={t("rename")}
                aria-label={`${t("rename")}: ${script.name}`}
                onClick={() => {
                  setDraft(script.name);
                  setRenaming(script.id);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3M13.5 6.5l3 3" />
                </svg>
              </button>
            )}
            <Link
              className="li-ic"
              href={`/scripts?id=${encodeURIComponent(script.id)}`}
              title={t("editScript")}
              aria-label={`${t("editScript")}: ${script.name}`}
              onClick={closeModal}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" />
              </svg>
            </Link>
            {!script.locked && (
              <button
                type="button"
                className="li-ic del"
                title={t("delete")}
                aria-label={`${t("delete")}: ${script.name}`}
                onClick={() => {
                  if (window.confirm(t("deleteScriptConfirm"))) onDeleteScript?.(script.id);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="chk"
              aria-pressed={on}
              aria-label={`${on ? copy("Remove", "移除") : copy("Add", "添加")} ${script.name}`}
              onClick={() => onToggleScript?.(script.id)}
            >
              <CheckMark />
            </button>
          </span>
        </div>
      );
    });
  };

  const navButton = (id: string, label: string, count?: number, mastermind = false) => (
    <button
      type="button"
      key={id}
      className={`im-nav-item${cat === id && !searching ? " on" : ""}${mastermind ? " mm" : ""}`}
      aria-pressed={cat === id && !searching}
      onClick={() => pickCategory(id)}
    >
      <span>{label}</span>
      {typeof count === "number" && <span className="im-count">{count}</span>}
    </button>
  );

  const renderSearchResults = () => (
    <>
      <div className="im-list-title">
        <span>
          <strong>{copy("Search results", "搜索结果")}</strong>
          <small>{copy("Across built-ins, Pro modules, and your scripts", "搜索内置指标、专业模块与个人脚本")}</small>
        </span>
        <span className="im-result-count" aria-live="polite">{resultCount}</span>
      </div>
      {resultCount === 0 ? (
        <div className="im-empty">
          <strong>{copy("No indicators found", "未找到指标")}</strong>
          <span>{copy("Try a module name, abbreviation, or purpose such as FVG, divergence, or TP.", "请尝试模块名称、缩写或用途，例如 FVG、背离或止盈。")}</span>
        </div>
      ) : (
        <>
          {searchModules.length > 0 && (
            <section className="im-section">
              <div className="im-search-group">
                <strong>{copy("Pro modules", "专业模块")}</strong>
                <span>{searchModules.length}</span>
              </div>
              <div className="im-row-stack">{searchModules.map(renderModule)}</div>
            </section>
          )}
          {searchClassics.length > 0 && (
            <section className="im-section">
              <div className="im-search-group">
                <strong>{copy("Built-in indicators", "内置指标")}</strong>
                <span>{searchClassics.length}</span>
              </div>
              <div className="im-row-stack">
                {searchClassics.map(({ item, category }) => renderClassic(item, category))}
              </div>
            </section>
          )}
          {searchScripts.length > 0 && (
            <section className="im-section">
              <div className="im-search-group">
                <strong>{t("myScripts")}</strong>
                <span>{searchScripts.length}</span>
              </div>
              <div className="im-row-stack">{renderScripts(searchScripts)}</div>
            </section>
          )}
        </>
      )}
    </>
  );

  const renderPresets = () => (
    <>
      <div className="im-list-title">
        <span>
          <strong>{copy("Systems & Presets", "系统与预设")}</strong>
          <small>{copy("Optional recommended setups — modules remain individually controllable.", "可选推荐组合——每个模块仍可独立控制。")}</small>
        </span>
      </div>
      <div className="ipreset-note">
        <strong>{copy("Start quickly, then customize", "快速开始，再按需定制")}</strong>
        <span>{copy("Adding a preset enables its recommended module mix. It does not hide the modules inside Settings.", "添加预设会启用推荐模块组合，模块仍会在指标库中单独显示。")}</span>
      </div>
      <div className="ipreset-stack">
        {SUITE_ORDER.map((key) => {
          const def = SUITE_DEFS[key];
          if (!def) return null;
          const added = active.has(key);
          const locked = TIER_RANK[userTier] < TIER_RANK[suiteMinTier(key)];
          const top = suiteTopTier(key);
          const label = def.tkey ? t(def.tkey, def.label) : def.label;
          const category = MODULE_CATEGORIES.find((candidate) => candidate.suiteKey === key);
          const action = added
            ? copy("Reapply recommended", "重新应用推荐组合")
            : copy("Add recommended", "添加推荐组合");
          return (
            <div key={key} className={`ipreset-row${added ? " on" : ""}${locked ? " locked" : ""}`}>
              <span className="ipreset-mark" aria-hidden="true">{def.tag}</span>
              <span className="ipreset-copy">
                <span className="ipreset-title">
                  <strong>{label}</strong>
                  <span className={`im-tier im-tier-${top}`}>{top}</span>
                </span>
                <span>{lang === "zh" ? category?.descriptionZh : category?.description}</span>
                <small>{def.modules.length} {t("suiteModulesWord", "modules")}</small>
              </span>
              <button
                type="button"
                className="ipreset-add"
                disabled={locked}
                aria-label={locked ? `${label} — ${copy("upgrade required", "需要升级")}` : `${action}: ${label}`}
                onClick={() => (onApplyPreset ?? onToggle)(key)}
              >
                {locked && <LockMark />}
                {locked ? copy("Upgrade required", "需要升级") : action}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );

  const renderCategory = () => {
    if (searching) return renderSearchResults();
    if (cat === SYSTEM_PRESETS) return renderPresets();
    if (cat === MY_SCRIPTS) {
      return (
        <>
          <div className="im-list-title">
            <span>
              <strong>{t("myScripts")}</strong>
              <small>{copy("Indicators created in the Pine editor", "在 Pine 编辑器中创建的指标")}</small>
            </span>
          </div>
          <div className="im-row-stack">{renderScripts(scripts)}</div>
        </>
      );
    }
    if (cat === ALL_INDICATORS) {
      return (
        <>
          <div className="im-list-title">
            <span>
              <strong>{copy("All indicators", "全部指标")}</strong>
              <small>{copy("Every module is visible and independently addable.", "每个模块均可见并可独立添加。")}</small>
            </span>
            <span className="im-result-count">{classicEntries.length + MODULE_CATALOG.length}</span>
          </div>
          <section className="im-section">
            <div className="im-search-group">
              <strong>{copy("Built-in indicators", "内置指标")}</strong>
              <span>{classicEntries.length}</span>
            </div>
            <div className="im-row-stack">
              {classicEntries.map(({ item, category }) => renderClassic(item, category))}
            </div>
          </section>
          {MODULE_CATEGORIES.map((category) =>
            renderModuleSection(
              category.id,
              MODULE_CATALOG.filter((entry) => entry.category === category.id),
            ),
          )}
        </>
      );
    }
    const moduleCategory = MODULE_CATEGORIES.find((candidate) => candidate.id === cat);
    if (moduleCategory) {
      return renderModuleSection(
        moduleCategory.id,
        MODULE_CATALOG.filter((entry) => entry.category === moduleCategory.id),
      );
    }
    const classic = CATS[cat] ?? [];
    return (
      <>
        <div className="im-list-title">
          <span>
            <strong>{t(CAT_TKEY[cat] || cat, cat)}</strong>
            <small>{copy("Built-in chart indicators", "内置图表指标")}</small>
          </span>
          <span className="im-result-count">{classic.length}</span>
        </div>
        <div className="im-row-stack">{classic.map((item) => renderClassic(item, cat))}</div>
      </>
    );
  };

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <div
        className="imodal imodal-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="indicators-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="im-head">
          <div>
            <b id="indicators-modal-title">{t("indicatorsTitle")}</b>
            <span>{copy("Find, add, and configure chart tools", "查找、添加并配置图表工具")}</span>
          </div>
          <button type="button" className="im-close" aria-label={t("guideClose", "Close")} onClick={closeModal}>
            <CloseMark />
          </button>
        </div>
        <label className="im-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <span className="sr-only">{copy("Search indicators", "搜索指标")}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={copy("Search indicators, modules, or aliases…", "搜索指标、模块或别名…")}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="im-search-clear"
              aria-label={copy("Clear search", "清除搜索")}
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <CloseMark />
            </button>
          )}
        </label>
        <div className="ib">
          <nav className="inav" aria-label={t("library")}>
            <div className="im-nav-group">
              <div className="grp">{t("library")}</div>
              {navButton(ALL_INDICATORS, copy("All indicators", "全部指标"), classicEntries.length + MODULE_CATALOG.length)}
              {Object.keys(CATS).map((category) =>
                navButton(
                  category,
                  t(CAT_TKEY[category] || category, category),
                  CATS[category].length,
                  category === "Mastermind",
                ),
              )}
            </div>
            <div className="im-nav-group">
              <div className="grp">{copy("Pro modules", "专业模块")}</div>
              {MODULE_CATEGORIES.map((category) =>
                navButton(
                  category.id,
                  category.tkey ? t(category.tkey, category.label) : category.label,
                  moduleCountByCategory[category.id] ?? 0,
                ),
              )}
            </div>
            <div className="im-nav-group">
              <div className="grp">{copy("Tools", "工具")}</div>
              {navButton(SYSTEM_PRESETS, copy("Systems & Presets", "系统与预设"), SUITE_ORDER.length)}
              {navButton(MY_SCRIPTS, t("myScripts"), scripts.length)}
            </div>
          </nav>
          <main className="ilist" aria-live={searching ? "polite" : undefined}>
            {renderCategory()}
          </main>
        </div>
      </div>
    </div>
  );
}
