import { Booking } from '../types';

const GUEST_BOOKING_ID_PATTERN = /^guest_book_(\d+)_/;
const GUEST_COURSE_ID_PATTERN = /^guest_course_(\d+)_/;

export function inferBookingCreatedAtFromId(bookingId: string): Date | null {
  const guestBookMatch = bookingId.match(GUEST_BOOKING_ID_PATTERN);
  if (guestBookMatch) {
    const parsed = new Date(Number(guestBookMatch[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const guestCourseMatch = bookingId.match(GUEST_COURSE_ID_PATTERN);
  if (guestCourseMatch) {
    const parsed = new Date(Number(guestCourseMatch[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function resolveBookingCreatedAt(booking: Pick<Booking, 'id' | 'createdAt'>): Date | null {
  if (booking.createdAt) {
    const parsed = new Date(booking.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return inferBookingCreatedAtFromId(booking.id);
}

export function withBookingCreatedAt<T extends Booking>(booking: T): T {
  if (booking.createdAt) return booking;
  const inferred = inferBookingCreatedAtFromId(booking.id);
  return {
    ...booking,
    createdAt: inferred?.toISOString() ?? new Date().toISOString(),
  };
}

export function formatBookingCreatedAt(
  booking: Pick<Booking, 'id' | 'createdAt'>,
  language: 'en' | 'ru'
): string | null {
  const createdAt = resolveBookingCreatedAt(booking);
  if (!createdAt) return null;

  return createdAt.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
