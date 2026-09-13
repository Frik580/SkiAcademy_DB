import { useCallback, useEffect, useRef } from 'react';
import {
  queryBookingChangeRequestReadModels,
  queryBookingProposalReadModels,
  queryLessonBookingReadModels,
  queryParticipantInstructorAccessReadModels,
} from '../../lib/canonical/canonicalReadModelClient';
import {
  drainPagedReadModelItems,
  InstructorIdSchema,
  ParticipantIdSchema,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { useBookingCollaborationStore } from './bookingCollaborationStore';
import { mergeProposalRecords } from './proposalViewModel';
import { mergeChangeRequestRecords } from './changeRequestViewModel';
import { mergeInstructorLessonBookingRecords } from './instructorLessonBookingViewModel';
import { storeParticipantAccessItem } from './participantAccessViewModel';
import {
  participantInstructorAccessKey,
  participantInstructorAccessQueryKey,
} from './deriveCollaborationIdempotencyKeys';
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
    .setProposals(
      mergeProposalRecords(
        useBookingCollaborationStore.getState().proposals,
        proposals.items,
        'account_open'
      )
    );
  useBookingCollaborationStore
    .getState()
    .setChangeRequests(
      mergeChangeRequestRecords(
        useBookingCollaborationStore.getState().changeRequests,
        changeRequests.items,
        'account_open'
      )
    );
}

async function loadAllInstructorLessonBookingPages(scope: 'instructor_hot' | 'instructor_history') {
  return drainPagedReadModelItems<LessonBookingReadModel>({
    fetchPage: async (cursor) => {
      const page = await queryLessonBookingReadModels({
        scope,
        ...(cursor ? { cursor } : {}),
      });
      return {
        items: page.items,
        hasMore: page.hasMore,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
  });
}

async function loadInstructorCollaborationReads(): Promise<void> {
  const [hotLessonBookings, historyLessonBookings, proposals, changeRequests] = await Promise.all([
    loadAllInstructorLessonBookingPages('instructor_hot'),
    loadAllInstructorLessonBookingPages('instructor_history'),
    queryBookingProposalReadModels({ scope: 'instructor_open' }),
    queryBookingChangeRequestReadModels({ scope: 'instructor_open' }),
  ]);
  useBookingCollaborationStore
    .getState()
    .setInstructorLessonBookings(
      mergeInstructorLessonBookingRecords(new Map(), [
        ...hotLessonBookings,
        ...historyLessonBookings,
      ])
    );
  useBookingCollaborationStore
    .getState()
    .setProposals(
      mergeProposalRecords(
        useBookingCollaborationStore.getState().proposals,
        proposals.items,
        'instructor_open'
      )
    );
  useBookingCollaborationStore
    .getState()
    .setChangeRequests(
      mergeChangeRequestRecords(
        useBookingCollaborationStore.getState().changeRequests,
        changeRequests.items,
        'instructor_open'
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

async function loadParticipantAccessRead(
  scope: 'account_manager' | 'instructor',
  participantId: string,
  instructorId: string
): Promise<void> {
  const queryKey = participantInstructorAccessQueryKey(scope, participantId, instructorId);
  const store = useBookingCollaborationStore.getState();
  store.setParticipantAccessQuery(queryKey, { status: 'loading' });
  try {
    const result = await queryParticipantInstructorAccessReadModels({
      scope,
      participantId: ParticipantIdSchema.parse(participantId),
      instructorId: InstructorIdSchema.parse(instructorId),
    });
    const pairKey = participantInstructorAccessKey(participantId, instructorId);
    const next = storeParticipantAccessItem(
      useBookingCollaborationStore.getState().participantAccess,
      result.item,
      participantId,
      instructorId
    );
    // result.item may omit relationship (null/absent) or include revoked/active —
    // both are valid loaded outcomes. Missing item deletes the pair entry and still
    // records loaded so the Trainer tab does not treat it as uninitialized.
    useBookingCollaborationStore.getState().setParticipantAccess(next);
    useBookingCollaborationStore.getState().setParticipantAccessQuery(queryKey, {
      status: 'loaded',
    });
    if (!result.item && !next.has(pairKey)) {
      return;
    }
  } catch (error) {
    useBookingCollaborationStore.getState().setParticipantAccessQuery(queryKey, {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to load participant access.',
    });
    throw error;
  }
}

/**
 * Force-refresh access for a stable key (mutation follow-up / explicit refresh).
 * One deliberate request; does not poll.
 */
export async function refetchParticipantAccessRead(
  scope: 'account_manager' | 'instructor',
  participantId: string,
  instructorId: string
): Promise<void> {
  await loadParticipantAccessRead(scope, participantId, instructorId);
}

/**
 * Load access once for a stable key unless already loading or loaded.
 * Stale / idle / missing status may fetch; error does not auto-retry.
 */
export async function ensureParticipantAccessRead(
  scope: 'account_manager' | 'instructor',
  participantId: string,
  instructorId: string
): Promise<void> {
  const queryKey = participantInstructorAccessQueryKey(scope, participantId, instructorId);
  const status = useBookingCollaborationStore.getState().participantAccessQueries.get(queryKey);
  if (status?.status === 'loading' || status?.status === 'loaded') {
    return;
  }
  try {
    await loadParticipantAccessRead(scope, participantId, instructorId);
  } catch {
    // Error status is already recorded; do not retry automatically.
  }
}

export function invalidateParticipantAccessRead(
  scope: 'account_manager' | 'instructor',
  participantId: string,
  instructorId: string
): void {
  const queryKey = participantInstructorAccessQueryKey(scope, participantId, instructorId);
  useBookingCollaborationStore.getState().setParticipantAccessQuery(queryKey, {
    status: 'stale',
  });
}

export function useBookingCollaborationReadSync(input: BookingCollaborationReadSyncInput) {
  const { customerEnabled, instructorEnabled, accountId, instructorId } = input;
  const previousAccountIdRef = useRef<string | undefined>(undefined);

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
    const previousAccountId = previousAccountIdRef.current;
    const accountChanged =
      previousAccountId !== undefined && previousAccountId !== accountId;
    previousAccountIdRef.current = accountId;

    // No authenticated customer account and no instructor workspace: full wipe
    // (logout / signed-out). Instructor-only fixtures may omit accountId.
    if (!accountId && !instructorEnabled) {
      useBookingCollaborationStore.getState().reset();
      return;
    }

    // Account switch without an intermediate null: drop prior account's access.
    if (accountChanged) {
      useBookingCollaborationStore.getState().reset();
    }

    // Leaving hot collaboration surfaces (e.g. Trainer → Training) must NOT
    // clear participantAccessQueries — remounting Trainer should reuse loaded keys.
    if (!customerEnabled && !instructorEnabled) {
      return;
    }

    // Refresh list-scoped reads only; preserve loaded access query status
    // unless the account just changed (full reset above).
    if (!accountChanged) {
      useBookingCollaborationStore.getState().resetCollaborationLists();
    }
    void reload();
  }, [customerEnabled, instructorEnabled, accountId, instructorId, reload]);

  return { reload };
}
