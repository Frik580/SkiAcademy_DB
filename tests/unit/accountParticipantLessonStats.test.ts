import { describe, expect, it } from 'vitest';
import {
  aggregateParticipantLessonStats,
  evidenceListFromAccountReadModels,
  InstructorIdSchema,
  participantLessonStatsEvidenceFromAccountReadModel,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';

const participantA = ParticipantIdSchema.parse('participant_stats_a');
const participantB = ParticipantIdSchema.parse('participant_stats_b');
const participantC = ParticipantIdSchema.parse('participant_stats_c');
const dependentId = ParticipantIdSchema.parse('participant_stats_dependent');
const instructorId = InstructorIdSchema.parse('instructor_stats_01');
const currentYearStart = timestampFromDate(new Date('2026-03-15T04:00:00.000Z'));
const otherYearStart = timestampFromDate(new Date('2025-03-15T04:00:00.000Z'));

function accountReadModel(input: {
  readonly bookingId: string;
  readonly participantIds: readonly ReturnType<typeof ParticipantIdSchema.parse>[];
  readonly managed: LessonBookingReadModel['managedParticipantAttendance'];
  readonly startsAt?: ReturnType<typeof timestampFromDate>;
  readonly durationMinutes?: number;
  readonly lifecycleStatus?: LessonBookingReadModel['lifecycle']['status'];
  readonly revision?: number;
}): LessonBookingReadModel {
  const startsAt = input.startsAt ?? currentYearStart;
  const endsAt = timestampFromDate(new Date((startsAt.seconds + 90 * 60) * 1000));
  return {
    bookingId: input.bookingId as LessonBookingReadModel['bookingId'],
    revision: input.revision ?? 1,
    partyKind: input.participantIds.length > 1 ? 'family_group' : 'individual',
    participantIds: [...input.participantIds],
    participants: input.participantIds.map((participantId, index) => ({
      participantId,
      displayName: `P${index}`,
    })),
    instructor: { instructorId, displayName: 'Coach' },
    occurrence: {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: input.durationMinutes ?? 90,
    },
    lifecycle:
      input.lifecycleStatus === 'no_show'
        ? { status: 'no_show', noShowAt: endsAt }
        : { status: input.lifecycleStatus ?? 'completed', completedAt: endsAt },
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    serviceParticipantIds: [...input.participantIds],
    managedParticipantAttendance: input.managed,
    updatedAt: startsAt,
  };
}

const groupBooking = (managed: LessonBookingReadModel['managedParticipantAttendance']) =>
  accountReadModel({
    bookingId: 'booking_stats_group_01',
    participantIds: [participantA, participantB, participantC],
    managed,
  });

describe('account participant lesson stats evidence', () => {
  it('9–12. completed: A present +1; A absent/missing 0; A present does not credit B', () => {
    const mixed = groupBooking([
      { participantId: participantA, attendanceStatus: 'present' },
      { participantId: participantB, attendanceStatus: 'absent' },
      { participantId: participantC },
    ]);
    const a = aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantA));
    const b = aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantB));
    const c = aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantC));
    expect(a.completedCount).toBe(1);
    expect(b.completedCount).toBe(0);
    expect(c.completedCount).toBe(0);
  });

  it('13–15. hours: present → duration; absent/missing → 0', () => {
    const mixed = groupBooking([
      { participantId: participantA, attendanceStatus: 'present' },
      { participantId: participantB, attendanceStatus: 'absent' },
      { participantId: participantC },
    ]);
    expect(
      aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantA))
        .trainingHours
    ).toBe(1.5);
    expect(
      aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantB))
        .trainingHours
    ).toBe(0);
    expect(
      aggregateParticipantLessonStats(evidenceListFromAccountReadModels([mixed], participantC))
        .trainingHours
    ).toBe(0);
  });

  it('16–18. absence: absent +1; missing 0; booking no_show without absent does not manufacture', () => {
    const absent = groupBooking([
      { participantId: participantA, attendanceStatus: 'absent' },
    ]);
    const missing = groupBooking([{ participantId: participantA }]);
    const bookingNoShow = accountReadModel({
      bookingId: 'booking_stats_noshow_01',
      participantIds: [participantA],
      managed: [{ participantId: participantA }],
      lifecycleStatus: 'no_show',
    });
    expect(
      aggregateParticipantLessonStats(evidenceListFromAccountReadModels([absent], participantA))
        .absenceCount
    ).toBe(1);
    expect(
      aggregateParticipantLessonStats(evidenceListFromAccountReadModels([missing], participantA))
        .absenceCount
    ).toBe(0);
    expect(
      aggregateParticipantLessonStats(
        evidenceListFromAccountReadModels([bookingNoShow], participantA)
      ).absenceCount
    ).toBe(0);
  });

  it('19–21. season year: current present included; other-year and current-year absent excluded', () => {
    const currentPresent = accountReadModel({
      bookingId: 'booking_stats_year_current',
      participantIds: [participantA],
      managed: [{ participantId: participantA, attendanceStatus: 'present' }],
      startsAt: currentYearStart,
    });
    const otherYearPresent = accountReadModel({
      bookingId: 'booking_stats_year_other',
      participantIds: [participantA],
      managed: [{ participantId: participantA, attendanceStatus: 'present' }],
      startsAt: otherYearStart,
    });
    const currentAbsent = accountReadModel({
      bookingId: 'booking_stats_year_absent',
      participantIds: [participantA],
      managed: [{ participantId: participantA, attendanceStatus: 'absent' }],
      startsAt: currentYearStart,
    });
    const season = aggregateParticipantLessonStats(
      evidenceListFromAccountReadModels(
        [currentPresent, otherYearPresent, currentAbsent],
        participantA
      ),
      { calendarYear: 2026 }
    );
    expect(season.completedCount).toBe(1);
    expect(season.trainingHours).toBe(1.5);
    expect(season.absenceCount).toBe(1);
  });

  it('22–24. self → child A → child B isolation; dependent without /users', () => {
    const familyLesson = groupBooking([
      { participantId: participantA, attendanceStatus: 'present' },
      { participantId: participantB, attendanceStatus: 'absent' },
    ]);
    const dependentLesson = accountReadModel({
      bookingId: 'booking_stats_dependent_01',
      participantIds: [dependentId],
      managed: [{ participantId: dependentId, attendanceStatus: 'present' }],
    });
    expect(
      aggregateParticipantLessonStats(
        evidenceListFromAccountReadModels([familyLesson], participantA)
      ).completedCount
    ).toBe(1);
    expect(
      aggregateParticipantLessonStats(
        evidenceListFromAccountReadModels([familyLesson], participantB)
      ).completedCount
    ).toBe(0);
    expect(
      aggregateParticipantLessonStats(
        evidenceListFromAccountReadModels([dependentLesson], dependentId)
      ).completedCount
    ).toBe(1);
  });

  it('1–8. privacy: exact managed participantId only; no userId or participants[0] fallback', () => {
    const mixed = groupBooking([
      { participantId: participantA, attendanceStatus: 'present' },
    ]);
    expect(mixed.managedParticipantAttendance?.map((row) => row.participantId)).toEqual([
      participantA,
    ]);
    expect(
      participantLessonStatsEvidenceFromAccountReadModel(mixed, participantB)
    ).toBeUndefined();
    expect(
      participantLessonStatsEvidenceFromAccountReadModel(mixed, participantC)
    ).toBeUndefined();
    expect(mixed).not.toHaveProperty('userId');
    expect(mixed.participants[0]?.participantId).toBe(participantA);
    expect(
      participantLessonStatsEvidenceFromAccountReadModel(mixed, participantA)?.participantId
    ).toBe(participantA);
  });
});
