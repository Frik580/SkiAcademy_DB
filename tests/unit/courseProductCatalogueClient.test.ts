import { createElement, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { courseFromProductCatalogItem } from '../../src/features/courses/courseCatalogProduct';
import { useCoursesStore } from '../../src/features/courses/coursesStore';
import { useCoursesSync } from '../../src/features/courses/sync/useCoursesSync';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { useCourseCatalogReadSync } from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';

const queryCourseCatalogReadModels = vi.hoisted(() => vi.fn());
const observeTestActorAssignment = vi.hoisted(() => vi.fn());

vi.mock('../../src/lib/canonical/scopedClientDocuments', () => ({
  subscribeScopedDocuments: vi.fn(),
  observeTestActorAssignment,
}));

vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  onSnapshot: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseCatalogReadModels,
  queryCourseEnrollmentReadModels: vi.fn(),
}));

const productItem = {
  courseId: 'course_test_clone',
  revision: 1,
  title: 'TEST BASE',
  price: 250000,
  capacity: {
    totalSeats: 8,
    availableSeats: 8,
    isCapacityFrozen: false,
    isEnrollmentEligible: true,
    isFull: false,
  },
  scheduleSummary: {
    startAt: { seconds: 1, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 2, nanoseconds: 0 },
    courseDayCount: 1,
  },
  courseSchedule: {
    courseDays: [
      {
        courseDayId: 'day_1',
        dayOrder: 1,
        timeZone: 'Asia/Almaty',
        interval: {
          startsAt: { seconds: 1, nanoseconds: 0 },
          endsAt: { seconds: 2, nanoseconds: 0 },
        },
        actualInstructorIds: ['ins_test'],
      },
    ],
  },
  updatedAt: { seconds: 1, nanoseconds: 0 },
  presentation: {
    duration: '5 days',
    description: 'TEST clone',
    dates: 'January',
    bgImageUrl: 'https://example.com/test-base.jpg',
  },
};

const liveItem = {
  ...productItem,
  courseId: 'course_live_base',
  title: 'BASE',
  presentation: { ...productItem.presentation, discipline: 'ski' },
};

function response(items: unknown[], scopeKey = 'live', next: string | null = null) {
  return { items, page: { scopeKey, next, revisions: [null, null] } };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, { initialEntries: ['/'] }, children);
}

