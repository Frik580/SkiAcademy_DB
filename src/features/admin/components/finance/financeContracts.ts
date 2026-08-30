import {
  AccountIdSchema,
  KztMinorUnitsSchema,
  PaymentIdSchema,
  IdempotencyKeySchema,
  type AccountId,
  type AdminPaymentAction,
  type AdminPaymentDetailReadModel,
  type AdminMonetaryEventPresentation,
  type AdminWalletReadModel,
  type CommandEnvelope,
  type KztMinorUnits,
  type PaymentId,
} from '@ski-academy/shared-domain';
import type { Booking, UserProfile } from '../../../../types';

export type CashFlowClient = Pick<
  UserProfile,
  'uid' | 'displayName' | 'email' | 'balanceUSD' | 'walletBalances'
>;

export type CashFlowBooking = Pick<
  Booking,
  | 'id'
  | 'userId'
  | 'isGuest'
  | 'isDeleted'
  | 'status'
  | 'totalPrice'
  | 'createdAt'
  | 'guestName'
  | 'instructorName'
>;

export type AdminFinanceAccountOption = Pick<UserProfile, 'uid' | 'displayName' | 'email'>;
export type AdminFinanceAccountId = AccountId;
export type AdminFinancePaymentId = PaymentId;
export type AdminWalletView = AdminWalletReadModel;
export type AdminPaymentView = AdminPaymentDetailReadModel;
export type AdminPaymentAllowedAction = AdminPaymentAction;
export type AdminMonetaryEventView = AdminMonetaryEventPresentation;
export type ManualWalletFundingIntent = CommandEnvelope<'record_manual_wallet_funding'>['intent'];
export type FinancialCorrectionIntent = CommandEnvelope<'record_financial_correction'>['intent'];
export type AuditCorrectionIntent = CommandEnvelope<'record_audit_correction'>['intent'];

export function parseAdminFinanceAccountId(value: string) {
  const parsed = AccountIdSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : undefined;
}

export function parseAdminFinancePaymentId(value: string) {
  const parsed = PaymentIdSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : undefined;
}

export function parseKztAmountToCanonicalUnits(value: string): KztMinorUnits | undefined {
  // Canonical producers currently persist whole KZT (for example, 25_000 means ₸25,000).
  // Keep the historical KztMinorUnits type at the boundary without introducing a ×100 scale.
  const match = /^(\d+)$/.exec(value.trim());
  if (!match) return undefined;
  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole)) return undefined;
  const parsed = KztMinorUnitsSchema.safeParse(whole);
  return parsed.success && parsed.data > 0 ? parsed.data : undefined;
}

export function createAdminFinanceAttemptId(action: string) {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return IdempotencyKeySchema.parse(`admin_finance:${action}:${entropy}`);
}
