import { describe, expect, it } from 'vitest';
import {
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { mapBookingProposalReadModelToCabinetItem, mergeProposalRecords } from '../../src/features/booking-collaboration/proposalViewModel';
import {
  mapBookingChangeRequestReadModelToCabinetItem,
  mergeChangeRequestRecords,
} from '../../src/features/booking-collaboration/changeRequestViewModel';
import { mapParticipantInstructorAccessReadModelToCabinetItem } from '../../src/features/booking-collaboration/participantAccessViewModel';
import { mergeInstructorLessonBookingRecords, mapInstructorLessonBookingReadModel } from '../../src/features/booking-collaboration/instructorLessonBookingViewModel';
import {
  deriveAcceptProposalIdempotencyKey,
  deriveRescheduleBookingIdempotencyKey,
  deriveRecordInstructorAttendanceIdempotencyKey,
  deriveWithdrawCancellationIdempotencyKey,
} from '../../src/features/booking-collaboration/deriveCollaborationIdempotencyKeys';
import { presentCanonicalCommandError, presentCanonicalCommandErrorWithContext } from '../../src/features/booking-collaboration/presentCollaborationError';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const serviceStart = timestampFromDate(new Date('2026-06-15T09:00:00.000Z'));
const serviceEnd = timestampFromDate(new Date('2026-06-15T10:00:00.000Z'));

describe('booking collaboration view models', () => {
  it('maps proposal read model to cabinet item with authorizedActions', () => {
    const item = mapBookingProposalReadModelToCabinetItem({
      proposalId: BookingProposalIdSchema.parse('booking_proposal_vm_01'),
      revision: 3,
      participantIds: [ParticipantIdSchema.parse('participant_vm_01')],
      instructorId: InstructorIdSchema.parse('instructor_vm_01'),
      participantDisplayNames: ['Student'],
      instructorDisplayName: 'Coach',
      proposedService: {
        startsAt: serviceStart,
        endsAt: serviceEnd,
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      lifecycle: { status: 'open' },
      authorizedActions: { canAccept: true, canDecline: true, canWithdraw: false },
      clientExercisedCapability: 'parent_guardian',
      updatedAt: decidedAt,
    });
    expect(item.lifecycleStatus).toBe('open');
    expect(item.authorizedActions.canAccept).toBe(true);
    expect(item.clientExercisedCapability).toBe('parent_guardian');
    expect(item.sourceScope).toBe('account_open');
    expect(item.date).toBe('2026-06-15');
    expect(item.participantIds).toEqual([ParticipantIdSchema.parse('participant_vm_01')]);
    expect(item.participantDisplayName).toBe('Student');
  });

  it('drops open proposals that left an open-scope snapshot', () => {
    const proposalId = BookingProposalIdSchema.parse('booking_proposal_vm_01');
    const existing = new Map([
      [
        proposalId,
        mapBookingProposalReadModelToCabinetItem(
          {
            proposalId,
            revision: 1,
            participantIds: [ParticipantIdSchema.parse('participant_vm_01')],
            instructorId: InstructorIdSchema.parse('instructor_vm_01'),
            participantDisplayNames: ['Student'],
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
          },
          'account_open'
        ),
      ],
    ]);
    const merged = mergeProposalRecords(existing, [], 'account_open');
    expect(merged.size).toBe(0);
  });

  it('keeps instructor-open proposals when the account-open snapshot is empty', () => {
    const proposalId = BookingProposalIdSchema.parse('booking_proposal_vm_instructor_01');
    const existing = new Map([
      [
        proposalId,
        mapBookingProposalReadModelToCabinetItem(
          {
            proposalId,
            revision: 1,
            participantIds: [ParticipantIdSchema.parse('participant_vm_01')],
            instructorId: InstructorIdSchema.parse('instructor_vm_01'),
            participantDisplayNames: ['Student'],
            instructorDisplayName: 'Coach',
            proposedService: {
              startsAt: serviceStart,
              endsAt: serviceEnd,
              timeZone: 'Asia/Almaty',
              durationMinutes: 60,
            },
            lifecycle: { status: 'open' },
            authorizedActions: { canAccept: false, canDecline: false, canWithdraw: true },
            updatedAt: decidedAt,
          },
          'instructor_open'
        ),
      ],
    ]);
    const merged = mergeProposalRecords(existing, [], 'account_open');
    expect(merged.get(proposalId)?.sourceScope).toBe('instructor_open');
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
    expect(item.sourceScope).toBe('account_open');
  });

  it('drops open change requests that left an open-scope snapshot', () => {
    const requestId = BookingChangeRequestIdSchema.parse('booking_change_request_vm_01');
    const bookingId = BookingIdSchema.parse('booking_vm_01');
    const existing = new Map([
      [
        requestId,
        mapBookingChangeRequestReadModelToCabinetItem(
          {
            requestId,
            revision: 2,
            bookingId,
            requestType: 'instructor_unavailable',
            reason: 'Sick day',
            lifecycle: { status: 'open' },
            authorizedActions: { canWithdraw: true },
            updatedAt: decidedAt,
          },
          'instructor_open'
        ),
      ],
    ]);
    const merged = mergeChangeRequestRecords(existing, [], 'instructor_open');
    expect(merged.size).toBe(0);
  });

  it('maps participant access read model to cabinet item', () => {
    const item = mapParticipantInstructorAccessReadModelToCabinetItem({
      participantIds: [ParticipantIdSchema.parse('participant_vm_01')],
      instructorId: InstructorIdSchema.parse('instructor_vm_01'),
      participantDisplayNames: ['Student'],
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
    expect(
      deriveRecordInstructorAttendanceIdempotencyKey({
        bookingId: 'booking_a',
        participantId: 'participant_a',
        attendanceStatus: 'present',
      })
    ).toBe('attendance:booking_a:participant_a:present:missing');
    expect(
      deriveRecordInstructorAttendanceIdempotencyKey({
        bookingId: 'booking_a',
        participantId: 'participant_a',
        attendanceStatus: 'absent',
        expectedAttendanceRevision: 1,
      })
    ).toBe('attendance:booking_a:participant_a:absent:1');
    expect(
      deriveRecordInstructorAttendanceIdempotencyKey({
        bookingId: 'booking_a',
        participantId: 'participant_a',
        attendanceStatus: 'present',
      })
    ).toBe(
      deriveRecordInstructorAttendanceIdempotencyKey({
        bookingId: 'booking_a',
        participantId: 'participant_a',
        attendanceStatus: 'present',
      })
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

  it('maps missing instructor-participant authority to proposal permission copy, not accessSuspended', () => {
    const presented = presentCanonicalCommandErrorWithContext(
      new CanonicalCommandClientError('forbidden', {
        correlationId: 'correlation_forbidden_participant',
        details: { resourceKind: 'participant', reason: 'conflict' },
      }),
      { t: (key: string) => key }
    );
    expect(presented.message).toBe('collabProposalNotPermitted');
    expect(presented.message).not.toBe('accessSuspended');
  });

  it('maps participant_conflict to a busy-slot message', () => {
    const presented = presentCanonicalCommandErrorWithContext(
      new CanonicalCommandClientError('participant_conflict', {
        correlationId: 'correlation_participant_conflict',
      }),
      { t: (key: string) => key }
    );
    expect(presented.message).toBe('collabParticipantBusyAtTime');
  });
});

describe('instructor lesson booking store refresh', () => {
  it('replaces a confirmed booking with the terminal read model after refetch', () => {
    const bookingId = BookingIdSchema.parse('booking_instructor_refresh_01');
    const participantId = ParticipantIdSchema.parse('participant_instructor_refresh_01');
    const instructorId = InstructorIdSchema.parse('instructor_instructor_refresh_01');
    const base = {
      bookingId,
      partyKind: 'individual' as const,
      participantIds: [participantId],
      participants: [{ participantId, displayName: 'Student' }],
      instructor: { instructorId, displayName: 'Coach' },
      occurrence: {
        startsAt: serviceStart,
        endsAt: serviceEnd,
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      bookingOrigin: 'account' as const,
      notes: '',
      authorizedActions: {
        canRequestCancellation: false,
        canWithdrawCancellation: false,
        canReschedule: false,
        canCreateChangeRequest: false,
      },
      updatedAt: decidedAt,
    };
    const confirmed = mergeInstructorLessonBookingRecords(new Map(), [
      {
        ...base,
        revision: 1,
        lifecycle: { status: 'confirmed' as const },
        attendance: [
          {
            participantId,
            attendanceStatus: 'present' as const,
            revision: 1,
            authorizedActions: { canRecordPresent: false, canRecordAbsent: true },
          },
        ],
      },
    ]);
    expect(confirmed.get(bookingId)?.status).toBe('confirmed');

    const completed = mergeInstructorLessonBookingRecords(confirmed, [
      {
        ...base,
        revision: 2,
        lifecycle: { status: 'completed' as const, completedAt: serviceEnd },
        attendance: [
          {
            participantId,
            attendanceStatus: 'present' as const,
            revision: 1,
            authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
          },
        ],
      },
    ]);
    expect(completed.get(bookingId)?.status).toBe('completed');
    expect(completed.get(bookingId)?.revision).toBe(2);
  });

  it('preserves canonical no_show instead of mapping it to completed', () => {
    const bookingId = BookingIdSchema.parse('booking_instructor_no_show_01');
    const participantId = ParticipantIdSchema.parse('participant_instructor_no_show_01');
    const instructorId = InstructorIdSchema.parse('instructor_instructor_no_show_01');
    const item = mapInstructorLessonBookingReadModel({
      bookingId,
      revision: 2,
      partyKind: 'individual',
      participantIds: [participantId],
      participants: [{ participantId, displayName: 'Student' }],
      instructor: { instructorId, displayName: 'Coach' },
      occurrence: {
        startsAt: serviceStart,
        endsAt: serviceEnd,
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      bookingOrigin: 'account',
      notes: '',
      authorizedActions: {
        canRequestCancellation: false,
        canWithdrawCancellation: false,
        canReschedule: false,
        canCreateChangeRequest: false,
      },
      lifecycle: { status: 'no_show', noShowAt: serviceEnd },
      attendance: [
        {
          participantId,
          attendanceStatus: 'absent',
          revision: 1,
          authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
        },
      ],
      updatedAt: decidedAt,
    });
    expect(item.status).toBe('no_show');
    expect(item.attendance[0]?.attendanceStatus).toBe('absent');
  });

  it('keeps mixed group attendance: booking completed does not mark an absent participant attended', () => {
    const bookingId = BookingIdSchema.parse('booking_instructor_mixed_01');
    const presentId = ParticipantIdSchema.parse('participant_instructor_mixed_present');
    const absentId = ParticipantIdSchema.parse('participant_instructor_mixed_absent');
    const instructorId = InstructorIdSchema.parse('instructor_instructor_mixed_01');
    const item = mapInstructorLessonBookingReadModel({
      bookingId,
      revision: 3,
      partyKind: 'family_group',
      participantIds: [presentId, absentId],
      participants: [
        { participantId: presentId, displayName: 'Present Child' },
        { participantId: absentId, displayName: 'Absent Child' },
      ],
      instructor: { instructorId, displayName: 'Coach' },
      occurrence: {
        startsAt: serviceStart,
        endsAt: serviceEnd,
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      bookingOrigin: 'account',
      notes: '',
      authorizedActions: {
        canRequestCancellation: false,
        canWithdrawCancellation: false,
        canReschedule: false,
        canCreateChangeRequest: false,
      },
      lifecycle: { status: 'completed', completedAt: serviceEnd },
      attendance: [
        {
          participantId: presentId,
          attendanceStatus: 'present',
          revision: 1,
          authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
        },
        {
          participantId: absentId,
          attendanceStatus: 'absent',
          revision: 1,
          authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
        },
      ],
      updatedAt: decidedAt,
    });
    expect(item.status).toBe('completed');
    expect(item.attendance.find((row) => row.participantId === presentId)?.attendanceStatus).toBe(
      'present'
    );
    expect(item.attendance.find((row) => row.participantId === absentId)?.attendanceStatus).toBe(
      'absent'
    );
  });
});
