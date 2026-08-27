import { useCallback } from 'react';
import {
  AggregateRevisionSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  BookingChangeRequestIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
} from '@ski-academy/shared-domain';
import {
  executeAuthenticatedCanonicalCommand,
  type ClientCallableCapability,
} from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import { mapLessonBookingCalendarInput } from '../lesson-bookings/mapCalendarInput';
import { resolveLessonBookingTimezone } from '../lesson-bookings/useLessonBookingReadSync';
import {
  createLogicalBookingChangeRequestId,
  createLogicalBookingProposalId,
  deriveAcceptProposalIdempotencyKey,
  deriveBlockParticipantIdempotencyKey,
  deriveCreateChangeRequestIdempotencyKey,
  deriveCreateProposalIdempotencyKey,
  deriveCreateRelationshipIdempotencyKey,
  deriveDeclineProposalIdempotencyKey,
  deriveRescheduleBookingIdempotencyKey,
  deriveRevokeRelationshipIdempotencyKey,
  deriveUnblockParticipantIdempotencyKey,
  deriveWithdrawCancellationIdempotencyKey,
  deriveWithdrawChangeRequestIdempotencyKey,
  deriveWithdrawProposalIdempotencyKey,
  parseInstructorRelationshipId,
  parseParticipantBlockId,
} from './deriveCollaborationIdempotencyKeys';
import {
  refetchCustomerCollaborationReads,
  refetchInstructorCollaborationReads,
  refetchParticipantAccessRead,
} from './useBookingCollaborationReadSync';

