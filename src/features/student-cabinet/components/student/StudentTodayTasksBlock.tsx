import { StudentDashboardTileBody } from './StudentDashboardTile';
import { memo, useRef } from 'react';
import { Plus } from 'lucide-react';
import type { Booking } from '../../../../types';
import { TodayChecklist } from '../../../../features/profile';
import type { TodayTask } from './studentCabinetUtils';
import type { TodayTaskRef } from '../..';
import { participantLessonFeedbackItemKey } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
import { useParticipantLessonFeedbackStore } from '../../../participant-lesson-feedback/participantLessonFeedbackStore';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import './studentTodayTasks.css';
import { ParticipantScopeIndicator } from './ParticipantScopeIndicator';

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
  const addInputRef = useRef<HTMLInputElement>(null);
  const presentationParticipantId = useParticipantLessonFeedbackStore(
    (state) => state.presentationParticipantId
  );
  const pendingKeys = useParticipantLessonFeedbackStore((state) => state.pendingKeys);
  const feedbackState = useParticipantLessonFeedbackStore((state) =>
    scopeParticipant ? state.byParticipantId[scopeParticipant.participantId]?.loadState : undefined
  );

  return (
    <section className="sc-today-tasks">
      <header data-dashboard-header className="sc-today-tasks-header">
        <div className="min-w-0 flex-1">
          <h2 data-dashboard-title className="sc-today-tasks-title">
            {t('scQuickActions')}
          </h2>
        </div>
        <div className="sc-today-tasks-actions">
          <ParticipantScopeIndicator
            participant={scopeParticipant}
            visible={Boolean(scopeParticipant)}
          />
          {onAddCustomTodayTask && (
            <button
              type="button"
              className="sc-today-tasks-add"
              aria-label={t('scAddTodayTask')}
              onClick={() => addInputRef.current?.focus()}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <StudentDashboardTileBody>
        {feedbackState === 'loading' && (
          <p role="status" className="sc-today-tasks-message">
            {t('loading')}
          </p>
        )}
        {feedbackState === 'error' && (
          <p role="alert" className="sc-today-tasks-message">
            {t('requestFailed')}
          </p>
        )}
        {todayTasks.length === 0 && feedbackState !== 'loading' && feedbackState !== 'error' && (
          <p className="sc-today-tasks-message">{t('scNoTodayTasks')}</p>
        )}
        <TodayChecklist
          variant="dashboard"
          addInputRef={addInputRef}
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
