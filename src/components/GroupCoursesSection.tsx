import React from 'react';
import {
  translateCourse,
  splitCourseDates,
  useLanguage,
  type Language
} from '../lib/LanguageContext';
import { Booking, Course, UserProfile } from '../types';

interface GroupCoursesSectionProps {
  data: {
    courses: Course[];
    bookings: Booking[];
    userProfile: UserProfile | null;
    language: Language;
  };
  actions: {
    onViewDetails: (course: Course) => void;
    onRequireAuth: (course: Course) => void;
    onBookCourse: (courseId: string) => void;
  };
}

export const GroupCoursesSection: React.FC<GroupCoursesSectionProps> = ({
  data: { courses, bookings, userProfile, language },
  actions: { onViewDetails, onRequireAuth, onBookCourse }
}) => {
  const { t } = useLanguage();

  return (
    <div id="courses-grid" className="space-y-6">
    <div>
      <h3 className="text-2xl font-serif text-[var(--ink)] tracking-tight font-light">
        {t('intensiveGroupCourses')}
      </h3>
      <p className="text-xs text-[var(--ink-dim)] font-mono uppercase tracking-wider mt-1 text-slate-400 dark:text-slate-500">
        {t('intensiveGroupCoursesSub')}
      </p>
    </div>

    <div
      className="grid gap-6"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
    >
      {[...courses].sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 999;
        const orderB = b.order !== undefined ? b.order : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.title.localeCompare(b.title);
      }).filter(c => !c.isHidden).map((rawCourse) => {
        const course = translateCourse(rawCourse, language);
        const isEnrolled = bookings.some(b => b.userId === userProfile?.uid && b.instructorId === `course_${course.id}` && b.status !== 'cancelled');
        return (
          <div
            key={course.id}
            className="border border-[var(--border)] bg-black/5 dark:bg-black/40 flex flex-col h-full relative overflow-hidden group min-w-[260px]"
          >
            <div className="h-55 relative overflow-hidden shrink-0 border-b border-[var(--border)]">
              {course.badge && (
                <div className="absolute top-3 left-3 z-10">
                  {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) || /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
                    <img
                      src={course.badge}
                      referrerPolicy="no-referrer"
                      alt="badge"
                      className="h-7 w-auto object-contain max-w-[80px]"
                    />
                  ) : (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white border border-white/50 bg-transparent backdrop-blur-[2px] px-2 py-0.5 shadow-md">
                      {course.badge}
                    </span>
                  )}
                </div>
              )}
              <img
                src={course.bgImageUrl || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800'}
                referrerPolicy="no-referrer"
                alt={course.title}
                className="w-full h-full object-cover transition-all duration-500 scale-100 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
                <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400 bg-sky-950/40 border border-sky-900/50 px-2 py-0.5 self-start">
                  {course.duration}
                </span>
              </div>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h4 className="font-serif text-lg font-light text-[var(--ink)] leading-tight">
                  {course.title}
                </h4>
                {course.levelLabel && (
                  <div className={`text-[10px] font-mono uppercase tracking-wider font-bold flex items-center gap-1 mt-1 ${
                    course.level === 'beginner' ? 'text-emerald-600 dark:text-emerald-400' :
                    course.level === 'intermediate' ? 'text-amber-600 dark:text-amber-400' :
                    course.level === 'advanced' ? 'text-rose-600 dark:text-rose-400' :
                    course.level === 'expert' ? 'text-stone-500 dark:text-stone-400' : 'text-[var(--ink-dim)]'
                  }`}>
                    {course.levelLabel}
                  </div>
                )}
                <p className="text-xs text-[var(--ink)] leading-relaxed font-mono">
                  {course.shortDescription || course.description}
                </p>


              </div>

              <div className="space-y-4 pt-2">
                {(() => {
                  const { datePart, timePart } = splitCourseDates(course.dates);
                  return (
                    <div className="space-y-2 text-xs border-t border-[var(--border)]/40 pt-4">
                      <div className="flex items-center gap-2 text-[var(--ink-dim)] font-sans font-light">
                        <span className="text-sm">📅</span>
                        <span className="font-mono text-[11px] tracking-wide">{datePart}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--ink-dim)] font-sans font-light">
                        <span className="text-sm">🕘</span>
                        <span className="font-mono text-[11px] tracking-wide">{timePart}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[var(--ink)] font-sans font-light">
                        {course.availableSeats === 0 ? (
                          <>
                            <span className="text-sm">🔴</span>
                            <span className="font-mono text-[11px] tracking-wide text-rose-500 font-bold">
                              {t('noSeatsLeft')}
                            </span>
                          </>
                        ) : course.availableSeats <= 3 ? (
                          <>
                            <span className="text-sm">🟠</span>
                            <span className="font-mono text-[11px] tracking-wide text-amber-500 font-semibold">
                              {t('onlySeatsLeftPrefix')}{course.availableSeats}{t('onlySeatsLeftSuffix')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm">🟢</span>
                            <span className="font-mono text-[11px] tracking-wide text-emerald-500">
                              {course.availableSeats} {t('courseSeatsOf')} {course.totalSeats} {t('seatsAvailableSuffix')}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="border-t border-[var(--border)]/30 my-3 pt-3 flex justify-between items-baseline">
                        <span className="text-2xl font-serif text-[var(--ink)] font-light">${course.price}</span>
                        <span className="text-[9px] font-mono tracking-wider text-[var(--ink-dim)]">
                          {t('perCourse')}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-[2fr_3fr] gap-2">
                  <button
                    onClick={() => onViewDetails(rawCourse)}
                    className="w-full py-2 border border-[var(--border)] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 font-mono text-[10px] uppercase tracking-wider transition rounded-none cursor-pointer text-center text-[var(--ink)]"
                  >
                    {t('courseDetails')}
                  </button>
                  <button
                    onClick={() => {
                      if (!userProfile) {
                        onRequireAuth(rawCourse);
                      } else {
                        onBookCourse(course.id);
                      }
                    }}
                    disabled={(course.availableSeats === 0 && !isEnrolled) || userProfile?.isClientActive === false}
                    className={`w-full py-2 border font-mono text-[10px] uppercase tracking-wider transition rounded-none ${
                      isEnrolled
                        ? 'bg-black/0 dark:bg-black/0 border-[var(--border)]/60 text-[var(--ink-dim)] cursor-default'
                        : userProfile?.isClientActive === false
                          ? 'border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                          : course.availableSeats === 0
                            ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5'
                            : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer'
                    }`}
                  >
                    {isEnrolled
                      ? (
                        <span className="flex items-center justify-center gap-1 normal-case font-sans">
                          <span className="text-emerald-500 font-bold text-xs">✔</span>{' '}
                          {t('courseEnrolled')}
                        </span>
                      )
                      : userProfile?.isClientActive === false
                        ? t('accessSuspended')
                        : course.availableSeats === 0
                          ? t('courseSoldOut')
                          : `${t('enroll')} →`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    {courses.filter(c => !c.isHidden).length === 0 && (
      <div className="text-center py-12 border border-dashed border-[var(--border)] bg-black/5 dark:bg-white/5 font-mono text-[11px] text-[var(--ink-dim)]">
        {t('noIntensiveCoursesAvailable')}
      </div>
    )}
    </div>
  );
};
