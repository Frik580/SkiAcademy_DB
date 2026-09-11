import React from 'react';
import { RecommendationIndicator } from './RecommendationIndicator';
import { usePresentedParticipantLessonFeedback } from '../usePresentedParticipantLessonFeedback';

export const LessonFeedbackIndicator: React.FC<{
  readonly lessonBookingId: string;
  readonly className?: string;
}> = ({ lessonBookingId, className }) => {
  const feedback = usePresentedParticipantLessonFeedback();
  const flags = feedback.flagsByLessonId.get(lessonBookingId);
  if (!flags?.hasItems) return null;
  return <RecommendationIndicator pending={flags.hasPending} className={className} />;
};
