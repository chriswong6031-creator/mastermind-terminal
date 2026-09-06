import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addMember, listMembers, type InvalidCode, type TenancyDb } from "@/lib/teams";

export const runtime = "nodejs";

// Plain-language law (Chairman ruling, M3): lib/teams.ts returns a stable internal `code`, never
// a raw Postgres/lib message, as the response `message` — every string below is a complete
// sentence, never a lowercase fragment or an internal identifier.
const INVALID_MESSAGES: Record<InvalidCode, string> = {
  invalid_role: "Choose a role: admin or member.",
  invalid_user_id: "That user id is not valid.",
  user_not_found: "We could not find that person. Ask them to sign in to Mastermind first.",
  email_not_supported:
    "Invitations by email are not available yet. Ask them to sign in to Mastermind first, then add them by their account.",
  missing_target: "Provide a user id or an email address.",
};
const FALLBACK_INVALID_MESSAGE = "That request is not valid.";

async function resolveDb(): Promise<{ db: TenancyDb; userId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { db: supabase as unknown as TenancyDb, userId: user.id };
}

const unauthenticated = () =>
  NextResponse.json({ error: "UNAUTHENTICATED", message: "You are not signed in." }, { status: 401 });
const invalid = (message: string, status = 400) => NextResponse.json({ error: "INVALID", message }, { status });
const forbidden = (message: string) => NextResponse.json({ error: "FORBIDDEN", message }, { status: 403 });
const notFound = () =>
  NextResponse.json({ error: "NOT_FOUND", message: "We could not find that team." }, { status: 404 });
const duplicate = () =>
  NextResponse.json({ error: "DUPLICATE", message: "That person is already on this team." }, { status: 409 });
const readFail = (reason: "unavailable" | "failed", error: string) =>
  reason === "unavailable"
    ? NextResponse.json(
        { error: "READ_UNAVAILABLE", message: "Team accounts are not set up on this server yet, so we cannot answer. Nothing was changed." },
        { status: 503 },
      )
    : NextResponse.json({ error: "READ_FAILED", message: "We could not read the team directory just now." }, { status: 503 });
const writeFail = () =>
  NextResponse.json({ error: "WRITE_FAILED", message: "We could not save that change." }, { status: 500 });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const { id } = await ctx.params;
  if (!id) return invalid("A team id is required.");

  const result = await listMembers(session.db, session.userId, id);
  if (!result.ok) {
    if (result.reason === "forbidden") return forbidden("You are not a member of this team.");
    if (result.reason === "not_found") return notFound();
    console.error("team members GET failed:", result.error);
    return readFail(result.reason, result.error);
  }
  return NextResponse.json({ members: result.members, callerRole: result.callerRole, truncated: result.truncated });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await resolveDb();
  if (!session) return unauthenticated();
  const { id } = await ctx.params;
  if (!id) return invalid("A team id is required.");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return invalid("Send a JSON body.");

  const result = await addMember(session.db, session.userId, id, {
    userId: body.userId,
    email: body.email,
    role: body.role,
  });
  if (!result.ok) {
    if (result.reason === "forbidden") return forbidden("Only a team owner or admin can add people.");
    if (result.reason === "not_found") return notFound();
    if (result.reason === "duplicate") return duplicate();
    if (result.reason === "invalid") {
      return invalid(result.code ? INVALID_MESSAGES[result.code] : FALLBACK_INVALID_MESSAGE, result.status);
    }
    if (result.reason === "unavailable") return readFail("unavailable", result.error);
    console.error("team members POST failed:", result.error);
    return writeFail();
  }
  // MO-PAID-081 (invite-by-email) is not absorbed by this packet — addMember's only success path
  // is adding an existing account by user id; there is no invite/token branch to handle here.
  return NextResponse.json({ member: result.value.member }, { status: 201 });
}
