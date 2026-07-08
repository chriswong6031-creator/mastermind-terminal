"use client";
/**
 * StrikeLadder — per-strike horizontal signed GEX bar chart.
 *
 * Pass 3 (MomoEdge parity):
 *   - EXPIRY SELECTOR: dropdown (not chips) with DTE captions + inline 0DTE quick chip.
 *   - AUTO-CENTER: on load and ticker change, spot row scrolls to mid-viewport.
 *   - BAR: power-curve (^0.7) length, max 46% per side, positive cyan / negative red,
 *          center axis hairline.
 *   - LEVEL BADGES: right-edge tags (WALL / SUPPORT / MAGNET / FLIP) only on keyed rows.
 *   - SPOT ROW: amber highlight + distinct marker line treatment.
 *   - FLIP LINE: inserted between straddling strikes (purple divider).
 *   - PERCENT-FROM-SPOT: strike label shows % distance when not at spot.
 *
 * Layout: [strike label + %dist] [center-axis bars] [level-tag]  [gex value]
 * Strikes rendered descending (highest at top).
 *
 * HONESTY DOCTRINE: bar direction (positive/negative) is the dealer-sign convention
 * — an assumption. Magnitude is the reliable read. Passport caveat is in MarketStateCard.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { makeGexT } from "./gexStrings";
import type { Lang } from "@/lib/i18n";
import type { GexPayload } from "./GexDeskView";

// ─── Types ────────────────────────────────────────────────────────────────────

type StrikeRow = GexPayload["by_strike"][number];

interface Levels {
  callWall: number | null;
  putWall: number | null;
  gammaFlip: number | null;
  hvl: number | null;
}

interface TooltipData {
  strike: number;
  gamma_net: number;
  gamma_call: number;
  gamma_put: number;
  badge?: string;
  x: number;
  y: number;
}

interface StrikeLadderProps {
  strikes: StrikeRow[];
  spot: number | null;
  levels: Levels;
  byExpiry?: GexPayload["by_expiry"] | null;
  selectedExpiry: string | null;
  onSelectExpiry: (exp: string | null) => void;
  lang: Lang;
}

type BadgeTone = "cyan" | "red" | "amber" | "purple";

interface BadgeInfo {
  tag: string;
  tone: BadgeTone;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtGexVal(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  const abs = Math.abs(v);
  if (abs >= 1) return `${sign}${abs.toFixed(2)}B`;
  if (abs >= 0.001) return `${sign}${(abs * 1000).toFixed(1)}M`;
  return `${sign}${(abs * 1e6).toFixed(0)}K`;
}

function fmtStrike(s: number): string {
  return s % 1 === 0 ? String(s) : s.toFixed(1);
}

function fmtPctFromSpot(strike: number, spot: number): string {
  const pct = ((strike - spot) / spot) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function dteDays(expStr: string): number {
  try {
    const now = Date.now();
    const exp = new Date(expStr + "T20:00:00Z").getTime();
    return Math.max(0, Math.round((exp - now) / 86_400_000));
  } catch {
    return 0;
  }
}

function dteLabelStr(exp: string): string {
  const d = dteDays(exp);
  return d === 0 ? "0DTE" : `${d}d`;
}

/** Classify a strike row to a badge type — priority: flip > wall > support > magnet */
function classifyBadge(
  s: StrikeRow,
  levels: Levels,
  step: number
): BadgeInfo | null {
  const { callWall, putWall, gammaFlip, hvl } = levels;
  const prox = step * 1.2;

  if (gammaFlip != null && Math.abs(s.strike - gammaFlip) < prox) {
    return { tag: "FLIP", tone: "purple" };
  }
  if (callWall != null && Math.abs(s.strike - callWall) < prox) {
    return { tag: "WALL", tone: "cyan" };
  }
  if (putWall != null && Math.abs(s.strike - putWall) < prox) {
    return { tag: "SUPPORT", tone: "red" };
  }
  if (hvl != null && Math.abs(s.strike - hvl) < prox) {
    return { tag: "MAGNET", tone: "amber" };
  }
  return null;
}

