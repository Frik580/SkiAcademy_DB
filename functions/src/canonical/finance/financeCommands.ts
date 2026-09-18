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
  monetaryEventIdFromAdminWalletPayment,
  monetaryEventIdFromCommandEffect,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  providerEventReceiptIdFromProviderEvent,
  providerReceiptMatchesEvent,
  resolveCommandIdempotencyIdentity,
  isPaymentFullyFundedForService,
  timestampFromDate,
  type AccountId,
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
import { commitAdminIssueDocument } from '../adminIssues';
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
import { createStarterCreditCommandHandlers } from './starterCreditCommands';
import { assertFinanceAuthorization, mapFinanceDomainError } from './financeAuthorization';
import {
  buildAdjustServicePriceAuditPlan,
  buildAdminWalletPaymentAuditPlan,
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
  parseMonetaryEvent,
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
  assertGuestManualPaymentAcceptance,
  planGuestPaymentConfirmation,
  resolveFinanceGuestPaymentConfirmationEffect,
  type PlannedGuestPaymentConfirmation,
} from '../guestConfirmation/guestPaymentConfirmation';
import { mergeGuestPaymentConfirmationAuditPlan } from '../guestConfirmation/guestPaymentConfirmationAudit';
import { bookingPath, parseBooking } from '../bookings/bookingStore';

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
      await assertGuestManualPaymentAcceptance({
        session,
        payment,
        correlationId: envelope.context.correlationId,
        now: timestampFromDate(environment.clock.now()),
      });
      plannedPaymentRevision = nextAggregateRevision(payment.revision);
      plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);

      const before = paymentAccountingFields(payment);
      let projection: ReturnType<typeof applyExternalPaymentFunding>;
      try {
        projection = applyExternalPaymentFunding(before, envelope.intent.amount);
      } catch (error) {
        mapFinanceDomainError(envelope, error);
      }
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
          commitAdminIssueDocument(session, {
            mutationKind: 'update',
            documentPath: plannedPaymentStartIssueResolution.documentPath,
            issue: plannedPaymentStartIssueResolution.issue,
          });
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

function payableServiceLifecycle(status: string): boolean {
  return status === 'pending' || status === 'confirmed';
}

function resolveLinkedPayerAccountId(input: {
  readonly resourcePayerAccountId?: AccountId;
  readonly paymentPayerAccountId?: AccountId;
  readonly guestLinkedAccountId?: AccountId;
}): AccountId | undefined {
  return (
    input.resourcePayerAccountId ?? input.paymentPayerAccountId ?? input.guestLinkedAccountId
  );
}

