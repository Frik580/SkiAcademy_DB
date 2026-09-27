import type { Language } from '../../lib/i18n/translations';
import { INSTAGRAM_URL, getConversionGateCopy, resolveInstagramHref } from './conversionGateCopy';

export type ConversionGateInstagramPlacement = 'header' | 'header-menu';

interface ConversionGateInstagramCtaProps {
  language: Language;
  placement: ConversionGateInstagramPlacement;
  className?: string;
}

/**
 * Guest navbar Instagram contact control.
 * Renders nothing while the public URL is unset or not an https Instagram link.
 */
export function ConversionGateInstagramCta({
  language,
  placement,
  className,
}: ConversionGateInstagramCtaProps) {
  const href = resolveInstagramHref(INSTAGRAM_URL);
  if (!href) return null;
  const copy = getConversionGateCopy(language);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`conversion-gate-instagram-${placement}`}
      className={className}
    >
      {copy.contactLabel}
    </a>
  );
}
