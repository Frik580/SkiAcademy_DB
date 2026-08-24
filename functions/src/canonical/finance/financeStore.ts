import {
  AccountSchema,
  MonetaryEventSchema,
  PaymentSchema,
  ProviderEventReceiptSchema,
  WalletSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type Account,
  type MonetaryEvent,
  type Payment,
  type ProviderEventReceipt,
  type Wallet,
} from '@ski-academy/shared-domain';

export const FINANCE_PLANNING_ESTIMATES = {
  paymentBytes: 896,
  walletBytes: 256,
  monetaryEventBytes: 768,
  providerReceiptBytes: 512,
  accountBytes: 384,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function paymentPath(paymentId: Payment['paymentId']): string {
  return toTransactionPath(canonicalPaths.payment(paymentId));
}

export function walletPath(accountId: Wallet['accountId']): string {
  return toTransactionPath(canonicalPaths.wallet(accountId));
}

export function monetaryEventPath(eventId: MonetaryEvent['eventId']): string {
  return toTransactionPath(canonicalPaths.monetaryEvent(eventId));
}

export function providerEventReceiptPath(
  receiptId: ProviderEventReceipt['receiptId']
): string {
  return toTransactionPath(canonicalPaths.providerEventReceipt(receiptId));
}

export function accountPath(accountId: Account['accountId']): string {
  return toTransactionPath(canonicalPaths.account(accountId));
}

export function parsePayment(data: Record<string, unknown> | undefined): Payment | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = PaymentSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseWallet(data: Record<string, unknown> | undefined): Wallet | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = WalletSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseMonetaryEvent(
  data: Record<string, unknown> | undefined
): MonetaryEvent | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = MonetaryEventSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseProviderEventReceipt(
  data: Record<string, unknown> | undefined
): ProviderEventReceipt | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = ProviderEventReceiptSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseAccount(data: Record<string, unknown> | undefined): Account | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = AccountSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function readRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}

export function paymentAccountingFields(payment: Payment) {
  return {
    originalPrice: payment.originalPrice,
    price: payment.price,
    paidAmount: payment.paidAmount,
    refundedAmount: payment.refundedAmount,
    retainedAmount: payment.retainedAmount,
    settledAmount: payment.settledAmount,
    writtenOffAmount: payment.writtenOffAmount,
    outstandingAmount: payment.outstandingAmount,
  };
}

export function mergePaymentProjection(
  payment: Payment,
  projection: ReturnType<typeof paymentAccountingFields> & {
    readonly paymentStatus: Payment['paymentStatus'];
  },
  input: {
    readonly revision: Payment['revision'];
    readonly eventRevision: Payment['eventRevision'];
    readonly updatedAt: Payment['updatedAt'];
    readonly payerAccountId?: Payment['payerAccountId'];
  }
): Payment {
  return PaymentSchema.parse({
    ...payment,
    ...projection,
    payerAccountId: input.payerAccountId ?? payment.payerAccountId,
    revision: input.revision,
    eventRevision: input.eventRevision,
    updatedAt: input.updatedAt,
  });
}

export function mergeWalletBalance(
  wallet: Wallet,
  balance: Wallet['balance'],
  input: {
    readonly revision: Wallet['revision'];
    readonly eventRevision: Wallet['eventRevision'];
    readonly updatedAt: Wallet['updatedAt'];
  }
): Wallet {
  return WalletSchema.parse({
    ...wallet,
    balance,
    revision: input.revision,
    eventRevision: input.eventRevision,
    updatedAt: input.updatedAt,
  });
}

export function initialWallet(accountId: Wallet['accountId'], decidedAt: Wallet['createdAt']): Wallet {
  return WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance: 0,
    revision: 1,
    eventRevision: 0,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}
