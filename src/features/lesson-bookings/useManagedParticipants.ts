import { useCallback, useEffect, useState } from 'react';
import { queryManagedParticipantPickerReadModels } from '../../lib/canonical/canonicalReadModelClient';
import type { ManagedParticipantOption } from './lessonBookingContracts';
import { ensureCanonicalSelfParticipant } from '../../lib/canonical/canonicalAccountProvisioningClient';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';

function isCurrentManagedParticipantRequest(generation: number, accountId: string): boolean {
  const auth = useAuthStore.getState();
  const profile = useProfileStore.getState();
  return (
    auth.authGeneration === generation &&
    auth.firebaseUser?.uid === accountId &&
    profile.userProfile?.uid === accountId
  );
}

export function useManagedParticipants(accountId: string | undefined) {
  const firebaseUid = useAuthStore((state) => state.firebaseUser?.uid);
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const profileUid = useProfileStore((state) => state.userProfile?.uid);
  const [participants, setParticipants] = useState<ManagedParticipantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const authenticatedAccountId = firebaseUid;
  const bootstrapReady =
    Boolean(accountId) && Boolean(authenticatedAccountId) && profileUid === authenticatedAccountId;

  const reload = useCallback(async () => {
    if (!accountId || !authenticatedAccountId || !bootstrapReady) {
      setParticipants([]);
      setLoading(false);
      setError(undefined);
      return;
    }
    const requestGeneration = authGeneration;
    const requestAccountId = authenticatedAccountId;
    setLoading(true);
    setError(undefined);
    try {
      if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) {
        return;
      }
      await ensureCanonicalSelfParticipant(requestAccountId);
      if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) {
        return;
      }
      const result = await queryManagedParticipantPickerReadModels({});
      if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) {
        return;
      }
      setParticipants(
        result.items.map((item) => ({
          participantId: item.participantId,
          participantManagementId: item.participantManagementId,
          displayName: item.displayName,
          discipline: item.discipline,
          skillLevel: item.skillLevel,
          age: item.age,
          authority: item.authority,
          revision: item.revision,
          ...(item.instructorComment ? { instructorComment: item.instructorComment } : {}),
          ...(item.avatarUrl ? { avatarUrl: item.avatarUrl } : {}),
        }))
      );
    } catch (loadError) {
      if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Failed to load participants.');
      setParticipants([]);
    } finally {
      if (isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) {
        setLoading(false);
      }
    }
  }, [accountId, authenticatedAccountId, authGeneration, bootstrapReady]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { participants, loading, error, reload };
}
