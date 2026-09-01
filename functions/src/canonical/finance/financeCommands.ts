import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  InsufficientWalletFundsError,
  PaymentAccountingInvariantError,
  applyExternalPaymentFunding,
  applyPriceDecrease,
  applyPriceIncrease,
  applyPriceIncreaseWithFunding,
  buildProviderEventReceipt,
  commandErrorResult,
  commandSuccessResult,
  creditWalletBalance,
  debitWalletBalance,
  CourseEnrollmentIdSchema,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  providerEventReceiptIdFromProviderEvent,
  providerReceiptMatchesEvent,
  resolveCommandIdempotencyIdentity,
  isPaymentFullyFundedForService,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type MonetaryEvent,
  type Payment,
  type PaymentAccountingProjection,
  type Wallet,
  type AdminIssue,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import { toFirestoreWritePayload as toAdminIssueWritePayload } from '../adminIssues';
import { planCourseEnrollmentPaymentStartIssueResolutionIfFullyFunded } from '../courses/courseEnrollmentPaymentStartIssueResolution';
import { courseEnrollmentPath, parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { coursePath, parseCourse } from '../courses/courseStore';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  createFinanceCorrectionCommandHandlers,
  reconcileGuestConfirmationLifecycleMismatchAfterCommand,
  type MonetaryEventLoader,
} from './financeCorrectionCommands';
import { assertFinanceAuthorization, mapFinanceDomainError } from './financeAuthorization';
import {
  buildAdjustServicePriceAuditPlan,
  buildManualWalletFundingAuditPlan,
  buildProviderPaymentEventAuditPlan,
} from './financeAudit';
import {
  FINANCE_PLANNING_ESTIMATES,
  accountPath,
  initialWallet,
  mergePaymentProjection,
  mergeWalletBalance,
  monetaryEventPath,
  parseAccount,
  parsePayment,
  parseProviderEventReceipt,
  parseWallet,
  paymentAccountingFields,
  paymentPath,
  providerEventReceiptPath,
  toFirestoreWritePayload,
  walletPath,
} from './financeStore';
import {
  planGuestPaymentConfirmation,
  resolveFinanceGuestPaymentConfirmationEffect,
  type PlannedGuestPaymentConfirmation,
} from '../guestConfirmation/guestPaymentConfirmation';
import { mergeGuestPaymentConfirmationAuditPlan } from '../guestConfirmation/guestPaymentConfirmationAudit';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(envelope: CommandEnvelope): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
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

function stageMonetaryEventCreate(
  session: Parameters<
    AuthoritativeIdempotentCanonicalCommandHandler<'record_manual_wallet_funding'>['execute']
  >[0],
  event: MonetaryEvent
): void {
  session.tx.create(
    { path: monetaryEventPath(event.eventId) },
    toFirestoreWritePayload(event as Record<string, unknown>)
  );
  session.plan.planMutation({
    path: monetaryEventPath(event.eventId),
    kind: 'create',
    category: 'payment_wallet',
    estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
  });
}

