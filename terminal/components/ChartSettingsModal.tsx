"use client";
import { useEffect, useRef, useState } from "react";
import { PriceScaleMode, type IChartApi } from "lightweight-charts";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "@/components/ChartFrameBar";
import { useT } from "@/lib/i18n";

export type ChartSettingsTab = "symbol" | "status" | "scales" | "canvas" | "alerts" | "events";
type Patch = (patch: Partial<ChartSettings>) => void;

const TEMPLATE_KEY = "mm.chartSettingTemplates";

function cssToken(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function tabIcon(tab: ChartSettingsTab) {
  const paths: Record<ChartSettingsTab, React.ReactNode> = {
    symbol: <><path d="M7 2v4M7 10v4M5 6h4v4H5zM13 2v2M13 8v6M11 4h4v4h-4z" /></>,
    status: <><path d="M3 4h14M3 7h10M3 10h12M3 13h7" /></>,
    scales: <><path d="M4 3v12h12M2 5l2-2 2 2M14 13l2 2 2-2" /></>,
    canvas: <><path d="M4 13l8-8 3 3-8 8H4zM11 6l3 3" /></>,
    alerts: <><circle cx="10" cy="10" r="7" /><path d="M10 6v5M10 14h.01M6 2l-2 2M14 2l2 2" /></>,
    events: <><rect x="3" y="4" width="14" height="13" rx="1.5" /><path d="M3 8h14M7 2v4M13 2v4" /></>,
  };
  return <svg className="sm-tab-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.35">{paths[tab]}</svg>;
}

export default function ChartSettingsModal({
  open,
  tab,
  settings,
  onSettings,
  onClose,
  chartApi,
  extendedEligible = false,
  intraday = false,
}: {
  open: boolean;
  tab: ChartSettingsTab;
  settings: ChartSettings;
  onSettings: Patch;
  onClose: () => void;
  chartApi?: IChartApi | null;
  extendedEligible?: boolean;
  intraday?: boolean;
}) {
  const t = useT();
  const backdropRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef<ChartSettings>(settings);
  const wasOpenRef = useRef(false);
  const [templateNonce, setTemplateNonce] = useState(0);

  useEffect(() => {
    if (open && !wasOpenRef.current) initialRef.current = { ...settings };
    wasOpenRef.current = open;
  }, [open, settings]);

  function cancel() {
    onSettings({ ...initialRef.current });
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // Capture the settings snapshot only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const tabs: { key: ChartSettingsTab; label: string }[] = [
    { key: "symbol", label: t("smTabSymbol") },
    { key: "status", label: t("smTabStatus") },
    { key: "scales", label: t("smTabScales") },
    { key: "canvas", label: t("smTabCanvas") },
    { key: "alerts", label: "Alerts" },
    { key: "events", label: "Events" },
  ];

  const templates = readTemplates();
  void templateNonce;

  function selectTemplate(value: string) {
    if (value === "__save") {
      const name = window.prompt("Template name");
      if (!name?.trim()) return;
      const next = { ...templates, [name.trim()]: settings };
      try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next)); } catch {}
      setTemplateNonce((n) => n + 1);
      return;
    }
    if (value === "__default") onSettings({ ...DEFAULT_CHART_SETTINGS });
    else if (templates[value]) onSettings({ ...DEFAULT_CHART_SETTINGS, ...templates[value] });
  }

  function resetTab() {
    const d = DEFAULT_CHART_SETTINGS;
    const keys: Record<ChartSettingsTab, (keyof ChartSettings)[]> = {
      symbol: ["colorBarsPrevClose", "candleBodyVisible", "candleBordersVisible", "candleWicksVisible", "candleUpColor", "candleDownColor", "candleUpBorder", "candleDownBorder", "candleUpWick", "candleDownWick", "extHours", "adjustForDividends", "precision", "timezone"],
      status: ["showLogo", "showSymbolName", "titleMode", "showOHLC", "showBarChange", "showVolume", "showLastDayChange", "showIndicatorTitles", "showIndicatorInputs", "showIndicatorValues", "indicatorBackgroundOpacity"],
      scales: ["mode", "invertScale", "scaleLeft", "autoScale", "lastValueVisible", "priceLineVisible", "noOverlappingLabels", "plusButtonVisible", "countdownVisible", "extendedLineVisible", "preMarketColor", "postMarketColor", "overnightColor", "dayOfWeekLabels", "dateFormat", "hourFormat", "preserveLeftEdge"],
      canvas: ["showWatermark", "backgroundType", "backgroundTop", "backgroundBottom", "gridHVisible", "gridVVisible", "gridHColor", "gridVColor", "paneSeparatorColor", "crosshairColor", "watermarkColor", "scaleTextColor", "scaleFontSize", "scaleLineColor", "navigationButtons", "paneButtons", "scaleMarginsTop", "scaleMarginsBottom", "rightOffsetBars"],
      alerts: ["alertLinesVisible", "onlyActiveAlerts", "autoHideToasts"],
      events: ["showDividends", "showSplits", "showEarnings", "showEarningsBreaks", "showLatestNews"],
    };
    onSettings(Object.fromEntries(keys[tab].map((key) => [key, d[key]])) as Partial<ChartSettings>);
  }

  return (
    <div className="sm-backdrop" ref={backdropRef} onMouseDown={(e) => { if (e.target === backdropRef.current) cancel(); }}>
      <div className="sm-modal" role="dialog" aria-modal="true" aria-label={t("smTitle")}>
        <div className="sm-header">
          <span className="sm-title">{t("smTitle")}</span>
          <button className="sm-close" onClick={cancel} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="sm-body">
          <nav className="sm-tabs" aria-label="Chart settings sections">
            {tabs.map(({ key, label }) => (
              <button key={key} className={`sm-tab${tab === key ? " on" : ""}`}
                onClick={() => window.dispatchEvent(new CustomEvent("mm:settings-tab", { detail: key }))}>
                {tabIcon(key)}<span>{label}</span>
              </button>
            ))}
          </nav>

          <main className="sm-content">
            {tab === "symbol" && <SymbolTab s={settings} onSettings={onSettings} extendedEligible={extendedEligible} intraday={intraday} />}
            {tab === "status" && <StatusTab s={settings} onSettings={onSettings} />}
            {tab === "scales" && <ScalesTab s={settings} onSettings={onSettings} chartApi={chartApi} />}
            {tab === "canvas" && <CanvasTab s={settings} onSettings={onSettings} />}
            {tab === "alerts" && <AlertsTab s={settings} onSettings={onSettings} />}
            {tab === "events" && <EventsTab s={settings} onSettings={onSettings} />}
          </main>
        </div>

        <footer className="sm-footer">
          <div className="sm-template-wrap">
            <select className="sm-select sm-template" value="" onChange={(e) => { selectTemplate(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">Template</option>
              <option value="__default">Restore defaults</option>
              {Object.keys(templates).sort().map((name) => <option key={name} value={name}>{name}</option>)}
              <option value="__save">Save current…</option>
            </select>
            <button className="sm-reset" onClick={resetTab}>Reset tab</button>
          </div>
          <div className="sm-footer-actions">
            <button className="sm-cancel" onClick={cancel}>Cancel</button>
            <button className="sm-ok" onClick={onClose}>OK</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function readTemplates(): Record<string, ChartSettings> {
  try {
    const value = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch { return {}; }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="sm-section"><h3>{title}</h3>{children}</section>;
}

function CheckRow({ label, value, onChange, disabled = false, children }: {
  label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`sm-row${disabled ? " disabled" : ""}`}>
      <label className="sm-check-label">
        <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {children && <div className="sm-row-control">{children}</div>}
    </div>
  );
}

function SelectRow({ label, value, onChange, options, disabled = false }: {
  label: string; value: string | number; onChange: (value: string) => void;
  options: { value: string | number; label: string }[]; disabled?: boolean;
}) {
  return (
    <div className={`sm-row${disabled ? " disabled" : ""}`}>
      <span className="sm-row-label">{label}</span>
      <select className="sm-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ColorControl({ value, fallback, onChange, title }: {
  value: string; fallback: string; onChange: (value: string) => void; title?: string;
}) {
  const shown = value || fallback;
  return (
    <label className="sm-color-wrap" title={title}>
      <span className="sm-color-swatch" style={{ background: shown }} />
      <input type="color" value={shown} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ColorPair({ first, second, onFirst, onSecond }: {
  first: string; second: string; onFirst: (v: string) => void; onSecond: (v: string) => void;
}) {
  return <div className="sm-color-pair">
    <ColorControl value={first} fallback={cssToken("--up", "#26c281")} onChange={onFirst} title="Up color" />
    <ColorControl value={second} fallback={cssToken("--down", "#f23645")} onChange={onSecond} title="Down color" />
  </div>;
}

function NumberRow({ label, value, min, max, suffix, onChange }: {
  label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void;
}) {
  return <div className="sm-row"><span className="sm-row-label">{label}</span><div className="sm-number-wrap">
    <input className="sm-number" type="number" value={value} min={min} max={max} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} />
    {suffix && <span>{suffix}</span>}
  </div></div>;
}

function SymbolTab({ s, onSettings, extendedEligible, intraday }: {
  s: ChartSettings;
  onSettings: Patch;
  extendedEligible: boolean;
  intraday: boolean;
}) {
  return <div className="sm-section-list">
    <Section title="Candles">
      <CheckRow label="Color bars based on previous close" value={s.colorBarsPrevClose} onChange={(v) => onSettings({ colorBarsPrevClose: v })} />
      <CheckRow label="Body" value={s.candleBodyVisible} onChange={(v) => onSettings({ candleBodyVisible: v })}>
        <ColorPair first={s.candleUpColor} second={s.candleDownColor} onFirst={(v) => onSettings({ candleUpColor: v })} onSecond={(v) => onSettings({ candleDownColor: v })} />
      </CheckRow>
      <CheckRow label="Borders" value={s.candleBordersVisible} onChange={(v) => onSettings({ candleBordersVisible: v })}>
        <ColorPair first={s.candleUpBorder} second={s.candleDownBorder} onFirst={(v) => onSettings({ candleUpBorder: v })} onSecond={(v) => onSettings({ candleDownBorder: v })} />
      </CheckRow>
      <CheckRow label="Wick" value={s.candleWicksVisible} onChange={(v) => onSettings({ candleWicksVisible: v })}>
        <ColorPair first={s.candleUpWick} second={s.candleDownWick} onFirst={(v) => onSettings({ candleUpWick: v })} onSecond={(v) => onSettings({ candleDownWick: v })} />
      </CheckRow>
    </Section>
    <Section title="Data modification">
      <SelectRow label="Session" value={extendedEligible && s.extHours ? "extended" : "regular"} disabled={!extendedEligible}
        onChange={(v) => onSettings({ extHours: extendedEligible && v === "extended" })}
        options={[{ value: "regular", label: "Regular" }, { value: "extended", label: "Extended" }]} />
      {!extendedEligible && <p className="sm-help">Extended sessions are available only for U.S. equities. China, Hong Kong, Canada, and crypto keep their native sessions.</p>}
      {extendedEligible && !intraday && <p className="sm-help">This session preference applies on 12-hour and lower intervals. Daily and higher charts keep regular candles and show the live extended-session price as a separate line.</p>}
      <CheckRow label="Adjust data for dividends" value={s.adjustForDividends} onChange={(v) => onSettings({ adjustForDividends: v })} />
      <p className="sm-help">Current history files are dividend-adjusted. This preference is persisted for an unadjusted provider series when one is connected.</p>
      <SelectRow label="Precision" value={s.precision} onChange={(v) => onSettings({ precision: v as ChartSettings["precision"] })}
        options={[{ value: "auto", label: "Default" }, { value: "2", label: "0.01" }, { value: "3", label: "0.001" }, { value: "4", label: "0.0001" }]} />
      <SelectRow label="Timezone" value={s.timezone} onChange={(v) => onSettings({ timezone: v as ChartSettings["timezone"] })}
        options={[{ value: "exchange", label: "Exchange" }, { value: "local", label: "Local" }, { value: "utc", label: "UTC" }]} />
    </Section>
  </div>;
}

function StatusTab({ s, onSettings }: { s: ChartSettings; onSettings: Patch }) {
  return <div className="sm-section-list">
    <Section title="Instrument">
      <CheckRow label="Logo" value={s.showLogo} onChange={(v) => onSettings({ showLogo: v })} />
      <CheckRow label="Title" value={s.showSymbolName} onChange={(v) => onSettings({ showSymbolName: v })}>
        <select className="sm-select" value={s.titleMode} onChange={(e) => onSettings({ titleMode: e.target.value as ChartSettings["titleMode"] })}>
          <option value="ticker">Ticker</option><option value="name">Name</option><option value="both">Name and ticker</option>
        </select>
      </CheckRow>
      <CheckRow label="Chart values" value={s.showOHLC} onChange={(v) => onSettings({ showOHLC: v })} />
      <CheckRow label="Bar change values" value={s.showBarChange} onChange={(v) => onSettings({ showBarChange: v })} />
      <CheckRow label="Volume" value={s.showVolume} onChange={(v) => onSettings({ showVolume: v })} />
      <CheckRow label="Last day change values" value={s.showLastDayChange} onChange={(v) => onSettings({ showLastDayChange: v })} />
    </Section>
    <Section title="Indicators">
      <CheckRow label="Titles" value={s.showIndicatorTitles} onChange={(v) => onSettings({ showIndicatorTitles: v })} />
      <CheckRow label="Inputs" value={s.showIndicatorInputs} onChange={(v) => onSettings({ showIndicatorInputs: v })} />
      <CheckRow label="Values" value={s.showIndicatorValues} onChange={(v) => onSettings({ showIndicatorValues: v })} />
      <CheckRow label="Background" value={s.indicatorBackgroundOpacity > 0} onChange={(v) => onSettings({ indicatorBackgroundOpacity: v ? 70 : 0 })}>
        <input className="sm-range" type="range" min="0" max="100" value={s.indicatorBackgroundOpacity} onChange={(e) => onSettings({ indicatorBackgroundOpacity: Number(e.target.value) })} />
      </CheckRow>
    </Section>
  </div>;
}

function ScalesTab({ s, onSettings, chartApi }: { s: ChartSettings; onSettings: Patch; chartApi?: IChartApi | null }) {
  function applyAuto(v: boolean) {
    onSettings({ autoScale: v });
    try { chartApi?.priceScale(s.scaleLeft ? "left" : "right").setAutoScale(v); } catch {}
  }
  return <div className="sm-section-list">
    <Section title="Price scale">
      <SelectRow label="Scale mode" value={s.mode} onChange={(v) => onSettings({ mode: Number(v) as PriceScaleMode })}
        options={[{ value: PriceScaleMode.Normal, label: "Regular" }, { value: PriceScaleMode.Percentage, label: "Percentage" }, { value: PriceScaleMode.IndexedTo100, label: "Indexed to 100" }, { value: PriceScaleMode.Logarithmic, label: "Logarithmic" }]} />
      <SelectRow label="Scales placement" value={s.scaleLeft ? "left" : "right"} onChange={(v) => onSettings({ scaleLeft: v === "left" })}
        options={[{ value: "right", label: "Right" }, { value: "left", label: "Left" }]} />
      <CheckRow label="Auto scale" value={s.autoScale} onChange={applyAuto} />
      <CheckRow label="Invert scale" value={s.invertScale} onChange={(v) => onSettings({ invertScale: v })} />
    </Section>
    <Section title="Price labels & lines">
      <CheckRow label="No overlapping labels" value={s.noOverlappingLabels} onChange={(v) => onSettings({ noOverlappingLabels: v })} />
      <CheckRow label="Plus button" value={s.plusButtonVisible} onChange={(v) => onSettings({ plusButtonVisible: v })} />
      <CheckRow label="Countdown to bar close" value={s.countdownVisible} onChange={(v) => onSettings({ countdownVisible: v })} />
      <CheckRow label="Symbol value and line" value={s.lastValueVisible && s.priceLineVisible}
        onChange={(v) => onSettings({ lastValueVisible: v, priceLineVisible: v })} />
      <CheckRow label="Pre/post/overnight market" value={s.extendedLineVisible} onChange={(v) => onSettings({ extendedLineVisible: v })}>
        <div className="sm-color-pair three">
          <ColorControl value={s.preMarketColor} fallback="#ff9800" onChange={(v) => onSettings({ preMarketColor: v })} title="Pre-market" />
          <ColorControl value={s.postMarketColor} fallback="#2962ff" onChange={(v) => onSettings({ postMarketColor: v })} title="After-hours" />
          <ColorControl value={s.overnightColor} fallback="#9c27b0" onChange={(v) => onSettings({ overnightColor: v })} title="Overnight" />
        </div>
      </CheckRow>
    </Section>
    <Section title="Time scale">
      <CheckRow label="Day of week on labels" value={s.dayOfWeekLabels} onChange={(v) => onSettings({ dayOfWeekLabels: v })} />
      <SelectRow label="Date format" value={s.dateFormat} onChange={(v) => onSettings({ dateFormat: v as ChartSettings["dateFormat"] })}
        options={[{ value: "locale", label: "System locale" }, { value: "yyyy-mm-dd", label: "2026-07-30" }, { value: "dd-mm-yyyy", label: "30-07-2026" }, { value: "mm-dd-yyyy", label: "07-30-2026" }]} />
      <SelectRow label="Time hours format" value={s.hourFormat} onChange={(v) => onSettings({ hourFormat: v as "12" | "24" })}
        options={[{ value: "24", label: "24-hours" }, { value: "12", label: "12-hours" }]} />
      <CheckRow label="Save chart left edge when changing interval" value={s.preserveLeftEdge} onChange={(v) => onSettings({ preserveLeftEdge: v })} />
    </Section>
  </div>;
}

function CanvasTab({ s, onSettings }: { s: ChartSettings; onSettings: Patch }) {
  return <div className="sm-section-list">
    <Section title="Chart basic styles">
      <SelectRow label="Background" value={s.backgroundType} onChange={(v) => onSettings({ backgroundType: v as "solid" | "gradient" })}
        options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]} />
      <div className="sm-row"><span className="sm-row-label">Background colors</span><div className="sm-color-pair">
        <ColorControl value={s.backgroundTop} fallback={cssToken("--chart-bg", "#101521")} onChange={(v) => onSettings({ backgroundTop: v })} />
        <ColorControl value={s.backgroundBottom} fallback={cssToken("--chart-bg", "#101521")} onChange={(v) => onSettings({ backgroundBottom: v })} />
      </div></div>
      <CheckRow label="Vertical grid lines" value={s.gridVVisible} onChange={(v) => onSettings({ gridVVisible: v })}>
        <ColorControl value={s.gridVColor} fallback={cssToken("--grid", "#202838")} onChange={(v) => onSettings({ gridVColor: v })} />
      </CheckRow>
      <CheckRow label="Horizontal grid lines" value={s.gridHVisible} onChange={(v) => onSettings({ gridHVisible: v })}>
        <ColorControl value={s.gridHColor} fallback={cssToken("--grid", "#202838")} onChange={(v) => onSettings({ gridHColor: v })} />
      </CheckRow>
      <div className="sm-row"><span className="sm-row-label">Pane separators</span><ColorControl value={s.paneSeparatorColor} fallback={cssToken("--line", "#2a3242")} onChange={(v) => onSettings({ paneSeparatorColor: v })} /></div>
      <div className="sm-row"><span className="sm-row-label">Crosshair</span><ColorControl value={s.crosshairColor} fallback="#9598a1" onChange={(v) => onSettings({ crosshairColor: v })} /></div>
      <CheckRow label="Watermark" value={s.showWatermark} onChange={(v) => onSettings({ showWatermark: v })}>
        <ColorControl value={s.watermarkColor} fallback="rgba(120,130,150,.14)" onChange={(v) => onSettings({ watermarkColor: v })} />
      </CheckRow>
    </Section>
    <Section title="Scales">
      <div className="sm-row"><span className="sm-row-label">Text</span><div className="sm-inline">
        <ColorControl value={s.scaleTextColor} fallback={cssToken("--muted", "#8b93a6")} onChange={(v) => onSettings({ scaleTextColor: v })} />
        <select className="sm-select small" value={s.scaleFontSize} onChange={(e) => onSettings({ scaleFontSize: Number(e.target.value) })}>{[10, 11, 12, 13, 14, 16].map((n) => <option key={n}>{n}</option>)}</select>
      </div></div>
      <div className="sm-row"><span className="sm-row-label">Lines</span><ColorControl value={s.scaleLineColor} fallback={cssToken("--line", "#2a3242")} onChange={(v) => onSettings({ scaleLineColor: v })} /></div>
    </Section>
    <Section title="Buttons">
      <SelectRow label="Navigation" value={s.navigationButtons} onChange={(v) => onSettings({ navigationButtons: v as ChartSettings["navigationButtons"] })} options={visibilityOptions} />
      <SelectRow label="Pane" value={s.paneButtons} onChange={(v) => onSettings({ paneButtons: v as ChartSettings["paneButtons"] })} options={visibilityOptions} />
    </Section>
    <Section title="Margins">
      <NumberRow label="Top" value={s.scaleMarginsTop} min={0} max={50} suffix="%" onChange={(v) => onSettings({ scaleMarginsTop: v })} />
      <NumberRow label="Bottom" value={s.scaleMarginsBottom} min={0} max={50} suffix="%" onChange={(v) => onSettings({ scaleMarginsBottom: v })} />
      <NumberRow label="Right" value={s.rightOffsetBars} min={0} max={100} suffix="bars" onChange={(v) => onSettings({ rightOffsetBars: v })} />
    </Section>
  </div>;
}

const visibilityOptions = [
  { value: "always", label: "Always visible" },
  { value: "hover", label: "Visible on mouse over" },
  { value: "never", label: "Hidden" },
];

function AlertsTab({ s, onSettings }: { s: ChartSettings; onSettings: Patch }) {
  return <div className="sm-section-list">
    <Section title="Chart line visibility">
      <CheckRow label="Alert lines" value={s.alertLinesVisible} onChange={(v) => onSettings({ alertLinesVisible: v })} />
      <CheckRow label="Only active alerts" value={s.onlyActiveAlerts} onChange={(v) => onSettings({ onlyActiveAlerts: v })} />
    </Section>
    <Section title="Notifications">
      <CheckRow label="Automatically hide toasts" value={s.autoHideToasts} onChange={(v) => onSettings({ autoHideToasts: v })} />
    </Section>
  </div>;
}

function EventsTab({ s, onSettings }: { s: ChartSettings; onSettings: Patch }) {
  return <div className="sm-section-list">
    <Section title="Events">
      <CheckRow label="Dividends" value={s.showDividends} onChange={(v) => onSettings({ showDividends: v })} />
      <CheckRow label="Splits" value={s.showSplits} onChange={(v) => onSettings({ showSplits: v })} />
      <CheckRow label="Earnings" value={s.showEarnings} onChange={(v) => onSettings({ showEarnings: v })} />
      <CheckRow label="Earnings breaks" value={s.showEarningsBreaks} onChange={(v) => onSettings({ showEarningsBreaks: v })} />
      <CheckRow label="Latest news" value={s.showLatestNews} onChange={(v) => onSettings({ showLatestNews: v })} />
      <p className="sm-help">Earnings, dividends, and splits use the symbol’s fundamentals feed and are rendered on actual trading bars. News markers are enabled in preferences and will appear when a dated news feed is connected.</p>
    </Section>
  </div>;
}
