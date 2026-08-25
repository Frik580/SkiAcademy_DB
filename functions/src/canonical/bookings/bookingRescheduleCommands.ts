import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  bookingOccurrenceIdFromScheduleRevision,
  calculateIndividualBookingPriceKzt,
  commandSuccessResult,
  isSyntheticCourseInstructorId,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  nextBookingScheduleRevision,
  participantBlockIdFromDirection,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  resolveInstructorHourlyRateKzt,
  timestampFromDate,
  TimeIntervalSchema,
  canonicalTimestampToEpochMs,
  type AccountId,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorId,
  type Payment,
  type ParticipantManagement,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { mapFinanceDomainError } from '../finance/financeAuthorization';
import { accountPath, parseAccount, parsePayment, paymentPath } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import {
  commitPlannedBookingOccurrenceClaimSwap,
  planSwapBookingOccurrenceClaims,
  type BookingOccurrenceClaimSwapPlan,
} from './bookingClaimOperations';
import {
  assertAdminServiceChangeAuthorization,
  assertAdminServiceChangeReason,
  assertClientSelfServiceReschedulePolicy,
  assertNoActiveServiceBlockForReschedule,
  assertParticipantRecordForReschedule,
  assertRescheduleDurationMatches,
  assertRescheduleEligibleBookingState,
  resolveBookingRescheduleAuthorization,
  resolveRescheduleScheduleContext,
  type BookingRescheduleMode,
} from './bookingRescheduleAuthorization';
import {
  buildBookingServiceChangeAuditPlan,
  buildRescheduleBookingAuditPlan,
} from './bookingRescheduleAudit';
import {
  commitPlannedServicePriceChangeFinance,
  planServicePriceChangeFinance,
  type PlannedServicePriceChangeFinance,
} from './bookingRescheduleFinance';
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

