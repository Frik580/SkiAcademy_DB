import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  selectCourseEnrollmentItems,
  useCourseEnrollmentStore,
} from '../../src/features/course-enrollments/courseEnrollmentStore';
import type { CourseEnrollmentCabinetItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';

function enrollmentItem(
  enrollmentId: string,
  revision: number,
  courseId = 'course_fixture_01'
): CourseEnrollmentCabinetItem {
  return {
    enrollmentId,
    revision,
    courseId,
    participantId: 'participant_fixture_01',
    participantName: 'Alice',
    lifecycleStatus: 'confirmed',
    courseTitle: 'Beginner Camp',
    courseSchedule: {
      courseId,
      courseScheduleRevision: 1,
      courseDayCount: 1,
      startAt: { seconds: 1_800_000_000, nanoseconds: 0 },
      finalCourseDayEndsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
      courseDays: [
        {
          courseDayId: 'course_day_fixture_01',
          dayOrder: 1,
          interval: {
            startsAt: { seconds: 1_800_000_000, nanoseconds: 0 },
            endsAt: { seconds: 1_800_010_000, nanoseconds: 0 },
          },
          timeZone: 'Asia/Almaty',
          revision: 1,
        },
      ],
    },
    scheduleStartDate: '2027-01-15',
    scheduleEndDate: '2027-01-15',
    bookingOrigin: 'account',
    authorizedActions: { canWithdraw: true, canRequestCancellation: false },
    updatedAtSeconds: 1_800_000_000,
  };
}

describe('courseEnrollmentStore', () => {
  beforeEach(() => {
    useCourseEnrollmentStore.getState().reset();
  });

  it('mergeItems never replaces a newer cached revision with an older one', () => {
    const store = useCourseEnrollmentStore.getState();
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 4)]]));
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 2)]]));
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_a')?.revision).toBe(4);
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 6)]]));
    expect(useCourseEnrollmentStore.getState().items.get('enrollment_a')?.revision).toBe(6);
  });

  it('keeps a stable itemsList snapshot when mergeItems makes no revision changes', () => {
    const store = useCourseEnrollmentStore.getState();
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 4)]]));
    const before = useCourseEnrollmentStore.getState();
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 2)]]));
    const after = useCourseEnrollmentStore.getState();
    expect(after.itemsList).toBe(before.itemsList);
    expect(after.items).toBe(before.items);
  });

  it('selectCourseEnrollmentItems returns the cached store snapshot', () => {
    const store = useCourseEnrollmentStore.getState();
    store.mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 1)]]));
    const state = useCourseEnrollmentStore.getState();
    expect(selectCourseEnrollmentItems(state)).toBe(state.itemsList);
    expect(selectCourseEnrollmentItems(state)).toBe(selectCourseEnrollmentItems(state));
  });

  it('subscribing with selectCourseEnrollmentItems does not rerender on no-op merges', () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount += 1;
      return useCourseEnrollmentStore(selectCourseEnrollmentItems);
    });
    expect(renderCount).toBe(1);
    act(() => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 1)]]));
    });
    expect(renderCount).toBe(2);
    act(() => {
      useCourseEnrollmentStore
        .getState()
        .mergeItems(new Map([['enrollment_a', enrollmentItem('enrollment_a', 1)]]));
    });
    expect(renderCount).toBe(2);
  });
});
