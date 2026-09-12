import { describe, expect, it } from 'vitest';
import {
  AttendanceSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingSchema,
  ParticipantIdSchema,
  timestampFromDate,
  bookingIsCompletedService,
  bookingIsNoShowOutcome,
  bookingOccupiesInstructorSlot,
  participantAttendedLesson,
  participantLearningDurationHours,
  participantPresentQualifiesStreakWeek,
  participantPresentQualifiesStreakWeekFromEvidence,
  participantWasAbsentFromLesson,
  resolveParticipantBookingAttendance,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalPrimitiveFixtures,
} from '@ski-academy/shared-domain/testing';

const individualBooking = canonicalBookingCollaborationFixtures.individualBooking;
const participantA = canonicalPrimitiveFixtures.participantId;
const participantB = ParticipantIdSchema.parse('participant_booking_fixture_02');
const participantC = ParticipantIdSchema.parse('participant_booking_fixture_03');
const participantOutside = ParticipantIdSchema.parse('participant_booking_fixture_outside');
const occurrenceId = individualBooking.occurrence.occurrenceId;
const bookingId = individualBooking.bookingId;
const recordedAt = timestampFromDate(new Date('2026-01-15T10:30:00.000Z'));

function attendanceFor(participantId: typeof participantA, status: 'present' | 'absent') {
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
      bookingId,
      occurrenceId,
      participantId,
    },
    attendanceStatus: status,
    recordedBy: { kind: 'instructor', instructorId: canonicalPrimitiveFixtures.instructorId },
    recordedAt,
    lastChangedBy: { kind: 'instructor', instructorId: canonicalPrimitiveFixtures.instructorId },
    updatedAt: recordedAt,
    revision: 1,
    correlationId: canonicalPrimitiveFixtures.correlationId,
  });
}

function familyPartyInput(
  attendances: ReturnType<typeof attendanceFor>[],
  lessonDurationHours = 1.5
) {
  const servicePartyParticipantIds = [participantA, participantB, participantC] as const;
  const attendancesByParticipantId = new Map(
    attendances.map((row) => [row.subject.participantId, { attendanceStatus: row.attendanceStatus }])
  );
  return {
    servicePartyParticipantIds,
    attendancesByParticipantId,
    lessonDurationHours,
  };
}

function participantInput(
  participantId: typeof participantA,
  base: ReturnType<typeof familyPartyInput>
) {
  return {
    participantId,
    servicePartyParticipantIds: base.servicePartyParticipantIds,
    attendancesByParticipantId: base.attendancesByParticipantId,
    lessonDurationHours: base.lessonDurationHours,
  };
}

describe('participantLessonStatsSemantics — participant learning', () => {
  const completedLifecycle = 'completed' as const;

  it('1. completed booking + A present → A attended', () => {
    expect(completedLifecycle).toBe('completed');
    const base = familyPartyInput([attendanceFor(participantA, 'present')]);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(true);
  });

  it('2. completed booking + A absent → A not attended', () => {
    const base = familyPartyInput([attendanceFor(participantA, 'absent')]);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(false);
  });

  it('3. completed booking + missing row → not attended', () => {
    const base = familyPartyInput([]);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(false);
  });

  it('4–5. mixed attendance: only A attended; A present does not credit B', () => {
    const base = familyPartyInput([
      attendanceFor(participantA, 'present'),
      attendanceFor(participantB, 'absent'),
    ]);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(true);
    expect(participantAttendedLesson(participantInput(participantB, base))).toBe(false);
    expect(participantAttendedLesson(participantInput(participantC, base))).toBe(false);
  });

  it('6. participant outside service party → no credit', () => {
    const base = familyPartyInput([attendanceFor(participantA, 'present')]);
    expect(
      participantAttendedLesson({
        participantId: participantOutside,
        servicePartyParticipantIds: base.servicePartyParticipantIds,
        attendancesByParticipantId: base.attendancesByParticipantId,
      })
    ).toBe(false);
    expect(
      resolveParticipantBookingAttendance({
        participantId: participantOutside,
        servicePartyParticipantIds: base.servicePartyParticipantIds,
        attendancesByParticipantId: base.attendancesByParticipantId,
      }).kind
    ).toBe('not_in_service_party');
  });
});

