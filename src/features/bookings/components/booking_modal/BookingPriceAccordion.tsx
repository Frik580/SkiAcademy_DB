import React from 'react';
import { ChevronDown } from 'lucide-react';
import { type TranslationKey } from '../../../../app/providers/LanguageContext';

interface BookingPriceAccordionProps {
  hourlyRateLabel: string;
  duration: number;
  totalLabel: string;
  t: (key: TranslationKey) => string;
}

export const BookingPriceAccordion: React.FC<BookingPriceAccordionProps> = ({
  hourlyRateLabel,
  duration,
  totalLabel,
  t,
}) => (
  <details className="group border-b border-[var(--border)]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
      <span className="text-xs font-medium text-[var(--ink-dim)]">{t('totalLessonFee')}</span>
      <span className="flex items-center gap-2">
        <span className="text-lg font-extrabold text-[var(--accent)] font-sans">{totalLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ink-dim)] transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="space-y-2 border-t border-[var(--border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
      <div className="flex justify-between text-xs text-[var(--ink-dim)]">
        <span>{t('hourlyRate')}</span>
        <span className="font-medium text-[var(--ink)]">{hourlyRateLabel}</span>
      </div>
      <div className="flex justify-between text-xs text-[var(--ink-dim)]">
        <span>{t('hoursBooked')}</span>
        <span className="font-medium text-[var(--ink)]">× {duration}</span>
      </div>
    </div>
  </details>
);
