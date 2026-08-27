import { useCallback, useEffect } from 'react';
import {
  queryBookingChangeRequestReadModels,
  queryBookingProposalReadModels,
  queryLessonBookingReadModels,
  queryParticipantInstructorAccessReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import {
  InstructorIdSchema,
  ParticipantIdSchema,
} from '@ski-academy/shared-domain';
import { useBookingCollaborationStore } from './bookingCollaborationStore';
import { mergeProposalRecords } from './proposalViewModel';
import { mergeChangeRequestRecords } from './changeRequestViewModel';
import { mergeInstructorLessonBookingRecords } from './instructorLessonBookingViewModel';
import {
  storeParticipantAccessItem,
} from './participantAccessViewModel';
import { participantInstructorAccessKey } from './deriveCollaborationIdempotencyKeys';
import { mergeLessonBookingRecords } from '../lesson-bookings/lessonBookingViewModel';
import { useLessonBookingStore } from '../lesson-bookings/lessonBookingStore';

export interface BookingCollaborationReadSyncInput {
  readonly customerEnabled: boolean;
  readonly instructorEnabled: boolean;
  readonly accountId?: string;
  readonly instructorId?: string;
}

async function loadCustomerCollaborationReads(): Promise<void> {
  const [proposals, changeRequests] = await Promise.all([
    queryBookingProposalReadModels({ scope: 'account_open' }),
    queryBookingChangeRequestReadModels({ scope: 'account_open' }),
  ]);
  useBookingCollaborationStore
    .getState()
    .mergeProposals(mergeProposalRecords(useBookingCollaborationStore.getState().proposals, proposals.items));
  useBookingCollaborationStore
    .getState()
    .mergeChangeRequests(
      mergeChangeRequestRecords(
        useBookingCollaborationStore.getState().changeRequests,
        changeRequests.items
      )
    );
}

async function loadInstructorCollaborationReads(): Promise<void> {
  const [lessonBookings, proposals, changeRequests] = await Promise.all([
    queryLessonBookingReadModels({ scope: 'instructor_hot' }),
    queryBookingProposalReadModels({ scope: 'instructor_open' }),
    queryBookingChangeRequestReadModels({ scope: 'instructor_open' }),
  ]);
  useBookingCollaborationStore
    .getState()
    .mergeInstructorLessonBookings(
      mergeInstructorLessonBookingRecords(
        useBookingCollaborationStore.getState().instructorLessonBookings,
        lessonBookings.items
      )
    );
  useBookingCollaborationStore
    .getState()
    .mergeProposals(mergeProposalRecords(useBookingCollaborationStore.getState().proposals, proposals.items));
  useBookingCollaborationStore
    .getState()
    .mergeChangeRequests(
      mergeChangeRequestRecords(
        useBookingCollaborationStore.getState().changeRequests,
        changeRequests.items
      )
    );
}

export async function refetchCustomerCollaborationReads(): Promise<void> {
  await loadCustomerCollaborationReads();
  const hot = await queryLessonBookingReadModels({ scope: 'account_hot' });
  const merged = mergeLessonBookingRecords(useLessonBookingStore.getState().items, hot.items);
  useLessonBookingStore.getState().mergeItems(merged);
}

export async function refetchInstructorCollaborationReads(): Promise<void> {
  await loadInstructorCollaborationReads();
}

export async function refetchParticipantAccessRead(
  scope: 'account_manager' | 'instructor',
  participantId: string,
  instructorId: string
): Promise<void> {
  const result = await queryParticipantInstructorAccessReadModels({
    scope,
    participantId: ParticipantIdSchema.parse(participantId),
    instructorId: InstructorIdSchema.parse(instructorId),
  });
  const key = participantInstructorAccessKey(participantId, instructorId);
  const next = storeParticipantAccessItem(
    useBookingCollaborationStore.getState().participantAccess,
    result.item,
    participantId,
    instructorId
  );
  useBookingCollaborationStore.getState().setParticipantAccess(next);
  if (!result.item && !next.has(key)) {
    return;
  }
}

export function useBookingCollaborationReadSync(input: BookingCollaborationReadSyncInput) {
  const { customerEnabled, instructorEnabled, accountId, instructorId } = input;

  const reload = useCallback(async () => {
    if (!customerEnabled && !instructorEnabled) return;
    useBookingCollaborationStore.getState().setLoading(true);
    useBookingCollaborationStore.getState().setError(undefined);
    try {
      if (customerEnabled && accountId) {
        await loadCustomerCollaborationReads();
      }
      if (instructorEnabled && instructorId) {
        await loadInstructorCollaborationReads();
      }
      useBookingCollaborationStore.getState().setLoaded(true);
    } catch (error) {
      useBookingCollaborationStore
        .getState()
        .setError(error instanceof Error ? error.message : 'Failed to load collaboration data.');
    } finally {
      useBookingCollaborationStore.getState().setLoading(false);
    }
  }, [accountId, customerEnabled, instructorEnabled, instructorId]);

  useEffect(() => {
    if (!customerEnabled && !instructorEnabled) {
      useBookingCollaborationStore.getState().reset();
      return;
    }
    useBookingCollaborationStore.getState().reset();
    void reload();
  }, [customerEnabled, instructorEnabled, accountId, instructorId, reload]);

  return { reload };
}
