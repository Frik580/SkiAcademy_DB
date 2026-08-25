import {
  AggregateRevisionSchema,
  BookingSchema,
  CanonicalCommandError,
  InsufficientWalletFundsError,
  PaymentSchema,
  assertBookingPaymentIdentity,
  calculateIndividualBookingPriceKzt,
  commandSuccessResult,
  computePartyAfterMutation,
  createIncrementalRequirement,
  derivePartyKindFromCount,
  distributeFundingAcrossIncrementalRequirements,
  incrementalRequirementIdFromPartyAddition,
  applyPartyPriceDecrease,
  applyPartyPriceIncrease,
  calculateAdminLateRemoveRefundAmountKzt,
  calculateSelfServiceRemoveRefundBasisKzt,
  creditWalletBalance,
  debitWalletBalance,
  listUnpaidActiveIncrementalRequirements,
  markIncrementalRequirementRolledBack,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  partitionAddedParticipantsByMarginalDelta,
  validatePartyParticipantIds,
  paymentEffectFromProjectionChange,
  resolveAuthoritativePartyPrices,
  resolveCommandIdempotencyIdentity,
  calculateFamilyGroupBookingPriceKzt,
  derivePaymentStatus,
  resolveInstructorHourlyRateKzt,
  resolveRefundDestination,
  compareCanonicalTimestamps,
  timestampFromDate,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type IncrementalRequirement,
  type MonetaryEvent,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type Payment,
  type PaymentAccountingProjection,
  type Wallet,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { mapFinanceDomainError } from '../finance/financeAuthorization';
import {
  FINANCE_PLANNING_ESTIMATES,
  mergeWalletBalance,
  monetaryEventPath,
  parseAccount,
  parsePayment,
  parseWallet,
  paymentAccountingFields,
  paymentPath,
  accountPath,
  walletPath,
  toFirestoreWritePayload as financeToFirestoreWritePayload,
} from '../finance/financeStore';
import {
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import { participantBlockIdFromDirection } from '@ski-academy/shared-domain';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import {
  assertAuthorizedForPartyParticipants,
  assertClientSelfServicePartyBookingAccess,
  assertNoActiveServiceBlockForPartyParticipant,
  assertPartyChangeEligibleBooking,
  assertPartyChangeTiming,
  assertValidatedNextParty,
  resolveBookingPartyChangeAuthorization,
  resolveRollbackAuthorization,
  type BookingPartyChangeMode,
} from './bookingPartyAuthorization';
import {
  buildChangeBookingPartyAuditPlan,
  buildRollbackUnpaidBookingPartyAdditionsAuditPlan,
  buildServicePartyFreezeAtStartAuditPlan,
} from './bookingPartyAudit';
import {
  planAcquireParticipantBookingClaim,
  planReleaseParticipantBookingClaim,
} from './bookingClaimOperations';
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

function individualLessonPriceFromBooking(
  instructorRecord: NonNullable<ReturnType<typeof parseInstructorCatalog>>,
  booking: Booking
): ReturnType<typeof KztMinorUnitsSchema.parse> {
  const hourlyRate = resolveInstructorHourlyRateKzt(instructorRecord);
  const durationMinutes = Math.round(
    (booking.occurrence.interval.endsAt.seconds * 1_000 +
      booking.occurrence.interval.endsAt.nanoseconds / 1_000_000 -
      (booking.occurrence.interval.startsAt.seconds * 1_000 +
        booking.occurrence.interval.startsAt.nanoseconds / 1_000_000)) /
      60_000
  );
  return calculateIndividualBookingPriceKzt(hourlyRate, durationMinutes);
}

function changeBookingPartyHandler(
  envelope: CommandEnvelope<'change_booking_party'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'change_booking_party'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);
  const participantIdsToAdd = envelope.intent.participantIdsToAdd ?? [];
  const participantIdsToRemove = envelope.intent.participantIdsToRemove ?? [];

  let booking!: Booking;
  let payment!: Payment;
  let mode!: BookingPartyChangeMode;
  let nextParticipantIds!: Booking['party']['participantIds'];
  let individualLessonPrice!: ReturnType<typeof KztMinorUnitsSchema.parse>;
  let accountRecord: ReturnType<typeof parseAccount> | undefined;
  let walletRecord: Wallet | undefined;
  let walletDocumentPath = '';
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentEventRevision = AggregateRevisionSchema.parse(0);
  let plannedWalletRevision: Wallet['revision'] | undefined;
  let acquireClaimPlans: Awaited<ReturnType<typeof planAcquireParticipantBookingClaim>>[] = [];
  let releaseClaimPlans: Awaited<ReturnType<typeof planReleaseParticipantBookingClaim>>[] = [];
  let fundingAmount = KztMinorUnitsSchema.parse(0);
  let refundAmount = KztMinorUnitsSchema.parse(0);
  let priceDelta = 0;
  let nextPrice = KztMinorUnitsSchema.parse(0);
  let newIncrementalRequirements: IncrementalRequirement[] = [];
  let includeWalletEffect = false;
  let includeMonetaryEvent = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'change_booking_party'> = {
    read: async (session) => {
      const decidedAt = timestampFromDate(environment.clock.now());
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
      assertPartyChangeEligibleBooking(envelope, booking);

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

      const instructorRead = await session.tx.get({
        path: instructorCatalogPath(booking.occurrence.instructorId),
      });
      session.plan.planRead({
        path: instructorCatalogPath(booking.occurrence.instructorId),
        category: 'aggregate',
      });
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
      individualLessonPrice = individualLessonPriceFromBooking(instructorRecord, booking);

      nextParticipantIds = computePartyAfterMutation({
        currentParticipantIds: booking.party.participantIds,
        participantIdsToAdd,
        participantIdsToRemove,
      }) as Booking['party']['participantIds'];
      assertValidatedNextParty(envelope, nextParticipantIds);

      for (const participantId of participantIdsToRemove) {
        if (!booking.party.participantIds.includes(participantId)) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'participantIdsToRemove', reason: 'conflict' },
          });
        }
      }
      for (const participantId of participantIdsToAdd) {
        if (booking.party.participantIds.includes(participantId)) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'participantIdsToAdd', reason: 'conflict' },
          });
        }
      }

      const actor = requireAccountActor(envelope);
      const actorAccountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const actorAccount = parseAccount(actorAccountRead.exists ? actorAccountRead.data : undefined);
      if (!actorAccount) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      accountRecord = actorAccount;

      mode = resolveBookingPartyChangeAuthorization(envelope, {
        account: accountRecord,
        booking,
      });
      assertPartyChangeTiming(envelope, booking, mode, decidedAt);

      if (mode === 'client_self_service') {
        const anchorParticipantId = booking.party.participantIds[0];
        const anchorRead = await session.tx.get({ path: participantPath(anchorParticipantId) });
        session.plan.planRead({ path: participantPath(anchorParticipantId), category: 'authorization_check' });
        const anchorParticipant = parseParticipant(
          anchorRead.exists ? anchorRead.data : undefined
        );
        if (!anchorParticipant || anchorParticipant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        const anchorManagementRead = await session.tx.get({
          path: participantManagementPath(anchorParticipant.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(anchorParticipant.management.participantManagementId),
          category: 'authorization_check',
        });
        const anchorManagement = parseParticipantManagement(
          anchorManagementRead.exists ? anchorManagementRead.data : undefined
        );
        if (!anchorManagement || anchorManagement.status !== 'active') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        assertClientSelfServicePartyBookingAccess(envelope, {
          account: accountRecord,
          anchorParticipant,
          anchorManagement,
        });
      }

      const prices = resolveAuthoritativePartyPrices({
        individualLessonPriceKzt: individualLessonPrice,
        currentParticipantIds: booking.party.participantIds,
        nextParticipantIds,
      });
      nextPrice = prices.nextPrice;
      priceDelta = prices.signedPriceDelta;

      const payerAccountId = booking.payerAccountId ?? payment.payerAccountId;

      if (participantIdsToAdd.length > 0) {
        const participants: Participant[] = [];
        const managements: ParticipantManagement[] = [];
        for (const participantId of participantIdsToAdd) {
          const participantRead = await session.tx.get({ path: participantPath(participantId) });
          session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
          const participant = parseParticipant(
            participantRead.exists ? participantRead.data : undefined
          );
          if (!participant || participant.management.kind !== 'managed') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          const managementReadPath = participantManagementPath(
            participant.management.participantManagementId
          );
          const managementDoc = await session.tx.get({ path: managementReadPath });
          session.plan.planRead({ path: managementReadPath, category: 'aggregate' });
          const management = parseParticipantManagement(
            managementDoc.exists ? managementDoc.data : undefined
          );
          if (!management || management.status !== 'active') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          participants.push(participant);
          managements.push(management);

          const managerBlockPath = participantBlockPath(
            participantBlockIdFromDirection({
              participantId,
              instructorId: booking.occurrence.instructorId,
              createdByKind: 'participant_manager',
            })
          );
          const instructorBlockPathValue = participantBlockPath(
            participantBlockIdFromDirection({
              participantId,
              instructorId: booking.occurrence.instructorId,
              createdByKind: 'instructor',
            })
          );
          const managerBlockRead = await session.tx.get({ path: managerBlockPath });
          const instructorBlockRead = await session.tx.get({ path: instructorBlockPathValue });
          session.plan.planRead({ path: managerBlockPath, category: 'aggregate' });
          session.plan.planRead({ path: instructorBlockPathValue, category: 'aggregate' });
          const blocks: ParticipantBlock[] = [];
          const managerBlock = parseParticipantBlock(
            managerBlockRead.exists ? managerBlockRead.data : undefined
          );
          const instructorBlock = parseParticipantBlock(
            instructorBlockRead.exists ? instructorBlockRead.data : undefined
          );
          if (managerBlock) blocks.push(managerBlock);
          if (instructorBlock) blocks.push(instructorBlock);
          assertNoActiveServiceBlockForPartyParticipant(envelope, {
            account: accountRecord,
            participant,
            management,
            participantBlocks: blocks,
            instructorId: booking.occurrence.instructorId,
          });

          acquireClaimPlans.push(
            await planAcquireParticipantBookingClaim(session, {
              booking,
              participantId,
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
              decidedAt: environment.clock.now(),
            })
          );
        }
        if (mode === 'client_self_service') {
          assertAuthorizedForPartyParticipants(envelope, {
            account: accountRecord,
            participants,
            managements,
            participantIds: participantIdsToAdd,
          });
        }
      }

      if (participantIdsToRemove.length > 0) {
        const removedParticipants: Participant[] = [];
        const removedManagements: ParticipantManagement[] = [];
        for (const participantId of participantIdsToRemove) {
          const participantRead = await session.tx.get({ path: participantPath(participantId) });
          session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
          const participant = parseParticipant(
            participantRead.exists ? participantRead.data : undefined
          );
          if (!participant || participant.management.kind !== 'managed') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          const managementReadPath = participantManagementPath(
            participant.management.participantManagementId
          );
          const managementDoc = await session.tx.get({ path: managementReadPath });
          session.plan.planRead({ path: managementReadPath, category: 'aggregate' });
          const management = parseParticipantManagement(
            managementDoc.exists ? managementDoc.data : undefined
          );
          if (!management || management.status !== 'active') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          removedParticipants.push(participant);
          removedManagements.push(management);
          releaseClaimPlans.push(
            await planReleaseParticipantBookingClaim(
              session,
              booking,
              participantId,
              metadata,
              environment.clock.now()
            )
          );
        }
        if (mode === 'client_self_service') {
          assertAuthorizedForPartyParticipants(envelope, {
            account: accountRecord,
            participants: removedParticipants,
            managements: removedManagements,
            participantIds: participantIdsToRemove,
          });
        }
      }

      if (priceDelta > 0) {
        const positivePriceDelta = KztMinorUnitsSchema.parse(priceDelta);
        if (mode === 'client_self_service') {
          fundingAmount = positivePriceDelta;
        } else if (walletRecord || payerAccountId) {
          const walletPathValue = walletPath(payerAccountId!);
          const walletRead = await session.tx.get({ path: walletPathValue });
          session.plan.planRead({ path: walletPathValue, category: 'payment_wallet' });
          walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
          walletDocumentPath = walletPathValue;
          if (walletRecord) {
            fundingAmount = KztMinorUnitsSchema.parse(
              Math.min(walletRecord.balance, positivePriceDelta)
            );
            includeWalletEffect = fundingAmount > 0;
          }
        }
      } else if (priceDelta < 0) {
        const tariffDifference = KztMinorUnitsSchema.parse(-priceDelta);
        if (mode === 'client_self_service') {
          refundAmount = calculateSelfServiceRemoveRefundBasisKzt({
            individualLessonPriceKzt: individualLessonPrice,
            currentParticipantIds: booking.party.participantIds,
            nextParticipantIds,
          });
        } else {
          const basisPoints = envelope.intent.refundPercentBasisPoints ?? 0;
          refundAmount = calculateAdminLateRemoveRefundAmountKzt({
            tariffDifferenceKzt: tariffDifference,
            refundPercentBasisPoints: basisPoints,
            maxRefundableKzt: KztMinorUnitsSchema.parse(
              payment.paidAmount - payment.refundedAmount
            ),
          });
        }
        const refundDestination = resolveRefundDestination({ booking, payment });
        if (refundAmount > 0 && refundDestination === 'wallet' && payerAccountId) {
          const walletPathValue = walletPath(payerAccountId);
          const walletRead = await session.tx.get({ path: walletPathValue });
          session.plan.planRead({ path: walletPathValue, category: 'payment_wallet' });
          walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
          walletDocumentPath = walletPathValue;
          includeWalletEffect = Boolean(walletRecord);
        }
      }

      if (mode === 'client_self_service' && priceDelta > 0) {
        if (!payerAccountId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'payerAccountId', reason: 'required' },
          });
        }
        const walletPathValue = walletPath(payerAccountId);
        const walletRead = await session.tx.get({ path: walletPathValue });
        session.plan.planRead({ path: walletPathValue, category: 'payment_wallet' });
        walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletDocumentPath = walletPathValue;
        if (!walletRecord || walletRecord.balance < fundingAmount) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        includeWalletEffect = fundingAmount > 0;
      }

      if (participantIdsToAdd.length > 0) {
        const marginalAdditions = partitionAddedParticipantsByMarginalDelta({
          individualLessonPriceKzt: individualLessonPrice,
          currentParticipantIds: booking.party.participantIds,
          participantIdsToAdd,
        });
        newIncrementalRequirements = marginalAdditions.map((addition) =>
          createIncrementalRequirement({
            incrementalRequirementId: incrementalRequirementIdFromPartyAddition({
              commandId: metadata.commandId,
              participantId: addition.participantId,
            }),
            participantId: addition.participantId,
            createdAt: decidedAt,
            createdByCommandId: metadata.commandId,
            requiredPriceDelta: addition.requiredPriceDelta,
          })
        );
      }

      plannedBookingRevision = nextAggregateRevision(booking.revision);
      plannedPaymentRevision = nextAggregateRevision(payment.revision);
      plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);
      if (includeWalletEffect && walletRecord) {
        plannedWalletRevision = nextAggregateRevision(walletRecord.revision);
      }

      includeMonetaryEvent =
        includeWalletEffect || refundAmount > 0 || priceDelta !== 0;

      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
      session.plan.planMutation({
        path: paymentDocumentPath,
        kind: 'update',
        category: 'payment_wallet',
        estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
      });
      if (includeMonetaryEvent) {
        session.plan.planMutation({
          path: monetaryEventPath(monetaryEventIdFromCommandEffect(metadata.commandId, 0)),
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
        });
      }
      if (includeWalletEffect && walletDocumentPath) {
        session.plan.planMutation({
          path: walletDocumentPath,
          kind: 'update',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildChangeBookingPartyAuditPlan({
        envelope,
        bookingId: booking.bookingId,
        bookingRevision: plannedBookingRevision,
        paymentId: payment.paymentId,
        paymentRevision: plannedPaymentRevision,
        mode: mode === 'administrator' ? 'administrator' : 'client_self_service',
        monetaryEventIds: includeMonetaryEvent
          ? [monetaryEventIdFromCommandEffect(metadata.commandId, 0)]
          : [],
        includeWalletEffect,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const before = paymentAccountingFields(payment);
        let projection!: PaymentAccountingProjection;
        let updatedRequirements = [...payment.incrementalRequirements];

        if (participantIdsToRemove.length > 0) {
          const removedSet = new Set(participantIdsToRemove);
          updatedRequirements = updatedRequirements.map((requirement) =>
            removedSet.has(requirement.participantId)
              ? markIncrementalRequirementRolledBack(requirement)
              : requirement
          );
        }

        if (priceDelta > 0) {
          const positivePriceDelta = KztMinorUnitsSchema.parse(priceDelta);
          projection = applyPartyPriceIncrease(before, positivePriceDelta, fundingAmount);
          if (newIncrementalRequirements.length > 0) {
            const distributed = distributeFundingAcrossIncrementalRequirements(
              [...updatedRequirements, ...newIncrementalRequirements],
              fundingAmount
            );
            updatedRequirements = distributed.requirements;
          } else {
            updatedRequirements = [...updatedRequirements, ...newIncrementalRequirements];
          }
        } else if (priceDelta < 0) {
          const decrease = applyPartyPriceDecrease(before, nextPrice);
          projection = decrease.payment;
          if (refundAmount > 0 && decrease.refundDelta < refundAmount) {
            throw new Error('Refund projection mismatch');
          }
        } else {
          projection = {
            ...before,
            paymentStatus: derivePaymentStatus(before),
          };
        }

        const updatedBooking = BookingSchema.parse({
          ...booking,
          party: {
            kind: derivePartyKindFromCount(nextParticipantIds.length),
            participantIds: nextParticipantIds,
          },
          occurrence: {
            ...booking.occurrence,
            serviceParty: {
              participantIds: nextParticipantIds,
              frozenAt: booking.occurrence.serviceParty.frozenAt,
            },
          },
          revision: plannedBookingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });

        const updatedPayment = PaymentSchema.parse({
          ...payment,
          ...projection,
          incrementalRequirements: updatedRequirements,
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          updatedAt: decidedAt,
        });

        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
        session.tx.update(
          { path: paymentPath(payment.paymentId) },
          financeToFirestoreWritePayload(updatedPayment as Record<string, unknown>)
        );

        if (includeMonetaryEvent) {
          const walletAccountId = booking.payerAccountId ?? payment.payerAccountId;
          const walletBalanceDelta =
            includeWalletEffect && fundingAmount > 0
              ? -fundingAmount
              : includeWalletEffect && refundAmount > 0
                ? refundAmount
                : undefined;
          const monetaryEvent: MonetaryEvent = {
            eventId: monetaryEventIdFromCommandEffect(metadata.commandId, 0),
            eventKind:
              refundAmount > 0
                ? 'refund_to_wallet'
                : fundingAmount > 0
                  ? 'booking_charge'
                  : 'admin_price_adjustment',
            currency: 'KZT',
            paymentId: payment.paymentId,
            subjectType: payment.subjectType,
            subjectId: payment.subjectId,
            paymentEffect: paymentEffectFromProjectionChange(before, projection),
            sourceKind: walletBalanceDelta !== undefined ? 'wallet' : 'manual_external',
            ...(walletAccountId === undefined ? {} : { payerAccountIdAtEvent: walletAccountId }),
            ...(walletBalanceDelta === undefined || walletAccountId === undefined
              ? {}
              : { walletAccountId, walletBalanceDelta }),
            actor: monetaryActorFromEnvelope(envelope),
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            paymentEventRevision: plannedPaymentEventRevision,
            ...(walletBalanceDelta !== undefined && walletRecord
              ? { walletEventRevision: nextAggregateRevision(walletRecord.eventRevision) }
              : {}),
            occurredAt: decidedAt,
            recordedAt: decidedAt,
          };
          session.tx.create(
            { path: monetaryEventPath(monetaryEvent.eventId) },
            financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
          );

          if (includeWalletEffect && walletRecord && walletAccountId) {
            const updatedBalance =
              refundAmount > 0
                ? creditWalletBalance(walletRecord.balance, refundAmount)
                : debitWalletBalance(walletRecord.balance, fundingAmount);
            const mergedWallet = mergeWalletBalance(walletRecord, updatedBalance, {
              revision: plannedWalletRevision!,
              eventRevision: nextAggregateRevision(walletRecord.eventRevision),
              updatedAt: decidedAt,
            });
            session.tx.update(
              { path: walletPath(walletAccountId) },
              financeToFirestoreWritePayload(mergedWallet as Record<string, unknown>)
            );
          }
        }

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };
        for (const plan of acquireClaimPlans) {
          commitResourceClaimPlan(session, plan, claimMetadata);
        }
        for (const plan of releaseClaimPlans) {
          commitResourceClaimPlan(session, plan, claimMetadata);
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      } catch (error) {
        if (error instanceof InsufficientWalletFundsError) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        mapFinanceDomainError(envelope, error);
        throw error;
      }
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
  });
}

function rollbackUnpaidBookingPartyAdditionsHandler(
  envelope: CommandEnvelope<'rollback_unpaid_booking_party_additions'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'rollback_unpaid_booking_party_additions'>> {
  resolveRollbackAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let payment!: Payment;
  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let individualLessonPrice!: ReturnType<typeof KztMinorUnitsSchema.parse>;
  let participantsToRemove: Booking['party']['participantIds'] = [];
  let nextParticipantIds!: Booking['party']['participantIds'];
  let nextPrice = KztMinorUnitsSchema.parse(0);
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentEventRevision = AggregateRevisionSchema.parse(0);
  let releaseClaimPlans: Awaited<ReturnType<typeof planReleaseParticipantBookingClaim>>[] = [];
  let includeWalletEffect = false;
  let includeMonetaryEvent = false;
  let refundAmount = KztMinorUnitsSchema.parse(0);
  let walletRecord: Wallet | undefined;
  let freezeOnly = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'rollback_unpaid_booking_party_additions'> =
    {
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
        assertPartyChangeEligibleBooking(envelope, booking);

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

        nextParticipantIds = booking.party.participantIds;

        const unpaid = listUnpaidActiveIncrementalRequirements(payment.incrementalRequirements);
        if (unpaid.length === 0) {
          if (booking.occurrence.serviceParty.frozenAt) {
            return;
          }
          freezeOnly = true;
          plannedBookingRevision = nextAggregateRevision(booking.revision);
          session.plan.planMutation({
            path: bookingDocumentPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
          });
          return;
        }

        const instructorRead = await session.tx.get({
          path: instructorCatalogPath(booking.occurrence.instructorId),
        });
        session.plan.planRead({
          path: instructorCatalogPath(booking.occurrence.instructorId),
          category: 'aggregate',
        });
        instructorRecord = parseInstructorCatalog(
          booking.occurrence.instructorId,
          instructorRead.exists ? instructorRead.data : undefined
        )!;
        individualLessonPrice = individualLessonPriceFromBooking(instructorRecord, booking);

        participantsToRemove = [...unpaid]
          .sort((left, right) => {
            const timeCompare = compareCanonicalTimestamps(right.createdAt, left.createdAt);
            if (timeCompare !== 0) {
              return timeCompare;
            }
            return left.participantId.localeCompare(right.participantId);
          })
          .map((requirement) => requirement.participantId);
        nextParticipantIds = booking.party.participantIds.filter(
          (participantId) => !participantsToRemove.includes(participantId)
        ) as Booking['party']['participantIds'];
        validatePartyParticipantIds(nextParticipantIds);

        nextPrice = calculateFamilyGroupBookingPriceKzt(
          individualLessonPrice,
          nextParticipantIds.length
        );

        for (const participantId of participantsToRemove) {
          releaseClaimPlans.push(
            await planReleaseParticipantBookingClaim(
              session,
              booking,
              participantId,
              metadata,
              environment.clock.now()
            )
          );
        }

        const decreasePreview = applyPartyPriceDecrease(paymentAccountingFields(payment), nextPrice);
        refundAmount = decreasePreview.refundDelta;
        const refundDestination = resolveRefundDestination({ booking, payment });
        const payerAccountId = booking.payerAccountId ?? payment.payerAccountId;
        if (refundAmount > 0 && refundDestination === 'wallet' && payerAccountId) {
          const walletRead = await session.tx.get({ path: walletPath(payerAccountId) });
          session.plan.planRead({ path: walletPath(payerAccountId), category: 'payment_wallet' });
          walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
          includeWalletEffect = Boolean(walletRecord);
        }

        includeMonetaryEvent = refundAmount > 0 || nextPrice !== payment.price;
        plannedBookingRevision = nextAggregateRevision(booking.revision);
        plannedPaymentRevision = nextAggregateRevision(payment.revision);
        plannedPaymentEventRevision = nextAggregateRevision(payment.eventRevision);

        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });
        session.plan.planMutation({
          path: paymentDocumentPath,
          kind: 'update',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
        });
        if (includeMonetaryEvent) {
          session.plan.planMutation({
            path: monetaryEventPath(monetaryEventIdFromCommandEffect(metadata.commandId, 0)),
            kind: 'create',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
          });
        }
        if (includeWalletEffect && payerAccountId) {
          session.plan.planMutation({
            path: walletPath(payerAccountId),
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
          });
        }
      },
      planAuditOutbox: async () => {
        if (freezeOnly) {
          return buildServicePartyFreezeAtStartAuditPlan({
            envelope,
            bookingId: booking.bookingId,
            bookingRevision: plannedBookingRevision,
          });
        }
        if (participantsToRemove.length === 0) {
          return {
            activityLog: {
              reason: {
                registryVersion: 'reason:v1',
                reasonCode: 'scheduled_system_action',
              },
              primarySubject: {
                kind: 'booking',
                id: booking.bookingId,
                subjectKey: `booking:${booking.bookingId}`,
              },
              affectedSubjects: [],
              effects: [],
              monetaryEventIds: [],
              adminIssueIds: [],
              resultingRevisions: [],
            },
            outboxObligations: [],
          };
        }
        return buildRollbackUnpaidBookingPartyAdditionsAuditPlan({
          envelope,
          bookingId: booking.bookingId,
          bookingRevision: plannedBookingRevision,
          paymentId: payment.paymentId,
          paymentRevision: plannedPaymentRevision,
          monetaryEventIds: includeMonetaryEvent
            ? [monetaryEventIdFromCommandEffect(metadata.commandId, 0)]
            : [],
          includeWalletEffect,
        });
      },
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        if (freezeOnly) {
          if (booking.occurrence.serviceParty.frozenAt) {
            return commandSuccessResult(envelope.kind, envelope.context.correlationId);
          }
          const updatedBooking = BookingSchema.parse({
            ...booking,
            occurrence: {
              ...booking.occurrence,
              serviceParty: {
                participantIds: booking.party.participantIds,
                frozenAt: decidedAt,
              },
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
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }
        if (participantsToRemove.length === 0) {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }
        const before = paymentAccountingFields(payment);
        const removedSet = new Set(participantsToRemove);
        const updatedRequirements = payment.incrementalRequirements.map((requirement) =>
          removedSet.has(requirement.participantId)
            ? markIncrementalRequirementRolledBack(requirement)
            : requirement
        );
        const decrease = applyPartyPriceDecrease(before, nextPrice);
        const updatedBooking = BookingSchema.parse({
          ...booking,
          party: {
            kind: derivePartyKindFromCount(nextParticipantIds.length),
            participantIds: nextParticipantIds,
          },
          occurrence: {
            ...booking.occurrence,
            serviceParty: {
              participantIds: nextParticipantIds,
              frozenAt: decidedAt,
            },
          },
          revision: plannedBookingRevision,
          updatedAt: decidedAt,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        const updatedPayment = PaymentSchema.parse({
          ...payment,
          ...decrease.payment,
          incrementalRequirements: updatedRequirements,
          revision: plannedPaymentRevision,
          eventRevision: plannedPaymentEventRevision,
          updatedAt: decidedAt,
        });

        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
        );
        session.tx.update(
          { path: paymentPath(payment.paymentId) },
          financeToFirestoreWritePayload(updatedPayment as Record<string, unknown>)
        );

        if (includeMonetaryEvent) {
          const walletAccountId = booking.payerAccountId ?? payment.payerAccountId;
          const monetaryEvent: MonetaryEvent = {
            eventId: monetaryEventIdFromCommandEffect(metadata.commandId, 0),
            eventKind: refundAmount > 0 ? 'refund_to_wallet' : 'admin_price_adjustment',
            currency: 'KZT',
            paymentId: payment.paymentId,
            subjectType: payment.subjectType,
            subjectId: payment.subjectId,
            paymentEffect: paymentEffectFromProjectionChange(before, decrease.payment),
            sourceKind: includeWalletEffect ? 'wallet' : 'manual_external',
            ...(walletAccountId === undefined ? {} : { payerAccountIdAtEvent: walletAccountId }),
            ...(includeWalletEffect && walletAccountId && refundAmount > 0
              ? {
                  walletAccountId,
                  walletBalanceDelta: refundAmount,
                }
              : {}),
            actor: monetaryActorFromEnvelope(envelope),
            commandId: metadata.commandId,
            correlationId: metadata.correlationId,
            paymentEventRevision: plannedPaymentEventRevision,
            occurredAt: decidedAt,
            recordedAt: decidedAt,
          };
          session.tx.create(
            { path: monetaryEventPath(monetaryEvent.eventId) },
            financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
          );
          if (includeWalletEffect && walletRecord && walletAccountId && refundAmount > 0) {
            const mergedWallet = mergeWalletBalance(
              walletRecord,
              creditWalletBalance(walletRecord.balance, refundAmount),
              {
                revision: nextAggregateRevision(walletRecord.revision),
                eventRevision: nextAggregateRevision(walletRecord.eventRevision),
                updatedAt: decidedAt,
              }
            );
            session.tx.update(
              { path: walletPath(walletAccountId) },
              financeToFirestoreWritePayload(mergedWallet as Record<string, unknown>)
            );
          }
        }

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };
        for (const plan of releaseClaimPlans) {
          commitResourceClaimPlan(session, plan, claimMetadata);
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: false },
  });
}

export function createBookingPartyCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  'change_booking_party' | 'rollback_unpaid_booking_party_additions'
> {
  return {
    change_booking_party: (envelope, environment) =>
      changeBookingPartyHandler(envelope, environment, executor),
    rollback_unpaid_booking_party_additions: (envelope, environment) =>
      rollbackUnpaidBookingPartyAdditionsHandler(envelope, environment, executor),
  };
}
