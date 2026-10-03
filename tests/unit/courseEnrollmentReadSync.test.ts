import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import {
  CourseEnrollmentReadModelSchema,
  timestampFromDate,
  type CourseEnrollmentReadModel,
  type QueryCourseEnrollmentReadModelsResult,
} from '@ski-academy/shared-domain';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { mergeCourseEnrollmentRecords } from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import {
  applyScopedHotCourseEnrollmentPage,
  useCourseEnrollmentReadSync,
} from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';
import { useAuthStore } from '../../src/features/auth/authStore';

const queryMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseEnrollmentReadModels: queryMock,
  queryCourseCatalogReadModels: vi.fn(),
}));

const participantId = 'participant_sync_01';

function enrollment(
  index: number,
  revision = 1,
  participant = participantId
): CourseEnrollmentReadModel {
  const startsAt = timestampFromDate(new Date('2099-01-01T04:00:00Z'));
  const endsAt = timestampFromDate(new Date('2099-01-01T06:00:00Z'));
  return CourseEnrollmentReadModelSchema.parse({
    enrollmentId: `enrollment_${String(index).padStart(2, '0')}`,
    revision,
    courseId: 'course_sync_01',
    participant: { participantId: participant, displayName: 'Student' },
    lifecycle: { status: 'confirmed' },
    courseDisplay: { courseId: 'course_sync_01', title: 'Camp' },
    courseSchedule: {
      courseId: 'course_sync_01',
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: startsAt,
      finalCourseDayEndsAt: endsAt,
      courseDays: [
        {
          courseDayId: 'course_day_sync_01',
          dayOrder: 1,
          interval: { startsAt, endsAt },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
      ],
    },
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: false },
    courseProgress: {
      scheduledDays: 1,
      elapsedDays: 0,
      recordedDays: 0,
      presentDays: 0,
      absentDays: 0,
      missingDays: 0,
      progressPercent: 0,
      attendanceCoveragePercent: 0,
      attendanceRatePercent: null,
    },
    updatedAt: startsAt,
  });
}

function page(
  items: CourseEnrollmentReadModel[],
  hasMore = false
): QueryCourseEnrollmentReadModelsResult {
  return { scope: 'account_hot', items, hasMore, ...(hasMore ? { nextCursor: 'next-page' } : {}) };
}

function seed(items: CourseEnrollmentReadModel[]) {
  const generation = useCourseEnrollmentStore.getState().beginScopedLoad(participantId);
  useCourseEnrollmentStore
    .getState()
    .setItems(mergeCourseEnrollmentRecords(new Map(), page(items)));
  return generation;
}

