import {
  AggregateRevisionSchema,
  BookingProposalSchema,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  ResourceClaimGuardSchema,
  ResourceClaimIdentityInputSchema,
  accountActorRef,
  applyExternalPaymentFunding,
  bookingIdFromAcceptedProposal,
  bookingScopedEvidenceFromQualifyingBooking,
  calculateIndividualBookingPriceKzt,
  calculateLessonPartyPriceKzt,
  commandErrorResult,
  commandSuccessResult,
  deriveBookingPartyKind,
  evaluateInstructorParticipantAccess,
  initialBookingOccurrenceIdFromBookingId,
  instructorRelationshipIdFromPair,
  intervalsConflict,
  isPaymentFullyFundedForService,
  isSyntheticCourseInstructorId,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  normalizeFirestoreDocument,
  participantBlockIdFromDirection,
  paymentEffectFromProjectionChange,
  paymentIdFromBookingId,
  proposalParticipantIds,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  resolveInstructorHourlyRateKzt,
  timestampFromDate,
  type Booking,
  type BookingProposal,
  type BookingScopedParticipantAccessEvidence,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type KztMinorUnits,
  type LessonPricingSettings,
  type MonetaryEvent,
  type Participant,
  type ParticipantBlock,
  type ParticipantId,
  type ParticipantManagement,
  type Payment,
  type PaymentAccountingFields,
  type PaymentAccountingProjection,
  type Wallet,
  KztMinorUnitsSchema,
  debitWalletBalance,
} from '@ski-academy/shared-domain';
import { getFirestore } from 'firebase-admin/firestore';
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
  assertCreateProposalParty,
  assertCreateProposalServiceStartsInFuture,
  assertExpireProposalAuthorization,
  assertInstructorParticipantRelationship,
  assertNoActiveServiceBlockForProposal,
  assertOpenBookingProposal,
  assertProposalAcceptanceWindow,
  assertProposalExpiredForSystemExpiry,
  assertProposalPartySharesManagingAccount,
  assertProposalPartyWithinMaxParticipants,
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
  commitAddOpenProposalToPartyIndexes,
  commitRemoveOpenProposalFromPartyIndexes,
  planOpenProposalIndexMutationsForParty,
  readBookingProposalOpenIndexesForParty,
  type BookingProposalOpenIndex,
} from './bookingProposalOpenIndex';
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
  parseBooking,
  parseInstructorCatalog,
  toFirestoreWritePayload as bookingToFirestoreWritePayload,
} from './bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import {
  LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
  parseLessonPricingSettings,
} from '../pricing/lessonPricingSettingsStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

type ClaimConflictCode = 'instructor_conflict' | 'participant_conflict' | 'resource_conflict';

async function readInstructorProposalBookingScopedEvidence(
  session: CanonicalAtomicTransactionSession,
  input: Readonly<{
    instructorId: BookingProposal['instructorId'];
    participantId: ParticipantId;
    at: CanonicalTimestamp;
  }>
): Promise<readonly BookingScopedParticipantAccessEvidence[]> {
  const bookingReads = await session.tx.query({
    collection: 'bookings',
    where: {
      field: 'party.participantIds',
      op: 'array-contains',
      value: input.participantId,
    },
  });

  const evidence: BookingScopedParticipantAccessEvidence[] = [];
  for (const document of bookingReads) {
    session.plan.planRead({ path: document.path, category: 'authorization_check' });
    const booking = parseBooking(document.data);
    if (!booking) continue;
    const scoped = bookingScopedEvidenceFromQualifyingBooking({
      booking,
      instructorId: input.instructorId,
      participantId: input.participantId,
      at: input.at,
    });
    if (scoped) evidence.push(scoped);
  }
  return evidence;
}