describe('product course catalogue client', () => {
  it.each(['ski', 'snowboard'] as const)(
    'preserves %s through the public catalog UI mapping',
    (discipline) => {
      expect(
        courseFromProductCatalogItem({
          ...productItem,
          presentation: { ...productItem.presentation, discipline },
        } as never)?.discipline
      ).toBe(discipline);
    }
  );

  beforeEach(() => {
    observeTestActorAssignment.mockReset();
    queryCourseCatalogReadModels.mockReset();
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    useCoursesStore.setState({ courses: [] });
    useCourseEnrollmentStore.getState().reset();
    queryCourseCatalogReadModels.mockImplementation(async (input: { scope: string }) =>
      response(
        input.scope === 'product' ? [productItem] : [liveItem],
        input.scope === 'product' ? 'test/sessions/session_a' : 'live'
      )
    );
  });

  it('keeps the guest homepage on LIVE courses with one read owner', async () => {
    renderHook(
      () => {
        useCoursesSync(true);
        useCourseCatalogReadSync(true);
      },
      { wrapper }
    );
    await waitFor(() =>
      expect(useCoursesStore.getState().courses.map(({ id }) => id)).toEqual(['course_live_base'])
    );
    expect(queryCourseCatalogReadModels).toHaveBeenCalledExactlyOnceWith({
      scope: 'public',
      page: {},
    });
  });

  it('waits for the complete joined response before publishing courses', async () => {
    let finish!: (value: unknown) => void;
    queryCourseCatalogReadModels.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderHook(() => useCoursesSync(), { wrapper });
    expect(useCoursesStore.getState().courses).toEqual([]);
    expect(useCoursesStore.getState().publicCoursesStatus).toBe('loading');
    await act(async () =>
      finish(response([liveItem, { ...productItem, presentation: undefined }]))
    );
    expect(useCoursesStore.getState().courses).toMatchObject([
      { id: liveItem.courseId, discipline: 'ski' },
    ]);
  });

  it('keeps the first page private until all 205 courses arrive', async () => {
    const courses = Array.from({ length: 205 }, (_, index) => ({
      ...liveItem,
      courseId: 'course_' + index,
    }));
    let finish!: (value: unknown) => void;
    queryCourseCatalogReadModels
      .mockResolvedValueOnce(response(courses.slice(0, 100), 'live', 'course_99'))
      .mockResolvedValueOnce(response(courses.slice(100, 200), 'live', 'course_199'))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
    renderHook(() => useCoursesSync(), { wrapper });
    await waitFor(() => expect(queryCourseCatalogReadModels).toHaveBeenCalledTimes(3));
    expect(queryCourseCatalogReadModels).toHaveBeenLastCalledWith({
      scope: 'public',
      page: { cursor: 'course_199' },
    });
    expect(useCoursesStore.getState().courses).toEqual([]);
    await act(async () => finish(response(courses.slice(200))));
    expect(useCoursesStore.getState().courses.map(({ id }) => id)).toEqual(
      courses.map(({ courseId }) => courseId)
    );
  });

  it('clears an old TEST catalog on assignment change and ignores its pending page', async () => {
    let assign!: (value: string | null) => void;
    observeTestActorAssignment.mockImplementation((_uid, receive) => {
      assign = receive;
      return () => undefined;
    });
    useAuthStore.getState().setFirebaseUser({ uid: 'account_test_actor' } as never);
    renderHook(() => useCoursesSync(), { wrapper });
    await waitFor(() => expect(useCoursesStore.getState().courses).toHaveLength(1));
    await act(async () => assign('session_a'));
    let finish!: (value: unknown) => void;
    queryCourseCatalogReadModels.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => useCoursesStore.getState().retryPublicCourses());
    const replacement = { ...productItem, courseId: 'course_session_b' };
    queryCourseCatalogReadModels.mockResolvedValueOnce(
      response([replacement], 'test/sessions/session_b')
    );
    act(() => assign('session_b'));
    expect(useCoursesStore.getState().courses).toEqual([]);
    await waitFor(() =>
      expect(useCoursesStore.getState().courses.map(({ id }) => id)).toEqual([replacement.courseId])
    );
    await act(async () => finish(response([productItem], 'test/sessions/session_a')));
    expect(useCoursesStore.getState().courses.map(({ id }) => id)).toEqual([replacement.courseId]);
  });

  it('shows only the server TEST course after sign-in and restores LIVE on logout', async () => {
    renderHook(
      () => {
        useCoursesSync(true);
        useCourseCatalogReadSync(true);
      },
      { wrapper }
    );

    await act(async () => {
      useAuthStore.getState().setFirebaseUser({ uid: 'account_test_actor' } as never);
    });

    await waitFor(() => {
      expect(useCoursesStore.getState().courses.map((course) => course.title)).toEqual([
        'TEST BASE',
      ]);
    });
    expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
      'course_test_clone',
    ]);
    expect(useCourseEnrollmentStore.getState().catalogByCourseId.has('course_live_base')).toBe(
      false
    );
    expect(useCourseEnrollmentStore.getState().catalogByCourseId.has('course_test_clone')).toBe(
      true
    );

    await act(async () => {
      useAuthStore.getState().setFirebaseUser(null);
    });

    await waitFor(() => {
      expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
        'course_live_base',
      ]);
    });
  });

  it('restores the authenticated course list and availability together after a failed initial read', async () => {
    useAuthStore.setState({
      firebaseUser: { uid: 'account_test_actor' } as never,
      authGeneration: 1,
    });
    queryCourseCatalogReadModels.mockRejectedValueOnce(new Error('catalog unavailable'));
    const { result } = renderHook(
      () => {
        useCoursesSync(true);
        return useCourseCatalogReadSync(true);
      },
      { wrapper }
    );
    await waitFor(() => expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('error'));
    expect(useCoursesStore.getState().courses).toEqual([]);
    expect(queryCourseCatalogReadModels).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reloadCatalog();
    });
    expect(queryCourseCatalogReadModels).toHaveBeenCalledTimes(2);
    expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('ready');
    expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
      'course_test_clone',
    ]);
    expect(useCourseEnrollmentStore.getState().catalogByCourseId.has('course_test_clone')).toBe(
      true
    );
  });

  it('maps the enroll target to the catalogue course id', () => {
    const course = courseFromProductCatalogItem(productItem as never);
    expect(course?.id).toBe('course_test_clone');
    expect(course?.id).not.toBe('course_1784217360616');
    expect(course?.description).toBe('TEST clone');
  });

  it('ignores a pending TEST catalogue response after switching accounts', async () => {
    let finish!: (value: unknown) => void;
    useAuthStore.getState().setFirebaseUser({ uid: 'account_old_actor' } as never);
    queryCourseCatalogReadModels.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    renderHook(() => useCoursesSync(), { wrapper });
    expect(queryCourseCatalogReadModels).toHaveBeenCalledTimes(1);

    const nextItem = { ...productItem, courseId: 'course_next_account', title: 'Next Account' };
    queryCourseCatalogReadModels.mockResolvedValue(response([nextItem]));
    await act(async () => {
      useAuthStore.getState().setFirebaseUser({ uid: 'account_next_actor' } as never);
    });
    expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
      'course_next_account',
    ]);
    await act(async () => finish(response([productItem])));
    expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
      'course_next_account',
    ]);
    expect(useCourseEnrollmentStore.getState().catalogByCourseId.has('course_test_clone')).toBe(
      false
    );
  });
});
