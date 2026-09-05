import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Instructor } from '../../../types';
import { Star, Globe } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../app/providers/LanguageContext';
import { useCurrency } from '../../../app/providers/CurrencyContext';

interface InstructorCardProps {
  instructor: Instructor;
  onBook: (instructor: Instructor) => void;
  onViewReviews?: (instructor: Instructor) => void;
  bookLabel?: string;
}

export const InstructorCard = React.forwardRef<HTMLDivElement, InstructorCardProps>(
  ({ instructor, onBook, onViewReviews, bookLabel }, ref) => {
    const { t } = useLanguage();
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
      const mapping: Record<string, TranslationKey> = {
        English: 'languageEnglishShort',
        German: 'languageGermanShort',
        French: 'languageFrenchShort',
        Russian: 'languageRussianShort',
        Italian: 'languageItalianShort',
        Spanish: 'languageSpanishShort',
      };
      return mapping[lang] ? t(mapping[lang]) : lang;
    };

    const specialtyText = getSpecialtyLabel(instructor.specialty);
    const specialtyMeta = `${specialtyText} • ${instructor.experienceYears}${t('yearShort')}`;
    const languagesText = instructor.languages.map(getLanguageLabel).join(', ');
    const isAvailable = instructor.isAvailable;

    const ratingControl = onViewReviews ? (
      <button
        type="button"
        onClick={() => onViewReviews(instructor)}
        className="inline-flex items-center gap-1 text-sm text-amber-500 hover:text-amber-400 hover:underline transition select-none font-sans bg-transparent border-0 p-0 cursor-pointer"
        title={t('readReviews')}
      >
        <Star className="w-3 h-3 fill-amber-400 stroke-amber-500 shrink-0" />
        <span>
          {instructor.rating.toFixed(1)} ({instructor.reviewsCount})
        </span>
      </button>
    ) : (
      <span className="inline-flex items-center gap-1 text-sm text-amber-500 font-sans">
        <Star className="w-3 h-3 fill-amber-400 stroke-amber-500 shrink-0" />
        <span>
          {instructor.rating.toFixed(1)} ({instructor.reviewsCount})
        </span>
      </span>
    );

    const specialtyChip = (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-bold normal-case ${
          isAvailable
            ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
            : 'bg-[var(--profile-bg)] text-[var(--ink-dim)]'
        }`}
      >
        {specialtyMeta}
      </span>
    );

    const languagesRow = (
      <div className="inline-flex flex-wrap items-center justify-center md:justify-start gap-1 text-sm lowercase text-[var(--ink-dim)] font-sans">
        <Globe className="w-3 h-3 shrink-0" />
        <span>{languagesText}</span>
      </div>
    );

    const priceBlock = (
      <div
        className={`font-serif font-light text-4xl text-center md:text-left ${
          isAvailable ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)]'
        }`}
      >
        {instructor.pricePerHourKZT != null && Number.isFinite(instructor.pricePerHourKZT)
          ? formatPrice(instructor.pricePerHourKZT)
          : '—'}{' '}
        <span className="text-xs tracking-wider text-[var(--ink-dim)] font-sans">/ {t('hr')}</span>
      </div>
    );

    const bookButton = (
      <button
        type="button"
        onClick={() => isAvailable && onBook(instructor)}
        disabled={!isAvailable}
        className={`w-full md:w-auto px-6 py-2.5 whitespace-nowrap ${
          isAvailable ? 'btn-primary' : 'btn-secondary cursor-not-allowed opacity-70'
        }`}
      >
        {isAvailable ? (bookLabel ?? t('bookNow')) : t('instructorFull')}
      </button>
    );

    return (
      <motion.div
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
        className={`ui-list-row w-full max-w-6xl flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 group ${
          !isAvailable ? 'opacity-70' : ''
        }`}
      >
        <div className="ui-avatar relative w-24 h-24 md:w-32 md:h-32 shrink-0">
          <img
            src={instructor.avatarUrl}
            alt={instructor.name}
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
            }}
            className="w-full h-full object-cover transition-all duration-300 rounded-full"
          />
          {!isAvailable && (
            <span className="absolute bottom-0 right-0 translate-x-1 translate-y-1 rounded-md border-2 border-[var(--bg)] bg-[var(--ink)] px-2 py-0.5 text-xs tracking-wider text-[var(--bg)] font-sans font-bold normal-case">
              {t('instructorOffline')}
            </span>
          )}
        </div>

        <div className="flex-1 w-full min-w-0 flex flex-col">
          <div className="w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3 md:mb-4">
              <h3
                className={`font-serif font-light tracking-tight text-3xl transition ${
                  isAvailable
                    ? 'text-[var(--ink)] group-hover:text-[var(--accent)]'
                    : 'text-[var(--ink-dim)]'
                }`}
              >
                {instructor.name}
              </h3>
              <div className="flex justify-center md:justify-end">{ratingControl}</div>
            </div>

            <p className="text-sm text-[var(--ink-dim)] leading-relaxed max-w-2xl mx-auto md:mx-0 mb-5 md:mb-6">
              {instructor.bio}
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
              {bookButton}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);
InstructorCard.displayName = 'InstructorCard';