async function resolveInstructorProposalStandingEvidence(
  session: CanonicalAtomicTransactionSession,
  topology: Parameters<typeof evaluateInstructorParticipantAccess>[0],
  input: Readonly<{
    instructorId: BookingProposal['instructorId'];
    participantId: ParticipantId;
    at: CanonicalTimestamp;
  }>
): Promise<readonly BookingScopedParticipantAccessEvidence[]> {
  const relationshipAccess = evaluateInstructorParticipantAccess(topology, {
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    bookingScopedEvidence: [],
  });
  if (relationshipAccess.allowed && relationshipAccess.scope === 'relationship') {
    return [];
  }
  return readInstructorProposalBookingScopedEvidence(session, input);
}

function participantConflictAcceptResult(
  envelope: CommandEnvelope<'accept_booking_proposal'>
): CommandResult<'accept_booking_proposal'> {
  return commandErrorResult(
    envelope.kind,
    envelope.context.correlationId,
    new CanonicalCommandError('participant_conflict', {
      correlationId: envelope.context.correlationId,
      details: { reason: 'conflict' },
    }).toTransport()
  );
}

function isExpectedParticipantGuardCreateCollision(
  error: unknown,
  participantClaimPlan: ResourceClaimOperationPlan | undefined
): participantClaimPlan is ResourceClaimOperationPlan {
  if (!(error instanceof Error)) {
    return false;
  }
  const candidate = error as Error & { code?: string | number };
  const isAlreadyExists =
    candidate.code === 6 ||
    candidate.code === 'already-exists' ||
    candidate.code === 'ALREADY_EXISTS';
  if (!isAlreadyExists) {
    return false;
  }
  if (participantClaimPlan?.claim.resourceKind !== 'participant') {
    return false;
  }
  return participantClaimPlan.guardWrites.some(
    (write) =>
      write.mutationKind === 'create' &&
      write.path.startsWith('resource_claim_guards/') &&
      candidate.message.includes(write.path)
  );
}

async function hasCompetingParticipantGuardEntry(
  participantClaimPlan: ResourceClaimOperationPlan
): Promise<boolean> {
  const expectedCreatePaths = participantClaimPlan.guardWrites
    .filter((write) => write.mutationKind === 'create')
    .map((write) => write.path);
  const snapshots = await Promise.all(
    expectedCreatePaths.map((path) => getFirestore().doc(path).get())
  );
  return snapshots.some((snapshot) => {
    const normalized = normalizeFirestoreDocument(
      snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
    );
    const guard = ResourceClaimGuardSchema.safeParse(normalized);
    return (
      guard.success &&
      guard.data.entries.some(
        (entry) =>
          entry.claimId !== participantClaimPlan.claim.claimId &&
          (entry.lifecycleStatus === 'active' || entry.lifecycleStatus === 'frozen') &&
          intervalsConflict(participantClaimPlan.claim.interval, entry.interval)
      )
    );
  });
}

