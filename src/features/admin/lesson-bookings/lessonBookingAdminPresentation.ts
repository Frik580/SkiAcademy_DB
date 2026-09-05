import type {
  LessonBookingAdminProjection,
  LessonBookingReadModel,
  PaymentStatus,
} from '@ski-academy/shared-domain';
import type { TranslationKey } from '../../../lib/i18n/translations';
import { ADMIN_ISSUE_KIND_LABEL_KEYS } from '../issues/adminIssuePresentation';

export type LessonAdminPrimaryStatusKind =
  | 'awaiting_payment'
  | 'pending'
  | 'confirmed'
  | 'pending_cancellation'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export const LESSON_ADMIN_PRIMARY_STATUS_KEYS: Record<
  LessonAdminPrimaryStatusKind,
  TranslationKey
> = {
  awaiting_payment: 'adminLessonStatusAwaitingPayment',
  pending: 'adminLessonStatusPending',
  confirmed: 'adminLessonStatusConfirmed',
  pending_cancellation: 'adminLessonStatusPendingCancellation',
  cancelled: 'adminLessonStatusCancelled',
  completed: 'adminLessonStatusCompleted',
  no_show: 'adminLessonStatusNoShow',
};

const UNPAID_PAYMENT_STATUSES = new Set<PaymentStatus>(['unpaid', 'partially_paid']);

export function isPendingUnpaidOutstanding(
  item: Pick<LessonBookingReadModel, 'lifecycle'> & {
    readonly admin?: Pick<LessonBookingAdminProjection, 'payment'>;
  }
): boolean {
  const payment = item.admin?.payment;
  return (
    item.lifecycle.status === 'pending' &&
    payment !== undefined &&
    payment.outstanding > 0 &&
    UNPAID_PAYMENT_STATUSES.has(payment.status)
  );
}

export function resolveLessonAdminPrimaryStatus(
  item: Pick<LessonBookingReadModel, 'lifecycle'> & {
    readonly admin?: Pick<LessonBookingAdminProjection, 'payment'>;
  }
): LessonAdminPrimaryStatusKind {
  if (isPendingUnpaidOutstanding(item)) return 'awaiting_payment';
  return item.lifecycle.status;
}

export function lessonAdminPrimaryStatusBadgeTone(
  kind: LessonAdminPrimaryStatusKind
): 'pending' | 'confirmed' | 'pending_cancellation' | 'cancelled' | 'completed' {
  if (kind === 'awaiting_payment') return 'pending';
  if (kind === 'no_show') return 'cancelled';
  return kind;
}

export const PAYMENT_STATUS_LABEL_KEYS: Record<PaymentStatus, TranslationKey> = {
  unpaid: 'paymentStatusUnpaid',
  partially_paid: 'paymentStatusPartiallyPaid',
  paid: 'paid',
  refunded: 'paymentStatusRefunded',
  partially_refunded: 'paymentStatusPartiallyRefunded',
};

export type LessonAdminPaymentPrimaryRowId = 'price' | 'paid' | 'outstanding';
export type LessonAdminPaymentAncillaryRowId =
  'original' | 'refunded' | 'retained' | 'settled' | 'writtenOff';

export const LESSON_ADMIN_PAYMENT_PRIMARY_ROW_KEYS: Record<
  LessonAdminPaymentPrimaryRowId,
  TranslationKey
> = {
  price: 'adminLessonPaymentPrice',
  paid: 'adminFinancePaid',
  outstanding: 'adminLessonPaymentRemaining',
};

export const LESSON_ADMIN_PAYMENT_ANCILLARY_ROW_KEYS: Record<
  LessonAdminPaymentAncillaryRowId,
  TranslationKey
> = {
  original: 'adminFinanceOriginalPrice',
  refunded: 'adminFinanceRefunded',
  retained: 'adminFinanceRetained',
  settled: 'adminFinanceSettled',
  writtenOff: 'adminFinanceWrittenOff',
};

export function lessonAdminPaymentPrimaryRows(
  payment: LessonBookingAdminProjection['payment']
): ReadonlyArray<{ readonly id: LessonAdminPaymentPrimaryRowId; readonly amount: number }> {
  return [
    { id: 'price', amount: payment.price },
    { id: 'paid', amount: payment.paid },
    { id: 'outstanding', amount: payment.outstanding },
  ];
}

export function lessonAdminPaymentAncillaryRows(
  payment: LessonBookingAdminProjection['payment']
): ReadonlyArray<{ readonly id: LessonAdminPaymentAncillaryRowId; readonly amount: number }> {
  const rows: Array<{ id: LessonAdminPaymentAncillaryRowId; amount: number }> = [];
  if (payment.originalPrice !== payment.price) {
    rows.push({ id: 'original', amount: payment.originalPrice });
  }
  if (payment.refunded > 0) rows.push({ id: 'refunded', amount: payment.refunded });
  if (payment.retained > 0) rows.push({ id: 'retained', amount: payment.retained });
  if (payment.settled > 0) rows.push({ id: 'settled', amount: payment.settled });
  if (payment.writtenOff > 0) rows.push({ id: 'writtenOff', amount: payment.writtenOff });
  return rows;
}

export function hasVisibleLessonAdminMutation(admin: LessonBookingAdminProjection): boolean {
  const actions = admin.authorizedActions;
  if (
    actions.canDirectCancel ||
    actions.canResolveCancellation ||
    actions.canResolveAttendanceOutcome ||
    actions.canLinkGuestToAccount
  ) {
    return true;
  }
  return (admin.attendance ?? []).some(
    (record) =>
      record.authorizedActions.canRecordPresent || record.authorizedActions.canRecordAbsent
  );
}

