import type { PaymentStatus } from '@ski-academy/shared-domain';
import type { LessonAdminPrimaryStatusKind } from '../lesson-bookings/lessonBookingAdminPresentation';
import type { AdminTrainingRecord } from './adminTrainingRecordContracts';

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

export function courseOriginFromRecord(
  record: Extract<AdminTrainingRecord, { kind: 'course' }>
): 'guest' | 'account' | 'admin' | 'instructor' {
  return record.data.guestState === 'not_guest' ? 'account' : 'guest';
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
