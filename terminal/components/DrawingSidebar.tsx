"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

// ── Tool definitions ─────────────────────────────────────────────────────────
// Each tool: [id, svgPath, i18n key, optional keyboard shortcut]
// Groups: cursor | lines | shapes | annotate | measure

type ToolDef = { id: string; path: string; tk: string; kbd?: string };
type ToolGroup = { key: string; labelTk: string; iconPath: string; tools: ToolDef[] };

// SVG paths (24x24 viewBox, stroke-based)
const TOOL_GROUPS: ToolGroup[] = [
  {
    key: "lines",
    labelTk: "toolGroupLines",
    iconPath: "M4 20L20 4",
    tools: [
      { id: "trendline", path: "M4 20L20 4", tk: "toolTrendline", kbd: "Alt+T" },
      { id: "hline", path: "M3 12h18", tk: "toolHline", kbd: "Alt+H" },
      { id: "vline", path: "M12 3v18", tk: "toolVline", kbd: "Alt+V" },
      { id: "arrow", path: "M5 19L19 5M13 5h6v6", tk: "toolArrow" },
      { id: "ray", path: "M4 20L20 4M17 7l3-3", tk: "toolRay" },
    ],
  },
  {
    key: "shapes",
    labelTk: "toolGroupShapes",
    iconPath: "M4 6h16v12H4z",
    tools: [
      { id: "rect", path: "M4 6h16v12H4z", tk: "toolRect", kbd: "Alt+R" },
      { id: "fib", path: "M3 5h18M3 9h18M3 15h18M3 19h18", tk: "toolFib" },
    ],
  },
  {
    key: "annotate",
    labelTk: "toolGroupAnnotate",
    iconPath: "M5 5h14M12 5v14",
    tools: [
      { id: "text", path: "M5 5h14M12 5v14", tk: "toolText", kbd: "Alt+X" },
      // brush removed: no render branch or pointer-creation handler exists for this kind
    ],
  },
  {
    key: "measure",
    labelTk: "toolGroupMeasure",
    iconPath: "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6",
    tools: [
      { id: "measure", path: "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6", tk: "toolMeasure", kbd: "Alt+M" },
    ],
  },
];

const STYLEABLE = new Set(["trendline", "arrow", "rect", "hline", "vline"]);

export default function DrawingSidebar({
  tool,
  magnet,
  drawStyle,
  onTool,
  onMagnet,
  onClear,
  onDrawStyle,
}: {
  tool: string | null;
  magnet: boolean;
  drawStyle: { color: string; width: number; dash: "solid" | "dashed" | "dotted" };
  onTool: (id: string | null) => void;
  onMagnet: () => void;
  onClear: () => void;
  onDrawStyle: (patch: Partial<{ color: string; width: number; dash: "solid" | "dashed" | "dotted" }>) => void;
}) {
  const t = useT();
  // which group flyout is open (null = none)
  const [flyout, setFlyout] = useState<string | null>(null);
  // last chosen tool within each group (for the group button icon)
  const [groupActive, setGroupActive] = useState<Record<string, ToolDef>>(() => {
    const m: Record<string, ToolDef> = {};
    for (const g of TOOL_GROUPS) m[g.key] = g.tools[0];
    return m;
  });
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close flyout on outside click
  useEffect(() => {
    if (!flyout) return;
    const h = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setFlyout(null);
      }
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [flyout]);

  function pickTool(groupKey: string, td: ToolDef) {
    setGroupActive((prev) => ({ ...prev, [groupKey]: td }));
    setFlyout(null);
    onTool(td.id);
  }

  // Determine if a group has an active tool
  function groupIsActive(g: ToolGroup): boolean {
    return g.tools.some((td) => td.id === tool);
  }

  return (
    <div className="ds-dock" ref={sidebarRef}>
      {/* Cursor */}
      <button
        className={`ds-btn${!tool ? " on" : ""}`}
        title={t("toolCursor")}
        onClick={() => onTool(null)}
      >
        <svg viewBox="0 0 24 24"><path d="M5 3l14 9-7 2-4 7z" /></svg>
      </button>

      <div className="ds-sep" />

      {/* Tool groups with flyout submenus */}
      {TOOL_GROUPS.map((g) => {
        const active = groupIsActive(g);
        const shown = groupActive[g.key] ?? g.tools[0];
        const open = flyout === g.key;
        // single-tool groups: no flyout needed
        const hasFlyout = g.tools.length > 1;
        return (
          <div key={g.key} className="ds-group-host">
            <button
              className={`ds-btn${active ? " on" : ""}`}
              title={t(shown.tk) + (shown.kbd ? ` (${shown.kbd})` : "")}
              onClick={() => {
                if (!hasFlyout) { pickTool(g.key, g.tools[0]); return; }
                setFlyout(open ? null : g.key);
              }}
            >
              <svg viewBox="0 0 24 24"><path d={shown.path} /></svg>
              {hasFlyout && <span className="ds-fly-arrow" />}
            </button>

            {hasFlyout && open && (
              <div className="ds-flyout">
                {g.tools.map((td) => (
                  <button
                    key={td.id}
                    className={`ds-fly-item${tool === td.id ? " on" : ""}`}
                    title={t(td.tk) + (td.kbd ? ` (${td.kbd})` : "")}
                    onClick={() => pickTool(g.key, td)}
                  >
                    <svg viewBox="0 0 24 24"><path d={td.path} /></svg>
                    <span>{t(td.tk)}</span>
                    {td.kbd && <kbd className="ds-kbd">{td.kbd}</kbd>}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Draw style picker (shown when a styleable tool is active) */}
      {tool && STYLEABLE.has(tool) && (
        <div className="ds-style">
          {["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"].map((c) => (
            <button
              key={c}
              className={`ds-sw${drawStyle.color === c ? " on" : ""}`}
              style={{ background: c }}
              title={c}
              onClick={() => onDrawStyle({ color: c })}
            />
          ))}
          <span className="ds-sty-sep" />
          {[1.5, 2.5, 4].map((w) => (
            <button
              key={w}
              className={`ds-w${drawStyle.width === w ? " on" : ""}`}
              title={`${w}px`}
              onClick={() => onDrawStyle({ width: w })}
            >
              <i style={{ height: Math.max(1, Math.round(w)) }} />
            </button>
          ))}
          {tool !== "arrow" && (
            <>
              <span className="ds-sty-sep" />
              {(["solid", "dashed", "dotted"] as const).map((dk) => (
                <button
                  key={dk}
                  className={`ds-d${drawStyle.dash === dk ? " on" : ""}`}
                  title={dk}
                  onClick={() => onDrawStyle({ dash: dk })}
                >
                  <svg viewBox="0 0 20 12">
                    <path d={dk === "solid" ? "M2 6h16" : dk === "dashed" ? "M2 6h4M8 6h4M14 6h4" : "M2 6h.5M6 6h.5M10 6h.5M14 6h.5M18 6h.5"} />
                  </svg>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="ds-spacer" />

      {/* Bottom group: magnet, lock (reserved UI affordance, non-interactive), erase/clear */}
      <button
        className={`ds-btn${magnet ? " on" : ""}`}
        title={t("magnetTip")}
        onClick={onMagnet}
      >
        <svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z" /></svg>
      </button>

      {/* Lock drawings — UI affordance; actual lock behavior is a future enhancement */}
      <button className="ds-btn ds-btn-dim" title={t("toolLock")} disabled>
        <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      </button>

      {/* Clear all drawings */}
      <button className="ds-btn" title={t("clearDrawings")} onClick={onClear}>
        <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
      </button>
    </div>
  );
}
