import React from 'react';
import { Calendar } from 'lucide-react';
import {
  translateCourse,
  splitCourseDates,
  formatCourseCardDuration,
  useLanguage,
  type Language,
} from '../../../app/providers/LanguageContext';
import { Booking, Course, UserProfile } from '../../../types';
import {
  courseLevelBadgeLabel,
  getCourseLevelCardBadgeClass,
} from '../../../domain/course';
import { useCurrency } from '../../../app/providers/CurrencyContext';
import {
  getCourseEnrollmentBooking,
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../features/student-cabinet/lessonRecommendations';
import { RecommendationIndicator } from '../../../features/profile';

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

export interface GroupCourseCardProps {
  rawCourse: Course;
  bookings: Booking[];
  userProfile: UserProfile | null;
  language: Language;
  onViewDetails: (course: Course) => void;
  onRequireAuth: (course: Course) => void;
  onBookCourse: (courseId: string) => void;
  className?: string;
}

export const GroupCourseCard: React.FC<GroupCourseCardProps> = ({
  rawCourse,
  bookings,
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
  const isEnrolled = bookings.some(
    (b) =>
      b.userId === userProfile?.uid &&
      b.instructorId === `course_${course.id}` &&
      b.status !== 'cancelled'
  );
  const { datePart } = splitCourseDates(course.dates, language);
  const cardDate = datePart ? formatCourseCardDate(datePart) : '';
  const cardDuration = formatCourseCardDuration(course.duration);
  const enrollmentBooking = getCourseEnrollmentBooking(bookings, userProfile?.uid, course.id);
  const showRecommendations = hasBookingRecommendations(enrollmentBooking);

  return (
    <article
      className={`ui-card flex flex-col relative overflow-hidden group theme-air:bg-[var(--card-bg)] ${className}`}
    >
      <div className="aspect-[4/3] relative overflow-hidden shrink-0 theme-air:rounded-t-[var(--radius)]">
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
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full theme-air:font-sans theme-air:normal-case theme-air:text-xs">
                {course.badge}
              </span>
            )}
          </div>
        )}
        <img
          src={
            course.bgImageUrl ||
            'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800'
          }
          referrerPolicy="no-referrer"
          alt={course.title}
          className="w-full h-full object-cover transition-all duration-500 scale-100 group-hover:scale-105"
        />
      </div>

      <div className="p-5 lg:p-6 flex-1 flex flex-col justify-between">
        <div className="flex flex-col gap-4">
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-serif text-[1.375rem] sm:text-2xl font-normal leading-[1.2] tracking-[-0.02em] flex items-start gap-2 min-w-0 flex-1 text-[var(--ink)]">
                <span className="min-w-0">{course.title}</span>
                {showRecommendations && (
                  <RecommendationIndicator pending={hasPendingRecommendations(enrollmentBooking)} />
                )}
              </h4>
              {rawCourse.level && (
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[8px] font-medium uppercase tracking-[0.08em] opacity-80 mt-[0.3em] ${getCourseLevelCardBadgeClass(rawCourse.level)}`}
                >
                  {courseLevelBadgeLabel[rawCourse.level]}
                </span>
              )}
            </div>

            {(cardDate || cardDuration) && (
              <div className="space-y-0.5 font-sans">
                {cardDate && (
                  <p className="flex items-center gap-1.5 text-xs text-[var(--ink-dim)]/80">
                    <Calendar
                      className="h-3 w-3 shrink-0 text-[var(--ink-dim)]/50"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="tracking-[0.01em]">{cardDate}</span>
                  </p>
                )}
                {cardDuration && (
                  <p
                    className={`text-[11px] leading-tight tracking-wide text-[var(--ink-dim)]/55 ${cardDate ? 'pl-[18px]' : ''}`}
                  >
                    {cardDuration}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-[0.8125rem] leading-[1.6] text-[var(--ink-dim)]/90 font-sans">
            {course.shortDescription || course.description}
          </p>
        </div>

        <div className="mt-3 space-y-4 pt-1">
          <div className="space-y-1">
            <p className="text-[1.75rem] sm:text-3xl font-serif font-light tracking-[-0.03em] text-[var(--ink)] leading-none">
              {formatPrice(rawCourse.price, rawCourse.priceKZT)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-dim)]/60 font-sans">
              {t('perCourse')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onViewDetails(rawCourse)}
              className="btn-secondary px-4 py-2 theme-air:bg-transparent theme-air:hover:bg-[var(--profile-bg)]"
            >
              {t('courseDetails')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!userProfile) {
                  onRequireAuth(rawCourse);
                } else {
                  onBookCourse(course.id);
                }
              }}
              disabled={
                (course.availableSeats === 0 && !isEnrolled) ||
                userProfile?.isClientActive === false
              }
              className={`flex-1 min-w-0 px-5 py-2 ${
                isEnrolled
                  ? 'btn-secondary cursor-default'
                  : userProfile?.isClientActive === false
                    ? 'border border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                    : course.availableSeats === 0
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
              ) : course.availableSeats === 0 ? (
                t('courseSoldOut')
              ) : (
                t('enroll')
              )}
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
