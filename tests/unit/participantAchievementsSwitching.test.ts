import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';

const school = vi.hoisted(() => ({
  timeZone: 'Asia/Almaty',
  ready: true,
  error: undefined as Error | undefined,
}));
vi.mock('../../src/features/settings/schoolTimeZone', () => ({ useSchoolTimeZone: () => school }));

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
  beforeEach(() => {
    useCabinetProgressParticipantSelectionStore.getState().reset();
    Object.assign(school, { timeZone: 'Asia/Almaty', ready: true, error: undefined });
  });

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
    useParticipantProgressStore
      .getState()
      .setItems([
        { ...emptyParticipantProgressView(selfId), level: 2 },
        emptyParticipantProgressView(childA),
        emptyParticipantProgressView(childB),
      ]);
    useParticipantAchievementsStore
      .getState()
      .setItems([persisted(selfId, 'first_lesson'), persisted(childA, 'ten_lessons')]);

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

describe('school timezone achievement presentation', () => {
  it('re-evaluates confirmation, timezone changes, error/recovery and A-B-A without changing persisted evidence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T03:30:00Z'));
    try {
      useAccountParticipantLessonStatsStore.getState().reset();
      useParticipantProgressStore.getState().clear();
      useParticipantAchievementsStore.getState().clear();
      useAccountParticipantLessonStatsStore
        .getState()
        .setLoading({ accountId: 'account_zone', generation: 1 });
      useAccountParticipantLessonStatsStore.getState().replaceItems({
        accountId: 'account_zone',
        generation: 1,
        items: ['09', '16', '23'].map((day, index) => {
          const row = lesson(`booking_zone_${index}`, [
            { participantId: selfId, attendanceStatus: 'present' },
          ]);
          return {
            ...row,
            occurrence: {
              ...row.occurrence,
              startsAt: timestampFromDate(new Date(`2026-11-${day}T03:00:00Z`)),
              endsAt: timestampFromDate(new Date(`2026-11-${day}T03:20:00Z`)),
            },
          };
        }),
      });
      useParticipantProgressStore
        .getState()
        .setItems([emptyParticipantProgressView(selfId), emptyParticipantProgressView(childA)]);
      school.ready = false;
      const hook = renderHook(
        ({ participantId }) =>
          usePresentedParticipantAchievements({
            selectedParticipantId: participantId,
            language: 'en',
            accountReviews: [],
            achievementsConfig: DEFAULT_ACHIEVEMENTS_CONFIG,
            skillConfig: DEFAULT_SKILL_CONFIG,
          }),
        { initialProps: { participantId: selfId } }
      );
      const streak = () =>
        hook.result.current.achievements.find((item) => item.id === 'streak_3_weeks');
      expect(streak()).toBeUndefined();
      expect(hook.result.current.evaluation?.timeZone).toBeUndefined();
      school.ready = true;
      hook.rerender({ participantId: selfId });
      expect(streak()?.earnedAt).toBe('2026-11-23T03:00:00.000Z');
      school.timeZone = 'America/New_York';
      hook.rerender({ participantId: selfId });
      expect(streak()).toBeUndefined();
      school.timeZone = 'Asia/Almaty';
      hook.rerender({ participantId: childA });
      expect(streak()).toBeUndefined();
      hook.rerender({ participantId: selfId });
      expect(streak()).toBeDefined();
      const saved = timestampFromDate(new Date('2026-11-23T03:20:00Z'));
      act(() =>
        useParticipantAchievementsStore.getState().setItems([
          {
            participantId: selfId,
            revision: 1,
            earned: { streak_3_weeks: { earnedAt: saved, source: 'participant_attendance' } },
          },
        ])
      );
      expect(streak()?.earnedAt).toBe('2026-11-23T03:20:00.000Z');
      Object.assign(school, { ready: false, error: new Error('offline') });
      hook.rerender({ participantId: selfId });
      expect(hook.result.current.evaluation?.timeZone).toBeUndefined();
      expect(streak()?.earnedAt).toBe('2026-11-23T03:20:00.000Z');
      Object.assign(school, { ready: true, timeZone: 'America/New_York', error: undefined });
      hook.rerender({ participantId: selfId });
      expect(
        hook.result.current.achievements.filter((item) => item.id === 'streak_3_weeks')
      ).toHaveLength(1);
      expect(streak()?.earnedAt).toBe('2026-11-23T03:20:00.000Z');
      expect(
        useParticipantAchievementsStore.getState().byId[selfId].earned.streak_3_weeks.earnedAt
      ).toEqual(saved);
      hook.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
