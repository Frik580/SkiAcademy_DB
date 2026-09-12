import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';
import { useSelectedParticipantLessonStats } from '../../src/features/student-cabinet/useSelectedParticipantLessonStats';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const selfId = ParticipantIdSchema.parse('participant_switch_self');
const childA = ParticipantIdSchema.parse('participant_switch_child_a');
const childB = ParticipantIdSchema.parse('participant_switch_child_b');
const instructorId = InstructorIdSchema.parse('instructor_switch_01');
const startsAt = timestampFromDate(new Date('2026-04-01T04:00:00.000Z'));

const family: ManagedParticipantOption[] = [
  {
    participantId: selfId,
    participantManagementId: 'participant_management_switch_self',
    displayName: 'Self',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 30 },
    authority: 'self',
    revision: 1,
  },
  {
    participantId: childA,
    participantManagementId: 'participant_management_switch_a',
    displayName: 'Child A',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 8 },
    authority: 'parent_guardian',
    revision: 1,
  },
  {
    participantId: childB,
    participantManagementId: 'participant_management_switch_b',
    displayName: 'Child B',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 10 },
    authority: 'parent_guardian',
    revision: 1,
  },
];

function lesson(
  bookingId: string,
  managed: LessonBookingReadModel['managedParticipantAttendance']
): LessonBookingReadModel {
  return {
    bookingId: bookingId as LessonBookingReadModel['bookingId'],
    revision: 1,
    partyKind: 'family_group',
    participantIds: [selfId, childA, childB],
    participants: [
      { participantId: selfId, displayName: 'Self' },
      { participantId: childA, displayName: 'Child A' },
      { participantId: childB, displayName: 'Child B' },
    ],
    instructor: { instructorId, displayName: 'Coach' },
    occurrence: {
      startsAt,
      endsAt: timestampFromDate(new Date('2026-04-01T05:00:00.000Z')),
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: 'completed', completedAt: startsAt },
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    serviceParticipantIds: [selfId, childA, childB],
    managedParticipantAttendance: managed,
    updatedAt: startsAt,
  };
}

describe('selectedParticipantId lesson stats switching', () => {
  it('22–25. self → child A → child B changes stats without stale counts', () => {
    useAccountParticipantLessonStatsStore.getState().reset();
    useAccountParticipantLessonStatsStore.getState().setLoading({
      accountId: 'account_switch_01',
      generation: 1,
    });
    useAccountParticipantLessonStatsStore.getState().replaceItems({
      accountId: 'account_switch_01',
      generation: 1,
      items: [
        lesson('booking_switch_01', [
          { participantId: selfId, attendanceStatus: 'present' },
          { participantId: childA, attendanceStatus: 'absent' },
          { participantId: childB },
        ]),
        lesson('booking_switch_02', [
          { participantId: selfId, attendanceStatus: 'present' },
          { participantId: childA, attendanceStatus: 'present' },
          { participantId: childB, attendanceStatus: 'absent' },
        ]),
      ],
    });

    const { result, rerender } = renderHook(
      ({ participantId }: { participantId: string }) =>
        useSelectedParticipantLessonStats(participantId),
      { initialProps: { participantId: selfId } }
    );

    expect(result.current.lifetime.completedCount).toBe(2);
    expect(result.current.lifetime.absenceCount).toBe(0);

    rerender({ participantId: childA });
    expect(result.current.lifetime.completedCount).toBe(1);
    expect(result.current.lifetime.absenceCount).toBe(1);
    expect(result.current.lifetime.trainingHours).toBe(1);

    rerender({ participantId: childB });
    expect(result.current.lifetime.completedCount).toBe(0);
    expect(result.current.lifetime.absenceCount).toBe(1);
    expect(result.current.lifetime.trainingHours).toBe(0);
  });

  it('keeps selectedParticipantId across a stats store refresh', () => {
    const { result } = renderHook(() =>
      useCabinetProgressParticipantSelection({
        accountId: 'account_switch_01',
        participants: family,
        loading: false,
      })
    );
    act(() => {
      result.current.selectParticipant(childB);
    });
    expect(result.current.selectedParticipantId).toBe(childB);

    useAccountParticipantLessonStatsStore.getState().setLoading({
      accountId: 'account_switch_01',
      generation: 2,
    });
    useAccountParticipantLessonStatsStore.getState().replaceItems({
      accountId: 'account_switch_01',
      generation: 2,
      items: [],
    });
    expect(result.current.selectedParticipantId).toBe(childB);
  });
});
