import { describe, expect, it } from 'vitest';
import {
  lessonViewForTrainingScope,
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

  it('maps pending_guest scope to lesson pending_guest view, not hot', () => {
    expect(lessonViewForTrainingScope('pending_guest')).toBe('pending_guest');
    expect(lessonViewForTrainingScope('current')).toBe('hot');
    expect(lessonViewForTrainingScope('history')).toBe('history');
    expect(
      resolveAdminTrainingScope({
        kind: 'all',
        bookingView: 'pending_guest',
        enrollmentView: 'roster',
      })
    ).toBe('pending_guest');
  });

  it('excludes paid confirmed guest-origin lessons from pending_guest merge membership', () => {
    const confirmedGuestLesson = {
      kind: 'lesson',
      id: 'booking_guest_confirmed',
      data: {
        bookingId: 'booking_guest_confirmed',
        bookingOrigin: 'guest',
        lifecycle: { status: 'confirmed' },
        updatedAt: { seconds: 20, nanoseconds: 0 },
      },
    } as unknown as AdminTrainingRecord;
    const pendingGuestLesson = {
      kind: 'lesson',
      id: 'booking_guest_pending',
      data: {
        bookingId: 'booking_guest_pending',
        bookingOrigin: 'guest',
        lifecycle: { status: 'pending' },
        updatedAt: { seconds: 15, nanoseconds: 0 },
      },
    } as unknown as AdminTrainingRecord;
    const pendingGuestCourse = {
      kind: 'course',
      id: 'enrollment_guest_pending',
      data: {
        enrollmentId: 'enrollment_guest_pending',
        guestState: 'pending_unlinked',
        lifecycleStatus: 'pending',
        updatedAt: { seconds: 18, nanoseconds: 0 },
      },
    } as unknown as AdminTrainingRecord;

    // Presentation merge trusts scope-filtered inputs. pending_guest must receive only
    // pending-guest lessons from admin_pending_guest, never hot confirmed guest-origin rows.
    const pendingGuestMerged = mergeAdminTrainingRecords({
      kind: 'all',
      lessons: [pendingGuestLesson],
      courses: [pendingGuestCourse],
    });
    expect(pendingGuestMerged.map((item) => item.id)).toEqual([
      'enrollment_guest_pending',
      'booking_guest_pending',
    ]);
    expect(pendingGuestMerged.map((item) => item.id)).not.toContain('booking_guest_confirmed');

    const currentMerged = mergeAdminTrainingRecords({
      kind: 'all',
      lessons: [confirmedGuestLesson],
      courses: [],
    });
    expect(currentMerged.map((item) => item.id)).toEqual(['booking_guest_confirmed']);
  });
});
