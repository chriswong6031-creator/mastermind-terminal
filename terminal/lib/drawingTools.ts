import type { Dash, DrawingExtend, DrawKind } from "@/lib/drawings";

/** The nine families documented by OpenMarket's Drawing Tools guide. */
export type DrawingToolGroupId =
  | "lines"
  | "fibonacci"
  | "patterns"
  | "forecasting"
  | "freehand"
  | "shapes"
  | "arrows"
  | "annotation"
  | "emoji";

export type DrawingCreationGesture = "point" | "drag" | "multi-click";
export type DrawingCreationFinish = "immediate" | "pointerup" | "double-click";
export type DrawingCreationMode =
  | "one-point"
  | "two-point"
  | "fixed-multi"
  | "variable-multi"
  | "freehand";
export type DrawingPointCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | "variable";
export type DrawingAnchorSpace = "data" | "pane";

export type DrawingToolCapability =
  | "stroke"
  | "width"
  | "dash"
  | "fill"
  | "opacity"
  | "extend"
  | "text"
  | "textInput"
  | "fontSize"
  | "measurement"
  | "riskReward";

/**
 * Declarative input contract for the creation state machine.
 *
 * `semanticPointCount` records tools such as Long Position and Burj that take a
 * two-anchor drag but derive additional editable geometry from those anchors.
 */
