import React from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { normalizeInstructorSpokenLanguage } from '@ski-academy/shared-domain/canonical/instructorSpokenLanguage';
import { Instructor } from '../../../types';
import { Star, Globe } from 'lucide-react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { useCurrency } from '../../../app/providers/CurrencyContext';
import { INSTRUCTOR_SPOKEN_LANGUAGE_KEYS } from '../../../lib/i18n/instructorLanguages';
import { selectInstructorBio } from '../../../lib/i18n/instructorBio';
import { resolveInstructorHourlyRateKztForDisplay } from '../../../domain/pricing';

interface InstructorCardProps {
  instructor: Instructor;
  onBook: (instructor: Instructor) => void;
  onViewReviews?: (instructor: Instructor) => void;
  bookLabel?: string;
  actions?: React.ReactNode;
  blocked?: boolean;
  bookingAllowed?: boolean;
  hideEmptyReviews?: boolean;
}

export const InstructorCard = React.forwardRef<HTMLDivElement, InstructorCardProps>(
  (
    {
      instructor,
      onBook,
      onViewReviews,
      bookLabel,
      actions,
      blocked = false,
      bookingAllowed = true,
      hideEmptyReviews = false,
    },
    ref
  ) => {
    const { t, language } = useLanguage();
    const { formatPrice } = useCurrency();
    const shouldReduceMotion = useReducedMotion();

    const getSpecialtyLabel = (spec: Instructor['specialty']) => {
      switch (spec) {
        case 'ski':
          return t('specialtySki');
        case 'snowboard':
          return t('specialtySnowboard');
        case 'both':
          return t('instructorSpecialtyBoth');
      }
    };

    const getLanguageLabel = (lang: string) => {
      const code = normalizeInstructorSpokenLanguage(lang);
      return code ? t(INSTRUCTOR_SPOKEN_LANGUAGE_KEYS[code]) : lang;
    };
    const bio = selectInstructorBio(instructor, language);

    const specialtyText = getSpecialtyLabel(instructor.specialty);
    const specialtyMeta = `${specialtyText} • ${instructor.experienceYears}${t('yearShort')}`;
    const languagesText = instructor.languages.map(getLanguageLabel).join(', ');
    const isAvailable = instructor.isAvailable;
    const hourlyRateKzt = resolveInstructorHourlyRateKztForDisplay(instructor);
    const hasCanonicalRating = instructor.reviewsCount > 0 && instructor.rating !== null;
    const ratingLabel = hasCanonicalRating
      ? `${instructor.rating!.toFixed(1)} (${instructor.reviewsCount})`
      : t('instructorNoReviews');

    const ratingControl = onViewReviews ? (
      <button
        type="button"
        onClick={() => !blocked && onViewReviews(instructor)}
        disabled={blocked}
        className={`inline-flex items-center gap-1 type-button transition select-none bg-transparent border-0 p-0 ${blocked ? 'text-[var(--ink-dim)] cursor-not-allowed' : 'text-amber-500 hover:text-amber-400 hover:underline cursor-pointer'}`}
        title={t('readReviews')}
      >
        {hasCanonicalRating && (
          <Star
            className={`w-3 h-3 shrink-0 ${blocked ? 'fill-[var(--ink-dim)] stroke-[var(--ink-dim)]' : 'fill-amber-400 stroke-amber-500'}`}
            aria-hidden
          />
        )}
        <span>{ratingLabel}</span>
      </button>
    ) : (
      <span
        className={`inline-flex items-center gap-1 type-compact ${blocked ? 'text-[var(--ink-dim)]' : 'text-amber-500'}`}
      >
        {hasCanonicalRating && (
          <Star
            className={`w-3 h-3 shrink-0 ${blocked ? 'fill-[var(--ink-dim)] stroke-[var(--ink-dim)]' : 'fill-amber-400 stroke-amber-500'}`}
            aria-hidden
          />
        )}
        <span>{ratingLabel}</span>
      </span>
    );

    const specialtyChip = (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-md type-compact font-medium normal-case ${
          isAvailable && !blocked
            ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
            : 'bg-[var(--profile-bg)] text-[var(--ink-dim)]'
        }`}
      >
        {specialtyMeta}
      </span>
    );

    const languagesRow = (
      <div className="inline-flex flex-wrap items-center justify-center md:justify-start gap-1 type-compact text-[var(--ink-dim)]">
        <Globe className="w-3 h-3 shrink-0" />
        <span>{languagesText}</span>
      </div>
    );

    const priceBlock = (
      <div
        className={`type-metric-lg text-center md:text-left ${
          isAvailable ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)]'
        }`}
      >
        {hourlyRateKzt !== undefined ? formatPrice(hourlyRateKzt) : '—'}{' '}
        <span className="type-caption text-[var(--ink-dim)]">/ {t('hr')}</span>
      </div>
    );

    const canBook = isAvailable && !blocked && bookingAllowed;
    const bookButton = (
      <button
        type="button"
        onClick={() => canBook && onBook(instructor)}
        disabled={!canBook}
        className={`w-full md:w-auto px-6 py-2.5 whitespace-nowrap ${
          canBook ? 'btn-primary' : 'btn-secondary cursor-not-allowed opacity-70'
        }`}
      >
        {isAvailable ? (bookLabel ?? t('bookNow')) : t('instructorFull')}
      </button>
    );

    return (
      <m.div
        ref={ref}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1, margin: '50px 0px' }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitTransform: 'translate3d(0,0,0)',
          transform: 'translate3d(0,0,0)',
          willChange: 'opacity, transform',
        }}
        className={`ui-list-row relative w-full flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 group ${!isAvailable && !blocked ? 'opacity-70' : ''}`}
      >
        <div className="relative w-24 h-24 md:w-32 md:h-32 shrink-0">
          <img
            src={instructor.avatarUrl}
            alt={instructor.name}
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
            }}
            className={`ui-avatar w-full h-full object-cover transition-all duration-300 rounded-full ${blocked ? 'grayscale opacity-75' : ''}`}
          />
          {!isAvailable && (
            <span className="absolute bottom-0 right-0 translate-x-1 translate-y-1 rounded-md border-2 border-[var(--bg)] bg-[var(--ink)] px-2 py-0.5 type-caption text-[var(--bg)] font-medium normal-case">
              {t('instructorOffline')}
            </span>
          )}
          {actions && <div className="absolute right-0 top-0">{actions}</div>}
        </div>

        <div className={`flex-1 w-full min-w-0 flex flex-col ${blocked ? 'opacity-80' : ''}`}>
          <div className="w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3 md:mb-4">
              <h3
                className={`type-card-title transition ${
                  isAvailable && !blocked
                    ? 'text-[var(--ink)] group-hover:text-[var(--accent)] type-card-title'
                    : `${blocked ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)]'} type-card-title`
                }`}
              >
                {instructor.name}
              </h3>
              {(!hideEmptyReviews || instructor.reviewsCount > 0) && (
                <div className="flex justify-center md:justify-end">{ratingControl}</div>
              )}
            </div>

            <p className="type-compact text-[var(--ink-dim)] max-w-2xl mx-auto md:mx-0 mb-5 md:mb-6">
              {bio}
            </p>
          </div>

          <div className="flex md:hidden flex-col items-center gap-3 mb-5">
            {specialtyChip}
            {languagesRow}
          </div>

          <div
            className="w-full border-t border-[var(--border)] mb-5 md:mb-6"
            role="separator"
            aria-hidden="true"
          />

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-6">
            <div className="hidden md:flex flex-wrap items-center gap-5 min-w-0">
              {specialtyChip}
              {languagesRow}
            </div>

            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-6 w-full md:w-auto md:justify-end">
              {priceBlock}
              {(blocked || bookingAllowed) && bookButton}
            </div>
          </div>
        </div>
      </m.div>
    );
  }
);
InstructorCard.displayName = 'InstructorCard';
