import type {
  AdminCourseEnrollmentDetailReadModel,
  AdminCourseEnrollmentRosterItem,
  PaymentStatus,
} from '@ski-academy/shared-domain';
import type { LessonAdminPrimaryStatusKind } from '../lesson-bookings/lessonBookingAdminPresentation';
import type { AdminCourseEnrollmentCopy } from './useAdminCourseEnrollmentTranslations';

type CourseCopy = AdminCourseEnrollmentCopy;

export type CourseEnrollmentGuestState = AdminCourseEnrollmentRosterItem['guestState'];

export function courseLifecycleToPrimaryStatus(
  lifecycle: string,
  outstanding?: number
): LessonAdminPrimaryStatusKind {
  if (lifecycle === 'pending' && (outstanding ?? 0) > 0) return 'awaiting_payment';
  if (lifecycle === 'pending') return 'pending';
  if (lifecycle === 'confirmed') return 'confirmed';
  if (lifecycle === 'pending_cancellation') return 'pending_cancellation';
  if (lifecycle === 'completed') return 'completed';
  if (lifecycle === 'no_show') return 'no_show';
  return 'cancelled';
}

export function isCourseEnrollmentAwaitingPayment(
  item: Pick<AdminCourseEnrollmentRosterItem, 'lifecycleStatus' | 'payment'>
): boolean {
  return item.lifecycleStatus === 'pending' && (item.payment?.outstanding ?? 0) > 0;
}

export function courseEnrollmentPrimaryStatus(
  item: Pick<AdminCourseEnrollmentRosterItem, 'lifecycleStatus' | 'payment'>
): LessonAdminPrimaryStatusKind {
  return courseLifecycleToPrimaryStatus(item.lifecycleStatus, item.payment?.outstanding);
}

export function courseEnrollmentOrigin(
  guestState: CourseEnrollmentGuestState
): 'guest' | 'account' {
  return guestState === 'not_guest' ? 'account' : 'guest';
}

export function courseEnrollmentStatusLabel(
  status: LessonAdminPrimaryStatusKind,
  t: CourseCopy
): string {
  switch (status) {
    case 'awaiting_payment':
      return t.statusAwaitingPayment;
    case 'pending':
      return t.statusPending;
    case 'confirmed':
      return t.statusConfirmed;
    case 'pending_cancellation':
      return t.statusPendingCancellation;
    case 'cancelled':
      return t.statusCancelled;
    case 'completed':
      return t.statusCompleted;
    case 'no_show':
      return t.statusNoShow;
    default:
      return t.statusConfirmed;
  }
}

export function courseEnrollmentPaymentStatusLabel(status: PaymentStatus, t: CourseCopy): string {
  switch (status) {
    case 'unpaid':
      return t.paymentUnpaid;
    case 'partially_paid':
      return t.paymentPartiallyPaid;
    case 'paid':
      return t.paymentPaid;
    case 'refunded':
      return t.paymentRefundedStatus;
    case 'partially_refunded':
      return t.paymentPartiallyRefunded;
    default:
      return t.paymentUnpaid;
  }
}

export function courseEnrollmentGuestStateLabel(
  guestState: CourseEnrollmentGuestState,
  t: CourseCopy
): string {
  if (guestState === 'linked') return t.guestStateLinked;
  if (guestState === 'pending_unlinked') return t.guestStateUnlinked;
  return t.guestStateAccount;
}

export function courseEnrollmentAttendanceStatusLabel(
  status: 'present' | 'absent' | undefined,
  t: CourseCopy
): string {
  if (status === 'present') return t.attendancePresent;
  if (status === 'absent') return t.attendanceAbsent;
  return t.attendanceMissing;
}

export function shouldShowCourseCancellationSection(
  detail: AdminCourseEnrollmentDetailReadModel
): boolean {
  return (
    detail.lifecycleStatus === 'pending_cancellation' ||
    detail.authorizedActions.canResolveCancellation ||
    detail.authorizedActions.canCancelUnpaidGuest
  );
}

export function shouldShowCourseGuestSection(
  detail: Pick<AdminCourseEnrollmentRosterItem, 'guestState' | 'authorizedActions'>
): boolean {
  return detail.guestState !== 'not_guest' || detail.authorizedActions.canLinkGuest;
}

export function formatCourseEnrollmentDate(seconds: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(seconds * 1_000));
}

export function formatCourseEnrollmentInstant(
  value: { seconds: number; nanoseconds: number },
  locale: string
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value.seconds * 1_000));
}

export function courseEnrollmentScheduleRange(
  detail: Pick<AdminCourseEnrollmentDetailReadModel, 'attendanceDays'>,
  locale: string
): string | undefined {
  const days = detail.attendanceDays ?? [];
  if (days.length === 0) return undefined;
  const starts = days.map((day) => day.startsAt.seconds).sort((left, right) => left - right);
  const first = starts[0];
  const last = starts[starts.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const firstLabel = formatCourseEnrollmentDate(first, locale);
  const lastLabel = formatCourseEnrollmentDate(last, locale);
  return firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`;
}

export function courseEnrollmentHeaderSubtitle(
  detail: Pick<AdminCourseEnrollmentDetailReadModel, 'course' | 'attendanceDays'>,
  locale: string
): string {
  const range = courseEnrollmentScheduleRange(detail, locale);
  return range ? `${detail.course.title} · ${range}` : detail.course.title;
}

export function courseEnrollmentPaymentPrimaryRows(
  payment: NonNullable<AdminCourseEnrollmentRosterItem['payment']>
): ReadonlyArray<{ readonly id: 'price' | 'paid' | 'outstanding'; readonly amount: number }> {
  return [
    { id: 'price', amount: payment.price },
    { id: 'paid', amount: payment.paid },
    { id: 'outstanding', amount: payment.outstanding },
  ];
}

export function courseEnrollmentPaymentAncillaryRows(
  payment: NonNullable<AdminCourseEnrollmentRosterItem['payment']>
): ReadonlyArray<{
  readonly id: 'refunded' | 'retained' | 'settled' | 'writtenOff';
  readonly amount: number;
}> {
  const rows: Array<{
    id: 'refunded' | 'retained' | 'settled' | 'writtenOff';
    amount: number;
  }> = [];
  if (payment.refunded > 0) rows.push({ id: 'refunded', amount: payment.refunded });
  if (payment.retained > 0) rows.push({ id: 'retained', amount: payment.retained });
  if (payment.settled > 0) rows.push({ id: 'settled', amount: payment.settled });
  if (payment.writtenOff > 0) rows.push({ id: 'writtenOff', amount: payment.writtenOff });
  return rows;
}

export function trueCourseAuthorizedActionKeys(
  detail: Pick<AdminCourseEnrollmentDetailReadModel, 'authorizedActions'>
): readonly string[] {
  return Object.entries(detail.authorizedActions)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}
