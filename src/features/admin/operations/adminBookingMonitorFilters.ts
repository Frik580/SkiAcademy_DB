import type { Booking, UserProfile } from '../../../types';
import { isCourseBooking } from '../../../domain/availability';

export type AdminBookingMonitorStatusFilter =
  'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'pending_cancellation';

export type AdminBookingMonitorTypeFilter = 'all' | 'courses' | 'lessons';
export type AdminBookingMonitorSort = 'date_desc' | 'date_asc' | 'client_asc' | 'client_desc';

export interface AdminBookingMonitorFilterInput {
  readonly search: string;
  readonly status: AdminBookingMonitorStatusFilter;
  readonly instructorId: string;
  readonly clientId: string;
  readonly type: AdminBookingMonitorTypeFilter;
  readonly sortBy: AdminBookingMonitorSort;
  readonly language: string;
}

export function filterAdminBookingMonitorRows(
  bookings: readonly Booking[],
  usersList: readonly UserProfile[],
  input: AdminBookingMonitorFilterInput
): Booking[] {
  return bookings
    .filter((booking) => {
      if (booking.userId?.startsWith('system_block_')) return false;
      const client = usersList.find((user) => user.uid === booking.userId);
      const clientNameStr = (client?.displayName || '').toLowerCase();
      const guestNameStr = (booking.guestName || '').toLowerCase();
      const guestPhoneStr = (booking.guestPhone || '').toLowerCase();
      const guestEmailStr = (booking.guestEmail || '').toLowerCase();
      const instructorNameStr = booking.instructorName.toLowerCase();
      const notesStr = (booking.notes || '').toLowerCase();
      const searchLower = input.search.toLowerCase();
      const matchesSearch =
        !input.search ||
        clientNameStr.includes(searchLower) ||
        guestNameStr.includes(searchLower) ||
        guestPhoneStr.includes(searchLower) ||
        guestEmailStr.includes(searchLower) ||
        instructorNameStr.includes(searchLower) ||
        notesStr.includes(searchLower) ||
        booking.id.toLowerCase().includes(searchLower);

      const matchesStatus = input.status === 'all' || booking.status === input.status;
      const matchesInstructor =
        input.instructorId === 'all' ||
        booking.instructorId === input.instructorId ||
        booking.instructorName === input.instructorId;
      const matchesClient =
        input.clientId === 'all'
          ? true
          : input.clientId === 'guests'
            ? Boolean(booking.isGuest || booking.userId?.startsWith('guest_'))
            : booking.userId === input.clientId;
      const isCourse = isCourseBooking(booking);
      const matchesType =
        input.type === 'all' ||
        (input.type === 'courses' && isCourse) ||
        (input.type === 'lessons' && !isCourse);

      return matchesSearch && matchesStatus && matchesInstructor && matchesClient && matchesType;
    })
    .sort((left, right) => {
      if (input.sortBy === 'date_desc' || input.sortBy === 'date_asc') {
        const dateA = new Date(`${left.date}T${left.time || '00:00'}`).getTime();
        const dateB = new Date(`${right.date}T${right.time || '00:00'}`).getTime();
        return input.sortBy === 'date_desc' ? dateB - dateA : dateA - dateB;
      }
      const clientA = usersList.find((user) => user.uid === left.userId)?.displayName || '';
      const clientB = usersList.find((user) => user.uid === right.userId)?.displayName || '';
      const compared = clientA.localeCompare(clientB, input.language === 'ru' ? 'ru' : 'en');
      return input.sortBy === 'client_desc' ? -compared : compared;
    });
}

export function monitorHasCourseAndLessonRows(bookings: readonly Booking[]): {
  readonly lessons: number;
  readonly courses: number;
} {
  return bookings.reduce(
    (counts, booking) => {
      if (booking.userId?.startsWith('system_block_')) return counts;
      if (isCourseBooking(booking)) counts.courses += 1;
      else counts.lessons += 1;
      return counts;
    },
    { lessons: 0, courses: 0 }
  );
}
