import type {
  AdminCourseEnrollmentRosterItem,
  LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import { localDateTimeFromTimestamp, resolveAdminTimeZone } from '../operations/adminTimeZone';

export interface AdminGuestFinanceRow {
  readonly id: string;
  readonly label: string;
  readonly status: string;
  readonly amountKzt: number;
  readonly date: string;
  readonly time: string;
  readonly payerAccountId?: string;
  readonly paymentId?: string;
  readonly identityState: 'unlinked_guest' | 'linked_guest';
  readonly serviceKind: 'lesson' | 'course_enrollment';
}

export function guestFinanceRowFromLesson(
  booking: LessonBookingReadModel
): AdminGuestFinanceRow | undefined {
  if (booking.bookingOrigin !== 'guest') return undefined;
  const timeZone = booking.occurrence.timeZone || resolveAdminTimeZone();
  const local = localDateTimeFromTimestamp(booking.occurrence.startsAt.seconds, timeZone);
  const participant = booking.admin?.participants[0] ?? booking.participants[0];
  const linked = Boolean(booking.admin?.payer?.accountId);
  return {
    id: booking.bookingId,
    label: participant?.displayName || booking.bookingId,
    status: booking.lifecycle.status,
    amountKzt: booking.admin?.payment.price ?? 0,
    date: local.date,
    time: local.time,
    ...(booking.admin?.payer?.accountId
      ? { payerAccountId: booking.admin.payer.accountId }
      : {}),
    ...(booking.admin?.payment.paymentId
      ? { paymentId: booking.admin.payment.paymentId }
      : {}),
    identityState: linked ? 'linked_guest' : 'unlinked_guest',
    serviceKind: 'lesson',
  };
}

export function guestFinanceRowFromEnrollment(
  enrollment: AdminCourseEnrollmentRosterItem
): AdminGuestFinanceRow | undefined {
  if (enrollment.guestState === 'not_guest') return undefined;
  const local = localDateTimeFromTimestamp(enrollment.updatedAt.seconds, resolveAdminTimeZone());
  return {
    id: enrollment.enrollmentId,
    label: enrollment.participant.displayName || enrollment.enrollmentId,
    status: enrollment.lifecycleStatus,
    amountKzt: enrollment.payment?.price ?? 0,
    date: local.date,
    time: local.time,
    ...(enrollment.payer?.accountId ? { payerAccountId: enrollment.payer.accountId } : {}),
    ...(enrollment.payment?.paymentId ? { paymentId: enrollment.payment.paymentId } : {}),
    identityState: enrollment.guestState === 'linked' ? 'linked_guest' : 'unlinked_guest',
    serviceKind: 'course_enrollment',
  };
}

export function guestFinanceRowsFromReadModels(
  lessons: readonly LessonBookingReadModel[],
  enrollments: readonly AdminCourseEnrollmentRosterItem[]
): AdminGuestFinanceRow[] {
  return [
    ...lessons.flatMap((lesson) => {
      const row = guestFinanceRowFromLesson(lesson);
      return row ? [row] : [];
    }),
    ...enrollments.flatMap((enrollment) => {
      const row = guestFinanceRowFromEnrollment(enrollment);
      return row ? [row] : [];
    }),
  ];
}
