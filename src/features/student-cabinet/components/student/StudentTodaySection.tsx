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
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

export const StudentTodaySection = memo<StudentTodaySectionInput>(function StudentTodaySection({
  todayProgress = { todayXP: null, todayLevelUp: null, exercises: [] },
  scopeParticipant,
  countdown,
  countdownParticipants,
  currentSessions,
  currentParticipantsBySessionKey,
  nextSession = null,
  nextSessions,
  participantsBySessionKey,
  sessionItems,
  miniDays,
  courses,
  instructors = [],
  usersList = [],
  todayTasks,
  bookings,
  userProfile,
  selectedParticipantId,
  achievementsConfig,
  skillConfig,
  onOpenSession,
  onOpenLesson,
  onViewCourseDetails,
  onGoToTab,
  onContinueDevelopment,
  pendingRecommendation,
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

  const todayCountdown = useMemo(
    () => (countdown === undefined ? getTodaySessionCountdown(sessionItems) : countdown),
    [countdown, sessionItems]
  );

  const nextStepAction = useMemo(() => {
    if (!userProfile) return null;
    return getNextStepAction(userProfile, pendingRecommendation, skillConfig, lang);
  }, [userProfile, pendingRecommendation, skillConfig, lang]);

  return (
    <section className="py-5 space-y-0">
      <ScSectionTitle>{t('scTodaySection')}</ScSectionTitle>

      {currentSessions.length > 0 && (
        <CurrentSessionsBlock
          sessions={currentSessions}
          participantsBySessionKey={currentParticipantsBySessionKey}
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
          participants={countdownParticipants}
          courses={courses}
          instructors={instructors}
          usersList={usersList}
        />
      )}

      <TodayTasksBlock
        key={`tasks:${selectedParticipantId}`}
        todayTasks={todayTasks}
        scopeParticipant={scopeParticipant}
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
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className={SUBSECTION_LABEL}>{t('scNextStepTitle')}</p>
              <ParticipantScopeIndicator
                participant={scopeParticipant}
                visible={Boolean(scopeParticipant)}
              />
            </div>
            <StudentNextStepCard
              key={`next-step:${selectedParticipantId}`}
              action={nextStepAction}
              onStartExercise={
                onToggleSkillToday
                  ? (exerciseId) => {
                      const pinned = userProfile?.todaySkillItemIds?.includes(exerciseId);
                      if (!pinned) {
                        return onToggleSkillToday(exerciseId, true);
                      }
                    }
                  : undefined
              }
              recommendationAvailable={
                nextStepAction.kind !== 'recommendation' ||
                bookings.some((booking) => booking.id === nextStepAction.bookingId)
              }
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
        participantsBySessionKey={participantsBySessionKey}
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
        progress={todayProgress}
        scopeParticipant={scopeParticipant}
        key={`progress:${selectedParticipantId}`}
        selectedParticipantId={selectedParticipantId}
        achievementsConfig={achievementsConfig}
        skillConfig={skillConfig}
      />
    </section>
  );
});
