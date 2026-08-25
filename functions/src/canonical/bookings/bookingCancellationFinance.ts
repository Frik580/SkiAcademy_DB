import {
  PaymentAccountingInvariantError,
  applyRefundDelta,
  applyWriteOffAmount,
  creditWalletBalance,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  projectCancellationFinancialEffects,
  refundableRetainedAmount,
  resolveRefundDestination,
  type Booking,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CommandId,
  type CorrelationId,
  type KztMinorUnits,
  type MonetaryEvent,
  type Payment,
  type Wallet,
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
  paymentPath,
  walletPath,
} from '../finance/financeStore';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';

export interface PlannedCancellationFinance {
  readonly payment: Payment;
  readonly wallet?: Wallet;
  readonly walletExists: boolean;
  readonly monetaryEvents: readonly MonetaryEvent[];
  readonly refundDelta: KztMinorUnits;
  readonly walletAccountId?: Payment['payerAccountId'];
  readonly paymentRevision: Payment['revision'];
  readonly walletRevision?: Wallet['revision'];
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

export function assertRefundWithinRetained(payment: Payment, refundAmount: KztMinorUnits): void {
  if (refundAmount > refundableRetainedAmount(payment)) {
    throw new PaymentAccountingInvariantError('Refund exceeds refundable retained funds');
  }
}

export async function planCancellationFinance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly envelope: CommandEnvelope;
    readonly booking: Booking;
    readonly payment: Payment;
    readonly refundAmount: KztMinorUnits;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly decidedAt: CanonicalTimestamp;
    readonly manualExternalReference?: string;
  }
): Promise<PlannedCancellationFinance> {
  try {
    const beforeFields = paymentAccountingFields(input.payment);
    const { payment: projected, refundDelta, writeOffDelta } = projectCancellationFinancialEffects(
      beforeFields,
      input.refundAmount
    );

    const destination = resolveRefundDestination({
      booking: input.booking,
      payment: input.payment,
    });
    const walletAccountId = input.booking.payerAccountId ?? input.payment.payerAccountId;
    const monetaryEvents: MonetaryEvent[] = [];
    let wallet: Wallet | undefined;
    let walletExists = false;
    let walletRevision: Wallet['revision'] | undefined;
    let paymentEventRevision = input.payment.eventRevision;
    let runningFields = beforeFields;

    if (refundDelta > 0) {
      const afterRefund = applyRefundDelta(runningFields, refundDelta);
      paymentEventRevision = nextAggregateRevision(paymentEventRevision);

      if (destination === 'wallet') {
        if (!walletAccountId) {
          throw new PaymentAccountingInvariantError('Wallet refund requires linked account');
        }
        const walletDocumentPath = walletPath(walletAccountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = wallet !== undefined;
        if (!wallet) {
          throw new PaymentAccountingInvariantError('Wallet not found for refund destination');
        }
        walletRevision = nextAggregateRevision(wallet.revision);
        const walletEventRevision = nextAggregateRevision(wallet.eventRevision);
        wallet = mergeWalletBalance(wallet, creditWalletBalance(wallet.balance, refundDelta), {
          revision: walletRevision,
          eventRevision: walletEventRevision,
          updatedAt: input.decidedAt,
        });
        session.plan.planMutation({
          path: walletDocumentPath,
          kind: 'update',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });

        monetaryEvents.push({
          eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
          eventKind: 'refund_to_wallet',
          currency: 'KZT',
          paymentId: input.payment.paymentId,
          subjectType: 'booking',
          subjectId: input.booking.bookingId,
          walletAccountId,
          walletBalanceDelta: refundDelta,
          paymentEffect: paymentEffectFromProjectionChange(runningFields, afterRefund),
          sourceKind: 'wallet',
          refundDestinationKind: 'wallet',
          refundAccountIdAtEvent: walletAccountId,
          payerAccountIdAtEvent: walletAccountId,
          actor: monetaryActorFromEnvelope(input.envelope),
          commandId: input.commandId,
          correlationId: input.correlationId,
          paymentEventRevision,
          walletEventRevision,
          occurredAt: input.decidedAt,
          recordedAt: input.decidedAt,
        });
      } else {
        monetaryEvents.push({
          eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
          eventKind: 'manual_external_refund',
          currency: 'KZT',
          paymentId: input.payment.paymentId,
          subjectType: 'booking',
          subjectId: input.booking.bookingId,
          paymentEffect: paymentEffectFromProjectionChange(runningFields, afterRefund),
          sourceKind: 'manual_external',
          refundDestinationKind: 'manual_external',
          manualReference: input.manualExternalReference ?? 'external_refund',
          actor: monetaryActorFromEnvelope(input.envelope),
          commandId: input.commandId,
          correlationId: input.correlationId,
          paymentEventRevision,
          occurredAt: input.decidedAt,
          recordedAt: input.decidedAt,
        });
      }
      runningFields = afterRefund;
    }

    if (writeOffDelta > 0) {
      const afterWriteOff = applyWriteOffAmount(runningFields, writeOffDelta);
      paymentEventRevision = nextAggregateRevision(paymentEventRevision);
      monetaryEvents.push({
        eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
        eventKind: 'write_off',
        currency: 'KZT',
        paymentId: input.payment.paymentId,
        subjectType: 'booking',
        subjectId: input.booking.bookingId,
        paymentEffect: paymentEffectFromProjectionChange(runningFields, afterWriteOff),
        sourceKind: 'system',
        actor: monetaryActorFromEnvelope(input.envelope),
        commandId: input.commandId,
        correlationId: input.correlationId,
        paymentEventRevision,
        occurredAt: input.decidedAt,
        recordedAt: input.decidedAt,
      });
      runningFields = afterWriteOff;
    }

    const paymentRevision = nextAggregateRevision(input.payment.revision);
    const payment = mergePaymentProjection(input.payment, projected, {
      revision: paymentRevision,
      eventRevision: paymentEventRevision,
      updatedAt: input.decidedAt,
    });

    const paymentDocumentPath = paymentPath(input.payment.paymentId);
    session.plan.planMutation({
      path: paymentDocumentPath,
      kind: 'update',
      category: 'payment_wallet',
      estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
    });

    for (const event of monetaryEvents) {
      session.plan.planMutation({
        path: monetaryEventPath(event.eventId),
        kind: 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
      });
    }

    return {
      payment,
      wallet,
      walletExists,
      monetaryEvents,
      refundDelta,
      walletAccountId,
      paymentRevision,
      walletRevision,
    };
  } catch (error) {
    mapFinanceDomainError(input.envelope, error);
    throw error;
  }
}

export function commitPlannedCancellationFinanceEffects(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedCancellationFinance
): void {
  session.tx.update(
    { path: paymentPath(planned.payment.paymentId) },
    financeToFirestoreWritePayload(planned.payment as Record<string, unknown>)
  );
  if (planned.wallet) {
    session.tx.update(
      { path: walletPath(planned.wallet.accountId) },
      financeToFirestoreWritePayload(planned.wallet as Record<string, unknown>)
    );
  }
  for (const event of planned.monetaryEvents) {
    session.tx.create(
      { path: monetaryEventPath(event.eventId) },
      financeToFirestoreWritePayload(event as Record<string, unknown>)
    );
  }
}
