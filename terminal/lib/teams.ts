// Tenancy foundation service (packet B-F12-1).
//
// Shape authority is `supabase/migrations/0014_tenancy_foundation.sql` (NOT yet applied — see its
// header). Structural narrowing follows `lib/watchlists.ts` / `lib/portfolio.ts`: the same
// `WatchlistDb` shape backs the real Supabase client, the e2e fixture transport, and unit tests.
//
// Absence is a FACT, never an empty result (lib/portfolio.ts:233-241 idiom): any read error is
// classified into `"unavailable"` (table/schema-cache absent) or `"failed"` (anything else) and
// NEVER collapsed into `{ok:true, teams:[]}`.
//
// Belt-and-braces owner scoping: RLS is the authority; every query here also carries an explicit
// `.eq("user_id", userId)` / `.eq("team_id", teamId)` filter.
//
// TWO-ORGANISMS LAW (UWP-R2): teams grant nothing. Entitlement authority remains macro-api;
// nothing here reads or writes `profiles.is_pro`.

import crypto from "node:crypto";
import type { DbResult, DbRow, WatchlistDb } from "@/lib/watchlists";

export type TenancyDb = WatchlistDb;
export type TeamRole = "owner" | "admin" | "member";
export type Team = { id: string; name: string; role: TeamRole; createdAt: string | null };
export type Member = { userId: string; role: TeamRole; invitedBy: string | null; createdAt: string | null };
export type Invite = { id: string; email: string; role: TeamRole; expiresAt: string | null; acceptedAt: string | null };

export const TEAMS_TABLE = "teams";
export const TEAM_MEMBERS_TABLE = "team_members";
export const TEAM_INVITES_TABLE = "team_invites";
export const MAX_TEAM_NAME_LEN = 120;
export const MAX_TEAMS = 200;
export const MAX_MEMBERS = 500;
export const INVITE_TTL_DAYS = 14;

const ROLES: readonly TeamRole[] = ["owner", "admin", "member"];
const ADD_ROLES: readonly TeamRole[] = ["admin", "member"];
// eslint-disable-next-line no-control-regex
const HAS_CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/** Absence is classified by CODE ONLY — never by message prose (README:26-39 idiom). */
export function isAbsentTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error || !error.code) return false;
  return error.code === "42P01" || error.code === "PGRST205";
}

export function normalizeTeamName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEAM_NAME_LEN) return null;
  if (HAS_CONTROL_CHARS.test(trimmed)) return null;
  return trimmed;
}

export function normalizeRole(value: unknown): TeamRole | null {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return (ROLES as readonly string[]).includes(lowered) ? (lowered as TeamRole) : null;
}

function normalizeAddRole(value: unknown): TeamRole | null {
  if (value === undefined || value === null || value === "") return "member";
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  return (ADD_ROLES as readonly string[]).includes(lowered) ? (lowered as TeamRole) : null;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254) return null;
  if (HAS_CONTROL_CHARS.test(trimmed)) return null;
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const domain = trimmed.slice(at + 1);
  if (!domain || !domain.includes(".")) return null;
  return trimmed;
}

export function newInviteToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function inviteTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export type ReadFail = { ok: false; reason: "unavailable" | "failed"; error: string };
export type TeamsRead = { ok: true; teams: Team[] } | ReadFail;
export type MembersRead =
  | { ok: true; members: Member[]; callerRole: TeamRole }
  | { ok: false; reason: "unavailable" | "failed" | "forbidden" | "not_found"; error: string };
export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "unavailable" | "failed" | "forbidden" | "not_found" | "invalid" | "duplicate"; error: string; status: number };

function classifyReadError(result: DbResult): ReadFail | null {
  if (result.error) {
    return isAbsentTableError(result.error)
      ? { ok: false, reason: "unavailable", error: result.error.message || "table unavailable" }
      : { ok: false, reason: "failed", error: result.error.message || "read failed" };
  }
  if (!Array.isArray(result.data)) {
    return { ok: false, reason: "failed", error: "malformed response" };
  }
  return null;
}

function toRoleOrNull(value: unknown): TeamRole | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value) ? (value as TeamRole) : null;
}

