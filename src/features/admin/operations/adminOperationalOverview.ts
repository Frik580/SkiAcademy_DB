import {
  bookingIsCompletedService,
  bookingIsNoShowOutcome,
  bookingOccupiesInstructorSlot,
  type BookingLifecycleStatus,
} from '@ski-academy/shared-domain';
import { isCourseBooking } from '../../../domain/availability';
import type { Booking, BookingStatus } from '../../../types';

/**
 * Admin Operations booking counters.
 *
 * Windows (do not mix):
 * - active: current admin_hot operational snapshot (confirmed | pending_cancellation)
 * - completed / no_show / occupied: lifetime lesson bookings in drained
 *   admin_hot ∪ admin_history (hot intentionally excludes completed/no_show)
 *
 * Not today/month/season — those belong to canonical finance overview.
 * Revenue is never derived here.
 */
export type AdminOperationalLessonRead = {
  readonly bookingId: string;
  readonly revision: number;
  readonly lifecycle: { readonly status: BookingLifecycleStatus };
};

export interface AdminOperationalOverviewMetrics {
  readonly activeBookings: number;
  readonly completedBookings: number;
  readonly noShowBookings: number;
  readonly occupiedBookings: number;
  readonly instructorsCount: number;
  readonly lessonCount: number;
  readonly courseEnrollmentCount: number;
}

const isSystemBlock = (booking: Pick<Booking, 'userId'>) =>
  Boolean(booking.userId?.startsWith('system_block_'));

export function mergeAdminOperationalLessonReads(
  items: readonly AdminOperationalLessonRead[]
): AdminOperationalLessonRead[] {
  const merged = new Map<string, AdminOperationalLessonRead>();
  for (const item of items) {
    const cached = merged.get(item.bookingId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.bookingId, item);
    }
  }
  return [...merged.values()];
}

function isHotOperationalStatus(status: BookingStatus): boolean {
  return status === 'confirmed' || status === 'pending_cancellation';
}

export function computeAdminOperationalOverview(input: {
  readonly hotMonitorRows: readonly Booking[];
  readonly lessonReadModels: readonly AdminOperationalLessonRead[];
  readonly instructorsCount: number;
}): AdminOperationalOverviewMetrics {
  let activeBookings = 0;
  let lessonCount = 0;
  let courseEnrollmentCount = 0;

  for (const booking of input.hotMonitorRows) {
    if (isSystemBlock(booking)) continue;
    if (isCourseBooking(booking)) courseEnrollmentCount += 1;
    else lessonCount += 1;
    if (isHotOperationalStatus(booking.status)) {
      activeBookings += 1;
    }
  }

  let completedBookings = 0;
  let noShowBookings = 0;
  let occupiedBookings = 0;
  for (const lesson of mergeAdminOperationalLessonReads(input.lessonReadModels)) {
    const status = lesson.lifecycle.status;
    if (bookingIsCompletedService(status)) {
      completedBookings += 1;
    }
    if (bookingIsNoShowOutcome(status)) {
      noShowBookings += 1;
    }
    if (bookingOccupiesInstructorSlot(status)) {
      occupiedBookings += 1;
    }
  }

  return {
    activeBookings,
    completedBookings,
    noShowBookings,
    occupiedBookings,
    instructorsCount: input.instructorsCount,
    lessonCount,
    courseEnrollmentCount,
  };
}
