export type ChartEventKind = "earnings" | "dividend" | "split";

export type ChartEvent = {
  id: string;
  kind: ChartEventKind;
  date: string;
  title: string;
  period?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueActual?: number | null;
  revenueEstimate?: number | null;
  surprisePct?: number | null;
  amount?: number | null;
  paymentDate?: string | null;
  ratio?: string | null;
};

type EventPreferences = {
  showEarnings?: boolean;
  showDividends?: boolean;
  showSplits?: boolean;
};

type JsonRecord = Record<string, unknown>;
export type ChartEventMarker = {
  id: string;
  time: string | number;
  position: "belowBar";
  shape: "circle";
  color: string;
  text: "E" | "D" | "S";
  size: number;
};

function record(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is JsonRecord => item != null) : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function isoDay(time: string | number): string {
  if (typeof time === "string" && /^\d{4}-\d{2}-\d{2}/.test(time)) return time.slice(0, 10);
  const n = typeof time === "number" ? time : Number(time);
  return Number.isFinite(n) ? new Date(n * 1000).toISOString().slice(0, 10) : "";
}

export function parseChartEvents(fund: unknown, prefs: EventPreferences): ChartEvent[] {
  const events: ChartEvent[] = [];
  const root = record(fund);
  const earnings = record(root?.earnings);
  const dividends = record(root?.dividends);
  if (prefs.showEarnings !== false) {
    for (const [index, item] of records(earnings?.q).entries()) {
      if (!item.report_date) continue;
      events.push({
        id: `event:earnings:${item.report_date}:${index}`,
        kind: "earnings",
        date: String(item.report_date).slice(0, 10),
        title: "Earnings & Revenue",
        period: optionalString(item.period) ?? optionalString(item.end),
        epsActual: finiteOrNull(item.eps_a),
        epsEstimate: finiteOrNull(item.eps_e),
        revenueActual: finiteOrNull(item.rev_a),
        revenueEstimate: finiteOrNull(item.rev_e),
        surprisePct: finiteOrNull(item.surp_pct),
      });
    }
  }
  if (prefs.showDividends !== false) {
    for (const [index, item] of records(dividends?.events).entries()) {
      if (!item.ex) continue;
      events.push({
        id: `event:dividend:${item.ex}:${index}`,
        kind: "dividend",
        date: String(item.ex).slice(0, 10),
        title: "Dividends",
        amount: finiteOrNull(item.amount),
        paymentDate: optionalString(item.pay) ?? null,
      });
    }
  }
  if (prefs.showSplits !== false) {
    for (const [index, item] of records(dividends?.splits).entries()) {
      if (!item.date) continue;
      events.push({
        id: `event:split:${item.date}:${index}`,
        kind: "split",
        date: String(item.date).slice(0, 10),
        title: `Split${item.ratio ? `: ${item.ratio}` : ""}`,
        ratio: item.ratio == null ? null : String(item.ratio),
      });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) ? n : null;
}

/**
 * Convert dated corporate events to lightweight-charts markers. Weekend/holiday events snap to
 * the nearest real bar within five calendar days, so markers never create synthetic x-axis data.
 */
export function buildEventMarkers(
  events: ChartEvent[],
  bars: { time: string | number }[],
): { markers: ChartEventMarker[]; byId: Map<string, ChartEvent> } {
  const markers: ChartEventMarker[] = [];
  const byId = new Map<string, ChartEvent>();
  if (!bars.length) return { markers, byId };

  const dayToTime = new Map<string, string | number>();
  for (const bar of bars) {
    const day = isoDay(bar.time);
    if (day && !dayToTime.has(day)) dayToTime.set(day, bar.time);
  }
  const days = [...dayToTime.keys()].sort();
  const firstMs = Date.parse(days[0] + "T00:00:00Z");
  const lastMs = Date.parse(days[days.length - 1] + "T00:00:00Z");

  for (const event of events) {
    const eventMs = Date.parse(event.date + "T00:00:00Z");
    if (!Number.isFinite(eventMs) || eventMs < firstMs - 5 * 864e5 || eventMs > lastMs + 5 * 864e5) continue;
    let day = dayToTime.has(event.date) ? event.date : "";
    if (!day) {
      let best = Infinity;
      for (const candidate of days) {
        const distance = Math.abs(Date.parse(candidate + "T00:00:00Z") - eventMs);
        if (distance < best) { best = distance; day = candidate; }
      }
      if (best > 5 * 864e5) continue;
    }
    const markerTime = dayToTime.get(day);
    if (markerTime == null) continue;
    const cfg: { color: string; text: ChartEventMarker["text"] } = event.kind === "earnings"
      ? { color: event.surprisePct != null && event.surprisePct < 0 ? "#f23645" : "#00a98f", text: "E" }
      : event.kind === "dividend"
        ? { color: "#2962ff", text: "D" }
        : { color: "#ff9800", text: "S" };
    markers.push({
      id: event.id,
      time: markerTime,
      position: "belowBar",
      shape: "circle",
      color: cfg.color,
      text: cfg.text,
      size: 1,
    });
    byId.set(event.id, event);
  }
  markers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  return { markers, byId };
}
