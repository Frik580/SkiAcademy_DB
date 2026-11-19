import { useEffect } from 'react';
import { logger } from '../../shared';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { refreshManagedParticipantAchievements } from './participantAchievementsService';
import { useParticipantAchievementsStore } from './participantAchievementsStore';

export function useParticipantAchievementsSync() {
  const accountId = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const profileId = useProfileStore((state) => state.userProfile?.uid);
  const role = useProfileStore((state) => state.userProfile?.role);
  const canonicalReadyAccountId = useProfileStore((state) => state.canonicalReadyAccountId);

  useEffect(() => {
    if (
      !accountId ||
      role !== 'user' ||
      canonicalReadyAccountId !== accountId ||
      profileId !== accountId
    )
      return;
    // Auth already clears the store synchronously on principal changes.
    if (useParticipantAchievementsStore.getState().managedRead?.status === 'loading') return;
    void refreshManagedParticipantAchievements().catch((error) => {
      logger.warn('Failed to load managed participant achievements', error);
    });
  }, [accountId, authGeneration, canonicalReadyAccountId, profileId, role]);
}
