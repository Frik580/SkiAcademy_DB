import { useCallback, useEffect } from 'react';
import { queryManagedParticipantPickerReadModels } from '../../lib/canonical/canonicalReadModelClient';
import type { ManagedParticipantOption } from './lessonBookingContracts';
import { ensureCanonicalSelfParticipant } from '../../lib/canonical/canonicalAccountProvisioningClient';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import { useManagedParticipantsStore } from './managedParticipantsStore';

const EMPTY_PARTICIPANTS: readonly ManagedParticipantOption[] = [];
const inFlightRequests = new Map<string, Promise<void>>();

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
  const storedAccountId = useManagedParticipantsStore((state) => state.accountId);
  const storedAuthGeneration = useManagedParticipantsStore((state) => state.authGeneration);
  const storedParticipants = useManagedParticipantsStore((state) => state.participants);
  const storedLoading = useManagedParticipantsStore((state) => state.loading);
  const storedError = useManagedParticipantsStore((state) => state.error);
  const authenticatedAccountId = firebaseUid;
  const bootstrapReady =
    Boolean(accountId) && Boolean(authenticatedAccountId) && profileUid === authenticatedAccountId;

  const reload = useCallback(async () => {
    if (!accountId || !authenticatedAccountId || !bootstrapReady) {
      return;
    }
    const requestGeneration = authGeneration;
    const requestAccountId = authenticatedAccountId;
    const requestKey = `${requestGeneration}:${requestAccountId}`;
    const pendingRequest = inFlightRequests.get(requestKey);
    if (pendingRequest) return pendingRequest;

    const scope = { accountId: requestAccountId, authGeneration: requestGeneration };
    useManagedParticipantsStore.getState().beginLoad(scope);
    const request = (async () => {
      try {
        if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) return;
        await ensureCanonicalSelfParticipant(requestAccountId);
        if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) return;
        const result = await queryManagedParticipantPickerReadModels({});
        if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) return;
        useManagedParticipantsStore.getState().replaceParticipants({
          ...scope,
          participants: result.items.map((item) => ({
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
          })),
        });
      } catch (loadError) {
        if (!isCurrentManagedParticipantRequest(requestGeneration, requestAccountId)) return;
        useManagedParticipantsStore.getState().setError({
          ...scope,
          error: loadError instanceof Error ? loadError.message : 'Failed to load participants.',
        });
      }
    })();
    inFlightRequests.set(requestKey, request);
    try {
      await request;
    } finally {
      if (inFlightRequests.get(requestKey) === request) inFlightRequests.delete(requestKey);
    }
  }, [accountId, authenticatedAccountId, authGeneration, bootstrapReady]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isCurrentScope =
    storedAccountId === authenticatedAccountId && storedAuthGeneration === authGeneration;
  return {
    participants: bootstrapReady && isCurrentScope ? storedParticipants : EMPTY_PARTICIPANTS,
    loading: bootstrapReady && isCurrentScope ? storedLoading : false,
    error: bootstrapReady && isCurrentScope ? storedError : undefined,
    reload,
  };
}
