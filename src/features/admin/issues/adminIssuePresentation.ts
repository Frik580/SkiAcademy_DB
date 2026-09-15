import type {
  AdminIssueBlockingCondition,
  AdminIssueDetailReadModel,
  AdminIssueInboxItem,
  AdminIssueKind,
  AdminIssueResolutionGuidance,
} from '@ski-academy/shared-domain';
import type { TranslationKey } from '../../../lib/i18n/translations';

export const ADMIN_ISSUE_KIND_LABEL_KEYS: Record<AdminIssueKind, TranslationKey> = {
  missing_attendance: 'adminIssueKindMissingAttendance',
  payment_required_at_start: 'adminIssueKindPaymentRequiredAtStart',
  unresolved_pending_cancellation: 'adminIssueKindUnresolvedPendingCancellation',
  attendance_payment_conflict: 'adminIssueKindAttendancePaymentConflict',
  resource_reconciliation_mismatch: 'adminIssueKindResourceReconciliationMismatch',
  financial_reconciliation_mismatch: 'adminIssueKindFinancialReconciliationMismatch',
  outcome_correction_required: 'adminIssueKindOutcomeCorrectionRequired',
};

export const ADMIN_ISSUE_GUIDANCE_KEYS: Record<AdminIssueResolutionGuidance, TranslationKey> = {
  record_attendance: 'adminIssueGuidanceRecordAttendance',
  fund_payment: 'adminIssueGuidanceFundPayment',
  resolve_cancellation: 'adminIssueGuidanceResolveCancellation',
  reconcile_subject: 'adminIssueGuidanceReconcileSubject',
  correct_finance: 'adminIssueGuidanceCorrectFinance',
  correct_attendance_outcome: 'adminIssueGuidanceCorrectAttendanceOutcome',
};

export const ADMIN_ISSUE_BLOCKING_KEYS: Record<AdminIssueBlockingCondition, TranslationKey> = {
  none: 'adminIssueBlockingNone',
  outcome: 'adminIssueBlockingOutcome',
  delivery: 'adminIssueBlockingDelivery',
  outcome_and_delivery: 'adminIssueBlockingOutcomeAndDelivery',
};

export const ADMIN_ISSUE_INBOX_CATEGORIES = [
  'attendance',
  'payment',
  'cancellation',
  'reconciliation',
  'change_request',
  'guest',
] as const;

export type AdminIssueInboxCategory = (typeof ADMIN_ISSUE_INBOX_CATEGORIES)[number];

export const ADMIN_ISSUE_CATEGORY_LABEL_KEYS: Record<AdminIssueInboxCategory, TranslationKey> = {
  attendance: 'adminIssueCategoryAttendance',
  payment: 'adminIssueCategoryPayment',
  cancellation: 'adminIssueCategoryCancellation',
  reconciliation: 'adminIssueCategoryReconciliation',
  change_request: 'adminIssueCategoryChangeRequest',
  guest: 'adminIssueCategoryGuest',
};

export type AdminIssuePrimaryDestination = 'lesson' | 'enrollment' | 'payment' | 'change_request';

export const ADMIN_ISSUE_PRIMARY_DESTINATION_KEYS: Record<
  AdminIssuePrimaryDestination,
  TranslationKey
> = {
  lesson: 'adminIssueOpenLesson',
  enrollment: 'adminIssueOpenEnrollment',
  payment: 'adminIssueCheckPayment',
  change_request: 'adminIssueReviewRequest',
};

const PAYMENT_PRIMARY_KINDS = new Set<AdminIssueKind>([
  'payment_required_at_start',
  'financial_reconciliation_mismatch',
  'attendance_payment_conflict',
]);

export function adminIssueInboxCategory(
  issue: Pick<AdminIssueInboxItem, 'kind'>
): Exclude<AdminIssueInboxCategory, 'change_request' | 'guest'> {
  switch (issue.kind) {
    case 'missing_attendance':
    case 'outcome_correction_required':
      return 'attendance';
    case 'payment_required_at_start':
    case 'attendance_payment_conflict':
      return 'payment';
    case 'unresolved_pending_cancellation':
      return 'cancellation';
    case 'resource_reconciliation_mismatch':
    case 'financial_reconciliation_mismatch':
      return 'reconciliation';
  }
}

export function adminIssueMatchesCategory(
  issue: Pick<AdminIssueInboxItem, 'kind' | 'presentationOrigin'>,
  category: AdminIssueInboxCategory
): boolean {
  if (category === 'guest') return issue.presentationOrigin === 'guest';
  if (category === 'change_request') return false;
  return adminIssueInboxCategory(issue) === category;
}

export function adminIssuePrimaryDestination(
  issue: Pick<AdminIssueInboxItem, 'kind' | 'subjectRef'> &
    Partial<Pick<AdminIssueDetailReadModel, 'payment'>>
): Exclude<AdminIssuePrimaryDestination, 'change_request'> {
  if (PAYMENT_PRIMARY_KINDS.has(issue.kind) && issue.payment) return 'payment';
  return issue.subjectRef.subjectKind === 'booking' ? 'lesson' : 'enrollment';
}

export function adminIssueHasGuestPresentation(
  items: readonly Pick<AdminIssueInboxItem, 'presentationOrigin'>[]
): boolean {
  return items.some((item) => item.presentationOrigin === 'guest');
}

export function adminIssueSearchHaystack(
  issue: Pick<AdminIssueInboxItem, 'kind' | 'subjectDisplayName' | 'courseTitle'>
): string {
  return [issue.kind, issue.subjectDisplayName, issue.courseTitle]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}
