import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  ResourceClaimIdentityInputSchema,
  accountActorRef,
  applyExternalPaymentFunding,
  calculateIndividualBookingPriceKzt,
  commandSuccessResult,
  deriveBookingPartyKind,
  initialBookingOccurrenceIdFromBookingId,
  isPaymentFullyFundedForService,
  isSyntheticCourseInstructorId,
  lessonContentFields,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  paymentEffectFromProjectionChange,
  paymentIdFromBookingId,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  resolveInstructorHourlyRateKzt,
  timestampFromDate,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type MonetaryEvent,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type Payment,
  type PaymentAccountingFields,
  type PaymentAccountingProjection,
  type Wallet,
  KztMinorUnits,
  KztMinorUnitsSchema,
  debitWalletBalance,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { mapFinanceDomainError } from '../finance/financeAuthorization';
import {
  FINANCE_PLANNING_ESTIMATES,
  accountPath,
  initialWallet,
  mergeWalletBalance,
  monetaryEventPath,
  parseAccount,
  parseWallet,
  walletPath,
} from '../finance/financeStore';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
} from '../resourceClaims/resourceClaimEngine';
import {
  assertAdminUnderpaymentReason,
  assertBookingScheduleContext,
  assertIndividualBookingParticipantCount,
  assertNoActiveServiceBlock,
  assertParticipantRecord,
  resolveBookingCreationAuthorization,
} from './bookingAuthorization';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import { buildCreateConfirmedBookingAuditPlan } from './bookingAudit';
import {
  BOOKING_PLANNING_ESTIMATES,
  bookingPath,
  instructorCatalogPath,
  parseInstructorCatalog,
  toFirestoreWritePayload,
} from './bookingStore';
import { createPaymentStartGateCommandHandler } from './paymentStartGate';

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

