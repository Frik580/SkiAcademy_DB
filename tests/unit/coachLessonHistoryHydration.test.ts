import { beforeEach, describe, expect, it } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { hydrateCoachLessonHistory } from '../../src/features/student-cabinet/useCoachLessonHistoryHydration';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';

const lesson = (id: string, revision: number): LessonBookingReadModel =>
  ({
    bookingId: id,
    revision,
    lifecycle: { status: 'completed' },
    occurrence: {
      startsAt: { seconds: 1_780_000_000, nanoseconds: 0 },
      endsAt: { seconds: 1_780_003_600, nanoseconds: 0 },
      durationMinutes: 60,
      timeZone: 'Asia/Almaty',
    },
    instructor: { instructorId: 'instructor-a', displayName: 'Coach A' },
    participantIds: ['participant-a'],
    participants: [{ participantId: 'participant-a', displayName: 'Student A' }],
    partyKind: 'individual',
    bookingOrigin: 'account',
    authorizedActions: {},
  }) as unknown as LessonBookingReadModel;

describe('coach historical lesson hydration', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
  });

  it('restores completed-only coach bookings after a fresh page load', () => {
    expect(useLessonBookingStore.getState().itemsList).toHaveLength(0);
    expect(
      hydrateCoachLessonHistory({
        accountId: 'account-a',
        statsAccountId: 'account-a',
        loaded: true,
        items: [lesson('lesson-old', 1)],
      })
    ).toBe(true);
    expect(useLessonBookingStore.getState().itemsList.map((x) => x.bookingId)).toEqual([
      'lesson-old',
    ]);
    expect(useLessonBookingStore.getState().itemsList[0].instructorId).toBe('instructor-a');
  });

  it('ignores stale history for another account and partial loading', () => {
    const current = lesson('lesson-current', 3);
    hydrateCoachLessonHistory({
      accountId: 'account-a',
      statsAccountId: 'account-a',
      loaded: true,
      items: [current],
    });
    expect(
      hydrateCoachLessonHistory({
        accountId: 'account-b',
        statsAccountId: 'account-a',
        loaded: true,
        items: [lesson('lesson-foreign', 2)],
      })
    ).toBe(false);
    expect(
      hydrateCoachLessonHistory({
        accountId: 'account-a',
        statsAccountId: 'account-a',
        loaded: false,
        items: [lesson('lesson-unloaded', 2)],
      })
    ).toBe(false);
    expect(useLessonBookingStore.getState().itemsList.map((x) => x.bookingId)).toEqual([
      'lesson-current',
    ]);
  });

  it('does not overwrite a newer hot booking revision with old history', () => {
    hydrateCoachLessonHistory({
      accountId: 'account-a',
      statsAccountId: 'account-a',
      loaded: true,
      items: [lesson('lesson-shared', 5)],
    });
    hydrateCoachLessonHistory({
      accountId: 'account-a',
      statsAccountId: 'account-a',
      loaded: true,
      items: [lesson('lesson-shared', 2)],
    });
    expect(useLessonBookingStore.getState().items.get('lesson-shared')?.revision).toBe(5);
  });
});
