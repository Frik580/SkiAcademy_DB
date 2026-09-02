import type {
  AdminCourseEnrollmentRosterItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import type { Booking, BookingStatus } from '../../../types';
import { localDateTimeFromTimestamp, resolveAdminTimeZone } from './adminTimeZone';

function asBookingStatus(status: string): BookingStatus {
  if (
    status === 'pending' ||
    status === 'confirmed' ||
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'pending_cancellation'
  ) {
    return status;
  }
  if (status === 'withdrawn' || status === 'no_show') return 'cancelled';
  return 'confirmed';
}

export function lessonBookingToMonitorRow(booking: LessonBookingReadModel): Booking {
  const timeZone = booking.occurrence.timeZone || resolveAdminTimeZone();
  const local = localDateTimeFromTimestamp(booking.occurrence.startsAt.seconds, timeZone);
  const participant = booking.admin?.participants[0] ?? booking.participants[0];
  const isGuest = booking.bookingOrigin === 'guest';
  const price =
    booking.admin?.payment.price ??
    (booking.paymentPresentation?.kind === 'visible' ? booking.paymentPresentation.price : 0);
  return {
    id: booking.bookingId,
    userId: booking.admin?.payer?.accountId ?? participant?.participantId ?? booking.bookingId,
    instructorId: booking.instructor.instructorId,
    instructorName: booking.instructor.displayName,
    instructorAvatar: booking.instructor.avatarUrl ?? '',
    date: local.date,
    time: local.time,
    durationHours: Math.max(1, Math.round(booking.occurrence.durationMinutes / 60)),
    totalPrice: price,
    status: asBookingStatus(booking.lifecycle.status),
    difficulty: 'beginner',
    notes: participant?.displayName,
    isGuest,
    guestName: isGuest ? participant?.displayName : undefined,
    createdAt: new Date(booking.updatedAt.seconds * 1_000).toISOString(),
  };
}

export function courseEnrollmentToMonitorRow(
  enrollment: AdminCourseEnrollmentRosterItem
): Booking {
  const local = localDateTimeFromTimestamp(enrollment.updatedAt.seconds, resolveAdminTimeZone());
  const isGuest = enrollment.guestState === 'pending_unlinked';
  return {
    id: enrollment.enrollmentId,
    userId:
      enrollment.payer?.accountId ??
      enrollment.participant.participantId ??
      enrollment.enrollmentId,
    instructorId: `course_${enrollment.course.courseId}`,
    instructorName: enrollment.course.title,
    instructorAvatar: '',
    date: local.date,
    time: local.time,
    durationHours: 1,
    totalPrice: enrollment.payment?.price ?? 0,
    status: asBookingStatus(enrollment.lifecycleStatus),
    difficulty: 'beginner',
    notes: enrollment.participant.displayName,
    isGuest,
    guestName: isGuest ? enrollment.participant.displayName : undefined,
    courseId: enrollment.course.courseId,
    createdAt: new Date(enrollment.updatedAt.seconds * 1_000).toISOString(),
  };
}

export function mergeAdminBookingMonitorRows(
  lessons: readonly LessonBookingReadModel[],
  enrollments: readonly AdminCourseEnrollmentRosterItem[]
): Booking[] {
  return [
    ...lessons.map(lessonBookingToMonitorRow),
    ...enrollments.map(courseEnrollmentToMonitorRow),
  ];
}