export async function listTeams(db: TenancyDb, userId: string): Promise<TeamsRead> {
  const memberResult = await db
    .from(TEAM_MEMBERS_TABLE)
    .select("team_id,role")
    .eq("user_id", userId)
    .limit(MAX_TEAMS);
  const memberFail = classifyReadError(memberResult);
  if (memberFail) return memberFail;
  const memberRows = memberResult.data as DbRow[];
  if (memberRows.length === 0) return { ok: true, teams: [] };

  const roleByTeam = new Map<string, TeamRole>();
  const ids: string[] = [];
  for (const row of memberRows) {
    const teamId = typeof row.team_id === "string" ? row.team_id : null;
    const role = toRoleOrNull(row.role);
    if (!teamId || !role) continue;
    roleByTeam.set(teamId, role);
    ids.push(teamId);
  }
  if (ids.length === 0) return { ok: true, teams: [] };

  const teamsResult = await db
    .from(TEAMS_TABLE)
    .select("id,name,created_at")
    .in("id", ids)
    .order("created_at", { ascending: true })
    .limit(MAX_TEAMS);
  const teamsFail = classifyReadError(teamsResult);
  if (teamsFail) return teamsFail;
  const teamRows = teamsResult.data as DbRow[];

  const teams: Team[] = teamRows
    .map((row): Team | null => {
      const id = typeof row.id === "string" ? row.id : null;
      const name = typeof row.name === "string" ? row.name : null;
      const role = id ? roleByTeam.get(id) ?? null : null;
      if (!id || !name || !role) return null;
      return { id, name, role, createdAt: typeof row.created_at === "string" ? row.created_at : null };
    })
    .filter((t): t is Team => t !== null);
  return { ok: true, teams };
}

export async function createTeam(db: TenancyDb, userId: string, name: string): Promise<WriteResult<Team>> {
  const normalized = normalizeTeamName(name);
  if (!normalized) return { ok: false, reason: "invalid", error: "invalid name", status: 400 };
  // created_by is ALWAYS the session id — never taken from caller input beyond `name`.
  const result = await db
    .from(TEAMS_TABLE)
    .insert({ name: normalized, created_by: userId })
    .select("id,name,created_at")
    .maybeSingle();
  if (result.error) {
    return isAbsentTableError(result.error)
      ? { ok: false, reason: "unavailable", error: result.error.message || "unavailable", status: 503 }
      : { ok: false, reason: "failed", error: result.error.message || "insert failed", status: 500 };
  }
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as DbRow | null;
  if (!row || typeof row.id !== "string") {
    return { ok: false, reason: "failed", error: "insert returned no row", status: 500 };
  }
  return {
    ok: true,
    value: {
      id: row.id,
      name: typeof row.name === "string" ? row.name : normalized,
      role: "owner",
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
    },
  };
}

export async function getCallerRole(
  db: TenancyDb,
  userId: string,
  teamId: string,
): Promise<{ ok: true; role: TeamRole | null } | ReadFail> {
  const result = await db
    .from(TEAM_MEMBERS_TABLE)
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  const fail = classifyReadError({ data: result.data === undefined ? [] : result.data, error: result.error });
  if (result.error) return fail as ReadFail;
  const row = result.data as DbRow | null;
  // A missing row is indistinguishable from "team does not exist" under RLS — both are `role:null`.
  return { ok: true, role: row ? toRoleOrNull(row.role) : null };
}

