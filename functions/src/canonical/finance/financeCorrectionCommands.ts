import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  assertExpectedRevision,
  commandSuccessResult,
  financialReconciliationMismatchIdentity,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  planAdminRefundCorrection,
  planCompensatingEventCorrection,
  planReverseWriteOffCorrection,
  planWriteOffCorrection,
  primaryReconciliationScopeForMismatches,
  rebuildPaymentProjectionFromEvents,
  rebuildWalletProjectionFromEvents,
  reconcilePaymentState,
  reconcileWalletState,
  resolveCommandIdempotencyIdentity,
  resolveFinancialAdminIssueForCorrection,
  assertFinancialCorrectionHasEffect,
  assertFinancialCorrectionIssueSubjectMatchesPayment,
  assertWalletCorrectionDoesNotOverdraw,
  applyWalletCorrectionDelta,
  timestampFromDate,
  type AdminIssue,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type MonetaryEvent,
  type Payment,
  type Wallet,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
  toFirestoreWritePayload as toAdminIssueWritePayload,
  parseAdminIssue,
  adminIssuePath,
} from '../adminIssues';
import {
  assertFinancialCorrectionAuthorization,
  assertReconciliationAuthorization,
  mapFinanceDomainError,
} from './financeAuthorization';
import {
  buildAuditCorrectionAuditPlan,
  buildFinancialCorrectionAuditPlan,
} from './financeAudit';
import {
  FINANCE_PLANNING_ESTIMATES,
  collectMonetaryEventsFromDocs,
  mergePaymentProjection,
  mergeWalletBalance,
  monetaryEventPath,
  parseMonetaryEvent,
  parsePayment,
  parseWallet,
  paymentAccountingFields,
  paymentPath,
  toFirestoreWritePayload,
  walletPath,
} from './financeStore';

export type MonetaryEventLoader = (input: {
  readonly paymentId?: Payment['paymentId'];
  readonly walletAccountId?: Wallet['accountId'];
}) => Promise<readonly MonetaryEvent[]>;

function metadataFromEnvelope(envelope: CommandEnvelope) {
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
    AuthoritativeIdempotentCanonicalCommandHandler<'record_financial_correction'>['execute']
  >[0],
  event: MonetaryEvent
): void {
  session.tx.create({ path: monetaryEventPath(event.eventId) }, toFirestoreWritePayload(event as Record<string, unknown>));
  session.plan.planMutation({
    path: monetaryEventPath(event.eventId),
    kind: 'create',
    category: 'payment_wallet',
    estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
  });
}

function parseOptionalAdminIssue(
  correlationId: CommandEnvelope['context']['correlationId'],
  data: Record<string, unknown> | undefined
): AdminIssue | undefined {
  if (!data) return undefined;
  const parsed = parseAdminIssue(data);
  if (!parsed) {
    throw new CanonicalCommandError('audit_integrity_violation', { correlationId });
  }
  return parsed;
}

function reconciliationSubjectFromRawPayment(
  data: Record<string, unknown> | undefined
): { readonly subjectKind: 'booking' | 'course_enrollment'; readonly subjectId: string } | undefined {
  if (!data) return undefined;
  const subjectType = data.subjectType;
  const subjectId = data.subjectId;
  if (
    (subjectType === 'booking' || subjectType === 'course_enrollment') &&
    typeof subjectId === 'string'
  ) {
    return { subjectKind: subjectType, subjectId };
  }
  return undefined;
}

function stageFinancialReconciliationIssue(input: {
  readonly envelope: CommandEnvelope<'record_audit_correction'>;
  readonly environment: CommandExecutionEnvironment;
  readonly session: CanonicalAtomicTransactionSession;
  readonly metadata: ReturnType<typeof metadataFromEnvelope>;
  readonly identity: ReturnType<typeof financialReconciliationMismatchIdentity>;
  readonly existingIssue: AdminIssue | undefined;
  readonly issueReadData: Record<string, unknown> | undefined;
}): {
  readonly plannedIssue: AdminIssue;
  readonly issueMutationKind: 'create' | 'update';
  readonly issueDocumentPath: string;
} {
  const issueDocumentPath = plannedAdminIssuePath(input.identity);
  input.session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
  const existingIssue =
    input.existingIssue ??
    parseExistingAdminIssueOrCollision(
      input.envelope.context.correlationId,
      input.issueReadData
    );
  const now = timestampFromDate(input.environment.clock.now());
  const opened = openOrReuseAdminIssue({
    existing: existingIssue,
    identity: input.identity,
    now,
    correlationId: input.envelope.context.correlationId,
    commandId: input.metadata.commandId,
  });
  input.session.plan.planMutation({
    path: issueDocumentPath,
    kind: opened.mutationKind,
    category: 'aggregate',
    estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
  });
  return {
    plannedIssue: opened.issue,
    issueMutationKind: opened.mutationKind,
    issueDocumentPath,
  };
}