async function recoverParticipantConflictAfterGuardCreateCollision(
  envelope: CommandEnvelope<'accept_booking_proposal'>,
  proposalDocumentPath: string,
  participantClaimPlans: readonly ResourceClaimOperationPlan[],
  error: unknown
): Promise<CommandResult<'accept_booking_proposal'>> {
  const collidingPlan = participantClaimPlans.find((plan) =>
    isExpectedParticipantGuardCreateCollision(error, plan)
  );
  if (!collidingPlan) {
    throw error;
  }
  try {
    const [proposalSnapshot, competingParticipantClaim] = await Promise.all([
      getFirestore().doc(proposalDocumentPath).get(),
      hasCompetingParticipantGuardEntry(collidingPlan),
    ]);
    const proposal = parseBookingProposal(
      proposalSnapshot.exists ? (proposalSnapshot.data() as Record<string, unknown>) : undefined
    );
    if (proposal?.lifecycle.status === 'open' && competingParticipantClaim) {
      return participantConflictAcceptResult(envelope);
    }
  } catch {
    throw error;
  }
  throw error;
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

async function loadManagedProposalParticipant(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  participantId: ParticipantId
): Promise<{
  readonly participant: Participant;
  readonly management: ParticipantManagement;
}> {
  const participantDocumentPath = participantPath(participantId);
  const participantRead = await session.tx.get({ path: participantDocumentPath });
  session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
  const participant = assertParticipantActive(
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
  return { participant, management };
}

async function assertInstructorAuthorityForProposalParticipant(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  input: Readonly<{
    account: NonNullable<ReturnType<typeof parseAccount>>;
    participant: Participant;
    management: ParticipantManagement;
    instructorId: BookingProposal['instructorId'];
    at: CanonicalTimestamp;
  }>
): Promise<void> {
  const relationshipDocumentPath = instructorRelationshipPath(
    instructorRelationshipIdFromPair({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
    })
  );
  const managerBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
      createdByKind: 'participant_manager',
    })
  );
  const instructorBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId: input.participant.participantId,
      instructorId: input.instructorId,
      createdByKind: 'instructor',
    })
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
    account: input.account,
    participant: input.participant,
    management: input.management,
    instructorRelationship,
    additionalBlocks: participantBlocks,
  });
  const bookingScopedEvidence = await resolveInstructorProposalStandingEvidence(
    session,
    topology,
    {
      instructorId: input.instructorId,
      participantId: input.participant.participantId,
      at: input.at,
    }
  );
  assertInstructorParticipantRelationship(envelope, topology, {
    instructorId: input.instructorId,
    participantId: input.participant.participantId,
    at: input.at,
    bookingScopedEvidence,
  });
  assertNoActiveServiceBlockForProposal(
    envelope,
    {
      account: input.account,
      participant: input.participant,
      management: input.management,
      participantBlocks,
    },
    input.instructorId
  );
}

