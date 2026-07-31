import type { Dash, DrawingExtend, DrawKind } from "@/lib/drawings";

export type DrawingToolGroupId =
  | "lines"
  | "fibonacci"
  | "shapes"
  | "patterns"
  | "annotation"
  | "measurement"
  | "forecasting";

export type DrawingCreationGesture = "point" | "drag" | "multi-click";
export type DrawingCreationFinish = "immediate" | "pointerup" | "double-click";
export type DrawingPointCount = 1 | 2 | 3 | 5 | "variable";

export type DrawingToolCapability =
  | "stroke"
  | "width"
  | "dash"
  | "fill"
  | "opacity"
  | "extend"
  | "text"
  | "fontSize"
  | "measurement"
  | "riskReward";

export type DrawingToolCreation = {
  gesture: DrawingCreationGesture;
  pointCount: DrawingPointCount;
  minPoints: number;
  maxPoints: number;
  finish: DrawingCreationFinish;
};

export type DrawingToolDefaults = {
  color: string;
  width: number;
  dash: Dash;
  opacity: number;
  extend: DrawingExtend;
  fillColor?: string;
  fillOpacity?: number;
  fontSize?: number;
};

export type DrawingToolShortcut = {
  code: string;
  label: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

export type DrawingToolDefinition = {
  id: DrawKind;
  label: string;
  labelKey: string;
  iconPath: string;
  creation: DrawingToolCreation;
  capabilities: readonly DrawingToolCapability[];
  defaults: Readonly<DrawingToolDefaults>;
  shortcut?: Readonly<DrawingToolShortcut>;
};

export type DrawingToolGroup = {
  id: DrawingToolGroupId;
  label: string;
  labelKey: string;
  iconPath: string;
  tools: readonly DrawingToolDefinition[];
};

const BLUE = "#4d82ff";
const BASE_DEFAULTS = {
  color: BLUE,
  width: 1.5,
  dash: "solid",
  opacity: 1,
  extend: "none",
} as const satisfies DrawingToolDefaults;
const AREA_DEFAULTS = {
  ...BASE_DEFAULTS,
  fillColor: BLUE,
  fillOpacity: 0.1,
} as const satisfies DrawingToolDefaults;

const point = (): DrawingToolCreation => ({
  gesture: "point",
  pointCount: 1,
  minPoints: 1,
  maxPoints: 1,
  finish: "immediate",
});
const drag = (): DrawingToolCreation => ({
  gesture: "drag",
  pointCount: 2,
  minPoints: 2,
  maxPoints: 2,
  finish: "pointerup",
});
const multi = (pointCount: 3 | 5): DrawingToolCreation => ({
  gesture: "multi-click",
  pointCount,
  minPoints: pointCount,
  maxPoints: pointCount,
  finish: "immediate",
});
const variablePath = (): DrawingToolCreation => ({
  gesture: "drag",
  pointCount: "variable",
  minPoints: 2,
  maxPoints: 64,
  finish: "pointerup",
});
const alt = (code: string, label: string): DrawingToolShortcut => ({ code, label, altKey: true });

/**
 * Canonical drawing catalog. Menu composition, creation behavior, styling
 * controls, shortcut routing, and renderer capability checks derive from this
 * one registry rather than maintaining parallel lists.
 */
export const DRAWING_TOOL_REGISTRY = [
  {
    id: "lines",
    label: "Lines",
    labelKey: "toolGroupLines",
    iconPath: "M4 20L20 4",
    tools: [
      {
        id: "trendline",
        label: "Trend Line",
        labelKey: "toolTrendline",
        iconPath: "M4 20L20 4",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
        shortcut: alt("KeyT", "Alt+T"),
      },
      {
        id: "ray",
        label: "Ray",
        labelKey: "toolRay",
        iconPath: "M4 20L20 4M17 7l3-3",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "opacity", "extend"],
        defaults: { ...BASE_DEFAULTS, extend: "right" },
      },
      {
        id: "extendedline",
        label: "Extended Line",
        labelKey: "toolExtendedLine",
        iconPath: "M2 22L22 2M2 22l3-1M22 2l-3 1",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "opacity", "extend"],
        defaults: { ...BASE_DEFAULTS, extend: "both" },
      },
      {
        id: "hline",
        label: "Horizontal Line",
        labelKey: "toolHline",
        iconPath: "M3 12h18",
        creation: point(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
        shortcut: alt("KeyH", "Alt+H"),
      },
      {
        id: "horizontalray",
        label: "Horizontal Ray",
        labelKey: "toolHorizontalRay",
        iconPath: "M3 12h17M17 9l3 3-3 3",
        creation: point(),
        capabilities: ["stroke", "width", "dash", "opacity", "extend"],
        defaults: { ...BASE_DEFAULTS, extend: "right" },
      },
      {
        id: "vline",
        label: "Vertical Line",
        labelKey: "toolVline",
        iconPath: "M12 3v18",
        creation: point(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
        shortcut: alt("KeyV", "Alt+V"),
      },
      {
        id: "crossline",
        label: "Cross Line",
        labelKey: "toolCrossLine",
        iconPath: "M3 12h18M12 3v18",
        creation: point(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
      },
      {
        id: "arrow",
        label: "Arrow",
        labelKey: "toolArrow",
        iconPath: "M5 19L19 5M13 5h6v6",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
      },
      {
        id: "channel",
        label: "Parallel Channel",
        labelKey: "toolChannel",
        iconPath: "M4 17L17 4M7 20L20 7M5 10l9 9",
        creation: multi(3),
        capabilities: ["stroke", "width", "dash", "fill", "opacity"],
        defaults: AREA_DEFAULTS,
      },
    ],
  },
  {
    id: "fibonacci",
    label: "Fibonacci",
    labelKey: "toolGroupFibonacci",
    iconPath: "M3 5h18M3 9h18M3 15h18M3 19h18",
    tools: [
      {
        id: "fib",
        label: "Fibonacci Retracement",
        labelKey: "toolFib",
        iconPath: "M3 5h18M3 9h18M3 15h18M3 19h18",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "fill", "opacity", "text"],
        defaults: { ...AREA_DEFAULTS, dash: "dashed", fillOpacity: 0.07 },
      },
    ],
  },
  {
    id: "shapes",
    label: "Shapes",
    labelKey: "toolGroupShapes",
    iconPath: "M4 6h16v12H4z",
    tools: [
      {
        id: "rect",
        label: "Rectangle",
        labelKey: "toolRect",
        iconPath: "M4 6h16v12H4z",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "fill", "opacity"],
        defaults: AREA_DEFAULTS,
        shortcut: alt("KeyR", "Alt+R"),
      },
      {
        id: "ellipse",
        label: "Ellipse",
        labelKey: "toolEllipse",
        iconPath: "M3 12a9 6 0 1 0 18 0 9 6 0 1 0-18 0",
        creation: drag(),
        capabilities: ["stroke", "width", "dash", "fill", "opacity"],
        defaults: AREA_DEFAULTS,
      },
      {
        id: "triangle",
        label: "Triangle",
        labelKey: "toolTriangle",
        iconPath: "M12 4L21 20H3z",
        creation: multi(3),
        capabilities: ["stroke", "width", "dash", "fill", "opacity"],
        defaults: AREA_DEFAULTS,
      },
      {
        id: "path",
        label: "Path",
        labelKey: "toolPath",
        iconPath: "M3 18c4-9 6 3 10-6s6-3 8-7",
        creation: variablePath(),
        capabilities: ["stroke", "width", "dash", "opacity"],
        defaults: BASE_DEFAULTS,
      },
    ],
  },
  {
    id: "patterns",
    label: "Patterns",
    labelKey: "toolGroupPatterns",
    iconPath: "M3 7l4 10 4-7 4 8 6-12",
    tools: [
      {
        id: "xabcd",
        label: "XABCD Pattern",
        labelKey: "toolXabcd",
        iconPath: "M2 7l4 11 5-8 4 9 7-14",
        creation: multi(5),
        capabilities: ["stroke", "width", "dash", "opacity", "text"],
        defaults: { ...BASE_DEFAULTS, dash: "dotted" },
      },
    ],
  },
  {
    id: "annotation",
    label: "Text & Notes",
    labelKey: "toolGroupAnnotate",
    iconPath: "M5 5h14M12 5v14",
    tools: [
      {
        id: "text",
        label: "Text",
        labelKey: "toolText",
        iconPath: "M5 5h14M12 5v14",
        creation: point(),
        capabilities: ["stroke", "opacity", "text", "fontSize"],
        defaults: { ...BASE_DEFAULTS, fontSize: 13 },
        shortcut: alt("KeyX", "Alt+X"),
      },
    ],
  },
  {
    id: "measurement",
    label: "Measure & Ranges",
    labelKey: "toolGroupMeasure",
    iconPath: "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6",
    tools: [
      {
        id: "measure",
        label: "Measure",
        labelKey: "toolMeasure",
        iconPath: "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6",
        creation: drag(),
        capabilities: ["stroke", "fill", "opacity", "measurement", "text"],
        defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 },
        shortcut: alt("KeyM", "Alt+M"),
      },
      {
        id: "pricerange",
        label: "Price Range",
        labelKey: "toolPriceRange",
        iconPath: "M6 4v16M3 7l3-3 3 3M3 17l3 3 3-3M11 6h10M11 18h10",
        creation: drag(),
        capabilities: ["stroke", "fill", "opacity", "measurement", "text"],
        defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 },
      },
      {
        id: "daterange",
        label: "Date Range",
        labelKey: "toolDateRange",
        iconPath: "M4 6h16v14H4zM4 10h16M8 3v6M16 3v6",
        creation: drag(),
        capabilities: ["stroke", "fill", "opacity", "measurement", "text"],
        defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 },
      },
    ],
  },
  {
    id: "forecasting",
    label: "Forecasting",
    labelKey: "toolGroupForecasting",
    iconPath: "M5 19V5M2 8l3-3 3 3M10 17h11M18 14l3 3-3 3",
    tools: [
      {
        id: "longposition",
        label: "Long Position",
        labelKey: "toolLongPosition",
        iconPath: "M5 20V4M2 7l3-3 3 3M10 8h11M10 16h11",
        creation: multi(3),
        capabilities: ["stroke", "fill", "opacity", "measurement", "riskReward", "text"],
        defaults: {
          ...AREA_DEFAULTS,
          color: "var(--up)",
          fillColor: "var(--up)",
          fillOpacity: 0.16,
        },
      },
      {
        id: "shortposition",
        label: "Short Position",
        labelKey: "toolShortPosition",
        iconPath: "M5 4v16M2 17l3 3 3-3M10 8h11M10 16h11",
        creation: multi(3),
        capabilities: ["stroke", "fill", "opacity", "measurement", "riskReward", "text"],
        defaults: {
          ...AREA_DEFAULTS,
          color: "var(--down)",
          fillColor: "var(--down)",
          fillOpacity: 0.16,
        },
      },
    ],
  },
] as const satisfies readonly DrawingToolGroup[];

