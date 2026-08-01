"use client";

import { useState } from "react";
import { assetInitial, assetLogoNamePath, assetLogoPath } from "@/lib/assetLogos";

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
  const tickerSrc = assetLogoPath(symbol, market || undefined);
  const cleanName = name?.trim();
  const nameSrc = cleanName && cleanName.toUpperCase() !== symbol.trim().toUpperCase()
    ? assetLogoNamePath(cleanName)
    : null;
  const sources = nameSrc ? [tickerSrc, nameSrc] : [tickerSrc];
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = sources.find((candidate) => !failedSources.includes(candidate));

  return (
    <span
      className={`asset-logo ${className}`.trim()}
      style={{ width: size, height: size, backgroundColor: color }}
      title={name || symbol}
      aria-hidden="true"
    >
      <span className="asset-logo-fallback">{assetInitial(symbol)}</span>
      {src && (
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
          onError={() => setFailedSources((failed) => (
            failed.includes(src) ? failed : [...failed, src]
          ))}
        />
      )}
    </span>
  );
}
