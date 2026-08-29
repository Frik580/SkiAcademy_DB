import { useEffect } from 'react';
import { ensureCanonicalSelfParticipant } from '../../../lib/canonical/canonicalAccountProvisioningClient';
import { logger } from '../../../shared';
import { useProfileStore } from '../../profile/profileStore';
import { useAuthStore } from '../authStore';

/** Ensures authenticated Accounts enter canonical Participant workflows with a self identity. */
export function useCanonicalAccountProvisioningSync(): void {
  const authenticatedAccountId = useAuthStore((state) => state.firebaseUser?.uid);
  const profileAccountId = useProfileStore((state) => state.userProfile?.uid);

  useEffect(() => {
    if (!authenticatedAccountId || profileAccountId !== authenticatedAccountId) return;
    void ensureCanonicalSelfParticipant(authenticatedAccountId).catch((error) => {
      logger.error('Canonical self Participant provisioning failed:', error);
    });
  }, [authenticatedAccountId, profileAccountId]);
}
