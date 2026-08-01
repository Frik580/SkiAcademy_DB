import React, { useMemo } from 'react';
import { Booking, Course, Instructor, Review, UserProfile, ActivityLog } from '../../../types';
import { SkillConfig, DEFAULT_SKILL_CONFIG } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { useLanguage, translateInstructor } from '../../../lib/LanguageContext';
import { formatPointsCount } from '../../../lib/i18n/pluralize';
import { getUserLevelBadgeClass } from '../../../lib/courseLevelStyles';
import { GroupCourseCard, sortVisibleCourses } from '../../GroupCourseCard';
import { InstructorCard } from '../../InstructorCard';
import {
  buildStudentHistory,
  getAchievements,
  getFirstName,
  getGreeting,
  getNextStepAction,
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
  ScTintCard,
} from './StudentCabinetUI';
import { StudentHistoryList } from './StudentHistoryList';
import { StudentNeedsAttention } from './StudentNeedsAttention';
import { TodayChecklist } from './TodayChecklist';
import { RecommendationIndicator } from '../RecommendationIndicator';
import { SkillRadarChart } from './SkillRadarChart';
import { StudentNextStepCard } from './StudentNextStepCard';
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
    onToggleSkillToday,
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

  const nextStepAction = useMemo(
    () => getNextStepAction(userProfile, bookings, skillConfig),
    [userProfile, bookings, skillConfig]
  );

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
    <div className="space-y-0 pb-24 max-w-3xl mx-auto w-full px-4 sm:px-6 min-w-0">
      {/* Hero — greeting, level, progress, skill radar */}
      <section className="py-6 space-y-2.5 min-w-0">
        <p className="text-base sm:text-lg font-medium text-[var(--ink)] leading-snug break-words">
          {getGreeting(lang, getFirstName(userProfile.displayName))}
        </p>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 mt-0.5 text-[10px] sm:text-xs font-semibold uppercase tracking-wide sm:tracking-widest leading-relaxed break-words ${getUserLevelBadgeClass(level)}`}
        >
          LEVEL {level} · {getLevelName(level, lang)}
        </span>
        {streakWeeks > 0 && (
          <p className="text-sm text-[#FF9F0A] leading-snug">
            {t('scStreakWeeks').replace('{n}', String(streakWeeks))}
          </p>
        )}
        {!hideProgress && (
          <>
            <ScTintCard tint="accent" className="space-y-2 px-3.5 py-3.5 mt-1 max-w-full">
              <ScProgressBar percent={percent} variant="apple" showLabel fillColor="#64D2FF" />
              <p className="text-xs sm:text-sm text-[var(--ink-dim)] leading-snug">
                {t('scPointsToNextLevel')
                  .replace('{pointsLabel}', `§${formatPointsCount(remaining, lang)}§`)
                  .split('§')
                  .map((part, i) =>
                    i % 2 === 1 ? (
                      <span key={i} className="text-[#64D2FF] font-semibold tabular-nums">
                        {part}
                      </span>
                    ) : (
                      part
                    )
                  )}
              </p>
            </ScTintCard>
            <div className="pt-3 min-w-0 w-full">
              <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)] mb-2.5">
                {t('scRadarTitle')}
              </p>
              <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-4">
                {nextStepAction && (
                  <div className="order-1 lg:order-2 min-w-0 flex-1 flex">
                    <StudentNextStepCard
                      className="flex-1 w-full"
                      action={nextStepAction}
                      onStartExercise={(exerciseId) => {
                        const pinned = userProfile.todaySkillItemIds?.includes(exerciseId);
                        if (!pinned) {
                          void onToggleSkillToday?.(exerciseId, true);
                        }
                        onContinueDevelopment();
                      }}
                      onOpenRecommendation={(bookingId) => {
                        const booking = bookings.find((b) => b.id === bookingId);
                        if (booking) onOpenLesson(booking);
                      }}
                      onContinueDevelopment={onContinueDevelopment}
                    />
                  </div>
                )}
                <div className="order-2 lg:order-1 shrink-0 min-w-0 w-full lg:w-auto">
                  <SkillRadarChart
                    userProfile={userProfile}
                    skillConfig={skillConfig}
                    onToggleSkillToday={props.onToggleSkillToday}
                    compact
                    embed
                  />
                </div>
              </div>
              <div className="pt-2">
                <ScTextButton arrow onClick={onContinueDevelopment}>
                  {t('scContinueDevelopment')}
                </ScTextButton>
              </div>
            </div>
          </>
        )}
      </section>

      {achievements.length > 0 && (
        <>
          <ScDivider />
          <section className="py-6 space-y-3">
            <ScSectionTitle tint="amber">{t('scRecentAchievements')}</ScSectionTitle>
            <div className="flex flex-wrap gap-2">
              {achievements.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex flex-col gap-0.5 rounded-full border border-[#FFD60A]/28 bg-[#FFD60A]/10 px-3 py-1.5 text-sm text-[var(--ink)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </span>
                  {item.earnedAtLabel && (
                    <span className="text-[10px] text-[var(--ink-dim)] pl-6">
                      {item.earnedAtLabel}
                    </span>
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

      <ScTintCard tint="purple" className="py-6 px-4 sm:px-5 space-y-4">
        <div className="flex items-center justify-between">
          <ScSectionTitle tint="purple">{monthLabel}</ScSectionTitle>
          <ScTextButton onClick={() => onGoToTab('calendar')}>{t('scFullCalendar')}</ScTextButton>
        </div>
        <div className="flex justify-between gap-1 text-center text-sm overflow-x-auto no-scrollbar pb-1">
          {miniDays.map(({ day, dateStr, hasSession, isToday, weekdayLabel }) => (
            <div key={dateStr} className="flex flex-col items-center gap-1 min-w-[2rem] flex-1">
              <span
                className={`text-[10px] uppercase ${isToday ? 'text-[#BF5AF2]' : 'text-[var(--ink-dim)]'}`}
              >
                {weekdayLabel}
              </span>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink)] ${
                  isToday ? 'font-bold bg-[#BF5AF2]/20 text-[#BF5AF2]' : ''
                }`}
              >
                {day}
              </span>
              <span
                className={`text-[10px] ${hasSession ? 'text-[#30D158]' : 'text-[var(--border)]'}`}
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
                  className="w-full text-left rounded-lg border border-[#BF5AF2]/15 bg-[#BF5AF2]/6 px-3 py-2 hover:border-[#BF5AF2]/35 transition"
                >
                  <span className="text-[#BF5AF2]">{formatSessionDayLabel(dateStr, lang, t)}</span>
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
            {t('scMiniCalendarNext')}: <span className="text-[#BF5AF2]">{nextCal.label}</span>
          </p>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">{t('scNoUpcomingSession')}</p>
        )}
      </ScTintCard>

      <ScDivider />

      {/* Courses preview */}
      <section className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <ScSectionTitle>{t('intensiveGroupCourses')}</ScSectionTitle>
            <p className="text-sm text-[var(--ink-dim)]">
              {showCourseRecommendations
                ? t('scRecommendedCoursesSub')
                : t('intensiveGroupCoursesSub')}
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
              {showInstructorRecommendations
                ? t('scRecommendedInstructorsSub')
                : t('meetGuidesSub')}
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
            <ScSectionTitle tint="sky">{t('scMyStats')}</ScSectionTitle>
            <ScStatGrid
              items={[
                { label: t('scLessonsCount'), value: stats.lessons, tint: 'sky' },
                { label: t('scHoursCount'), value: stats.hours, tint: 'green' },
                { label: t('scExercisesMastered'), value: stats.exercisesMastered, tint: 'purple' },
                { label: t('scPointsEarned'), value: stats.points, tint: 'orange' },
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