export type DrawingToolCreation = {
  mode: DrawingCreationMode;
  gesture: DrawingCreationGesture;
  pointCount: DrawingPointCount;
  minPoints: number;
  maxPoints: number;
  finish: DrawingCreationFinish;
  anchorSpace: DrawingAnchorSpace;
  semanticPointCount?: number;
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
  section: string;
  sectionKey: string;
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
const TEXT_DEFAULTS = {
  ...BASE_DEFAULTS,
  fontSize: 13,
} as const satisfies DrawingToolDefaults;
const NOTE_DEFAULTS = {
  ...TEXT_DEFAULTS,
  fillColor: BLUE,
  fillOpacity: 0.14,
} as const satisfies DrawingToolDefaults;

const LINE_CAPS = ["stroke", "width", "dash", "opacity"] as const;
const EXTEND_CAPS = [...LINE_CAPS, "extend"] as const;
const AREA_CAPS = [...LINE_CAPS, "fill"] as const;
const TEXT_CAPS = ["stroke", "opacity", "text", "fontSize"] as const;
const NOTE_CAPS = [...TEXT_CAPS, "fill"] as const;
const TEXT_INPUT_CAPS = [...TEXT_CAPS, "textInput"] as const;
const NOTE_INPUT_CAPS = [...NOTE_CAPS, "textInput"] as const;
const MEASURE_CAPS = ["stroke", "fill", "opacity", "measurement", "text"] as const;
const RISK_CAPS = [...MEASURE_CAPS, "riskReward"] as const;

const point = (anchorSpace: DrawingAnchorSpace = "data"): DrawingToolCreation => ({
  mode: "one-point",
  gesture: "point",
  pointCount: 1,
  minPoints: 1,
  maxPoints: 1,
  finish: "immediate",
  anchorSpace,
});
const drag = (
  semanticPointCount?: number,
  anchorSpace: DrawingAnchorSpace = "data",
): DrawingToolCreation => ({
  mode: "two-point",
  gesture: "drag",
  pointCount: 2,
  minPoints: 2,
  maxPoints: 2,
  finish: "pointerup",
  anchorSpace,
  ...(semanticPointCount ? { semanticPointCount } : {}),
});
const fixed = (
  pointCount: 3 | 4 | 5 | 6 | 7,
  semanticPointCount?: number,
): DrawingToolCreation => ({
  mode: "fixed-multi",
  gesture: "multi-click",
  pointCount,
  minPoints: pointCount,
  maxPoints: pointCount,
  finish: "immediate",
  anchorSpace: "data",
  ...(semanticPointCount ? { semanticPointCount } : {}),
});
const segmented = (minPoints = 2, maxPoints = 64): DrawingToolCreation => ({
  mode: "variable-multi",
  gesture: "multi-click",
  pointCount: "variable",
  minPoints,
  maxPoints,
  finish: "double-click",
  anchorSpace: "data",
});
const freehand = (): DrawingToolCreation => ({
  mode: "freehand",
  gesture: "drag",
  pointCount: "variable",
  minPoints: 2,
  maxPoints: 64,
  finish: "pointerup",
  anchorSpace: "data",
});
const alt = (code: string, label: string): DrawingToolShortcut => ({ code, label, altKey: true });

type ToolOptions = {
  capabilities?: readonly DrawingToolCapability[];
  defaults?: Readonly<DrawingToolDefaults>;
  shortcut?: Readonly<DrawingToolShortcut>;
};

function tool(
  id: DrawKind,
  label: string,
  labelKey: string,
  [section, sectionKey]: readonly [string, string],
  iconPath: string,
  creation: DrawingToolCreation,
  options: ToolOptions = {},
): DrawingToolDefinition {
  return {
    id,
    label,
    labelKey,
    section,
    sectionKey,
    iconPath,
    creation,
    capabilities: options.capabilities ?? LINE_CAPS,
    defaults: options.defaults ?? BASE_DEFAULTS,
    ...(options.shortcut ? { shortcut: options.shortcut } : {}),
  };
}

const I_LINE = "M4 20L20 4";
const I_RAY = "M4 20L20 4M17 7l3-3";
const I_HLINE = "M3 12h18";
const I_VLINE = "M12 3v18";
const I_CROSS = "M3 12h18M12 3v18";
const I_CHANNEL = "M4 17L17 4M7 20L20 7";
const I_FIB = "M3 5h18M3 9h18M3 15h18M3 19h18";
const I_PATTERN = "M3 7l4 10 4-7 4 8 6-12";
const I_RANGE = "M4 6h16v12H4z";
const I_CURVE = "M3 17c5-12 13 8 18-10";
const I_ARROW = "M5 19L19 5M13 5h6v6";
const I_TEXT = "M5 5h14M12 5v14";
const I_NOTE = "M5 4h14v16H5zM8 9h8M8 13h6";
const I_MARK = "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M8 10h.01M16 10h.01M8 15c2 2 6 2 8 0";

const SEC = {
  lines: ["Lines", "toolSectionLines"],
  channels: ["Channels", "toolSectionChannels"],
  pitchforks: ["Pitchforks", "toolSectionPitchforks"],
  fib: ["Fibonacci", "toolSectionFibonacci"],
  gann: ["Gann", "toolSectionGann"],
  chartPatterns: ["Chart Patterns", "toolSectionChartPatterns"],
  elliott: ["Elliott Waves", "toolSectionElliottWaves"],
  cycles: ["Cycles", "toolSectionCycles"],
  forecasting: ["Forecasting", "toolSectionForecasting"],
  volume: ["Volume-based", "toolSectionVolumeBased"],
  ranges: ["Ranges", "toolSectionRanges"],
  freehand: ["Freehand", "toolSectionFreehand"],
  shapes: ["Shapes", "toolSectionShapes"],
  curves: ["Curves", "toolSectionCurves"],
  arrows: ["Arrows", "toolSectionArrows"],
  stylized: ["Stylized", "toolSectionStylized"],
  text: ["Text and Notes", "toolSectionTextNotes"],
  labels: ["Labels", "toolSectionLabels"],
  content: ["Content", "toolSectionContent"],
  markers: ["Markers", "toolSectionMarkers"],
} as const;

const s = (section: keyof typeof SEC) => SEC[section];

/** Canonical 99-tool OpenMarket drawing catalog, grouped in documentation order. */
export const DRAWING_TOOL_REGISTRY: readonly DrawingToolGroup[] = [
  {
    id: "lines",
    label: "Lines, Channels & Pitchforks",
    labelKey: "toolGroupLines",
    iconPath: I_LINE,
    tools: [
      tool("trendline", "Trend Line", "toolTrendline", s("lines"), I_LINE, drag(), { shortcut: alt("KeyT", "Alt+T") }),
      tool("ray", "Ray", "toolRay", s("lines"), I_RAY, drag(), { capabilities: EXTEND_CAPS, defaults: { ...BASE_DEFAULTS, extend: "right" }, shortcut: alt("KeyJ", "Alt+J") }),
      tool("infoline", "Info Line", "toolInfoLine", s("lines"), "M4 19L19 4M8 17l9-9M7 7h.01", drag(), { capabilities: [...LINE_CAPS, "measurement", "text"] }),
      tool("extendedline", "Extended Line", "toolExtendedLine", s("lines"), "M2 22L22 2M2 22l3-1M22 2l-3 1", drag(), { capabilities: EXTEND_CAPS, defaults: { ...BASE_DEFAULTS, extend: "both" } }),
      tool("trendangle", "Trend Angle", "toolTrendAngle", s("lines"), "M4 20L20 8M4 20h16", drag(), { capabilities: [...LINE_CAPS, "measurement", "text"] }),
      tool("hline", "Horizontal Line", "toolHline", s("lines"), I_HLINE, point(), { shortcut: alt("KeyH", "Alt+H") }),
      tool("horizontalray", "Horizontal Ray", "toolHorizontalRay", s("lines"), "M3 12h17M17 9l3 3-3 3", point(), { capabilities: EXTEND_CAPS, defaults: { ...BASE_DEFAULTS, extend: "right" } }),
      tool("vline", "Vertical Line", "toolVline", s("lines"), I_VLINE, point(), { shortcut: alt("KeyV", "Alt+V") }),
      tool("crossline", "Cross Line", "toolCrossLine", s("lines"), I_CROSS, point(), { shortcut: alt("KeyC", "Alt+C") }),
      tool("channel", "Parallel Line", "toolParallelLine", s("channels"), I_CHANNEL, fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("regressiontrend", "Regression Trend", "toolRegressionTrend", s("channels"), "M3 18L21 6M3 14L18 4M6 21L21 10", drag(), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("flattopbottom", "Flat Top/Bottom", "toolFlatTopBottom", s("channels"), "M3 7h18M5 19l12-8", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("disjointchannel", "Disjoint Channel", "toolDisjointChannel", s("channels"), "M3 18L10 8M14 17l7-12", fixed(4), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("pitchfork", "Pitchfork", "toolPitchfork", s("pitchforks"), "M3 20L12 4M7 20l9-16M11 20l9-16", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("schiffpitchfork", "Schiff Pitchfork", "toolSchiffPitchfork", s("pitchforks"), "M3 19L12 6M7 20L16 7M11 20l9-13", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("modifiedschiffpitchfork", "Modified Schiff Pitchfork", "toolModifiedSchiffPitchfork", s("pitchforks"), "M3 18L11 5M8 20L16 7M13 20l8-13", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("insidepitchfork", "Inside Pitchfork", "toolInsidePitchfork", s("pitchforks"), "M5 20L12 4M9 20l7-16M13 20l7-16", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
    ],
  },
  {
    id: "fibonacci",
    label: "Fibonacci & Gann",
    labelKey: "toolGroupFibonacci",
    iconPath: I_FIB,
    tools: [
      tool("fib", "Fibonacci Retracement", "toolFib", s("fib"), I_FIB, drag(), { capabilities: [...AREA_CAPS, "text"], defaults: { ...AREA_DEFAULTS, dash: "dashed", fillOpacity: 0.07 }, shortcut: alt("KeyF", "Alt+F") }),
      tool("fibtrend", "Fibonacci Trend", "toolFibTrend", s("fib"), "M3 19L18 4M3 15h18M3 10h18", fixed(3), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("fibchannel", "Fib Channel", "toolFibChannel", s("fib"), "M3 18L15 5M6 21L18 8M9 21L21 10", fixed(3), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("fibtimezone", "Fib Time Zone", "toolFibTimeZone", s("fib"), "M4 3v18M8 3v18M14 3v18M21 3v18", drag(), { capabilities: [...LINE_CAPS, "text"] }),
      tool("fibspeedresistancefan", "Fib Speed Resistance Fan", "toolFibSpeedResistanceFan", s("fib"), "M3 20L21 4M3 20L21 10M3 20L21 16", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("trendbasedfibtime", "Trend-Based Fib Time", "toolTrendBasedFibTime", s("fib"), "M3 18L10 8M10 4v17M15 4v17M21 4v17", fixed(3), { capabilities: [...LINE_CAPS, "text"] }),
      tool("fibcircles", "Fib Circles", "toolFibCircles", s("fib"), "M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("fibspiral", "Fib Spiral", "toolFibSpiral", s("fib"), "M12 12c0-3 5-3 5 1 0 5-9 6-10 0-8 14-10 14-3", drag(), { capabilities: [...LINE_CAPS, "text"] }),
      tool("fibspeedresistancearcs", "Fib Speed Resistance Arcs", "toolFibSpeedResistanceArcs", s("fib"), "M4 20a8 8 0 0 1 8-8M4 20a14 14 0 0 1 14-14M4 20a19 19 0 0 1 19-19", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("fibwedge", "Fib Wedge", "toolFibWedge", s("fib"), "M4 20L20 7M4 20L13 3M4 20a12 12 0 0 1 12-9", fixed(3), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("pitchfan", "Pitchfan", "toolPitchfan", s("fib"), "M3 20L20 4M3 20L20 10M3 20L20 16M12 20V4", fixed(3), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("gannbox", "Gann Box", "toolGannBox", s("gann"), "M4 4h16v16H4zM4 20L20 4M4 12h16M12 4v16", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("gannsquarefixed", "Gann Square Fixed", "toolGannSquareFixed", s("gann"), "M5 5h14v14H5zM5 19L19 5M12 5v14M5 12h14", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("gannsquare", "Gann Square", "toolGannSquare", s("gann"), "M4 4h16v16H4zM4 4l16 16M20 4L4 20", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("gannfan", "Gann Fan", "toolGannFan", s("gann"), "M3 20L21 4M3 20L21 8M3 20L21 13M3 20h18", drag(), { capabilities: [...LINE_CAPS, "text"] }),
    ],
  },
  {
    id: "patterns",
    label: "Patterns, Elliott Waves & Cycles",
    labelKey: "toolGroupPatterns",
    iconPath: I_PATTERN,
    tools: [
      tool("xabcd", "XABCD Pattern", "toolXabcd", s("chartPatterns"), "M2 7l4 11 5-8 4 9 7-14", fixed(5), { capabilities: [...LINE_CAPS, "text"], defaults: { ...BASE_DEFAULTS, dash: "dotted" } }),
      tool("cypher", "Cypher Pattern", "toolCypher", s("chartPatterns"), "M2 8l5 10 5-13 4 12 6-9", fixed(5), { capabilities: [...LINE_CAPS, "text"] }),
      tool("headandshoulders", "Head and Shoulders", "toolHeadAndShoulders", s("chartPatterns"), "M2 18l3-7 3 4 4-11 4 11 3-4 3 7", fixed(7), { capabilities: [...LINE_CAPS, "text"] }),
      tool("abcd", "ABCD Pattern", "toolAbcd", s("chartPatterns"), "M3 7l5 11 5-8 8 9", fixed(4), { capabilities: [...LINE_CAPS, "text"] }),
      tool("trianglepattern", "Triangle Pattern", "toolTrianglePattern", s("chartPatterns"), "M3 5l9 15 9-15M5 9h14", fixed(4), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("threedrives", "Three Drives Pattern", "toolThreeDrives", s("chartPatterns"), "M2 18l3-10 3 8 3-12 3 10 3-8 2 11 3-9", fixed(7), { capabilities: [...LINE_CAPS, "text"] }),
      tool("elliottimpulse", "Elliott Impulse Wave", "toolElliottImpulse", s("elliott"), "M2 18l4-8 4 5 4-10 4 8 4-9", fixed(6), { capabilities: [...LINE_CAPS, "text"] }),
      tool("elliottcorrection", "Elliott Correction Wave", "toolElliottCorrection", s("elliott"), "M3 5l6 12 6-8 6 10", fixed(4), { capabilities: [...LINE_CAPS, "text"] }),
      tool("elliotttriangle", "Elliott Triangle Wave", "toolElliottTriangle", s("elliott"), "M2 7l4 11 4-9 4 7 4-5 4 3", fixed(6), { capabilities: [...LINE_CAPS, "text"] }),
      tool("elliottdoublecombo", "Elliott Double Combo", "toolElliottDoubleCombo", s("elliott"), "M3 6l6 12 6-10 6 8", fixed(4), { capabilities: [...LINE_CAPS, "text"] }),
      tool("elliotttriplecombo", "Elliott Triple Combo", "toolElliottTripleCombo", s("elliott"), "M2 6l4 12 4-9 4 8 4-7 4 6", fixed(6), { capabilities: [...LINE_CAPS, "text"] }),
      tool("cycliclines", "Cyclic Lines", "toolCyclicLines", s("cycles"), "M4 3v18M10 3v18M16 3v18M22 3v18", drag()),
      tool("timecycles", "Time Cycles", "toolTimeCycles", s("cycles"), "M4 12a4 8 0 1 0 8 0 4 8 0 1 0-8 0M12 12a4 8 0 1 0 8 0 4 8 0 1 0-8 0", drag()),
      tool("sineline", "Sine Line", "toolSineLine", s("cycles"), "M2 12c3-9 7-9 10 0s7 9 10 0", drag()),
    ],
  },
  {
    id: "forecasting",
    label: "Forecasting, Volume & Ranges",
    labelKey: "toolGroupForecasting",
    iconPath: I_RANGE,
    tools: [
      tool("longposition", "Long Position", "toolLongPosition", s("forecasting"), "M5 20V4M2 7l3-3 3 3M10 8h11M10 16h11", drag(3), { capabilities: RISK_CAPS, defaults: { ...AREA_DEFAULTS, color: "var(--up)", fillColor: "var(--up)", fillOpacity: 0.16 } }),
      tool("shortposition", "Short Position", "toolShortPosition", s("forecasting"), "M5 4v16M2 17l3 3 3-3M10 8h11M10 16h11", drag(3), { capabilities: RISK_CAPS, defaults: { ...AREA_DEFAULTS, color: "var(--down)", fillColor: "var(--down)", fillOpacity: 0.16 } }),
      tool("forecast", "Forecast", "toolForecast", s("forecasting"), "M3 18l7-7 4 3 7-10M17 4h4v4", drag(), { capabilities: [...LINE_CAPS, "text", "measurement"] }),
      tool("ghostfeed", "Ghost Feed", "toolGhostFeed", s("forecasting"), "M3 18l4-8 4 5 4-10 6 8", segmented(), { capabilities: [...LINE_CAPS, "text"], defaults: { ...BASE_DEFAULTS, dash: "dotted", opacity: 0.7 } }),
      tool("barpattern", "Bar Pattern", "toolBarPattern", s("forecasting"), "M4 7v12M2 10h4M10 4v15M8 7h4M16 9v11M14 14h4", drag(), { capabilities: [...LINE_CAPS, "text"] }),
      tool("sector", "Sector", "toolSector", s("forecasting"), "M4 20L20 12A16 16 0 0 0 4 4z", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("anchoredvwap", "Anchored VWAP", "toolAnchoredVwap", s("volume"), "M4 5v14M4 12c4-5 8 5 16 0", point(), { capabilities: [...LINE_CAPS, "text"] }),
      tool("fixedrangevolumeprofile", "Fixed Range Volume Profile", "toolFixedRangeVolumeProfile", s("volume"), "M4 5v14M4 7h8M4 11h15M4 15h11M4 19h5", drag(), { capabilities: [...AREA_CAPS, "text"], defaults: AREA_DEFAULTS }),
      tool("pricerange", "Price Range", "toolPriceRange", s("ranges"), "M6 4v16M3 7l3-3 3 3M3 17l3 3 3-3M11 6h10M11 18h10", drag(), { capabilities: MEASURE_CAPS, defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 } }),
      tool("daterange", "Date Range", "toolDateRange", s("ranges"), "M4 6h16v14H4zM4 10h16M8 3v6M16 3v6", drag(), { capabilities: MEASURE_CAPS, defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 } }),
      tool("dateandpricerange", "Date and Price Range", "toolDateAndPriceRange", s("ranges"), "M4 5h16v15H4zM4 10h16M10 5v15", drag(), { capabilities: MEASURE_CAPS, defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 } }),
      tool("measure", "Measure", "toolMeasure", s("ranges"), "M3 9h18v6H3zM7 9v6M11 9v6M15 9v6", drag(), { capabilities: MEASURE_CAPS, defaults: { ...AREA_DEFAULTS, fillOpacity: 0.12 }, shortcut: alt("KeyM", "Alt+M") }),
    ],
  },
  {
    id: "freehand",
    label: "Freehand",
    labelKey: "toolGroupFreehand",
    iconPath: I_CURVE,
    tools: [
      tool("brush", "Brush", "toolBrush", s("freehand"), "M4 19c5-13 8 4 16-14", freehand()),
      tool("highlighter", "Highlighter", "toolHighlighter", s("freehand"), "M4 17c5-10 10 2 16-10M3 20h18", freehand(), { defaults: { ...BASE_DEFAULTS, width: 8, opacity: 0.28 } }),
      tool("path", "Path", "toolPath", s("freehand"), "M3 18l5-9 5 5 8-10", segmented()),
    ],
  },
  {
    id: "shapes",
    label: "Shapes & Curves",
    labelKey: "toolGroupShapes",
    iconPath: I_RANGE,
    tools: [
      tool("rect", "Rectangle", "toolRect", s("shapes"), I_RANGE, drag(), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS, shortcut: { ...alt("KeyR", "Alt+Shift+R"), shiftKey: true } }),
      tool("rotatedrect", "Rotated Rectangle", "toolRotatedRectangle", s("shapes"), "M6 3l15 8-6 11L0 14z", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("ellipse", "Ellipse", "toolEllipse", s("shapes"), "M3 12a9 6 0 1 0 18 0 9 6 0 1 0-18 0", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("circle", "Circle", "toolCircle", s("shapes"), "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18", drag(), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("triangle", "Triangle", "toolTriangle", s("shapes"), "M12 4L21 20H3z", fixed(3), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("polyline", "Polyline", "toolPolyline", s("curves"), "M3 18l5-10 5 6 8-11", segmented()),
      tool("arc", "Arc", "toolArc", s("curves"), "M3 18A15 15 0 0 1 21 6", fixed(3)),
      tool("curve", "Curve", "toolCurve", s("curves"), I_CURVE, drag(3)),
      tool("doublecurve", "Double Curve", "toolDoubleCurve", s("curves"), "M3 15c5-10 13 6 18-6M3 20c5-10 13 6 18-6", drag(4)),
    ],
  },
  {
    id: "arrows",
    label: "Arrows",
    labelKey: "toolGroupArrows",
    iconPath: I_ARROW,
    tools: [
      tool("arrowmarker", "Arrow Marker", "toolArrowMarker", s("arrows"), "M5 12h14M14 7l5 5-5 5", point(), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("arrow", "Arrow", "toolArrow", s("arrows"), I_ARROW, drag()),
      tool("arrowmarkleft", "Arrow Mark Left", "toolArrowMarkLeft", s("arrows"), "M20 12H4M9 7l-5 5 5 5", point()),
      tool("arrowmarkright", "Arrow Mark Right", "toolArrowMarkRight", s("arrows"), "M4 12h16M15 7l5 5-5 5", point()),
      tool("arrowmarktop", "Arrow Mark Top", "toolArrowMarkTop", s("arrows"), "M12 20V4M7 9l5-5 5 5", point()),
      tool("arrowmarkbottom", "Arrow Mark Bottom", "toolArrowMarkBottom", s("arrows"), "M12 4v16M7 15l5 5 5-5", point()),
      tool("flagmark", "Flag Mark", "toolFlagMark", s("arrows"), "M6 21V3M6 4h12l-3 5 3 5H6", point(), { capabilities: AREA_CAPS, defaults: AREA_DEFAULTS }),
      tool("momentum", "Momentum", "toolMomentum", s("stylized"), "M3 13h5l2-7 4 13 3-9h4", drag()),
      tool("flow", "Flow", "toolFlow", s("stylized"), "M3 8c5-6 7 8 13 1l5-5M17 4h4v4", drag()),
      tool("emphasis", "Emphasis", "toolEmphasis", s("stylized"), "M4 17L18 5M15 5h3v3M6 20L20 8", drag()),
      tool("whisper", "Whisper", "toolWhisper", s("stylized"), "M3 8c5-5 8 5 13 0M3 14c5-5 8 5 18-2", drag(), { defaults: { ...BASE_DEFAULTS, opacity: 0.55 } }),
      tool("subtle", "Subtle", "toolSubtle", s("stylized"), "M3 12c5-4 10 4 18 0", drag(), { defaults: { ...BASE_DEFAULTS, width: 1, opacity: 0.55 } }),
      tool("divergence", "Divergence", "toolDivergence", s("stylized"), "M3 17L20 6M3 7l17 10", drag(4)),
      tool("journey", "Journey", "toolJourney", s("stylized"), "M3 18c3-9 7 3 10-5s5-4 8-9", drag(6)),
      tool("fork", "Fork", "toolFork", s("stylized"), "M3 19l8-8M11 11L20 3M11 11l9 7", drag(5)),
      tool("threepaths", "3 Paths", "toolThreePaths", s("stylized"), "M3 20L20 4M3 14L15 4M9 20L21 10", drag(5)),
      tool("burj", "Burj", "toolBurj", s("stylized"), "M4 20l8-17 8 17M8 14h8M10 9h4", drag(3)),
    ],
  },
  {
    id: "annotation",
    label: "Text, Notes & Labels",
    labelKey: "toolGroupAnnotate",
    iconPath: I_TEXT,
    tools: [
      tool("text", "Text", "toolText", s("text"), I_TEXT, point(), { capabilities: TEXT_INPUT_CAPS, defaults: TEXT_DEFAULTS, shortcut: alt("KeyX", "Alt+X") }),
      tool("anchoredtext", "Anchored Text", "toolAnchoredText", s("text"), "M4 5h12M10 5v10M16 19h5M18.5 16.5v5", point("pane"), { capabilities: TEXT_INPUT_CAPS, defaults: TEXT_DEFAULTS }),
      tool("note", "Note", "toolNote", s("text"), I_NOTE, point(), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS, shortcut: alt("KeyN", "Alt+N") }),
      tool("anchorednote", "Anchored Note", "toolAnchoredNote", s("text"), "M4 4h12v14H4zM16 15l5 5M18 20h3v-3", point("pane"), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS }),
      tool("callout", "Callout", "toolCallout", s("text"), "M4 5h16v11H9l-5 4z", drag(), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS }),
      tool("pricelabel", "Price Label", "toolPriceLabel", s("labels"), "M4 8h12l4 4-4 4H4z", point(), { capabilities: NOTE_CAPS, defaults: NOTE_DEFAULTS }),
      tool("pricenote", "Price Note", "toolPriceNote", s("labels"), "M4 6h13l3 6-3 6H4zM8 10h7M8 14h5", point(), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS }),
      tool("signpost", "Signpost", "toolSignpost", s("labels"), "M6 3v18M6 6h13l-3 4 3 4H6", point(), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS }),
      tool("comment", "Comment", "toolComment", s("labels"), "M4 5h16v12H9l-5 4zM8 9h8M8 13h6", point(), { capabilities: NOTE_INPUT_CAPS, defaults: NOTE_DEFAULTS }),
      tool("image", "Image", "toolImage", s("content"), "M4 5h16v14H4zM6 16l4-5 3 3 3-4 2 6M8 9h.01", drag(), { capabilities: ["fill", "opacity"], defaults: AREA_DEFAULTS }),
    ],
  },
  {
    id: "emoji",
    label: "Emoji & Icons",
    labelKey: "toolGroupEmoji",
    iconPath: I_MARK,
    tools: [
      tool("emoji", "Emoji", "toolEmoji", s("markers"), I_MARK, point(), { capabilities: ["opacity"], defaults: BASE_DEFAULTS }),
      tool("icon", "Icon", "toolIcon", s("markers"), "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z", point(), { capabilities: ["stroke", "fill", "opacity"], defaults: AREA_DEFAULTS }),
    ],
  },
];

export const DRAWING_TOOL_GROUPS: readonly DrawingToolGroup[] = DRAWING_TOOL_REGISTRY;

export type RegisteredDrawingTool = DrawingToolDefinition & { groupId: DrawingToolGroupId };

export const DRAWING_TOOLS: readonly RegisteredDrawingTool[] = DRAWING_TOOL_REGISTRY.flatMap((group) =>
  group.tools.map((entry) => ({ ...entry, groupId: group.id })),
);

export const DRAWING_TOOL_BY_ID = Object.freeze(
  Object.fromEntries(DRAWING_TOOLS.map((entry) => [entry.id, entry])),
) as Readonly<Record<DrawKind, RegisteredDrawingTool>>;

export const DRAWING_TOOL_IDS = DRAWING_TOOLS.map((entry) => entry.id) as readonly DrawKind[];
export const DRAWING_TOOL_ID_SET: ReadonlySet<DrawKind> = new Set(DRAWING_TOOL_IDS);

export const SINGLE_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.creation.mode === "one-point").map((entry) => entry.id),
);
export const TWO_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.creation.mode === "two-point").map((entry) => entry.id),
);
export const MULTI_POINT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS
    .filter((entry) => entry.creation.mode === "fixed-multi" || entry.creation.mode === "variable-multi")
    .map((entry) => entry.id),
);
export const FREEHAND_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.creation.mode === "freehand").map((entry) => entry.id),
);
export const STYLEABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS
    .filter((entry) => entry.capabilities.some((capability) =>
      capability === "stroke" || capability === "width" || capability === "dash" || capability === "fill",
    ))
    .map((entry) => entry.id),
);
export const FILLABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.capabilities.includes("fill")).map((entry) => entry.id),
);
export const EXTENDABLE_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.capabilities.includes("extend")).map((entry) => entry.id),
);
export const MEASUREMENT_DRAWING_KINDS: ReadonlySet<DrawKind> = new Set(
  DRAWING_TOOLS.filter((entry) => entry.capabilities.includes("measurement")).map((entry) => entry.id),
);

export const DRAWING_SHORTCUT_BY_CODE = Object.freeze(
  Object.fromEntries(
    DRAWING_TOOLS
      .filter((entry) => entry.shortcut)
      .map((entry) => [entry.shortcut!.code, entry.id]),
  ),
) as Readonly<Record<string, DrawKind>>;

export function isDrawingToolId(value: unknown): value is DrawKind {
  return typeof value === "string" && DRAWING_TOOL_ID_SET.has(value as DrawKind);
}

export function getDrawingTool(value: unknown): RegisteredDrawingTool | undefined {
  return isDrawingToolId(value) ? DRAWING_TOOL_BY_ID[value] : undefined;
}

/**
 * Validates the durable point array, including semantic handles materialized by
 * drag-created tools after their two input anchors have been captured.
 */
export function drawingToolAcceptsPersistedPointCount(value: unknown, pointCount: number): boolean {
  const creation = getDrawingTool(value)?.creation;
  if (!creation || !Number.isInteger(pointCount)) return false;
  const maxPersistedPoints = Math.max(
    creation.maxPoints,
    creation.semanticPointCount ?? creation.maxPoints,
  );
  return pointCount >= creation.minPoints && pointCount <= maxPersistedPoints;
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