export function hasSchedulingPlannerHint(admin: LessonBookingAdminProjection): boolean {
  const actions = admin.authorizedActions;
  return actions.canReschedule || actions.canChangeInstructor || actions.canChangeDuration;
}

export type LessonAdminEmptyActionsReason = 'awaiting_confirmation' | 'neutral';

export function resolveLessonAdminEmptyActionsReason(
  item: LessonBookingReadModel
): LessonAdminEmptyActionsReason | undefined {
  const admin = item.admin;
  if (!admin) return undefined;
  if (hasVisibleLessonAdminMutation(admin) || hasSchedulingPlannerHint(admin)) return undefined;
  if (isPendingUnpaidOutstanding(item)) return 'awaiting_confirmation';
  return 'neutral';
}

export const LESSON_ADMIN_EMPTY_ACTIONS_KEYS: Record<
  LessonAdminEmptyActionsReason,
  TranslationKey
> = {
  awaiting_confirmation: 'adminLessonNoActionsAwaitingConfirmation',
  neutral: 'adminLessonNoActions',
};

export function shouldShowPayerRow(admin: LessonBookingAdminProjection): boolean {
  if (!admin.payer) return false;
  if (admin.participants.length !== 1) return true;
  return admin.payer.displayName !== admin.participants[0]?.displayName;
}

export function shouldShowCancellationSection(item: LessonBookingReadModel): boolean {
  const admin = item.admin;
  if (!admin) return false;
  return (
    item.lifecycle.status === 'pending_cancellation' ||
    admin.authorizedActions.canResolveCancellation ||
    admin.authorizedActions.canDirectCancel
  );
}

export function shouldShowOutcomeAction(admin: LessonBookingAdminProjection): boolean {
  return admin.authorizedActions.canResolveAttendanceOutcome;
}

export function shouldShowGuestSection(item: LessonBookingReadModel): boolean {
  return (
    item.bookingOrigin === 'guest' || Boolean(item.admin?.authorizedActions.canLinkGuestToAccount)
  );
}

export function attendanceUnavailableReason(item: LessonBookingReadModel): 'pending' | undefined {
  const records = item.admin?.attendance ?? [];
  const anyAllowed = records.some(
    (record) =>
      record.authorizedActions.canRecordPresent || record.authorizedActions.canRecordAbsent
  );
  if (anyAllowed) return undefined;
  if (item.lifecycle.status === 'pending') return 'pending';
  return undefined;
}

export function attendanceStatusLabelKey(status: 'present' | 'absent' | undefined): TranslationKey {
  if (status === 'present') return 'adminLessonAttendancePresent';
  if (status === 'absent') return 'adminLessonAttendanceAbsent';
  return 'adminLessonAttendanceMissing';
}

export function guestLinkUnavailableLabelKey(
  reason: LessonBookingAdminProjection['guestIdentityLinkUnavailableReason']
): TranslationKey {
  switch (reason) {
    case 'already_linked':
      return 'adminLessonLinkReasonAlreadyLinked';
    case 'not_guest':
      return 'adminLessonLinkReasonNotGuest';
    case 'ambiguous_guest_participant':
      return 'adminLessonLinkReasonAmbiguous';
    case 'expired_reservation':
      return 'adminLessonLinkReasonExpired';
    case 'attendance_recorded':
      return 'adminLessonLinkReasonAttendance';
    case 'admin_account_inactive':
      return 'adminLessonLinkReasonAdminInactive';
    default:
      return 'adminLessonLinkReasonIneligible';
  }
}

export function issueKindLabelKey(kind: keyof typeof ADMIN_ISSUE_KIND_LABEL_KEYS): TranslationKey {
  return ADMIN_ISSUE_KIND_LABEL_KEYS[kind];
}

export function issueSeverityLabelKey(severity: 'critical' | 'urgent' | 'normal'): TranslationKey {
  if (severity === 'critical') return 'adminIssueSeverityCritical';
  if (severity === 'urgent') return 'adminIssueSeverityUrgent';
  return 'adminIssueSeverityNormal';
}

export function issueStatusLabelKey(status: 'open' | 'resolved' | 'dismissed'): TranslationKey {
  if (status === 'open') return 'adminLessonIssueStatusOpen';
  if (status === 'resolved') return 'adminLessonIssueStatusResolved';
  return 'adminLessonIssueStatusDismissed';
}

export function needsSharedActionReason(admin: LessonBookingAdminProjection): boolean {
  if (admin.authorizedActions.canDirectCancel || admin.authorizedActions.canResolveCancellation) {
    return true;
  }
  return (admin.attendance ?? []).some(
    (record) =>
      record.authorizedActions.canRecordPresent || record.authorizedActions.canRecordAbsent
  );
}

export function trueAuthorizedActionKeys(admin: LessonBookingAdminProjection): readonly string[] {
  return Object.entries(admin.authorizedActions)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

export function formatLessonAdminDuration(
  durationMinutes: number,
  t: (key: TranslationKey) => string
): string {
  if (durationMinutes % 60 === 0) {
    return t('adminLessonDurationHours').replace('{n}', String(durationMinutes / 60));
  }
  return t('adminLessonDurationMinutes').replace('{n}', String(durationMinutes));
}
