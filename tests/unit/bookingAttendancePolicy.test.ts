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
  attendanceIsOverdue,
  bookingInstructorAttendanceWindowEnd,
  deriveGroupBookingAttendanceOutcome,
  deriveIndividualBookingAttendanceOutcome,
  evaluateBookingAutomationEligibility,
  evaluateBookingOutcomeCalculator,
  evaluateBookingOutcomeEligibility,
  evaluateInstructorAttendanceWindow,
  evaluateInstructorBookingAttendanceActions,
  instructorMayFillMissingFamilyGroupAttendanceOnTerminal,
  missingAttendanceParticipantIds,
  missingBookingAttendanceIssueIdentity,
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
    status: 'confirmed' | 'pending_cancellation' | 'completed' | 'cancelled' | 'no_show';
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
          : overrides.status === 'cancelled'
            ? {
                status: 'cancelled',
                cancelledAt: endsAt,
                reasonCode: 'administrator_cancelled' as const,
              }
            : overrides.status === 'no_show'
              ? { status: 'no_show', noShowAt: endsAt }
              : { status: 'confirmed' },
    ...(overrides.status === 'completed' ||
    overrides.status === 'cancelled' ||
    overrides.status === 'no_show'
      ? { updatedAt: endsAt }
      : {}),
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

  it('lets instructor fill missing family_group attendance after completed without changing lifecycle', () => {
    const booking = bookingFixture({
      partyKind: 'family_group',
      participantIds: [participantOne, participantTwo, participantThree],
      status: 'completed',
    });
    const attendances = new Map([[participantOne, attendanceFor(participantOne, 'present')]]);
    expect(
      instructorMayFillMissingFamilyGroupAttendanceOnTerminal({
        booking,
        participantId: participantTwo,
        existingAttendance: undefined,
        intentAttendanceStatus: 'absent',
        attendancesByParticipantId: attendances,
      })
    ).toBe(true);
    expect(
      instructorMayFillMissingFamilyGroupAttendanceOnTerminal({
        booking,
        participantId: participantOne,
        existingAttendance: attendanceFor(participantOne, 'present'),
        intentAttendanceStatus: 'absent',
        attendancesByParticipantId: attendances,
      })
    ).toBe(false);

    const actions = evaluateInstructorBookingAttendanceActions({
      booking,
      now: timestampFromDate(new Date('2026-01-15T11:00:00.000Z')),
      participantId: participantTwo,
      existingAttendance: undefined,
      attendancesByParticipantId: attendances,
    });
    expect(actions).toEqual({ canRecordPresent: true, canRecordAbsent: true });
    expect(
      evaluateInstructorBookingAttendanceActions({
        booking,
        now: timestampFromDate(new Date('2026-01-15T11:00:00.000Z')),
        participantId: participantOne,
        existingAttendance: attendanceFor(participantOne, 'present'),
        attendancesByParticipantId: attendances,
      })
    ).toEqual({ canRecordPresent: false, canRecordAbsent: false });
    expect(
      evaluateInstructorBookingAttendanceActions({
        booking,
        now: timestampFromDate(new Date('2026-01-16T10:00:00.001Z')),
        participantId: participantTwo,
        existingAttendance: undefined,
        attendancesByParticipantId: attendances,
      })
    ).toEqual({ canRecordPresent: false, canRecordAbsent: false });
  });

  it('resolves deterministic outcomes at endsAt even for scheduler automation', () => {
    const booking = bookingFixture();
    const present = new Map([[participantOne, attendanceFor(participantOne, 'present')]]);
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: present,
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({ outcome: 'resolve', lifecycle: 'completed' });

    const absent = new Map([[participantOne, attendanceFor(participantOne, 'absent')]]);
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: absent,
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({ outcome: 'resolve', lifecycle: 'no_show' });
  });

  it('defers scheduled missing_attendance until the instructor window ends', () => {
    const booking = bookingFixture();
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: new Map(),
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({ outcome: 'not_yet_eligible' });
    expect(
      evaluateBookingOutcomeCalculator({
        now: bookingInstructorAttendanceWindowEnd(endsAt),
        booking,
        attendancesByParticipantId: new Map(),
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({
      outcome: 'unresolved',
      issueKind: 'missing_attendance',
      missingParticipantIds: [participantOne],
    });
  });

  it('keeps group bookings confirmed when no present exists and any attendance is missing', () => {
    const booking = bookingFixture({
      partyKind: 'family_group',
      participantIds: [participantOne, participantTwo, participantThree],
    });
    const absentAndMissing = new Map([
      [participantOne, attendanceFor(participantOne, 'absent')],
      [participantTwo, attendanceFor(participantTwo, 'absent')],
    ]);
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: absentAndMissing,
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({ outcome: 'not_yet_eligible' });
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: absentAndMissing,
        openAdminIssues: [],
        automationOnly: false,
      })
    ).toEqual({
      outcome: 'unresolved',
      issueKind: 'missing_attendance',
      missingParticipantIds: [participantThree],
    });
  });

  it('completes a group booking from any present even when another participant is absent', () => {
    const booking = bookingFixture({
      partyKind: 'family_group',
      participantIds: [participantOne, participantTwo, participantThree],
    });
    const twoPresentOneAbsent = new Map([
      [participantOne, attendanceFor(participantOne, 'present')],
      [participantTwo, attendanceFor(participantTwo, 'present')],
      [participantThree, attendanceFor(participantThree, 'absent')],
    ]);
    expect(
      evaluateBookingOutcomeCalculator({
        now: endsAt,
        booking,
        attendancesByParticipantId: twoPresentOneAbsent,
        openAdminIssues: [],
        automationOnly: true,
      })
    ).toEqual({ outcome: 'resolve', lifecycle: 'completed' });
  });

  it('does not infer absent from missing evidence', () => {
    expect(
      deriveGroupBookingAttendanceOutcome({
        targetParticipantIds: [participantOne, participantTwo, participantThree],
        attendancesByParticipantId: new Map([
          [participantOne, attendanceFor(participantOne, 'present')],
        ]),
      })
    ).toMatchObject({
      outcome: 'completed',
      missingParticipantIds: [participantTwo, participantThree],
    });
  });
});