export function useBookingCollaborationCommands(input: {
  readonly accountId?: string;
  readonly instructorId?: string;
}) {
  const { accountId, instructorId } = input;

  const withdrawCancellation = useCallback(
    async (params: {
      readonly bookingId: string;
      readonly expectedRevision: number;
      readonly exercisedCapability: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'withdraw_booking_cancellation_request',
        intent: { bookingId: BookingIdSchema.parse(params.bookingId) },
        idempotencyKey: deriveWithdrawCancellationIdempotencyKey(
          params.bookingId,
          params.expectedRevision
        ),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const rescheduleBooking = useCallback(
    async (params: {
      readonly bookingId: string;
      readonly expectedRevision: number;
      readonly localDate: string;
      readonly localTime: string;
      readonly durationMinutes: number;
      readonly exercisedCapability: ClientCallableCapability;
      readonly reasonExplanation?: string;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const timezone = resolveLessonBookingTimezone();
      const calendarInput = mapLessonBookingCalendarInput({
        localDate: params.localDate,
        localTime: params.localTime,
        durationHours: params.durationMinutes / 60,
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'reschedule_booking',
        intent: {
          bookingId: BookingIdSchema.parse(params.bookingId),
          ...(params.reasonExplanation ? { reasonExplanation: params.reasonExplanation } : {}),
        },
        idempotencyKey: deriveRescheduleBookingIdempotencyKey(
          params.bookingId,
          params.expectedRevision,
          params.localDate,
          params.localTime
        ),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        calendarInput,
        timezone,
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const acceptProposal = useCallback(
    async (params: {
      readonly proposalId: string;
      readonly expectedRevision: number;
      readonly exercisedCapability: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'accept_booking_proposal',
        intent: { bookingProposalId: BookingProposalIdSchema.parse(params.proposalId) },
        idempotencyKey: deriveAcceptProposalIdempotencyKey(params.proposalId, params.expectedRevision),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const declineProposal = useCallback(
    async (params: {
      readonly proposalId: string;
      readonly expectedRevision: number;
      readonly exercisedCapability: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'cancel_booking_proposal',
        intent: { bookingProposalId: BookingProposalIdSchema.parse(params.proposalId) },
        idempotencyKey: deriveDeclineProposalIdempotencyKey(params.proposalId, params.expectedRevision),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const createProposal = useCallback(
    async (params: {
      readonly participantId: string;
      readonly localDate: string;
      readonly localTime: string;
      readonly durationMinutes: number;
    }): Promise<string> => {
      if (!accountId || !instructorId) throw new Error('Instructor context is required.');
      const proposalId = createLogicalBookingProposalId();
      const timezone = resolveLessonBookingTimezone();
      const calendarInput = mapLessonBookingCalendarInput({
        localDate: params.localDate,
        localTime: params.localTime,
        durationHours: params.durationMinutes / 60,
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_booking_proposal',
        intent: {
          bookingProposalId: BookingProposalIdSchema.parse(proposalId),
          instructorId: InstructorIdSchema.parse(instructorId),
          participantId: ParticipantIdSchema.parse(params.participantId),
        },
        idempotencyKey: deriveCreateProposalIdempotencyKey(proposalId),
        calendarInput,
        timezone,
        exercisedCapability: 'instructor',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchInstructorCollaborationReads();
      return proposalId;
    },
    [accountId, instructorId]
  );

  const withdrawProposal = useCallback(
    async (params: { readonly proposalId: string; readonly expectedRevision: number }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'cancel_booking_proposal',
        intent: { bookingProposalId: BookingProposalIdSchema.parse(params.proposalId) },
        idempotencyKey: deriveWithdrawProposalIdempotencyKey(params.proposalId, params.expectedRevision),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        exercisedCapability: 'instructor',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchInstructorCollaborationReads();
    },
    [accountId]
  );

  const createChangeRequest = useCallback(
    async (params: {
      readonly bookingId: string;
      readonly reason: string;
    }): Promise<string> => {
      if (!accountId) throw new Error('Authentication is required.');
      const requestId = createLogicalBookingChangeRequestId();
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_booking_change_request',
        intent: {
          bookingChangeRequestId: BookingChangeRequestIdSchema.parse(requestId),
          bookingId: BookingIdSchema.parse(params.bookingId),
          reason: params.reason,
        },
        idempotencyKey: deriveCreateChangeRequestIdempotencyKey(requestId),
        exercisedCapability: 'instructor',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchInstructorCollaborationReads();
      return requestId;
    },
    [accountId]
  );

  const withdrawChangeRequest = useCallback(
    async (params: { readonly requestId: string; readonly expectedRevision: number }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'withdraw_booking_change_request',
        intent: {
          bookingChangeRequestId: BookingChangeRequestIdSchema.parse(params.requestId),
        },
        idempotencyKey: deriveWithdrawChangeRequestIdempotencyKey(
          params.requestId,
          params.expectedRevision
        ),
        expectedRevision: AggregateRevisionSchema.parse(params.expectedRevision),
        exercisedCapability: 'instructor',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchInstructorCollaborationReads();
    },
    [accountId]
  );

  const createRelationship = useCallback(
    async (params: {
      readonly participantId: string;
      readonly targetInstructorId: string;
      readonly exercisedCapability: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const relationshipId = instructorRelationshipIdFromPair({
        participantId: ParticipantIdSchema.parse(params.participantId),
        instructorId: InstructorIdSchema.parse(params.targetInstructorId),
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'create_instructor_relationship',
        intent: {
          instructorRelationshipId: relationshipId,
          instructorId: InstructorIdSchema.parse(params.targetInstructorId),
          participantId: ParticipantIdSchema.parse(params.participantId),
          basis: { kind: 'guardian_permission' },
        },
        idempotencyKey: deriveCreateRelationshipIdempotencyKey(relationshipId),
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchParticipantAccessRead(
        'account_manager',
        params.participantId,
        params.targetInstructorId
      );
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const revokeRelationship = useCallback(
    async (params: {
      readonly instructorRelationshipId: string;
      readonly relationshipRevision: number;
      readonly participantId: string;
      readonly targetInstructorId: string;
      readonly exercisedCapability: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'revoke_instructor_relationship',
        intent: {
          instructorRelationshipId: parseInstructorRelationshipId(params.instructorRelationshipId),
        },
        idempotencyKey: deriveRevokeRelationshipIdempotencyKey(
          params.instructorRelationshipId,
          params.relationshipRevision
        ),
        expectedRevision: AggregateRevisionSchema.parse(params.relationshipRevision),
        exercisedCapability: params.exercisedCapability,
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchParticipantAccessRead(
        'account_manager',
        params.participantId,
        params.targetInstructorId
      );
      await refetchCustomerCollaborationReads();
    },
    [accountId]
  );

  const blockParticipant = useCallback(
    async (params: {
      readonly participantId: string;
      readonly targetInstructorId: string;
      readonly reason: string;
      readonly scope: 'account_manager' | 'instructor';
      readonly exercisedCapability?: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const blockId = participantBlockIdFromDirection({
        participantId: ParticipantIdSchema.parse(params.participantId),
        instructorId: InstructorIdSchema.parse(params.targetInstructorId),
        createdByKind: params.scope === 'account_manager' ? 'participant_manager' : 'instructor',
      });
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'block_participant',
        intent: {
          participantBlockId: blockId,
          participantId: ParticipantIdSchema.parse(params.participantId),
          instructorId: InstructorIdSchema.parse(params.targetInstructorId),
          reason: params.reason,
        },
        idempotencyKey: deriveBlockParticipantIdempotencyKey(blockId),
        exercisedCapability:
          params.scope === 'instructor' ? 'instructor' : params.exercisedCapability ?? 'account_owner',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchParticipantAccessRead(
        params.scope,
        params.participantId,
        params.targetInstructorId
      );
      if (params.scope === 'account_manager') {
        await refetchCustomerCollaborationReads();
      } else {
        await refetchInstructorCollaborationReads();
      }
    },
    [accountId]
  );

  const unblockParticipant = useCallback(
    async (params: {
      readonly participantBlockId: string;
      readonly blockRevision: number;
      readonly participantId: string;
      readonly targetInstructorId: string;
      readonly scope: 'account_manager' | 'instructor';
      readonly exercisedCapability?: ClientCallableCapability;
    }): Promise<void> => {
      if (!accountId) throw new Error('Authentication is required.');
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'unblock_participant',
        intent: {
          participantBlockId: parseParticipantBlockId(params.participantBlockId),
        },
        idempotencyKey: deriveUnblockParticipantIdempotencyKey(
          params.participantBlockId,
          params.blockRevision
        ),
        expectedRevision: AggregateRevisionSchema.parse(params.blockRevision),
        exercisedCapability:
          params.scope === 'instructor' ? 'instructor' : params.exercisedCapability ?? 'account_owner',
      });
      const error = mapCanonicalCommandResultError(result);
      if (error) throw error;
      await refetchParticipantAccessRead(
        params.scope,
        params.participantId,
        params.targetInstructorId
      );
      if (params.scope === 'account_manager') {
        await refetchCustomerCollaborationReads();
      } else {
        await refetchInstructorCollaborationReads();
      }
    },
    [accountId]
  );

  return {
    withdrawCancellation,
    rescheduleBooking,
    acceptProposal,
    declineProposal,
    createProposal,
    withdrawProposal,
    createChangeRequest,
    withdrawChangeRequest,
    createRelationship,
    revokeRelationship,
    blockParticipant,
    unblockParticipant,
    refetchCustomerCollaborationReads: accountId ? () => refetchCustomerCollaborationReads() : undefined,
    refetchInstructorCollaborationReads: accountId
      ? () => refetchInstructorCollaborationReads()
      : undefined,
    refetchParticipantAccessRead,
  };
}
