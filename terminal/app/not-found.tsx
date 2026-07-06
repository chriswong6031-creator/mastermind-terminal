// Root not-found page — caught by the root layout (LangProvider + globals.css available).
// Server component; bilingual strings are inlined because server components cannot call useT().
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="center">
      <div className="hero">
        <div className="mk"><BrandMark size={48} /></div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>404 — Page not found</h1>
        <p className="tag" style={{ marginBottom: 20 }}>
          This page doesn&apos;t exist or has moved. Head back to the chart.
        </p>
        <div className="cta">
          <Link href="/terminal" className="btn btn-primary">Go to chart</Link>
        </div>
      </div>
    </main>
  );
}
