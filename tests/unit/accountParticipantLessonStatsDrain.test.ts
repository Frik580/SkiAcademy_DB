import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aggregateParticipantLessonStats,
  evidenceListFromAccountReadModels,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import {
  drainAccountLessonBookingStatsPages,
  resetAccountParticipantLessonStatsSyncStateForTests,
  syncAccountParticipantLessonStatsFromServer,
} from '../../src/features/lesson-bookings/syncAccountParticipantLessonStats';
import { useAccountParticipantLessonStatsStore } from '../../src/features/lesson-bookings/accountParticipantLessonStatsStore';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

const participantId = ParticipantIdSchema.parse('participant_stats_drain_01');
const instructorId = InstructorIdSchema.parse('instructor_stats_drain_01');
const startsAt = timestampFromDate(new Date('2026-01-15T04:00:00.000Z'));

function historyItem(index: number, revision = 1): LessonBookingReadModel {
  const bookingId = `booking_stats_drain_${String(index).padStart(2, '0')}` as LessonBookingReadModel['bookingId'];
  return {
    bookingId,
    revision,
    partyKind: 'individual',
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Student' }],
    instructor: { instructorId, displayName: 'Coach' },
    occurrence: {
      startsAt,
      endsAt: timestampFromDate(new Date('2026-01-15T05:30:00.000Z')),
      timeZone: 'Asia/Almaty',
      durationMinutes: 90,
    },
    lifecycle: { status: 'completed', completedAt: startsAt },
    bookingOrigin: 'account',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    serviceParticipantIds: [participantId],
    managedParticipantAttendance: [{ participantId, attendanceStatus: 'present' }],
    updatedAt: timestampFromDate(new Date(Date.UTC(2026, 0, 15, 0, 0, index))),
  };
}

describe('account participant lesson stats drain', () => {
  beforeEach(() => {
    resetAccountParticipantLessonStatsSyncStateForTests();
    useAccountParticipantLessonStatsStore.getState().reset();
    queryLessonBookingReadModelsMock.mockReset();
  });

  it('26–30. drains every account_history page; first page alone undercounts; no duplicates', async () => {
    const all = Array.from({ length: 30 }, (_, index) => historyItem(index + 1));
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'account_hot' | 'account_history'; cursor?: string }) => {
        if (input.scope === 'account_hot') {
          return { scope: input.scope, items: [], hasMore: false };
        }
        if (!input.cursor) {
          return {
            scope: input.scope,
            items: all.slice(0, 25),
            hasMore: true,
            nextCursor: 'history:2',
          };
        }
        expect(input.cursor).toBe('history:2');
        return { scope: input.scope, items: all.slice(25), hasMore: false };
      }
    );

    const drained = await drainAccountLessonBookingStatsPages();
    const firstPage = all.slice(0, 25);
    const firstPageStats = aggregateParticipantLessonStats(
      evidenceListFromAccountReadModels(firstPage, participantId)
    );
    const drainedStats = aggregateParticipantLessonStats(
      evidenceListFromAccountReadModels(drained, participantId)
    );

    expect(firstPageStats.completedCount).toBe(25);
    expect(drainedStats.completedCount).toBe(30);
    expect(drainedStats.trainingHours).toBe(45);
    expect(new Set(drained.map((item) => item.bookingId)).size).toBe(30);
    expect(
      queryLessonBookingReadModelsMock.mock.calls.filter(
        (call) => call[0].scope === 'account_history'
      )
    ).toHaveLength(2);
  });

  it('31. same booking in hot and history is counted once', async () => {
    const overlapping = historyItem(1, 2);
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'account_hot' | 'account_history' }) => {
        if (input.scope === 'account_hot') {
          return { scope: input.scope, items: [overlapping], hasMore: false };
        }
        return { scope: input.scope, items: [historyItem(1, 1)], hasMore: false };
      }
    );
    const drained = await drainAccountLessonBookingStatsPages();
    const stats = aggregateParticipantLessonStats(
      evidenceListFromAccountReadModels(drained, participantId)
    );
    expect(stats.completedCount).toBe(1);
  });

  it('25. a newer drain generation does not keep stale items from an older account', async () => {
    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'account_hot' | 'account_history' }) => {
        if (input.scope === 'account_hot') {
          return { scope: input.scope, items: [], hasMore: false };
        }
        return { scope: input.scope, items: [historyItem(1)], hasMore: false };
      }
    );
    await syncAccountParticipantLessonStatsFromServer('account_stats_a');
    expect(useAccountParticipantLessonStatsStore.getState().items).toHaveLength(1);

    queryLessonBookingReadModelsMock.mockImplementation(
      async (input: { scope: 'account_hot' | 'account_history' }) => {
        if (input.scope === 'account_hot') {
          return { scope: input.scope, items: [], hasMore: false };
        }
        return { scope: input.scope, items: [historyItem(2), historyItem(3)], hasMore: false };
      }
    );
    await syncAccountParticipantLessonStatsFromServer('account_stats_b');
    expect(useAccountParticipantLessonStatsStore.getState().accountId).toBe('account_stats_b');
    expect(useAccountParticipantLessonStatsStore.getState().items).toHaveLength(2);
    expect(
      useAccountParticipantLessonStatsStore.getState().items.map((item) => item.bookingId)
    ).toEqual(['booking_stats_drain_02', 'booking_stats_drain_03']);
  });
});
