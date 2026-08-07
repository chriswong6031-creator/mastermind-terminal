import { describe, expect, it } from "vitest";
import {
  DRAWING_OUTBOX_KEY,
  readDrawingOutbox,
  writeDrawingOutbox,
} from "@/lib/drawingOutbox";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const line = (id: string) => ({
  id,
  kind: "hline" as const,
  source: "user" as const,
  points: [{ t: "2026-01-01", p: 100 }],
});

describe("account drawing recovery outbox", () => {
  it("keeps account namespaces isolated and clears only the requested owner", () => {
    const storage = new MemoryStorage();
    expect(writeDrawingOutbox(storage, "account:a@example.com", { NVDA: [line("a")] })).toBe(true);
    expect(writeDrawingOutbox(storage, "account:b@example.com", { AAPL: [line("b")] })).toBe(true);

    expect(readDrawingOutbox(storage, "account:a@example.com").NVDA?.[0].id).toBe("a");
    expect(readDrawingOutbox(storage, "account:b@example.com").AAPL?.[0].id).toBe("b");
    expect(readDrawingOutbox(storage, "guest")).toEqual({});

    expect(writeDrawingOutbox(storage, "account:a@example.com", {})).toBe(true);
    expect(readDrawingOutbox(storage, "account:a@example.com")).toEqual({});
    expect(readDrawingOutbox(storage, "account:b@example.com").AAPL?.[0].id).toBe("b");
  });

  it("fails closed on corrupt persisted content", () => {
    const storage = new MemoryStorage();
    storage.setItem(DRAWING_OUTBOX_KEY, "not-json");
    expect(readDrawingOutbox(storage, "account:a@example.com")).toEqual({});
  });

  it("persists an empty collection as a clear-all tombstone", () => {
    const storage = new MemoryStorage();
    expect(writeDrawingOutbox(storage, "account:a@example.com", { NVDA: [] })).toBe(true);
    expect(readDrawingOutbox(storage, "account:a@example.com")).toEqual({ NVDA: [] });
  });
});