export async function listMembers(db: TenancyDb, userId: string, teamId: string): Promise<MembersRead> {
  const roleResult = await getCallerRole(db, userId, teamId);
  if (!roleResult.ok) return roleResult;
  if (!roleResult.role) return { ok: false, reason: "forbidden", error: "not a member of this team" };

  const result = await db
    .from(TEAM_MEMBERS_TABLE)
    .select("user_id,role,invited_by,created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true })
    .limit(MAX_MEMBERS);
  const fail = classifyReadError(result);
  if (fail) return fail;
  const rows = result.data as DbRow[];
  const members: Member[] = rows
    .map((row): Member | null => {
      const userIdRow = typeof row.user_id === "string" ? row.user_id : null;
      const role = toRoleOrNull(row.role);
      if (!userIdRow || !role) return null;
      return {
        userId: userIdRow,
        role,
        invitedBy: typeof row.invited_by === "string" ? row.invited_by : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
      };
    })
    .filter((m): m is Member => m !== null);
  return { ok: true, members, callerRole: roleResult.role };
}

export async function addMember(
  db: TenancyDb,
  userId: string,
  teamId: string,
  input: { userId?: unknown; email?: unknown; role?: unknown },
): Promise<WriteResult<{ member?: Member; invite?: Invite; token?: string }>> {
  const roleResult = await getCallerRole(db, userId, teamId);
  if (!roleResult.ok) return { ok: false, reason: roleResult.reason, error: roleResult.error, status: roleResult.reason === "unavailable" ? 503 : 500 };
  if (!roleResult.role) {
    // Caller is not a member of ANYTHING matching this id — under RLS that is a 404, distinct from
    // "is a member but not owner/admin" (403). Neither leaks whether the team exists to a stranger
    // beyond what RLS already hides.
    return { ok: false, reason: "not_found", error: "team not found", status: 404 };
  }
  if (roleResult.role !== "owner" && roleResult.role !== "admin") {
    return { ok: false, reason: "forbidden", error: "only an owner or admin can add people", status: 403 };
  }

  const addRole = normalizeAddRole(input.role);
  if (!addRole) return { ok: false, reason: "invalid", error: "invalid role", status: 400 };

  const targetUserId = typeof input.userId === "string" ? input.userId.trim() : "";
  const email = input.email !== undefined ? normalizeEmail(input.email) : null;

  if (targetUserId) {
    const insertResult = await db
      .from(TEAM_MEMBERS_TABLE)
      .insert({ team_id: teamId, user_id: targetUserId, role: addRole, invited_by: userId })
      .select("user_id,role,invited_by,created_at")
      .maybeSingle();
    if (insertResult.error) {
      const code = (insertResult.error as { code?: string }).code;
      if (code === "23505") return { ok: false, reason: "duplicate", error: "already a member", status: 409 };
      if (code === "23503") {
        // Foreign key to auth.users: a well-formed but nonexistent userId. Caller error, not a
        // server fault — do not surface this as a 500.
        return { ok: false, reason: "invalid", error: "that user does not exist", status: 400 };
      }
      if (code === "22P02") {
        // Malformed uuid literal (e.g. not even shaped like a uuid). Caller error, not a server
        // fault — do not surface this as a 500.
        return { ok: false, reason: "invalid", error: "invalid userId", status: 400 };
      }
      if (isAbsentTableError(insertResult.error)) {
        return { ok: false, reason: "unavailable", error: insertResult.error.message || "unavailable", status: 503 };
      }
      return { ok: false, reason: "failed", error: insertResult.error.message || "insert failed", status: 500 };
    }
    const row = (Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data) as DbRow | null;
    const member: Member = {
      userId: targetUserId,
      role: addRole,
      invitedBy: userId,
      createdAt: row && typeof row.created_at === "string" ? row.created_at : null,
    };
    return { ok: true, value: { member } };
  }

  if (email) {
    const token = newInviteToken();
    const tokenHash = inviteTokenHash(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const insertResult = await db
      .from(TEAM_INVITES_TABLE)
      .insert({ team_id: teamId, email, role: addRole, token_hash: tokenHash, invited_by: userId, expires_at: expiresAt })
      .select("id,email,role,expires_at,accepted_at")
      .maybeSingle();
    if (insertResult.error) {
      const code = (insertResult.error as { code?: string }).code;
      if (code === "23505") return { ok: false, reason: "duplicate", error: "already invited", status: 409 };
      if (isAbsentTableError(insertResult.error)) {
        return { ok: false, reason: "unavailable", error: insertResult.error.message || "unavailable", status: 503 };
      }
      return { ok: false, reason: "failed", error: insertResult.error.message || "insert failed", status: 500 };
    }
    const row = (Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data) as DbRow | null;
    const invite: Invite = {
      id: row && typeof row.id === "string" ? row.id : "",
      email,
      role: addRole,
      expiresAt,
      acceptedAt: null,
    };
    return { ok: true, value: { invite, token } };
  }

  return { ok: false, reason: "invalid", error: "userId or email required", status: 400 };
}
