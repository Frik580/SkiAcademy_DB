import { CONVERSION_GATE_COPY, resolveWhatsAppHref } from './conversionGateCopy';

export type ConversionGateWhatsAppPlacement = 'header' | 'header-menu' | 'hero';

interface ConversionGateWhatsAppCtaProps {
  placement: ConversionGateWhatsAppPlacement;
  className?: string;
}

/**
 * WhatsApp control for the public gate.
 * Stays inert until Growth replaces `wa_url` with an https WhatsApp link.
 */
export function ConversionGateWhatsAppCta({ placement, className }: ConversionGateWhatsAppCtaProps) {
  const label = CONVERSION_GATE_COPY.waCtaLabel;
  const href = resolveWhatsAppHref(CONVERSION_GATE_COPY.waUrl);
  const testId = `conversion-gate-whatsapp-${placement}`;

  if (!href) {
    return (
      <span
        role="link"
        aria-disabled="true"
        data-testid={testId}
        data-growth-placeholder="wa_url"
        title={label}
        className={className}
      >
        {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      title={label}
      className={className}
    >
      {label}
    </a>
  );
}
