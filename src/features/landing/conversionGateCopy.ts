/**
 * Conversion-gate copy slots.
 *
 * Carve Growth replaces each `[[GROWTH_COPY: …]]` token in place.
 * Do not invent Russian marketing text, prices, or WhatsApp links here.
 */
export const CONVERSION_GATE_COPY = {
  heroLocation: '[[GROWTH_COPY: hero_location]]',
  heroProduct: '[[GROWTH_COPY: hero_product]]',
  waUrl: '[[GROWTH_COPY: wa_url]]',
  waCtaLabel: '[[GROWTH_COPY: wa_cta_label]]',
  startingPricePrefix: '[[GROWTH_COPY: starting_price_prefix]]',
  startingPriceFallback: '[[GROWTH_COPY: starting_price_line]]',
} as const;

export type ConversionGateCopyKey = keyof typeof CONVERSION_GATE_COPY;

const GROWTH_COPY_TOKEN = /^\[\[GROWTH_COPY:[a-z0-9_]+\]\]$/;

export function isGrowthCopyPlaceholder(value: string): boolean {
  return GROWTH_COPY_TOKEN.test(value.trim());
}

const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'web.whatsapp.com']);

/** Returns an https WhatsApp URL, or null while the Growth token is still a placeholder. */
export function resolveWhatsAppHref(url: string): string | null {
  if (isGrowthCopyPlaceholder(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!WHATSAPP_HOSTS.has(parsed.hostname)) return null;
  return parsed.toString();
}