describe('participant-scoped CourseEnrollment hot sync pagination', () => {
  beforeEach(() => {
    useAuthStore.getState().setFirebaseUser(null);
    useCourseEnrollmentStore.getState().reset();
    queryMock.mockReset();
    queryMock.mockImplementation(async (input) => ({
      scope: input.scope,
      items: [],
      hasMore: false,
    }));
  });
  afterEach(cleanup);

  it.each([24, 25, 26, 40, 41])(
    'preserves entries outside a partial first page at %i enrollments',
    async (count) => {
      const items = Array.from({ length: count }, (_, index) => enrollment(index + 1));
      queryMock.mockResolvedValueOnce(page(items.slice(0, 25), count > 25));
      const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
      const generation = seed(items);
      await act(async () => {
        await result.current.reloadHot(participantId, generation);
      });
      expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual(
        items.map((item) => item.enrollmentId)
      );
    }
  );

  it('removes an absent hot item only from a complete first page', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const generation = seed([enrollment(1), enrollment(2), enrollment(3)]);
    queryMock.mockResolvedValueOnce(page([enrollment(1), enrollment(2)]));
    await act(async () => {
      await result.current.reloadHot(participantId, generation);
    });
    expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual([
      'enrollment_01',
      'enrollment_02',
    ]);
  });

  it('keeps cached history and newer revisions on a complete hot snapshot', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const history = { ...enrollment(3), lifecycle: { status: 'completed' as const } };
    const generation = seed([enrollment(1, 4), history]);
    queryMock.mockResolvedValueOnce(page([enrollment(1, 2)]));
    await act(async () => {
      await result.current.reloadHot(participantId, generation);
    });
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_01')?.revision).toBe(4);
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_03')?.lifecycleStatus).toBe(
      'completed'
    );
  });

  it('refreshes derived fields at the same revision on a partial page without changing outside-page entries', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const generation = seed([enrollment(1), enrollment(2)]);
    const outsidePage = useCourseEnrollmentStore.getState().items.get('enrollment_02');
    const updated = enrollment(1);
    updated.participant.displayName = 'Updated student';
    updated.authorizedActions.canWithdraw = false;
    updated.courseProgress.elapsedDays = 1;
    updated.courseProgress.progressPercent = 100;
    queryMock.mockResolvedValueOnce(page([updated], true));
    await act(async () => {
      await result.current.reloadHot(participantId, generation);
    });
    const state = useCourseEnrollmentStore.getState();
    expect(state.items.get('enrollment_01')).toMatchObject({
      revision: 1,
      participantName: 'Updated student',
      authorizedActions: { canWithdraw: false },
      courseProgress: { elapsedDays: 1, progressPercent: 100 },
    });
    expect(state.items.get('enrollment_02')).toBe(outsidePage);
  });

  it('does not clear cached entries on an empty partial first page', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const generation = seed([enrollment(1)]);
    queryMock.mockResolvedValueOnce(page([], true));
    await act(async () => {
      await result.current.reloadHot(participantId, generation);
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(1);
  });

  it.each([false, true])(
    'merges a continuation page with hasMore=%s even when terminal',
    (hasMore) => {
      const items = Array.from({ length: 40 }, (_, index) => enrollment(index + 1));
      const generation = seed(items.slice(0, 25));
      expect(
        applyScopedHotCourseEnrollmentPage({
          participantId,
          generation,
          cursor: 'input-cursor',
          result: page(items.slice(25), hasMore),
        })
      ).toBe(true);
      expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual(
        items.map((item) => item.enrollmentId)
      );
    }
  );

  it('does not clear the store on an empty terminal continuation page', () => {
    const generation = seed([enrollment(1)]);
    applyScopedHotCourseEnrollmentPage({
      participantId,
      generation,
      cursor: 'input-cursor',
      result: page([]),
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(1);
  });

  it('preserves both pages and newer revisions when continuation is applied before the partial first page', () => {
    const generation = seed([]);
    const items = Array.from({ length: 40 }, (_, index) => enrollment(index + 1));
    applyScopedHotCourseEnrollmentPage({
      participantId,
      generation,
      cursor: 'input-cursor',
      result: page([...items.slice(25), enrollment(1, 5)]),
    });
    applyScopedHotCourseEnrollmentPage({
      participantId,
      generation,
      result: page(items.slice(0, 25), true),
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(40);
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_01')?.revision).toBe(5);
  });

  it('cleans up only hot items on an empty complete snapshot, retaining elapsed and terminal history', () => {
    const elapsed = enrollment(2);
    elapsed.courseSchedule.finalCourseDayEndsAt = timestampFromDate(
      new Date('2020-01-01T00:00:00Z')
    );
    const generation = seed([
      enrollment(1),
      elapsed,
      { ...enrollment(3), lifecycle: { status: 'completed' } },
    ]);
    applyScopedHotCourseEnrollmentPage({ participantId, generation, result: page([]) });
    expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual([
      'enrollment_02',
      'enrollment_03',
    ]);
  });

  it('filters sibling Participant entries out of partial pages', () => {
    const generation = seed([enrollment(1)]);
    applyScopedHotCourseEnrollmentPage({
      participantId,
      generation,
      result: page([enrollment(2, 1, 'participant_sibling')], true),
    });
    expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual(['enrollment_01']);
  });

  it.each([24, 25, 26, 40, 41, 100])(
    'loads all %i hot enrollments on fresh login',
    async (count) => {
      const items = Array.from({ length: count }, (_, index) => enrollment(index + 1));
      for (let offset = 0; offset < count; offset += 25) {
        queryMock.mockResolvedValueOnce({
          ...page(items.slice(offset, offset + 25), offset + 25 < count),
          ...(offset + 25 < count ? { nextCursor: `cursor-${offset + 25}` } : {}),
        });
      }
      renderHook(() => useCourseEnrollmentReadSync(true, 'account_sync_01', participantId));
      const hotRequests = Math.ceil(count / 25);
      await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(hotRequests + 1));
      expect([...useCourseEnrollmentStore.getState().items.keys()]).toEqual(
        items.map((item) => item.enrollmentId)
      );
      expect(useCourseEnrollmentStore.getState().loaded).toBe(true);
      expect(queryMock.mock.calls.map(([input]) => input.scope)).toEqual([
        ...Array.from({ length: hotRequests }, () => 'account_hot'),
        'account_history',
      ]);
      for (let index = 0; index < hotRequests; index += 1) {
        expect(queryMock.mock.calls[index][0]).toEqual({
          scope: 'account_hot',
          selectedParticipantId: participantId,
          ...(index ? { cursor: `cursor-${index * 25}` } : {}),
        });
      }
    }
  );

  it.each([
    [0, 8],
    [15, 20],
  ])(
    'continues after a filtered first page with %i hot items',
    async (firstCount, remainingCount) => {
      const items = Array.from({ length: firstCount + remainingCount }, (_, index) =>
        enrollment(index + 1)
      );
      queryMock.mockResolvedValueOnce(page(items.slice(0, firstCount), true));
      queryMock.mockResolvedValueOnce(page(items.slice(firstCount)));
      renderHook(() => useCourseEnrollmentReadSync(true, 'account_sync_01', participantId));
      await waitFor(() => expect(useCourseEnrollmentStore.getState().loaded).toBe(true));
      expect(useCourseEnrollmentStore.getState().items.size).toBe(firstCount + remainingCount);
      expect(queryMock.mock.calls.map(([input]) => input.scope)).toEqual([
        'account_hot',
        'account_hot',
        'account_history',
      ]);
    }
  );

  it('merges three pages, deduplicates IDs and preserves newer and equal-revision derived data and history', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const history = { ...enrollment(9), lifecycle: { status: 'completed' as const } };
    const generation = seed([history]);
    queryMock.mockResolvedValueOnce(page([enrollment(1), enrollment(2)], true));
    queryMock.mockImplementationOnce(async () => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(mergeCourseEnrollmentRecords(new Map(), page([enrollment(1, 5)])));
      return { ...page([enrollment(1, 2), enrollment(3)], true), nextCursor: 'third-page' };
    });
    const updated = enrollment(2);
    updated.participant.displayName = 'Updated on continuation';
    queryMock.mockResolvedValueOnce(page([updated, enrollment(4)]));
    await act(async () => {
      await result.current.reloadHot(participantId, generation, true);
    });
    const state = useCourseEnrollmentStore.getState();
    expect(state.items.size).toBe(5);
    expect(state.items.get('enrollment_01')?.revision).toBe(5);
    expect(state.items.get('enrollment_02')?.participantName).toBe('Updated on continuation');
    expect(state.items.get('enrollment_09')?.lifecycleStatus).toBe('completed');
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it.each(['missing', 'repeated', 'cycle'])(
    'fails controllably for a %s continuation cursor',
    async (kind) => {
      queryMock.mockResolvedValueOnce(
        kind === 'missing' ? { scope: 'account_hot', items: [], hasMore: true } : page([], true)
      );
      if (kind === 'repeated') queryMock.mockResolvedValueOnce(page([], true));
      if (kind === 'cycle') {
        queryMock.mockResolvedValueOnce({ ...page([], true), nextCursor: 'other-cursor' });
        queryMock.mockResolvedValueOnce(page([], true));
      }
      renderHook(() => useCourseEnrollmentReadSync(true, 'account_sync_01', participantId));
      await waitFor(() =>
        expect(useCourseEnrollmentStore.getState().error).toMatch(/pagination cursor/)
      );
      expect(useCourseEnrollmentStore.getState().loaded).toBe(false);
      expect(useCourseEnrollmentStore.getState().hotLoading).toBe(false);
      expect(queryMock).toHaveBeenCalledTimes(kind === 'missing' ? 1 : kind === 'cycle' ? 3 : 2);
    }
  );

  it('completes an empty initial dataset and loads only the first history page', async () => {
    queryMock.mockResolvedValueOnce(page([]));
    queryMock.mockResolvedValueOnce({
      scope: 'account_history',
      items: [{ ...enrollment(9), lifecycle: { status: 'completed' } }],
      hasMore: true,
      nextCursor: 'history-next',
    });
    renderHook(() => useCourseEnrollmentReadSync(true, 'account_sync_01', participantId));
    await waitFor(() => expect(useCourseEnrollmentStore.getState().items.size).toBe(1));
    expect(useCourseEnrollmentStore.getState().loaded).toBe(true);
    expect(useCourseEnrollmentStore.getState().historyCursor).toBe('history-next');
    expect(useCourseEnrollmentStore.getState().historyHasMore).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it.each(['participant', 'account', 'logout', 'reset'])(
    'discards a late continuation after %s change',
    async (change) => {
      let finish!: (value: QueryCourseEnrollmentReadModelsResult) => void;
      queryMock.mockResolvedValueOnce(page([enrollment(1)], true));
      queryMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const { rerender } = renderHook(
        ({ account, participant }) =>
          useCourseEnrollmentReadSync(Boolean(account), account, participant),
        {
          initialProps: {
            account: 'account_sync_01' as string | undefined,
            participant: participantId,
          },
        }
      );
      await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
      expect(useCourseEnrollmentStore.getState().loaded).toBe(false);
      if (change === 'reset') act(() => useCourseEnrollmentStore.getState().reset());
      else
        rerender({
          account:
            change === 'logout'
              ? undefined
              : change === 'account'
                ? 'account_sync_02'
                : 'account_sync_01',
          participant: change === 'participant' ? 'participant_sync_02' : participantId,
        });
      if (change === 'participant' || change === 'account') {
        await waitFor(() => expect(useCourseEnrollmentStore.getState().loaded).toBe(true));
      }
      const before = useCourseEnrollmentStore.getState();
      const requests = queryMock.mock.calls.length;
      await act(async () => {
        finish(page([enrollment(2)], true));
      });
      expect(useCourseEnrollmentStore.getState()).toBe(before);
      expect(queryMock).toHaveBeenCalledTimes(requests);
      expect(useCourseEnrollmentStore.getState().items.has('enrollment_02')).toBe(false);
    }
  );

  it('keeps outside-page entries and newer revisions when concurrent partial refreshes finish out of order', async () => {
    const { result } = renderHook(() => useCourseEnrollmentReadSync(false, undefined));
    const generation = seed(Array.from({ length: 40 }, (_, index) => enrollment(index + 1)));
    let finishOlder!: (value: QueryCourseEnrollmentReadModelsResult) => void;
    queryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOlder = resolve;
        })
    );
    let older!: Promise<boolean>;
    act(() => {
      older = result.current.reloadHot(participantId, generation);
    });
    queryMock.mockResolvedValueOnce(page([enrollment(1, 5)], true));
    await act(async () => {
      await result.current.reloadHot(participantId, generation);
    });
    await act(async () => {
      finishOlder(page([enrollment(1, 2)], true));
      await older;
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(40);
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_01')?.revision).toBe(5);
  });

  it('discards a late response after Participant switch', async () => {
    let finish!: (value: QueryCourseEnrollmentReadModelsResult) => void;
    queryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = renderHook(
      ({ participant }) => useCourseEnrollmentReadSync(true, 'account_sync_01', participant),
      { initialProps: { participant: participantId } }
    );
    rerender({ participant: 'participant_sync_02' });
    await waitFor(() => expect(useCourseEnrollmentStore.getState().loaded).toBe(true));
    await act(async () => {
      finish(page([enrollment(1)], true));
    });
    expect(useCourseEnrollmentStore.getState().scopedParticipantId).toBe('participant_sync_02');
    expect(useCourseEnrollmentStore.getState().items.size).toBe(0);
  });

  it('invalidates in-flight hot responses on logout', async () => {
    let finish!: (value: QueryCourseEnrollmentReadModelsResult) => void;
    queryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = renderHook(
      ({ accountId }) => useCourseEnrollmentReadSync(Boolean(accountId), accountId, participantId),
      { initialProps: { accountId: 'account_sync_01' as string | undefined } }
    );
    rerender({ accountId: undefined });
    await act(async () => {
      finish(page([enrollment(1)], true));
    });
    expect(useCourseEnrollmentStore.getState().scopedParticipantId).toBeUndefined();
    expect(useCourseEnrollmentStore.getState().items.size).toBe(0);
    expect(useCourseEnrollmentStore.getState().loaded).toBe(false);
  });

  it('clears the old account and rejects its pending response on direct account switch', async () => {
    useAuthStore.getState().setFirebaseUser({ uid: 'account_sync_01' } as User);
    let finish!: (value: QueryCourseEnrollmentReadModelsResult) => void;
    queryMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = renderHook(
      ({ accountId }) => useCourseEnrollmentReadSync(true, accountId, participantId),
      { initialProps: { accountId: 'account_sync_01' } }
    );
    act(() => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(mergeCourseEnrollmentRecords(new Map(), page([enrollment(1)])));
      useAuthStore.getState().setFirebaseUser({ uid: 'account_sync_02' } as User);
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(0);
    rerender({ accountId: 'account_sync_02' });
    await waitFor(() => expect(queryMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      finish(page([enrollment(1)], true));
    });
    expect(useCourseEnrollmentStore.getState().items.size).toBe(0);
  });
});
