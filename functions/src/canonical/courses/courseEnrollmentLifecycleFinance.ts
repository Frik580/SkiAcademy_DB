import {
  applyPriceDecrease,
  applyPriceIncrease,
  applyPriceIncreaseWithFunding,
  applyRefundDelta,
  applyWriteOffAmount,
  creditWalletBalance,
  debitWalletBalance,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  projectCourseCancellationFinancialEffects,
  resolveCourseEnrollmentRefundDestination,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CommandId,
  type CorrelationId,
  type CourseEnrollment,
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
  paymentPath,
  walletPath,
} from '../finance/financeStore';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';

export interface PlannedCourseEnrollmentCancellationFinance {
  readonly payment: Payment;
  readonly wallet?: Wallet;
  readonly monetaryEvents: readonly MonetaryEvent[];
  readonly refundDelta: KztMinorUnits;
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

export async function planCourseEnrollmentCancellationFinance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly envelope: CommandEnvelope;
    readonly enrollment: CourseEnrollment;
    readonly payment: Payment;
    readonly refundAmount: KztMinorUnits;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly decidedAt: CanonicalTimestamp;
    readonly manualExternalReference?: string;
  }
): Promise<PlannedCourseEnrollmentCancellationFinance> {
  try {
    const beforeFields = paymentAccountingFields(input.payment);
    const { payment: projected, refundDelta, writeOffDelta } =
      projectCourseCancellationFinancialEffects(beforeFields, input.refundAmount);

    const destination = resolveCourseEnrollmentRefundDestination(input.payment);
    const walletAccountId = input.payment.payerAccountId;
    const monetaryEvents: MonetaryEvent[] = [];
    let wallet: Wallet | undefined;
    let walletRevision: Wallet['revision'] | undefined;
    let paymentEventRevision = input.payment.eventRevision;
    let runningFields = beforeFields;

    if (refundDelta > 0) {
      const afterRefund = applyRefundDelta(runningFields, refundDelta);
      paymentEventRevision = nextAggregateRevision(paymentEventRevision);

      if (destination === 'wallet') {
        if (!walletAccountId) {
          throw new Error('Wallet refund requires Payment.payerAccountId');
        }
        const walletDocumentPath = walletPath(walletAccountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
        if (!wallet) {
          throw new Error('Wallet not found for refund destination');
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
          subjectType: 'course_enrollment',
          subjectId: input.enrollment.enrollmentId,
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
          subjectType: 'course_enrollment',
          subjectId: input.enrollment.enrollmentId,
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
        subjectType: 'course_enrollment',
        subjectId: input.enrollment.enrollmentId,
        paymentEffect: paymentEffectFromProjectionChange(runningFields, afterWriteOff),
        sourceKind: 'system',
        actor: monetaryActorFromEnvelope(input.envelope),
        commandId: input.commandId,
        correlationId: input.correlationId,
        paymentEventRevision,
        occurredAt: input.decidedAt,
        recordedAt: input.decidedAt,
      });
    }

    const paymentRevision = nextAggregateRevision(input.payment.revision);
    const payment = mergePaymentProjection(input.payment, projected, {
      revision: paymentRevision,
      eventRevision: paymentEventRevision,
      updatedAt: input.decidedAt,
    });

    session.plan.planMutation({
      path: paymentPath(input.payment.paymentId),
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
      monetaryEvents,
      refundDelta,
      paymentRevision,
      walletRevision,
    };
  } catch (error) {
    mapFinanceDomainError(input.envelope, error);
    throw error;
  }
}

export function commitPlannedCourseEnrollmentCancellationFinance(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedCourseEnrollmentCancellationFinance
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

export interface PlannedCourseEnrollmentTransferFinance {
  readonly payment: Payment;
  readonly wallet?: Wallet;
  readonly monetaryEvents: readonly MonetaryEvent[];
  readonly paymentRevision: Payment['revision'];
  readonly walletRevision?: Wallet['revision'];
  readonly includeWalletEffect: boolean;
}

export async function planCourseEnrollmentTransferFinance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly envelope: CommandEnvelope<'transfer_course_enrollment'>;
    readonly enrollment: CourseEnrollment;
    readonly payment: Payment;
    readonly newPrice: KztMinorUnits;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly decidedAt: CanonicalTimestamp;
    readonly fundingAmount?: KztMinorUnits;
    readonly walletAccountId?: Payment['payerAccountId'];
  }
): Promise<PlannedCourseEnrollmentTransferFinance | undefined> {
  if (input.newPrice === input.payment.price) {
    return undefined;
  }

  const before = paymentAccountingFields(input.payment);
  const destination = resolveCourseEnrollmentRefundDestination(input.payment);
  const walletAccountId = input.walletAccountId ?? input.payment.payerAccountId;

  if (input.newPrice < input.payment.price) {
    const decreasePreview = applyPriceDecrease(before, input.newPrice);
    if (
      decreasePreview.refundDelta > 0 &&
      destination === 'wallet' &&
      walletAccountId === undefined
    ) {
      throw new Error('Wallet account required for account-linked refund');
    }
  }

  const paymentRevision = nextAggregateRevision(input.payment.revision);
  let wallet: Wallet | undefined;
  let walletRevision: Wallet['revision'] | undefined;
  let includeWalletEffect = false;
  const monetaryEvents: MonetaryEvent[] = [];
  let paymentEventRevision = input.payment.eventRevision;
  const runningFields: PaymentAccountingProjection = {
    ...before,
    paymentStatus: input.payment.paymentStatus,
  };
  let projectedPayment: PaymentAccountingProjection = {
    ...before,
    paymentStatus: input.payment.paymentStatus,
  };

  const walletMutationNeeded =
    input.fundingAmount !== undefined ||
    (input.newPrice < input.payment.price &&
      applyPriceDecrease(before, input.newPrice).refundDelta > 0 &&
      destination === 'wallet' &&
      walletAccountId !== undefined);

  if (walletMutationNeeded && walletAccountId !== undefined) {
    const walletDocumentPath = walletPath(walletAccountId);
    const walletRead = await session.tx.get({ path: walletDocumentPath });
    session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
    wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
    if (!wallet) {
      throw new Error('Wallet not found for transfer finance');
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

  if (input.newPrice > input.payment.price) {
    const delta = KztMinorUnitsSchema.parse(input.newPrice - input.payment.price);
    const funded = KztMinorUnitsSchema.parse(input.fundingAmount ?? 0);
    projectedPayment =
      funded > 0
        ? applyPriceIncreaseWithFunding(before, delta, funded)
        : applyPriceIncrease(before, delta).payment;
    paymentEventRevision = nextAggregateRevision(paymentEventRevision);

    if (funded > 0 && wallet && walletAccountId) {
      const walletEventRevision = nextAggregateRevision(wallet.eventRevision);
      wallet = mergeWalletBalance(wallet, debitWalletBalance(wallet.balance, funded), {
        revision: walletRevision!,
        eventRevision: walletEventRevision,
        updatedAt: input.decidedAt,
      });
      monetaryEvents.push({
        eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
        eventKind: 'course_charge',
        currency: 'KZT',
        paymentId: input.payment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: input.enrollment.enrollmentId,
        walletAccountId,
        walletBalanceDelta: -funded,
        paymentEffect: paymentEffectFromProjectionChange(runningFields, projectedPayment),
        sourceKind: 'wallet',
        payerAccountIdAtEvent: walletAccountId,
        actor: monetaryActorFromEnvelope(input.envelope),
        commandId: input.commandId,
        correlationId: input.correlationId,
        paymentEventRevision,
        walletEventRevision,
        occurredAt: input.decidedAt,
        recordedAt: input.decidedAt,
      });
    }
  } else {
    const decreased = applyPriceDecrease(before, input.newPrice);
    projectedPayment = decreased.payment;
    paymentEventRevision = nextAggregateRevision(paymentEventRevision);

    if (decreased.refundDelta > 0 && destination === 'wallet' && wallet && walletAccountId) {
      const walletEventRevision = nextAggregateRevision(wallet.eventRevision);
      wallet = mergeWalletBalance(wallet, creditWalletBalance(wallet.balance, decreased.refundDelta), {
        revision: walletRevision!,
        eventRevision: walletEventRevision,
        updatedAt: input.decidedAt,
      });
      monetaryEvents.push({
        eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
        eventKind: 'refund_to_wallet',
        currency: 'KZT',
        paymentId: input.payment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: input.enrollment.enrollmentId,
        walletAccountId,
        walletBalanceDelta: decreased.refundDelta,
        paymentEffect: paymentEffectFromProjectionChange(runningFields, decreased.payment),
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
    } else if (decreased.refundDelta > 0) {
      monetaryEvents.push({
        eventId: monetaryEventIdFromCommandEffect(input.commandId, monetaryEvents.length),
        eventKind: 'manual_external_refund',
        currency: 'KZT',
        paymentId: input.payment.paymentId,
        subjectType: 'course_enrollment',
        subjectId: input.enrollment.enrollmentId,
        paymentEffect: paymentEffectFromProjectionChange(runningFields, decreased.payment),
        sourceKind: 'manual_external',
        refundDestinationKind: 'manual_external',
        manualReference: 'transfer_price_decrease',
        actor: monetaryActorFromEnvelope(input.envelope),
        commandId: input.commandId,
        correlationId: input.correlationId,
        paymentEventRevision,
        occurredAt: input.decidedAt,
        recordedAt: input.decidedAt,
      });
    }
  }

  const payment = mergePaymentProjection(input.payment, projectedPayment, {
    revision: paymentRevision,
    eventRevision: paymentEventRevision,
    updatedAt: input.decidedAt,
  });

  session.plan.planMutation({
    path: paymentPath(input.payment.paymentId),
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
    monetaryEvents,
    paymentRevision,
    walletRevision,
    includeWalletEffect,
  };
}

export function commitPlannedCourseEnrollmentTransferFinance(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedCourseEnrollmentTransferFinance
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
