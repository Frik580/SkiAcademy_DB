import { describe, expect, it } from 'vitest';
import {
  mergeAdminTrainingRecords,
  resolveAdminTrainingKindFilter,
  resolveAdminTrainingScope,
} from '../../src/features/admin/training-records/adminTrainingRecordUtils';
import type { AdminTrainingRecord } from '../../src/features/admin/training-records/adminTrainingRecordContracts';

const timestamp = { seconds: 10, nanoseconds: 0 };

describe('admin training record presentation merge', () => {
  it('interleaves lesson and course records by updatedAt without creating a shared aggregate', () => {
    const lesson = {
      kind: 'lesson',
      id: 'booking_1',
      data: { bookingId: 'booking_1', updatedAt: { seconds: 5, nanoseconds: 0 } },
    } as unknown as AdminTrainingRecord;
    const course = {
      kind: 'course',
      id: 'enrollment_1',
      data: { enrollmentId: 'enrollment_1', updatedAt: timestamp },
    } as unknown as AdminTrainingRecord;
    const merged = mergeAdminTrainingRecords({
      kind: 'all',
      lessons: [lesson],
      courses: [course],
    });
    expect(merged.map((item) => item.kind)).toEqual(['course', 'lesson']);
    expect(merged.every((item) => item.kind === 'lesson' || item.kind === 'course')).toBe(true);
  });

  it('resolves kind and scope from compatibility query params', () => {
    expect(
      resolveAdminTrainingKindFilter({
        hasBooking: false,
        hasEnrollment: true,
        hasCourseFilter: false,
      })
    ).toBe('course');
    expect(
      resolveAdminTrainingScope({
        kind: 'lesson',
        bookingView: 'history',
        enrollmentView: 'roster',
      })
    ).toBe('history');
  });
});
