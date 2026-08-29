import {
  BookingIdSchema,
  BookingProposalIdSchema,
  BookingChangeRequestIdSchema,
  InstructorRelationshipIdSchema,
  ParticipantBlockIdSchema,
  type IdempotencyKey,
} from '@ski-academy/shared-domain';

export function createLogicalBookingProposalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return BookingProposalIdSchema.parse(
      `booking_proposal_${crypto.randomUUID().replace(/-/g, '')}`
    );
  }
  return BookingProposalIdSchema.parse(
    `booking_proposal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export function createLogicalBookingChangeRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return BookingChangeRequestIdSchema.parse(
      `booking_change_request_${crypto.randomUUID().replace(/-/g, '')}`
    );
  }
  return BookingChangeRequestIdSchema.parse(
    `booking_change_request_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  );
}

export function deriveWithdrawCancellationIdempotencyKey(
  bookingId: string,
  expectedRevision: number
): IdempotencyKey {
  return `withdraw-cancel:${bookingId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveRescheduleBookingIdempotencyKey(
  bookingId: string,
  expectedRevision: number,
  localDate: string,
  localTime: string
): IdempotencyKey {
  return `reschedule:${bookingId}:${expectedRevision}:${localDate}:${localTime}` as IdempotencyKey;
}

export function deriveAcceptProposalIdempotencyKey(
  proposalId: string,
  expectedRevision: number
): IdempotencyKey {
  return `accept-proposal:${proposalId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveDeclineProposalIdempotencyKey(
  proposalId: string,
  expectedRevision: number
): IdempotencyKey {
  return `decline-proposal:${proposalId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveWithdrawProposalIdempotencyKey(
  proposalId: string,
  expectedRevision: number
): IdempotencyKey {
  return `withdraw-proposal:${proposalId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveCreateProposalIdempotencyKey(proposalId: string): IdempotencyKey {
  return `create-proposal:${proposalId}` as IdempotencyKey;
}

export function deriveCreateChangeRequestIdempotencyKey(requestId: string): IdempotencyKey {
  return `create-change-request:${requestId}` as IdempotencyKey;
}

export function deriveWithdrawChangeRequestIdempotencyKey(
  requestId: string,
  expectedRevision: number
): IdempotencyKey {
  return `withdraw-change-request:${requestId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveCreateRelationshipIdempotencyKey(relationshipId: string): IdempotencyKey {
  return `create-relationship:${relationshipId}` as IdempotencyKey;
}

export function deriveRevokeRelationshipIdempotencyKey(
  relationshipId: string,
  expectedRevision: number
): IdempotencyKey {
  return `revoke-relationship:${relationshipId}:${expectedRevision}` as IdempotencyKey;
}

export function deriveBlockParticipantIdempotencyKey(blockId: string): IdempotencyKey {
  return `block-participant:${blockId}` as IdempotencyKey;
}

export function deriveUnblockParticipantIdempotencyKey(
  blockId: string,
  expectedRevision: number
): IdempotencyKey {
  return `unblock-participant:${blockId}:${expectedRevision}` as IdempotencyKey;
}

export function participantInstructorAccessKey(
  participantId: string,
  instructorId: string
): string {
  return `${participantId}:${instructorId}`;
}

export function parseBookingId(bookingId: string) {
  return BookingIdSchema.parse(bookingId);
}

export function parseInstructorRelationshipId(id: string) {
  return InstructorRelationshipIdSchema.parse(id);
}

export function parseParticipantBlockId(id: string) {
  return ParticipantBlockIdSchema.parse(id);
}
