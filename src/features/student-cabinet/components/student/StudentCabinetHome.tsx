import React, { useMemo } from 'react';
import { YourJourneySection } from '../../../../features/journey';
import {
  getFirstName,
  getGreeting,
  getMiniCalendarDays,
  getNextSessionsNext7Days,
  getTodayTasks,
  getCurrentSessions,
  hasTrainingToday,
} from './studentCabinetUtils';
import { ScDivider, ScTextButton } from './StudentCabinetUI';
import { StudentNeedsAttention } from './StudentNeedsAttention';
import { StudentTodaySection } from './StudentTodaySection';
import { LazySkillRadarChart } from './LazySkillRadarChart';
import {
  StudentCabinetWeatherSection,
  StudentLatestRecommendationSection,
} from './StudentHomeBottomSections';
import type { StudentCabinetHomeContext } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export type { StudentCabinetHomeContext as StudentCabinetContext } from './studentCabinetContracts';

type StudentCabinetHomeProps = StudentCabinetHomeContext;

export const StudentCabinetHome: React.FC<StudentCabinetHomeProps> = (props) => {
  const { t, lang } = useStudentCabinetTranslations();
  const {
    userProfile,
    bookings,
    courses,
    instructors,
    reviews,
    usersList = [],
    dismissedReviewIds = [],
    skillConfig,
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
    resortSnapshot,
    onToggleTemperatureUnit,
  } = props;

  const hideProgress = Boolean(userProfile.hideProgressTracking);

  const nextSessions = useMemo(
    () => getNextSessionsNext7Days(bookings, courses, new Date(), userProfile.uid),
    [bookings, courses, userProfile.uid]
  );
  const nextSession = nextSessions[0]?.booking ?? null;
  const currentSessions = useMemo(
    () => getCurrentSessions(bookings, courses, new Date(), userProfile.uid),
    [bookings, courses, userProfile.uid]
  );
  const todayTasks = useMemo(
    () => getTodayTasks(userProfile, bookings, courses, lang, skillConfig),
    [userProfile, bookings, courses, lang, skillConfig]
  );
  const miniDays = useMemo(
    () => getMiniCalendarDays(bookings, courses, lang),
    [bookings, courses, lang]
  );
  const showWeather =
    Boolean(resortSnapshot) &&
    (currentSessions.length > 0 || hasTrainingToday(bookings, courses, userProfile.uid));

  return (
    <div className="space-y-0 pb-24 w-full min-w-0">
      {/* Путь к мастерству (Your Journey) for authorized client — full width, no frames or card margins */}
      <div className="w-full shrink-0">
        <YourJourneySection
          skillConfig={skillConfig}
          userProfile={userProfile}
          animateSequence={false}
          fillViewport
          onOpenDevelopment={onContinueDevelopment}
        />
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 min-w-0">
        {/* Hero — greeting, level, progress, skill radar */}
        <section className="py-6 space-y-2.5 min-w-0">
          <p className="text-base sm:text-lg font-medium text-[var(--ink)] leading-snug break-words">
            {getGreeting(lang, getFirstName(userProfile.displayName))}
          </p>

          <StudentTodaySection
            currentSessions={currentSessions}
            nextSession={nextSession}
            nextSessions={nextSessions}
            miniDays={miniDays}
            courses={courses}
            instructors={instructors}
            usersList={usersList}
            todayTasks={todayTasks}
            bookings={bookings}
            reviews={reviews}
            userProfile={userProfile}
            activityLogs={props.activityLogs}
            achievementsConfig={props.achievementsConfig}
            skillConfig={props.skillConfig}
            onOpenSession={onOpenSession}
            onOpenLesson={onOpenLesson}
            onGoToTab={onGoToTab}
            onContinueDevelopment={onContinueDevelopment}
            onToggleRecommendation={onToggleRecommendation}
            onToggleSkillToday={onToggleSkillToday}
            onToggleTodayTaskComplete={onToggleTodayTaskComplete}
            onAddCustomTodayTask={onAddCustomTodayTask}
            onRemoveTodayTask={onRemoveTodayTask}
            hasUnreadChat={props.hasUnreadChat}
          />

          {!hideProgress && (
            <div className="pt-3 min-w-0 w-full">
              <p className="text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)] mb-2.5">
                {t('scRadarTitle')}
              </p>
              <div className="shrink-0 min-w-0 w-full">
                <LazySkillRadarChart
                  userProfile={userProfile}
                  skillConfig={skillConfig}
                  onToggleSkillToday={props.onToggleSkillToday}
                  compact
                  embed
                />
              </div>
              <div className="pt-2">
                <ScTextButton arrow onClick={onContinueDevelopment}>
                  {t('scContinueDevelopment')}
                </ScTextButton>
              </div>
            </div>
          )}
        </section>

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

        <ScDivider />

        <StudentLatestRecommendationSection
          bookings={bookings}
          courses={courses}
          userId={userProfile.uid}
          onOpenLesson={onOpenLesson}
        />

        {showWeather && resortSnapshot && (
          <>
            <ScDivider />
            <StudentCabinetWeatherSection
              resort={resortSnapshot}
              onToggleTemperatureUnit={onToggleTemperatureUnit}
            />
          </>
        )}
      </div>
    </div>
  );
};
