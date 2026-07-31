import React, { useMemo } from 'react';
import { Booking, Course, Instructor, Review, UserProfile, ActivityLog } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { useLanguage, translateInstructor } from '../../../lib/LanguageContext';
import { GroupCourseCard, sortVisibleCourses } from '../../GroupCourseCard';
import { InstructorCard } from '../../InstructorCard';
import {
  buildStudentHistory,
  getAchievements,
  getFirstName,
  getGreeting,
  getLevelName,
  getLevelProgressPercent,
  getMiniCalendarDays,
  getRecommendedCourses,
  getRecommendedInstructors,
  getTrainingStreakWeeks,
  getWeekBookedSessions,
  getNextCalendarSession,
  getNextSession,
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
import { StudentHistoryList } from './StudentHistoryList';
import { StudentNeedsAttention } from './StudentNeedsAttention';
import { TodayChecklist } from './TodayChecklist';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { SkillRadarChart } from './SkillRadarChart';
import {
  hasBookingRecommendations,
  hasPendingRecommendations,
} from '../../../lib/lessonRecommendations';

export interface StudentCabinetContext {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  dismissedReviewIds?: string[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onOpenSession: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onDismissReview?: (bookingId: string) => void;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onOpenDevelopmentSection: (sectionId: string) => void;
  onContinueDevelopment: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
  onPinSkillsToday?: (skillItemIds: string[]) => void | Promise<void>;
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

const HOME_PREVIEW_COUNT = 2;

export const StudentCabinetHome: React.FC<StudentCabinetHomeProps> = (props) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const {
    userProfile,
    bookings,
    courses,
    instructors,
    reviews,
    activityLogs = [],
    dismissedReviewIds = [],
    skillConfig,
    achievementsConfig,
    onOpenSession,
    onOpenLesson,
    onWriteReview,
    onDismissReview,
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
  const hideProgress = Boolean(userProfile.hideProgressTracking);
  const { percent, remaining } = getLevelProgressPercent(userProfile, skillConfig);

  const skillItems = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;

  const nextSession = getNextSession(bookings, courses);
  const nextSessionLessonLabel = nextSession
    ? nextSession.instructorId.startsWith('course_')
      ? getRecentLessonTitle(nextSession, courses, lang)
      : nextSession.notes
        ? `${getDifficultyShort(nextSession.difficulty)} — ${nextSession.notes}`
        : getDifficultyShort(nextSession.difficulty)
    : '';
  const todayTasks = getTodayTasks(userProfile, bookings, courses, lang, skillConfig);
  const history = useMemo(
    () =>
      buildStudentHistory(
        userProfile,
        bookings,
        courses,
        reviews,
        lang,
        t,
        activityLogs,
        dismissedReviewIds
      ),
    [userProfile, bookings, courses, reviews, lang, t, activityLogs, dismissedReviewIds]
  );
  const stats = getStudentStats(userProfile, bookings, skillItems);
  const achievements = useMemo(
    () =>
      getAchievements(
        userProfile,
        bookings,
        skillConfig,
        lang,
        activityLogs,
        reviews.filter((review) => review.userId === userProfile.uid),
        courses,
        achievementsConfig
      ),
    [userProfile, bookings, skillConfig, lang, activityLogs, reviews, courses, achievementsConfig]
  );
  const streakWeeks = useMemo(
    () => getTrainingStreakWeeks(bookings, activityLogs),
    [bookings, activityLogs]
  );
  const recommendedCourses = useMemo(
    () => getRecommendedCourses(userProfile, courses, bookings, HOME_PREVIEW_COUNT),
    [userProfile, courses, bookings]
  );
  const recommendedInstructors = useMemo(
    () =>
      getRecommendedInstructors(userProfile, instructors, bookings, HOME_PREVIEW_COUNT).map((ins) =>
        translateInstructor(ins, lang)
      ),
    [userProfile, instructors, bookings, lang]
  );
  const miniDays = getMiniCalendarDays(bookings, courses, lang);
  const weekSessions = getWeekBookedSessions(bookings, courses);
  const nextCal = getNextCalendarSession(bookings, courses, lang);
  const visibleCourses = sortVisibleCourses(courses);
  const previewCourses =
    recommendedCourses.length > 0
      ? recommendedCourses
      : visibleCourses.slice(0, HOME_PREVIEW_COUNT);
  const availableInstructors = useMemo(
    () => instructors.filter((ins) => ins.isAvailable).map((ins) => translateInstructor(ins, lang)),
    [instructors, lang]
  );
  const previewInstructors =
    recommendedInstructors.length > 0
      ? recommendedInstructors
      : availableInstructors.slice(0, HOME_PREVIEW_COUNT);
  const showCourseRecommendations = recommendedCourses.length > 0;
  const showInstructorRecommendations = recommendedInstructors.length > 0;

  const monthLabel = new Date()
    .toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'long',
    })
    .toUpperCase();

  return (
    <div className="space-y-0 pb-24 max-w-2xl mx-auto w-full px-4 sm:px-6 min-w-0">
      {/* Hero — greeting, level, progress, skill radar */}
      <section className="py-6 space-y-2.5 min-w-0">
        <p className="text-base sm:text-lg font-medium text-[var(--ink)] leading-snug break-words">
          {getGreeting(lang, getFirstName(userProfile.displayName))}
        </p>
        <p className="text-[10px] sm:text-xs font-medium tracking-wide sm:tracking-widest text-[var(--ink-dim)] uppercase leading-relaxed break-words">
          LEVEL {level} · {getLevelName(level, lang)}
        </p>
        {streakWeeks > 0 && (
          <p className="text-sm text-[var(--accent)] leading-snug">
            {t('scStreakWeeks').replace('{n}', String(streakWeeks))}
          </p>
        )}
        {!hideProgress && (
          <>
            <div className="space-y-2 pt-0.5 max-w-full">
              <ScProgressBar percent={percent} variant="apple" showLabel />
              <p className="text-xs sm:text-sm text-[var(--ink-dim)] leading-snug">
                {t('scPointsToNextLevel').replace('{n}', String(remaining))}
              </p>
            </div>
            <div className="pt-3 min-w-0 w-full">
              <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)] mb-2.5">
                {t('scRadarTitle')}
              </p>
              <SkillRadarChart
                userProfile={userProfile}
                skillConfig={skillConfig}
                onToggleSkillToday={props.onToggleSkillToday}
                compact
                embed
              />
            </div>
          </>
        )}
        <div className="pt-1">
          <ScTextButton arrow onClick={onContinueDevelopment}>
            {t('scContinueDevelopment')}
          </ScTextButton>
        </div>
      </section>

      {achievements.length > 0 && (
        <>
          <ScDivider />
          <section className="py-6 space-y-3">
            <ScSectionTitle>{t('scRecentAchievements')}</ScSectionTitle>
            <div className="flex flex-wrap gap-2">
              {achievements.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex flex-col gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-1.5 text-sm text-[var(--ink)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </span>
                  {item.earnedAtLabel && (
                    <span className="text-[10px] text-[var(--ink-dim)] pl-6">{item.earnedAtLabel}</span>
                  )}
                </span>
              ))}
            </div>
          </section>
        </>
      )}

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
            <p className="flex items-center gap-2 flex-wrap text-base text-[var(--ink)]">
              <span>{nextSessionLessonLabel}</span>
              {hasBookingRecommendations(nextSession) && (
                <RecommendationIndicator pending={hasPendingRecommendations(nextSession)} />
              )}
            </p>
            <p className="text-sm text-[var(--ink-dim)]">
              {getRecentLessonInstructorLabel(nextSession, lang)}
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <ScTextButton onClick={() => onOpenLesson(nextSession)}>
                {t('scMoreDetails')}
              </ScTextButton>
              <ScTextButton onClick={() => onOpenSession(nextSession)}>{t('chat')}</ScTextButton>
            </div>
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
          onOpenDevelopment={onContinueDevelopment}
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

      {/* Courses preview */}
      <section className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <ScSectionTitle>{t('intensiveGroupCourses')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">
              {showCourseRecommendations ? t('scRecommendedCoursesSub') : t('intensiveGroupCoursesSub')}
            </p>
          </div>
          {visibleCourses.length > HOME_PREVIEW_COUNT && (
            <ScTextButton arrow onClick={() => onGoToTab('courses')}>
              {t('scViewAllCourses')}
            </ScTextButton>
          )}
        </div>
        {previewCourses.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('noIntensiveCoursesAvailable')}</p>
        ) : (
          <div
            className="grid gap-6 theme-air:gap-8"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {previewCourses.map((rawCourse) => (
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
        )}
      </section>

      <ScDivider />

      {/* Instructors preview */}
      <section className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <ScSectionTitle>{t('scInstructors')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">
              {showInstructorRecommendations ? t('scRecommendedInstructorsSub') : t('meetGuidesSub')}
            </p>
          </div>
          {availableInstructors.length > HOME_PREVIEW_COUNT && (
            <ScTextButton arrow onClick={() => onGoToTab('instructors')}>
              {t('scViewAllInstructors')}
            </ScTextButton>
          )}
        </div>
        {previewInstructors.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('noCoachesMatch')}</p>
        ) : (
          <div className="flex flex-col gap-8">
            {previewInstructors.map((ins) => (
              <InstructorCard
                key={ins.id}
                instructor={ins}
                onBook={onBookInstructor}
                onViewReviews={onViewInstructorReviews}
              />
            ))}
          </div>
        )}
      </section>

      {!hideProgress && (
        <>
          <ScDivider />

          {/* Stats */}
          <section className="py-6 space-y-4">
            <ScSectionTitle>{t('scMyStats')}</ScSectionTitle>
            <ScStatGrid
              items={[
                { label: t('scLessonsCount'), value: stats.lessons },
                { label: t('scHoursCount'), value: stats.hours },
                { label: t('scExercisesMastered'), value: stats.exercisesMastered },
                { label: t('scPointsEarned'), value: stats.points },
              ]}
            />
          </section>
        </>
      )}

      <ScDivider />

      {/* Needs attention — unreviewed lessons and open recommendations */}
      <StudentNeedsAttention
        bookings={bookings}
        reviews={reviews}
        userId={userProfile.uid}
        dismissedReviewIds={dismissedReviewIds}
        onOpenLesson={onOpenLesson}
        onWriteReview={onWriteReview}
        onDismissReview={onDismissReview}
      />

      {/* History — progress timeline */}
      <section className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <ScSectionTitle>{t('scHistory')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">{t('scHistorySubtitle')}</p>
          </div>
        </div>
        <StudentHistoryList
          events={history}
          bookings={bookings}
          courses={courses}
          reviews={reviews}
          dismissedReviewIds={dismissedReviewIds}
          filter="all"
          limit={5}
          onOpenLesson={onOpenLesson}
          onWriteReview={onWriteReview}
          onOpenDevelopment={onContinueDevelopment}
          onToggleRecommendation={onToggleRecommendation}
        />
        {history.length > 0 && (
          <ScTextButton arrow onClick={() => onGoToTab('history')}>
            {t('scHistoryShowAll')}
          </ScTextButton>
        )}
      </section>
    </div>
  );
};
