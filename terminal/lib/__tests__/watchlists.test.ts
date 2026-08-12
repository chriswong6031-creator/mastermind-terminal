import { beforeEach, describe, expect, it } from "vitest";
import {
  addSymbols,
  createList,
  deleteList,
  listWatchlists,
  mergeListSymbols,
  moveSymbols,
  normalizeListName,
  normalizeSection,
  normalizeSymbols,
  planWatchlistMigration,
  removeSymbols,
  renameList,
  resolveTargetList,
  type LocalWatchlist,
  type ServerWatchlist,
} from "@/lib/watchlists";
import { createFixtureDb, fixtureUserId, resetFixtureStores } from "@/lib/watchlistsFixtureDb";

// The fixture transport is the same in-memory store the Playwright dev server uses, so these unit
// tests and the e2e migration spec exercise ONE implementation of the service.
const db = () => createFixtureDb("unit");
const owner = fixtureUserId("unit");

beforeEach(() => resetFixtureStores());

describe("input normalization", () => {
  it("uppercases, trims, de-duplicates and refuses oversized batches", () => {
    expect(normalizeSymbols([" aapl ", "MSFT", "AAPL"])).toEqual(["AAPL", "MSFT"]);
    expect(normalizeSymbols("nem")).toEqual(["NEM"]);
    expect(normalizeSymbols(Array.from({ length: 501 }, (_, i) => `SYM${i}`))).toEqual([]);
    expect(normalizeSymbols(["\u0000bad"])).toEqual([]);
  });

  it("rejects control characters and over-long labels, and keeps name matching EXACT", () => {
    expect(normalizeSection(" China Bottoms ")).toBe("China Bottoms");
    expect(normalizeSection("\u0000bad")).toBeNull();
    expect(normalizeSection(undefined)).toBe("Watchlist");
    expect(normalizeListName("  Gold Miners ")).toBe("Gold Miners");
    expect(normalizeListName("x".repeat(81))).toBeNull();
    // The schema's unique (user_id,name) is case-sensitive — no case folding may creep in.
    expect(normalizeListName("ai")).not.toBe(normalizeListName("AI"));
  });
});

describe("list CRUD (the paths that did not exist before W1b)", () => {
  it("creates at max(position)+1, and a second create of the same name returns the same row", async () => {
    const first = await createList(db(), owner, "Gold Miners");
    expect(first.created).toBe(true);
    const second = await createList(db(), owner, "Gold Miners");
    expect(second.created).toBe(false);
    expect(second.list?.id).toBe(first.list?.id);

    const third = await createList(db(), owner, "Space");
    const lists = await listWatchlists(db(), owner);
    expect(lists.map((list) => list.name)).toEqual(["Default", "Gold Miners", "Space"]);
    expect(lists.map((list) => list.position)).toEqual([0, 1, 2]);
    expect(third.list?.id).toBe(lists[2].id);
  });

  it("renames, refuses a name clash, and 404s a list the caller does not own", async () => {
    const { list } = await createList(db(), owner, "Swing");
    expect(await renameList(db(), owner, list!.id, "Tactical")).toEqual({ ok: true });
    expect((await listWatchlists(db(), owner)).map((row) => row.name)).toEqual(["Default", "Tactical"]);

    expect(await renameList(db(), owner, list!.id, "Default")).toMatchObject({ ok: false, status: 409 });
    expect(await renameList(db(), owner, "someone-elses-list", "Mine")).toMatchObject({ ok: false, status: 404 });
    // Owner scoping: the same id under a different user is not reachable.
    expect(await renameList(db(), "another-user", list!.id, "Mine")).toMatchObject({ ok: false, status: 404 });
  });

  it("deletes a list and cascades its symbols, and refuses a list the caller does not own", async () => {
    const { list } = await createList(db(), owner, "Swing");
    await addSymbols(db(), list!.id, ["TSLA", "RIVN"], "Tactical");
    expect((await listWatchlists(db(), owner))[1].symbols).toHaveLength(2);

    expect(await deleteList(db(), "another-user", list!.id)).toMatchObject({ ok: false, status: 404 });
    expect(await deleteList(db(), owner, list!.id)).toEqual({ ok: true });
    const remaining = await listWatchlists(db(), owner);
    expect(remaining.map((row) => row.name)).toEqual(["Default"]);
    expect(remaining[0].symbols.map((row) => row.symbol)).not.toContain("TSLA");
  });
});

