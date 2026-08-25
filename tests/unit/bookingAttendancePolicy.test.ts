import { describe, expect, it } from 'vitest';
import {
  AttendanceSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  bookingInstructorAttendanceWindowEnd,
  deriveGroupBookingAttendanceOutcome,
  deriveIndividualBookingAttendanceOutcome,
  evaluateBookingAutomationEligibility,
  evaluateBookingOutcomeCalculator,
  evaluateBookingOutcomeEligibility,
  evaluateInstructorAttendanceWindow,
  shouldCreateAttendancePaymentConflict,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalPrimitiveFixtures,
} from '@ski-academy/shared-domain/testing';

const individualBooking = canonicalBookingCollaborationFixtures.individualBooking;

const participantOne = canonicalPrimitiveFixtures.participantId;
const participantTwo = ParticipantIdSchema.parse('participant_booking_fixture_02');
const participantThree = ParticipantIdSchema.parse('participant_booking_fixture_03');
const startsAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));

function bookingFixture(
  overrides: Partial<{
    partyKind: 'individual' | 'family_group';
    participantIds: readonly string[];
    frozenAt: boolean;
    status: 'confirmed' | 'pending_cancellation' | 'completed';
  }> = {}
) {
  const participantIds = (overrides.participantIds ?? [
    participantOne,
  ]) as typeof individualBooking.party.participantIds;
  return BookingSchema.parse({
    ...individualBooking,
    party: {
      kind: overrides.partyKind ?? 'individual',
      participantIds,
    },
    occurrence: {
      ...individualBooking.occurrence,
      interval: { startsAt, endsAt },
      serviceParty: {
        participantIds,
        ...(overrides.frozenAt === false ? {} : { frozenAt: startsAt }),
      },
    },
    lifecycle:
      overrides.status === 'pending_cancellation'
        ? { status: 'pending_cancellation', requestedAt: individualBooking.updatedAt }
        : overrides.status === 'completed'
          ? { status: 'completed', completedAt: endsAt }
          : { status: 'confirmed' },
  });
}

function attendanceFor(participantId: typeof participantOne, status: 'present' | 'absent') {
  const occurrenceId = individualBooking.occurrence.occurrenceId;
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId,
  });
  return AttendanceSchema.parse({
    attendanceId,
    subject: {
      subjectKind: 'booking',
      bookingId: individualBooking.bookingId,
      occurrenceId,
      participantId,
    },
    attendanceStatus: status,
    recordedBy: { kind: 'instructor', instructorId: canonicalPrimitiveFixtures.instructorId },
    recordedAt: endsAt,
    lastChangedBy: { kind: 'instructor', instructorId: canonicalPrimitiveFixtures.instructorId },
    updatedAt: endsAt,
    revision: 1,
    correlationId: canonicalPrimitiveFixtures.correlationId,
  });
}

