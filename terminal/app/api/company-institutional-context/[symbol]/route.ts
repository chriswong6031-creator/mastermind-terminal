import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeCompanyIntelligenceSymbol,
  resolveCompanyIntelligenceLineageFromR2,
} from "@/lib/companyIntelligence";
import {
  resolveCompanyInstitutionalContextFromR2,
  type CompanyInstitutionalResult,
} from "@/lib/companyInstitutionalContext";
import { R2_BASE } from "@/lib/upstreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function response(payload: CompanyInstitutionalResult, status = 200): Response {
  return NextResponse.json({ schema: "mastermind.company-institutional-context/v1", ...payload }, { status, headers: NO_STORE });
}

async function authenticated(): Promise<boolean> {
  if (process.env.TERMINAL_E2E_FIXTURE === "1") return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch { return false; }
}

function statusFor(payload: CompanyInstitutionalResult): number {
  if (payload.ok) return 200;
  if (payload.error.code === "invalid_symbol") return 400;
  if (payload.error.code === "not_found") return 404;
  if (payload.error.code === "unauthorized") return 401;
  return payload.error.code === "invalid_payload" ? 502 : 503;
}

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<Response> {
  const limited = rateLimit(req, { name: "company-institutional-context", max: 60 });
  if (!limited.ok) {
    return NextResponse.json({
      schema: "mastermind.company-institutional-context/v1",
      ok: false,
      state: "error",
      error: { code: "upstream_unavailable", message: "Institutional context is temporarily rate limited.", retryable: true },
    }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited.retryAfterSec) } });
  }
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeCompanyIntelligenceSymbol(rawSymbol);
  if (!symbol || symbol !== rawSymbol) {
    return response({ ok: false, state: "error", error: { code: "invalid_symbol", message: "Invalid ticker", retryable: false } }, 400);
  }
  if (!await authenticated()) {
    return response({
      ok: false, state: "error",
      error: { code: "unauthorized", message: "Sign in to use verified institutional context.", retryable: false },
    }, 401);
  }
  const current = process.env.TERMINAL_E2E_FIXTURE === "1"
    ? null
    : await resolveCompanyIntelligenceLineageFromR2(symbol, R2_BASE, { signal: req.signal });
  if (current && (!current.result.ok || !current.lineage)) {
    const sourceCode = current.result.ok ? "invalid_payload" : current.result.error.code;
    const code = sourceCode === "not_found" ? "not_found" : sourceCode === "invalid_payload" ? "invalid_payload" : "upstream_unavailable";
    const unavailable: CompanyInstitutionalResult = {
      ok: false, state: "error",
      error: { code, message: "Current Company Intelligence could not be verified for institutional context.", retryable: sourceCode !== "not_found" },
    };
    return response(unavailable, statusFor(unavailable));
  }
  const result = await resolveCompanyInstitutionalContextFromR2(symbol, R2_BASE, {
    signal: req.signal,
    expectedCompanyIntelligence: current?.lineage ?? undefined,
  });
  return response(result, statusFor(result));
}
