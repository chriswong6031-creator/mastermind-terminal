// ── W2-A revision/CAS law (contract §4/§5/§6), proved against the REAL fixture store ────────────
// `createLayoutFixtureDb` models the same invariants the post-0008 schema gives production
// (`unique(user_id,name)`, atomic conditional UPDATE via JSON-path filters) — see the extended
// matcher in `lib/layoutsFixtureDb.ts`. These are not scripted-response unit tests: the store is a
// real (if in-memory) implementation of the CAS semantics, so a `saveWorkspace` that merely did
// "read current revision, then blindly write" would be caught here, not waved through by a mock.
import { describe, expect, it } from "vitest";
import { listLayouts, renameWorkspace, saveLayout, saveWorkspace, duplicateWorkspace } from "../layouts";
import { createLayoutFixtureDb, fixtureLayoutUserId, pokeLayoutFixtureRow } from "../layoutsFixtureDb";
import { SCHEMA, type WorkspaceEnvelope } from "../workspaceLayout";

function envelope(marker: string): WorkspaceEnvelope {
  return {
    schema: SCHEMA, requires: { floor: 1 }, revision: 1, name: null,
    link_groups: { primary_security: { entity_type: "security" } },
    widgets: [{
      id: "chart-main", type: "chart", semantic_lane: "primary",
      context_in: ["primary_security"], context_out: ["primary_security"],
      config: { panes: [marker] },
    }],
    migration: { source: "none", source_revision: null },
  };
}

const configOf = (result: { ok: boolean; layouts?: Array<{ name: string; config: unknown }> }, name: string) =>
  (result.ok ? result.layouts?.find((l) => l.name === name)?.config : undefined) as
    { revision: number; widgets: Array<{ config: { panes: string[] } }> } | undefined;

