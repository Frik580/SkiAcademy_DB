import type {
  AdminCourseEnrollmentRosterItem,
  PaymentStatus,
} from '@ski-academy/shared-domain';
import type { AdminLessonBookingListRowInput } from '../lesson-bookings/AdminLessonBookingUi';
import {
  courseEnrollmentOrigin,
  courseEnrollmentPrimaryStatus,
  courseLifecycleToPrimaryStatus,
} from '../course-enrollments/adminCourseEnrollmentPresentation';
import type { AdminTrainingRecord } from './adminTrainingRecordContracts';

export { courseLifecycleToPrimaryStatus };

export function courseOriginFromRecord(
  record: Extract<AdminTrainingRecord, { kind: 'course' }>
): 'guest' | 'account' | 'admin' | 'instructor' {
  return courseEnrollmentOrigin(record.data.guestState);
}

export function trainingRecordHasAlert(record: AdminTrainingRecord): boolean {
  if (record.kind === 'lesson') {
    const status = record.data.admin
      ? record.data.lifecycle.status
      : record.data.lifecycle.status;
    return (
      status === 'pending_cancellation' ||
      (record.data.admin?.payment.outstanding ?? 0) > 0 &&
        record.data.lifecycle.status === 'pending'
    );
  }
  return (
    record.data.relatedIssues.length > 0 ||
    record.data.lifecycleStatus === 'pending_cancellation' ||
    (record.data.payment?.outstanding ?? 0) > 0
  );
}

export function trainingPaymentStatus(
  record: AdminTrainingRecord
): PaymentStatus | undefined {
  if (record.kind === 'lesson') return record.data.admin?.payment.status;
  return record.data.payment?.status;
}

export function courseEnrollmentListCardInput(input: {
  readonly item: AdminCourseEnrollmentRosterItem;
  readonly kindLabel: string;
  readonly primaryStatusLabel: string;
  readonly originLabel: string;
  readonly paymentStatusLabel?: string;
  readonly recordedDaysLabel?: string;
  readonly instructor?: string;
}): AdminLessonBookingListRowInput & {
  readonly kindLabel: string;
  readonly trainingRecordId: string;
  readonly recordKind: 'course';
} {
  const primaryStatus = courseEnrollmentPrimaryStatus(input.item);
  const origin = courseEnrollmentOrigin(input.item.guestState);
  const paymentStatus = input.item.payment?.status;
  return {
    bookingId: input.item.enrollmentId,
    trainingRecordId: `course:${input.item.enrollmentId}`,
    recordKind: 'course',
    kindLabel: input.kindLabel,
    participantNames: input.item.participant.displayName,
    subtitle: input.item.course.title,
    ...(input.instructor ? { instructor: input.instructor } : {}),
    ...(input.recordedDaysLabel ? { meta: input.recordedDaysLabel } : {}),
    primaryStatus,
    primaryStatusLabel: input.primaryStatusLabel,
    ...(paymentStatus && input.paymentStatusLabel
      ? { paymentStatus, paymentStatusLabel: input.paymentStatusLabel }
      : {}),
    origin,
    originLabel: input.originLabel,
  };
}
