import type {
  AdminIssueBlockingCondition,
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
