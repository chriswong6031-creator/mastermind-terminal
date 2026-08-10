import { NextResponse } from "next/server";
import { billingAuth } from "@/app/api/billing/gateway";
import { hasIssueDeskOperator } from "@/lib/entitlement";
import { ISSUE_DESK_API_BASE } from "@/lib/upstreams";

const NO_STORE = { "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };
const UPSTREAM_PATH = "/api/options/issue-desk/reviews";

function validActionBody(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  const allowedKeys = new Set(["proposal_id", "proposal_revision", "action", "reason_codes", "idempotency_key", "issue_receipt"]);
  const base = typeof body.proposal_id === "string" && body.proposal_id.length > 0
    && typeof body.proposal_revision === "number" && Number.isInteger(body.proposal_revision) && body.proposal_revision > 0
    && (body.action === "approve" || body.action === "reject")
    && typeof body.idempotency_key === "string" && body.idempotency_key.length >= 16
    && Array.isArray(body.reason_codes);
  const allowed = body.action === "approve"
    ? new Set(["PORTFOLIO_FIT", "REGIME_ALIGNED", "EXECUTION_VERIFIED", "DIVERSIFICATION_FIT"])
    : new Set(["ABSTAIN", "REGIME_MISMATCH", "CORRELATION_CAP", "COOLDOWN", "EVENT_RISK", "EXECUTION_MISSING", "LIQUIDITY", "NO_EDGE"]);
  const reasonCodes = Array.isArray(body.reason_codes) ? body.reason_codes : [];
  return keys.every((key) => allowedKeys.has(key)) && base && reasonCodes.length >= 1 && reasonCodes.length <= 8 && new Set(reasonCodes).size === reasonCodes.length && reasonCodes.every((code: unknown) => typeof code === "string" && allowed.has(code))
    && (body.action === "approve" ? !!body.issue_receipt && typeof body.issue_receipt === "object" && !Array.isArray(body.issue_receipt) : !Object.hasOwn(body, "issue_receipt"));
}

/**
 * Append one human review decision through Macro.  Terminal validates only the
 * transport envelope; Macro owns reviewer identity, authoritative UTC clocks,
 * stale-revision checks, immutable receipt storage, and the append-only ledger.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = await billingAuth();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!(await hasIssueDeskOperator())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  }
  if (req.headers.get("content-type") !== "application/json") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 422, headers: NO_STORE });
  }
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > 128_000) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 422, headers: NO_STORE });
  }
  const body: unknown = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!validActionBody(body)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 422, headers: NO_STORE });
  }
  try {
    const upstream = await fetch(`${ISSUE_DESK_API_BASE}${UPSTREAM_PATH}`, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`,
      },
      // Forward original bytes: Macro's strict decoder, not this proxy, rejects
      // duplicate keys and non-finite JSON without a lossy reserialization.
      body: raw,
    });
    const text = await upstream.text().catch(() => "");
    if (!upstream.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "invalid_upstream_response" }, { status: 502, headers: NO_STORE });
    }
    return new Response(text, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        ...NO_STORE,
      },
    });
  } catch {
    return NextResponse.json({ error: "issue_desk_unavailable" }, { status: 502, headers: NO_STORE });
  }
}
