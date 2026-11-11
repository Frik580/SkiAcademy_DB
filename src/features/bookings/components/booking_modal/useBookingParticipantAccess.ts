import { useEffect } from 'react';
import { useBookingCollaborationStore } from '../../../booking-collaboration/bookingCollaborationStore';
import {
  participantInstructorAccessKey,
  participantInstructorAccessQueryKey,
} from '../../../booking-collaboration/deriveCollaborationIdempotencyKeys';
import {
  ensureParticipantAccessRead,
  refetchParticipantAccessRead,
} from '../../../booking-collaboration/useBookingCollaborationReadSync';

export type BookingParticipantAccess = 'available' | 'blocked' | 'loading' | 'error';

export function getBookingParticipantAccess(
  participantId: string,
  instructorId: string | undefined,
  state = useBookingCollaborationStore.getState()
): BookingParticipantAccess {
  if (!instructorId) return 'loading';
  const query = state.participantAccessQueries.get(
    participantInstructorAccessQueryKey('account_manager', participantId, instructorId)
  );
  if (query?.status === 'error') return 'error';
  if (query?.status !== 'loaded') return 'loading';
  const access = state.participantAccess.get(
    participantInstructorAccessKey(participantId, instructorId)
  );
  return access?.managerBlockStatus === 'active' || access?.instructorBlockStatus === 'active'
    ? 'blocked'
    : 'available';
}

export function useBookingParticipantAccess(
  enabled: boolean,
  accountId: string | undefined,
  instructorId: string | undefined,
  participantIds: readonly string[]
) {
  const access = useBookingCollaborationStore((state) => state.participantAccess);
  const queries = useBookingCollaborationStore((state) => state.participantAccessQueries);
  const idsKey = JSON.stringify(participantIds);

  // Refresh on opening / pair changes, sharing any read already in flight.
  useEffect(() => {
    if (!enabled || !accountId || !instructorId) return;
    for (const id of JSON.parse(idsKey) as string[]) {
      const query = useBookingCollaborationStore
        .getState()
        .participantAccessQueries.get(
          participantInstructorAccessQueryKey('account_manager', id, instructorId)
        );
      if (query?.status !== 'loading') {
        void refetchParticipantAccessRead('account_manager', id, instructorId).catch(() => {});
      }
    }
  }, [enabled, accountId, instructorId, idsKey]);

  // Block/unblock commands update this same store. Respect invalidations without polling.
  useEffect(() => {
    if (!enabled || !accountId || !instructorId) return;
    for (const id of JSON.parse(idsKey) as string[]) {
      const query = queries.get(
        participantInstructorAccessQueryKey('account_manager', id, instructorId)
      );
      if (!query || query.status === 'stale') {
        void ensureParticipantAccessRead('account_manager', id, instructorId);
      }
    }
  }, [enabled, accountId, instructorId, idsKey, queries]);

  const statuses = Object.fromEntries(
    participantIds.map((id) => [
      id,
      getBookingParticipantAccess(id, instructorId, {
        ...useBookingCollaborationStore.getState(),
        participantAccess: access,
        participantAccessQueries: queries,
      }),
    ])
  ) as Record<string, BookingParticipantAccess>;

  const retry = () => {
    if (!enabled || !accountId || !instructorId) return;
    for (const id of participantIds) {
      if (getBookingParticipantAccess(id, instructorId) === 'error') {
        void refetchParticipantAccessRead('account_manager', id, instructorId).catch(() => {});
      }
    }
  };
  return { statuses, retry };
}
