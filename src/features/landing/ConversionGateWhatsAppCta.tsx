import type { Language } from '../../lib/i18n/translations';
import { WHATSAPP_URL, getConversionGateCopy, resolveWhatsAppHref } from './conversionGateCopy';

export type ConversionGateWhatsAppPlacement =
  'header' | 'header-menu' | 'sticky' | 'hero' | 'instructor-card' | 'course-card';

interface ConversionGateWhatsAppCtaProps {
  language: Language;
  placement: ConversionGateWhatsAppPlacement;
  className?: string;
}

/**
 * WhatsApp control. Renders nothing while public WhatsApp is off (`WHATSAPP_URL` null).
 */
export function ConversionGateWhatsAppCta({
  language,
  placement,
  className,
}: ConversionGateWhatsAppCtaProps) {
  const href = resolveWhatsAppHref(WHATSAPP_URL);
  if (!href) return null;
  const copy = getConversionGateCopy(language);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`conversion-gate-whatsapp-${placement}`}
      className={className}
    >
      {copy.waLabel}
    </a>
  );
}

/** RU caption shown beside Book Lesson only while WhatsApp is the primary CTA. */
export function ConversionGateBookBesideNote({ language }: { language: Language }) {
  if (!resolveWhatsAppHref(WHATSAPP_URL)) return null;
  const note = getConversionGateCopy(language).bookBesideWa;
  if (!note) return null;
  return (
    <p className="text-sm text-[var(--ink-dim)]" data-testid="conversion-gate-book-beside">
      {note}
    </p>
  );
}

/** Sticky prompt plus WhatsApp button. Hidden while the URL is unset. */
export function ConversionGateStickyWhatsApp({ language }: { language: Language }) {
  const href = resolveWhatsAppHref(WHATSAPP_URL);
  if (!href) return null;
  const copy = getConversionGateCopy(language);
  return (
    <div
      className="conversion-gate-sticky sticky top-[var(--app-navbar-height,60px)] z-30 flex flex-wrap items-center justify-center gap-3 px-4 py-2 bg-[var(--bg)]/95 border-b border-[var(--border)]"
      data-testid="conversion-gate-whatsapp-sticky"
    >
      {copy.waStickyPrompt ? (
        <p className="text-sm text-[var(--ink)]">{copy.waStickyPrompt}</p>
      ) : null}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary px-4 py-2 text-sm"
      >
        {copy.waLabel}
      </a>
    </div>
  );
}
