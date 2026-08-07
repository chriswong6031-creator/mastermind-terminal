import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { T } from "@/components/LocalizedCopy";

// Landing. (Middleware redirects signed-in users straight to /terminal.)
export default function Landing() {
  return (
    <main className="center">
      <div className="hero">
        <div className="mk"><BrandMark size={64} /></div>
        <h1><T k="ldHead1" /><br /><T k="ldHead2" /></h1>
        <T as="p" k="ldTag" className="tag" />
        <div className="cta">
          <Link href="/login" className="btn btn-primary"><T k="lgSignIn" /></Link>
          <Link href="/login?mode=signup" className="btn btn-ghost"><T k="lgCreateAccount" /></Link>
        </div>
      </div>
    </main>
  );
}
