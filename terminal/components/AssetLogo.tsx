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
  const failed = src != null && failedSrc === src;

  return (
    <span
      className={`asset-logo ${className}`.trim()}
      style={{ width: size, height: size, backgroundColor: color }}
      title={name || symbol}
      aria-hidden="true"
    >
      <span className="asset-logo-fallback">{assetInitial(symbol)}</span>
      {src && !failed && (
        // Direct Logo.dev image-CDN usage is intentional: publishable keys are client-safe,
        // and Logo.dev's fair-use policy does not permit bulk downloading/rehosting.
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