export const DRAWING_TOOL_GROUPS: readonly DrawingToolGroup[] = DRAWING_TOOL_REGISTRY;

export type RegisteredDrawingTool = DrawingToolDefinition & { groupId: DrawingToolGroupId };

export const DRAWING_TOOLS: readonly RegisteredDrawingTool[] = DRAWING_TOOL_REGISTRY.flatMap((group) =>
  group.tools.map((tool) => ({ ...tool, groupId: group.id })),
);

export const DRAWING_TOOL_BY_ID = Object.freeze(
  Object.fromEntries(DRAWING_TOOLS.map((tool) => [tool.id, tool])),
) as Readonly<Record<DrawKind, RegisteredDrawingTool>>;

export const DRAWING_TOOL_IDS = DRAWING_TOOLS.map((tool) => tool.id) as readonly DrawKind[];
export const DRAWING_TOOL_ID_SET: ReadonlySet<DrawKind> = new Set(DRAWING_TOOL_IDS);

export const SINGLE_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.creation.pointCount === 1).map((tool) => tool.id),
);
export const TWO_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.creation.pointCount === 2).map((tool) => tool.id),
);
export const MULTI_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.creation.gesture === "multi-click").map((tool) => tool.id),
);
export const STYLEABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS
    .filter((tool) => tool.capabilities.some((capability) =>
      capability === "stroke" || capability === "width" || capability === "dash" || capability === "fill",
    ))
    .map((tool) => tool.id),
);
export const FILLABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.capabilities.includes("fill")).map((tool) => tool.id),
);
export const EXTENDABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.capabilities.includes("extend")).map((tool) => tool.id),
);
export const MEASUREMENT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((tool) => tool.capabilities.includes("measurement")).map((tool) => tool.id),
);