describe("saveWorkspace — revision law", () => {
  it("a repeated READ never changes revision", async () => {
    const key = "persist-read";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Swing", envelope("AAA"), null);

    await listLayouts(db, user);
    await listLayouts(db, user);
    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Swing")?.revision).toBe(1);
  });

  it("one semantic mutation bumps revision exactly once", async () => {
    const key = "persist-bump";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    const created = await saveWorkspace(db, user, "Swing", envelope("AAA"), null);
    expect(created).toEqual({ ok: true, id: expect.any(String), revision: 1 });

    const saved = await saveWorkspace(db, user, "Swing", envelope("BBB"), 1);
    expect(saved).toEqual({ ok: true, id: created.ok ? created.id : "", revision: 2 });

    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Swing")?.revision).toBe(2);
    expect(configOf(listed, "Swing")?.widgets[0].config.panes).toEqual(["BBB"]);
  });

  it("a retry of the SAME logical write cannot double-apply", async () => {
    const key = "persist-retry";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Swing", envelope("AAA"), null); // revision 1

    // Two "retries" of the identical logical write (same expectedRevision=1, same intended payload)
    // — as an HTTP client retry would send after a dropped response.
    const first = await saveWorkspace(db, user, "Swing", envelope("BBB"), 1);
    const second = await saveWorkspace(db, user, "Swing", envelope("BBB"), 1);

    expect(first).toEqual({ ok: true, id: expect.any(String), revision: 2 });
    // The retry's expectedRevision (1) is now stale — the WHERE clause consumed it on the first
    // application, so the retry cannot apply a second time. This is the proof it is a real
    // conditional statement, not "read the old revision, then write blindly".
    expect(second).toEqual({ ok: false, reason: "stale_revision" });

    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Swing")?.revision).toBe(2); // NOT 3 — the retry never re-applied
  });

  it("a stale expectedRevision is refused; the newer data is left intact", async () => {
    const key = "persist-stale";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Swing", envelope("AAA"), null); // revision 1
    await saveWorkspace(db, user, "Swing", envelope("BBB"), 1);    // revision 2 (the "newer" write)

    const stale = await saveWorkspace(db, user, "Swing", envelope("STALE-ATTEMPT"), 1);
    expect(stale).toEqual({ ok: false, reason: "stale_revision" });

    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Swing")?.revision).toBe(2);
    expect(configOf(listed, "Swing")?.widgets[0].config.panes).toEqual(["BBB"]); // untouched
  });

  it("not_found when the row is gone (0 rows updated, no row on the follow-up read)", async () => {
    const key = "persist-notfound";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    const result = await saveWorkspace(db, user, "Ghost", envelope("AAA"), 1);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("CAS refuses a write when a concurrent writer's mutation lands BETWEEN the caller's read and its own write", async () => {
    // This is the read-then-write CHEATING proof: a naive implementation that reads the current
    // revision once and then unconditionally writes "revision+1" would succeed here and silently
    // clobber the concurrent writer's content. `saveWorkspace` must instead refuse, because the
    // actual UPDATE statement re-checks `config->>revision` against the row's CURRENT state at
    // write time, not against what the caller believed it was.
    const key = "persist-interleave";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Swing", envelope("AAA"), null); // revision 1

    // The caller "read" revision 1 (e.g. via an earlier GET) and is about to save expecting 1.
    const callerBelievedRevision = 1;

    // A single-threaded Node process cannot produce a REAL race, so the interleaving is
    // manufactured directly: a concurrent device's write lands between the caller's read and its
    // own write, poking the store directly (bypassing the service, exactly as an out-of-band
    // Postgres row change would).
    pokeLayoutFixtureRow(key, user, "Swing", {
      config: { ...envelope("CONCURRENT-DEVICE"), revision: 2 },
      updated_at: new Date().toISOString(),
    });

    const result = await saveWorkspace(db, user, "Swing", envelope("CALLERS-STALE-WRITE"), callerBelievedRevision);
    expect(result).toEqual({ ok: false, reason: "stale_revision" });

    // The concurrent device's write is untouched — the refused write never applied.
    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Swing")?.revision).toBe(2);
    expect(configOf(listed, "Swing")?.widgets[0].config.panes).toEqual(["CONCURRENT-DEVICE"]);
  });
});

describe("saveWorkspace — concurrent create cannot mint a duplicate (user, name)", () => {
  it("two simultaneous creates of the same brand-new name: exactly one wins", async () => {
    const key = "persist-concurrent-create";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);

    const [a, b] = await Promise.all([
      saveWorkspace(db, user, "Swing", envelope("FROM-A"), null),
      saveWorkspace(db, user, "Swing", envelope("FROM-B"), null),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ reason: "name_conflict" });

    const listed = await listLayouts(db, user);
    expect(listed.ok && listed.layouts.filter((l) => l.name === "Swing")).toHaveLength(1);
  });
});

describe("saveWorkspace — concurrent migrate-on-write conversion of the SAME legacy row", () => {
  it("only one writer converts the row; the other sees stale_revision, never a duplicate row", async () => {
    const key = "persist-migrate-race";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    // Seed a legacy (non-workspace) row under this name via the EXISTING legacy save path.
    await saveLayout(db, user, { name: "Legacy", config: { schemaVersion: 2, panes: ["AAPL"] } });

    const [a, b] = await Promise.all([
      saveWorkspace(db, user, "Legacy", envelope("CONVERTED-BY-A"), null),
      saveWorkspace(db, user, "Legacy", envelope("CONVERTED-BY-B"), null),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = [a, b].find((r) => !r.ok);
    expect(loser).toMatchObject({ reason: "stale_revision" });

    const listed = await listLayouts(db, user);
    const rows = listed.ok ? listed.layouts.filter((l) => l.name === "Legacy") : [];
    expect(rows).toHaveLength(1); // never a duplicate row under the same name
    const config = rows[0]?.config as { widgets: Array<{ config: { panes: string[] } }> };
    // Whichever writer won, its content is what survived — never a blend, never both.
    const winnerMarker = a.ok ? "CONVERTED-BY-A" : "CONVERTED-BY-B";
    expect(config.widgets[0].config.panes).toEqual([winnerMarker]);
  });
});

describe("renameWorkspace", () => {
  it("atomically renames and bumps revision, fenced by expectedRevision", async () => {
    const key = "persist-rename";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Old Name", envelope("AAA"), null); // revision 1

    const renamed = await renameWorkspace(db, user, "Old Name", "New Name", 1);
    expect(renamed).toEqual({ ok: true, revision: 2 });

    const listed = await listLayouts(db, user);
    expect(listed.ok && listed.layouts.some((l) => l.name === "Old Name")).toBe(false);
    expect(configOf(listed, "New Name")?.revision).toBe(2);
  });

  it("name_conflict when the target name is already taken", async () => {
    const key = "persist-rename-conflict";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "A", envelope("AAA"), null);
    await saveWorkspace(db, user, "B", envelope("BBB"), null);

    const result = await renameWorkspace(db, user, "A", "B", 1);
    expect(result).toEqual({ ok: false, reason: "name_conflict" });

    // Neither row was mutated by the refused rename.
    const listed = await listLayouts(db, user);
    expect(listed.ok && listed.layouts.some((l) => l.name === "A")).toBe(true);
    expect(configOf(listed, "B")?.widgets[0].config.panes).toEqual(["BBB"]);
  });

  it("stale_revision when the row moved under the caller", async () => {
    const key = "persist-rename-stale";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "A", envelope("AAA"), null); // revision 1
    await saveWorkspace(db, user, "A", envelope("BBB"), 1);    // revision 2

    const result = await renameWorkspace(db, user, "A", "A2", 1);
    expect(result).toEqual({ ok: false, reason: "stale_revision" });
    const listed = await listLayouts(db, user);
    expect(listed.ok && listed.layouts.some((l) => l.name === "A")).toBe(true);
  });

  it("not_found when the source row does not exist", async () => {
    const key = "persist-rename-notfound";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    const result = await renameWorkspace(db, user, "Ghost", "New", 1);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("duplicateWorkspace — independence", () => {
  it("resets revision to 1 and copies the payload", async () => {
    const key = "persist-duplicate";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Source", envelope("ORIGINAL"), null);
    await saveWorkspace(db, user, "Source", envelope("ORIGINAL-V2"), 1); // revision 2

    const dup = await duplicateWorkspace(db, user, "Source", "Source copy");
    expect(dup).toEqual({ ok: true, id: expect.any(String), name: "Source copy" });

    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Source copy")?.revision).toBe(1);
    expect(configOf(listed, "Source copy")?.widgets[0].config.panes).toEqual(["ORIGINAL-V2"]);
  });

  it("editing the source AFTER duplicating leaves the duplicate unchanged", async () => {
    const key = "persist-duplicate-independence";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Source", envelope("BEFORE-DUP"), null);
    const dup = await duplicateWorkspace(db, user, "Source", "Copy");
    expect(dup.ok).toBe(true);

    await saveWorkspace(db, user, "Source", envelope("AFTER-DUP"), 1);

    const listed = await listLayouts(db, user);
    expect(configOf(listed, "Source")?.widgets[0].config.panes).toEqual(["AFTER-DUP"]);
    expect(configOf(listed, "Copy")?.widgets[0].config.panes).toEqual(["BEFORE-DUP"]);
  });

  it("mints a collision-free name when none is supplied", async () => {
    const key = "persist-duplicate-autoname";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    await saveWorkspace(db, user, "Source", envelope("AAA"), null);
    const dup = await duplicateWorkspace(db, user, "Source");
    expect(dup.ok).toBe(true);
    expect(dup.ok && dup.name).not.toBe("Source");
  });

  it("not_found when the source does not exist", async () => {
    const key = "persist-duplicate-notfound";
    const db = createLayoutFixtureDb(key);
    const user = fixtureLayoutUserId(key);
    const result = await duplicateWorkspace(db, user, "Ghost");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