function createBookingProposalHandler(
  envelope: CommandEnvelope<'create_booking_proposal'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_booking_proposal'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertCreateProposalAuthorization(envelope);
  const { participantIds } = assertCreateProposalParty(envelope);

  const proposalDocumentPath = bookingProposalPath(envelope.intent.bookingProposalId);
  const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);

  let notificationAccountId!: ParticipantManagement['accountId'];
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let openProposalIndexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined> =
    new Map();
  const plannedProposalRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_booking_proposal'> = {
    read: async (session) => {
      const now = timestampFromDate(environment.clock.now());
      schedule = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      );
      assertCreateProposalServiceStartsInFuture(envelope, now, schedule.interval.startsAt);

      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      if (proposalRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingProposalId', reason: 'conflict' },
        });
      }

      const pricingSettingsRead = await session.tx.get({
        path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
      });
      session.plan.planRead({
        path: LESSON_PRICING_SETTINGS_DOCUMENT_PATH,
        category: 'aggregate',
      });
      const pricingSettings = parseLessonPricingSettings(
        pricingSettingsRead.exists ? pricingSettingsRead.data : undefined
      );
      if (!pricingSettings) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'lessonPricingSettings', reason: 'required' },
        });
      }
      assertProposalPartyWithinMaxParticipants(envelope, {
        participantCount: participantIds.length,
        maxParticipantsPerLesson: pricingSettings.maxParticipantsPerLesson,
      });

      const participantRecords: Participant[] = [];
      const managementRecords: ParticipantManagement[] = [];
      for (const participantId of participantIds) {
        const loaded = await loadManagedProposalParticipant(session, envelope, participantId);
        participantRecords.push(loaded.participant);
        managementRecords.push(loaded.management);
      }
      notificationAccountId = assertProposalPartySharesManagingAccount(
        envelope,
        managementRecords
      );

      const accountRead = await session.tx.get({ path: accountPath(notificationAccountId) });
      session.plan.planRead({
        path: accountPath(notificationAccountId),
        category: 'authorization_check',
      });
      const accountRecord = assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      for (let index = 0; index < participantIds.length; index += 1) {
        await assertInstructorAuthorityForProposalParticipant(session, envelope, {
          account: accountRecord,
          participant: participantRecords[index]!,
          management: managementRecords[index]!,
          instructorId: envelope.intent.instructorId,
          at: now,
        });
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
      if (parsedInstructor.isAvailable === false) {
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

      openProposalIndexes = await readBookingProposalOpenIndexesForParty(session, {
        participantIds,
        instructorId: envelope.intent.instructorId,
      });
      planOpenProposalIndexMutationsForParty(session, {
        participantIds,
        instructorId: envelope.intent.instructorId,
        indexes: openProposalIndexes,
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
        participantIds,
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
      commitAddOpenProposalToPartyIndexes(session, {
        participantIds,
        instructorId: envelope.intent.instructorId,
        proposalId: envelope.intent.bookingProposalId,
        indexes: openProposalIndexes,
        decidedAt,
      });

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
  let participantClaimPlans: ResourceClaimOperationPlan[] = [];
  let transitionUnavailable = false;
  let openProposalIndexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined> =
    new Map();
  let pricingSettings!: LessonPricingSettings;
  let baseLessonPrice!: KztMinorUnits;
  let lessonDurationMinutes = 0;
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
      participantClaimPlans = [];

      const now = timestampFromDate(environment.clock.now());
      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      proposal = assertOpenBookingProposal(
        envelope,
        parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined)
      );
      assertProposalAcceptanceWindow(envelope, proposal, now);
      const partyParticipantIds = proposalParticipantIds(proposal);

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
      assertProposalPartyWithinMaxParticipants(envelope, {
        participantCount: partyParticipantIds.length,
        maxParticipantsPerLesson: pricingSettings.maxParticipantsPerLesson,
      });

      const participantRecords: Participant[] = [];
      const managementRecords: ParticipantManagement[] = [];
      for (const participantId of partyParticipantIds) {
        const loaded = await loadManagedProposalParticipant(session, envelope, participantId);
        participantRecords.push(loaded.participant);
        managementRecords.push(loaded.management);
      }
      const managingAccountId = assertProposalPartySharesManagingAccount(
        envelope,
        managementRecords
      );
      const accountRead = await session.tx.get({ path: accountPath(managingAccountId) });
      session.plan.planRead({
        path: accountPath(managingAccountId),
        category: 'authorization_check',
      });
      const accountRecord = assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      authorization = resolveAcceptProposalParticipantAuthorization(envelope, {
        account: accountRecord,
        participants: participantRecords,
        managements: managementRecords,
        proposal,
      });

      for (let index = 0; index < partyParticipantIds.length; index += 1) {
        await assertInstructorAuthorityForProposalParticipant(session, envelope, {
          account: accountRecord,
          participant: participantRecords[index]!,
          management: managementRecords[index]!,
          instructorId: proposal.instructorId,
          at: now,
        });
      }

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
      lessonDurationMinutes = durationMinutesFromInterval(schedule.interval);
      baseLessonPrice = calculateIndividualBookingPriceKzt(
        resolveInstructorHourlyRateKzt(instructorRecord),
        lessonDurationMinutes
      );
      servicePrice = calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: baseLessonPrice,
        additionalParticipantSurchargePerHourKzt:
          pricingSettings.additionalParticipantSurchargePerHourKzt,
        participantCount: partyParticipantIds.length,
        lessonDurationMinutes,
      });

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
          for (const participantId of partyParticipantIds) {
            const participantClaimResult = await tryPlanAcquireResourceClaim(session, {
              ...claimMetadata,
              identity: ResourceClaimIdentityInputSchema.parse({
                strategyVersion: 'claim:v1',
                claimKind: 'participant_booking_occurrence',
                resourceKind: 'participant',
                resourceId: participantId,
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
            participantClaimPlans.push(participantClaimResult.plan);
          }
        }
      }

      plannedProposalRevision = nextAggregateRevision(proposal.revision);
      session.plan.planMutation({
        path: proposalDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PROPOSAL_PLANNING_ESTIMATES.proposalBytes,
      });

      openProposalIndexes = await readBookingProposalOpenIndexesForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
      });
      planOpenProposalIndexMutationsForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
        indexes: openProposalIndexes,
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
          commitRemoveOpenProposalFromPartyIndexes(session, {
            participantIds: proposalParticipantIds(proposal),
            instructorId: proposal.instructorId,
            proposalId: proposal.proposalId,
            indexes: openProposalIndexes,
            decidedAt,
          });
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        const audit = revisionAuditLink(envelope, metadata);
        const partyParticipantIds = proposalParticipantIds(proposal);
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
          pricingSnapshot: {
            strategyVersion: 'lesson_party:v1',
            baseLessonPriceKzt: baseLessonPrice,
            additionalParticipantSurchargePerHourKzt:
              pricingSettings.additionalParticipantSurchargePerHourKzt,
            settingsRevision: pricingSettings.revision,
            lessonDurationMinutes,
            participantCount: partyParticipantIds.length,
            totalPriceKzt: servicePrice,
          },
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
        for (const plan of participantClaimPlans) {
          commitResourceClaimPlan(session, plan, claimMetadata);
        }
        commitRemoveOpenProposalFromPartyIndexes(session, {
          participantIds: partyParticipantIds,
          instructorId: proposal.instructorId,
          proposalId: proposal.proposalId,
          indexes: openProposalIndexes,
          decidedAt,
        });

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
  }).catch((error) =>
    recoverParticipantConflictAfterGuardCreateCollision(
      envelope,
      proposalDocumentPath,
      participantClaimPlans,
      error
    )
  );
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
  let openProposalIndexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined> =
    new Map();

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'cancel_booking_proposal'> = {
    read: async (session) => {
      const proposalRead = await session.tx.get({ path: proposalDocumentPath });
      session.plan.planRead({ path: proposalDocumentPath, category: 'aggregate' });
      proposal = assertOpenBookingProposal(
        envelope,
        parseBookingProposal(proposalRead.exists ? proposalRead.data : undefined)
      );
      assertCancelProposalActorMatchesProposal(envelope, proposal, cancelActor);
      const partyParticipantIds = proposalParticipantIds(proposal);

      const participantRecords: Participant[] = [];
      const managementRecords: ParticipantManagement[] = [];
      for (const participantId of partyParticipantIds) {
        const loaded = await loadManagedProposalParticipant(session, envelope, participantId);
        participantRecords.push(loaded.participant);
        managementRecords.push(loaded.management);
      }
      notificationAccountId = assertProposalPartySharesManagingAccount(
        envelope,
        managementRecords
      );

      if (cancelActor === 'instructor') {
        lifecycleTarget = 'cancelled';
      } else {
        lifecycleTarget = 'declined';
        const accountRead = await session.tx.get({ path: accountPath(notificationAccountId) });
        session.plan.planRead({
          path: accountPath(notificationAccountId),
          category: 'authorization_check',
        });
        const accountRecord = assertAccountActive(
          envelope,
          parseAccount(accountRead.exists ? accountRead.data : undefined)
        );
        assertCancelProposalParticipantAuthorization(envelope, {
          account: accountRecord,
          participants: participantRecords,
          managements: managementRecords,
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

      openProposalIndexes = await readBookingProposalOpenIndexesForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
      });
      planOpenProposalIndexMutationsForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
        indexes: openProposalIndexes,
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
      commitRemoveOpenProposalFromPartyIndexes(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
        proposalId: proposal.proposalId,
        indexes: openProposalIndexes,
        decidedAt,
      });
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
  let openProposalIndexes: ReadonlyMap<ParticipantId, BookingProposalOpenIndex | undefined> =
    new Map();

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

      openProposalIndexes = await readBookingProposalOpenIndexesForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
      });
      planOpenProposalIndexMutationsForParty(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
        indexes: openProposalIndexes,
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
      commitRemoveOpenProposalFromPartyIndexes(session, {
        participantIds: proposalParticipantIds(proposal),
        instructorId: proposal.instructorId,
        proposalId: proposal.proposalId,
        indexes: openProposalIndexes,
        decidedAt,
      });
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
