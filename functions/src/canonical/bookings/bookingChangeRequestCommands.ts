import {
  AggregateRevisionSchema,
  BookingChangeRequestSchema,
  BookingSchema,
  CanonicalCommandError,
  assertBookingPaymentIdentity,
  bookingOccurrenceIdFromScheduleRevision,
  commandSuccessResult,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  nextBookingScheduleRevision,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  KztMinorUnitsSchema,
  type AccountId,
  type Booking,
  type BookingChangeRequest,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorId,
  type Payment,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { accountPath, parseAccount, parsePayment, paymentPath } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import {
  assertNoActiveServiceBlockForReschedule,
  assertRescheduleDurationMatches,
  assertRescheduleEligibleBookingState,
} from './bookingRescheduleAuthorization';
import {
  assertRefundWithinRetained,
  commitPlannedCancellationFinanceEffects,
  planCancellationFinance,
} from './bookingCancellationFinance';
import {
  commitPlannedBookingOccurrenceClaimSwap,
  commitPlannedReleaseBookingClaims,
  planReleaseBookingClaims,
  planSwapBookingOccurrenceClaims,
  type BookingOccurrenceClaimSwapPlan,
} from './bookingClaimOperations';
import {
  assertCreateBookingChangeRequestAuthorization,
  assertOpenChangeRequestForMutation,
  assertResolveBookingChangeRequestAuthorization,
  assertResolveBookingRevisionTarget,
  assertWithdrawBookingChangeRequestAuthorization,
} from './bookingChangeRequestAuthorization';
import {
  buildCreateBookingChangeRequestAuditPlan,
  buildResolveBookingChangeRequestAuditPlan,
  buildWithdrawBookingChangeRequestAuditPlan,
} from './bookingChangeRequestAudit';
import {
  BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES,
  bookingChangeRequestPath,
  parseBookingChangeRequest,
  toFirestoreWritePayload as toChangeRequestWritePayload,
} from './bookingChangeRequestStore';
import { BOOKING_PLANNING_ESTIMATES, bookingPath, instructorCatalogPath, parseBooking, parseInstructorCatalog, toFirestoreWritePayload } from './bookingStore';

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

function buildRotatedOccurrence(
  booking: Booking,
  input: {
    instructorId: InstructorId;
    interval: TimeInterval;
    decidedAt: ReturnType<typeof timestampFromDate>;
  }
) {
  const scheduleRevision = nextBookingScheduleRevision(booking.occurrence.scheduleRevision);
  const occurrenceId = bookingOccurrenceIdFromScheduleRevision(booking.bookingId, scheduleRevision);
  return {
    ...booking.occurrence,
    occurrenceId,
    scheduleRevision,
    instructorId: input.instructorId,
    interval: input.interval,
    serviceParty: {
      participantIds: [...booking.occurrence.serviceParty.participantIds],
      frozenAt: booking.occurrence.serviceParty.frozenAt ?? input.decidedAt,
    },
  };
}

function createBookingChangeRequestHandler(
  envelope: CommandEnvelope<'create_booking_change_request'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_booking_change_request'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const changeRequestDocumentPath = bookingChangeRequestPath(envelope.intent.bookingChangeRequestId);

  let booking!: Booking;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_booking_change_request'> = {
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
      assertCreateBookingChangeRequestAuthorization(envelope, booking);

      const changeRequestRead = await session.tx.get({ path: changeRequestDocumentPath });
      session.plan.planRead({ path: changeRequestDocumentPath, category: 'aggregate' });
      if (changeRequestRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'conflict' },
        });
      }

      session.plan.planMutation({
        path: changeRequestDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES.requestBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCreateBookingChangeRequestAuditPlan({
        envelope,
        bookingChangeRequestId: envelope.intent.bookingChangeRequestId,
        bookingId: envelope.intent.bookingId,
        changeRequestRevision: AggregateRevisionSchema.parse(1),
        notificationAccountId: booking.payerAccountId,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const changeRequest = BookingChangeRequestSchema.parse({
        requestId: envelope.intent.bookingChangeRequestId,
        bookingId: envelope.intent.bookingId,
        requestType: 'instructor_unavailable',
        reason: envelope.intent.reason,
        lifecycle: { status: 'open' },
        revision: AggregateRevisionSchema.parse(1),
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: metadata.commandId,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.create(
        { path: changeRequestDocumentPath },
        toChangeRequestWritePayload(changeRequest as Record<string, unknown>)
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

function withdrawBookingChangeRequestHandler(
  envelope: CommandEnvelope<'withdraw_booking_change_request'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'withdraw_booking_change_request'>> {
  const metadata = metadataFromEnvelope(envelope);
  const changeRequestDocumentPath = bookingChangeRequestPath(envelope.intent.bookingChangeRequestId);

  let changeRequest!: BookingChangeRequest;
  let booking!: Booking;
  let plannedChangeRequestRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'withdraw_booking_change_request'> =
    {
      read: async (session) => {
        const changeRequestRead = await session.tx.get({ path: changeRequestDocumentPath });
        session.plan.planRead({ path: changeRequestDocumentPath, category: 'aggregate' });
        const parsedChangeRequest = assertOpenChangeRequestForMutation(
          envelope,
          parseBookingChangeRequest(changeRequestRead.exists ? changeRequestRead.data : undefined)
        );
        changeRequest = parsedChangeRequest;

        const bookingDocumentPath = bookingPath(changeRequest.bookingId);
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
        assertWithdrawBookingChangeRequestAuthorization(envelope, { changeRequest, booking });

        plannedChangeRequestRevision = nextAggregateRevision(changeRequest.revision);
        session.plan.planMutation({
          path: changeRequestDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES.requestBytes,
        });
      },
      planAuditOutbox: async () =>
        buildWithdrawBookingChangeRequestAuditPlan({
          envelope,
          bookingChangeRequestId: envelope.intent.bookingChangeRequestId,
          bookingId: changeRequest.bookingId,
          changeRequestRevision: plannedChangeRequestRevision,
          notificationAccountId: booking.payerAccountId,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const updatedChangeRequest = BookingChangeRequestSchema.parse({
          ...changeRequest,
          lifecycle: { status: 'cancelled', cancelledAt: decidedAt },
          revision: plannedChangeRequestRevision,
          updatedAt: decidedAt,
          audit: {
            ...changeRequest.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: changeRequestDocumentPath },
          toChangeRequestWritePayload(updatedChangeRequest as Record<string, unknown>)
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: changeRequestDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function resolveBookingChangeRequestHandler(
  envelope: CommandEnvelope<'resolve_booking_change_request'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'resolve_booking_change_request'>> {
  const metadata = metadataFromEnvelope(envelope);
  const resolution = envelope.intent.resolution;
  const changeRequestDocumentPath = bookingChangeRequestPath(envelope.intent.bookingChangeRequestId);

  let changeRequest!: BookingChangeRequest;
  let booking!: Booking;
  let payment!: Payment;
  let plannedChangeRequestRevision = AggregateRevisionSchema.parse(1);
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let claimSwapPlan: BookingOccurrenceClaimSwapPlan | undefined;
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseBookingClaims>> = [];
  let plannedFinance: Awaited<ReturnType<typeof planCancellationFinance>> | undefined;
  let targetInterval: TimeInterval | undefined;
  let notificationAccountId: AccountId | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'resolve_booking_change_request'> =
    {
      read: async (session) => {
        assertResolveBookingChangeRequestAuthorization(envelope);
        claimSwapPlan = undefined;
        plannedReleaseClaims = [];
        plannedFinance = undefined;
        targetInterval = undefined;
        notificationAccountId = undefined;

        const changeRequestRead = await session.tx.get({ path: changeRequestDocumentPath });
        session.plan.planRead({ path: changeRequestDocumentPath, category: 'aggregate' });
        const parsedChangeRequest = assertOpenChangeRequestForMutation(
          envelope,
          parseBookingChangeRequest(changeRequestRead.exists ? changeRequestRead.data : undefined)
        );
        changeRequest = parsedChangeRequest;

        const bookingDocumentPath = bookingPath(changeRequest.bookingId);
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
        assertResolveBookingRevisionTarget(envelope, booking, resolution);

        plannedChangeRequestRevision = nextAggregateRevision(changeRequest.revision);
        session.plan.planMutation({
          path: changeRequestDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES.requestBytes,
        });

        if (resolution === 'no_change') {
          return;
        }

        assertRescheduleEligibleBookingState(envelope.context.correlationId, booking);
        plannedBookingRevision = nextAggregateRevision(booking.revision);
        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });

        const participantId = booking.party.participantIds[0]!;
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
        notificationAccountId = management.accountId;

        const accountDocumentPath = accountPath(management.accountId);
        const accountRead = await session.tx.get({ path: accountDocumentPath });
        session.plan.planRead({ path: accountDocumentPath, category: 'authorization_check' });
        const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
        if (!account) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }

        const now = timestampFromDate(environment.clock.decidedAt());

        if (resolution === 'booking_cancelled') {
          const refundAmount = KztMinorUnitsSchema.parse(envelope.intent.refundAmount!);
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
          });
          plannedReleaseClaims = await planReleaseBookingClaims(
            session,
            booking,
            metadata,
            environment.clock.decidedAt()
          );
          return;
        }

        const schedule = resolveBookingScheduleFromCalendarInput(
          envelope.context.calendarInput!,
          envelope.context.timezone!
        );
        assertRescheduleDurationMatches(
          {
            ...envelope,
            kind: 'reschedule_booking',
            intent: { bookingId: booking.bookingId },
          },
          booking,
          schedule.durationMinutes
        );
        targetInterval = schedule.interval;
        const targetInstructorId = booking.occurrence.instructorId;

        const instructorRead = await session.tx.get({
          path: instructorCatalogPath(targetInstructorId),
        });
        session.plan.planRead({
          path: instructorCatalogPath(targetInstructorId),
          category: 'authorization_check',
        });
        const instructorRecord = parseInstructorCatalog(
          targetInstructorId,
          instructorRead.exists ? instructorRead.data : undefined
        );
        if (!instructorRecord || instructorRecord.isAvailable === false) {
          throw new CanonicalCommandError('unavailable', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'instructor', reason: 'conflict' },
          });
        }

        const managerBlockPath = participantBlockPath(
          participantBlockIdFromDirection({
            participantId,
            instructorId: targetInstructorId,
            createdByKind: 'participant_manager',
          })
        );
        const instructorBlockPath = participantBlockPath(
          participantBlockIdFromDirection({
            participantId,
            instructorId: targetInstructorId,
            createdByKind: 'instructor',
          })
        );
        const managerBlockRead = await session.tx.get({ path: managerBlockPath });
        session.plan.planRead({ path: managerBlockPath, category: 'authorization_check' });
        const instructorBlockRead = await session.tx.get({ path: instructorBlockPath });
        session.plan.planRead({ path: instructorBlockPath, category: 'authorization_check' });
        const participantBlocks = [
          parseParticipantBlock(managerBlockRead.exists ? managerBlockRead.data : undefined),
          parseParticipantBlock(instructorBlockRead.exists ? instructorBlockRead.data : undefined),
        ].filter((block): block is NonNullable<typeof block> => block !== undefined);

        assertNoActiveServiceBlockForReschedule(
          envelope.context.correlationId,
          { account, participant, management, participantBlocks },
          targetInstructorId
        );

        const newOccurrenceId = bookingOccurrenceIdFromScheduleRevision(
          booking.bookingId,
          nextBookingScheduleRevision(booking.occurrence.scheduleRevision)
        );
        claimSwapPlan = await planSwapBookingOccurrenceClaims(session, {
          booking,
          newOccurrenceId,
          newInstructorId: targetInstructorId,
          newInterval: targetInterval,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
        });
      },
      planAuditOutbox: async () =>
        buildResolveBookingChangeRequestAuditPlan({
          envelope,
          bookingChangeRequestId: envelope.intent.bookingChangeRequestId,
          bookingId: changeRequest.bookingId,
          changeRequestRevision: plannedChangeRequestRevision,
          bookingRevision: resolution === 'no_change' ? undefined : plannedBookingRevision,
          paymentId: plannedFinance ? booking.paymentId : undefined,
          paymentRevision: plannedFinance?.paymentRevision,
          monetaryEventIds: plannedFinance?.monetaryEvents.map((event) => event.eventId) ?? [],
          walletRevision: plannedFinance?.walletRevision,
          walletAccountId: plannedFinance?.walletAccountId,
          notificationAccountId,
          resolution,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const updatedChangeRequest = BookingChangeRequestSchema.parse({
          ...changeRequest,
          lifecycle: {
            status: 'resolved',
            resolvedAt: decidedAt,
            resolution,
          },
          revision: plannedChangeRequestRevision,
          updatedAt: decidedAt,
          audit: {
            ...changeRequest.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: changeRequestDocumentPath },
          toChangeRequestWritePayload(updatedChangeRequest as Record<string, unknown>)
        );

        if (resolution === 'no_change') {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        const bookingDocumentPath = bookingPath(changeRequest.bookingId);

        if (resolution === 'booking_cancelled' && plannedFinance) {
          const updatedBooking = BookingSchema.parse({
            ...booking,
            lifecycle: {
              status: 'cancelled',
              cancelledAt: decidedAt,
              reasonCode: 'booking_change_request',
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
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        if (resolution === 'rescheduled' && claimSwapPlan && targetInterval) {
          const occurrence = buildRotatedOccurrence(booking, {
            instructorId: booking.occurrence.instructorId,
            interval: targetInterval,
            decidedAt,
          });
          const updatedBooking = BookingSchema.parse({
            ...booking,
            occurrence,
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
          commitPlannedBookingOccurrenceClaimSwap(session, claimSwapPlan, metadata, context.decidedAt);
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: changeRequestDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

export function createBookingChangeRequestCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  | 'create_booking_change_request'
  | 'withdraw_booking_change_request'
  | 'resolve_booking_change_request'
> {
  return {
    create_booking_change_request: (envelope, environment) =>
      createBookingChangeRequestHandler(envelope, environment, executor),
    withdraw_booking_change_request: (envelope, environment) =>
      withdrawBookingChangeRequestHandler(envelope, environment, executor),
    resolve_booking_change_request: (envelope, environment) =>
      resolveBookingChangeRequestHandler(envelope, environment, executor),
  };
}