function recordManualWalletFundingHandler(
  envelope: CommandEnvelope<'record_manual_wallet_funding'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_manual_wallet_funding'>> {
  assertFinanceAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const walletDocumentPath = walletPath(envelope.intent.accountId);
  const accountDocumentPath = accountPath(envelope.intent.accountId);

  let existingWallet: Wallet | undefined;
  let walletExists = false;
  let plannedWalletRevision = AggregateRevisionSchema.parse(1);
  let plannedEventRevision = AggregateRevisionSchema.parse(0);
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_manual_wallet_funding'> = {
    read: async (session) => {
      const accountRead = await session.tx.get({ path: accountDocumentPath });
      session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account || account.lifecycle.status !== 'active') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const walletRead = await session.tx.get({ path: walletDocumentPath });
      session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
      existingWallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
      walletExists = walletRead.exists;
      plannedWalletRevision = walletExists
        ? nextAggregateRevision(existingWallet!.revision)
        : AggregateRevisionSchema.parse(1);
      plannedEventRevision = walletExists
        ? nextAggregateRevision(existingWallet!.eventRevision)
        : AggregateRevisionSchema.parse(1);

      session.plan.planMutation({
        path: walletDocumentPath,
        kind: walletExists ? 'update' : 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
      });
      session.plan.planMutation({
        path: monetaryEventPath(stagedEventId),
        kind: 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
      });
    },
    planAuditOutbox: async () =>
      buildManualWalletFundingAuditPlan({
        envelope,
        monetaryEventIds: [stagedEventId],
        accountId: envelope.intent.accountId,
        walletRevision: plannedWalletRevision,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const wallet = existingWallet ?? initialWallet(envelope.intent.accountId, decidedAt);
        const newBalance = creditWalletBalance(wallet.balance, envelope.intent.amount);
        const updatedWallet = mergeWalletBalance(wallet, newBalance, {
          revision: plannedWalletRevision,
          eventRevision: plannedEventRevision,
          updatedAt: decidedAt,
        });

        const monetaryEvent: MonetaryEvent = {
          eventId: stagedEventId,
          eventKind: 'wallet_credit',
          currency: 'KZT',
          walletAccountId: envelope.intent.accountId,
          walletBalanceDelta: envelope.intent.amount,
          sourceKind: 'admin_adjustment',
          actor: monetaryActorFromEnvelope(envelope),
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          walletEventRevision: plannedEventRevision,
          occurredAt: decidedAt,
          recordedAt: decidedAt,
        };

        if (walletExists) {
          session.tx.update(
            { path: walletDocumentPath },
            toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: walletDocumentPath },
            toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
          );
        }
        stageMonetaryEventCreate(session, monetaryEvent);

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        mapFinanceDomainError(envelope, error);
      }
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: walletDocumentPath },
      requireExpectedRevision: walletExists,
    },
    handler,
  });
}

