import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createTeam,
  inviteTokenHash,
  isAbsentTableError,
  listTeams,
  newInviteToken,
  normalizeEmail,
  normalizeRole,
  normalizeTeamName,
  type TenancyDb,
} from "@/lib/teams";

function fakeDb(responder: (table: string, calls: string[]) => { data?: unknown; error?: { code?: string; message?: string } | null }): TenancyDb {
  const captured: { table: string; calls: string[]; payload?: unknown }[] = [];
  const make = (table: string, calls: string[] = []): any => {
    const q: any = {
      select: (_f?: string) => make(table, [...calls, "select"]),
      eq: (_c: string, _v: unknown) => make(table, [...calls, "eq"]),
      in: (_c: string, _v: unknown) => make(table, [...calls, "in"]),
      order: (_c: string, _o?: unknown) => make(table, [...calls, "order"]),
      limit: (_n: number) => make(table, [...calls, "limit"]),
      insert: (values: unknown) => {
        captured.push({ table, calls: [...calls, "insert"], payload: values });
        (q as any).__lastInsert = values;
        return make(table, [...calls, "insert"]);
      },
      maybeSingle: async () => responder(table, [...calls, "maybeSingle"]),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(responder(table, calls)).then(resolve),
    };
    (q as any).__captured = captured;
    return q;
  };
  return { from: (table: string) => make(table) } as unknown as TenancyDb;
}

describe("normalizeTeamName", () => {
  it("accepts a trimmed name", () => expect(normalizeTeamName("  Desk  ")).toBe("Desk"));
  it("rejects empty", () => expect(normalizeTeamName("")).toBeNull());
  it("rejects 121 chars", () => expect(normalizeTeamName("a".repeat(121))).toBeNull());
  it("rejects control chars", () => expect(normalizeTeamName("a\x00b")).toBeNull());
});

describe("normalizeRole", () => {
  it("lowercases", () => expect(normalizeRole("Owner")).toBe("owner"));
  it("rejects unknown role", () => expect(normalizeRole("superuser")).toBeNull());
});

describe("normalizeEmail", () => {
  it("rejects missing domain dot", () => expect(normalizeEmail("a@b")).toBeNull());
  it("trims and lowercases", () => expect(normalizeEmail("A@B.co ")).toBe("a@b.co"));
});

describe("invite tokens", () => {
  it("hash is 64 hex chars and stable", () => {
    const h = inviteTokenHash("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(inviteTokenHash("abc")).toBe(h);
  });
  it("tokens differ across calls", () => {
    expect(newInviteToken()).not.toBe(newInviteToken());
  });
});

describe("isAbsentTableError", () => {
  it("true for 42P01 and PGRST205", () => {
    expect(isAbsentTableError({ code: "42P01" })).toBe(true);
    expect(isAbsentTableError({ code: "PGRST205" })).toBe(true);
  });
  it("false for other codes, null, and codeless message", () => {
    expect(isAbsentTableError({ code: "42501" })).toBe(false);
    expect(isAbsentTableError(null)).toBe(false);
    expect(isAbsentTableError({ message: "relation does not exist" })).toBe(false);
  });
});

describe("listTeams error classification", () => {
  it("42P01 -> unavailable", async () => {
    const db = fakeDb(() => ({ data: null, error: { code: "42P01" } }));
    const r = await listTeams(db, "u1");
    expect(r).toEqual({ ok: false, reason: "unavailable", error: expect.any(String) });
  });
  it("08006 -> failed", async () => {
    const db = fakeDb(() => ({ data: null, error: { code: "08006" } }));
    const r = await listTeams(db, "u1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("failed");
  });
  it("malformed data -> failed, never ok:true with []", async () => {
    const db = fakeDb(() => ({ data: {} as unknown }));
    const r = await listTeams(db, "u1");
    expect(r.ok).toBe(false);
  });
});

describe("createTeam insert payload", () => {
  it("is exactly {name, created_by}, ignoring caller-supplied created_by/role", async () => {
    let captured: any = null;
    const db: TenancyDb = {
      from: (_table: string) => {
        const q: any = {
          insert: (values: unknown) => {
            captured = values;
            return q;
          },
          select: () => q,
          maybeSingle: async () => ({ data: { id: "t1", name: "Desk", created_at: "now" }, error: null }),
        };
        return q;
      },
    } as unknown as TenancyDb;
    const r = await createTeam(db, "session-user", "Desk");
    expect(r.ok).toBe(true);
    expect(captured).toEqual({ name: "Desk", created_by: "session-user" });
  });
});

describe("0014 DDL contract", () => {
  const sqlPath = path.join(__dirname, "..", "..", "..", "supabase", "migrations", "0014_tenancy_foundation.sql");
  const raw = readFileSync(sqlPath, "utf8");
  const noComments = raw.replace(/--.*$/gm, "");
  const flat = noComments.replace(/\s+/g, " ").toLowerCase().trim();

  it("creates exactly teams, team_members, team_invites", () => {
    const created = [...noComments.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(["team_invites", "team_members", "teams"].sort());
  });
  it("has unique (team_id, user_id)", () => {
    expect(flat).toContain("unique (team_id, user_id)");
  });
  it("role check lists exactly owner, admin, member on team_members", () => {
    expect(flat).toContain("role text not null check (role in ('owner','admin','member'))");
  });
  it("enables RLS three times", () => {
    expect((noComments.match(/enable row level security/g) || []).length).toBe(3);
  });
  it("every create policy carries to authenticated", () => {
    const policies = [...noComments.matchAll(/create policy [\s\S]*?;/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) expect(p[0]).toContain("to authenticated");
  });
  it("revokes from anon and authenticated, grants nothing to anon", () => {
    expect(flat).toContain("revoke all on table public.teams, public.team_members, public.team_invites from anon, authenticated");
    expect(flat).not.toMatch(/grant [^;]*to anon/);
  });
  it("both helper functions are security definer with search_path set", () => {
    const fns = [...noComments.matchAll(/create or replace function public\.(is_team_member|team_role)[\s\S]*?\$\$;/g)];
    expect(fns.length).toBe(2);
    for (const fn of fns) {
      expect(fn[0]).toContain("security definer");
      expect(fn[0]).toContain("set search_path = pg_catalog, public, auth");
    }
  });
  it("drop-then-create trigger pair present", () => {
    expect(flat).toContain("drop trigger if exists on_team_created on public.teams");
    expect(flat).toContain("create trigger on_team_created after insert on public.teams");
  });
  it("contains begin;, commit;, -- down: and -- readback:", () => {
    expect(raw).toMatch(/^begin;/m);
    expect(raw).toMatch(/^commit;/m);
    expect(raw).toContain("-- down:");
    expect(raw).toContain("-- readback:");
  });
  it("every create table is if not exists and every create policy preceded by drop policy if exists", () => {
    const tableStatements = [...noComments.matchAll(/create table[^;]*;/g)];
    for (const t of tableStatements) expect(t[0]).toContain("if not exists");
    const lines = noComments.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("create policy")) {
        expect(lines[i - 1]).toMatch(/^drop policy if exists/);
      }
    }
  });
});
