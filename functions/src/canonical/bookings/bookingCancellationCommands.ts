import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  accountOwnerCancellationReasonCode,
  administratorCancellationReasonCode,
  assertBookingPaymentIdentity,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  calculateFullPaidRefundAmount,
  commandSuccessResult,
  evaluateClientCancellationTiming,
  isConfirmedIndividualBooking,
  isPendingCancellationIndividualBooking,
  isTerminalBookingLifecycle,
  missingBookingAttendanceIdentity,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  unresolvedPendingCancellationIdentity,
  KztMinorUnitsSchema,
  type AdminIssue,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type KztMinorUnits,
  type Payment,
  resolveLateRejectionOutcome,
} from '@ski-academy/shared-domain';
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
} from '../adminIssues';
import { parseAccount, accountPath, parsePayment, paymentPath } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantManagement,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { attendancePath, parseAttendance } from './attendanceStore';
import {
  assertAuthenticatedClientCancellationAuthorization,
  assertConfirmedGuestCannotSelfCancel,
  assertResolveBookingCancellationAuthorization,
} from './bookingCancellationAuthorization';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import {
  buildDirectClientCancellationAuditPlan,
  buildPendingCancellationRequestAuditPlan,
  buildResolveCancellationAuditPlan,
  buildWithdrawCancellationRequestAuditPlan,
} from './bookingCancellationAudit';
import {
  assertRefundWithinRetained,
  commitPlannedCancellationFinanceEffects,
  planCancellationFinance,
} from './bookingCancellationFinance';
import { commitPlannedReleaseBookingClaims, planReleaseBookingClaims } from './bookingClaimOperations';
import { BOOKING_PLANNING_ESTIMATES, bookingPath, parseBooking, toFirestoreWritePayload } from './bookingStore';
import type { GuestBookingCommandEnvironment } from './guestBookingCommands';
import { requestPendingGuestCancellationHandler } from './guestBookingCancellation';

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

