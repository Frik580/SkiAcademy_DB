import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  accountActorRef,
  applyExternalPaymentFunding,
  calculateIndividualBookingPriceKzt,
  calculateLessonPartyPriceKzt,
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
  type LessonPricingSettings,
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
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import {
  assertAdminUnderpaymentReason,
  assertBookingScheduleContext,
  assertNoActiveServiceBlock,
  assertParticipantRecord,
  normalizeBookingParticipantIds,
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
import { planAcquireBookingOccurrenceClaims } from './bookingClaimOperations';
import {
  LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
  parseLessonPricingSettings,
} from '../pricing/lessonPricingSettingsStore';

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
  assertBookingScheduleContext(envelope);

  const participantIds = normalizeBookingParticipantIds(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const paymentId = paymentIdFromBookingId(envelope.intent.bookingId);
  const paymentPathValue = `payments/${paymentId}`;
  const occurrenceId = initialBookingOccurrenceIdFromBookingId(envelope.intent.bookingId);
  const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);

  let participantRecords: Participant[] = [];
  let managementRecords: ParticipantManagement[] = [];
  let payerAccountRecord!: ReturnType<typeof parseAccount>;
  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let authorization!: ReturnType<typeof resolveBookingCreationAuthorization>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let servicePrice!: KztMinorUnits;
  let baseLessonPrice!: KztMinorUnits;
  let pricingSettings!: LessonPricingSettings;
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
  let occurrenceClaimPlans!: Awaited<ReturnType<typeof planAcquireBookingOccurrenceClaims>>;
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

      const pricingSettingsRead = await session.tx.get({
        path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
      });
      session.plan.planRead({
        path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
        category: 'aggregate',
      });
      const currentPricingSettings = parseLessonPricingSettings(
        pricingSettingsRead.exists ? pricingSettingsRead.data : undefined
      );
      if (!currentPricingSettings) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'lessonPricingSettings', reason: 'required' },
        });
      }
      pricingSettings = currentPricingSettings;

      participantRecords = [];
      managementRecords = [];
      for (const participantId of participantIds) {
        const participantDocumentPath = participantPath(participantId);
        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        const participant = assertParticipantRecord(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );
        if (participant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const managementDocumentPath = participantManagementPath(
          participant.management.participantManagementId
        );
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({
          path: managementDocumentPath,
          category: 'authorization_check',
        });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!management || management.status !== 'active') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        participantRecords.push(participant);
        managementRecords.push(management);
      }

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
        participants: participantRecords,
        managements: managementRecords,
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

      for (let index = 0; index < participantRecords.length; index += 1) {
        const participant = participantRecords[index]!;
        const management = managementRecords[index]!;
        const blockPaths = ['participant_manager', 'instructor'].map((createdByKind) =>
          participantBlockPath(
            participantBlockIdFromDirection({
              participantId: participant.participantId,
              instructorId: envelope.intent.instructorId,
              createdByKind: createdByKind as 'participant_manager' | 'instructor',
            })
          )
        );
        const blocksForParticipant: ParticipantBlock[] = [];
        for (const blockPath of blockPaths) {
          const blockRead = await session.tx.get({ path: blockPath });
          session.plan.planRead({ path: blockPath, category: 'authorization_check' });
          const block = parseParticipantBlock(blockRead.exists ? blockRead.data : undefined);
          if (block) {
            blocksForParticipant.push(block);
          }
        }
        assertNoActiveServiceBlock(
          envelope,
          {
            account: payerAccountRecord,
            participant,
            management,
            participantBlocks: blocksForParticipant,
          },
          envelope.intent.instructorId
        );
      }

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
      baseLessonPrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        schedule.durationMinutes
      );
      if (participantIds.length > pricingSettings.maxParticipantsPerLesson) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'participantIds', reason: 'conflict' },
        });
      }
      servicePrice = calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: baseLessonPrice,
        additionalParticipantSurchargePerHourKzt:
          pricingSettings.additionalParticipantSurchargePerHourKzt,
        participantCount: participantIds.length,
        lessonDurationMinutes: schedule.durationMinutes,
      });

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
      occurrenceClaimPlans = await planAcquireBookingOccurrenceClaims(session, {
        bookingId: envelope.intent.bookingId,
        occurrenceId,
        instructorId: envelope.intent.instructorId,
        participantIds,
        interval: schedule.interval,
        ...claimMetadata,
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
        const partyParticipantIds = participantIds;
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
          pricingSnapshot: {
            strategyVersion: 'lesson_party:v1',
            baseLessonPriceKzt: baseLessonPrice,
            additionalParticipantSurchargePerHourKzt:
              pricingSettings.additionalParticipantSurchargePerHourKzt,
            settingsRevision: pricingSettings.revision,
            lessonDurationMinutes: schedule.durationMinutes,
            participantCount: partyParticipantIds.length,
            totalPriceKzt: servicePrice,
          },
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
        commitResourceClaimPlan(session, occurrenceClaimPlans.instructorClaimPlan, claimMetadata);
        for (const participantClaimPlan of occurrenceClaimPlans.participantClaimPlans) {
          commitResourceClaimPlan(session, participantClaimPlan, claimMetadata);
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

export function createBookingCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'create_confirmed_booking' | 'enforce_payment_start_gate'> {
  return {
    create_confirmed_booking: (envelope, environment) =>
      createConfirmedBookingHandler(envelope, environment, executor),
    ...createPaymentStartGateCommandHandler(executor),
  };
}