/** Estimate median step from sorted strikes */
function estimateStep(strikes: StrikeRow[]): number {
  if (strikes.length < 2) return 5;
  const sorted = [...strikes].sort((a, b) => a.strike - b.strike);
  const diffs = sorted
    .slice(1)
    .map((s, i) => s.strike - sorted[i].strike)
    .filter((d) => d > 0);
  if (diffs.length === 0) return 5;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

/** Badge color by tone */
function toneColor(tone: BadgeTone): string {
  switch (tone) {
    case "cyan":   return "var(--brand-2)";
    case "red":    return "var(--down)";
    case "amber":  return "var(--signal)";
    case "purple": return "var(--cat-2)";
  }
}

function toneBorderColor(tone: BadgeTone): string {
  switch (tone) {
    case "cyan":   return "rgba(77,130,255,0.35)";
    case "red":    return "rgba(240,86,107,0.35)";
    case "amber":  return "rgba(232,179,57,0.35)";
    case "purple": return "rgba(157,134,255,0.35)";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StrikeLadder({
  strikes,
  spot,
  levels,
  byExpiry,
  selectedExpiry,
  onSelectExpiry,
  lang,
}: StrikeLadderProps) {
  const t = makeGexT(lang);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const spotRowRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sort descending (highest strike at top)
  const sorted = [...strikes].sort((a, b) => b.strike - a.strike);
  const step = estimateStep(strikes);

  // Max |gamma_net| for bar scaling
  const maxAbs = sorted.reduce(
    (m, s) => Math.max(m, Math.abs(s.gamma_net)),
    0.001
  );

  // Current-price row: nearest strike to spot
  const currentStrikeVal: number | null = (() => {
    if (spot == null || sorted.length === 0) return null;
    const nearest = sorted.reduce((best, s) =>
      Math.abs(s.strike - spot) < Math.abs(best.strike - spot) ? s : best
    );
    return Math.abs(nearest.strike - spot) <= step * 0.8 ? nearest.strike : null;
  })();

  // Gamma flip insertion index
  const flipStrike = levels.gammaFlip;
  let flipInsertAfter: number | null = null;
  if (flipStrike != null) {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].strike >= flipStrike && flipStrike > sorted[i + 1].strike) {
        flipInsertAfter = i;
        break;
      }
    }
  }

  // AUTO-CENTER: scroll spot row to mid-viewport on load and ticker change.
  //
  // Root-cause history:
  //   A. HIDDEN MOUNT: parent tab starts display:none → flex when active. The effect
  //      fires before the scroll container has non-zero height.
  //   B. UNCONSTRAINED LAYOUT (fixed): flex ancestor lacked minHeight:0, so the scroll
  //      container was clientHeight=scrollHeight (not scrollable). Fixed in GexDeskView.tsx
  //      (LEFT_PANE: maxHeight:"100%"). Guard retained: isScrollable() still rejects this.
  //   C. VISIBILITY FLIP: harness iframe sets visibilityState='hidden'. A visibilitychange
  //      event unblocks the data fetch. We re-attempt centering on that event.
  //
  // Implementation: DOM-query approach avoids the early-return ref problem.
  // spotRowRef/scrollRef are only valid after the FULL render path (sorted.length>0).
  // Instead, we query containerRef (always rendered) to find the scroll container
  // and the spot row directly from the DOM — no ref dependency on sorted.length.
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number | null = null;
    let observer: ResizeObserver | null = null;
    // Retry cap: prevent infinite loops if spot row is genuinely absent
    let retries = 0;
    const MAX_RETRIES = 30;

    function isScrollable(container: Element): boolean {
      return container.clientHeight > 0 && container.scrollHeight > container.clientHeight;
    }

    // Returns true if centering succeeded (scrollTop moved or spot already in view).
    function doCenter(): boolean {
      // Re-query from DOM every time — works even after early-return renders
      const container = containerRef.current?.querySelector<HTMLDivElement>(".obs-scroll") ?? null;
      if (!container || !isScrollable(container)) return false;

      // Find the spot row by the ▶ marker span (always rendered on isCurrent rows)
      const rows = container.children;
      let spotRow: Element | null = null;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].textContent?.includes("▶")) {
          spotRow = rows[i];
          break;
        }
      }
      if (!spotRow) return false;

      const elTop = (spotRow as HTMLElement).offsetTop;
      const elHeight = (spotRow as HTMLElement).offsetHeight;
      const containerHeight = container.clientHeight;
      const target = elTop - containerHeight / 2 + elHeight / 2;
      const before = container.scrollTop;
      container.scrollTop = target;
      // Success: scrollTop moved toward target, or spot is already in view
      const moved = Math.abs(container.scrollTop - before) > 0.5;
      const inView =
        (spotRow as HTMLElement).offsetTop >= container.scrollTop &&
        (spotRow as HTMLElement).offsetTop + elHeight <=
          container.scrollTop + containerHeight;
      return moved || inView;
    }

    function tryCenter() {
      if (retries >= MAX_RETRIES) return;
      retries++;
      const container = containerRef.current?.querySelector<HTMLDivElement>(".obs-scroll") ?? null;
      if (container && isScrollable(container)) {
        const success = doCenter();
        if (!success) {
          // scrollTop assignment was clamped (layout not yet final) — retry next frame
          rafId = requestAnimationFrame(tryCenter);
        } else {
          // Success: keep ResizeObserver armed so resize events re-center
          if (!observer && containerRef.current) {
            observer = new ResizeObserver(() => {
              retries = 0;
              requestAnimationFrame(tryCenter);
            });
            observer.observe(container);
          }
        }
      } else if (!observer && containerRef.current) {
        // Not yet scrollable — watch for layout change (hidden→visible OR constrained layout)
        const target = container ?? containerRef.current;
        observer = new ResizeObserver(() => {
          const c = containerRef.current?.querySelector<HTMLDivElement>(".obs-scroll");
          if (c && isScrollable(c)) {
            observer?.disconnect();
            observer = null;
            retries = 0;
            rafId = requestAnimationFrame(tryCenter);
          }
        });
        observer.observe(target);
      }
    }

    rafId = requestAnimationFrame(tryCenter);

    // Visibility-change fallback (harness preview late-load path)
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        retries = 0;
        requestAnimationFrame(tryCenter);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  // Re-center when strike data changes (proxy: sorted.length and spot)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length, spot, currentStrikeVal]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handler(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const handleMouseEnter = useCallback(
    (s: StrikeRow, badge: string | undefined, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltip({
        strike: s.strike,
        gamma_net: s.gamma_net,
        gamma_call: s.gamma_call,
        gamma_put: s.gamma_put,
        badge,
        x: e.clientX - (rect?.left ?? 0) + 14,
        y: e.clientY - (rect?.top ?? 0) - 10,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Expiry dropdown: build option list
  const expiryOptions: { exp: string; label: string; dte: string }[] = byExpiry
    ? byExpiry.map((e) => ({
        exp: e.exp,
        // Show MM-DD (strip year) for compactness
        label: e.exp.length >= 10 ? e.exp.slice(5) : e.exp,
        dte: dteLabelStr(e.exp),
      }))
    : [];

  const selectedLabel = selectedExpiry
    ? expiryOptions.find((o) => o.exp === selectedExpiry)?.label ?? selectedExpiry
    : t("expiryDropdownLabel");

  const has0Dte =
    expiryOptions.length > 0 &&
    dteDays(expiryOptions[0].exp) === 0;

  if (sorted.length === 0) {
    return (
      <div style={LADDER_OUTER} data-tut="gex-ladder">
        <div style={LADDER_EMPTY}>{t("ladderNoData")}</div>
      </div>
    );
  }

  return (
    <div style={LADDER_OUTER} ref={containerRef} data-tut="gex-ladder">
      {/* ── Expiry selector ───────────────────────────────────────────────────── */}
      {byExpiry && byExpiry.length > 0 && (
        <div style={EXPIRY_BAR}>
          {/* Dropdown */}
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              style={DD_TRIGGER}
              onClick={() => setDropdownOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span>{selectedLabel}</span>
              <span
                style={{
                  ...DD_CARET,
                  transform: dropdownOpen ? "rotate(180deg)" : undefined,
                }}
              >
                ▾
              </span>
            </button>
            {dropdownOpen && (
              <div style={DD_MENU} role="listbox">
                {/* ALL option */}
                <button
                  style={{
                    ...DD_OPT,
                    ...(selectedExpiry === null ? DD_OPT_ACTIVE : {}),
                  }}
                  role="option"
                  aria-selected={selectedExpiry === null}
                  onClick={() => {
                    onSelectExpiry(null);
                    setDropdownOpen(false);
                  }}
                >
                  <span>{t("expiryDropdownLabel")}</span>
                  <span style={DD_OPT_DTE}>all</span>
                </button>
                {expiryOptions.map((o) => (
                  <button
                    key={o.exp}
                    style={{
                      ...DD_OPT,
                      ...(selectedExpiry === o.exp ? DD_OPT_ACTIVE : {}),
                    }}
                    role="option"
                    aria-selected={selectedExpiry === o.exp}
                    onClick={() => {
                      onSelectExpiry(o.exp);
                      setDropdownOpen(false);
                    }}
                  >
                    <span>{o.exp}</span>
                    <span style={DD_OPT_DTE}>{o.dte}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 0DTE quick chip (only when nearest expiry is today) */}
          {has0Dte && (
            <button
              className={`obs-chip${
                selectedExpiry === expiryOptions[0].exp ? " on" : ""
              }`}
              style={QUICK_CHIP}
              onClick={() => {
                const t0 = expiryOptions[0].exp;
                onSelectExpiry(selectedExpiry === t0 ? null : t0);
              }}
            >
              {t("expiry0Dte")}
            </button>
          )}
        </div>
      )}

      {/* ── Column headers ──────────────────────────────────────────────────── */}
      <div style={COL_HEADER_ROW}>
        <span style={COL_STRIKE_HDR}>{t("ladderStrike")}</span>
        <span style={COL_BAR_HDR}>{t("ladderNetGex")}</span>
        <span style={COL_TAG_HDR}>{/* level tag column — no header */}</span>
        <span style={COL_VAL_HDR}>{t("ladderNetGex")}</span>
      </div>

      {/* ── Scrollable chart body ─────────────────────────────────────────────── */}
      <div style={CHART_SCROLL} ref={scrollRef} className="obs-scroll">
        {/* Center axis hairline (positioned over bar area) */}
        <div style={CENTER_LINE} />

        {sorted.map((s, i) => {
          const badge = classifyBadge(s, levels, step);
          const isCurrent = s.strike === currentStrikeVal;
          const isPos = s.gamma_net >= 0;
          const pct = Math.abs(s.gamma_net) / maxAbs;
          const shaped = Math.pow(pct, 0.7);
          const barW = Math.max(shaped * 46, pct > 0 ? 2 : 0); // max 46% per half
          const isBig = pct > 0.35;

          const strikeColor = isCurrent
            ? "var(--signal)"
            : badge?.tone === "cyan"
            ? "var(--brand-2)"
            : badge?.tone === "red"
            ? "var(--down)"
            : badge?.tone === "amber"
            ? "var(--signal)"
            : badge?.tone === "purple"
            ? "var(--cat-2)"
            : "var(--text-2)";

          return (
            <React.Fragment key={s.strike}>
              {/* Gamma flip divider line */}
              {flipInsertAfter === i - 1 && flipStrike != null && (
                <div style={FLIP_LINE} data-tut="gex-flip">
                  <span style={FLIP_LABEL}>{t("ladderFlipLine")}</span>
                  <div style={FLIP_GRADIENT} />
                  <span style={FLIP_PRICE}>{fmtStrike(flipStrike)}</span>
                </div>
              )}

              <div
                ref={isCurrent ? spotRowRef : undefined}
                style={{
                  ...STRIKE_ROW,
                  ...(isCurrent ? CURRENT_ROW : {}),
                  ...(badge?.tone === "cyan" ? ZONE_CW : {}),
                  ...(badge?.tone === "amber" ? ZONE_HVL : {}),
                  ...(badge?.tone === "red" ? ZONE_PS : {}),
                }}
                onMouseEnter={(e) => handleMouseEnter(s, badge?.tag, e)}
                onMouseLeave={handleMouseLeave}
              >
                {/* Strike price label + %-from-spot */}
                <div style={STRIKE_COL}>
                  <span
                    style={{
                      ...STRIKE_PRICE,
                      color: strikeColor,
                      fontWeight: isCurrent || badge ? 700 : 400,
                    }}
                  >
                    {fmtStrike(s.strike)}
                  </span>
                  {spot != null && !isCurrent && (
                    <span style={PCT_DIST}>
                      {fmtPctFromSpot(s.strike, spot)}
                    </span>
                  )}
                  {isCurrent && (
                    <span style={SPOT_MARKER}>▶</span>
                  )}
                </div>

                {/* Bar area (symmetric around center axis) */}
                <div style={BAR_AREA}>
                  {!isPos && barW > 0 && (
                    <div
                      style={{
                        ...BAR_NEG,
                        width: `${barW}%`,
                        opacity: isBig ? 1 : 0.75,
                      }}
                    />
                  )}
                  {isPos && barW > 0 && (
                    <div
                      style={{
                        ...BAR_POS,
                        width: `${barW}%`,
                        opacity: isBig ? 1 : 0.75,
                      }}
                    />
                  )}
                </div>

                {/* Right-edge level tag */}
                <div style={TAG_COL}>
                  {badge && (
                    <span
                      style={{
                        ...LEVEL_TAG,
                        color: toneColor(badge.tone),
                        borderColor: toneBorderColor(badge.tone),
                        background: `${toneBorderColor(badge.tone).replace("0.35", "0.08")}`,
                      }}
                    >
                      {badge.tag}
                    </span>
                  )}
                </div>

                {/* GEX value */}
                <span
                  className="num"
                  style={{
                    ...GEX_VAL,
                    color: isPos ? "var(--up)" : "var(--down)",
                  }}
                >
                  {fmtGexVal(s.gamma_net)}
                </span>
              </div>
            </React.Fragment>
          );
        })}

        {/* Gamma flip at the very bottom (if below all strikes) */}
        {flipInsertAfter === null &&
          flipStrike != null &&
          flipStrike < (sorted[sorted.length - 1]?.strike ?? Infinity) && (
            <div style={FLIP_LINE}>
              <span style={FLIP_LABEL}>{t("ladderFlipLine")}</span>
              <div style={FLIP_GRADIENT} />
              <span style={FLIP_PRICE}>{fmtStrike(flipStrike)}</span>
            </div>
          )}
      </div>

      {/* ── Tooltip ─────────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          style={{
            ...TOOLTIP,
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div style={TOOLTIP_TITLE}>
            ${fmtStrike(tooltip.strike)}
            {spot != null && (
              <span style={{ marginLeft: 6, color: "var(--muted)", fontSize: 10 }}>
                {fmtPctFromSpot(tooltip.strike, spot)}
              </span>
            )}
            {tooltip.badge && (
              <span style={{ marginLeft: 6, color: "var(--muted)" }}>
                · {tooltip.badge}
              </span>
            )}
          </div>
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipNetGex")}</span>
            <span
              style={{
                color: tooltip.gamma_net >= 0 ? "var(--brand-2)" : "var(--down)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtGexVal(tooltip.gamma_net)}
            </span>
          </div>
          <div style={TOOLTIP_SEP} />
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipCallGex")}</span>
            <span style={{ color: "var(--brand-2)", fontVariantNumeric: "tabular-nums" }}>
              {fmtGexVal(tooltip.gamma_call)}
            </span>
          </div>
          <div style={TOOLTIP_ROW}>
            <span style={TOOLTIP_KEY}>{t("tooltipPutGex")}</span>
            <span style={{ color: "var(--down)", fontVariantNumeric: "tabular-nums" }}>
              {fmtGexVal(tooltip.gamma_put)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const LADDER_OUTER: React.CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  background: "var(--bg)",
};

const LADDER_EMPTY: React.CSSProperties = {
  padding: 24,
  color: "var(--muted)",
  fontSize: 12,
  textAlign: "center",
};

// Expiry selector bar
const EXPIRY_BAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 10px",
  borderBottom: "1px solid var(--line-2)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
};

// Dropdown trigger
const DD_TRIGGER: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text)",
  background: "var(--inset)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  cursor: "pointer",
  whiteSpace: "nowrap",
  minWidth: 140,
};

const DD_CARET: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 10,
  color: "var(--muted)",
  transition: "transform 0.15s",
  display: "inline-block",
};

const DD_MENU: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 50,
  background: "var(--panel-2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-md)",
  maxHeight: 280,
  overflowY: "auto",
  minWidth: 160,
  boxShadow: "var(--shadow-1)",
  backdropFilter: "blur(8px)",
};

const DD_OPT: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-2)",
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  gap: 8,
};

const DD_OPT_ACTIVE: React.CSSProperties = {
  color: "var(--signal)",
  background: "rgba(232,179,57,0.09)",
};

const DD_OPT_DTE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const QUICK_CHIP: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 10,
  borderRadius: 8,
};

// Column headers
const COL_HEADER_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "100px 1fr 52px 72px",
  padding: "3px 8px",
  borderBottom: "1px solid var(--line-2)",
  background: "var(--panel)",
  position: "sticky",
  top: 0,
  zIndex: 2,
  flexShrink: 0,
};

const COL_STRIKE_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const COL_BAR_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "center",
};

const COL_TAG_HDR: React.CSSProperties = {};

const COL_VAL_HDR: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "right",
};

// Scroll container (fills remaining space) — obs-scroll class handles scrollbar styling
const CHART_SCROLL: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  position: "relative",
};

// Center-axis hairline — spans full scroll height, pinned at 50% of bar area
// Bar area is col 2 (1fr) so 100px + 50% of (100% - 100px - 52px - 72px)
const CENTER_LINE: React.CSSProperties = {
  position: "absolute",
  // Approximate center of bar column (col 2). The grid makes exact px unavailable
  // but 100px strike col + half of remaining ≈ calc(100px + (100% - 224px)/2)
  left: "calc(100px + (100% - 224px) / 2)",
  top: 0,
  bottom: 0,
  width: 1,
  background: "rgba(77,130,255,0.13)",
  pointerEvents: "none",
  zIndex: 1,
};

const STRIKE_ROW: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "100px 1fr 52px 72px",
  alignItems: "center",
  height: 22,
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  cursor: "default",
  position: "relative",
  transition: "background 0.1s",
};

const CURRENT_ROW: React.CSSProperties = {
  background: "rgba(232,179,57,0.07)",
  borderTop: "1px solid rgba(232,179,57,0.22)",
  borderBottom: "1px solid rgba(232,179,57,0.22)",
};

// Zone tints (only on relevant rows)
const ZONE_CW: React.CSSProperties = {
  background: "rgba(77,130,255,0.04)",
};

const ZONE_HVL: React.CSSProperties = {
  background: "rgba(232,179,57,0.04)",
};

const ZONE_PS: React.CSSProperties = {
  background: "rgba(240,86,107,0.04)",
};

const STRIKE_COL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  padding: "0 6px",
  overflow: "hidden",
};

const STRIKE_PRICE: React.CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const PCT_DIST: React.CSSProperties = {
  fontSize: 9,
  color: "var(--muted)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const SPOT_MARKER: React.CSSProperties = {
  fontSize: 8,
  color: "var(--signal)",
  flexShrink: 0,
};

const BAR_AREA: React.CSSProperties = {
  position: "relative",
  height: "100%",
  display: "flex",
  alignItems: "center",
};

const BAR_POS: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  height: 11,
  borderRadius: "0 2px 2px 0",
  background:
    "linear-gradient(90deg, rgba(77,130,255,0.45), rgba(77,130,255,0.85))",
  transition: "width 0.35s cubic-bezier(.22,1,.36,1)",
};

const BAR_NEG: React.CSSProperties = {
  position: "absolute",
  right: "50%",
  height: 11,
  borderRadius: "2px 0 0 2px",
  background:
    "linear-gradient(270deg, rgba(240,86,107,0.45), rgba(240,86,107,0.85))",
  transition: "width 0.35s cubic-bezier(.22,1,.36,1)",
};

const TAG_COL: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  paddingRight: 4,
};

const LEVEL_TAG: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.08em",
  padding: "1px 4px",
  borderRadius: 3,
  border: "1px solid",
  flexShrink: 0,
  whiteSpace: "nowrap",
  lineHeight: 1.4,
};

const GEX_VAL: React.CSSProperties = {
  fontSize: 10,
  fontVariantNumeric: "tabular-nums",
  fontWeight: 600,
  textAlign: "right",
  paddingRight: 8,
  letterSpacing: "0.01em",
};

const FLIP_LINE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "3px 8px",
  height: 24,
  background: "rgba(157,134,255,0.08)",
  borderTop: "1px solid rgba(157,134,255,0.32)",
  borderBottom: "1px solid rgba(157,134,255,0.32)",
  zIndex: 2,
};

const FLIP_LABEL: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 900,
  color: "var(--cat-2)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  flexShrink: 0,
};

const FLIP_GRADIENT: React.CSSProperties = {
  flex: 1,
  height: 1,
  background:
    "linear-gradient(90deg, rgba(157,134,255,0.6) 0%, rgba(157,134,255,0.05) 100%)",
};

const FLIP_PRICE: React.CSSProperties = {
  fontSize: 9,
  color: "var(--cat-2)",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
};

const TOOLTIP: React.CSSProperties = {
  position: "absolute",
  background: "var(--panel-2)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "8px 10px",
  fontSize: 11,
  boxShadow: "var(--shadow-1)",
  pointerEvents: "none",
  zIndex: 100,
  minWidth: 160,
};

const TOOLTIP_TITLE: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 5,
  color: "var(--text)",
  fontVariantNumeric: "tabular-nums",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 2,
};

const TOOLTIP_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 2,
};

const TOOLTIP_KEY: React.CSSProperties = {
  color: "var(--muted)",
};

const TOOLTIP_SEP: React.CSSProperties = {
  height: 1,
  background: "var(--line-2)",
  margin: "4px 0",
};
