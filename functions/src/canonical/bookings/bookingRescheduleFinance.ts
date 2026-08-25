import {
  applyPriceDecrease,
  applyPriceIncrease,
  applyPriceIncreaseWithFunding,
  creditWalletBalance,
  debitWalletBalance,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  resolveRefundDestination,
  type Booking,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CommandId,
  type CorrelationId,
  type KztMinorUnits,
  type MonetaryEvent,
  type Payment,
  type PaymentAccountingProjection,
  type Wallet,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { mapFinanceDomainError } from '../finance/financeAuthorization';
import {
  FINANCE_PLANNING_ESTIMATES,
  mergePaymentProjection,
  mergeWalletBalance,
  monetaryEventPath,
  parseWallet,
  paymentAccountingFields,
  walletPath,
} from '../finance/financeStore';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';

export interface PlannedServicePriceChangeFinance {
  readonly payment: Payment;
  readonly wallet?: Wallet;
  readonly walletExists: boolean;
  readonly monetaryEvents: readonly MonetaryEvent[];
  readonly walletAccountId?: Payment['payerAccountId'];
  readonly paymentRevision: Payment['revision'];
  readonly walletRevision?: Wallet['revision'];
  readonly includeWalletEffect: boolean;
}

function monetaryActorFromEnvelope(envelope: CommandEnvelope) {
  const actor = envelope.context.actor;
  if (actor.kind === 'account') {
    return { kind: 'account' as const, accountId: actor.accountId };
  }
  if (actor.kind === 'provider') {
    return { kind: 'provider' as const, providerId: actor.providerId };
  }
  if (actor.kind === 'system') {
    return { kind: 'system' as const, systemActorId: actor.systemActorId };
  }
  return { kind: 'guest' as const, guestSubjectId: actor.guestSubjectId };
}

export async function planServicePriceChangeFinance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly envelope: CommandEnvelope<'change_booking_instructor' | 'change_booking_duration'>;
    readonly booking: Booking;
    readonly payment: Payment;
    readonly newPrice: KztMinorUnits;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly decidedAt: CanonicalTimestamp;
    readonly fundingAmount?: KztMinorUnits;
    readonly walletAccountId?: Payment['payerAccountId'];
  }
): Promise<PlannedServicePriceChangeFinance | undefined> {
  if (input.newPrice === input.payment.price) {
    return undefined;
  }

  const before = paymentAccountingFields(input.payment);
  const refundDestination = resolveRefundDestination({
    booking: input.booking,
    payment: input.payment,
  });
  const walletAccountId =
    input.walletAccountId ?? input.booking.payerAccountId ?? input.payment.payerAccountId;

  if (input.newPrice < input.payment.price) {
    const decreasePreview = applyPriceDecrease(before, input.newPrice);
    if (decreasePreview.refundDelta > 0 && refundDestination === 'wallet' && walletAccountId === undefined) {
      throw new Error('Wallet account required for account-linked refund');
    }
  }

  const paymentRevision = nextAggregateRevision(input.payment.revision);
  const stagedEventId = monetaryEventIdFromCommandEffect(input.commandId, 0);

  let wallet: Wallet | undefined;
  let walletExists = false;
  let walletRevision: Wallet['revision'] | undefined;
  let includeWalletEffect = false;

  const walletMutationNeeded =
    input.fundingAmount !== undefined ||
    (input.newPrice < input.payment.price &&
      applyPriceDecrease(before, input.newPrice).refundDelta > 0 &&
      refundDestination === 'wallet' &&
      walletAccountId !== undefined);

  if (walletMutationNeeded && walletAccountId !== undefined) {
    const walletDocumentPath = walletPath(walletAccountId);
    const walletRead = await session.tx.get({ path: walletDocumentPath });
    session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
    wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
    walletExists = walletRead.exists;
    if (!walletExists || !wallet) {
      throw new Error('Wallet not found for service price change');
    }
    includeWalletEffect = true;
    walletRevision = nextAggregateRevision(wallet.revision);
    session.plan.planMutation({
      path: walletDocumentPath,
      kind: 'update',
      category: 'payment_wallet',
      estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
    });
  }

  session.plan.planMutation({
    path: `payments/${input.payment.paymentId}`,
    kind: 'update',
    category: 'payment_wallet',
    estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
  });
  session.plan.planMutation({
    path: monetaryEventPath(stagedEventId),
    kind: 'create',
    category: 'payment_wallet',
    estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
  });

  return {
    payment: input.payment,
    wallet,
    walletExists,
    monetaryEvents: [],
    walletAccountId,
    paymentRevision,
    includeWalletEffect,
    walletRevision,
  };
}

