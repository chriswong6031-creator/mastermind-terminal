"use client";

import { useState } from "react";
import { assetInitial, assetLogoPath } from "@/lib/assetLogos";

export default function AssetLogo({
  symbol,
  name,
  market,
  color = "#64748b",
  size = 24,
  className = "",
}: {
  symbol: string;
  name?: string | null;
  market?: string | null;
  color?: string;
  size?: number;
  className?: string;
}) {
  const src = assetLogoPath(symbol, market || undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span
      className={`asset-logo ${className}`.trim()}
      style={{ width: size, height: size, backgroundColor: color }}
      title={name || symbol}
      aria-hidden="true"
    >
      <span className="asset-logo-fallback">{assetInitial(symbol)}</span>
      {failedSrc !== src && (
        // Direct CDN rendering keeps the integration within Logo.dev's fair-use policy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="origin"
          onError={() => setFailedSrc(src)}
        />
      )}
    </span>
  );
}