function recordFinancialCorrectionHandler(
  envelope: CommandEnvelope<'record_financial_correction'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_financial_correction'>> {
  assertFinancialCorrectionAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const paymentDocumentPath = paymentPath(envelope.intent.paymentId);

  let payment!: Payment;
  let wallet: Wallet | undefined;
  let walletExists = false;
  let existingIssue: AdminIssue | undefined;
  let plannedPaymentRevision!: Payment['revision'];
  let plannedPaymentEventRevision!: Payment['eventRevision'];
  let plannedWalletRevision: Wallet['revision'] | undefined;
  let plannedWalletEventRevision: Wallet['eventRevision'] | undefined;
  let walletDocumentPath: string | undefined;
  let issueDocumentPath: string | undefined;
  let stagedEventCount = 0;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_financial_correction'> = {
    read: async (session) => {
      stagedEventCount = 0;
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
      assertExpectedRevision({
        correlationId: envelope.context.correlationId,
        expectedRevision: envelope.intent.expectedPaymentRevision,
        currentRevision: payment.revision,
        requireExpectedRevision: true,
      });

      if (envelope.intent.adminIssueId !== undefined && envelope.intent.expectedAdminIssueRevision !== undefined) {
        issueDocumentPath = adminIssuePath(envelope.intent.adminIssueId);
        const issueRead = await session.tx.get({ path: issueDocumentPath });
        session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
        existingIssue = parseOptionalAdminIssue(
          envelope.context.correlationId,
          issueRead.exists ? issueRead.data : undefined
        );
        if (!existingIssue) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'adminIssueId', reason: 'conflict' },
          });
        }
        session.plan.planMutation({
          path: issueDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      }

      const walletAccountId =
        envelope.intent.correctionKind === 'admin_refund'
          ? envelope.intent.walletAccountId ?? payment.payerAccountId
          : envelope.intent.correctionKind === 'compensating_event'
            ? envelope.intent.walletAccountId
            : undefined;

      if (walletAccountId !== undefined) {
        walletDocumentPath = walletPath(walletAccountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        wallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists;
        if (
          walletExists &&
          (envelope.intent.correctionKind === 'admin_refund' ||
            envelope.intent.correctionKind === 'compensating_event')
        ) {
          if (envelope.intent.expectedWalletRevision === undefined) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { reason: 'required', field: 'expectedWalletRevision' },
            });
          }
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: envelope.intent.expectedWalletRevision,
            currentRevision: wallet!.revision,
            requireExpectedRevision: true,
          });
        }
        if (
          envelope.intent.correctionKind === 'admin_refund' &&
          (envelope.intent.walletAccountId !== undefined || payment.payerAccountId !== undefined) &&
          !walletExists
        ) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'conflict' },
          });
        }
      }

      plannedPaymentRevision = nextAggregateRevision(payment.revision);
      plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);
      stagedEventCount =
        envelope.intent.correctionKind === 'compensating_event' ||
        envelope.intent.correctionKind === 'admin_refund' ||
        envelope.intent.correctionKind === 'write_off' ||
        envelope.intent.correctionKind === 'reverse_write_off'
          ? 1
          : 0;

      session.plan.planMutation({
        path: paymentDocumentPath,
        kind: 'update',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
      });
      if (stagedEventCount > 0) {
        session.plan.planMutation({
          path: monetaryEventPath(
            monetaryEventIdFromCommandEffect(metadata.commandId, 0)
          ),
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
        });
      }
      if (walletDocumentPath !== undefined && walletExists) {
        plannedWalletRevision = nextAggregateRevision(wallet!.revision);
        plannedWalletEventRevision = nextAggregateRevision(wallet!.eventRevision);
        session.plan.planMutation({
          path: walletDocumentPath,
          kind: 'update',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });
      }
    },
    planAuditOutbox: async () => {
      const monetaryEventIds = Array.from({ length: stagedEventCount }, (_, index) =>
        monetaryEventIdFromCommandEffect(metadata.commandId, index)
      );
      return buildFinancialCorrectionAuditPlan({
        envelope,
        monetaryEventIds,
        paymentId: envelope.intent.paymentId,
        paymentRevision: plannedPaymentRevision,
        walletAccountId:
          walletDocumentPath !== undefined
            ? wallet?.accountId
            : undefined,
        walletRevision: plannedWalletRevision,
        includeWalletEffect: plannedWalletRevision !== undefined,
        resolvedAdminIssueId:
          envelope.intent.expectedAdminIssueRevision !== undefined
            ? existingIssue?.issueId
            : undefined,
        resolvedAdminIssueRevision:
          envelope.intent.expectedAdminIssueRevision !== undefined && existingIssue
            ? nextAggregateRevision(existingIssue.revision)
            : undefined,
      });
    },
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const before = paymentAccountingFields(payment);
        let plan;
        if (envelope.intent.correctionKind === 'admin_refund') {
          const destination =
            envelope.intent.walletAccountId !== undefined || payment.payerAccountId !== undefined
              ? ('wallet' as const)
              : ('manual_external' as const);
          if (destination === 'manual_external' && !envelope.intent.manualExternalReference) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { reason: 'required', field: 'manualExternalReference' },
            });
          }
          plan = planAdminRefundCorrection({
            before,
            refundAmount: envelope.intent.amount,
            destination,
            walletAccountId:
              envelope.intent.walletAccountId ?? payment.payerAccountId ?? undefined,
            manualExternalReference: envelope.intent.manualExternalReference,
          });
        } else if (envelope.intent.correctionKind === 'write_off') {
          plan = planWriteOffCorrection({ before, amount: envelope.intent.amount });
        } else if (envelope.intent.correctionKind === 'reverse_write_off') {
          plan = planReverseWriteOffCorrection({ before, amount: envelope.intent.amount });
        } else {
          plan = planCompensatingEventCorrection({
            before,
            paymentEffect: envelope.intent.paymentEffect,
            correctsEventId: envelope.intent.correctsEventId,
            walletBalanceDelta: envelope.intent.walletBalanceDelta,
            walletAccountId: envelope.intent.walletAccountId ?? payment.payerAccountId,
          });
        }

        assertFinancialCorrectionHasEffect(plan);
        if (wallet !== undefined && plan.walletBalanceDelta !== undefined) {
          assertWalletCorrectionDoesNotOverdraw(wallet.balance, plan.walletBalanceDelta);
        }

        const updatedPayment = mergePaymentProjection(payment, plan.paymentProjection, {
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          updatedAt: decidedAt,
        });
        session.tx.update(
          { path: paymentDocumentPath },
          toFirestoreWritePayload(updatedPayment as Record<string, unknown>)
        );

        plan.monetaryEvents.forEach((plannedEvent, index) => {
          const event: MonetaryEvent = {
            eventId: monetaryEventIdFromCommandEffect(metadata.commandId, index),
            eventKind: plannedEvent.eventKind,
            currency: 'KZT',
            paymentId: payment.paymentId,
            subjectType: payment.subjectType,
            subjectId: payment.subjectId,
            ...(plannedEvent.paymentEffect === undefined
              ? {}
              : { paymentEffect: plannedEvent.paymentEffect }),
            ...(plannedEvent.walletBalanceDelta === undefined
              ? {}
              : {
                  walletAccountId:
                    plannedEvent.refundAccountIdAtEvent ??
                    (envelope.intent.correctionKind === 'admin_refund'
                      ? envelope.intent.walletAccountId
                      : envelope.intent.correctionKind === 'compensating_event'
                        ? envelope.intent.walletAccountId
                        : undefined) ??
                    payment.payerAccountId,
                  walletBalanceDelta: plannedEvent.walletBalanceDelta,
                }),
            sourceKind: 'admin_adjustment',
            ...(plannedEvent.refundDestinationKind === undefined
              ? {}
              : { refundDestinationKind: plannedEvent.refundDestinationKind }),
            ...(plannedEvent.refundAccountIdAtEvent === undefined
              ? {}
              : { refundAccountIdAtEvent: plannedEvent.refundAccountIdAtEvent }),
            ...(plannedEvent.manualReference === undefined
              ? {}
              : { manualReference: plannedEvent.manualReference }),
            ...(plannedEvent.correctsEventId === undefined
              ? {}
              : { correctsEventId: plannedEvent.correctsEventId }),
            actor: monetaryActorFromEnvelope(envelope),
            reasonCode: 'manual_financial_correction',
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            paymentEventRevision: plannedPaymentEventRevision,
            ...(plannedWalletEventRevision !== undefined
              ? { walletEventRevision: plannedWalletEventRevision }
              : {}),
            occurredAt: decidedAt,
            recordedAt: decidedAt,
          };
          stageMonetaryEventCreate(session, event);
        });

        if (
          wallet !== undefined &&
          walletDocumentPath !== undefined &&
          plan.walletBalanceDelta !== undefined &&
          plannedWalletRevision !== undefined &&
          plannedWalletEventRevision !== undefined
        ) {
          const newBalance = applyWalletCorrectionDelta(wallet.balance, plan.walletBalanceDelta);
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

        if (
          existingIssue !== undefined &&
          issueDocumentPath !== undefined &&
          envelope.intent.adminIssueId !== undefined &&
          envelope.intent.expectedAdminIssueRevision !== undefined
        ) {
          assertFinancialCorrectionIssueSubjectMatchesPayment(
            envelope.context.correlationId,
            existingIssue,
            payment
          );
          const resolved = resolveFinancialAdminIssueForCorrection(existingIssue, {
            expectedRevision: envelope.intent.expectedAdminIssueRevision,
            now: decidedAt,
            correlationId: envelope.context.correlationId,
            commandId: metadata.commandId,
            reason: envelope.intent.reasonExplanation,
            actor: envelope.context,
            coupledDomainCommand: true,
            paymentId: payment.paymentId,
            adminIssueId: envelope.intent.adminIssueId,
          });
          session.tx.update(
            { path: issueDocumentPath },
            toAdminIssueWritePayload(resolved as Record<string, unknown>)
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

function recordAuditCorrectionHandler(
  envelope: CommandEnvelope<'record_audit_correction'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  eventLoader: MonetaryEventLoader
): Promise<CommandResult<'record_audit_correction'>> {
  if (
    envelope.intent.operation === 'reconcile_payment' ||
    envelope.intent.operation === 'reconcile_wallet'
  ) {
    assertReconciliationAuthorization(envelope);
  } else {
    assertFinancialCorrectionAuthorization(envelope);
  }

  const metadata = metadataFromEnvelope(envelope);
  const isReconciliation =
    envelope.intent.operation === 'reconcile_payment' ||
    envelope.intent.operation === 'reconcile_wallet';

  let payment: Payment | undefined;
  let wallet: Wallet | undefined;
  let paymentEvents: readonly MonetaryEvent[] = [];
  let walletEvents: readonly MonetaryEvent[] = [];
  let existingIssue: AdminIssue | undefined;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';
  let paymentDocumentPath = '';
  let walletDocumentPath = '';
  let plannedPaymentRevision: Payment['revision'] | undefined;
  let plannedWalletRevision: Wallet['revision'] | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_audit_correction'> = {
    read: async (session) => {
      payment = undefined;
      wallet = undefined;
      paymentEvents = [];
      walletEvents = [];
      existingIssue = undefined;
      plannedIssue = undefined;
      issueMutationKind = undefined;
      issueDocumentPath = '';
      plannedPaymentRevision = undefined;
      plannedWalletRevision = undefined;

      if (envelope.intent.operation === 'reconcile_payment' || envelope.intent.operation === 'rebuild_payment_projection') {
        paymentDocumentPath = paymentPath(envelope.intent.paymentId);
        const paymentRead = await session.tx.get({ path: paymentDocumentPath });
        session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
        const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
        if (!parsedPayment) {
          if (
            envelope.intent.operation === 'reconcile_payment' &&
            paymentRead.exists
          ) {
            const subject = reconciliationSubjectFromRawPayment(paymentRead.data);
            if (!subject) {
              throw new CanonicalCommandError('validation', {
                correlationId: envelope.context.correlationId,
                details: { reason: 'conflict', resourceKind: 'booking' },
              });
            }
            const identity = financialReconciliationMismatchIdentity({
              subjectKind: subject.subjectKind,
              subjectId: subject.subjectId as Payment['subjectId'],
              reconciliationScope: 'payment_invariants',
            });
            issueDocumentPath = plannedAdminIssuePath(identity);
            const issueRead = await session.tx.get({ path: issueDocumentPath });
            const staged = stageFinancialReconciliationIssue({
              envelope,
              environment,
              session,
              metadata,
              identity,
              existingIssue: undefined,
              issueReadData: issueRead.exists ? issueRead.data : undefined,
            });
            plannedIssue = staged.plannedIssue;
            issueMutationKind = staged.issueMutationKind;
            issueDocumentPath = staged.issueDocumentPath;
          } else {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { reason: 'conflict', resourceKind: 'booking' },
            });
          }
        } else {
        payment = parsedPayment;
        paymentEvents = await eventLoader({ paymentId: payment.paymentId });

        if (envelope.intent.operation === 'rebuild_payment_projection') {
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: envelope.intent.expectedPaymentRevision,
            currentRevision: payment.revision,
            requireExpectedRevision: true,
          });
          plannedPaymentRevision = nextAggregateRevision(payment.revision);
          session.plan.planMutation({
            path: paymentDocumentPath,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
          });
        } else {
          const reconciliation = reconcilePaymentState({ payment, paymentEvents });
          if (reconciliation.hasMismatch) {
            const scope = primaryReconciliationScopeForMismatches(reconciliation.mismatches);
            const identity = financialReconciliationMismatchIdentity({
              subjectKind: payment.subjectType,
              subjectId: payment.subjectId,
              reconciliationScope: scope,
            });
            issueDocumentPath = plannedAdminIssuePath(identity);
            const issueRead = await session.tx.get({ path: issueDocumentPath });
            session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
            existingIssue = parseExistingAdminIssueOrCollision(
              envelope.context.correlationId,
              issueRead.exists ? issueRead.data : undefined
            );
            const now = timestampFromDate(environment.clock.now());
            const opened = openOrReuseAdminIssue({
              existing: existingIssue,
              identity,
              now,
              correlationId: envelope.context.correlationId,
              commandId: metadata.commandId,
            });
            plannedIssue = opened.issue;
            issueMutationKind = opened.mutationKind;
            session.plan.planMutation({
              path: issueDocumentPath,
              kind: issueMutationKind,
              category: 'aggregate',
              estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
            });
          }
        }
        }
      }

      if (envelope.intent.operation === 'reconcile_wallet' || envelope.intent.operation === 'rebuild_wallet_projection') {
        walletDocumentPath = walletPath(envelope.intent.accountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        const parsedWallet = parseWallet(walletRead.exists ? walletRead.data : undefined);
        if (!parsedWallet) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { reason: 'conflict' },
          });
        }
        wallet = parsedWallet;
        walletEvents = await eventLoader({ walletAccountId: wallet.accountId });

        if (envelope.intent.operation === 'rebuild_wallet_projection') {
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: envelope.intent.expectedWalletRevision,
            currentRevision: wallet.revision,
            requireExpectedRevision: true,
          });
          plannedWalletRevision = nextAggregateRevision(wallet.revision);
          session.plan.planMutation({
            path: walletDocumentPath,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
          });
        } else {
          const reconciliation = reconcileWalletState({ wallet, walletEvents });
          if (reconciliation.hasMismatch) {
            // Wallet reconciliation detects mismatches but AdminIssue requires a service subject.
            // Payment-scoped reconciliation owns issue creation for linked financial mismatches.
          }
        }
      }
    },
    planAuditOutbox: async () =>
      buildAuditCorrectionAuditPlan({
        envelope,
        paymentId: payment?.paymentId,
        paymentRevision: plannedPaymentRevision,
        walletAccountId: wallet?.accountId,
        walletRevision: plannedWalletRevision,
        openedAdminIssueId: plannedIssue?.issueId,
        openedAdminIssueRevision: plannedIssue?.revision,
        includePaymentEffect: plannedPaymentRevision !== undefined,
        includeWalletEffect: plannedWalletRevision !== undefined,
        isReconciliation,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);

      if (
        envelope.intent.operation === 'rebuild_payment_projection' &&
        payment !== undefined &&
        plannedPaymentRevision !== undefined
      ) {
        const rebuilt = rebuildPaymentProjectionFromEvents(payment, paymentEvents);
        const updatedPayment = mergePaymentProjection(payment, rebuilt, {
          revision: plannedPaymentRevision,
          eventRevision: AggregateRevisionSchema.parse(
            paymentEvents.reduce<number>(
              (max, event) => Math.max(max, event.paymentEventRevision ?? 0),
              0
            ) || payment.eventRevision
          ),
          updatedAt: decidedAt,
        });
        session.tx.update(
          { path: paymentDocumentPath },
          toFirestoreWritePayload(updatedPayment as Record<string, unknown>)
        );
      }

      if (
        envelope.intent.operation === 'rebuild_wallet_projection' &&
        wallet !== undefined &&
        plannedWalletRevision !== undefined
      ) {
        const rebuilt = rebuildWalletProjectionFromEvents(walletEvents);
        const updatedWallet = mergeWalletBalance(wallet, rebuilt.balance, {
          revision: plannedWalletRevision,
          eventRevision: AggregateRevisionSchema.parse(rebuilt.eventRevision),
          updatedAt: decidedAt,
        });
        session.tx.update(
          { path: walletDocumentPath },
          toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
        );
      }

      if (plannedIssue !== undefined && issueDocumentPath && issueMutationKind) {
        const payload = toAdminIssueWritePayload(plannedIssue as Record<string, unknown>);
        if (issueMutationKind === 'create') {
          session.tx.create({ path: issueDocumentPath }, payload);
        } else {
          session.tx.update({ path: issueDocumentPath }, payload);
        }
      }

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget:
      envelope.intent.operation === 'rebuild_payment_projection'
        ? { ref: { path: paymentPath(envelope.intent.paymentId) }, requireExpectedRevision: true }
        : envelope.intent.operation === 'rebuild_wallet_projection'
          ? { ref: { path: walletPath(envelope.intent.accountId) }, requireExpectedRevision: true }
          : undefined,
    handler,
  });
}

