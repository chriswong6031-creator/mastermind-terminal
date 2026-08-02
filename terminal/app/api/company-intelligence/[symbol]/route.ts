import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import {
  normalizeCompanyIntelligence,
  normalizeCompanyIntelligenceSymbol,
  resolveCompanyIntelligenceFromR2,
  type CompanyIntelligenceResult,
} from "@/lib/companyIntelligence";
import { R2_BASE } from "@/lib/upstreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_DIR = path.join(process.cwd(), "public", "data", "company_intelligence");
const NO_STORE = { "Cache-Control": "no-store" };

function response(body: CompanyIntelligenceResult, status = 200, source?: "fixture"): NextResponse<CompanyIntelligenceResult> {
  return NextResponse.json(body, {
    status,
    headers: { ...NO_STORE, ...(source ? { "X-Company-Intelligence-Source": source } : {}) },
  });
}

function statusFor(result: CompanyIntelligenceResult): number {
  if (result.ok) return 200;
  if (result.error.code === "invalid_symbol") return 400;
  if (result.error.code === "not_found") return 404;
  // Bad signed producer payload is a 502; a timeout/non-2xx without a last-good copy is 503.
  return result.error.code === "invalid_payload" ? 502 : 503;
}

async function fixture(symbol: string): Promise<CompanyIntelligenceResult> {
  // Fixture mode is exact-symbol only. A missing AAPL fixture must remain an honest
  // not-covered state, never inherit NVDA's display context.
  const file = path.join(FIXTURE_DIR, `${symbol}.json`);
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
    const context = normalizeCompanyIntelligence(raw, symbol);
    if (context) return { ok: true, state: context.status, context };
  } catch {
    // Intentional: fixture absence is a local not-covered result, not an upstream outage.
  }
  return {
    ok: false,
    state: "error",
    error: { code: "not_found", message: "Company intelligence fixture is not covered", retryable: false },
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<Response> {
  const rl = rateLimit(req, { name: "company-intelligence", max: 120 });
  if (!rl.ok) return tooMany(rl);
  const { symbol: rawSymbol } = await params;
  // Next decodes params once. Validating the final segment rejects %2f/path traversal,
  // hash/query-looking strings, and non-canonical lower-case forms before any I/O.
  const symbol = normalizeCompanyIntelligenceSymbol(rawSymbol);
  if (!symbol || symbol !== rawSymbol) {
    return response({
      ok: false,
      state: "error",
      error: { code: "invalid_symbol", message: "Invalid ticker", retryable: false },
    }, 400);
  }
  const result = process.env.COMPANY_INTELLIGENCE_FIXTURE === "1"
    ? await fixture(symbol)
    : await resolveCompanyIntelligenceFromR2(symbol, R2_BASE, { signal: req.signal });
  return response(result, statusFor(result), process.env.COMPANY_INTELLIGENCE_FIXTURE === "1" ? "fixture" : undefined);
}
