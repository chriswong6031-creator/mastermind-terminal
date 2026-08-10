const LOGO_DEV_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN?.trim();

export function assetLogoPath(symbol: string, market?: string): string | null {
  if (!LOGO_DEV_TOKEN) return null;
  const isCrypto = /crypto/i.test(market || "") || /-USD$/i.test(symbol);
  const lookup = isCrypto ? symbol.replace(/-USD$/i, "") : symbol;
  const family = isCrypto ? "crypto" : "ticker";
  return `https://img.logo.dev/${family}/${encodeURIComponent(lookup)}?token=${encodeURIComponent(LOGO_DEV_TOKEN)}&size=64&format=webp&retina=true&fallback=404`;
}

export function assetInitial(symbol: string): string {
  const clean = symbol.trim().replace(/^[^A-Za-z0-9]+/, "");
  return (clean[0] || "?").toUpperCase();
}
