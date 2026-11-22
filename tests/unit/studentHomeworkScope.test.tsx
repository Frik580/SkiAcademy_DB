import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useLessonHomeworkHistory } from '../../src/features/instructor-workspace/useLessonHomeworkHistory';
import { getStudentHomeworkSources } from '../../src/features/student-cabinet/components/student/studentHomeworkSources';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';
import {
  confirmLegacyHomeworkSources,
  getLegacyHomeworkCandidates,
  useStudentHomeworkSources,
} from '../../src/features/student-cabinet/components/student/useStudentHomeworkSources';

const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), getDoc: vi.fn(), callFunction: vi.fn() }));
vi.mock('../../src/lib/functions/functionsClient', () => ({ callFunction: mocks.callFunction }));
vi.mock('../../src/infrastructure/firebase', async (original) => ({
  ...(await original<object>()),
  getDocs: mocks.getDocs,
  getDoc: mocks.getDoc,
}));
const response = (id: string, participantId: string) => ({
  docs: [
    {
      id,
      data: () => ({
        timestamp: '2026-11-01T00:00:00Z',
        isHomework: true,
        text: id,
        homeworkForParticipantIds: [participantId],
      }),
    },
  ],
});
const sessions = ['a', 'b'].map((participantId) => ({
  kind: 'course_day',
  participantId,
  courseId: `course-${participantId}`,
  enrollmentId: `enrollment-${participantId}`,
  lifecycleStatus: 'active',
  courseTitle: 'Course',
})) as CabinetSessionItem[];

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ firebaseUser: { uid: 'account' } as User, authGeneration: 1 });
  mocks.getDocs.mockResolvedValue({ docs: [] });
  mocks.getDoc.mockResolvedValue({ exists: () => false });
});
afterEach(cleanup);

it('confirms existing authorized legacy Bookings only and preserves denial/error feedback', async () => {
  const candidates = getLegacyHomeworkCandidates(sessions, 'a');
  const booking = { userId: 'account', courseId: 'course-a', instructorId: 'course_course-a' };
  const snapshot = (data: object) => ({ exists: () => true, data: () => data });
  mocks.getDoc.mockResolvedValueOnce(snapshot(booking));
  expect(
    (await confirmLegacyHomeworkSources(candidates, 'account')).sources.map(
      (source) => source.threadId
    )
  ).toEqual(['enrollment-a']);
  for (const change of [
    { userId: 'foreign' },
    { courseId: 'wrong', instructorId: 'wrong' },
    { participantId: 'b' },
    { status: 'cancelled' },
    { isDeleted: true },
    { party: {} },
    { dataScope: 'test', testSessionId: 'session' },
  ]) {
    mocks.getDoc.mockResolvedValueOnce(snapshot({ ...booking, ...change }));
    expect((await confirmLegacyHomeworkSources(candidates, 'account')).sources).toEqual([]);
  }
  expect((await confirmLegacyHomeworkSources(candidates, 'account')).sources).toEqual([]);
  mocks.getDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  expect(await confirmLegacyHomeworkSources(candidates, 'account')).toMatchObject({
    sources: [],
    denied: ['enrollment-a'],
    error: false,
  });
  mocks.getDoc.mockRejectedValueOnce(new Error('offline'));
  expect(await confirmLegacyHomeworkSources(candidates, 'account')).toMatchObject({
    sources: [],
    denied: [],
    error: true,
  });
});

it('ignores late legacy confirmation across A → B → A and sign-out', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getDoc.mockImplementationOnce(
    () =>
      new Promise((yes) => {
        resolve = yes;
      })
  );
  const view = renderHook(
    ({ participantId }) => useStudentHomeworkSources(sessions, participantId, [], 'account'),
    { initialProps: { participantId: 'a' } }
  );
  await waitFor(() => expect(mocks.getDoc).toHaveBeenCalledOnce());
  view.rerender({ participantId: 'b' });
  await waitFor(() => expect(view.result.current.feedback.loading).toBe(false));
  view.rerender({ participantId: 'a' });
  await waitFor(() => expect(view.result.current.feedback.loading).toBe(false));
  await act(async () =>
    resolve({ exists: () => true, data: () => ({ userId: 'account', courseId: 'course-a' }) })
  );
  expect(view.result.current.sources.map((source) => source.threadId)).toEqual(['course-a']);
  act(() => useAuthStore.setState({ firebaseUser: null, authGeneration: 2 }));
  expect(view.result.current.feedback.loading).toBe(false);
});

it.each(['success', 'denied'] as const)(
  'isolates A → B → A even when the first A callable settles late (%s)',
  async (outcome) => {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;
    mocks.getDocs.mockRejectedValueOnce({ code: 'permission-denied' });
    mocks.callFunction.mockImplementationOnce(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        })
    );
    const view = renderHook(
      ({ participantId }) =>
        useLessonHomeworkHistory(
          getStudentHomeworkSources(sessions, participantId).map((source) => source.threadId),
          participantId,
          'student-account',
          true
        ),
      { initialProps: { participantId: 'a' } }
    );
    await waitFor(() => expect(mocks.callFunction).toHaveBeenCalledOnce());
    expect(mocks.callFunction.mock.calls[0][1]).toMatchObject({
      threadId: 'course-a',
      homeworkOnly: true,
    });
    mocks.getDocs.mockResolvedValueOnce(response('current-b', 'b'));
    view.rerender({ participantId: 'b' });
    expect(view.result.current.items).toEqual([]);
    await waitFor(() => expect(view.result.current.items[0]?.id).toBe('current-b'));
    mocks.getDocs.mockResolvedValueOnce(response('current-a', 'a'));
    view.rerender({ participantId: 'a' });
    expect(view.result.current.items).toEqual([]);
    await waitFor(() => expect(view.result.current.items[0]?.id).toBe('current-a'));
    await act(async () => {
      if (outcome === 'denied') reject({ code: 'functions/permission-denied' });
      else
        resolve({
          messages: [{ ...response('stale-a', 'a').docs[0].data(), id: 'stale-a' }],
          cursor: null,
          hasMore: false,
        });
    });
    expect(view.result.current.items.map((item) => item.id)).toEqual(['current-a']);
    expect(view.result.current.denied).toEqual([]);
    expect(mocks.callFunction).toHaveBeenCalledOnce();
    expect(
      mocks.getDocs.mock.calls.every(
        ([query]) => !JSON.stringify(query._query).includes('enrollment-')
      )
    ).toBe(true);
  }
);

it('filters another participant audience even in an authorized shared course', async () => {
  mocks.getDocs.mockResolvedValueOnce({
    docs: [...response('for-a', 'a').docs, ...response('for-b', 'b').docs],
  });
  const view = renderHook(() => useLessonHomeworkHistory(['shared-course'], 'a', 'account', true));
  await waitFor(() => expect(view.result.current.items.map((item) => item.id)).toEqual(['for-a']));
});
