import { describe, expect, it } from 'vitest';
import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { mapBookingProposalReadModelToCabinetItem } from '../../src/features/booking-collaboration/proposalViewModel';
import { mapBookingChangeRequestReadModelToCabinetItem } from '../../src/features/booking-collaboration/changeRequestViewModel';
import { mapParticipantInstructorAccessReadModelToCabinetItem } from '../../src/features/booking-collaboration/participantAccessViewModel';
import {
  deriveAcceptProposalIdempotencyKey,
  deriveRescheduleBookingIdempotencyKey,
  deriveWithdrawCancellationIdempotencyKey,
} from '../../src/features/booking-collaboration/deriveCollaborationIdempotencyKeys';
import { presentCanonicalCommandError } from '../../src/features/booking-collaboration/presentCollaborationError';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const serviceStart = timestampFromDate(new Date('2026-06-15T09:00:00.000Z'));
const serviceEnd = timestampFromDate(new Date('2026-06-15T10:00:00.000Z'));

describe('booking collaboration view models', () => {
  it('maps proposal read model to cabinet item with authorizedActions', () => {
    const item = mapBookingProposalReadModelToCabinetItem({
      proposalId: BookingProposalIdSchema.parse('booking_proposal_vm_01'),
      revision: 3,
      participantId: ParticipantIdSchema.parse('participant_vm_01'),
      instructorId: InstructorIdSchema.parse('instructor_vm_01'),
      participantDisplayName: 'Student',
      instructorDisplayName: 'Coach',
      proposedService: {
        startsAt: serviceStart,
        endsAt: serviceEnd,
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      lifecycle: { status: 'open' },
      authorizedActions: { canAccept: true, canDecline: true, canWithdraw: false },
      updatedAt: decidedAt,
    });
    expect(item.lifecycleStatus).toBe('open');
    expect(item.authorizedActions.canAccept).toBe(true);
    expect(item.date).toBe('2026-06-15');
  });

  it('maps change request read model to cabinet item', () => {
    const item = mapBookingChangeRequestReadModelToCabinetItem({
      requestId: BookingChangeRequestIdSchema.parse('booking_change_request_vm_01'),
      revision: 2,
      bookingId: BookingIdSchema.parse('booking_vm_01'),
      requestType: 'instructor_unavailable',
      reason: 'Sick day',
      lifecycle: { status: 'open' },
      authorizedActions: { canWithdraw: true },
      updatedAt: decidedAt,
    });
    expect(item.requestType).toBe('instructor_unavailable');
    expect(item.authorizedActions.canWithdraw).toBe(true);
  });

  it('maps participant access read model to cabinet item', () => {
    const item = mapParticipantInstructorAccessReadModelToCabinetItem({
      participantId: ParticipantIdSchema.parse('participant_vm_01'),
      instructorId: InstructorIdSchema.parse('instructor_vm_01'),
      participantDisplayName: 'Student',
      instructorDisplayName: 'Coach',
      authorizedActions: {
        canCreateRelationship: true,
        canRevokeRelationship: false,
        canBlock: true,
        canUnblock: false,
      },
    });
    expect(item.authorizedActions.canCreateRelationship).toBe(true);
    expect(item.authorizedActions.canBlock).toBe(true);
  });
});

describe('booking collaboration idempotency keys', () => {
  it('derives stable command keys', () => {
    expect(deriveWithdrawCancellationIdempotencyKey('booking_a', 4)).toBe(
      'withdraw-cancel:booking_a:4'
    );
    expect(deriveRescheduleBookingIdempotencyKey('booking_a', 4, '2026-06-16', '10:00')).toBe(
      'reschedule:booking_a:4:2026-06-16:10:00'
    );
    expect(deriveAcceptProposalIdempotencyKey('booking_proposal_a', 2)).toBe(
      'accept-proposal:booking_proposal_a:2'
    );
  });
});

describe('booking collaboration error mapping', () => {
  it('marks stale_version as refresh-required', () => {
    const presented = presentCanonicalCommandError(
      new CanonicalCommandClientError('stale_version', {
        correlationId: 'correlation_stale',
        currentRevision: 9,
      })
    );
    expect(presented.shouldRefresh).toBe(true);
    expect(presented.currentRevision).toBe(9);
  });
});
