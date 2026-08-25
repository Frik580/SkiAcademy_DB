import {
  AggregateRevisionSchema,
  BookingProposalSchema,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  ResourceClaimIdentityInputSchema,
  accountActorRef,
  applyExternalPaymentFunding,
  bookingIdFromAcceptedProposal,
  calculateIndividualBookingPriceKzt,
  commandSuccessResult,
  deriveBookingPartyKind,
  initialBookingOccurrenceIdFromBookingId,
  instructorRelationshipIdFromPair,
  isPaymentFullyFundedForService,
  isSyntheticCourseInstructorId,
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
  type BookingProposal,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type KztMinorUnits,
  type MonetaryEvent,
  type Participant,
  type ParticipantBlock,
  type ParticipantManagement,
  type Payment,
  type PaymentAccountingFields,
  type PaymentAccountingProjection,
  type Wallet,
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
  paymentPath,
  walletPath,
} from '../finance/financeStore';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';
import {
  assertAccountActive,
  assertParticipantActive,
  buildParticipantAccessTopology,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  instructorRelationshipPath,
  parseInstructorRelationship,
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
  type ResourceClaimOperationPlan,
} from '../resourceClaims/resourceClaimEngine';
import {
  assertAcceptProposalAuthorization,
  assertCancelProposalActorMatchesProposal,
  assertCancelProposalAuthorization,
  assertCancelProposalParticipantAuthorization,
  assertCreateProposalAuthorization,
  assertCreateProposalServiceStartsInFuture,
  assertExpireProposalAuthorization,
  assertInstructorParticipantRelationship,
  assertNoActiveServiceBlockForProposal,
  assertOpenBookingProposal,
  assertProposalAcceptanceWindow,
  assertProposalExpiredForSystemExpiry,
  resolveAcceptProposalParticipantAuthorization,
  type AcceptBookingProposalAuthorization,
} from './bookingProposalAuthorization';
import {
  buildAcceptProposalAuditPlan,
  buildCancelProposalAuditPlan,
  buildCreateProposalAuditPlan,
  buildExpireProposalAuditPlan,
} from './bookingProposalAudit';
import {
  BOOKING_PROPOSAL_PLANNING_ESTIMATES,
  bookingProposalPath,
  parseBookingProposal,
  toFirestoreWritePayload,
} from './bookingProposalStore';
import {
  BOOKING_PLANNING_ESTIMATES,
  bookingPath,
  instructorCatalogPath,
  parseInstructorCatalog,
  toFirestoreWritePayload as bookingToFirestoreWritePayload,
} from './bookingStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

type ClaimConflictCode = 'instructor_conflict' | 'participant_conflict' | 'resource_conflict';

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

async function tryPlanAcquireResourceClaim(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: Parameters<typeof readAndPlanAcquireResourceClaim>[1]
): Promise<
  | { readonly ok: true; readonly plan: ResourceClaimOperationPlan }
  | { readonly ok: false; readonly code: ClaimConflictCode }
> {
  try {
    const plan = await readAndPlanAcquireResourceClaim(session, input);
    return { ok: true, plan };
  } catch (error) {
    if (error instanceof CanonicalCommandError) {
      if (
        error.code === 'instructor_conflict' ||
        error.code === 'participant_conflict' ||
        error.code === 'resource_conflict'
      ) {
        return { ok: false, code: error.code };
      }
    }
    throw error;
  }
}

function durationMinutesFromInterval(interval: {
  readonly startsAt: CanonicalTimestamp;
  readonly endsAt: CanonicalTimestamp;
}): number {
  const startMs =
    interval.startsAt.seconds * 1_000 + Math.floor(interval.startsAt.nanoseconds / 1_000_000);
  const endMs =
    interval.endsAt.seconds * 1_000 + Math.floor(interval.endsAt.nanoseconds / 1_000_000);
  return Math.round((endMs - startMs) / 60_000);
}

