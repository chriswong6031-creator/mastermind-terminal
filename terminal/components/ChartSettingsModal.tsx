"use client";
import { useEffect, useRef } from "react";
import { PriceScaleMode } from "lightweight-charts";
import { type IChartApi } from "lightweight-charts";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "@/components/ChartFrameBar";
import { useT } from "@/lib/i18n";

type Tab = "symbol" | "status" | "scales" | "canvas" | "trading";

export default function ChartSettingsModal({
  open,
  tab,
  settings,
  onSettings,
  onClose,
  chartApi,
}: {
  open: boolean;
  tab: Tab;
  settings: ChartSettings;
  onSettings: (patch: Partial<ChartSettings>) => void;
  onClose: () => void;
  chartApi?: IChartApi | null;
}) {
  const t = useT();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const s = settings;
  const TABS: { key: Tab; label: string }[] = [
    { key: "symbol", label: t("smTabSymbol") },
    { key: "status", label: t("smTabStatus") },
    { key: "scales", label: t("smTabScales") },
    { key: "canvas", label: t("smTabCanvas") },
    { key: "trading", label: t("smTabTrading") },
  ];

  // Reset the current tab's settings to defaults
  function resetTab() {
    const d = DEFAULT_CHART_SETTINGS;
    if (tab === "symbol") {
      onSettings({
        candleUpColor: d.candleUpColor, candleDownColor: d.candleDownColor,
        candleUpBorder: d.candleUpBorder, candleDownBorder: d.candleDownBorder,
        candleUpWick: d.candleUpWick, candleDownWick: d.candleDownWick,
        lastValueVisible: d.lastValueVisible, priceLineVisible: d.priceLineVisible,
      });
    } else if (tab === "status") {
      onSettings({ showOHLC: d.showOHLC, showBarChange: d.showBarChange, showSymbolName: d.showSymbolName });
    } else if (tab === "scales") {
      onSettings({
        mode: d.mode, invertScale: d.invertScale, scaleLeft: d.scaleLeft,
        autoScale: d.autoScale, lastValueVisible: d.lastValueVisible, priceLineVisible: d.priceLineVisible,
        gridHVisible: d.gridHVisible, gridVVisible: d.gridVVisible,
      });
    } else if (tab === "canvas") {
      onSettings({ showWatermark: d.showWatermark });
    }
  }

  return (
    <div
      className="sm-backdrop"
      ref={backdropRef}
      onMouseDown={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="sm-modal" role="dialog" aria-modal="true" aria-label={t("smTitle")}>
        {/* Header */}
        <div className="sm-header">
          <span className="sm-title">{t("smTitle")}</span>
          <button className="sm-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="sm-body">
          {/* Left tab rail */}
          <div className="sm-tabs">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`sm-tab${tab === key ? " on" : ""}`}
                onClick={() => {
                  // Dispatch a custom event that ChartPane picks up to switch the tab
                  window.dispatchEvent(new CustomEvent("mm:settings-tab", { detail: key }));
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div className="sm-content">
            {tab === "symbol" && <SymbolTab s={s} onSettings={onSettings} t={t} />}
            {tab === "status" && <StatusTab s={s} onSettings={onSettings} t={t} />}
            {tab === "scales" && <ScalesTab s={s} onSettings={onSettings} chartApi={chartApi} t={t} />}
            {tab === "canvas" && <CanvasTab s={s} onSettings={onSettings} t={t} />}
            {tab === "trading" && (
              <div className="sm-coming">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 8v4M12 16h.01" />
                </svg>
                <span>{t("smComingSoon")}</span>
              </div>
            )}

            {/* Footer */}
            {tab !== "trading" && (
              <div className="sm-footer">
                <button className="sm-reset" onClick={resetTab}>{t("smResetTab")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Color swatch row ─────────────────────────────────────────────────────────
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="sm-row">
      <span className="sm-row-label">{label}</span>
      <label className="sm-color-wrap">
        <span className="sm-color-swatch" style={{ background: value }} />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

// ── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="sm-row">
      <span className="sm-row-label">{label}</span>
      <span className={`switch${value ? " on" : ""}`} onClick={() => onChange(!value)} />
    </div>
  );
}

// ── SYMBOL TAB ───────────────────────────────────────────────────────────────
function SymbolTab({ s, onSettings, t }: { s: ChartSettings; onSettings: (p: Partial<ChartSettings>) => void; t: (k: string) => string }) {
  return (
    <div className="sm-section-list">
      <div className="sm-section-hd">{t("smCandleColors")}</div>
      <ColorRow label={t("smBodyUp")} value={s.candleUpColor} onChange={(v) => onSettings({ candleUpColor: v })} />
      <ColorRow label={t("smBodyDown")} value={s.candleDownColor} onChange={(v) => onSettings({ candleDownColor: v })} />
      <ColorRow label={t("smBorderUp")} value={s.candleUpBorder} onChange={(v) => onSettings({ candleUpBorder: v })} />
      <ColorRow label={t("smBorderDown")} value={s.candleDownBorder} onChange={(v) => onSettings({ candleDownBorder: v })} />
      <ColorRow label={t("smWickUp")} value={s.candleUpWick} onChange={(v) => onSettings({ candleUpWick: v })} />
      <ColorRow label={t("smWickDown")} value={s.candleDownWick} onChange={(v) => onSettings({ candleDownWick: v })} />
      <div className="sm-sep" />
      <ToggleRow label={t("smLastValueLabel")} value={s.lastValueVisible} onChange={(v) => onSettings({ lastValueVisible: v })} />
      <ToggleRow label={t("smPriceLine")} value={s.priceLineVisible} onChange={(v) => onSettings({ priceLineVisible: v })} />
    </div>
  );
}

// ── STATUS LINE TAB ──────────────────────────────────────────────────────────
function StatusTab({ s, onSettings, t }: { s: ChartSettings; onSettings: (p: Partial<ChartSettings>) => void; t: (k: string) => string }) {
  return (
    <div className="sm-section-list">
      <ToggleRow label={t("smShowOHLC")} value={s.showOHLC} onChange={(v) => onSettings({ showOHLC: v })} />
      <ToggleRow label={t("smShowBarChange")} value={s.showBarChange} onChange={(v) => onSettings({ showBarChange: v })} />
      <ToggleRow label={t("smShowSymbolName")} value={s.showSymbolName} onChange={(v) => onSettings({ showSymbolName: v })} />
    </div>
  );
}

// ── SCALES AND LINES TAB ─────────────────────────────────────────────────────
function ScalesTab({ s, onSettings, chartApi, t }: { s: ChartSettings; onSettings: (p: Partial<ChartSettings>) => void; chartApi?: IChartApi | null; t: (k: string) => string }) {
  function applyAutoScale(v: boolean) {
    onSettings({ autoScale: v });
    try { if (chartApi) chartApi.priceScale(s.scaleLeft ? "left" : "right").setAutoScale(v); } catch {}
  }

  return (
    <div className="sm-section-list">
      {/* Scale position */}
      <div className="sm-row">
        <span className="sm-row-label">{t("smScalePosition")}</span>
        <div className="sm-seg">
          <button className={s.scaleLeft ? "" : "on"} onClick={() => onSettings({ scaleLeft: false })}>{t("smScaleRight")}</button>
          <button className={s.scaleLeft ? "on" : ""} onClick={() => onSettings({ scaleLeft: true })}>{t("smScaleLeft")}</button>
        </div>
      </div>

      {/* Scale mode */}
      <div className="sm-row sm-row-col">
        <span className="sm-row-label">{t("smScaleMode")}</span>
        <div className="sm-radio-group">
          {([
            [PriceScaleMode.Normal, t("qsgRegular")],
            [PriceScaleMode.Percentage, t("qsgPercent")],
            [PriceScaleMode.IndexedTo100, t("qsgIndexed")],
            [PriceScaleMode.Logarithmic, t("qsgLog")],
          ] as [PriceScaleMode, string][]).map(([m, label]) => (
            <label key={m} className="sm-radio">
              <input type="radio" checked={s.mode === m} onChange={() => onSettings({ mode: m })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="sm-sep" />
      <ToggleRow label={t("smInvertScale")} value={s.invertScale} onChange={(v) => onSettings({ invertScale: v })} />
      <ToggleRow label={t("smAutoScale")} value={s.autoScale} onChange={applyAutoScale} />
      <div className="sm-sep" />
      <ToggleRow label={t("smLastValueLabel")} value={s.lastValueVisible} onChange={(v) => onSettings({ lastValueVisible: v })} />
      <ToggleRow label={t("smPriceLine")} value={s.priceLineVisible} onChange={(v) => onSettings({ priceLineVisible: v })} />
      <div className="sm-sep" />
      <ToggleRow label={t("smGridH")} value={s.gridHVisible} onChange={(v) => onSettings({ gridHVisible: v })} />
      <ToggleRow label={t("smGridV")} value={s.gridVVisible} onChange={(v) => onSettings({ gridVVisible: v })} />
    </div>
  );
}

// ── CANVAS TAB ───────────────────────────────────────────────────────────────
function CanvasTab({ s, onSettings, t }: { s: ChartSettings; onSettings: (p: Partial<ChartSettings>) => void; t: (k: string) => string }) {
  return (
    <div className="sm-section-list">
      <ToggleRow label={t("smWatermark")} value={s.showWatermark} onChange={(v) => onSettings({ showWatermark: v })} />
    </div>
  );
}
