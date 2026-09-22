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

const onSnapshot = vi.hoisted(() =>
  vi.fn((_query: unknown, onNext: (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void) => {
    onNext({
      docs: [
        {
          id: 'course_live_base',
          data: () => ({
            title: 'BASE',
            price: 250000,
            capacity: { totalSeats: 8, availableSeats: 8 },
            lifecycle: 'active',
            dataScope: 'live',
          }),
        },
        {
          id: 'course_test_clone',
          data: () => ({
            title: 'TEST BASE',
            price: 250000,
            capacity: { totalSeats: 8, availableSeats: 8 },
            lifecycle: 'active',
            dataScope: 'test',
            testSessionId: 'test_course_client_a01',
          }),
        },
      ],
    });
    return () => undefined;
  })
);

const queryCourseCatalogReadModels = vi.hoisted(() => vi.fn());

vi.mock('../../src/infrastructure/firebase', () => ({
  collection: () => ({}),
  db: {},
  handleFirestoreError: () => undefined,
  limit: () => ({}),
  onSnapshot,
  OperationType: { LIST: 'LIST' },
  query: () => ({}),
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

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, { initialEntries: ['/'] }, children);
}

describe('product course catalogue client', () => {
  beforeEach(() => {
    onSnapshot.mockClear();
    queryCourseCatalogReadModels.mockReset();
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    useCoursesStore.setState({ courses: [] });
    useCourseEnrollmentStore.getState().reset();
    queryCourseCatalogReadModels.mockImplementation(async (input: { scope: string }) =>
      input.scope === 'product'
        ? { scope: 'product', items: [productItem] }
        : {
            scope: 'public',
            items: [
              {
                ...productItem,
                courseId: 'course_live_base',
                title: 'BASE',
                presentation: undefined,
              },
            ],
          }
    );
  });

  it('keeps the guest homepage on LIVE courses', async () => {
    renderHook(() => {
      useCoursesSync();
      useCourseCatalogReadSync(true);
    }, { wrapper });

    expect(useCoursesStore.getState().courses.map((course) => course.id)).toEqual([
      'course_live_base',
    ]);
    await waitFor(() => {
      expect(queryCourseCatalogReadModels).toHaveBeenCalledWith({ scope: 'public' });
    });
    expect(queryCourseCatalogReadModels).not.toHaveBeenCalledWith({ scope: 'product' });
  });

  it('shows only the server TEST course after sign-in and restores LIVE on logout', async () => {
    renderHook(() => {
      useCoursesSync();
      useCourseCatalogReadSync(true);
    }, { wrapper });

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

  it('maps the enroll target to the catalogue course id', () => {
    const course = courseFromProductCatalogItem(productItem as never);
    expect(course?.id).toBe('course_test_clone');
    expect(course?.id).not.toBe('course_1784217360616');
    expect(course?.description).toBe('TEST clone');
  });
});
