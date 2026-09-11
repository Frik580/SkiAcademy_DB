import { memo } from 'react';
import type { Booking } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { TodayChecklist } from '../../../../features/profile';
import type { TodayTask } from './studentCabinetUtils';
import type { TodayTaskRef } from '../..';
import { participantLessonFeedbackItemKey } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
import { useParticipantLessonFeedbackStore } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';

const SUBSECTION_LABEL = 'text-[10px] font-medium tracking-widest uppercase text-[var(--ink-dim)]';

export const TodayTasksBlock = memo<{
  todayTasks: TodayTask[];
  bookings: Booking[];
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTodayTaskComplete?: (taskId: string, done: boolean) => void;
  onAddCustomTodayTask?: (text: string) => void;
  onRemoveTodayTask?: (task: TodayTaskRef) => void;
  onOpenLesson: (booking: Booking) => void;
  onContinueDevelopment: () => void;
}>(function TodayTasksBlock({
  todayTasks,
  bookings,
  onToggleRecommendation,
  onToggleTodayTaskComplete,
  onAddCustomTodayTask,
  onRemoveTodayTask,
  onOpenLesson,
  onContinueDevelopment,
}) {
  const { t } = useLanguage();
  const presentationParticipantId = useParticipantLessonFeedbackStore(
    (state) => state.presentationParticipantId
  );
  const pendingKeys = useParticipantLessonFeedbackStore((state) => state.pendingKeys);

  return (
    <div className="pt-5 space-y-2">
      <p className={SUBSECTION_LABEL}>{t('scQuickActions')}</p>
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
    </div>
  );
});