function createBookingProposalHandler(
  envelope: CommandEnvelope<'create_booking_proposal'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_booking_proposal'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertCreateProposalAuthorization(envelope);

  const proposalDocumentPath = bookingProposalPath(envelope.intent.bookingProposalId);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);
  const relationshipDocumentPath = instructorRelationshipPath(
    instructorRelationshipIdFromPair({
      participantId: envelope.intent.participantId,
      instructorId: envelope.intent.instructorId,
    })
  );
  const managerBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: envelope.intent.participantId,
      instructorId: envelope.intent.instructorId,
      createdByKind: 'participant_manager',
    })
  );
  const instructorBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: envelope.intent.participantId,
      instructorId: envelope.intent.instructorId,
      createdByKind: 'instructor',
    })
  );

  let participantRecord!: Participant;
  let managementRecord!: ParticipantManagement;
  let accountRecord!: NonNullable<ReturnType<typeof parseAccount>>;
  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let notificationAccountId!: ParticipantManagement['accountId'];
  const plannedProposalRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_booking_proposal'> = {
    read: async (session) => {
      const now = timestampFromDate(environment.clock.now());
      schedule = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      );
      assertCreateProposalServiceStartsInFuture(
        envelope,
        now,
        schedule.interval.startsAt
      );

      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      if (proposalRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingProposalId', reason: 'conflict' },
        });
      }

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantActive(
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
      notificationAccountId = managementRecord.accountId;

      const accountRead = await session.tx.get({ path: accountPath(managementRecord.accountId) });
      session.plan.planRead({
        path: accountPath(managementRecord.accountId),
        category: 'authorization_check',
      });
      accountRecord = assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      const relationshipRead = await session.tx.get({ path: relationshipDocumentPath });
      session.plan.planRead({ path: relationshipDocumentPath, category: 'authorization_check' });
      const instructorRelationship = parseInstructorRelationship(
        relationshipRead.exists ? relationshipRead.data : undefined
      );

      const managerBlockRead = await session.tx.get({ path: managerBlockPath });
      session.plan.planRead({ path: managerBlockPath, category: 'authorization_check' });
      const instructorBlockRead = await session.tx.get({ path: instructorBlockPath });
      session.plan.planRead({ path: instructorBlockPath, category: 'authorization_check' });
      const participantBlocks = [
        parseParticipantBlock(managerBlockRead.exists ? managerBlockRead.data : undefined),
        parseParticipantBlock(instructorBlockRead.exists ? instructorBlockRead.data : undefined),
      ].filter((block): block is ParticipantBlock => block !== undefined);

      const topology = buildParticipantAccessTopology({
        account: accountRecord,
        participant: participantRecord,
        management: managementRecord,
        instructorRelationship,
        additionalBlocks: participantBlocks,
      });

      assertInstructorParticipantRelationship(envelope, topology, {
        instructorId: envelope.intent.instructorId,
        participantId: envelope.intent.participantId,
        at: now,
      });
      assertNoActiveServiceBlockForProposal(
        envelope,
        {
          account: accountRecord,
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

      session.plan.planMutation({
        path: proposalDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCreateProposalAuditPlan({
        proposalId: envelope.intent.bookingProposalId,
        proposalRevision: plannedProposalRevision,
        notificationAccountId,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const proposal: BookingProposal = BookingProposalSchema.parse({
        proposalId: envelope.intent.bookingProposalId,
        participantId: envelope.intent.participantId,
        instructorId: envelope.intent.instructorId,
        proposedService: {
          interval: schedule.interval,
          timeZone: envelope.context.timezone!,
        },
        lifecycle: { status: 'open' },
        revision: plannedProposalRevision,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: revisionAuditLink(envelope, metadata),
      });

      session.tx.create(
        { path: proposalDocumentPath },
        toFirestoreWritePayload(proposal as Record<string, unknown>)
      );

      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function acceptBookingProposalHandler(
  envelope: CommandEnvelope<'accept_booking_proposal'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'accept_booking_proposal'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertAcceptProposalAuthorization(envelope);

  const proposalDocumentPath = bookingProposalPath(envelope.intent.bookingProposalId);

  let proposal!: BookingProposal;
  let authorization!: AcceptBookingProposalAuthorization;
  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let servicePrice!: KztMinorUnits;
  let walletRecord: Wallet | undefined;
  let walletExists = false;
  let walletDocumentPath = '';
  let plannedWalletRevision = AggregateRevisionSchema.parse(1);
  let plannedWalletEventRevision = AggregateRevisionSchema.parse(1);
  const plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentEventRevision = AggregateRevisionSchema.parse(0);
  const plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedProposalRevision = AggregateRevisionSchema.parse(1);
  let walletFunding = KztMinorUnitsSchema.parse(0);
  let paymentProjection!: PaymentAccountingProjection;
  let instructorClaimPlan: ResourceClaimOperationPlan | undefined;
  let participantClaimPlan: ResourceClaimOperationPlan | undefined;
  let transitionUnavailable = false;
  const bookingId = bookingIdFromAcceptedProposal(envelope.intent.bookingProposalId);
  const bookingDocumentPath = bookingPath(bookingId);
  const paymentId = paymentIdFromBookingId(bookingId);
  const paymentPathValue = paymentPath(paymentId);
  const occurrenceId = initialBookingOccurrenceIdFromBookingId(bookingId);
  const stagedEventId = monetaryEventIdFromCommandEffect(metadata.commandId, 0);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'accept_booking_proposal'> = {
    read: async (session) => {
      transitionUnavailable = false;
      instructorClaimPlan = undefined;
      participantClaimPlan = undefined;

      const now = timestampFromDate(environment.clock.now());
      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      proposal = assertOpenBookingProposal(
        envelope,
        parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined)
      );
      assertProposalAcceptanceWindow(envelope, proposal, now);

      const participantDocumentPath = participantPath(proposal.participantId);
      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      const participantRecord = assertParticipantActive(
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
      const managementRecord = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (!managementRecord || managementRecord.status !== 'active') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const accountRead = await session.tx.get({ path: accountPath(managementRecord.accountId) });
      session.plan.planRead({
        path: accountPath(managementRecord.accountId),
        category: 'authorization_check',
      });
      const accountRecord = assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      authorization = resolveAcceptProposalParticipantAuthorization(envelope, {
        account: accountRecord,
        participant: participantRecord,
        management: managementRecord,
        proposal,
      });

      const managerBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: proposal.participantId,
          instructorId: proposal.instructorId,
          createdByKind: 'participant_manager',
        })
      );
      const instructorBlockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: proposal.participantId,
          instructorId: proposal.instructorId,
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
      ].filter((block): block is ParticipantBlock => block !== undefined);
      assertNoActiveServiceBlockForProposal(
        envelope,
        {
          account: accountRecord,
          participant: participantRecord,
          management: managementRecord,
          participantBlocks,
        },
        proposal.instructorId
      );

      const relationshipDocumentPath = instructorRelationshipPath(
        instructorRelationshipIdFromPair({
          participantId: proposal.participantId,
          instructorId: proposal.instructorId,
        })
      );
      const relationshipRead = await session.tx.get({ path: relationshipDocumentPath });
      session.plan.planRead({ path: relationshipDocumentPath, category: 'authorization_check' });
      const instructorRelationship = parseInstructorRelationship(
        relationshipRead.exists ? relationshipRead.data : undefined
      );
      const accessTopology = buildParticipantAccessTopology({
        account: accountRecord,
        participant: participantRecord,
        management: managementRecord,
        instructorRelationship,
        additionalBlocks: participantBlocks,
      });
      assertInstructorParticipantRelationship(envelope, accessTopology, {
        instructorId: proposal.instructorId,
        participantId: proposal.participantId,
        at: now,
      });

      const instructorRead = await session.tx.get({
        path: instructorCatalogPath(proposal.instructorId),
      });
      session.plan.planRead({
        path: instructorCatalogPath(proposal.instructorId),
        category: 'authorization_check',
      });
      const parsedInstructor = parseInstructorCatalog(
        proposal.instructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!parsedInstructor || isSyntheticCourseInstructorId(proposal.instructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }
      instructorRecord = parsedInstructor;
      if (instructorRecord.isAvailable === false) {
        transitionUnavailable = true;
      }

      const schedule = proposal.proposedService;
      servicePrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        durationMinutesFromInterval(schedule.interval)
      );

      if (!transitionUnavailable) {
        walletDocumentPath = walletPath(authorization.payerAccountId);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists;
        const walletBalance = walletRecord?.balance ?? 0;

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

        plannedPaymentEventRevision = AggregateRevisionSchema.parse(1);
        plannedWalletRevision = walletExists
          ? nextAggregateRevision(walletRecord!.revision)
          : AggregateRevisionSchema.parse(1);
        plannedWalletEventRevision = walletExists
          ? nextAggregateRevision(walletRecord!.eventRevision)
          : AggregateRevisionSchema.parse(1);

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

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
        };
        const instructorClaimResult = await tryPlanAcquireResourceClaim(session, {
          ...claimMetadata,
          identity: ResourceClaimIdentityInputSchema.parse({
            strategyVersion: 'claim:v1',
            claimKind: 'instructor_booking_occurrence',
            resourceKind: 'instructor',
            resourceId: proposal.instructorId,
            ownerKind: 'booking',
            ownerId: bookingId,
            occurrenceId,
          }),
          interval: schedule.interval,
        });
        if (!instructorClaimResult.ok) {
          if (instructorClaimResult.code === 'instructor_conflict') {
            transitionUnavailable = true;
          } else {
            throw new CanonicalCommandError(instructorClaimResult.code, {
              correlationId: envelope.context.correlationId,
              details: { reason: 'conflict' },
            });
          }
        } else {
          instructorClaimPlan = instructorClaimResult.plan;
          const participantClaimResult = await tryPlanAcquireResourceClaim(session, {
            ...claimMetadata,
            identity: ResourceClaimIdentityInputSchema.parse({
              strategyVersion: 'claim:v1',
              claimKind: 'participant_booking_occurrence',
              resourceKind: 'participant',
              resourceId: proposal.participantId,
              ownerKind: 'booking',
              ownerId: bookingId,
              occurrenceId,
            }),
            interval: schedule.interval,
          });
          if (!participantClaimResult.ok) {
            throw new CanonicalCommandError(participantClaimResult.code, {
              correlationId: envelope.context.correlationId,
              details: { reason: 'conflict' },
            });
          }
          participantClaimPlan = participantClaimResult.plan;
        }
      }

      plannedProposalRevision = nextAggregateRevision(proposal.revision);
      session.plan.planMutation({
        path: proposalDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
      });

      if (!transitionUnavailable) {
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
      }
    },
    planAuditOutbox: async () =>
      buildAcceptProposalAuditPlan({
        envelope,
        proposalId: envelope.intent.bookingProposalId,
        proposalRevision: plannedProposalRevision,
        bookingId,
        paymentId,
        monetaryEventIds: transitionUnavailable ? [] : [stagedEventId],
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedPaymentRevision,
        notificationAccountId: authorization.payerAccountId,
        walletRevision: transitionUnavailable ? undefined : plannedWalletRevision,
        includeWalletEffect: !transitionUnavailable,
        unavailable: transitionUnavailable,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        if (transitionUnavailable) {
          const unavailableProposal = BookingProposalSchema.parse({
            ...proposal,
            lifecycle: {
              status: 'unavailable',
              unavailableAt: decidedAt,
            },
            revision: plannedProposalRevision,
            updatedAt: decidedAt,
            audit: {
              ...proposal.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          });
          session.tx.update(
            { path: proposalDocumentPath },
            toFirestoreWritePayload(unavailableProposal as Record<string, unknown>)
          );
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        const audit = revisionAuditLink(envelope, metadata);
        const partyParticipantIds = [proposal.participantId];
        const schedule = proposal.proposedService;
        const booking: Booking = BookingSchema.parse({
          bookingId,
          attribution: {
            bookingOrigin: 'instructor',
            bookedBy: accountActorRef(authorization.bookedByAccountId),
          },
          party: {
            kind: deriveBookingPartyKind(partyParticipantIds.length),
            participantIds: partyParticipantIds,
          },
          occurrence: {
            occurrenceId,
            instructorId: proposal.instructorId,
            interval: schedule.interval,
            timeZone: schedule.timeZone,
            scheduleRevision: 1,
            serviceParty: {
              participantIds: partyParticipantIds,
              frozenAt: decidedAt,
            },
          },
          lifecycle: { status: 'confirmed' },
          paymentId,
          payerAccountId: authorization.payerAccountId,
          revision: plannedBookingRevision,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        });

        const payment: Payment = PaymentSchema.parse({
          paymentId,
          subjectType: 'booking',
          subjectId: bookingId,
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

        const acceptedProposal = BookingProposalSchema.parse({
          ...proposal,
          lifecycle: {
            status: 'accepted',
            acceptedAt: decidedAt,
            resultingBookingId: bookingId,
          },
          revision: plannedProposalRevision,
          updatedAt: decidedAt,
          audit: {
            ...proposal.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });

        session.tx.update(
          { path: proposalDocumentPath },
          toFirestoreWritePayload(acceptedProposal as Record<string, unknown>)
        );
        session.tx.create(
          { path: bookingDocumentPath },
          bookingToFirestoreWritePayload(booking as Record<string, unknown>)
        );
        session.tx.create(
          { path: paymentPathValue },
          financeToFirestoreWritePayload(payment as Record<string, unknown>)
        );

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

        const beforePayment = initialUnpaidPaymentFields(servicePrice);
        const monetaryEvent: MonetaryEvent = {
          eventId: stagedEventId,
          eventKind: 'booking_charge',
          currency: 'KZT',
          paymentId,
          subjectType: 'booking',
          subjectId: bookingId,
          walletAccountId: authorization.payerAccountId,
          walletBalanceDelta: -walletFunding,
          paymentEffect: paymentEffectFromProjectionChange(beforePayment, paymentProjection),
          sourceKind: 'wallet',
          payerAccountIdAtEvent: authorization.payerAccountId,
          actor: monetaryActorFromEnvelope(envelope),
          commandId: metadata.commandId,
          correlationId: metadata.correlationId,
          paymentEventRevision: plannedPaymentEventRevision,
          walletEventRevision: plannedWalletEventRevision,
          occurredAt: decidedAt,
          recordedAt: decidedAt,
        };
        session.tx.create(
          { path: monetaryEventPath(stagedEventId) },
          financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
        );

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };
        commitResourceClaimPlan(session, instructorClaimPlan!, claimMetadata);
        commitResourceClaimPlan(session, participantClaimPlan!, claimMetadata);

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
    revisionTarget: { ref: { path: proposalDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function cancelBookingProposalHandler(
  envelope: CommandEnvelope<'cancel_booking_proposal'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'cancel_booking_proposal'>> {
  const metadata = metadataFromEnvelope(envelope);
  const cancelActor = assertCancelProposalAuthorization(envelope);
  const proposalDocumentPath = bookingProposalPath(envelope.intent.bookingProposalId);

  let proposal!: BookingProposal;
  let plannedProposalRevision = AggregateRevisionSchema.parse(1);
  let lifecycleTarget: 'declined' | 'cancelled' = 'declined';
  let notificationAccountId!: ParticipantManagement['accountId'];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'cancel_booking_proposal'> = {
    read: async (session) => {
      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      proposal = assertOpenBookingProposal(
        envelope,
        parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined)
      );
      assertCancelProposalActorMatchesProposal(envelope, proposal, cancelActor);

      if (cancelActor === 'instructor') {
        lifecycleTarget = 'cancelled';
        const participantDocumentPath = participantPath(proposal.participantId);
        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        const participantRecord = assertParticipantActive(
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
        const managementRecord = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!managementRecord || managementRecord.status !== 'active') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        notificationAccountId = managementRecord.accountId;
      } else {
        lifecycleTarget = 'declined';
        const participantDocumentPath = participantPath(proposal.participantId);
        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        const participantRecord = assertParticipantActive(
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
        const managementRecord = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!managementRecord || managementRecord.status !== 'active') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const accountRead = await session.tx.get({ path: accountPath(managementRecord.accountId) });
        session.plan.planRead({
          path: accountPath(managementRecord.accountId),
          category: 'authorization_check',
        });
        const accountRecord = assertAccountActive(
          envelope,
          parseAccount(accountRead.exists ? accountRead.data : undefined)
        );
        assertCancelProposalParticipantAuthorization(envelope, {
          account: accountRecord,
          participant: participantRecord,
          management: managementRecord,
          proposal,
        });
        notificationAccountId = requireAccountActor(envelope).accountId;
      }

      plannedProposalRevision = nextAggregateRevision(proposal.revision);
      session.plan.planMutation({
        path: proposalDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCancelProposalAuditPlan({
        proposalId: envelope.intent.bookingProposalId,
        proposalRevision: plannedProposalRevision,
        lifecycle: lifecycleTarget,
        notificationAccountId,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedProposal = BookingProposalSchema.parse({
        ...proposal,
        lifecycle:
          lifecycleTarget === 'declined'
            ? { status: 'declined', declinedAt: decidedAt }
            : {
                status: 'cancelled',
                cancelledAt: decidedAt,
                reasonCode: 'instructor_withdrawn',
              },
        revision: plannedProposalRevision,
        updatedAt: decidedAt,
        audit: {
          ...proposal.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: proposalDocumentPath },
        toFirestoreWritePayload(updatedProposal as Record<string, unknown>)
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: proposalDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function expireBookingProposalHandler(
  envelope: CommandEnvelope<'expire_booking_proposal'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'expire_booking_proposal'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertExpireProposalAuthorization(envelope);
  const proposalDocumentPath = bookingProposalPath(envelope.intent.bookingProposalId);

  let proposal!: BookingProposal;
  let plannedProposalRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'expire_booking_proposal'> = {
    read: async (session) => {
      const now = timestampFromDate(environment.clock.now());
      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      proposal = assertOpenBookingProposal(
        envelope,
        parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined)
      );
      assertProposalExpiredForSystemExpiry(envelope, proposal, now);

      plannedProposalRevision = nextAggregateRevision(proposal.revision);
      session.plan.planMutation({
        path: proposalDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
      });
    },
    planAuditOutbox: async () =>
      buildExpireProposalAuditPlan({
        proposalId: envelope.intent.bookingProposalId,
        proposalRevision: plannedProposalRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedProposal = BookingProposalSchema.parse({
        ...proposal,
        lifecycle: {
          status: 'expired',
          expiredAt: decidedAt,
        },
        revision: plannedProposalRevision,
        updatedAt: decidedAt,
        audit: {
          ...proposal.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      session.tx.update(
        { path: proposalDocumentPath },
        toFirestoreWritePayload(updatedProposal as Record<string, unknown>)
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: proposalDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

export function createBookingProposalCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  | 'create_booking_proposal'
  | 'accept_booking_proposal'
  | 'cancel_booking_proposal'
  | 'expire_booking_proposal'
> {
  return {
    create_booking_proposal: (envelope, environment) =>
      createBookingProposalHandler(envelope, environment, executor),
    accept_booking_proposal: (envelope, environment) =>
      acceptBookingProposalHandler(envelope, environment, executor),
    cancel_booking_proposal: (envelope, environment) =>
      cancelBookingProposalHandler(envelope, environment, executor),
    expire_booking_proposal: (envelope, environment) =>
      expireBookingProposalHandler(envelope, environment, executor),
  };
}
