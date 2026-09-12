import { useEffect } from 'react';
import { logger } from '../../shared';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { refreshManagedParticipantAchievements } from './participantAchievementsService';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

export function useParticipantAchievementsSync() {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useProfileStore((state) => state.userProfile);

  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.role !== 'user') {
      useParticipantAchievementsStore.getState().clear();
      return;
    }
    void refreshManagedParticipantAchievements().catch((error) => {
      logger.warn('Failed to load managed participant achievements', error);
    });
  }, [firebaseUser, userProfile]);
}
