import React, { useMemo } from 'react';
import { Booking, Course, Instructor, Review, UserProfile } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG, calculateSkillProgress } from '../../../lib/skillData';
import { useLanguage, translateInstructor } from '../../../lib/LanguageContext';
import { GroupCourseCard, sortVisibleCourses } from '../../GroupCourseCard';
import { InstructorCard } from '../../InstructorCard';
import {
  getHistoryEvents,
  getLevelName,
  getLevelProgressPercent,
  getMiniCalendarDays,
  getWeekBookedSessions,
  getNextCalendarSession,
  getNextSession,
  getRecentLessons,
  getStudentStats,
  getTodayTasks,
  formatSessionDayLabel,
  addMinutesToTime,
  getDifficultyShort,
  resolveBookingStartDate,
  getRecentLessonTitle,
  getRecentLessonInstructorLabel,
  StudentCabinetTab,
} from './studentCabinetUtils';
import {
  ScDivider,
  ScProgressBar,
  ScSectionTitle,
  ScStatGrid,
  ScTextButton,
} from './StudentCabinetUI';
import { LessonRecommendationsList } from '../LessonRecommendationsList';
import { RecommendationIndicator } from '../RecommendationIndicator';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../lib/lessonRecommendations';
import { StudentActivityRings } from './StudentActivityRings';
import { TodayChecklist } from './TodayChecklist';

export interface StudentCabinetContext {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  reviews: Review[];
  skillConfig?: SkillConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenDevelopmentSection: (sectionId: string) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: import('../../../lib/todayChecklist').TodayTaskRef) => void;
  onViewCourseDetails: (course: Course) => void;
  onRequireCourseAuth: (course: Course) => void;
  onBookCourse: (courseId: string) => void;
  onBookInstructor: (instructor: Instructor) => void;
  onViewInstructorReviews: (instructor: Instructor) => void;
}

type StudentCabinetHomeProps = StudentCabinetContext;