describe('participantLessonStatsSemantics — learning duration', () => {
  it('7–9. present → full duration; absent/missing → 0', () => {
    const base = familyPartyInput(
      [attendanceFor(participantA, 'present'), attendanceFor(participantB, 'absent')],
      1.5
    );
    expect(participantLearningDurationHours(participantInput(participantA, base))).toBe(1.5);
    expect(participantLearningDurationHours(participantInput(participantB, base))).toBe(0);
    expect(participantLearningDurationHours(participantInput(participantC, base))).toBe(0);
  });
});

describe('participantLessonStatsSemantics — participant absence', () => {
  it('10–12. absent → yes; missing/present → no', () => {
    const base = familyPartyInput([
      attendanceFor(participantA, 'present'),
      attendanceFor(participantB, 'absent'),
    ]);
    expect(participantWasAbsentFromLesson(participantInput(participantB, base))).toBe(true);
    expect(participantWasAbsentFromLesson(participantInput(participantC, base))).toBe(false);
    expect(participantWasAbsentFromLesson(participantInput(participantA, base))).toBe(false);
  });

  it('13. booking no_show lifecycle does not mark participant absent without Attendance.absent', () => {
    expect(bookingIsNoShowOutcome('no_show')).toBe(true);
    const base = familyPartyInput([]);
    expect(participantWasAbsentFromLesson(participantInput(participantA, base))).toBe(false);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(false);
  });
});

describe('participantLessonStatsSemantics — business / instructor slot', () => {
  it('14–17. occupied slot vs completed service vs no_show', () => {
    expect(bookingOccupiesInstructorSlot('completed')).toBe(true);
    expect(bookingOccupiesInstructorSlot('no_show')).toBe(true);
    expect(bookingOccupiesInstructorSlot('cancelled')).toBe(false);
    expect(bookingIsCompletedService('completed')).toBe(true);
    expect(bookingIsCompletedService('no_show')).toBe(false);
    expect(bookingIsNoShowOutcome('no_show')).toBe(true);
    expect(bookingIsCompletedService('no_show')).toBe(false);
  });
});

describe('participantLessonStatsSemantics — streak foundation', () => {
  it('18–20. present qualifies; absent/missing do not', () => {
    const base = familyPartyInput([
      attendanceFor(participantA, 'present'),
      attendanceFor(participantB, 'absent'),
    ]);
    expect(participantPresentQualifiesStreakWeek(participantInput(participantA, base))).toBe(true);
    expect(participantPresentQualifiesStreakWeek(participantInput(participantB, base))).toBe(false);
    expect(participantPresentQualifiesStreakWeek(participantInput(participantC, base))).toBe(false);
  });

  it('21. legacy booking_completed activity log is not canonical participant evidence', () => {
    expect(
      participantPresentQualifiesStreakWeekFromEvidence({
        kind: 'legacy_booking_completed_activity_log',
      })
    ).toBe(false);
    expect(
      participantPresentQualifiesStreakWeekFromEvidence({
        kind: 'legacy_booking_lifecycle_completed',
      })
    ).toBe(false);
  });
});

describe('participantLessonStatsSemantics — family / multi-participant', () => {
  it('22. mixed attendance isolation', () => {
    const base = familyPartyInput([
      attendanceFor(participantA, 'present'),
      attendanceFor(participantB, 'absent'),
    ]);
    expect(participantAttendedLesson(participantInput(participantA, base))).toBe(true);
    expect(participantWasAbsentFromLesson(participantInput(participantB, base))).toBe(true);
    expect(participantLearningDurationHours(participantInput(participantA, base))).toBe(1.5);
    expect(participantLearningDurationHours(participantInput(participantB, base))).toBe(0);
  });

  it('23. dependent participant works without account/user coupling', () => {
    const dependentId = ParticipantIdSchema.parse('participant_dependent_no_account');
    const servicePartyParticipantIds = [dependentId] as const;
    const attendancesByParticipantId = new Map([
      [dependentId, { attendanceStatus: 'present' as const }],
    ]);
    expect(
      participantAttendedLesson({
        participantId: dependentId,
        servicePartyParticipantIds,
        attendancesByParticipantId,
      })
    ).toBe(true);
    expect(
      BookingSchema.parse({
        ...individualBooking,
        party: { kind: 'individual', participantIds: [dependentId] },
        occurrence: {
          ...individualBooking.occurrence,
          serviceParty: { participantIds: [dependentId], frozenAt: recordedAt },
        },
      }).party.participantIds
    ).toEqual([dependentId]);
  });
});
