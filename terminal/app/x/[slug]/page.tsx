import { notFound } from "next/navigation";
import type { Metadata } from "next";
// Public R2 base URL for snapshots (CDN-backed, no auth required) — shared constant,
// see lib/upstreams.ts
import { R2_BASE } from "@/lib/upstreams";

function imgUrl(slug: string): string {
  return `${R2_BASE}/snapshots/${slug}.png`;
}

// ── Next.js generateMetadata — produces OG tags for Discord/Twitter/Slack unfurls ──
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const image = imgUrl(slug);
  return {
    title: "Chart Snapshot — Mastermind Terminal",
    description: "Shared chart snapshot from Mastermind Terminal",
    openGraph: {
      title: "Chart Snapshot — Mastermind Terminal",
      description: "Shared chart snapshot from Mastermind Terminal",
      images: [{ url: image, width: 1400, height: 900 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Chart Snapshot — Mastermind Terminal",
      images: [image],
    },
  };
}

// ── verify the image exists before rendering ──
async function imageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function SnapshotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // basic slug validation (10 lowercase alphanumeric chars)
  if (!/^[0-9a-z]{10}$/.test(slug)) notFound();

  const image = imgUrl(slug);
  const exists = await imageExists(image);
  if (!exists) notFound();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0b0e",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        {/* BrandMark inline SVG */}
        <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
          <defs>
            <linearGradient id="mbSnap" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4d82ff" />
              <stop offset="1" stopColor="#2962ff" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="34" height="34" rx="8" fill="url(#mbSnap)" />
          <rect x="3.6" y="3.6" width="32.8" height="32.8" rx="7.4" fill="none" stroke="#fff" strokeOpacity=".22" />
          <path d="M13 28 L13 14.5 L20 22 L27 12.5 L27 28" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ color: "#d6dae3", fontWeight: 700, letterSpacing: "0.04em", fontSize: 14 }}>MASTERMIND</span>
        <span style={{ color: "#5a616f", fontWeight: 500, letterSpacing: "0.06em", fontSize: 11 }}>TERMINAL</span>
      </div>
      <div style={{
        maxWidth: "min(1400px, calc(100vw - 32px))",
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="Chart snapshot"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>
      <div style={{ marginTop: 16, color: "#5a616f", fontSize: 12 }}>
        Created with{" "}
        <a href="/" style={{ color: "#4d82ff", textDecoration: "none" }}>Mastermind Terminal</a>
      </div>
    </div>
  );
}