function requestAuthenticatedBookingCancellationHandler(
  envelope: CommandEnvelope<'request_booking_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'request_booking_cancellation'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let payment!: Payment;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseBookingClaims>> = [];
  let plannedFinance: Awaited<ReturnType<typeof planCancellationFinance>> | undefined;
  let timing!: ReturnType<typeof evaluateClientCancellationTiming>;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'request_booking_cancellation'> = {
    read: async (session) => {
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      booking = parsedBooking;
      assertConfirmedGuestCannotSelfCancel(envelope, booking);

      if (!isConfirmedIndividualBooking(booking) || isTerminalBookingLifecycle(booking)) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'unsupported' },
        });
      }

      const participantId = booking.party.participantIds[0]!;
      const actor = requireAccountActor(envelope);
      const accountDocumentPath = accountPath(actor.accountId);
      const accountRead = await session.tx.get({ path: accountDocumentPath });
      session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const participantDocumentPath = participantPath(participantId);
      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      const participant = parseParticipant(participantRead.exists ? participantRead.data : undefined);
      if (!participant || participant.management.kind !== 'managed') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const managementDocumentPath = participantManagementPath(
        participant.management.participantManagementId
      );
      const managementRead = await session.tx.get({ path: managementDocumentPath });
      session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
      const management = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!management) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      assertAuthenticatedClientCancellationAuthorization(envelope, {
        account,
        participant,
        management,
        participantId,
      });

      const now = timestampFromDate(environment.clock.decidedAt());
      timing = evaluateClientCancellationTiming({
        requestAt: now,
        startAt: booking.occurrence.interval.startsAt,
      });
      if (timing === 'after_start_rejected') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'startsAt', reason: 'out_of_range' },
        });
      }

      plannedBookingRevision = nextAggregateRevision(booking.revision);
      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });

      if (timing === 'direct_cancel') {
        const paymentDocumentPath = paymentPath(booking.paymentId);
        const paymentRead = await session.tx.get({ path: paymentDocumentPath });
        session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
        const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
        if (!parsedPayment) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'paymentId', reason: 'conflict' },
          });
        }
        payment = parsedPayment;
        assertBookingPaymentIdentity(envelope.context.correlationId, booking, payment);
        const refundAmount = calculateFullPaidRefundAmount(payment);
        plannedFinance = await planCancellationFinance(session, {
          envelope,
          booking,
          payment,
          refundAmount,
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          decidedAt: now,
        });
        plannedReleaseClaims = await planReleaseBookingClaims(
          session,
          booking,
          metadata,
          environment.clock.decidedAt()
        );
        return;
      }

      const issueIdentity = unresolvedPendingCancellationIdentity({
        bookingId: booking.bookingId,
        occurrenceId: booking.occurrence.occurrenceId,
      });
      issueDocumentPath = plannedAdminIssuePath(issueIdentity);
      const issueRead = await session.tx.get({ path: issueDocumentPath });
      session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
      const existingIssue = parseExistingAdminIssueOrCollision(
        envelope.context.correlationId,
        issueRead.exists ? issueRead.data : undefined
      );
      const opened = openOrReuseAdminIssue({
        existing: existingIssue,
        identity: issueIdentity,
        now,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
      });
      plannedIssue = opened.issue;
      issueMutationKind = opened.mutationKind;
      session.plan.planMutation({
        path: issueDocumentPath,
        kind: opened.mutationKind,
        category: 'aggregate',
        estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
      });
    },
    planAuditOutbox: async () => {
      if (timing === 'direct_cancel' && plannedFinance) {
        return buildDirectClientCancellationAuditPlan({
          envelope,
          bookingId: envelope.intent.bookingId,
          paymentId: booking.paymentId,
          bookingRevision: plannedBookingRevision,
          paymentRevision: plannedFinance.paymentRevision,
          monetaryEventIds: plannedFinance.monetaryEvents.map((event) => event.eventId),
          reasonCode: accountOwnerCancellationReasonCode(),
          walletRevision: plannedFinance.walletRevision,
          walletAccountId: plannedFinance.walletAccountId,
        });
      }
      return buildPendingCancellationRequestAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        bookingRevision: plannedBookingRevision,
        issue:
          plannedIssue === undefined
            ? undefined
            : {
                issueId: plannedIssue.issueId,
                revision: plannedIssue.revision,
                effect: issueMutationKind === 'create' ? 'opened' : 'reused',
              },
      });
    },
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      if (timing === 'direct_cancel' && plannedFinance) {
        const updatedBooking = BookingSchema.parse({
          ...booking,
          lifecycle: {
            status: 'cancelled',
            cancelledAt: decidedAt,
            reasonCode: accountOwnerCancellationReasonCode(),
          },
          revision: plannedBookingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
        commitPlannedCancellationFinanceEffects(session, plannedFinance);
        commitPlannedReleaseBookingClaims(
          session,
          plannedReleaseClaims,
          metadata,
          context.decidedAt
        );
      } else {
        const updatedBooking = BookingSchema.parse({
          ...booking,
          lifecycle: {
            status: 'pending_cancellation',
            requestedAt: decidedAt,
          },
          revision: plannedBookingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
        if (plannedIssue !== undefined && issueMutationKind !== undefined) {
          const payload = toAdminIssueWritePayload(plannedIssue as Record<string, unknown>);
          if (issueMutationKind === 'create') {
            session.tx.create({ path: issueDocumentPath }, payload);
          } else {
            session.tx.update({ path: issueDocumentPath }, payload);
          }
        }
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function withdrawBookingCancellationRequestHandler(
  envelope: CommandEnvelope<'withdraw_booking_cancellation_request'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'withdraw_booking_cancellation_request'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'withdraw_booking_cancellation_request'> =
    {
      read: async (session) => {
        const bookingRead = await session.tx.get({ path: bookingDocumentPath });
        session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
        const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
        if (!parsedBooking || !isPendingCancellationIndividualBooking(parsedBooking)) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'unsupported' },
          });
        }
        booking = parsedBooking;

        const participantId = booking.party.participantIds[0]!;
        const actor = requireAccountActor(envelope);
        const accountDocumentPath = accountPath(actor.accountId);
        const accountRead = await session.tx.get({ path: accountDocumentPath });
        session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
        const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
        if (!account) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const participantRead = await session.tx.get({ path: participantPath(participantId) });
        session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
        const participant = parseParticipant(participantRead.exists ? participantRead.data : undefined);
        if (!participant || participant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participant.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participant.management.participantManagementId),
          category: 'aggregate',
        });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!management) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        assertAuthenticatedClientCancellationAuthorization(envelope, {
          account,
          participant,
          management,
          participantId,
        });

        plannedBookingRevision = nextAggregateRevision(booking.revision);
        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });
      },
      planAuditOutbox: async () =>
        buildWithdrawCancellationRequestAuditPlan({
          envelope,
          bookingId: envelope.intent.bookingId,
          bookingRevision: plannedBookingRevision,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const updatedBooking = BookingSchema.parse({
          ...booking,
          lifecycle: { status: 'confirmed' },
          revision: plannedBookingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function resolveBookingCancellationHandler(
  envelope: CommandEnvelope<'resolve_booking_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'resolve_booking_cancellation'>> {
  assertResolveBookingCancellationAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const decision = envelope.intent.decision;

  let booking!: Booking;
  let payment!: Payment;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseBookingClaims>> = [];
  let plannedFinance: Awaited<ReturnType<typeof planCancellationFinance>> | undefined;
  let plannedIssue: AdminIssue | undefined;
  let issueMutationKind: 'create' | 'update' | undefined;
  let issueDocumentPath = '';
  let lateOutcome: ReturnType<typeof resolveLateRejectionOutcome> | undefined;
  let auditSummary = '';
  let paymentEffectSummary: string | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'resolve_booking_cancellation'> = {
    read: async (session) => {
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking || parsedBooking.party.kind !== 'individual') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'unsupported' },
        });
      }
      booking = parsedBooking;
      if (isTerminalBookingLifecycle(booking)) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'conflict' },
        });
      }

      const now = timestampFromDate(environment.clock.decidedAt());
      plannedBookingRevision = nextAggregateRevision(booking.revision);
      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });

      if (decision === 'direct_cancel') {
        if (booking.lifecycle.status !== 'confirmed') {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'unsupported' },
          });
        }
        if (!envelope.intent.reasonExplanation?.trim()) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'reasonExplanation', reason: 'required' },
          });
        }
        const refundAmount = KztMinorUnitsSchema.parse(envelope.intent.refundAmount!);
        await loadPaymentAndPlanCancel(session, refundAmount, now);
        auditSummary = 'Administrator cancelled booking';
        paymentEffectSummary = 'Administrator cancellation refund applied';
        return;
      }

      if (!isPendingCancellationIndividualBooking(booking)) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'unsupported' },
        });
      }

      if (decision === 'approve') {
        const refundAmount = KztMinorUnitsSchema.parse(envelope.intent.refundAmount!);
        await loadPaymentAndPlanCancel(session, refundAmount, now);
        auditSummary = 'Administrator approved cancellation';
        paymentEffectSummary = 'Approved cancellation refund applied';
        return;
      }

      lateOutcome = resolveLateRejectionOutcome({
        now,
        booking,
        attendance: await readBookingAttendance(session, booking),
      });

      if (lateOutcome.outcome === 'missing_attendance') {
        const participantId = booking.party.participantIds[0]!;
        const issueIdentity = missingBookingAttendanceIdentity({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
          participantId,
        });
        issueDocumentPath = plannedAdminIssuePath(issueIdentity);
        const issueRead = await session.tx.get({ path: issueDocumentPath });
        session.plan.planRead({ path: issueDocumentPath, category: 'aggregate' });
        const existingIssue = parseExistingAdminIssueOrCollision(
          envelope.context.correlationId,
          issueRead.exists ? issueRead.data : undefined
        );
        const opened = openOrReuseAdminIssue({
          existing: existingIssue,
          identity: issueIdentity,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        });
        plannedIssue = opened.issue;
        issueMutationKind = opened.mutationKind;
        session.plan.planMutation({
          path: issueDocumentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
        auditSummary = 'Administrator rejected cancellation; attendance missing';
        return;
      }

      auditSummary =
        lateOutcome.outcome === 'confirmed'
          ? 'Administrator rejected cancellation'
          : `Administrator rejected cancellation; booking marked ${lateOutcome.outcome}`;
    },
    planAuditOutbox: async () =>
      buildResolveCancellationAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        paymentId: plannedFinance ? booking.paymentId : undefined,
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedFinance?.paymentRevision,
        monetaryEventIds: plannedFinance?.monetaryEvents.map((event) => event.eventId) ?? [],
        walletRevision: plannedFinance?.walletRevision,
        walletAccountId: plannedFinance?.walletAccountId,
        issue:
          plannedIssue === undefined
            ? undefined
            : {
                issueId: plannedIssue.issueId,
                revision: plannedIssue.revision,
                effect: issueMutationKind === 'create' ? 'opened' : 'reused',
              },
        summary: auditSummary,
        paymentEffectSummary,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      let lifecycle: Booking['lifecycle'];

      if (decision === 'approve' || decision === 'direct_cancel') {
        lifecycle = {
          status: 'cancelled',
          cancelledAt: decidedAt,
          reasonCode: administratorCancellationReasonCode(),
        };
      } else if (lateOutcome?.outcome === 'completed') {
        lifecycle = { status: 'completed', completedAt: decidedAt };
      } else if (lateOutcome?.outcome === 'no_show') {
        lifecycle = { status: 'no_show', noShowAt: decidedAt };
      } else {
        lifecycle = { status: 'confirmed' };
      }

      const updatedBooking = BookingSchema.parse({
        ...booking,
        lifecycle,
        revision: plannedBookingRevision,
        updatedAt: decidedAt,
        audit: {
          ...booking.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: bookingDocumentPath },
        toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
      );

      if (plannedFinance) {
        commitPlannedCancellationFinanceEffects(session, plannedFinance);
        commitPlannedReleaseBookingClaims(
          session,
          plannedReleaseClaims,
          metadata,
          context.decidedAt
        );
      }

      if (plannedIssue !== undefined && issueMutationKind !== undefined) {
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

  async function loadPaymentAndPlanCancel(
    session: Parameters<typeof planCancellationFinance>[0],
    refundAmount: KztMinorUnits,
    now: ReturnType<typeof timestampFromDate>
  ) {
    const paymentDocumentPath = paymentPath(booking.paymentId);
    const paymentRead = await session.tx.get({ path: paymentDocumentPath });
    session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
    const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
    if (!parsedPayment) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'paymentId', reason: 'conflict' },
      });
    }
    payment = parsedPayment;
    assertBookingPaymentIdentity(envelope.context.correlationId, booking, payment);
    assertRefundWithinRetained(payment, refundAmount);
    plannedFinance = await planCancellationFinance(session, {
      envelope,
      booking,
      payment,
      refundAmount,
      commandId: metadata.commandId,
      correlationId: metadata.correlationId,
      decidedAt: now,
      manualExternalReference: envelope.intent.manualExternalReference,
    });
    plannedReleaseClaims = await planReleaseBookingClaims(
      session,
      booking,
      metadata,
      environment.clock.decidedAt()
    );
  }

  async function readBookingAttendance(
    session: Parameters<typeof planCancellationFinance>[0],
    currentBooking: Booking
  ) {
    const participantId = currentBooking.party.participantIds[0]!;
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: currentBooking.occurrence.occurrenceId,
      participantId,
    });
    const documentPath = attendancePath(attendanceId);
    const attendanceRead = await session.tx.get({ path: documentPath });
    session.plan.planRead({ path: documentPath, category: 'aggregate' });
    return parseAttendance(attendanceRead.exists ? attendanceRead.data : undefined);
  }

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function routeRequestBookingCancellationHandler(
  envelope: CommandEnvelope<'request_booking_cancellation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestEnvironment: GuestBookingCommandEnvironment
): Promise<CommandResult<'request_booking_cancellation'>> {
  if (envelope.context.source === 'guest_callable') {
    return requestPendingGuestCancellationHandler(envelope, guestEnvironment, executor);
  }
  return requestAuthenticatedBookingCancellationHandler(envelope, environment, executor);
}

export function createBookingCancellationCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestEnvironmentFactory: (
    environment: CommandExecutionEnvironment
  ) => GuestBookingCommandEnvironment
): Pick<
  CommandHandlerMap,
  | 'request_booking_cancellation'
  | 'withdraw_booking_cancellation_request'
  | 'resolve_booking_cancellation'
> {
  return {
    request_booking_cancellation: (envelope, environment) =>
      routeRequestBookingCancellationHandler(
        envelope,
        environment,
        executor,
        guestEnvironmentFactory(environment)
      ),
    withdraw_booking_cancellation_request: (envelope, environment) =>
      withdrawBookingCancellationRequestHandler(envelope, environment, executor),
    resolve_booking_cancellation: (envelope, environment) =>
      resolveBookingCancellationHandler(envelope, environment, executor),
  };
}