function intervalWithDuration(
  startsAt: Booking['occurrence']['interval']['startsAt'],
  durationMinutes: number
): TimeInterval {
  const startMs = canonicalTimestampToEpochMs(startsAt);
  const endMs = startMs + durationMinutes * 60_000;
  return TimeIntervalSchema.parse({
    startsAt,
    endsAt: timestampFromDate(new Date(endMs)),
  });
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

function rescheduleBookingHandler(
  envelope: CommandEnvelope<'reschedule_booking'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'reschedule_booking'>> {
  resolveRescheduleScheduleContext(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let mode!: BookingRescheduleMode;
  let targetInterval!: TimeInterval;
  let targetInstructorId!: InstructorId;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let claimSwapPlan!: BookingOccurrenceClaimSwapPlan;
  let notificationAccountId: AccountId | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'reschedule_booking'> = {
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
      assertRescheduleEligibleBookingState(envelope.context.correlationId, booking);

      const paymentDocumentPath = paymentPath(booking.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const parsedPayment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!parsedPayment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { reason: 'conflict', resourceKind: 'booking' },
        });
      }

      const resolvedParticipantId = booking.party.participantIds[0]!;
      const participantDocumentPath = participantPath(resolvedParticipantId);
      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      const participant = assertParticipantRecordForReschedule(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );

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

      let management: ParticipantManagement | undefined;
      if (participant.management.kind === 'managed') {
        const managementDocumentPath = participantManagementPath(
          participant.management.participantManagementId
        );
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
        management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (management?.status === 'active') {
          notificationAccountId = management.accountId;
        }
      }

      const isAdministratorReschedule =
        administratorCapabilityExercisedByAccount(envelope.context) &&
        envelope.context.source === 'admin_callable';

      if (!isAdministratorReschedule) {
        if (participant.management.kind !== 'managed' || !management || management.status !== 'active') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
      }

      mode = resolveBookingRescheduleAuthorization(envelope, {
        account,
        participant,
        management,
        booking,
      });

      const schedule = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      );
      targetInterval = schedule.interval;
      targetInstructorId = booking.occurrence.instructorId;

      if (mode === 'client_self_service') {
        const decidedAtPreview = timestampFromDate(environment.clock.decidedAt());
        assertClientSelfServiceReschedulePolicy(envelope, booking, decidedAtPreview);
        assertRescheduleDurationMatches(envelope, booking, schedule.durationMinutes);
      }

      const managerBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: resolvedParticipantId,
          instructorId: targetInstructorId,
          createdByKind: 'participant_manager',
        })
      );
      const instructorBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: resolvedParticipantId,
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

      assertNoActiveServiceBlockForReschedule(envelope.context.correlationId, {
        account,
        participant,
        management,
        participantBlocks,
      }, targetInstructorId);

      plannedBookingRevision = nextAggregateRevision(booking.revision);

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

      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildRescheduleBookingAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        bookingRevision: plannedBookingRevision,
        mode,
        notificationAccountId,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const occurrence = buildRotatedOccurrence(booking, {
        instructorId: targetInstructorId,
        interval: targetInterval,
        decidedAt,
      });

      const updatedBooking = BookingSchema.parse({
        ...booking,
        occurrence,
        ...(mode === 'client_self_service'
          ? { clientSelfServiceRescheduleConsumedAt: decidedAt }
          : {}),
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

      const claimMetadata = {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
      };
      commitPlannedBookingOccurrenceClaimSwap(session, claimSwapPlan, claimMetadata, context.decidedAt);

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

function changeBookingInstructorHandler(
  envelope: CommandEnvelope<'change_booking_instructor'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'change_booking_instructor'>> {
  assertAdminServiceChangeAuthorization(envelope);
  assertAdminServiceChangeReason(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let payment!: Payment;
  let targetInstructorId!: InstructorId;
  let targetInterval!: TimeInterval;
  let newPrice!: ReturnType<typeof calculateIndividualBookingPriceKzt>;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let claimSwapPlan!: BookingOccurrenceClaimSwapPlan;
  let plannedFinance: PlannedServicePriceChangeFinance | undefined;
  let notificationAccountId: AccountId | undefined;
  const stagedMonetaryEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);
  let monetaryEventIds: typeof stagedMonetaryEventId[] = [];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'change_booking_instructor'> = {
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
      assertRescheduleEligibleBookingState(envelope.context.correlationId, booking);

      targetInstructorId = envelope.intent.instructorId;
      if (isSyntheticCourseInstructorId(targetInstructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'unsupported' },
        });
      }
      if (targetInstructorId === booking.occurrence.instructorId) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'unsupported' },
        });
      }

      const instructorDocumentPath = instructorCatalogPath(targetInstructorId);
      const instructorRead = await session.tx.get({ path: instructorDocumentPath });
      session.plan.planRead({ path: instructorDocumentPath, category: 'aggregate' });
      const instructorRecord = parseInstructorCatalog(
        targetInstructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!instructorRecord || instructorRecord.isAvailable === false) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }

      const durationMinutes = Math.round(
        (canonicalTimestampToEpochMs(booking.occurrence.interval.endsAt) -
          canonicalTimestampToEpochMs(booking.occurrence.interval.startsAt)) /
          60_000
      );
      newPrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        durationMinutes
      );
      targetInterval = booking.occurrence.interval;

      const paymentDocumentPath = paymentPath(booking.paymentId);
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

      const resolvedParticipantId = booking.party.participantIds[0]!;
      const participantDocumentPath = participantPath(resolvedParticipantId);
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

      const managerBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: resolvedParticipantId,
          instructorId: targetInstructorId,
          createdByKind: 'participant_manager',
        })
      );
      const instructorBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: resolvedParticipantId,
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

      assertNoActiveServiceBlockForReschedule(envelope.context.correlationId, {
        account,
        participant,
        management,
        participantBlocks,
      }, targetInstructorId);

      plannedBookingRevision = nextAggregateRevision(booking.revision);

      if (newPrice !== payment.price) {
        plannedFinance = await planServicePriceChangeFinance(session, {
          envelope,
          booking,
          payment,
          newPrice,
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          decidedAt: timestampFromDate(environment.clock.decidedAt()),
          fundingAmount: envelope.intent.fundingAmount,
          walletAccountId: envelope.intent.walletAccountId,
        });
        monetaryEventIds = [stagedMonetaryEventId];
      }

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

      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildBookingServiceChangeAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        paymentId: plannedFinance ? booking.paymentId : undefined,
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedFinance?.paymentRevision,
        monetaryEventIds,
        walletAccountId: plannedFinance?.walletAccountId,
        walletRevision: plannedFinance?.walletRevision,
        includeWalletEffect: plannedFinance?.includeWalletEffect ?? false,
        summary: 'Booking instructor changed',
        notificationAccountId,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const occurrence = buildRotatedOccurrence(booking, {
          instructorId: targetInstructorId,
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

        if (plannedFinance !== undefined && newPrice !== payment.price) {
          commitPlannedServicePriceChangeFinance(session, {
            envelope,
            booking,
            payment,
            newPrice,
            planned: plannedFinance,
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            decidedAt,
            fundingAmount: envelope.intent.fundingAmount,
          });
        }

        commitPlannedBookingOccurrenceClaimSwap(
          session,
          claimSwapPlan,
          { correlationId: metadata.correlationId, commandId: metadata.commandId },
          context.decidedAt
        );

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        mapFinanceDomainError(envelope, error);
        throw error;
      }
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

function changeBookingDurationHandler(
  envelope: CommandEnvelope<'change_booking_duration'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'change_booking_duration'>> {
  assertAdminServiceChangeAuthorization(envelope);
  assertAdminServiceChangeReason(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let payment!: Payment;
  let targetInterval!: TimeInterval;
  let newPrice!: ReturnType<typeof calculateIndividualBookingPriceKzt>;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let claimSwapPlan!: BookingOccurrenceClaimSwapPlan;
  let plannedFinance: PlannedServicePriceChangeFinance | undefined;
  let notificationAccountId: AccountId | undefined;
  const stagedMonetaryEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);
  let monetaryEventIds: typeof stagedMonetaryEventId[] = [];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'change_booking_duration'> = {
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
      assertRescheduleEligibleBookingState(envelope.context.correlationId, booking);

      const currentDurationMinutes = Math.round(
        (canonicalTimestampToEpochMs(booking.occurrence.interval.endsAt) -
          canonicalTimestampToEpochMs(booking.occurrence.interval.startsAt)) /
          60_000
      );
      if (envelope.intent.durationMinutes === currentDurationMinutes) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'durationMinutes', reason: 'unsupported' },
        });
      }

      targetInterval = intervalWithDuration(
        booking.occurrence.interval.startsAt,
        envelope.intent.durationMinutes
      );

      const instructorDocumentPath = instructorCatalogPath(booking.occurrence.instructorId);
      const instructorRead = await session.tx.get({ path: instructorDocumentPath });
      session.plan.planRead({ path: instructorDocumentPath, category: 'aggregate' });
      const instructorRecord = parseInstructorCatalog(
        booking.occurrence.instructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!instructorRecord) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }
      newPrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        envelope.intent.durationMinutes
      );

      const paymentDocumentPath = paymentPath(booking.paymentId);
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

      const resolvedParticipantId = booking.party.participantIds[0]!;
      const participantDocumentPath = participantPath(resolvedParticipantId);
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

      plannedBookingRevision = nextAggregateRevision(booking.revision);

      if (newPrice !== payment.price) {
        plannedFinance = await planServicePriceChangeFinance(session, {
          envelope,
          booking,
          payment,
          newPrice,
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          decidedAt: timestampFromDate(environment.clock.decidedAt()),
          fundingAmount: envelope.intent.fundingAmount,
          walletAccountId: envelope.intent.walletAccountId,
        });
        monetaryEventIds = [stagedMonetaryEventId];
      }

      const newOccurrenceId = bookingOccurrenceIdFromScheduleRevision(
        booking.bookingId,
        nextBookingScheduleRevision(booking.occurrence.scheduleRevision)
      );

      claimSwapPlan = await planSwapBookingOccurrenceClaims(session, {
        booking,
        newOccurrenceId,
        newInstructorId: booking.occurrence.instructorId,
        newInterval: targetInterval,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });

      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildBookingServiceChangeAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        paymentId: plannedFinance ? booking.paymentId : undefined,
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedFinance?.paymentRevision,
        monetaryEventIds,
        walletAccountId: plannedFinance?.walletAccountId,
        walletRevision: plannedFinance?.walletRevision,
        includeWalletEffect: plannedFinance?.includeWalletEffect ?? false,
        summary: 'Booking duration changed',
        notificationAccountId,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
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

        if (plannedFinance !== undefined && newPrice !== payment.price) {
          commitPlannedServicePriceChangeFinance(session, {
            envelope,
            booking,
            payment,
            newPrice,
            planned: plannedFinance,
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            decidedAt,
            fundingAmount: envelope.intent.fundingAmount,
          });
        }

        commitPlannedBookingOccurrenceClaimSwap(
          session,
          claimSwapPlan,
          { correlationId: metadata.correlationId, commandId: metadata.commandId },
          context.decidedAt
        );

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        mapFinanceDomainError(envelope, error);
        throw error;
      }
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

export function createBookingRescheduleCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  'reschedule_booking' | 'change_booking_instructor' | 'change_booking_duration'
> {
  return {
    reschedule_booking: (envelope, environment) =>
      rescheduleBookingHandler(envelope, environment, executor),
    change_booking_instructor: (envelope, environment) =>
      changeBookingInstructorHandler(envelope, environment, executor),
    change_booking_duration: (envelope, environment) =>
      changeBookingDurationHandler(envelope, environment, executor),
  };
}
