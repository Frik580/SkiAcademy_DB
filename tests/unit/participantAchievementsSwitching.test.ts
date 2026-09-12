import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
  type ParticipantAchievementsReadModel,
} from '@ski-academy/shared-domain';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';
import { emptyParticipantProgressView } from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import { useParticipantAchievementsStore } from '../../src/features/participant-achievements/participantAchievementsStore';
import { usePresentedParticipantAchievements } from '../../src/features/participant-achievements/usePresentedParticipantAchievements';
import { DEFAULT_ACHIEVEMENTS_CONFIG, DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const selfId = ParticipantIdSchema.parse('participant_ach_switch_self');
const childA = ParticipantIdSchema.parse('participant_ach_switch_a');
const childB = ParticipantIdSchema.parse('participant_ach_switch_b');
const instructorId = InstructorIdSchema.parse('instructor_ach_switch_01');
const startsAt = timestampFromDate(new Date('2026-04-01T04:00:00.000Z'));
const earnedAt = timestampFromDate(new Date('2026-04-01T05:00:00.000Z'));

const family: ManagedParticipantOption[] = [
  {
    participantId: selfId,
    participantManagementId: 'participant_management_ach_switch_self',
    displayName: 'Self',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 30 },
    authority: 'self',
    revision: 1,
  },
  {
    participantId: childA,
    participantManagementId: 'participant_management_ach_switch_a',
    displayName: 'Child A',
    discipline: 'ski',
    skillLevel: 'beginner',
    age: { kind: 'age_years', years: 8 },
    authority: 'parent_guardian',
    revision: 1,
  },
  {
    participantId: childB,
    participantManagementId: 'participant_management_ach_switch_b',
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

function persisted(
  participantId: typeof selfId | typeof childA | typeof childB,
  achievementId: string
): ParticipantAchievementsReadModel {
  return {
    participantId,
    earned: {
      [achievementId]: { earnedAt, source: 'participant_attendance' },
    },
    revision: 1,
    updatedAt: earnedAt,
  };
}

describe('selectedParticipantId achievement switching', () => {
  it('switches participant-level badges immediately and does not show A under B', () => {
    useAccountParticipantLessonStatsStore.getState().reset();
    useParticipantProgressStore.getState().clear();
    useParticipantAchievementsStore.getState().clear();

    useAccountParticipantLessonStatsStore.getState().setLoading({
      accountId: 'account_ach_switch_01',
      generation: 1,
    });
    useAccountParticipantLessonStatsStore.getState().replaceItems({
      accountId: 'account_ach_switch_01',
      generation: 1,
      items: [
        lesson('booking_ach_switch_01', [
          { participantId: selfId, attendanceStatus: 'present' },
          { participantId: childA, attendanceStatus: 'absent' },
          { participantId: childB },
        ]),
      ],
    });
    useParticipantProgressStore.getState().setItems([
      { ...emptyParticipantProgressView(selfId), level: 2 },
      emptyParticipantProgressView(childA),
      emptyParticipantProgressView(childB),
    ]);
    useParticipantAchievementsStore.getState().setItems([
      persisted(selfId, 'first_lesson'),
      persisted(childA, 'ten_lessons'),
    ]);

    const { result, rerender } = renderHook(
      ({ participantId }: { participantId: string }) =>
        usePresentedParticipantAchievements({
          selectedParticipantId: participantId,
          language: 'en',
          accountReviews: [{ createdAtIso: '2026-03-01T12:00:00.000Z' }],
          achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,
          skillConfig: DEFAULT_SKILL_CONFIG,
        }),
      { initialProps: { participantId: selfId } }
    );

    const selfIds = result.current.achievements.map((item) => item.id);
    expect(selfIds).toContain('first_lesson');
    expect(selfIds).toContain('level_up');
    expect(selfIds).toContain('feedback_given');
    expect(selfIds).not.toContain('ten_lessons');

    rerender({ participantId: childA });
    const childAIds = result.current.achievements.map((item) => item.id);
    expect(childAIds).toContain('ten_lessons');
    expect(childAIds).not.toContain('first_lesson');
    expect(childAIds).not.toContain('level_up');
    expect(childAIds).toContain('feedback_given');

    rerender({ participantId: childB });
    const childBIds = result.current.achievements.map((item) => item.id);
    expect(childBIds).not.toContain('first_lesson');
    expect(childBIds).not.toContain('ten_lessons');
    expect(childBIds).toContain('feedback_given');
  });

  it('keeps selectedParticipantId across a stats refresh', () => {
    const { result } = renderHook(() =>
      useCabinetProgressParticipantSelection({
        accountId: 'account_ach_switch_01',
        participants: family,
        loading: false,
      })
    );
    act(() => {
      result.current.selectParticipant(childB);
    });
    expect(result.current.selectedParticipantId).toBe(childB);
    useAccountParticipantLessonStatsStore.getState().setLoading({
      accountId: 'account_ach_switch_01',
      generation: 3,
    });
    useAccountParticipantLessonStatsStore.getState().replaceItems({
      accountId: 'account_ach_switch_01',
      generation: 3,
      items: [],
    });
    expect(result.current.selectedParticipantId).toBe(childB);
  });
});
