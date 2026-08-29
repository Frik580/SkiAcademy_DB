import { memo, useMemo } from 'react';
import { sessionDisplayDate } from '../../../../features/course-enrollments/sessionScheduleHelpers';
import { getNextStepAction, getTodaySessionCountdown } from './studentCabinetUtils';
import { ScDivider, ScSectionTitle } from './StudentCabinetUI';
import { StudentNextStepCard } from './StudentNextStepCard';
import {
  CurrentSessionsBlock,
  NextSessionBlock,
  SessionCountdownBlock,
} from './StudentTodaySessionBlocks';
import { TodayTasksBlock } from './StudentTodayTasksBlock';
import { TodayProgressBlock } from './StudentTodayProgressBlock';
import type { StudentTodaySectionInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

export const StudentTodaySection = memo<StudentTodaySectionInput>(function StudentTodaySection({
  currentSessions,
  nextSession = null,
  nextSessions,
  sessionItems,
  miniDays,
  courses,
  instructors = [],
  usersList = [],
  todayTasks,
  bookings,
  reviews = [],
  userProfile,
  activityLogs = [],
  achievementsConfig,
  skillConfig,
  onOpenSession,
  onOpenLesson,
  onViewCourseDetails,
  onGoToTab,
  onContinueDevelopment,
  onToggleRecommendation,
  onToggleSkillToday,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  hasUnreadChat,
}) {
  const { t, lang } = useStudentCabinetTranslations();

  const effectiveNextSessions = useMemo(() => {
    if (nextSessions) return nextSessions;
    if (!nextSession) return [];
    return [{ session: nextSession, dateStr: sessionDisplayDate(nextSession) }];
  }, [nextSessions, nextSession]);

  const todayCountdown = useMemo(() => getTodaySessionCountdown(sessionItems), [sessionItems]);

  const nextStepAction = useMemo(() => {
    if (!userProfile) return null;
    return getNextStepAction(userProfile, bookings, skillConfig, lang);
  }, [userProfile, bookings, skillConfig, lang]);

  return (
    <section className="py-5 space-y-0">
      <ScSectionTitle>{t('scTodaySection')}</ScSectionTitle>

      {currentSessions.length > 0 && (
        <CurrentSessionsBlock
          sessions={currentSessions}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
          onOpenLesson={onOpenLesson}
          onOpenSession={onOpenSession}
          onViewCourseDetails={onViewCourseDetails}
          hasUnreadChat={hasUnreadChat}
        />
      )}

      {todayCountdown && (
        <SessionCountdownBlock
          countdown={todayCountdown}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      <TodayTasksBlock
        todayTasks={todayTasks}
        bookings={bookings}
        onToggleRecommendation={onToggleRecommendation}
        onToggleTodayTaskComplete={onToggleTodayTaskComplete}
        onAddCustomTodayTask={onAddCustomTodayTask}
        onRemoveTodayTask={onRemoveTodayTask}
        onOpenLesson={onOpenLesson}
        onContinueDevelopment={onContinueDevelopment}
      />

      <ScDivider />

      {nextStepAction && (
        <>
          <div className="py-5 space-y-2">
            <p className={SUBSECTION_LABEL}>{t('scNextStepTitle')}</p>
            <StudentNextStepCard
              action={nextStepAction}
              onStartExercise={(exerciseId) => {
                const pinned = userProfile?.todaySkillItemIds?.includes(exerciseId);
                if (!pinned) {
                  void onToggleSkillToday?.(exerciseId, true);
                }
              }}
              onOpenRecommendation={(bookingId) => {
                const booking = bookings.find((b) => b.id === bookingId);
                if (booking) onOpenLesson(booking as never);
              }}
              onContinueDevelopment={onContinueDevelopment}
            />
          </div>
          <ScDivider />
        </>
      )}

      <NextSessionBlock
        nextSessions={effectiveNextSessions}
        miniDays={miniDays}
        courses={courses}
        instructors={instructors}
        usersList={usersList}
        onGoToTab={onGoToTab}
        onOpenLesson={onOpenLesson}
        onOpenSession={onOpenSession}
        onViewCourseDetails={onViewCourseDetails}
        hasUnreadChat={hasUnreadChat}
      />

      <ScDivider />

      <TodayProgressBlock
        userProfile={userProfile}
        bookings={bookings}
        courses={courses}
        reviews={reviews}
        activityLogs={activityLogs}
        achievementsConfig={achievementsConfig}
        skillConfig={skillConfig}
        todayTasks={todayTasks}
      />
    </section>
  );
});
