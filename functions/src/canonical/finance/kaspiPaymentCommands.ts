import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  CanonicalTimestampSchema,
  KztMinorUnitsSchema,
  KASPI_CONFIGURATION_PATH,
  KaspiPaymentRequestSchema,
  MonetaryEventSchema,
  PaymentSchema,
  canonicalReference,
  commandSuccessResult,
  compareCanonicalTimestamps,
  creditWalletBalance,
  debitWalletBalance,
  applyExternalPaymentFunding,
  applyRefundDelta,
  isPaymentEntirelyUnpaid,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  normalizeFirestoreDocument,
  paymentEffectFromProjectionChange,
  readEnabledKaspiConfiguration,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  kaspiRequestExpired,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type KaspiPaymentRequest,
  type MonetaryEvent,
  type Payment,
  type Wallet,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import { executeAuthoritativeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import type {
  CanonicalAtomicTransactionSession,
  CanonicalTransactionExecutor,
} from '../transactions';
import {
  assertAdministrator,
  assertAccountActive,
} from '../participantAccess/participantAccessAuthorization';
import { bookingPath, parseBooking } from '../bookings/bookingStore';
import { courseEnrollmentPath, parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import {
  assertGuestManualPaymentAcceptance,
  planGuestPaymentConfirmation,
  type PlannedGuestPaymentConfirmation,
} from '../guestConfirmation/guestPaymentConfirmation';
import { mergeGuestPaymentConfirmationAuditPlan } from '../guestConfirmation/guestPaymentConfirmationAudit';
import {
  accountPath,
  parseAccount,
  walletPath,
  parseWallet,
  initialWallet,
  mergeWalletBalance,
  paymentPath,
  parsePayment,
  paymentAccountingFields,
  mergePaymentProjection,
  monetaryEventPath,
  toFirestoreWritePayload,
} from './financeStore';
import {
  kaspiReceiptGuardPath,
  kaspiRequestPath,
  parseKaspiRequest,
  verifyKaspiGuestCredential,
} from './kaspiPaymentStore';

type Kind = 'create_kaspi_payment_request' | 'claim_kaspi_payment' | 'review_kaspi_payment';
type Envelope = { [K in Kind]: CommandEnvelope<K> }[Kind];
function fail(
  envelope: Envelope,
  code:
    | 'forbidden'
    | 'validation'
    | 'invalid_transition'
    | 'unavailable'
    | 'stale_version' = 'validation'
): never {
  throw new CanonicalCommandError(code, { correlationId: envelope.context.correlationId });
}
function planWrite(
  session: CanonicalAtomicTransactionSession,
  path: string,
  kind: 'create' | 'update',
  bytes = 2048
) {
  session.plan.planMutation({
    path,
    kind,
    category: 'payment_wallet',
    estimatedPayloadBytes: bytes,
  });
}
async function read(session: CanonicalAtomicTransactionSession, path: string) {
  const result = await session.tx.get({ path });
  session.plan.planRead({ path, category: 'payment_wallet' });
  return result;
}
function guestAuthorized(
  envelope: Envelope,
  request: Pick<KaspiPaymentRequest, 'type' | 'subjectId' | 'guestSubjectId'>,
  now: ReturnType<typeof timestampFromDate>,
  secret?: string
) {
  const metadata = envelope.context.transportMetadata;
  let expiresAt;
  try {
    expiresAt = CanonicalTimestampSchema.parse(
      JSON.parse(metadata?.guest_profile_expires_at ?? 'null')
    );
  } catch {
    fail(envelope, 'forbidden');
  }
  if (
    request.type === 'wallet_topup' ||
    !request.subjectId ||
    envelope.context.actor.kind !== 'guest' ||
    envelope.context.actor.guestSubjectId !== request.guestSubjectId ||
    envelope.context.source !== 'guest_callable' ||
    envelope.context.exercisedCapability !== 'guest' ||
    !verifyKaspiGuestCredential({
      type: request.type,
      subjectId: request.subjectId,
      nonce: metadata?.guest_action_nonce ?? '',
      signature: metadata?.guest_action_sig ?? '',
      expiresAt,
      now,
      secret,
    })
  )
    fail(envelope, 'forbidden');
}

function auditPlan(
  envelope: Envelope,
  request: KaspiPaymentRequest,
  event?: MonetaryEvent
): AuditOutboxStagingPlan {
  const ref = request.paymentId
    ? canonicalReference('payment', request.paymentId)
    : canonicalReference('account', request.accountId!);
  const kind = request.paymentId ? ('payment' as const) : ('account' as const);
  const id = request.paymentId ?? request.accountId!;
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'other',
        explanation: `Kaspi request ${request.requestId}: ${request.status}`,
      },
      primarySubject: { kind, id, subjectKey: `${kind}:${id}` },
      affectedSubjects: [ref],
      effects: [],
      monetaryEventIds: event ? [event.eventId] : [],
      adminIssueIds: [],
      resultingRevisions: [],
    },
    outboxObligations: [],
  };
}

