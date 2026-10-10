import type { NextStepAction } from './studentSkillProgress';

export interface StudentNextStepInput {
  action: NextStepAction;
  description?: string;
  contextLabel?: string;
  loading?: boolean;
  loadError?: boolean;
  onStartExercise?: (exerciseId: string) => void | Promise<void>;
  onOpenRecommendation: (bookingId: string) => void;
  recommendationAvailable?: boolean;
  onContinueDevelopment: () => void;
  className?: string;
}
