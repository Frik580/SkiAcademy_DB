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
        className={`ui-list-row w-full max-w-6xl flex flex-col sm:grid sm:grid-cols-[112px_1fr] items-center sm:items-start gap-6 group ${
          !instructor.isAvailable ? 'opacity-60' : ''
        }`}
      >
        <div className="ui-avatar relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden">
          <img
            src={instructor.avatarUrl}
            alt={instructor.name}
            style={{
              WebkitBackfaceVisibility: 'hidden',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
            }}
            className="w-full h-full object-cover filter grayscale group-hover:grayscale-0 transition-all duration-300 rounded-full"
          />
          {!instructor.isAvailable && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
              <span className="text-xs tracking-wider text-rose-400 font-bold normal-case font-sans">
                {t('instructorOffline')}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 w-full flex flex-col gap-5">
          <div className="space-y-2 w-full text-center sm:text-left">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 justify-center sm:justify-start">
              <h3 className="font-serif font-light text-[var(--ink)] tracking-tight group-hover:text-[var(--accent)] transition text-3xl">
                {instructor.name}
              </h3>
              {onViewReviews ? (
                <button
                  type="button"
                  onClick={() => onViewReviews(instructor)}
                  className="inline-flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-400 hover:underline transition select-none text-sm font-sans bg-transparent border-0 p-0 cursor-pointer"
                  title={t('readReviews')}
                >
                  <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" />
                  <span>
                    {instructor.rating.toFixed(1)} ({instructor.reviewsCount})
                  </span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 text-sm font-sans">
                  <Star className="w-3 h-3 fill-amber-400 stroke-amber-500" />
                  <span>
                    {instructor.rating.toFixed(1)} ({instructor.reviewsCount})
                  </span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--ink-dim)] leading-relaxed max-w-2xl text-sm leading-relaxed">
              {instructor.bio}
            </p>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 ui-divider-t pt-4">
            <div className="text-center md:text-left space-y-1 w-full md:w-auto text-xs text-[var(--ink-dim)] font-sans normal-case text-sm">
              <div className="text-[var(--ink)] font-bold">
                {specialtyText} • {instructor.experienceYears}
                {t('yearShort')}
              </div>
              <div className="flex flex-wrap gap-1 items-center justify-center md:justify-start text-[10px] lowercase text-[var(--ink-dim)] text-sm">
                <Globe className="w-3 h-3 shrink-0" />
                <span>{instructor.languages.map(getLanguageLabel).join(', ')}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center md:justify-end gap-3 w-full md:w-auto">
              <div className="font-serif text-[var(--ink)] font-light text-4xl">
                {formatPrice(instructor.pricePerHour, instructor.pricePerHourKZT)}{' '}
                <span className="text-[9px] tracking-wider text-[var(--ink-dim)] text-xs font-sans">
                  / {t('hr')}
                </span>
              </div>

              <button
                onClick={() => instructor.isAvailable && onBook(instructor)}
                disabled={!instructor.isAvailable}
                className={`px-5 py-2 ${instructor.isAvailable ? 'btn-primary' : 'btn-secondary'}`}
              >
                {instructor.isAvailable ? (bookLabel ?? t('bookNow')) : t('instructorFull')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }
);
InstructorCard.displayName = 'InstructorCard';
