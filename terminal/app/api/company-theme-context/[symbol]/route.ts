import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeCompanyIntelligenceSymbol,
} from "@/lib/companyIntelligence";
import {
  resolveCompanyThemeExposureFromR2,
  type CompanyThemeExposureResult,
} from "@/lib/companyThemeExposure";
import { R2_BASE } from "@/lib/upstreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function response(payload: CompanyThemeExposureResult, status = 200): Response {
  return NextResponse.json({ schema: "mastermind.company-theme-context/v1", ...payload }, { status, headers: NO_STORE });
}

async function authenticated(): Promise<boolean> {
  // The responsive suite uses an isolated deterministic BFF lane. Production
  // always verifies the session server-side because `/api/*` bypasses proxy.ts.
  if (process.env.TERMINAL_E2E_FIXTURE === "1") return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

function statusFor(payload: CompanyThemeExposureResult): number {
  if (payload.ok) return 200;
  if (payload.error.code === "invalid_symbol") return 400;
  if (payload.error.code === "not_found") return 404;
  if (payload.error.code === "unauthorized") return 401;
  return payload.error.code === "invalid_payload" ? 502 : 503;
}

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<Response> {
  const limited = rateLimit(req, { name: "company-theme-context", max: 60 });
  if (!limited.ok) return tooMany(limited);
  const { symbol: rawSymbol } = await params;
  const symbol = normalizeCompanyIntelligenceSymbol(rawSymbol);
  // Next decodes the segment once. Reject anything non-canonical before it can
  // become a remote object key or a cache key.
  if (!symbol || symbol !== rawSymbol) {
    return response({
      ok: false,
      state: "error",
      error: { code: "invalid_symbol", message: "Invalid ticker", retryable: false },
    }, 400);
  }
  if (!await authenticated()) {
    return response({
      ok: false,
      state: "error",
      error: { code: "unauthorized", message: "Sign in to use verified company theme context.", retryable: false },
    }, 401);
  }
  const result = await resolveCompanyThemeExposureFromR2(symbol, R2_BASE, { signal: req.signal });
  return response(result, statusFor(result));
}