function payServiceFromWalletAsAdministratorHandler(
  envelope: CommandEnvelope<'pay_service_from_wallet_as_administrator'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'pay_service_from_wallet_as_administrator'>> {
  assertFinanceAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const resourceKind = envelope.intent.subjectKind === 'booking' ? 'booking' : 'course_enrollment';
  const resourceDocumentPath =
    envelope.intent.subjectKind === 'booking'
      ? bookingPath(envelope.intent.bookingId)
      : courseEnrollmentPath(envelope.intent.enrollmentId);

  let payment!: Payment;
  let paymentDocumentPath!: string;
  let payerAccountId!: AccountId;
  let walletDocumentPath!: string;
  let walletRecord: Wallet | undefined;
  let walletExists = false;
  let alreadyApplied = false;
  let outstandingAmount = KztMinorUnitsSchema.parse(0);
  let projectedPayment!: Payment;
  let plannedPaymentRevision!: Payment['revision'];
  let plannedPaymentEventRevision!: Payment['eventRevision'];
  let plannedWalletRevision!: Wallet['revision'];
  let plannedWalletEventRevision!: Wallet['eventRevision'];
  let stagedEventId!: ReturnType<typeof monetaryEventIdFromAdminWalletPayment>;
  let plannedPaymentStartIssueResolution:
    { readonly issue: AdminIssue; readonly documentPath: string } | undefined;
  let plannedGuestConfirmation: PlannedGuestPaymentConfirmation | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'pay_service_from_wallet_as_administrator'> =
    {
      read: async (session) => {
        plannedGuestConfirmation = undefined;
        plannedPaymentStartIssueResolution = undefined;
        alreadyApplied = false;

        const resourceRead = await session.tx.get({ path: resourceDocumentPath });
        session.plan.planRead({ path: resourceDocumentPath, category: 'aggregate' });

        let resourcePayerAccountId: AccountId | undefined;
        let guestLinkedAccountId: AccountId | undefined;
        let lifecycleStatus: string | undefined;
        let paymentId: Payment['paymentId'] | undefined;
        let enrollmentForIssue: ReturnType<typeof parseCourseEnrollment> | undefined;

        if (envelope.intent.subjectKind === 'booking') {
          const booking = parseBooking(resourceRead.exists ? resourceRead.data : undefined);
          if (!booking || booking.bookingId !== envelope.intent.bookingId) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'booking', reason: 'conflict' },
            });
          }
          lifecycleStatus = booking.lifecycle.status;
          resourcePayerAccountId = booking.payerAccountId;
          paymentId = booking.paymentId;
        } else {
          const enrollment = parseCourseEnrollment(
            resourceRead.exists ? resourceRead.data : undefined
          );
          if (!enrollment || enrollment.enrollmentId !== envelope.intent.enrollmentId) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'course_enrollment', reason: 'conflict' },
            });
          }
          lifecycleStatus = enrollment.lifecycle.status;
          resourcePayerAccountId = enrollment.payerAccountId;
          guestLinkedAccountId = enrollment.guestAccountLink?.linkedAccountId;
          paymentId = enrollment.paymentId;
          enrollmentForIssue = enrollment;
        }

        if (!lifecycleStatus || !payableServiceLifecycle(lifecycleStatus)) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind, reason: 'conflict' },
          });
        }
        if (!paymentId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          });
        }

        paymentDocumentPath = paymentPath(paymentId);
        const paymentRead = await session.tx.get({ path: paymentDocumentPath });
        session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
        const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
        if (
          !parsedPayment ||
          parsedPayment.paymentId !== paymentId ||
          parsedPayment.subjectType !== resourceKind ||
          parsedPayment.subjectId !==
            (envelope.intent.subjectKind === 'booking'
              ? envelope.intent.bookingId
              : envelope.intent.enrollmentId)
        ) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          });
        }
        payment = parsedPayment;

        const linkedAccountId = resolveLinkedPayerAccountId({
          resourcePayerAccountId,
          paymentPayerAccountId: payment.payerAccountId,
          guestLinkedAccountId,
        });
        if (!linkedAccountId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind, reason: 'unsupported' },
          });
        }
        payerAccountId = linkedAccountId;

        const accountDocumentPath = accountPath(payerAccountId);
        const accountRead = await session.tx.get({ path: accountDocumentPath });
        session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
        const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
        if (!account || account.lifecycle.status !== 'active') {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        stagedEventId = monetaryEventIdFromAdminWalletPayment(payment.paymentId);
        const eventDocumentPath = monetaryEventPath(stagedEventId);
        const eventRead = await session.tx.get({ path: eventDocumentPath });
        session.plan.planRead({ path: eventDocumentPath, category: 'payment_wallet' });
        const existingEvent = parseMonetaryEvent(eventRead.exists ? eventRead.data : undefined);
        if (existingEvent && existingEvent.paymentId !== payment.paymentId) {
          throw new CanonicalCommandError('idempotency_conflict', {
            correlationId: envelope.context.correlationId,
          });
        }

        if (isPaymentFullyFundedForService(payment) || existingEvent) {
          if (existingEvent && !isPaymentFullyFundedForService(payment)) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'payment', reason: 'conflict' },
            });
          }
          alreadyApplied = true;
          plannedPaymentRevision = payment.revision;
          plannedPaymentEventRevision = payment.eventRevision;
          return;
        }

        outstandingAmount = payment.outstandingAmount;
        if (outstandingAmount <= 0) {
          alreadyApplied = true;
          plannedPaymentRevision = payment.revision;
          plannedPaymentEventRevision = payment.eventRevision;
          return;
        }

        walletDocumentPath = walletPath(payerAccountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists && walletRecord !== undefined;
        const walletBalance = walletRecord?.balance ?? KztMinorUnitsSchema.parse(0);
        if (walletBalance < outstandingAmount) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }

        plannedPaymentRevision = nextAggregateRevision(payment.revision);
        plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);
        plannedWalletRevision = walletExists
          ? nextAggregateRevision(walletRecord!.revision)
          : AggregateRevisionSchema.parse(1);
        plannedWalletEventRevision = walletExists
          ? nextAggregateRevision(walletRecord!.eventRevision)
          : AggregateRevisionSchema.parse(1);

        const before = paymentAccountingFields(payment);
        let projection: ReturnType<typeof applyExternalPaymentFunding>;
        try {
          projection = applyExternalPaymentFunding(before, outstandingAmount);
        } catch (error) {
          mapFinanceDomainError(envelope, error);
        }
        projectedPayment = mergePaymentProjection(payment, projection, {
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          updatedAt: timestampFromDate(environment.clock.decidedAt()),
          payerAccountId,
        });
        if (!isPaymentFullyFundedForService(projectedPayment)) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }

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

        if (payment.subjectType === 'course_enrollment' && enrollmentForIssue) {
          const courseDocumentPath = coursePath(enrollmentForIssue.courseId);
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
                enrollment: enrollmentForIssue,
                course,
                payment: projectedPayment,
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
          path: walletDocumentPath,
          kind: walletExists ? 'update' : 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });
        session.plan.planMutation({
          path: eventDocumentPath,
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
        });
      },
      planAuditOutbox: async () =>
        mergeGuestPaymentConfirmationAuditPlan(
          buildAdminWalletPaymentAuditPlan({
            envelope,
            monetaryEventIds: alreadyApplied ? [] : [stagedEventId],
            paymentId: payment.paymentId,
            paymentRevision: plannedPaymentRevision,
            walletAccountId: payerAccountId,
            ...(alreadyApplied
              ? {}
              : {
                  walletRevision: plannedWalletRevision,
                  includeWalletEffect: true,
                }),
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
          if (alreadyApplied) {
            return commandSuccessResult(envelope.kind, envelope.context.correlationId);
          }

          const decidedAt = timestampFromDate(context.decidedAt);
          const before = paymentAccountingFields(payment);
          const projection = applyExternalPaymentFunding(before, outstandingAmount);
          projectedPayment = mergePaymentProjection(payment, projection, {
            revision: plannedPaymentRevision,
            eventRevision: plannedPaymentEventRevision,
            updatedAt: decidedAt,
            payerAccountId,
          });

          const wallet = walletRecord ?? {
            accountId: payerAccountId,
            currency: 'KZT' as const,
            balance: KztMinorUnitsSchema.parse(0),
            revision: AggregateRevisionSchema.parse(1),
            eventRevision: AggregateRevisionSchema.parse(0),
            createdAt: decidedAt,
            updatedAt: decidedAt,
          };
          const newBalance = debitWalletBalance(wallet.balance, outstandingAmount);
          const updatedWallet = mergeWalletBalance(wallet, newBalance, {
            revision: plannedWalletRevision,
            eventRevision: plannedWalletEventRevision,
            updatedAt: decidedAt,
          });

          const monetaryEvent: MonetaryEvent = {
            eventId: stagedEventId,
            eventKind: payment.subjectType === 'booking' ? 'booking_charge' : 'course_charge',
            currency: 'KZT',
            paymentId: payment.paymentId,
            subjectType: payment.subjectType,
            subjectId: payment.subjectId,
            walletAccountId: payerAccountId,
            walletBalanceDelta: -outstandingAmount,
            paymentEffect: paymentEffectFromProjectionChange(before, projection),
            sourceKind: 'wallet',
            payerAccountIdAtEvent: payerAccountId,
            actor: monetaryActorFromEnvelope(envelope),
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            paymentEventRevision: plannedPaymentEventRevision,
            walletEventRevision: plannedWalletEventRevision,
            occurredAt: decidedAt,
            recordedAt: decidedAt,
          };

          session.tx.update(
            { path: paymentDocumentPath },
            toFirestoreWritePayload(projectedPayment as Record<string, unknown>)
          );
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
          plannedGuestConfirmation?.commit(session, context.decidedAt);

          if (plannedPaymentStartIssueResolution !== undefined) {
            commitAdminIssueDocument(session, {
              mutationKind: 'update',
              documentPath: plannedPaymentStartIssueResolution.documentPath,
              issue: plannedPaymentStartIssueResolution.issue,
            });
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
    ...createStarterCreditCommandHandlers(executor),
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
    pay_service_from_wallet_as_administrator: async (envelope, environment) => {
      const result = await payServiceFromWalletAsAdministratorHandler(
        envelope,
        environment,
        executor
      );
      if (result.status === 'success') {
        const paymentId =
          envelope.intent.subjectKind === 'booking'
            ? paymentIdFromBookingId(envelope.intent.bookingId)
            : paymentIdFromCourseEnrollmentId(envelope.intent.enrollmentId);
        await reconcileGuestConfirmationLifecycleMismatchAfterCommand({
          correlationId: envelope.context.correlationId,
          paymentId,
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
