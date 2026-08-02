import { NextResponse } from "next/server";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { normalizeCompanySourceSearchTicker, normalizeTranscriptLiteralPhrase, type CompanySourceSearchResult } from "@/lib/companySourceSearch";
import {
  createCompanySourceSearchE2eFetch,
  resolveCompanySourceSearchFromArchive,
  type CompanySourceSearchArchiveCall,
} from "@/lib/companySourceSearchServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_QUERY = 240;

function envelope(ticker: string, query: string, message: string, retryable: boolean): CompanySourceSearchResult {
  return { state: "error", ticker, query, message, retryable };
}

function response(payload: CompanySourceSearchResult, status = 200): Response {
  return NextResponse.json({ schema: "mastermind.company-source-search/v1", ...payload }, { status, headers: NO_STORE });
}

function requestCalls(params: URLSearchParams): CompanySourceSearchArchiveCall[] | null {
  const events = params.getAll("event");
  const transcripts = params.getAll("tx");
  if (events.length !== transcripts.length || events.length < 1 || events.length > 12) return null;
  return events.map((event_id, index) => ({ event_id, transcript_id: transcripts[index] }));
}

async function authenticated(): Promise<boolean> {
  // The only non-authenticated lane is the process-isolated responsive suite.
  // It still executes this actual BFF against a deterministic root/body fixture.
  if (process.env.TERMINAL_E2E_FIXTURE === "1") return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

function statusFor(payload: CompanySourceSearchResult): number {
  if (payload.state === "ready" || payload.state === "not_covered" || payload.state === "stale_revision") return 200;
  if (payload.state === "unavailable") return 503;
  return payload.retryable ? 503 : 400;
}

export async function GET(req: Request, { params }: { params: Promise<{ ticker: string }> }): Promise<Response> {
  const limited = rateLimit(req, { name: "company-source-search", max: 30 });
  if (!limited.ok) return tooMany(limited);

  const { ticker: rawTicker } = await params;
  const ticker = normalizeCompanySourceSearchTicker(rawTicker);
  const url = new URL(req.url);
  const rawQuery = url.searchParams.get("q") ?? "";
  const query = normalizeTranscriptLiteralPhrase(rawQuery);
  if (!ticker || ticker !== rawTicker || rawQuery.length > MAX_QUERY || !query) {
    return response(envelope(ticker ?? "", query ?? "", "Enter one literal query of at most 240 characters.", false), 400);
  }
  const mode = url.searchParams.get("mode");
  const calls = requestCalls(url.searchParams);
  const left = url.searchParams.get("left") ?? undefined;
  const right = url.searchParams.get("right") ?? undefined;
  if ((mode !== "search" && mode !== "compare") || !calls) {
    return response(envelope(ticker, query, "Select one to twelve explicit transcript events.", false), 400);
  }
  if (!await authenticated()) {
    return response(envelope(ticker, query, "Sign in to use revision-verified transcript search.", false), 401);
  }
  const result = await resolveCompanySourceSearchFromArchive({
    ticker,
    phrase: query,
    calls,
    mode,
    left_event_id: left,
    right_event_id: right,
  }, {
    fetcher: process.env.TERMINAL_E2E_FIXTURE === "1" ? createCompanySourceSearchE2eFetch() : undefined,
    signal: req.signal,
  });
  return response(result, statusFor(result));
}