describe('bookingAttendancePolicy', () => {
  it('uses inclusive instructor window boundaries', () => {
    expect(evaluateInstructorAttendanceWindow({ now: startsAt, startsAt, endsAt })).toBe(
      'in_window'
    );
    expect(
      evaluateInstructorAttendanceWindow({
        now: bookingInstructorAttendanceWindowEnd(endsAt),
        startsAt,
        endsAt,
      })
    ).toBe('in_window');
    expect(
      evaluateInstructorAttendanceWindow({
        now: timestampFromDate(new Date('2026-01-15T08:59:59.999Z')),
        startsAt,
        endsAt,
      })
    ).toBe('before_start');
    expect(
      evaluateInstructorAttendanceWindow({
        now: timestampFromDate(new Date('2026-01-16T10:00:00.001Z')),
        startsAt,
        endsAt,
      })
    ).toBe('after_instructor_window');
  });

  it('defers outcome until endsAt and automation until endsAt + 24h', () => {
    expect(
      evaluateBookingOutcomeEligibility({
        now: timestampFromDate(new Date('2026-01-15T09:59:59.999Z')),
        endsAt,
      })
    ).toBe('not_yet_eligible');
    expect(
      evaluateBookingOutcomeEligibility({
        now: endsAt,
        endsAt,
      })
    ).toBe('eligible');
    expect(
      evaluateBookingAutomationEligibility({
        now: bookingInstructorAttendanceWindowEnd(endsAt),
        endsAt,
      })
    ).toBe('eligible');
  });

  it('derives individual outcomes from attendance only', () => {
    expect(deriveIndividualBookingAttendanceOutcome(attendanceFor(participantOne, 'present'))).toBe(
      'completed'
    );
    expect(deriveIndividualBookingAttendanceOutcome(attendanceFor(participantOne, 'absent'))).toBe(
      'no_show'
    );
    expect(deriveIndividualBookingAttendanceOutcome(undefined)).toBe('missing_attendance');
  });

  it('derives group outcomes with any-present and all-absent rules', () => {
    const targets = [participantOne, participantTwo, participantThree] as const;
    const allAbsent = new Map([
      [participantOne, attendanceFor(participantOne, 'absent')],
      [participantTwo, attendanceFor(participantTwo, 'absent')],
      [participantThree, attendanceFor(participantThree, 'absent')],
    ]);
    expect(
      deriveGroupBookingAttendanceOutcome({
        targetParticipantIds: targets,
        attendancesByParticipantId: allAbsent,
      }).outcome
    ).toBe('no_show');

    const anyPresent = new Map([
      [participantOne, attendanceFor(participantOne, 'absent')],
      [participantTwo, attendanceFor(participantTwo, 'present')],
    ]);
    expect(
      deriveGroupBookingAttendanceOutcome({
        targetParticipantIds: targets,
        attendancesByParticipantId: anyPresent,
      }).outcome
    ).toBe('completed');

    const absentAndMissing = new Map([
      [participantOne, attendanceFor(participantOne, 'absent')],
      [participantTwo, attendanceFor(participantTwo, 'absent')],
    ]);
    expect(
      deriveGroupBookingAttendanceOutcome({
        targetParticipantIds: targets,
        attendancesByParticipantId: absentAndMissing,
      })
    ).toEqual({
      outcome: 'missing_attendance',
      missingParticipantIds: [participantThree],
    });
  });

  it('blocks outcome before endsAt even when attendance exists', () => {
    const booking = bookingFixture();
    const attendances = new Map([[participantOne, attendanceFor(participantOne, 'present')]]);
    expect(
      evaluateBookingOutcomeCalculator({
        now: timestampFromDate(new Date('2026-01-15T09:30:00.000Z')),
        booking,
        attendancesByParticipantId: attendances,
        openAdminIssues: [],
        automationOnly: false,
      })
    ).toEqual({ outcome: 'not_yet_eligible' });
  });

  it('blocks pending_cancellation and payment conflict outcomes', () => {
    const booking = bookingFixture({ status: 'pending_cancellation' });
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: new Map(),
        openAdminIssues: [],
        automationOnly: false,
      })
    ).toEqual({ outcome: 'blocked_pending_cancellation' });

    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking: bookingFixture(),
        attendancesByParticipantId: new Map([
          [participantOne, attendanceFor(participantOne, 'present')],
        ]),
        openAdminIssues: [],
        automationOnly: false,
        justRecordedPresentWithPaymentConflict: true,
      })
    ).toEqual({ outcome: 'recorded_with_issue', issueKind: 'attendance_payment_conflict' });
  });

  it('detects payment conflict only for present attendance with active payment issue', () => {
    expect(
      shouldCreateAttendancePaymentConflict({
        attendanceStatus: 'present',
        openPaymentRequiredAtStart: true,
      })
    ).toBe(true);
    expect(
      shouldCreateAttendancePaymentConflict({
        attendanceStatus: 'absent',
        openPaymentRequiredAtStart: true,
      })
    ).toBe(false);
  });
});
