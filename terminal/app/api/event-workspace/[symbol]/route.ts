import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { normalizeCompanyIntelligenceSymbol } from "@/lib/companyIntelligence";
import {
  resolveCurrentEventWorkspaceFromR2,
  type EventWorkspaceResult,
} from "@/lib/eventWorkspace";
import { R2_BASE } from "@/lib/upstreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function response(body: EventWorkspaceResult, status = 200): NextResponse<EventWorkspaceResult> {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function statusFor(result: EventWorkspaceResult): number {
  if (result.ok) return 200;
  if (result.error.code === "invalid_symbol") return 400;
  if (result.error.code === "not_found" || result.error.code === "ambiguous_event") return 404;
  return result.error.code === "invalid_payload" ? 502 : 503;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  const rl = rateLimit(req, { name: "event-workspace", max: 120 });
  if (!rl.ok) return tooMany(rl);
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeCompanyIntelligenceSymbol(rawSymbol);
  if (!symbol || symbol !== rawSymbol) {
    return response({
      ok: false,
      state: "error",
      available: false,
      error: { code: "invalid_symbol", message: "Invalid ticker", retryable: false },
    }, 400);
  }
  const result = await resolveCurrentEventWorkspaceFromR2(symbol, R2_BASE, { signal: req.signal });
  return response(result, statusFor(result));
}
