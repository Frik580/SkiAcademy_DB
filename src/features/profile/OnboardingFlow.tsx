import React from 'react';
import { OnboardingModal } from '../../features/profile';
import { useUiStore } from '../shell/uiStore';

interface OnboardingFlowProps {
  onComplete: () => void;
  onScheduleFirstLesson: () => void;
}

/** Feature container for the onboarding state machine. */
export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
  onScheduleFirstLesson,
}) => {
  const isOpen = useUiStore((state) => state.isOnboardingOpen);

  return (
    <OnboardingModal
      isOpen={isOpen}
      onClose={onComplete}
      onScheduleFirstLesson={onScheduleFirstLesson}
    />
  );
};