function revisionAuditLink(envelope: CommandEnvelope, metadata: CommandMetadata) {
  return {
    createdByCommandId: metadata.commandId,
    lastChangedByCommandId: metadata.commandId,
    correlationId: metadata.correlationId,
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

function initialUnpaidPaymentFields(price: KztMinorUnits): PaymentAccountingFields {
  return {
    originalPrice: price,
    price,
    paidAmount: KztMinorUnitsSchema.parse(0),
    refundedAmount: KztMinorUnitsSchema.parse(0),
    retainedAmount: KztMinorUnitsSchema.parse(0),
    settledAmount: KztMinorUnitsSchema.parse(0),
    writtenOffAmount: KztMinorUnitsSchema.parse(0),
    outstandingAmount: price,
  };
}

function createConfirmedBookingHandler(
  envelope: CommandEnvelope<'create_confirmed_booking'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_confirmed_booking'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertIndividualBookingParticipantCount(envelope);
  assertBookingScheduleContext(envelope);

  const participantId = envelope.intent.participantIds[0]!;
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const paymentId = paymentIdFromBookingId(envelope.intent.bookingId);
  const paymentPathValue = `payments/${paymentId}`;
  const occurrenceId = initialBookingOccurrenceIdFromBookingId(envelope.intent.bookingId);
  const participantDocumentPath = participantPath(participantId);
  const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);
  const managerBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId,
      instructorId: envelope.intent.instructorId,
      createdByKind: 'participant_manager',
    })
  );
  const instructorBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId,
      instructorId: envelope.intent.instructorId,
      createdByKind: 'instructor',
    })
  );

  let participantRecord!: Participant;
  let managementRecord!: ParticipantManagement;
  let payerAccountRecord!: ReturnType<typeof parseAccount>;
  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let authorization!: ReturnType<typeof resolveBookingCreationAuthorization>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let servicePrice!: KztMinorUnits;
  let walletRecord: Wallet | undefined;
  let walletExists = false;
  let walletDocumentPath = '';
  let plannedWalletRevision = AggregateRevisionSchema.parse(1);
  let plannedWalletEventRevision = AggregateRevisionSchema.parse(0);
  const plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentEventRevision = AggregateRevisionSchema.parse(0);
  const plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let walletFunding = KztMinorUnitsSchema.parse(0);
  let paymentProjection!: PaymentAccountingProjection;
  let participantBlocks: ParticipantBlock[] = [];
  let instructorClaimPlan!: Awaited<ReturnType<typeof readAndPlanAcquireResourceClaim>>;
  let participantClaimPlan!: Awaited<ReturnType<typeof readAndPlanAcquireResourceClaim>>;
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);
  let includeWalletEffect = false;
  let stageMonetaryEvent = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_confirmed_booking'> = {
    read: async (session) => {
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      if (bookingRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }

      const paymentRead = await session.tx.get({ path: paymentPathValue });
      session.plan.planRead({ path: paymentPathValue, category: 'payment_wallet' });
      if (paymentRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantRecord(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );
      if (participantRecord.management.kind !== 'managed') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const managementRead = await session.tx.get({
        path: participantManagementPath(participantRecord.management.participantManagementId),
      });
      session.plan.planRead({
        path: participantManagementPath(participantRecord.management.participantManagementId),
        category: 'authorization_check',
      });
      const parsedManagement = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!parsedManagement || parsedManagement.status !== 'active') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }
      managementRecord = parsedManagement;

      const actor = requireAccountActor(envelope);
      const actorAccountRead = await session.tx.get({
        path: accountPath(actor.accountId),
      });
      session.plan.planRead({
        path: accountPath(actor.accountId),
        category: 'authorization_check',
      });
      const actorAccount = parseAccount(
        actorAccountRead.exists ? actorAccountRead.data : undefined
      );
      if (!actorAccount || actorAccount.lifecycle.status !== 'active') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      authorization = resolveBookingCreationAuthorization(envelope, {
        account: actorAccount,
        participant: participantRecord,
        management: managementRecord,
      });

      const payerAccountRead = await session.tx.get({
        path: accountPath(authorization.payerAccountId),
      });
      session.plan.planRead({
        path: accountPath(authorization.payerAccountId),
        category: 'authorization_check',
      });
      payerAccountRecord = parseAccount(
        payerAccountRead.exists ? payerAccountRead.data : undefined
      );
      if (!payerAccountRecord || payerAccountRecord.lifecycle.status !== 'active') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const managerBlockRead = await session.tx.get({ path: managerBlockPath });
      session.plan.planRead({ path: managerBlockPath, category: 'authorization_check' });
      const instructorBlockRead = await session.tx.get({ path: instructorBlockPath });
      session.plan.planRead({ path: instructorBlockPath, category: 'authorization_check' });
      participantBlocks = [
        parseParticipantBlock(managerBlockRead.exists ? managerBlockRead.data : undefined),
        parseParticipantBlock(instructorBlockRead.exists ? instructorBlockRead.data : undefined),
      ].filter((block): block is ParticipantBlock => block !== undefined);

      assertNoActiveServiceBlock(
        envelope,
        {
          account: payerAccountRecord,
          participant: participantRecord,
          management: managementRecord,
          participantBlocks,
        },
        envelope.intent.instructorId
      );

      const instructorRead = await session.tx.get({ path: instructorDocumentPath });
      session.plan.planRead({ path: instructorDocumentPath, category: 'authorization_check' });
      const parsedInstructor = parseInstructorCatalog(
        envelope.intent.instructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!parsedInstructor || isSyntheticCourseInstructorId(envelope.intent.instructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }
      instructorRecord = parsedInstructor;
      if (instructorRecord.isAvailable === false) {
        throw new CanonicalCommandError('unavailable', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'instructor', reason: 'conflict' },
        });
      }

      schedule = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      );
      servicePrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        schedule.durationMinutes
      );

      walletDocumentPath = walletPath(authorization.payerAccountId);
      const walletRead = await session.tx.get({ path: walletDocumentPath });
      session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
      walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
      walletExists = walletRead.exists;
      const walletBalance = walletRecord?.balance ?? 0;

      if (authorization.mode === 'account_self_service') {
        if (walletBalance < servicePrice) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        walletFunding = KztMinorUnitsSchema.parse(servicePrice);
        paymentProjection = applyExternalPaymentFunding(
          initialUnpaidPaymentFields(servicePrice),
          walletFunding
        );
        if (!isPaymentFullyFundedForService(paymentProjection)) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        includeWalletEffect = true;
        stageMonetaryEvent = true;
      } else {
        walletFunding = KztMinorUnitsSchema.parse(Math.min(walletBalance, servicePrice));
        paymentProjection =
          walletFunding > 0
            ? applyExternalPaymentFunding(initialUnpaidPaymentFields(servicePrice), walletFunding)
            : { ...initialUnpaidPaymentFields(servicePrice), paymentStatus: 'unpaid' };
        assertAdminUnderpaymentReason(envelope, paymentProjection.outstandingAmount);
        includeWalletEffect = walletFunding > 0;
        stageMonetaryEvent = walletFunding > 0;
      }

      plannedPaymentEventRevision = stageMonetaryEvent
        ? AggregateRevisionSchema.parse(1)
        : AggregateRevisionSchema.parse(0);

      plannedWalletRevision = walletExists
        ? nextAggregateRevision(walletRecord!.revision)
        : AggregateRevisionSchema.parse(1);
      plannedWalletEventRevision = walletExists
        ? nextAggregateRevision(walletRecord!.eventRevision)
        : AggregateRevisionSchema.parse(1);

      const claimMetadata = {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      };
      const instructorIdentity = ResourceClaimIdentityInputSchema.parse({
        strategyVersion: 'claim:v1',
        claimKind: 'instructor_booking_occurrence',
        resourceKind: 'instructor',
        resourceId: envelope.intent.instructorId,
        ownerKind: 'booking',
        ownerId: envelope.intent.bookingId,
        occurrenceId,
      });
      const participantIdentity = ResourceClaimIdentityInputSchema.parse({
        strategyVersion: 'claim:v1',
        claimKind: 'participant_booking_occurrence',
        resourceKind: 'participant',
        resourceId: participantId,
        ownerKind: 'booking',
        ownerId: envelope.intent.bookingId,
        occurrenceId,
      });

      instructorClaimPlan = await readAndPlanAcquireResourceClaim(session, {
        ...claimMetadata,
        identity: instructorIdentity,
        interval: schedule.interval,
      });
      participantClaimPlan = await readAndPlanAcquireResourceClaim(session, {
        ...claimMetadata,
        identity: participantIdentity,
        interval: schedule.interval,
      });

      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
      session.plan.planMutation({
        path: paymentPathValue,
        kind: 'create',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
      });
      if (includeWalletEffect) {
        session.plan.planMutation({
          path: walletDocumentPath,
          kind: walletExists ? 'update' : 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });
      }
      if (stageMonetaryEvent) {
        session.plan.planMutation({
          path: monetaryEventPath(stagedEventId),
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildCreateConfirmedBookingAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        paymentId,
        monetaryEventIds: stageMonetaryEvent ? [stagedEventId] : [],
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedPaymentRevision,
        mode: authorization.mode,
        underfunded: paymentProjection.outstandingAmount > 0,
        includeWalletEffect,
        notificationAccountId: authorization.bookedByAccountId,
        walletRevision: includeWalletEffect ? plannedWalletRevision : undefined,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const audit = revisionAuditLink(envelope, metadata);
        const partyParticipantIds = [participantId];
        const booking: Booking = BookingSchema.parse({
          bookingId: envelope.intent.bookingId,
          attribution: {
            bookingOrigin: authorization.mode === 'administrator' ? 'admin' : 'account',
            bookedBy: accountActorRef(authorization.bookedByAccountId),
          },
          party: {
            kind: deriveBookingPartyKind(partyParticipantIds.length),
            participantIds: partyParticipantIds,
          },
          occurrence: {
            occurrenceId,
            instructorId: envelope.intent.instructorId,
            interval: schedule.interval,
            timeZone: envelope.context.timezone!,
            scheduleRevision: 1,
            serviceParty: {
              participantIds: partyParticipantIds,
              frozenAt: decidedAt,
            },
          },
          lifecycle: { status: 'confirmed' },
          paymentId,
          payerAccountId: authorization.payerAccountId,
          ...lessonContentFields({
            difficulty: envelope.intent.difficulty,
            notes: envelope.intent.notes,
          }),
          revision: plannedBookingRevision,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        });

        const payment: Payment = PaymentSchema.parse({
          paymentId,
          subjectType: 'booking',
          subjectId: envelope.intent.bookingId,
          currency: 'KZT',
          originalPrice: paymentProjection.originalPrice,
          price: paymentProjection.price,
          paidAmount: paymentProjection.paidAmount,
          refundedAmount: paymentProjection.refundedAmount,
          retainedAmount: paymentProjection.retainedAmount,
          settledAmount: paymentProjection.settledAmount,
          writtenOffAmount: paymentProjection.writtenOffAmount,
          outstandingAmount: paymentProjection.outstandingAmount,
          paymentStatus: paymentProjection.paymentStatus,
          payerAccountId: authorization.payerAccountId,
          incrementalRequirements: [],
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        });

        session.tx.create(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(booking as Record<string, unknown>)
        );
        session.tx.create(
          { path: paymentPathValue },
          financeToFirestoreWritePayload(payment as Record<string, unknown>)
        );

        if (includeWalletEffect) {
          const wallet = walletRecord ?? initialWallet(authorization.payerAccountId, decidedAt);
          const newBalance = debitWalletBalance(wallet.balance, walletFunding);
          const updatedWallet = mergeWalletBalance(wallet, newBalance, {
            revision: plannedWalletRevision,
            eventRevision: plannedWalletEventRevision,
            updatedAt: decidedAt,
          });
          if (walletExists) {
            session.tx.update(
              { path: walletDocumentPath },
              financeToFirestoreWritePayload(updatedWallet as Record<string, unknown>)
            );
          } else {
            session.tx.create(
              { path: walletDocumentPath },
              financeToFirestoreWritePayload(updatedWallet as Record<string, unknown>)
            );
          }
        }

        if (stageMonetaryEvent) {
          const beforePayment = initialUnpaidPaymentFields(servicePrice);
          const monetaryEvent: MonetaryEvent = {
            eventId: stagedEventId,
            eventKind: 'booking_charge',
            currency: 'KZT',
            paymentId,
            subjectType: 'booking',
            subjectId: envelope.intent.bookingId,
            ...(includeWalletEffect
              ? {
                  walletAccountId: authorization.payerAccountId,
                  walletBalanceDelta: -walletFunding,
                }
              : {}),
            paymentEffect: paymentEffectFromProjectionChange(beforePayment, paymentProjection),
            sourceKind: includeWalletEffect ? 'wallet' : 'manual_external',
            payerAccountIdAtEvent: authorization.payerAccountId,
            actor: monetaryActorFromEnvelope(envelope),
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            paymentEventRevision: plannedPaymentEventRevision,
            ...(includeWalletEffect ? { walletEventRevision: plannedWalletEventRevision } : {}),
            occurredAt: decidedAt,
            recordedAt: decidedAt,
          };
          session.tx.create(
            { path: monetaryEventPath(stagedEventId) },
            financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
          );
        }

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };
        commitResourceClaimPlan(session, instructorClaimPlan, claimMetadata);
        commitResourceClaimPlan(session, participantClaimPlan, claimMetadata);

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

export function createBookingCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'create_confirmed_booking' | 'enforce_payment_start_gate'> {
  return {
    create_confirmed_booking: (envelope, environment) =>
      createConfirmedBookingHandler(envelope, environment, executor),
    ...createPaymentStartGateCommandHandler(executor),
  };
}
