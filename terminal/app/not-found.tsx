// Root not-found page — caught by the root layout (LangProvider + globals.css available).
// Server component, so the copy goes through the <T> client leaf: the language lives in
// localStorage / <html data-lang> and is unreadable at server render time.
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { T } from "@/components/LocalizedCopy";

export default function NotFound() {
  return (
    <main className="center">
      <div className="hero">
        <div className="mk"><BrandMark size={48} /></div>
        <T as="h1" k="nfTitle" style={{ fontSize: 22, marginBottom: 8 }} />
        <T as="p" k="nfBody" className="tag" style={{ marginBottom: 20 }} />
        <div className="cta">
          <Link href="/terminal" className="btn btn-primary"><T k="errGoToChart" /></Link>
        </div>
      </div>
    </main>
  );
}
