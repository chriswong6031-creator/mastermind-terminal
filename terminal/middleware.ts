import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // run on everything except static assets / data
  matcher: ["/((?!_next/static|_next/image|favicon.ico|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js)$).*)"],
};