function recordProviderPaymentEventHandler(
  envelope: CommandEnvelope<'record_provider_payment_event'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_provider_payment_event'>> {
  assertFinanceAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const paymentDocumentPath = paymentPath(envelope.intent.paymentId);

  let payment!: Payment;
  let projectedPayment!: Payment;
  let plannedPaymentRevision!: Payment['revision'];
  let plannedPaymentEventRevision!: Payment['eventRevision'];
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);
  let providerReceiptPath: string | undefined;
  let plannedPaymentStartIssueResolution:
    { readonly issue: AdminIssue; readonly documentPath: string } | undefined;
  let plannedGuestConfirmation: PlannedGuestPaymentConfirmation | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_provider_payment_event'> = {
    read: async (session) => {
      plannedGuestConfirmation = undefined;
      plannedPaymentStartIssueResolution = undefined;
      providerReceiptPath = undefined;
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { reason: 'conflict', resourceKind: 'booking' },
        });
      }
      payment = parsedPayment;
      plannedPaymentRevision = nextAggregateRevision(payment.revision);
      plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);

      const before = paymentAccountingFields(payment);
      const projection = applyExternalPaymentFunding(before, envelope.intent.amount);
      const projectedPayment = mergePaymentProjection(payment, projection, {
        revision: plannedPaymentRevision,
        eventRevision: plannedPaymentEventRevision,
        updatedAt: timestampFromDate(environment.clock.decidedAt()),
        payerAccountId: envelope.intent.payerAccountId ?? payment.payerAccountId,
      });
      if (!isPaymentFullyFundedForService(payment)) {
        const confirmationDecision = await planGuestPaymentConfirmation({
          session,
          payment: projectedPayment,
          correlationId: envelope.context.correlationId,
          commandId: metadata.commandId,
          now: timestampFromDate(environment.clock.now()),
        });
        plannedGuestConfirmation = resolveFinanceGuestPaymentConfirmationEffect(
          confirmationDecision,
          envelope.context.correlationId
        );
      }

      if (payment.subjectType === 'course_enrollment') {
        const enrollmentDocumentPath = courseEnrollmentPath(
          CourseEnrollmentIdSchema.parse(payment.subjectId)
        );
        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        const enrollment = parseCourseEnrollment(
          enrollmentRead.exists ? enrollmentRead.data : undefined
        );
        if (enrollment) {
          const courseDocumentPath = coursePath(enrollment.courseId);
          const courseRead = await session.tx.get({ path: courseDocumentPath });
          session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
          const course = parseCourse(courseRead.exists ? courseRead.data : undefined);
          if (course) {
            plannedPaymentStartIssueResolution =
              await planCourseEnrollmentPaymentStartIssueResolutionIfFullyFunded({
                session,
                correlationId: envelope.context.correlationId,
                commandId: metadata.commandId,
                actor: {
                  actor: envelope.context.actor,
                  exercisedCapability: envelope.context.exercisedCapability,
                },
                decidedAt: environment.clock.decidedAt(),
                enrollment,
                course,
                payment: projectedPayment,
              });
          }
        }
      }

      if (envelope.intent.sourceKind === 'provider') {
        const receiptId = providerEventReceiptIdFromProviderEvent({
          providerKind: envelope.intent.providerKind!,
          providerEventId: envelope.intent.providerEventId!,
        });
        providerReceiptPath = providerEventReceiptPath(receiptId);
        const receiptRead = await session.tx.get({ path: providerReceiptPath });
        session.plan.planRead({ path: providerReceiptPath, category: 'payment_wallet' });
        if (receiptRead.exists) {
          const receipt = parseProviderEventReceipt(
            receiptRead.exists ? receiptRead.data : undefined
          );
          if (
            receipt &&
            !providerReceiptMatchesEvent(
              receipt,
              envelope.intent.providerKind!,
              envelope.intent.providerEventId!
            )
          ) {
            throw new CanonicalCommandError('idempotency_conflict', {
              correlationId: envelope.context.correlationId,
            });
          }
          throw new CanonicalCommandError('idempotency_conflict', {
            correlationId: envelope.context.correlationId,
          });
        } else {
          session.plan.planMutation({
            path: providerReceiptPath,
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.providerReceiptBytes,
          });
        }
      }

      session.plan.planMutation({
        path: paymentDocumentPath,
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
    },
    planAuditOutbox: async () =>
      mergeGuestPaymentConfirmationAuditPlan(
        buildProviderPaymentEventAuditPlan({
          envelope,
          monetaryEventIds: [stagedEventId],
          paymentId: envelope.intent.paymentId,
          paymentRevision: plannedPaymentRevision,
          ...(plannedPaymentStartIssueResolution === undefined
            ? {}
            : {
                resolvedAdminIssueId: plannedPaymentStartIssueResolution.issue.issueId,
                resolvedAdminIssueRevision: plannedPaymentStartIssueResolution.issue.revision,
              }),
        }),
        plannedGuestConfirmation
      ),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const before = paymentAccountingFields(payment);
        const projection = applyExternalPaymentFunding(before, envelope.intent.amount);
        projectedPayment = mergePaymentProjection(payment, projection, {
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          updatedAt: decidedAt,
          payerAccountId: envelope.intent.payerAccountId ?? payment.payerAccountId,
        });

        const eventKind =
          envelope.intent.sourceKind === 'provider' ? 'external_payment' : 'manual_payment';

        const monetaryEvent: MonetaryEvent = {
          eventId: stagedEventId,
          eventKind,
          currency: 'KZT',
          paymentId: payment.paymentId,
          subjectType: payment.subjectType,
          subjectId: payment.subjectId,
          paymentEffect: paymentEffectFromProjectionChange(before, projection),
          sourceKind: envelope.intent.sourceKind,
          ...(envelope.intent.payerAccountId === undefined
            ? {}
            : { payerAccountIdAtEvent: envelope.intent.payerAccountId }),
          ...(envelope.intent.providerKind === undefined
            ? {}
            : { providerKind: envelope.intent.providerKind }),
          ...(envelope.intent.providerEventId === undefined
            ? {}
            : { providerEventId: envelope.intent.providerEventId }),
          ...(envelope.intent.providerTransactionRef === undefined
            ? {}
            : { providerTransactionRef: envelope.intent.providerTransactionRef }),
          ...(envelope.intent.manualReference === undefined
            ? {}
            : { manualReference: envelope.intent.manualReference }),
          actor: monetaryActorFromEnvelope(envelope),
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          paymentEventRevision: plannedPaymentEventRevision,
          occurredAt: decidedAt,
          recordedAt: decidedAt,
        };

        session.tx.update(
          { path: paymentDocumentPath },
          toFirestoreWritePayload(projectedPayment as Record<string, unknown>)
        );
        stageMonetaryEventCreate(session, monetaryEvent);
        plannedGuestConfirmation?.commit(session, context.decidedAt);

        if (plannedPaymentStartIssueResolution !== undefined) {
          session.tx.update(
            { path: plannedPaymentStartIssueResolution.documentPath },
            toAdminIssueWritePayload(
              plannedPaymentStartIssueResolution.issue as Record<string, unknown>
            )
          );
        }

        if (
          envelope.intent.sourceKind === 'provider' &&
          providerReceiptPath !== undefined &&
          envelope.intent.providerKind &&
          envelope.intent.providerEventId
        ) {
          const receipt = buildProviderEventReceipt({
            providerKind: envelope.intent.providerKind,
            providerEventId: envelope.intent.providerEventId,
            paymentId: payment.paymentId,
            commandId: metadata.commandId,
            monetaryEventIds: [stagedEventId],
            outcome: 'applied',
            createdAt: decidedAt,
          });
          session.tx.create(
            { path: providerReceiptPath },
            toFirestoreWritePayload(receipt as Record<string, unknown>)
          );
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        mapFinanceDomainError(envelope, error);
      }
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: paymentDocumentPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

function adjustServicePriceHandler(
  envelope: CommandEnvelope<'adjust_service_price'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'adjust_service_price'>> {
  assertFinanceAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const paymentDocumentPath = paymentPath(envelope.intent.paymentId);
  const walletDocumentPath =
    envelope.intent.walletAccountId === undefined
      ? undefined
      : walletPath(envelope.intent.walletAccountId);

  let payment!: Payment;
  let wallet: Wallet | undefined;
  let walletExists = false;
  let plannedPaymentRevision!: Payment['revision'];
  let plannedPaymentEventRevision!: Payment['eventRevision'];
  let plannedWalletRevision: Wallet['revision'] | undefined;
  let plannedWalletEventRevision: Wallet['eventRevision'] | undefined;
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);
  let walletMutationPlanned = false;
  let plannedGuestConfirmation: PlannedGuestPaymentConfirmation | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'adjust_service_price'> = {
    read: async (session) => {
      plannedGuestConfirmation = undefined;
      walletMutationPlanned = false;
      wallet = undefined;
      walletExists = false;
      plannedWalletRevision = undefined;
      plannedWalletEventRevision = undefined;
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { reason: 'conflict', resourceKind: 'booking' },
        });
      }
      payment = parsedPayment;
      if (envelope.intent.newPrice === payment.price) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { reason: 'unsupported', field: 'newPrice' },
        });
      }

      const before = paymentAccountingFields(payment);
      if (envelope.intent.newPrice < payment.price) {
        const decreasePreview = applyPriceDecrease(before, envelope.intent.newPrice);
        if (decreasePreview.refundDelta > 0 && envelope.intent.walletAccountId === undefined) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'required', field: 'walletAccountId' },
          });
        }
      }

      plannedPaymentRevision = nextAggregateRevision(payment.revision);
      plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);

      if (walletDocumentPath !== undefined) {
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists;
        if (!walletExists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'conflict' },
          });
        }
        walletMutationPlanned =
          envelope.intent.fundingAmount !== undefined ||
          (envelope.intent.newPrice < payment.price &&
            applyPriceDecrease(before, envelope.intent.newPrice).refundDelta > 0);
        if (walletMutationPlanned) {
          plannedWalletRevision = nextAggregateRevision(wallet!.revision);
          plannedWalletEventRevision = nextAggregateRevision(wallet!.eventRevision);
          session.plan.planMutation({
            path: walletDocumentPath,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
          });
        }
      }

      let confirmationProjection: PaymentAccountingProjection;
      if (envelope.intent.newPrice > payment.price) {
        const delta = KztMinorUnitsSchema.parse(envelope.intent.newPrice - payment.price);
        confirmationProjection =
          envelope.intent.fundingAmount !== undefined && wallet !== undefined
            ? applyPriceIncreaseWithFunding(before, delta, envelope.intent.fundingAmount)
            : applyPriceIncrease(before, delta).payment;
      } else {
        confirmationProjection = applyPriceDecrease(before, envelope.intent.newPrice).payment;
      }
      const confirmationPayment = mergePaymentProjection(payment, confirmationProjection, {
        revision: plannedPaymentRevision,
        eventRevision: plannedPaymentEventRevision,
        updatedAt: timestampFromDate(environment.clock.decidedAt()),
      });
      if (!isPaymentFullyFundedForService(payment)) {
        const confirmationDecision = await planGuestPaymentConfirmation({
          session,
          payment: confirmationPayment,
          correlationId: envelope.context.correlationId,
          commandId: metadata.commandId,
          now: timestampFromDate(environment.clock.now()),
        });
        plannedGuestConfirmation = resolveFinanceGuestPaymentConfirmationEffect(
          confirmationDecision,
          envelope.context.correlationId
        );
      }

      session.plan.planMutation({
        path: paymentDocumentPath,
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
    },
    planAuditOutbox: async () =>
      mergeGuestPaymentConfirmationAuditPlan(
        buildAdjustServicePriceAuditPlan({
          envelope,
          monetaryEventIds: [stagedEventId],
          paymentId: envelope.intent.paymentId,
          paymentRevision: plannedPaymentRevision,
          walletAccountId: envelope.intent.walletAccountId,
          walletRevision: plannedWalletRevision,
          includeWalletEffect: walletMutationPlanned,
        }),
        plannedGuestConfirmation
      ),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const before = paymentAccountingFields(payment);
        let projection!: PaymentAccountingProjection;
        let walletBalanceDelta: number | undefined;
        let refundDelta: ReturnType<typeof KztMinorUnitsSchema.parse> =
          KztMinorUnitsSchema.parse(0);

        if (envelope.intent.newPrice > payment.price) {
          const delta = KztMinorUnitsSchema.parse(envelope.intent.newPrice - payment.price);
          if (envelope.intent.fundingAmount !== undefined && wallet !== undefined) {
            try {
              debitWalletBalance(wallet.balance, envelope.intent.fundingAmount);
            } catch (error) {
              if (error instanceof InsufficientWalletFundsError) {
                throw new CanonicalCommandError('insufficient_funds', {
                  correlationId: envelope.context.correlationId,
                });
              }
              throw error;
            }
            projection = applyPriceIncreaseWithFunding(
              before,
              delta,
              envelope.intent.fundingAmount
            );
            walletBalanceDelta = -envelope.intent.fundingAmount;
          } else {
            projection = applyPriceIncrease(before, delta).payment;
          }
        } else if (envelope.intent.newPrice < payment.price) {
          const decrease = applyPriceDecrease(before, envelope.intent.newPrice);
          projection = decrease.payment;
          refundDelta = decrease.refundDelta;
          if (refundDelta > 0) {
            if (wallet === undefined) {
              throw new CanonicalCommandError('validation', {
                correlationId: envelope.context.correlationId,
                details: { reason: 'required', field: 'walletAccountId' },
              });
            }
            walletBalanceDelta = refundDelta;
          }
        }

        const updatedPayment = mergePaymentProjection(
          payment,
          {
            ...projection,
            paymentStatus: projection.paymentStatus,
          },
          {
            revision: plannedPaymentRevision,
            eventRevision: plannedPaymentEventRevision,
            updatedAt: decidedAt,
          }
        );

        const priceEvent: MonetaryEvent = {
          eventId: stagedEventId,
          eventKind: 'admin_price_adjustment',
          currency: 'KZT',
          paymentId: payment.paymentId,
          subjectType: payment.subjectType,
          subjectId: payment.subjectId,
          paymentEffect: paymentEffectFromProjectionChange(before, projection),
          ...(wallet !== undefined && walletBalanceDelta !== undefined
            ? {
                walletAccountId: wallet.accountId,
                walletBalanceDelta,
                ...(refundDelta > 0
                  ? {
                      refundDestinationKind: 'wallet' as const,
                      refundAccountIdAtEvent: wallet.accountId,
                    }
                  : {}),
              }
            : {}),
          sourceKind: 'admin_adjustment',
          actor: monetaryActorFromEnvelope(envelope),
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          paymentEventRevision: plannedPaymentEventRevision,
          ...(wallet !== undefined &&
          walletBalanceDelta !== undefined &&
          plannedWalletEventRevision !== undefined
            ? { walletEventRevision: plannedWalletEventRevision }
            : {}),
          occurredAt: decidedAt,
          recordedAt: decidedAt,
        };

        session.tx.update(
          { path: paymentDocumentPath },
          toFirestoreWritePayload(updatedPayment as Record<string, unknown>)
        );
        stageMonetaryEventCreate(session, priceEvent);
        plannedGuestConfirmation?.commit(session, context.decidedAt);

        if (
          wallet !== undefined &&
          walletDocumentPath !== undefined &&
          walletBalanceDelta !== undefined &&
          plannedWalletRevision !== undefined &&
          plannedWalletEventRevision !== undefined
        ) {
          const deltaMagnitude = KztMinorUnitsSchema.parse(Math.abs(walletBalanceDelta));
          const newBalance =
            walletBalanceDelta < 0
              ? debitWalletBalance(wallet.balance, deltaMagnitude)
              : creditWalletBalance(wallet.balance, deltaMagnitude);
          const updatedWallet = mergeWalletBalance(wallet, newBalance, {
            revision: plannedWalletRevision,
            eventRevision: plannedWalletEventRevision,
            updatedAt: decidedAt,
          });
          session.tx.update(
            { path: walletDocumentPath },
            toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
          );
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        if (error instanceof PaymentAccountingInvariantError) {
          return commandErrorResult(
            envelope.kind,
            envelope.context.correlationId,
            new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { reason: 'unsupported', field: 'payment' },
            }).toTransport()
          );
        }
        mapFinanceDomainError(envelope, error);
      }
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: {
      ref: { path: paymentDocumentPath },
      requireExpectedRevision: true,
    },
    handler,
  });
}

export function createFinanceCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  eventLoader?: MonetaryEventLoader
): Partial<CommandHandlerMap> {
  return {
    record_manual_wallet_funding: (envelope, environment) =>
      recordManualWalletFundingHandler(envelope, environment, executor),
    record_provider_payment_event: async (envelope, environment) => {
      const result = await recordProviderPaymentEventHandler(envelope, environment, executor);
      if (result.status === 'success') {
        await reconcileGuestConfirmationLifecycleMismatchAfterCommand({
          correlationId: envelope.context.correlationId,
          paymentId: envelope.intent.paymentId,
          environment,
          executor,
          eventLoader,
        });
      }
      return result;
    },
    adjust_service_price: async (envelope, environment) => {
      const result = await adjustServicePriceHandler(envelope, environment, executor);
      if (result.status === 'success') {
        await reconcileGuestConfirmationLifecycleMismatchAfterCommand({
          correlationId: envelope.context.correlationId,
          paymentId: envelope.intent.paymentId,
          environment,
          executor,
          eventLoader,
        });
      }
      return result;
    },
    ...createFinanceCorrectionCommandHandlers(executor, eventLoader),
  };
}
