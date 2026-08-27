import type { Booking } from '../../types';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';

export function isCourseLegacyBooking(booking: Booking): boolean {
  return booking.instructorId.startsWith('course_');
}

export function mapLegacyCourseBookingToCabinetItem(booking: Booking): LessonBookingCabinetItem {
  return {
    id: booking.id,
    bookingId: booking.id,
    revision: 0,
    status: booking.status,
    date: booking.date,
    time: booking.time,
    durationHours: booking.durationHours,
    instructorId: booking.instructorId,
    instructorName: booking.instructorName,
    instructorAvatar: booking.instructorAvatar,
    participantNames: [],
    partyKind: 'individual',
    payment: { kind: 'visible' },
    totalPrice: booking.totalPrice,
    bookingOrigin: 'account',
    isLessonBooking: false,
    difficulty: booking.difficulty,
    cancellationReason: booking.cancellationReason,
  };
}

export function mergeCabinetLessonAndCourseBookings(
  lessonBookings: readonly LessonBookingCabinetItem[],
  legacyBookings: readonly Booking[]
): LessonBookingCabinetItem[] {
  const courseRows = legacyBookings
    .filter((booking) => isCourseLegacyBooking(booking) && !booking.isDeleted)
    .map(mapLegacyCourseBookingToCabinetItem);
  const merged = new Map<string, LessonBookingCabinetItem>();
  for (const item of lessonBookings) {
    merged.set(item.bookingId, item);
  }
  for (const item of courseRows) {
    if (!merged.has(item.bookingId)) {
      merged.set(item.bookingId, item);
    }
  }
  return [...merged.values()].sort((left, right) => right.date.localeCompare(left.date));
}

/** Deferred review/chat modals still consume legacy `Booking` shape (not canonical reads). */
export function cabinetItemToLegacyPresentation(
  item: LessonBookingCabinetItem,
  userId: string
): Booking {
  return {
    id: item.id,
    userId,
    instructorId: item.instructorId,
    instructorName: item.instructorName,
    instructorAvatar: item.instructorAvatar,
    date: item.date,
    time: item.time,
    durationHours: item.durationHours,
    totalPrice: item.totalPrice ?? 0,
    status: item.status,
    difficulty: item.difficulty ?? 'beginner',
    cancellationReason: item.cancellationReason,
  };
}
