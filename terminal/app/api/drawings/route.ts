import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_DRAWING_PAYLOAD_BYTES,
  MAX_DRAWINGS_PER_SYMBOL,
  normalizeDrawings,
} from "@/lib/drawings";
import { getDrawingTool } from "@/lib/drawingTools";

type StoredDrawingRow = { id: string; kind: string; data?: Record<string, unknown> | null };
type StoredIdRow = { id: string };
const COLLECTION_KIND = "__collection_v1";

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ drawings: [] });
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ drawings: [], error: "A symbol is required" }, { status: 400 });
  // Owner filter in code as well as RLS: never rely on a single boundary for user data.
  const q = supabase.from("drawings").select("*")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .order("created_at", { ascending: true });
  const { data, error } = await q;
  if (error) {
    console.error("drawings GET failed:", error);
    // Never disguise a storage outage as an authoritative empty collection.
    // The client deliberately leaves the symbol unloaded on non-2xx responses,
    // otherwise the next local edit could replace an account's saved drawings.
    return NextResponse.json({ drawings: [], error: "Could not load drawings" }, { status: 500 });
  }
  const rows = (data || []) as StoredDrawingRow[];
  // New saves are one JSONB collection row. A replacement becomes visible in a
  // single INSERT, so concurrent tabs can never expose a union of two snapshots.
  // Keep the legacy row-per-drawing reader for existing accounts.
  const collection = [...rows].reverse().find((row) => row.kind === COLLECTION_KIND);
  const drawings = collection && Array.isArray(collection.data?.drawings)
    ? normalizeDrawings(collection.data.drawings)
    : normalizeDrawings(rows.map((row) => ({
        id: row.data?.id || row.id,
        kind: row.kind,
        ...(row.data || {}),
      })));
  return NextResponse.json({ drawings, schemaVersion: 1 });
}

// Replace-all for a symbol (hand-drawn only; auto/detected drawings are never persisted).
export async function PUT(req: Request) {
  const { supabase, user } = await ctx();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  let payload: unknown;
  try {
    const body = await req.text();
    if (new TextEncoder().encode(body).byteLength > MAX_DRAWING_PAYLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "Drawing payload is too large" }, { status: 413 });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  const raw = payload as { symbol?: unknown; drawings?: unknown };
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim() : "";
  if (!symbol || symbol.length > 64 || !Array.isArray(raw.drawings)) {
    return NextResponse.json({ ok: false, error: "A symbol and drawings array are required" }, { status: 400 });
  }
  if (raw.drawings.length > MAX_DRAWINGS_PER_SYMBOL) {
    return NextResponse.json({ ok: false, error: `Maximum ${MAX_DRAWINGS_PER_SYMBOL} drawings per symbol` }, { status: 413 });
  }

  const normalized = normalizeDrawings(raw.drawings);
  if (normalized.length !== raw.drawings.length) {
    // Never erase a valid server collection because one malformed client object
    // was silently discarded during migration.
    return NextResponse.json({ ok: false, error: "One or more drawings are invalid" }, { status: 422 });
  }
  const ids = new Set<string>();
  for (const drawing of normalized) {
    const tool = getDrawingTool(drawing.kind);
    if (!tool || drawing.points.length < tool.creation.minPoints || drawing.points.length > tool.creation.maxPoints || ids.has(drawing.id)) {
      return NextResponse.json({ ok: false, error: "One or more drawings have invalid geometry or duplicate IDs" }, { status: 422 });
    }
    ids.add(drawing.id);
  }
  const userDrawings = normalized.filter((drawing) => drawing.source === "user");
  const collectionRow = {
    user_id: user.id,
    symbol,
    kind: COLLECTION_KIND,
    data: {
      schemaVersion: 1,
      revision: crypto.randomUUID(),
      drawings: userDrawings,
    },
  };

  // Stage the replacement before deleting the old collection. A failed insert
  // therefore leaves the user's last good chart intact instead of turning a
  // transient database error into irreversible drawing loss.
  const { data: existing, error: readError } = await supabase
    .from("drawings")
    .select("id")
    .eq("user_id", user.id)
    .eq("symbol", symbol);
  if (readError) {
    console.error("drawings PUT preflight failed:", readError);
    return NextResponse.json({ ok: false, error: "Could not save drawings" }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase.from("drawings").insert(collectionRow).select("id");
  if (insertError) {
    console.error("drawings PUT insert failed:", insertError);
    return NextResponse.json({ ok: false, error: "Could not save drawings" }, { status: 500 });
  }
  const insertedIds = ((inserted || []) as StoredIdRow[]).map((row) => row.id).filter(Boolean);

  const oldIds = ((existing || []) as StoredIdRow[]).map((row) => row.id).filter(Boolean);
  if (oldIds.length) {
    const { error: deleteError } = await supabase.from("drawings").delete().in("id", oldIds).eq("user_id", user.id);
    if (deleteError) {
      if (insertedIds.length) await supabase.from("drawings").delete().in("id", insertedIds).eq("user_id", user.id);
      console.error("drawings PUT delete failed:", deleteError);
      return NextResponse.json({ ok: false, error: "Could not replace drawings" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, count: userDrawings.length, schemaVersion: 1 });
}
