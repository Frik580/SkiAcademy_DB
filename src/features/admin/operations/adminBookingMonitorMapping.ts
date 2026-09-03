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

function timestampToIso(seconds: number): string {
  return new Date(seconds * 1_000).toISOString();
}

export function lessonBookingToMonitorRow(booking: LessonBookingReadModel): Booking {
  const timeZone = booking.occurrence.timeZone || resolveAdminTimeZone();
  const local = localDateTimeFromTimestamp(booking.occurrence.startsAt.seconds, timeZone);
  const participant = booking.admin?.participants[0] ?? booking.participants[0];
  const isGuest = booking.bookingOrigin === 'guest';
  const price =
    booking.admin?.payment.price ??
    (booking.paymentPresentation?.kind === 'visible' ? booking.paymentPresentation.price : 0);
  const createdAtSeconds =
    booking.lifecycle.requestedAt?.seconds ?? booking.updatedAt.seconds;
  return {
    id: booking.bookingId,
    userId: booking.admin?.payer?.accountId ?? participant?.participantId ?? booking.bookingId,
    instructorId: booking.instructor.instructorId,
    instructorName: booking.instructor.displayName,
    instructorAvatar: booking.instructor.avatarUrl ?? '',
    date: local.date,
    time: local.time,
    durationHours: booking.occurrence.durationMinutes / 60,
    totalPrice: price,
    status: asBookingStatus(booking.lifecycle.status),
    ...(booking.difficulty !== undefined ? { difficulty: booking.difficulty } : {}),
    ...(booking.notes ? { notes: booking.notes } : {}),
    isGuest,
    guestName: participant?.displayName,
    createdAt: timestampToIso(createdAtSeconds),
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
    durationHours: 0,
    totalPrice: enrollment.payment?.price ?? 0,
    status: asBookingStatus(enrollment.lifecycleStatus),
    isGuest,
    guestName: enrollment.participant.displayName,
    courseId: enrollment.course.courseId,
    createdAt: timestampToIso(enrollment.updatedAt.seconds),
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
