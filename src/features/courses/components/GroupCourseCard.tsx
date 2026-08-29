import React from 'react';
import { Calendar, Clock } from 'lucide-react';
import {
  translateCourse,
  splitCourseDates,
  formatCourseCardDuration,
  useLanguage,
  type Language,
} from '../../../app/providers/LanguageContext';
import { Course, UserProfile } from '../../../types';
import { courseLevelBadgeLabel, getCourseLevelCardBadgeClass } from '../../../domain/course';
import { useCurrency } from '../../../app/providers/CurrencyContext';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../features/student-cabinet/lessonRecommendations';
import { RecommendationIndicator } from '../../../features/profile';
import { optimizedImageUrl } from '../../../lib/optimizedImageUrl';
import type {
  CourseCatalogOperationalState,
  CourseEnrollmentCabinetItem,
} from '../../course-enrollments';
import { isEnrolledInCourse } from '../../course-enrollments';

const formatCourseCardDate = (datePart: string) =>
  datePart
    .replace(/\s*-\s*/g, '–')
    .replace(
      /\b(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\b/gi,
      (month) => month.toLowerCase()
    )
    .replace(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
      (month) => month.toLowerCase()
    );

const metaChipClass = (enrolled: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-sans text-[var(--ink-dim)] ${
    enrolled
      ? 'border-[var(--border)]/50 bg-[var(--profile-bg)]/70'
      : 'border-[var(--border)]/50 bg-[var(--profile-bg)]'
  }`;

export interface GroupCourseCardProps {
  rawCourse: Course;
  courseEnrollments: readonly CourseEnrollmentCabinetItem[];
  catalogOperational?: CourseCatalogOperationalState;
  userProfile: UserProfile | null;
  language: Language;
  onViewDetails: (course: Course) => void;
  onRequireAuth: (course: Course) => void;
  onBookCourse: (courseId: string) => void;
  className?: string;
}

export const GroupCourseCard: React.FC<GroupCourseCardProps> = ({
  rawCourse,
  courseEnrollments,
  catalogOperational,
  userProfile,
  language,
  onViewDetails,
  onRequireAuth,
  onBookCourse,
  className = '',
}) => {
  const { t } = useLanguage();
  const { formatPrice } = useCurrency();
  const course = translateCourse(rawCourse, language);
  const isEnrolled = isEnrolledInCourse(courseEnrollments, course.id);
  const availableSeats = catalogOperational?.availableSeats ?? rawCourse.availableSeats;
  const isFull = catalogOperational?.isFull ?? availableSeats === 0;
  const isCapacityFrozen = catalogOperational?.isCapacityFrozen ?? false;
  const isEnrollmentEligible = catalogOperational?.isEnrollmentEligible ?? !isFull;
  const displayPriceMinorUnits =
    catalogOperational?.priceMinorUnits ?? rawCourse.priceKZT ?? rawCourse.price;
  const scheduleStart = catalogOperational?.scheduleSummaryStartDate;
  const scheduleEnd = catalogOperational?.scheduleSummaryEndDate;
  const legacyDates = splitCourseDates(course.dates, language);
  const datePart =
    scheduleStart && scheduleEnd ? `${scheduleStart} – ${scheduleEnd}` : legacyDates.datePart;
  const cardDate = datePart ? formatCourseCardDate(datePart) : '';
  const cardDuration = formatCourseCardDuration(course.duration);
  const enrollmentBooking = undefined;
  const showRecommendations = hasBookingRecommendations(enrollmentBooking);

  const enrollDisabled =
    userProfile?.isClientActive === false ||
    (!isEnrolled && (isFull || isCapacityFrozen || !isEnrollmentEligible));

  return (
    <article
      className={`ui-card flex flex-col relative overflow-hidden bg-[var(--card-bg)] transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${className}`}
    >
      <div className="aspect-[4/3] relative overflow-hidden shrink-0 rounded-t-[var(--radius)]">
        {course.badge && (
          <div className="absolute top-3 left-3 z-10">
            {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) ||
            /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
              <img
                src={course.badge}
                referrerPolicy="no-referrer"
                alt="badge"
                className="h-7 w-auto object-contain max-w-[80px]"
              />
            ) : (
              <span className="text-[9px] font-bold text-white bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full font-sans normal-case text-xs">
                {course.badge}
              </span>
            )}
          </div>
        )}
        <img
          src={optimizedImageUrl(
            course.bgImageUrl ||
              'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800',
            960
          )}
          referrerPolicy="no-referrer"
          alt={course.title}
          loading="lazy"
          decoding="async"
          fetchpriority="low"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 523px"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="p-5 lg:p-6 flex-1 flex flex-col justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-serif text-[1.375rem] sm:text-2xl font-normal leading-[1.2] tracking-[-0.02em] flex items-start gap-2 min-w-0 flex-1 text-[var(--ink)]">
              <span className="min-w-0">{course.title}</span>
              {showRecommendations && (
                <RecommendationIndicator pending={hasPendingRecommendations(enrollmentBooking)} />
              )}
            </h4>
            {rawCourse.level && (
              <span
                className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isEnrolled ? 'opacity-70' : ''} ${getCourseLevelCardBadgeClass(rawCourse.level)}`}
              >
                {courseLevelBadgeLabel[rawCourse.level]}
              </span>
            )}
          </div>

          {(cardDate || cardDuration) && (
            <div className={`flex flex-wrap gap-2 ${isEnrolled ? 'opacity-80' : ''}`}>
              {cardDate && (
                <span className={metaChipClass(isEnrolled)}>
                  <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span>{cardDate}</span>
                </span>
              )}
              {cardDuration && (
                <span className={metaChipClass(isEnrolled)}>
                  <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span>{cardDuration}</span>
                </span>
              )}
            </div>
          )}

          <p className="text-[0.8125rem] leading-[1.6] text-[var(--ink-dim)]/90 font-sans">
            {course.shortDescription || course.description}
          </p>
        </div>

        <div className="mt-3 space-y-6 pt-1">
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-serif font-light tracking-[-0.03em] text-[var(--ink)] leading-none">
              {formatPrice(rawCourse.price, displayPriceMinorUnits)}
            </p>
            <p className="text-xs text-[var(--ink-dim)]/60 font-sans">{t('perCourse')}</p>
          </div>

          <div className="grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                if (!userProfile) {
                  onRequireAuth(rawCourse);
                } else {
                  onBookCourse(course.id);
                }
              }}
              disabled={enrollDisabled}
              className={`w-full min-w-0 px-3 py-2 ${
                isEnrolled
                  ? 'btn-secondary cursor-default'
                  : userProfile?.isClientActive === false
                    ? 'border border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                    : isFull || isCapacityFrozen || !isEnrollmentEligible
                      ? 'btn-secondary cursor-not-allowed opacity-60'
                      : 'btn-primary cursor-pointer'
              }`}
            >
              {isEnrolled ? (
                <span className="flex items-center justify-center gap-1">
                  <span className="text-emerald-500 font-bold text-xs">✔</span>{' '}
                  {t('courseEnrolled')}
                </span>
              ) : userProfile?.isClientActive === false ? (
                t('accessSuspended')
              ) : isCapacityFrozen ? (
                t('courseSoldOut')
              ) : isFull ? (
                t('courseSoldOut')
              ) : !isEnrollmentEligible ? (
                t('courseSoldOut')
              ) : (
                t('enroll')
              )}
            </button>
            <button
              type="button"
              onClick={() => onViewDetails(rawCourse)}
              className="btn-secondary w-full min-w-0 px-3 py-2 bg-transparent hover:!bg-transparent"
            >
              {t('courseDetails')}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

export const sortVisibleCourses = (courses: Course[]) =>
  [...courses]
    .filter((c) => !c.isHidden)
    .sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 999;
      const orderB = b.order !== undefined ? b.order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.title.localeCompare(b.title);
    });