export function commitPlannedServicePriceChangeFinance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly envelope: CommandEnvelope<'change_booking_instructor' | 'change_booking_duration'>;
    readonly booking: Booking;
    readonly payment: Payment;
    readonly newPrice: KztMinorUnits;
    readonly planned: PlannedServicePriceChangeFinance;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly decidedAt: CanonicalTimestamp;
    readonly fundingAmount?: KztMinorUnits;
  }
): { readonly payment: Payment; readonly monetaryEvents: readonly MonetaryEvent[] } {
  try {
    const before = paymentAccountingFields(input.payment);
    let projection!: PaymentAccountingProjection;
    let walletBalanceDelta: KztMinorUnits | undefined;
    const refundDestination = resolveRefundDestination({
      booking: input.booking,
      payment: input.payment,
    });
    const walletAccountId = input.planned.walletAccountId;

    if (input.newPrice > input.payment.price) {
      const delta = KztMinorUnitsSchema.parse(input.newPrice - input.payment.price);
      if (input.fundingAmount !== undefined && input.planned.wallet !== undefined) {
        debitWalletBalance(input.planned.wallet.balance, input.fundingAmount);
        projection = applyPriceIncreaseWithFunding(before, delta, input.fundingAmount);
        walletBalanceDelta = KztMinorUnitsSchema.parse(-input.fundingAmount);
      } else {
        projection = applyPriceIncrease(before, delta).payment;
      }
    } else {
      const decrease = applyPriceDecrease(before, input.newPrice);
      projection = decrease.payment;
      if (decrease.refundDelta > 0 && refundDestination === 'wallet' && input.planned.wallet !== undefined) {
        walletBalanceDelta = decrease.refundDelta;
      }
    }

    const paymentEventRevision = nextAggregateRevision(input.payment.eventRevision);
    const updatedPayment = mergePaymentProjection(input.payment, projection, {
      revision: input.planned.paymentRevision,
      eventRevision: paymentEventRevision,
      updatedAt: input.decidedAt,
    });

    const stagedEventId = monetaryEventIdFromCommandEffect(input.commandId, 0);
    const monetaryEvent: MonetaryEvent = {
      eventId: stagedEventId,
      eventKind:
        input.newPrice < input.payment.price && projection.refundedAmount > before.refundedAmount
          ? 'refund_to_wallet'
          : 'admin_price_adjustment',
      currency: 'KZT',
      paymentId: input.payment.paymentId,
      subjectType: input.payment.subjectType,
      subjectId: input.payment.subjectId,
      paymentEffect: paymentEffectFromProjectionChange(before, projection),
      sourceKind:
        walletBalanceDelta !== undefined && walletBalanceDelta > 0 ? 'wallet' : 'manual_external',
      ...(walletAccountId === undefined ? {} : { payerAccountIdAtEvent: walletAccountId }),
      ...(walletBalanceDelta === undefined
        ? {}
        : { walletAccountId, walletBalanceDelta }),
      actor: monetaryActorFromEnvelope(input.envelope),
      commandId: input.commandId,
      correlationId: input.correlationId,
      paymentEventRevision,
      ...(walletBalanceDelta !== undefined && input.planned.wallet !== undefined
        ? { walletEventRevision: nextAggregateRevision(input.planned.wallet.eventRevision) }
        : {}),
      occurredAt: input.decidedAt,
      recordedAt: input.decidedAt,
    };

    session.tx.update(
      { path: `payments/${input.payment.paymentId}` },
      financeToFirestoreWritePayload(updatedPayment as Record<string, unknown>)
    );
    session.tx.create(
      { path: monetaryEventPath(stagedEventId) },
      financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
    );

    if (
      input.planned.includeWalletEffect &&
      walletBalanceDelta !== undefined &&
      input.planned.wallet !== undefined &&
      walletAccountId !== undefined
    ) {
      const updatedWallet =
        walletBalanceDelta > 0
          ? creditWalletBalance(input.planned.wallet.balance, walletBalanceDelta)
          : debitWalletBalance(input.planned.wallet.balance, KztMinorUnitsSchema.parse(-walletBalanceDelta));
      const mergedWallet = mergeWalletBalance(input.planned.wallet, updatedWallet, {
        revision: input.planned.walletRevision!,
        eventRevision: nextAggregateRevision(input.planned.wallet.eventRevision),
        updatedAt: input.decidedAt,
      });
      session.tx.update(
        { path: walletPath(walletAccountId) },
        financeToFirestoreWritePayload(mergedWallet as Record<string, unknown>)
      );
    }

    return { payment: updatedPayment, monetaryEvents: [monetaryEvent] };
  } catch (error) {
    mapFinanceDomainError(input.envelope, error);
    throw error;
  }
}