async function execute<K extends Kind>(
  envelope: CommandEnvelope<K>,
  environment: CommandExecutionEnvironment,
  executor: CanonicalTransactionExecutor,
  secret?: string
) {
  const input = envelope as Envelope;
  const path = kaspiRequestPath(input.intent.requestId);
  const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);
  const eventId = monetaryEventIdFromCommandEffect(identity.commandKey, 0);
  let request!: KaspiPaymentRequest;
  let creating = false;
  let payment: Payment | undefined;
  let updatedPayment: Payment | undefined;
  let wallet: Wallet | undefined;
  let updatedWallet: Wallet | undefined;
  let walletExists = false;
  let event: MonetaryEvent | undefined;
  let confirmation: PlannedGuestPaymentConfirmation | undefined;
  let guard: string | undefined;
  let unchanged = false;
  const now = timestampFromDate(environment.clock.now());

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler: {
      read: async (session) => {
        // Firestore can retry this closure: reset all derived plans on every invocation.
        payment = updatedPayment = undefined;
        wallet = updatedWallet = undefined;
        event = undefined;
        confirmation = undefined;
        guard = undefined;
        unchanged = false;
        creating = false;
        const existing = await read(session, path);
        const parsed = parseKaspiRequest(existing.data);
        if (existing.exists && !parsed) fail(input);

        if (input.kind === 'create_kaspi_payment_request') {
          const intent = input.intent;
          const configRead = await read(session, KASPI_CONFIGURATION_PATH);
          const config = readEnabledKaspiConfiguration(normalizeFirestoreDocument(configRead.data));
          if (!config) fail(input, 'unavailable');
          if (intent.type === 'wallet_topup') {
            const actor = input.context.actor;
            if (
              actor.kind !== 'account' ||
              input.context.exercisedCapability !== 'account_owner' ||
              input.context.source !== 'client_callable'
            )
              fail(input, 'forbidden');
            const account = await read(session, accountPath(actor.accountId));
            assertAccountActive(input, parseAccount(account.data));
            request = KaspiPaymentRequestSchema.parse({
              requestId: intent.requestId,
              type: intent.type,
              amount: intent.amount,
              accountId: actor.accountId,
              ...(typeof account.data?.displayName === 'string' && account.data.displayName.trim()
                ? { payerDisplayName: account.data.displayName }
                : {}),
              currency: 'KZT',
              status: 'awaiting_payment',
              revision: 1,
              serviceFunded: false,
              merchantKey: config.merchantKey,
              createdAt: now,
              updatedAt: now,
              expiresAt: timestampFromDate(
                new Date(environment.clock.now().getTime() + config.walletRequestTtlSeconds * 1000)
              ),
            });
          } else {
            const subjectId =
              intent.type === 'guest_booking_payment'
                ? intent.bookingId
                : intent.courseEnrollmentId;
            const isBooking = intent.type === 'guest_booking_payment';
            const subjectRead = await read(
              session,
              isBooking
                ? bookingPath(BookingIdSchema.parse(subjectId))
                : courseEnrollmentPath(CourseEnrollmentIdSchema.parse(subjectId))
            );
            const subject = isBooking
              ? parseBooking(subjectRead.data)
              : parseCourseEnrollment(subjectRead.data);
            if (
              !subject ||
              subject.attribution.bookingOrigin !== 'guest' ||
              subject.lifecycle.status !== 'pending'
            )
              fail(input, 'invalid_transition');
            const guestSubjectId = isBooking
              ? guestSubjectIdFromBookingId(BookingIdSchema.parse(subjectId))
              : guestSubjectIdFromCourseEnrollmentId(CourseEnrollmentIdSchema.parse(subjectId));
            guestAuthorized(input, { type: intent.type, subjectId, guestSubjectId }, now, secret);
            const participantId =
              'party' in subject ? subject.party.participantIds[0] : subject.participantId;
            const participantRead = await read(session, `participants/${participantId}`);
            const payerDisplayName =
              typeof participantRead.data?.displayName === 'string'
                ? participantRead.data.displayName
                : undefined;
            const paymentRead = await read(session, paymentPath(subject.paymentId));
            payment = parsePayment(paymentRead.data);
            if (
              !payment ||
              payment.subjectId !== subjectId ||
              !isPaymentEntirelyUnpaid(payment) ||
              (payment.manualPaymentRequestId &&
                payment.manualPaymentRequestId !== intent.requestId)
            )
              fail(input, 'invalid_transition');
            await assertGuestManualPaymentAcceptance({
              session,
              payment,
              correlationId: input.context.correlationId,
              now,
            });
            request = KaspiPaymentRequestSchema.parse({
              requestId: intent.requestId,
              type: intent.type,
              amount: payment.outstandingAmount,
              guestSubjectId,
              ...(payerDisplayName ? { payerDisplayName } : {}),
              paymentId: payment.paymentId,
              subjectId,
              currency: 'KZT',
              status: 'awaiting_payment',
              revision: 1,
              serviceFunded: false,
              merchantKey: config.merchantKey,
              createdAt: now,
              updatedAt: now,
              expiresAt: subject.lifecycle.reservationExpiresAt,
            });
            updatedPayment = PaymentSchema.parse({
              ...payment,
              manualPaymentRequestId: request.requestId,
              revision: nextAggregateRevision(payment.revision),
              updatedAt: now,
            });
          }
          if (parsed) {
            if (
              parsed.type !== request.type ||
              parsed.accountId !== request.accountId ||
              parsed.guestSubjectId !== request.guestSubjectId ||
              parsed.amount !== request.amount
            )
              fail(input, 'forbidden');
            request = parsed;
            updatedPayment = undefined;
            unchanged = true;
            return;
          }
          creating = true;
        } else {
          if (!parsed) fail(input, 'forbidden');
          request = parsed;
          if (input.kind === 'claim_kaspi_payment') {
            if (request.type === 'wallet_topup') {
              if (
                input.context.actor.kind !== 'account' ||
                input.context.actor.accountId !== request.accountId ||
                input.context.exercisedCapability !== 'account_owner'
              )
                fail(input, 'forbidden');
            } else guestAuthorized(input, request, now, secret);
            if (request.claimedAt) {
              unchanged = true;
              return;
            }
            if (!['awaiting_payment', 'requires_clarification', 'expired'].includes(request.status))
              fail(input, 'invalid_transition');
            request = { ...request, status: 'payment_claimed', claimedAt: now };
          } else {
            const actor = assertAdministrator(input);
            const actorRead = await read(session, accountPath(actor.accountId));
            assertAccountActive(input, parseAccount(actorRead.data));
            const intent = input.intent;
            if (input.context.expectedRevision !== request.revision) fail(input, 'stale_version');
            if (intent.action === 'confirm') {
              if (request.receipt) {
                unchanged = true;
                return;
              }
              if (
                ![
                  'awaiting_payment',
                  'payment_claimed',
                  'requires_clarification',
                  'expired',
                  'cancelled',
                  'rejected',
                ].includes(request.status) ||
                !intent.receipt
              )
                fail(input, 'invalid_transition');
              if (compareCanonicalTimestamps(intent.receipt.receivedAt, now) > 0) fail(input);
              guard = kaspiReceiptGuardPath(request.merchantKey, intent.receipt.bankReference);
              if ((await read(session, guard)).exists) fail(input, 'invalid_transition');
              request = {
                ...request,
                receipt: intent.receipt,
                receiptEventId: eventId,
                confirmedAt: now,
                confirmedBy: actor.accountId,
              };
              let applicable =
                intent.receipt.amount === request.amount && !kaspiRequestExpired(request, now);
              if (request.paymentId) {
                payment = parsePayment((await read(session, paymentPath(request.paymentId))).data);
                if (
                  !payment ||
                  payment.manualPaymentRequestId !== request.requestId ||
                  payment.subjectId !== request.subjectId ||
                  payment.outstandingAmount !== intent.receipt.amount ||
                  !isPaymentEntirelyUnpaid(payment)
                )
                  applicable = false;
                if (applicable && payment) {
                  try {
                    await assertGuestManualPaymentAcceptance({
                      session,
                      payment,
                      correlationId: input.context.correlationId,
                      now,
                    });
                    const projection = applyExternalPaymentFunding(
                      paymentAccountingFields(payment),
                      intent.receipt.amount
                    );
                    updatedPayment = mergePaymentProjection(payment, projection, {
                      revision: nextAggregateRevision(payment.revision),
                      eventRevision: nextAggregateRevision(payment.eventRevision),
                      updatedAt: now,
                    });
                    const decision = await planGuestPaymentConfirmation({
                      session,
                      payment: updatedPayment,
                      correlationId: input.context.correlationId,
                      commandId: identity.commandKey,
                      now,
                    });
                    if (decision.outcome !== 'planned') {
                      applicable = false;
                      updatedPayment = undefined;
                    } else confirmation = decision.plan;
                  } catch (error) {
                    if (
                      !(error instanceof CanonicalCommandError) ||
                      !['invalid_transition', 'blocked_relationship', 'validation'].includes(
                        error.code
                      )
                    )
                      throw error;
                    applicable = false;
                    updatedPayment = undefined;
                  }
                }
              } else if (applicable) {
                const account = parseAccount(
                  (await read(session, accountPath(request.accountId!))).data
                );
                if (!account || account.lifecycle.status !== 'active') applicable = false;
                else {
                  const walletRead = await read(session, walletPath(request.accountId!));
                  wallet = parseWallet(walletRead.data);
                  walletExists = walletRead.exists;
                  if (walletExists && !wallet) fail(input);
                  const before = wallet ?? initialWallet(request.accountId!, now);
                  if (!Number.isSafeInteger(before.balance + intent.receipt.amount))
                    applicable = false;
                  else
                    updatedWallet = mergeWalletBalance(
                      before,
                      creditWalletBalance(before.balance, intent.receipt.amount),
                      {
                        revision: AggregateRevisionSchema.parse(wallet ? wallet.revision + 1 : 1),
                        eventRevision: nextAggregateRevision(before.eventRevision),
                        updatedAt: now,
                      }
                    );
                }
              }
              request = applicable
                ? { ...request, status: 'confirmed', serviceFunded: Boolean(request.paymentId) }
                : {
                    ...request,
                    status: 'refund_required',
                    refundAmount: intent.receipt.amount,
                    refundReason: intent.reason,
                  };
              event = MonetaryEventSchema.parse({
                eventId,
                eventKind: updatedWallet ? 'wallet_credit' : 'manual_payment',
                currency: 'KZT',
                sourceKind: 'bank_transfer',
                externalAmount: intent.receipt.amount,
                manualReference: intent.receipt.bankReference,
                actor: { kind: 'account', accountId: actor.accountId },
                ...(updatedWallet
                  ? {
                      walletAccountId: updatedWallet.accountId,
                      walletBalanceDelta: intent.receipt.amount,
                      walletEventRevision: updatedWallet.eventRevision,
                    }
                  : {}),
                ...(updatedPayment && payment
                  ? {
                      paymentId: payment.paymentId,
                      subjectType: payment.subjectType,
                      subjectId: payment.subjectId,
                      paymentEffect: paymentEffectFromProjectionChange(
                        paymentAccountingFields(payment),
                        updatedPayment
                      ),
                      paymentEventRevision: updatedPayment.eventRevision,
                    }
                  : {}),
                commandId: identity.commandKey,
                correlationId: input.context.correlationId,
                occurredAt: intent.receipt.receivedAt,
                recordedAt: now,
              });
            } else if (intent.action === 'clarify' || intent.action === 'reject') {
              if (
                request.receipt ||
                ['confirmed', 'refund_required', 'refunded'].includes(request.status)
              )
                fail(input, 'invalid_transition');
              request = {
                ...request,
                status: intent.action === 'clarify' ? 'requires_clarification' : 'rejected',
              };
            } else if (intent.action === 'require_refund') {
              if (!['confirmed', 'refunded'].includes(request.status) || !request.receipt)
                fail(input, 'invalid_transition');
              const amount = KztMinorUnitsSchema.parse(
                intent.refundAmount ?? request.receipt.amount - request.refundedAmount
              );
              if (amount <= 0 || amount + request.refundedAmount > request.receipt.amount)
                fail(input);
              if (request.type === 'wallet_topup') {
                const receiptEvent = (
                  await read(session, monetaryEventPath(request.receiptEventId!))
                ).data;
                if (
                  receiptEvent?.walletBalanceDelta === request.receipt.amount &&
                  receiptEvent.walletAccountId === request.accountId
                ) {
                  wallet = parseWallet((await read(session, walletPath(request.accountId!))).data);
                  walletExists = true;
                  if (!wallet || wallet.balance < amount) fail(input, 'invalid_transition');
                  updatedWallet = mergeWalletBalance(
                    wallet,
                    debitWalletBalance(wallet.balance, amount),
                    {
                      revision: nextAggregateRevision(wallet.revision),
                      eventRevision: nextAggregateRevision(wallet.eventRevision),
                      updatedAt: now,
                    }
                  );
                  event = MonetaryEventSchema.parse({
                    eventId,
                    eventKind: 'wallet_adjustment',
                    currency: 'KZT',
                    sourceKind: 'admin_adjustment',
                    walletAccountId: wallet.accountId,
                    walletBalanceDelta: -amount,
                    walletEventRevision: updatedWallet.eventRevision,
                    actor: { kind: 'account', accountId: actor.accountId },
                    reasonCode: 'bank_refund_preparation',
                    commandId: identity.commandKey,
                    correlationId: input.context.correlationId,
                    occurredAt: now,
                    recordedAt: now,
                  });
                  request = {
                    ...request,
                    walletCorrectionEventId: eventId,
                    walletCorrectedAmount: KztMinorUnitsSchema.parse(
                      (request.walletCorrectedAmount ?? 0) + amount
                    ),
                  };
                } else fail(input);
              }
              request = {
                ...request,
                status: 'refund_required',
                refundAmount: amount,
                refundReason: intent.reason,
              };
            } else {
              if (request.status === 'refunded') {
                unchanged = true;
                return;
              }
              if (
                request.status !== 'refund_required' ||
                !request.receipt ||
                !request.refundAmount ||
                !intent.refundBankReference ||
                !intent.refundedAt ||
                compareCanonicalTimestamps(intent.refundedAt, now) > 0 ||
                compareCanonicalTimestamps(intent.refundedAt, request.receipt.receivedAt) < 0
              )
                fail(input, 'invalid_transition');
              guard = kaspiReceiptGuardPath(request.merchantKey, intent.refundBankReference, true);
              if ((await read(session, guard)).exists) fail(input, 'invalid_transition');
              if (request.serviceFunded && request.paymentId) {
                payment = parsePayment((await read(session, paymentPath(request.paymentId))).data);
                if (!payment || payment.manualPaymentRequestId !== request.requestId) fail(input);
                const projection = applyRefundDelta(
                  paymentAccountingFields(payment),
                  request.refundAmount
                );
                updatedPayment = mergePaymentProjection(payment, projection, {
                  revision: nextAggregateRevision(payment.revision),
                  eventRevision: nextAggregateRevision(payment.eventRevision),
                  updatedAt: now,
                });
              }
              event = MonetaryEventSchema.parse({
                eventId,
                eventKind: 'manual_external_refund',
                currency: 'KZT',
                sourceKind: 'bank_transfer',
                externalAmount: request.refundAmount,
                refundDestinationKind: 'manual_external',
                manualReference: intent.refundBankReference,
                actor: { kind: 'account', accountId: actor.accountId },
                commandId: identity.commandKey,
                correlationId: input.context.correlationId,
                occurredAt: intent.refundedAt,
                recordedAt: now,
                ...(updatedPayment && payment
                  ? {
                      paymentId: payment.paymentId,
                      subjectType: payment.subjectType,
                      subjectId: payment.subjectId,
                      paymentEffect: paymentEffectFromProjectionChange(
                        paymentAccountingFields(payment),
                        updatedPayment
                      ),
                      paymentEventRevision: updatedPayment.eventRevision,
                    }
                  : {}),
              });
              request = {
                ...request,
                status: 'refunded',
                refundedAmount: KztMinorUnitsSchema.parse(
                  request.refundedAmount + request.refundAmount
                ),
                refundedAt: intent.refundedAt,
                refundedBy: actor.accountId,
                refundBankReference: intent.refundBankReference,
                refundEventId: eventId,
              };
            }
          }
          request = {
            ...request,
            revision: nextAggregateRevision(request.revision),
            updatedAt: now,
          };
        }
        request = KaspiPaymentRequestSchema.parse(request);
        planWrite(session, path, creating ? 'create' : 'update');
        if (updatedPayment) planWrite(session, paymentPath(updatedPayment.paymentId), 'update');
        if (updatedWallet)
          planWrite(
            session,
            walletPath(updatedWallet.accountId),
            walletExists ? 'update' : 'create'
          );
        if (event) planWrite(session, monetaryEventPath(event.eventId), 'create', 1024);
        if (guard) planWrite(session, guard, 'create', 256);
        planWrite(session, `${path}/actions/${identity.commandKey}`, 'create', 512);
      },
      planAuditOutbox: async () =>
        mergeGuestPaymentConfirmationAuditPlan(auditPlan(input, request, event), confirmation),
      execute: async (session) => {
        if (!unchanged) {
          const payload = toFirestoreWritePayload(request as Record<string, unknown>);
          if (creating) session.tx.create({ path }, payload);
          else session.tx.update({ path }, payload);
          if (updatedPayment)
            session.tx.update(
              { path: paymentPath(updatedPayment.paymentId) },
              toFirestoreWritePayload(updatedPayment as Record<string, unknown>)
            );
          if (updatedWallet) {
            if (walletExists)
              session.tx.update(
                { path: walletPath(updatedWallet.accountId) },
                toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
              );
            else
              session.tx.create(
                { path: walletPath(updatedWallet.accountId) },
                toFirestoreWritePayload(updatedWallet as Record<string, unknown>)
              );
          }
          if (event)
            session.tx.create(
              { path: monetaryEventPath(event.eventId) },
              toFirestoreWritePayload(event as Record<string, unknown>)
            );
          if (guard)
            session.tx.create(
              { path: guard },
              { requestId: request.requestId, eventId, recordedAt: now }
            );
          confirmation?.commit(session, environment.clock.decidedAt());
          session.tx.create(
            { path: `${path}/actions/${identity.commandKey}` },
            {
              kind: input.kind,
              status: request.status,
              at: now,
              actor: input.context.actor,
              ...(input.kind === 'review_kaspi_payment' ? { reason: input.intent.reason } : {}),
            }
          );
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    },
  });
}

export function createKaspiPaymentCommandHandlers(
  executor: CanonicalTransactionExecutor,
  secret?: string
): CommandHandlerMap {
  return {
    create_kaspi_payment_request: (envelope, environment) =>
      execute(envelope, environment, executor, secret),
    claim_kaspi_payment: (envelope, environment) =>
      execute(envelope, environment, executor, secret),
    review_kaspi_payment: (envelope, environment) =>
      execute(envelope, environment, executor, secret),
  };
}