export function createFinanceCorrectionCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  eventLoader: MonetaryEventLoader = async () => []
): Partial<CommandHandlerMap> {
  return {
    record_financial_correction: (envelope, environment) =>
      recordFinancialCorrectionHandler(envelope, environment, executor),
    record_audit_correction: (envelope, environment) =>
      recordAuditCorrectionHandler(envelope, environment, executor, eventLoader),
  };
}

export function createSnapshotMonetaryEventLoader(
  docs: Iterable<readonly [string, Record<string, unknown> | undefined]>
): MonetaryEventLoader {
  return async (filter) => collectMonetaryEventsFromDocs(docs, filter);
}

export function createFirestoreMonetaryEventLoader(
  firestore: {
    collection(name: string): {
      where(
        field: string,
        op: string,
        value: unknown
      ): { get(): Promise<{ docs: Array<{ data(): Record<string, unknown> }> }> };
    };
  }
): MonetaryEventLoader {
  return async (filter) => {
    const events: MonetaryEvent[] = [];
    if (filter.paymentId !== undefined) {
      const snapshot = await firestore
        .collection('monetary_events')
        .where('paymentId', '==', filter.paymentId)
        .get();
      for (const doc of snapshot.docs) {
        const parsed = parseMonetaryEvent(doc.data());
        if (parsed) events.push(parsed);
      }
    }
    if (filter.walletAccountId !== undefined) {
      const snapshot = await firestore
        .collection('monetary_events')
        .where('walletAccountId', '==', filter.walletAccountId)
        .get();
      for (const doc of snapshot.docs) {
        const parsed = parseMonetaryEvent(doc.data());
        if (parsed && !events.some((event) => event.eventId === parsed.eventId)) {
          events.push(parsed);
        }
      }
    }
    return events;
  };
}
