import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeCompanyIntelligenceSymbol,
  resolveCompanyIntelligenceFromR2,
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
  if (!limited.ok) {
    return NextResponse.json({
      schema: "mastermind.company-theme-context/v1",
      ok: false,
      state: "error",
      error: { code: "upstream_unavailable", message: "Company theme context is temporarily rate limited.", retryable: true },
    }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limited.retryAfterSec) } });
  }
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
  // Production verifies the sidecar against the current Company Intelligence
  // plane server-side. The isolated E2E lane uses an intercepted deterministic
  // payload and never reaches public R2.
  const current = process.env.TERMINAL_E2E_FIXTURE === "1"
    ? null
    : await resolveCompanyIntelligenceFromR2(symbol, R2_BASE, { signal: req.signal });
  if (current && !current.ok) {
    const code = current.error.code === "not_found" ? "not_found"
      : current.error.code === "invalid_payload" ? "invalid_payload"
        : "upstream_unavailable";
    const unavailable: CompanyThemeExposureResult = {
      ok: false,
      state: "error",
      error: { code, message: "Current Company Intelligence could not be verified for theme context.", retryable: current.error.retryable },
    };
    return response(unavailable, statusFor(unavailable));
  }
  const result = await resolveCompanyThemeExposureFromR2(symbol, R2_BASE, {
    signal: req.signal,
    expectedCompanyIntelligence: current ? {
      generation_id: current.context.generation_id,
      latest_event_id: current.context.latest_event_id,
    } : undefined,
  });
  return response(result, statusFor(result));
}
