"use client";
// Chart template persistence — stores named snapshots of indicator set + indicator params
// beside the user's layouts in localStorage.
// Format: { id, name, indicators: string[], indParams: Record<string,any>, createdAt: string }

export type ChartTemplate = {
  id: string;
  name: string;
  indicators: string[];
  indParams: Record<string, any>;
  createdAt: string;
};

const KEY = "mm.chartTemplates";

const read = (): ChartTemplate[] => {
  try { const v = localStorage.getItem(KEY); return v ? (JSON.parse(v) as ChartTemplate[]) : []; } catch { return []; }
};
const write = (list: ChartTemplate[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
};
const gid = () => "ct_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function listTemplates(): ChartTemplate[] { return read(); }

export function saveTemplate(name: string, indicators: string[], indParams: Record<string, any>): ChartTemplate {
  const list = read();
  const existing = list.find((t) => t.name === name);
  if (existing) {
    existing.indicators = indicators;
    existing.indParams = indParams;
    existing.createdAt = new Date().toISOString();
    write(list);
    return existing;
  }
  const t: ChartTemplate = { id: gid(), name, indicators, indParams, createdAt: new Date().toISOString() };
  write([...list, t]);
  return t;
}

export function deleteTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}

export function renameTemplate(id: string, newName: string): void {
  const list = read();
  const t = list.find((x) => x.id === id);
  if (t) { t.name = newName; write(list); }
}
