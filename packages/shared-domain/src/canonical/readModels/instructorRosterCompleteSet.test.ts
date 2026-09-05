import { describe, expect, it, vi } from 'vitest';
import { COURSE_SEAT_MAX, CourseCapacitySchema } from '../courseEnrollmentAttendanceAdminIssue';
import {
  COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX,
  InstructorRosterCompleteSetOverflowError,
  INSTRUCTOR_ROSTER_COMPLETE_SET_MAX,
  drainInstructorRosterCompleteSet,
  instructorRosterCompleteSetMaxPages,
} from './courseEnrollmentReadModel';

describe('instructor roster OPERATIONAL_COMPLETE_SET bound', () => {
  it('equals COURSE_SEAT_MAX and needs three pages at default pageSize', () => {
    expect(INSTRUCTOR_ROSTER_COMPLETE_SET_MAX).toBe(COURSE_SEAT_MAX);
    expect(INSTRUCTOR_ROSTER_COMPLETE_SET_MAX).toBe(64);
    expect(COURSE_ENROLLMENT_READ_MODEL_PAGE_SIZE_MAX).toBe(25);
    expect(instructorRosterCompleteSetMaxPages()).toBe(3);
  });

  it('rejects Course capacity above COURSE_SEAT_MAX via domain schema', () => {
    expect(CourseCapacitySchema.safeParse({ totalSeats: 65, availableSeats: 65 }).success).toBe(
      false
    );
    expect(CourseCapacitySchema.safeParse({ totalSeats: 64, availableSeats: 64 }).success).toBe(
      true
    );
  });

  it('drains exactly three cursor pages for 64 roster rows without duplicates', async () => {
    const ids = Array.from(
      { length: 64 },
      (_, index) => `enrollment_${String(index + 1).padStart(2, '0')}`
    );
    const fetchPage = vi.fn(async (cursor: string | undefined) => {
      if (!cursor) {
        return {
          items: ids.slice(0, 25).map((id) => ({ id })),
          hasMore: true,
          nextCursor: 'cursor-page-1',
        };
      }
      if (cursor === 'cursor-page-1') {
        return {
          items: ids.slice(25, 50).map((id) => ({ id })),
          hasMore: true,
          nextCursor: 'cursor-page-2',
        };
      }
      if (cursor === 'cursor-page-2') {
        return {
          items: ids.slice(50, 64).map((id) => ({ id })),
          hasMore: false,
        };
      }
      throw new Error(`unexpected cursor ${cursor}`);
    });

    const items = await drainInstructorRosterCompleteSet({ fetchPage });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([
      undefined,
      'cursor-page-1',
      'cursor-page-2',
    ]);
    expect(items.map((item) => item.id)).toEqual(ids);
    expect(new Set(items.map((item) => item.id)).size).toBe(64);
  });

  it('fails visibly when hasMore remains after capacity bound', async () => {
    const fetchPage = vi.fn(async (cursor: string | undefined) => {
      if (!cursor) {
        return {
          items: Array.from({ length: 25 }, (_, index) => ({ id: `a${index}` })),
          hasMore: true,
          nextCursor: 'c1',
        };
      }
      if (cursor === 'c1') {
        return {
          items: Array.from({ length: 25 }, (_, index) => ({ id: `b${index}` })),
          hasMore: true,
          nextCursor: 'c2',
        };
      }
      return {
        items: Array.from({ length: 14 }, (_, index) => ({ id: `c${index}` })),
        hasMore: true,
        nextCursor: 'c3',
      };
    });

    await expect(drainInstructorRosterCompleteSet({ fetchPage })).rejects.toBeInstanceOf(
      InstructorRosterCompleteSetOverflowError
    );
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
