// Logo.dev publishable keys are intentionally client-visible and restricted to the
// image CDN. The environment variable can rotate/override the project key.
const LOGO_DEV_TOKEN =
  process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN?.trim() ||
  "pk_c5LwRfhZRCWZUm6KzpmDRQ";

function logoDevImagePath(family: "ticker" | "crypto" | "name", lookup: string): string {
  return `https://img.logo.dev/${family}/${encodeURIComponent(lookup)}?token=${encodeURIComponent(LOGO_DEV_TOKEN)}&size=64&format=webp&retina=true&fallback=404`;
}

export function assetLogoPath(symbol: string, market?: string): string {
  const isCrypto = /crypto/i.test(market || "") || /-USD$/i.test(symbol);
  const lookup = isCrypto ? symbol.replace(/-USD$/i, "") : symbol;
  const family = isCrypto ? "crypto" : "ticker";
  return logoDevImagePath(family, lookup);
}

export function assetLogoNamePath(name: string): string {
  return logoDevImagePath("name", name.trim());
}

export function assetInitial(symbol: string): string {
  const clean = symbol.trim().replace(/^[^A-Za-z0-9]+/, "");
  return (clean[0] || "?").toUpperCase();
}
