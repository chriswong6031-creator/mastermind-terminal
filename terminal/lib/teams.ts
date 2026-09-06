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
// `truncated` (house idiom — lib/aggTrend.ts, lib/searchEvents.ts): true when the result hit
// MAX_TEAMS/MAX_MEMBERS, so a 200th team is never silently indistinguishable from "you have
// exactly 200 teams" (m1).
export type TeamsRead = { ok: true; teams: Team[]; truncated: boolean } | ReadFail;
export type MembersRead =
  | { ok: true; members: Member[]; callerRole: TeamRole; truncated: boolean }
  | { ok: false; reason: "unavailable" | "failed" | "forbidden" | "not_found"; error: string };
// `code` is the STABLE, internal reason a caller-side "invalid"/"duplicate" failed — plain-language
// law (Chairman ruling, M3): the route maps `code` to a complete-sentence `message`, and `error`
// (free-text, may embed a raw Postgres message) never reaches the HTTP response body directly.
export type InvalidCode = "invalid_role" | "invalid_user_id" | "user_not_found" | "email_not_supported" | "missing_target";
export type WriteResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: "unavailable" | "failed" | "forbidden" | "not_found" | "invalid" | "duplicate";
      error: string;
      code?: InvalidCode;
      status: number;
    };

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
  // Hitting the limit means there may be more rows beyond it we never fetched — the caller is
  // told, rather than a 201st team silently reading identically to "you have exactly 200".
  const truncated = memberRows.length === MAX_TEAMS;
  if (memberRows.length === 0) return { ok: true, teams: [], truncated };

  const roleByTeam = new Map<string, TeamRole>();
  const ids: string[] = [];
  for (const row of memberRows) {
    const teamId = typeof row.team_id === "string" ? row.team_id : null;
    const role = toRoleOrNull(row.role);
    if (!teamId || !role) continue;
    roleByTeam.set(teamId, role);
    ids.push(teamId);
  }
  if (ids.length === 0) return { ok: true, teams: [], truncated };

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
  return { ok: true, teams, truncated };
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
  // classifyReadError() is built for array-shaped results (`.limit()` queries) and would call a
  // `maybeSingle()` object malformed on every no-error response — do not reuse it here, and do not
  // compute an "isAbsentTableError vs other" guard only to discard it on the success path.
  if (result.error) {
    return isAbsentTableError(result.error)
      ? { ok: false, reason: "unavailable", error: result.error.message || "table unavailable" }
      : { ok: false, reason: "failed", error: result.error.message || "read failed" };
  }
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
  return { ok: true, members, callerRole: roleResult.role, truncated: rows.length === MAX_MEMBERS };
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
  if (!addRole) return { ok: false, reason: "invalid", error: "invalid role", code: "invalid_role", status: 400 };

  const targetUserId = typeof input.userId === "string" ? input.userId.trim() : "";
  const emailProvided = input.email !== undefined && input.email !== null && input.email !== "";

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
        return { ok: false, reason: "invalid", error: "that user does not exist", code: "user_not_found", status: 400 };
      }
      if (code === "22P02") {
        // Malformed uuid literal (e.g. not even shaped like a uuid). Caller error, not a server
        // fault — do not surface this as a 500.
        return { ok: false, reason: "invalid", error: "invalid userId", code: "invalid_user_id", status: 400 };
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

  if (emailProvided) {
    // MO-PAID-081 (invite-by-email delivery) is explicitly NOT absorbed by this packet (M2
    // ruling) — team_invites stays a schema-only foundation. There is no email->account lookup
    // (no service-role key, no secret store — TWO-ORGANISMS LAW), so every email input here is
    // "does not match an existing account" by construction, and this path writes NO row: an
    // unimplemented feature must fail loudly, never fall through to a silent no-op invite.
    return {
      ok: false,
      reason: "invalid",
      error: "email invites are not available yet",
      code: "email_not_supported",
      status: 422,
    };
  }

  return { ok: false, reason: "invalid", error: "userId or email required", code: "missing_target", status: 400 };
}