export const StudentCabinetHome: React.FC<StudentCabinetHomeProps> = (props) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const {
    userProfile,
    bookings,
    courses,
    instructors,
    reviews,
    skillConfig,
    onOpenSession,
    onOpenLesson,
    onGoToTab,
    onContinueDevelopment,
    onToggleRecommendation,
    onToggleTodayTaskComplete,
    onAddCustomTodayTask,
    onRemoveTodayTask,
    onViewCourseDetails,
    onRequireCourseAuth,
    onBookCourse,
    onBookInstructor,
    onViewInstructorReviews,
  } = props;

  const level = userProfile.level || 1;
  const { percent, remaining } = getLevelProgressPercent(userProfile, skillConfig);

  const skillItems = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const passPercentage = skillConfig?.passPercentage ?? DEFAULT_SKILL_CONFIG.passPercentage;
  const skillProgress = useMemo(
    () => calculateSkillProgress(userProfile.skillScores || {}, skillItems, level, passPercentage),
    [userProfile.skillScores, skillItems, level, passPercentage]
  );

  const activityRings = useMemo(
    () => [
      {
        label: t('technique'),
        percent: skillProgress.technique.percentage,
        color: '#BF5AF2',
      },
      {
        label: t('control'),
        percent: skillProgress.control.percentage,
        color: '#30D158',
      },
      {
        label: t('speed'),
        percent: skillProgress.speed.percentage,
        color: '#FF9F0A',
      },
    ],
    [skillProgress, t]
  );

  const nextSession = getNextSession(bookings, courses);
  const nextSessionLessonLabel = nextSession
    ? nextSession.instructorId.startsWith('course_')
      ? getRecentLessonTitle(nextSession, courses, lang)
      : nextSession.notes
        ? `${getDifficultyShort(nextSession.difficulty)} — ${nextSession.notes}`
        : getDifficultyShort(nextSession.difficulty)
    : '';
  const todayTasks = getTodayTasks(userProfile, bookings, courses, lang, skillConfig);
  const history = getHistoryEvents(userProfile, bookings, courses, lang, t);
  const recentLessons = getRecentLessons(bookings, reviews, courses, lang);
  const stats = getStudentStats(userProfile, bookings);
  const miniDays = getMiniCalendarDays(bookings, courses, lang);
  const weekSessions = getWeekBookedSessions(bookings, courses);
  const nextCal = getNextCalendarSession(bookings, courses, lang);
  const visibleCourses = sortVisibleCourses(courses);
  const availableInstructors = useMemo(
    () => instructors.filter((ins) => ins.isAvailable).map((ins) => translateInstructor(ins, lang)),
    [instructors, lang]
  );

  const monthLabel = new Date()
    .toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
    })
    .toUpperCase();

  return (
    <div className="space-y-0 pb-24 max-w-2xl mx-auto w-full px-4 sm:px-6 min-w-0">
      {/* Hero — level + activity rings */}
      <section className="py-6 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 sm:gap-6 sm:items-center">
        <div className="space-y-2 min-w-0">
          <p className="text-xs font-medium tracking-widest text-[var(--ink-dim)] uppercase">
            LEVEL {level} · {getLevelName(level, lang)}
          </p>
          <ScProgressBar percent={percent} variant="apple" showLabel />
          <p className="text-sm text-[var(--ink-dim)]">
            {t('scPointsToNextLevel').replace('{n}', String(remaining))}
          </p>
          <div className="pt-2 flex justify-center sm:hidden">
            <StudentActivityRings rings={activityRings} layout="row" size={104} />
          </div>
          <ScTextButton arrow onClick={onContinueDevelopment}>
            {t('scContinueDevelopment')}
          </ScTextButton>
        </div>
        <div className="hidden sm:flex justify-end">
          <StudentActivityRings rings={activityRings} layout="row" size={104} />
        </div>
      </section>

      <ScDivider />

      {/* Next session */}
      <section className="py-6 space-y-4">
        <ScSectionTitle>{t('scNextSession')}</ScSectionTitle>
        {nextSession ? (
          <div className="space-y-1">
            <p className="text-sm text-[var(--ink-dim)]">
              {formatSessionDayLabel(resolveBookingStartDate(nextSession, courses), lang, t)}
            </p>
            <p className="text-2xl font-serif font-light text-[var(--ink)]">
              {nextSession.time}–{addMinutesToTime(nextSession.time, nextSession.durationHours)}
            </p>
            <button
              type="button"
              onClick={() => onOpenSession(nextSession)}
              className="flex items-center gap-2 flex-wrap text-base text-[var(--ink)] hover:text-[var(--accent)] transition text-left"
            >
              <span>{nextSessionLessonLabel}</span>
              {hasBookingRecommendations(nextSession) && (
                <RecommendationIndicator pending={hasPendingRecommendations(nextSession)} />
              )}
            </button>
            <p className="text-sm text-[var(--ink-dim)]">
              {getRecentLessonInstructorLabel(nextSession, lang)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoUpcomingSession')}</p>
        )}
      </section>

      <ScDivider />

      {/* Today */}
      <section className="py-6 space-y-3">
        <ScSectionTitle>{t('scTodaySection')}</ScSectionTitle>
        <TodayChecklist
          tasks={todayTasks}
          bookings={bookings}
          onToggleRecommendation={onToggleRecommendation}
          onToggleTaskComplete={onToggleTodayTaskComplete}
          onAddTask={onAddCustomTodayTask}
          onRemoveTask={onRemoveTodayTask}
          onOpenLesson={onOpenLesson}
        />
      </section>

      <ScDivider />

      {/* Mini calendar — current week booked sessions */}
      <section className="py-6 space-y-4">
        <div className="flex items-center justify-between">
          <ScSectionTitle>{monthLabel}</ScSectionTitle>
          <ScTextButton onClick={() => onGoToTab('calendar')}>{t('scFullCalendar')}</ScTextButton>
        </div>
        <div className="flex justify-between gap-1 text-center text-sm overflow-x-auto no-scrollbar pb-1">
          {miniDays.map(({ day, dateStr, hasSession, isToday, weekdayLabel }) => (
            <div key={dateStr} className="flex flex-col items-center gap-1 min-w-[2rem] flex-1">
              <span className="text-[10px] uppercase text-[var(--ink-dim)]">{weekdayLabel}</span>
              <span
                className={`text-[var(--ink)] ${isToday ? 'font-bold text-[var(--accent)]' : ''}`}
              >
                {day}
              </span>
              <span
                className={`text-[10px] ${
                  hasSession ? 'text-[var(--accent)]' : 'text-[var(--border)]'
                }`}
                title={hasSession ? t('bookedLesson') : t('noLessons')}
              >
                {hasSession ? '●' : '○'}
              </span>
            </div>
          ))}
        </div>
        {weekSessions.length > 0 ? (
          <ul className="space-y-2 pt-1">
            {weekSessions.map(({ booking, dateStr }) => (
              <li key={`${booking.id}-${dateStr}`} className="text-sm text-[var(--ink)]">
                <button
                  type="button"
                  onClick={() => onOpenSession(booking)}
                  className="w-full text-left hover:text-[var(--accent)] transition"
                >
                  <span className="text-[var(--ink-dim)]">
                    {formatSessionDayLabel(dateStr, lang, t)}
                  </span>
                  {' · '}
                  {booking.time}–{addMinutesToTime(booking.time, booking.durationHours)}
                  {' · '}
                  {getDifficultyShort(booking.difficulty)} — {booking.instructorName}
                  {hasBookingRecommendations(booking) && (
                    <>
                      {' '}
                      <RecommendationIndicator
                        pending={hasPendingRecommendations(booking)}
                        className="inline-flex align-middle"
                      />
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : nextCal ? (
          <p className="text-sm text-[var(--ink-dim)]">
            {t('scMiniCalendarNext')}: <span className="text-[var(--ink)]">{nextCal.label}</span>
          </p>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoUpcomingSession')}</p>
        )}
      </section>

      <ScDivider />

      {/* Recent lessons */}
      <section className="py-6 space-y-4">
        <ScSectionTitle>{t('scRecentLessons')}</ScSectionTitle>
        {recentLessons.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoRecentLessons')}</p>
        ) : (
          <div className="space-y-6">
            {recentLessons.map((lesson) => (
              <article
                key={lesson.id}
                className="space-y-2 pb-6 border-b border-[var(--border-subtle)] last:border-0"
              >
                <div className="flex justify-between items-baseline gap-2 flex-wrap">
                  <span className="font-medium text-[var(--ink)] flex items-center gap-2 min-w-0 flex-1">
                    <span className="break-words min-w-0">{lesson.title}</span>
                    {hasBookingRecommendations(lesson.booking) && (
                      <RecommendationIndicator
                        pending={hasPendingRecommendations(lesson.booking)}
                      />
                    )}
                  </span>
                  <span className="text-xs text-[var(--ink-dim)] shrink-0">{lesson.dateLabel}</span>
                </div>
                <p className="text-sm text-[var(--ink-dim)]">{lesson.instructorName}</p>
                <p className="text-amber-500 text-sm">
                  {'★'.repeat(lesson.rating)}
                  {'☆'.repeat(5 - lesson.rating)}
                </p>
                <LessonRecommendationsList
                  booking={lesson.booking}
                  onToggle={onToggleRecommendation}
                  compact
                />
                {lesson.reviewSnippet && (
                  <div className="text-sm space-y-1">
                    <p className="text-[var(--ink-dim)]">{t('scCoachReview')}</p>
                    <p className="text-[var(--ink)] italic">&ldquo;{lesson.reviewSnippet}&rdquo;</p>
                  </div>
                )}
                <ScTextButton onClick={() => onOpenLesson(lesson.booking)}>
                  {t('scMoreDetails')}
                </ScTextButton>
              </article>
            ))}
          </div>
        )}
      </section>

      <ScDivider />

      {/* Courses */}
      <section className="py-6 space-y-4">
        <div className="space-y-1">
          <ScSectionTitle>{t('intensiveGroupCourses')}</ScSectionTitle>
          <p className="text-sm text-[var(--ink-dim)]">{t('intensiveGroupCoursesSub')}</p>
        </div>
        <div
          className="grid gap-6 theme-air:gap-8"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          {visibleCourses.map((rawCourse) => (
            <GroupCourseCard
              key={rawCourse.id}
              rawCourse={rawCourse}
              bookings={bookings}
              userProfile={userProfile}
              language={lang}
              onViewDetails={onViewCourseDetails}
              onRequireAuth={onRequireCourseAuth}
              onBookCourse={onBookCourse}
              className="h-full"
            />
          ))}
        </div>
        {visibleCourses.length === 0 && (
          <p className="text-sm text-[var(--ink-dim)]">{t('noIntensiveCoursesAvailable')}</p>
        )}
      </section>

      <ScDivider />

      {/* Instructors */}
      <section className="py-6 space-y-6">
        <div className="space-y-1">
          <ScSectionTitle>{t('scInstructors')}</ScSectionTitle>
          <p className="text-sm text-[var(--ink-dim)]">{t('meetGuidesSub')}</p>
        </div>
        <div className="flex flex-col gap-8">
          {availableInstructors.map((ins) => (
            <InstructorCard
              key={ins.id}
              instructor={ins}
              onBook={onBookInstructor}
              onViewReviews={onViewInstructorReviews}
            />
          ))}
        </div>
        {availableInstructors.length === 0 && (
          <p className="text-sm text-[var(--ink-dim)]">{t('noCoachesMatch')}</p>
        )}
      </section>

      <ScDivider />

      {/* Stats */}
      <section className="py-6 space-y-4">
        <ScSectionTitle>{t('scMyStats')}</ScSectionTitle>
        <ScStatGrid
          items={[
            { label: t('scLessonsCount'), value: stats.lessons },
            { label: t('scHoursCount'), value: stats.hours },
            { label: t('scKilometersCount'), value: stats.kilometers },
            { label: t('scPointsEarned'), value: stats.points },
          ]}
        />
      </section>

      <ScDivider />

      {/* History */}
      <section className="py-6 space-y-4">
        <ScSectionTitle>{t('scHistory')}</ScSectionTitle>
        <div className="space-y-0">
          {history.map((ev, idx) => (
            <div key={ev.id}>
              <div className="py-4 space-y-1">
                <p className="text-xs text-[var(--ink-dim)]">{ev.dateLabel}</p>
                <p className="text-sm text-[var(--ink)]">
                  {ev.kind === 'training' && '✓ '}
                  {ev.title}
                </p>
                {ev.subtitle && <p className="text-sm text-[var(--ink-dim)]">{ev.subtitle}</p>}
              </div>
              {idx < history.length - 1 && <div className="h-px bg-[var(--border-subtle)]" />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
