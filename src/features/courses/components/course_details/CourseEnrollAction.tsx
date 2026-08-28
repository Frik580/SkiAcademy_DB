import React from 'react';
import { Calendar, Clock, ShieldCheck } from 'lucide-react';
import { Course, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import type { CourseCatalogOperationalState } from '../../../course-enrollments';

interface CourseEnrollActionProps {
  course: Course;
  datePart: string;
  timePart: string;
  seatsPercentage: number;
  catalogOperational?: CourseCatalogOperationalState;
  userProfile: UserProfile | null;
  isEnrolled: boolean;
  onEnroll: (courseId: string) => void;
  onClose: () => void;
}

export const CourseEnrollAction: React.FC<CourseEnrollActionProps> = ({
  course,
  datePart,
  timePart,
  seatsPercentage,
  catalogOperational,
  userProfile,
  isEnrolled,
  onEnroll,
  onClose,
}) => {
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();
  const availableSeats = catalogOperational?.availableSeats ?? course.availableSeats;
  const totalSeats = catalogOperational?.totalSeats ?? course.totalSeats;
  const isFull = catalogOperational?.isFull ?? availableSeats === 0;
  const isCapacityFrozen = catalogOperational?.isCapacityFrozen ?? false;
  const isEnrollmentEligible = catalogOperational?.isEnrollmentEligible ?? !isFull;
  const displayPriceMinorUnits = catalogOperational?.priceMinorUnits ?? course.priceKZT ?? course.price;

  return (
    <div className="relative">
      <div className="lg:sticky lg:top-8 border border-[var(--border)] bg-black/5 dark:bg-black/40 p-6 space-y-6">
        <div>
          <span className="text-[9px] font-mono uppercase text-sky-500 tracking-widest font-bold">
            {t('courseActiveEnrollment')}
          </span>
          <h3 className="text-lg font-serif font-light text-[var(--ink)] leading-snug mt-1">
            {course.title}
          </h3>
        </div>

        <div className="border border-[var(--border)]/60 bg-[var(--bg)] p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Calendar className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block leading-none mb-1">
                {t('courseDates')}
              </span>
              <span className="text-xs text-[var(--ink)] font-bold font-mono">{datePart}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 border-t border-[var(--border)]/30 pt-3">
            <Clock className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block leading-none mb-1">
                {t('courseSchedule')}
              </span>
              <span className="text-xs text-[var(--ink)] font-bold font-mono">{timePart}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono uppercase">
            <span className="text-[var(--ink-dim)]">{t('courseGroupSpace')}</span>
            <span
              className={`font-bold ${isFull ? 'text-rose-500' : availableSeats <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}
            >
              {isFull
                ? t('courseSoldOutUpper')
                : `${availableSeats} ${t('courseSeatsOf')} ${totalSeats} ${t('courseSeatsLeft')}`}
            </span>
          </div>

          <div className="w-full h-1.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isFull
                  ? 'bg-rose-500'
                  : availableSeats <= 3
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, seatsPercentage))}%` }}
            />
          </div>
        </div>

        <div className="border-t border-b border-[var(--border)]/50 py-4 flex items-baseline justify-between">
          <div>
            <span className="text-[9px] font-mono uppercase text-[var(--ink-dim)] block">
              {t('courseTotalTuition')}
            </span>
            <span className="text-[9px] text-[var(--ink-dim)] italic font-light">
              {t('courseAllDaysIncluded')}
            </span>
          </div>
          <span className="text-3xl font-serif text-[var(--ink)] font-light">
            {formatPrice(course.price, displayPriceMinorUnits)}
          </span>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              onEnroll(course.id);
              onClose();
            }}
            disabled={
              (!isEnrolled && (isFull || isCapacityFrozen || !isEnrollmentEligible)) ||
              userProfile?.isClientActive === false
            }
            className={`w-full py-3.5 font-mono text-[10px] uppercase tracking-widest transition rounded-none font-bold ${
              isEnrolled
                ? 'bg-black/5 dark:bg-black/60 border border-[var(--border)]/60 text-[var(--ink-dim)] cursor-default'
                : userProfile?.isClientActive === false
                  ? 'border border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10'
                  : isFull || isCapacityFrozen || !isEnrollmentEligible
                    ? 'btn-secondary cursor-not-allowed opacity-60'
                    : 'btn-primary cursor-pointer shadow-md'
            }`}
          >
            {isEnrolled ? (
              <span className="flex items-center justify-center gap-1.5 normal-case font-sans text-xs">
                <span className="text-emerald-500 font-bold text-sm">✔</span> {t('courseEnrolled')}
              </span>
            ) : userProfile?.isClientActive === false ? (
              t('accessSuspended')
            ) : isCapacityFrozen || isFull || !isEnrollmentEligible ? (
              t('courseSoldOut')
            ) : (
              t('courseConfirmBooking')
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[9px] text-[var(--ink-dim)] font-mono uppercase">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>{t('courseFreeCancellation')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