describe("symbol ops target a LIST, not 'the first row'", () => {
  it("adds a batch to the named list and leaves every sibling untouched", async () => {
    const { list } = await createList(db(), owner, "Gold Miners");
    const added = await addSymbols(db(), list!.id, ["NEM", "AEM", "GOLD"], "Miners");
    expect(added).toEqual({ ok: true, added: ["NEM", "AEM", "GOLD"] });

    const lists = await listWatchlists(db(), owner);
    expect(lists[0].name).toBe("Default");
    expect(lists[0].symbols.map((row) => row.symbol)).toEqual(["BTC-USD", "ETH-USD", "NVDA", "AAPL", "MSFT", "QQQ"]);
    expect(lists[1].symbols.map((row) => row.symbol)).toEqual(["NEM", "AEM", "GOLD"]);
    expect(lists[1].symbols.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("re-adding an existing batch is a no-op, and a partial batch appends only what is missing", async () => {
    const { list } = await createList(db(), owner, "Gold Miners");
    await addSymbols(db(), list!.id, ["NEM", "AEM"], "Miners");
    expect(await addSymbols(db(), list!.id, ["NEM", "AEM"], "Miners")).toEqual({ ok: true, added: [] });
    expect(await addSymbols(db(), list!.id, ["AEM", "GOLD"], "Miners")).toEqual({ ok: true, added: ["GOLD"] });
    const symbols = (await listWatchlists(db(), owner))[1].symbols;
    expect(symbols.map((row) => row.symbol)).toEqual(["NEM", "AEM", "GOLD"]);
    expect(symbols.map((row) => row.position)).toEqual([0, 1, 2]);
  });

  it("carries a per-symbol section so one request preserves a list's grouping", async () => {
    const { list } = await createList(db(), owner, "Mixed");
    await addSymbols(db(), list!.id, ["NEM", "BTC-USD"], "Miners", { "BTC-USD": "Crypto" });
    expect((await listWatchlists(db(), owner))[1].symbols).toEqual([
      { symbol: "NEM", section: "Miners", position: 0 },
      { symbol: "BTC-USD", section: "Crypto", position: 1 },
    ]);
  });

  it("removes and moves only within the targeted list", async () => {
    const { list } = await createList(db(), owner, "Swing");
    await addSymbols(db(), list!.id, ["NVDA", "AAPL"], "Tactical");
    await removeSymbols(db(), list!.id, ["NVDA"]);
    await moveSymbols(db(), list!.id, ["AAPL"], "Core");

    const lists = await listWatchlists(db(), owner);
    // Default still carries its own NVDA/AAPL rows — the sibling write did not reach them.
    expect(lists[0].symbols.map((row) => row.symbol)).toContain("NVDA");
    expect(lists[0].symbols.find((row) => row.symbol === "AAPL")?.section).toBe("Equities");
    expect(lists[1].symbols).toEqual([{ symbol: "AAPL", section: "Core", position: 1 }]);
  });

  it("resolves the target by id, by exact name, and falls back to the first list for pre-W1b calls", async () => {
    const { list } = await createList(db(), owner, "Swing");
    expect(await resolveTargetList(db(), owner, { listId: list!.id })).toMatchObject({ name: "Swing" });
    expect(await resolveTargetList(db(), owner, { listName: "Swing" })).toMatchObject({ id: list!.id });
    expect(await resolveTargetList(db(), owner, {})).toMatchObject({ name: "Default" });
    // Case-sensitive, and never silently redirected to another list.
    expect(await resolveTargetList(db(), owner, { listName: "swing" })).toBeNull();
    expect(await resolveTargetList(db(), "another-user", { listId: list!.id })).toBeNull();
  });
});

describe("planWatchlistMigration", () => {
  const local: LocalWatchlist[] = [
    { name: "Default", rows: [{ symbol: "AAPL", section: "Core" }] },
    { name: "Gold Miners", rows: [{ symbol: "NEM", section: "Miners" }, { symbol: "AEM", section: "Miners" }] },
    { name: "Space", rows: [{ symbol: "RKLB", section: "Growth" }] },
  ];
  const server: ServerWatchlist[] = [
    { id: "wl-default", name: "Default", position: 0, symbols: [{ symbol: "NVDA", section: "Equities", position: 0 }] },
    { id: "wl-gold", name: "Gold Miners", position: 1, symbols: [{ symbol: "NEM", section: "Miners", position: 0 }] },
  ];

  it("never plans Default, merges by exact name, creates what is missing at max+1", () => {
    const plan = planWatchlistMigration(local, server);
    expect(plan.skipped).toEqual(["Default"]);
    expect(plan.lists).toEqual([
      { name: "Gold Miners", createAtPosition: null, serverListId: "wl-gold", insert: [{ symbol: "AEM", section: "Miners" }] },
      { name: "Space", createAtPosition: 2, serverListId: null, insert: [{ symbol: "RKLB", section: "Growth" }] },
    ]);
  });

  it("is a NO-OP over the state it just produced (run-twice idempotency, marker ignored)", () => {
    const migrated: ServerWatchlist[] = [
      ...server.map((list) => list.name === "Gold Miners"
        ? { ...list, symbols: [...list.symbols, { symbol: "AEM", section: "Miners", position: 1 }] }
        : list),
      { id: "wl-space", name: "Space", position: 2, symbols: [{ symbol: "RKLB", section: "Growth", position: 0 }] },
    ];
    const plan = planWatchlistMigration(local, migrated, {});
    expect(plan.lists.every((item) => item.createAtPosition === null && item.insert.length === 0)).toBe(true);
    expect(plan.lists.map((item) => item.serverListId)).toEqual(["wl-gold", "wl-space"]);
  });

  it("retries ONLY the lists the marker did not record as successful", () => {
    const plan = planWatchlistMigration(local, server, { "Gold Miners": true, Space: false });
    expect(plan.skipped).toEqual(["Default", "Gold Miners"]);
    expect(plan.lists.map((item) => item.name)).toEqual(["Space"]);
  });

  it("keeps a server-only list out of the plan entirely — nothing deletes or renames it", () => {
    const withServerOnly: ServerWatchlist[] = [
      ...server,
      { id: "wl-other-device", name: "From Phone", position: 5, symbols: [] },
    ];
    const plan = planWatchlistMigration(local, withServerOnly);
    expect(plan.lists.map((item) => item.name)).not.toContain("From Phone");
    // The next created list still lands after the highest existing position.
    expect(plan.lists.find((item) => item.name === "Space")?.createAtPosition).toBe(6);
  });

  it("de-duplicates a local list against itself and against the server", () => {
    const plan = planWatchlistMigration(
      [{ name: "Gold Miners", rows: [{ symbol: "nem", section: "Miners" }, { symbol: "AEM", section: "Miners" }, { symbol: "AEM", section: "Other" }] }],
      server,
    );
    expect(plan.lists[0].insert).toEqual([{ symbol: "AEM", section: "Miners" }]);
  });
});

describe("mergeListSymbols (signed-in read model)", () => {
  it("server position wins for shared rows; local-only rows append in local order", () => {
    expect(mergeListSymbols(
      [{ symbol: "NEM", section: "Miners" }, { symbol: "AEM", section: "Miners" }],
      [{ symbol: "AEM", section: "Local" }, { symbol: "GOLD", section: "Pending" }],
    )).toEqual([
      { symbol: "NEM", section: "Miners" },
      { symbol: "AEM", section: "Miners" },
      { symbol: "GOLD", section: "Pending" },
    ]);
  });
});

describe("end-to-end service run-twice", () => {
  // The gate row in its most direct form: run the whole plan+apply loop twice over the same local
  // state and assert the server is byte-identical the second time.
  const local: LocalWatchlist[] = [
    { name: "Default", rows: [{ symbol: "AAPL", section: "Core" }] },
    { name: "Gold Miners", rows: [{ symbol: "NEM", section: "Miners" }, { symbol: "AEM", section: "Miners" }] },
  ];

  const migrate = async () => {
    const plan = planWatchlistMigration(local, await listWatchlists(db(), owner));
    for (const item of plan.lists) {
      let listId = item.serverListId;
      if (!listId) listId = (await createList(db(), owner, item.name)).list?.id ?? null;
      if (!listId) continue;
      await addSymbols(
        db(),
        listId,
        item.insert.map((row) => row.symbol),
        item.insert[0]?.section ?? "Watchlist",
        Object.fromEntries(item.insert.map((row) => [row.symbol, row.section])),
      );
    }
  };

  it("yields identical server state on the second run and never touches Default", async () => {
    await migrate();
    const first = await listWatchlists(db(), owner);
    await migrate();
    const second = await listWatchlists(db(), owner);
    expect(second).toEqual(first);
    expect(first.map((list) => list.name)).toEqual(["Default", "Gold Miners"]);
    // Default is the seeded server list, unchanged — the local Default's AAPL was never pushed
    // here, because TRAP-1 owns that list.
    expect(first[0].symbols.map((row) => row.symbol)).toEqual(["BTC-USD", "ETH-USD", "NVDA", "AAPL", "MSFT", "QQQ"]);
    expect(first[1].symbols).toEqual([
      { symbol: "NEM", section: "Miners", position: 0 },
      { symbol: "AEM", section: "Miners", position: 1 },
    ]);
  });
});
