import type { Language } from '../../lib/i18n/translations';
import { INSTAGRAM_URL, getConversionGateCopy, resolveInstagramHref } from './conversionGateCopy';

export type ConversionGateInstagramPlacement =
  'header' | 'header-menu' | 'sticky' | 'hero' | 'instructor-card' | 'course-card';

interface ConversionGateInstagramCtaProps {
  language: Language;
  placement: ConversionGateInstagramPlacement;
  className?: string;
}

/**
 * Instagram contact control. Renders nothing while the public URL is unset (`INSTAGRAM_URL` null).
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

/** RU caption shown beside the on-site book action only while Instagram is the primary CTA. */
export function ConversionGateBookBesideNote({ language }: { language: Language }) {
  if (!resolveInstagramHref(INSTAGRAM_URL)) return null;
  const note = getConversionGateCopy(language).bookBeside;
  if (!note) return null;
  return (
    <p className="text-sm text-[var(--ink-dim)]" data-testid="conversion-gate-book-beside">
      {note}
    </p>
  );
}

/** Sticky prompt plus Instagram button. Hidden while the URL is unset. */
export function ConversionGateStickyInstagram({ language }: { language: Language }) {
  const href = resolveInstagramHref(INSTAGRAM_URL);
  if (!href) return null;
  const copy = getConversionGateCopy(language);
  return (
    <div
      className="conversion-gate-sticky sticky top-[var(--app-navbar-height,60px)] z-30 flex flex-wrap items-center justify-center gap-3 px-4 py-2 bg-[var(--bg)]/95 border-b border-[var(--border)]"
      data-testid="conversion-gate-instagram-sticky"
    >
      {copy.stickyPrompt ? <p className="text-sm text-[var(--ink)]">{copy.stickyPrompt}</p> : null}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary px-4 py-2 text-sm"
      >
        {copy.contactLabel}
      </a>
    </div>
  );
}
