import { StudentDashboardTileHeader, StudentDashboardTileBody } from './StudentDashboardTile';
import { memo } from 'react';
import type { Booking } from '../../../../types';
import { TodayChecklist } from '../../../../features/profile';
import type { TodayTask } from './studentCabinetUtils';
import type { TodayTaskRef } from '../..';
import { participantLessonFeedbackItemKey } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
import { useParticipantLessonFeedbackStore } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export const TodayTasksBlock = memo<{
  scopeParticipant?: SessionParticipantInput;
  todayTasks: TodayTask[];
  bookings: Booking[];
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  onOpenLesson: (booking: Booking) => void;
  onContinueDevelopment: () => void;
}>(function TodayTasksBlock({
  scopeParticipant,
  todayTasks,
  bookings,
  onToggleRecommendation,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  onOpenLesson,
  onContinueDevelopment,
}) {
  const { t } = useStudentCabinetTranslations();
  const presentationParticipantId = useParticipantLessonFeedbackStore(
    (state) => state.presentationParticipantId
  );
  const pendingKeys = useParticipantLessonFeedbackStore((state) => state.pendingKeys);

  return (
    <section>
      <StudentDashboardTileHeader
        title={t('scQuickActions')}
        actions={
          <ParticipantScopeIndicator
            participant={scopeParticipant}
            visible={Boolean(scopeParticipant)}
          />
        }
      />
      <StudentDashboardTileBody>
        <TodayChecklist
          tasks={todayTasks}
          bookings={bookings}
          onToggleRecommendation={onToggleRecommendation}
          isRecommendationPending={(lessonBookingId, itemId) =>
            Boolean(
              presentationParticipantId &&
              pendingKeys[
                participantLessonFeedbackItemKey(presentationParticipantId, lessonBookingId, itemId)
              ]
            )
          }
          onToggleTaskComplete={onToggleTodayTaskComplete}
          onAddTask={onAddCustomTodayTask}
          onRemoveTask={onRemoveTodayTask}
          onOpenLesson={onOpenLesson}
          onOpenDevelopment={onContinueDevelopment}
        />
      </StudentDashboardTileBody>
    </section>
  );
});
