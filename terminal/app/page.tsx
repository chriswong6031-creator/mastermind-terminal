import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

// Landing. (Middleware redirects signed-in users straight to /terminal.)
export default function Landing() {
  return (
    <main className="center">
      <div className="hero">
        <div className="mk"><BrandMark size={64} /></div>
        <h1>As fast as TradingView.<br />Smarter than both.</h1>
        <p className="tag">
          An institutional charting terminal where a verified, backtested confluence signal,
          a top-down macro&nbsp;/&nbsp;regime read, and an Opus AI copilot work as one system —
          so you don&apos;t just see the chart, you understand the setup.
        </p>
        <div className="cta">
          <Link href="/login" className="btn btn-primary">Sign in</Link>
          <Link href="/login?mode=signup" className="btn btn-ghost">Create account</Link>
        </div>
      </div>
    </main>
  );
}