describe('lesson attendance overdue follow-up', () => {
  const deadline = bookingInstructorAttendanceWindowEnd(endsAt);
  const beforeDeadline = timestampFromDate(new Date('2026-01-16T09:59:59.000Z'));

  it('A. just after endsAt, missing Attendance is not overdue', () => {
    const booking = bookingFixture();
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map(),
        now: endsAt,
      })
    ).toBe(false);
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map(),
        now: beforeDeadline,
      })
    ).toBe(false);
  });

  it('B. single missing participant is overdue at endsAt+24h', () => {
    const booking = bookingFixture();
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map(),
        now: deadline,
      })
    ).toBe(true);
    expect(missingAttendanceParticipantIds(booking, new Map())).toEqual([participantOne]);
  });

  it('D/E. present or absent after overdue clears overdue', () => {
    const booking = bookingFixture();
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map([[participantOne, attendanceFor(participantOne, 'present')]]),
        now: deadline,
      })
    ).toBe(false);
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map([[participantOne, attendanceFor(participantOne, 'absent')]]),
        now: deadline,
      })
    ).toBe(false);
  });

  it('F. multi-participant overdue is one booking with only the missing ids', () => {
    const booking = bookingFixture({
      partyKind: 'family_group',
      participantIds: [participantOne, participantTwo, participantThree],
      status: 'completed',
    });
    const rows = new Map([
      [participantOne, attendanceFor(participantOne, 'present')],
      [participantTwo, attendanceFor(participantTwo, 'absent')],
    ]);
    expect(missingAttendanceParticipantIds(booking, rows)).toEqual([participantThree]);
    expect(attendanceIsOverdue({ booking, attendanceRows: rows, now: deadline })).toBe(true);
    expect(
      missingBookingAttendanceIssueIdentity({
        bookingId: booking.bookingId,
        occurrenceId: booking.occurrence.occurrenceId,
      }).participantId
    ).toBeUndefined();
  });

  it('G. recording the last missing participant clears overdue', () => {
    const booking = bookingFixture({
      partyKind: 'family_group',
      participantIds: [participantOne, participantTwo, participantThree],
      status: 'completed',
    });
    const rows = new Map([
      [participantOne, attendanceFor(participantOne, 'present')],
      [participantTwo, attendanceFor(participantTwo, 'absent')],
      [participantThree, attendanceFor(participantThree, 'present')],
    ]);
    expect(attendanceIsOverdue({ booking, attendanceRows: rows, now: deadline })).toBe(false);
  });

  it('L. cancelled bookings are not attendance-overdue', () => {
    const booking = bookingFixture({ status: 'cancelled' });
    expect(
      attendanceIsOverdue({
        booking,
        attendanceRows: new Map(),
        now: deadline,
      })
    ).toBe(false);
  });

  it('does not treat mutable party extras as missing service-party attendance', () => {
    const booking = BookingSchema.parse({
      ...bookingFixture({
        partyKind: 'family_group',
        participantIds: [participantOne, participantTwo],
      }),
      party: {
        kind: 'family_group',
        participantIds: [participantOne, participantTwo, participantThree],
      },
    });
    expect(missingAttendanceParticipantIds(booking, new Map())).toEqual([
      participantOne,
      participantTwo,
    ]);
  });
});