export const DRAWING_SHORTCUT_BY_CODE = Object.freeze(
  Object.fromEntries(
    DRAWING_TOOLS
      .filter((tool) => tool.shortcut)
      .map((tool) => [tool.shortcut!.code, tool.id]),
  ),
) as Readonly<Record<string, DrawKind>>;

export function isDrawingToolId(value: unknown): value is DrawKind {
  return typeof value === "string" && DRAWING_TOOL_ID_SET.has(value as DrawKind);
}

export function getDrawingTool(value: unknown): RegisteredDrawingTool | undefined {
  return isDrawingToolId(value) ? DRAWING_TOOL_BY_ID[value] : undefined;
}

export function drawingToolSupports(kind: unknown, capability: DrawingToolCapability): boolean {
  return getDrawingTool(kind)?.capabilities.includes(capability) ?? false;
}

export type DrawingShortcutEvent = {
  code: string;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
};

export function drawingToolFromShortcut(event: DrawingShortcutEvent): DrawKind | null {
  const kind = DRAWING_SHORTCUT_BY_CODE[event.code];
  if (!kind) return null;
  const shortcut = DRAWING_TOOL_BY_ID[kind].shortcut;
  if (!shortcut) return null;
  const matches =
    Boolean(event.altKey) === Boolean(shortcut.altKey)
    && Boolean(event.shiftKey) === Boolean(shortcut.shiftKey)
    && Boolean(event.metaKey) === Boolean(shortcut.metaKey)
    && Boolean(event.ctrlKey) === Boolean(shortcut.ctrlKey);
  return matches ? kind : null;
}
