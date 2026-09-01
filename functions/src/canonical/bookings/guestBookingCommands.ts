import {
  AggregateRevisionSchema,
  assertBookingPaymentIdentity,
  BookingSchema,
  CanonicalCommandError,
  PaymentSchema,
  ResourceClaimIdentityInputSchema,
  calculateIndividualBookingPriceKzt,
  commandSuccessResult,
  createGuestActionTokenNonce,
  deriveBookingPartyKind,
  guestActorRef,
  GUEST_ACTION_TOKEN_VERSION,
  guestSubjectIdFromBookingId,
  initialBookingOccurrenceIdFromBookingId,
  isGuestBookingRequestAllowedBeforeStart,
  isGuestReservationExpired,
  isPaymentFullyFundedForService,
  isSyntheticCourseInstructorId,
  nextAggregateRevision,
  participantBlockIdFromDirection,
  participantManagementIdFromGuestLink,
  paymentIdFromBookingId,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  resolveGuestLessonReservationExpiresAt,
  resolveInstructorHourlyRateKzt,
  signGuestActionCredential,
  timestampFromDate,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type GuestBookingActionCredential,
  type GuestParticipantProfileFromTransport,
  type KztMinorUnits,
  type Participant,
  type ParticipantManagement,
  type Payment,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { expireGuestCourseEnrollmentReservation } from '../courses/guestCourseEnrollmentLifecycle';
import {
  FINANCE_PLANNING_ESTIMATES,
  parsePayment,
  paymentPath,
  toFirestoreWritePayload as financeToFirestoreWritePayload,
} from '../finance/financeStore';
import { reconcileGuestConfirmationLifecycleMismatchAfterCommand } from '../finance/financeCorrectionCommands';
import {
  planGuestPaymentConfirmation,
  type PlannedGuestPaymentConfirmation,
} from '../guestConfirmation/guestPaymentConfirmation';
import { buildStandaloneGuestPaymentConfirmationAuditPlan } from '../guestConfirmation/guestPaymentConfirmationAudit';
import {
  commitAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
} from '../resourceClaims/uniquenessGuards';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
} from '../resourceClaims/resourceClaimEngine';
import {
  commitPlannedReleaseBookingClaims,
  planReleaseBookingClaims,
} from './bookingClaimOperations';
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import {
  assertAccountActive,
  assertInitialManagementAssignmentEligible,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipant,
  parseParticipantBlock,
  parseParticipantManagement,
  participantBlockPath,
  participantManagementActiveOwnerPath,
  participantManagementPath,
  participantPath,
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
} from '../participantAccess/participantAccessStore';
import {
  BOOKING_PLANNING_ESTIMATES,
  bookingPath,
  instructorCatalogPath,
  parseBooking,
  parseInstructorCatalog,
  toFirestoreWritePayload,
} from './bookingStore';
import {
  assertConfirmGuestBookingAuthorization,
  assertExpireGuestReservationAuthorization,
  assertGuestActorMatchesBooking,
  assertGuestBookingRequestContext,
  assertGuestParticipantForBooking,
  assertLinkGuestBookingAuthorization,
  requireGuestActor,
  resolveGuestParticipantProfileForBooking,
} from './guestBookingAuthorization';
import {
  buildCreateGuestBookingRequestAuditPlan,
  buildExpireGuestReservationAuditPlan,
  buildLinkGuestBookingAuditPlan,
} from './guestBookingAudit';

export interface GuestBookingCommandEnvironment extends CommandExecutionEnvironment {
  readonly guestActionTokenSecret?: string;
}

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

function createGuestBookingRequestHandler(
  envelope: CommandEnvelope<'create_guest_booking_request'>,
  environment: GuestBookingCommandEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_guest_booking_request'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertGuestBookingRequestContext(envelope);

  const guestActor = requireGuestActor(envelope);
  assertGuestActorMatchesBooking(envelope, envelope.intent.bookingId, guestActor.guestSubjectId);

  const participantId = envelope.intent.participantIds[0]!;
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId!);
  const paymentId = paymentIdFromBookingId(envelope.intent.bookingId);
  const paymentPathValue = paymentPath(paymentId);
  const occurrenceId = initialBookingOccurrenceIdFromBookingId(envelope.intent.bookingId);
  const participantDocumentPath = participantPath(participantId);
  const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);
  const instructorBlockPath = participantBlockPath(
    participantBlockIdFromDirection({
      participantId,
      instructorId: envelope.intent.instructorId,
      createdByKind: 'instructor',
    })
  );

  let instructorRecord!: NonNullable<ReturnType<typeof parseInstructorCatalog>>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let servicePrice!: KztMinorUnits;
  let reservationExpiresAt!: ReturnType<typeof resolveGuestLessonReservationExpiresAt>;
  let instructorClaimPlan!: Awaited<ReturnType<typeof readAndPlanAcquireResourceClaim>>;
  let participantClaimPlan!: Awaited<ReturnType<typeof readAndPlanAcquireResourceClaim>>;
  let shouldCreateGuestParticipant = false;
  let guestParticipantProfile!: GuestParticipantProfileFromTransport;
  const plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  const plannedBookingRevision = AggregateRevisionSchema.parse(1);
  const plannedParticipantRevision = AggregateRevisionSchema.parse(1);

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_guest_booking_request'> = {
    read: async (session) => {
      if (!environment.guestActionTokenSecret) {
        throw new CanonicalCommandError('unavailable', {
          correlationId: envelope.context.correlationId,
          details: { field: 'guestActionTokenSecret', reason: 'required' },
        });
      }

      const now = timestampFromDate(environment.clock.now());
      if (
        !isGuestBookingRequestAllowedBeforeStart({
          now,
          serviceStartsAt: resolveBookingScheduleFromCalendarInput(
            envelope.context.calendarInput!,
            envelope.context.timezone!
          ).interval.startsAt,
        })
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'calendarInput', reason: 'out_of_range' },
        });
      }

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
      const existingParticipant = parseParticipant(
        participantRead.exists ? participantRead.data : undefined
      );
      if (!existingParticipant) {
        guestParticipantProfile = resolveGuestParticipantProfileForBooking(envelope);
        shouldCreateGuestParticipant = true;
        session.plan.planMutation({
          path: participantDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
        });
      } else {
        assertGuestParticipantForBooking(envelope, existingParticipant, participantId);
      }

      const instructorBlockRead = await session.tx.get({ path: instructorBlockPath });
      session.plan.planRead({ path: instructorBlockPath, category: 'authorization_check' });
      const instructorBlock = parseParticipantBlock(
        instructorBlockRead.exists ? instructorBlockRead.data : undefined
      );
      if (instructorBlock?.status === 'active') {
        throw new CanonicalCommandError('blocked_relationship', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
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
      const decidedAt = timestampFromDate(environment.clock.decidedAt());
      reservationExpiresAt = resolveGuestLessonReservationExpiresAt({
        createdAt: decidedAt,
        serviceStartsAt: schedule.interval.startsAt,
      });

      const claimMetadata = {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      };
      instructorClaimPlan = await readAndPlanAcquireResourceClaim(session, {
        ...claimMetadata,
        identity: ResourceClaimIdentityInputSchema.parse({
          strategyVersion: 'claim:v1',
          claimKind: 'instructor_booking_occurrence',
          resourceKind: 'instructor',
          resourceId: envelope.intent.instructorId,
          ownerKind: 'booking',
          ownerId: envelope.intent.bookingId,
          occurrenceId,
        }),
        interval: schedule.interval,
      });
      participantClaimPlan = await readAndPlanAcquireResourceClaim(session, {
        ...claimMetadata,
        identity: ResourceClaimIdentityInputSchema.parse({
          strategyVersion: 'claim:v1',
          claimKind: 'participant_booking_occurrence',
          resourceKind: 'participant',
          resourceId: participantId,
          ownerKind: 'booking',
          ownerId: envelope.intent.bookingId,
          occurrenceId,
        }),
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
    },
    planAuditOutbox: async () =>
      buildCreateGuestBookingRequestAuditPlan({
        envelope,
        bookingId: envelope.intent.bookingId,
        paymentId,
        bookingRevision: plannedBookingRevision,
        paymentRevision: plannedPaymentRevision,
        participantId: shouldCreateGuestParticipant ? participantId : undefined,
        participantRevision: shouldCreateGuestParticipant ? plannedParticipantRevision : undefined,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const audit = revisionAuditLink(envelope, metadata);
      const partyParticipantIds = [participantId];

      if (shouldCreateGuestParticipant) {
        const participant: Participant = {
          participantId,
          displayName: guestParticipantProfile.displayName,
          age: { kind: 'age_years', years: guestParticipantProfile.ageYears },
          skillLevel: guestParticipantProfile.skillLevel,
          discipline: guestParticipantProfile.discipline,
          management: { kind: 'unmanaged_guest' },
          lifecycle: { status: 'active' },
          revision: plannedParticipantRevision,
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        };
        session.tx.create(
          { path: participantDocumentPath },
          participant as Record<string, unknown>
        );
      }

      const booking: Booking = BookingSchema.parse({
        bookingId: envelope.intent.bookingId,
        attribution: {
          bookingOrigin: 'guest',
          bookedBy: guestActorRef(guestSubjectIdFromBookingId(envelope.intent.bookingId)),
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
          },
        },
        lifecycle: {
          status: 'pending',
          reservationExpiresAt,
        },
        paymentId,
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
        originalPrice: servicePrice,
        price: servicePrice,
        paidAmount: KztMinorUnitsSchema.parse(0),
        refundedAmount: KztMinorUnitsSchema.parse(0),
        retainedAmount: KztMinorUnitsSchema.parse(0),
        settledAmount: KztMinorUnitsSchema.parse(0),
        writtenOffAmount: KztMinorUnitsSchema.parse(0),
        outstandingAmount: servicePrice,
        paymentStatus: 'unpaid',
        incrementalRequirements: [],
        revision: plannedPaymentRevision,
        eventRevision: AggregateRevisionSchema.parse(0),
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

      const claimMetadata = {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: context.decidedAt,
      };
      commitResourceClaimPlan(session, instructorClaimPlan, claimMetadata);
      commitResourceClaimPlan(session, participantClaimPlan, claimMetadata);

      const secret = environment.guestActionTokenSecret;
      if (!secret) {
        throw new CanonicalCommandError('unavailable', {
          correlationId: envelope.context.correlationId,
        });
      }
      const nonce = createGuestActionTokenNonce();
      const guestSubjectId = guestSubjectIdFromBookingId(envelope.intent.bookingId);
      const signature = signGuestActionCredential(secret, {
        version: GUEST_ACTION_TOKEN_VERSION,
        subjectKind: 'booking',
        bookingId: envelope.intent.bookingId,
        guestSubjectId,
        purpose: 'cancel_pending_reservation',
        expiresAt: reservationExpiresAt,
        nonce,
      });
      const guestActionCredential: GuestBookingActionCredential = {
        bookingId: envelope.intent.bookingId,
        guestSubjectId,
        nonce,
        signature,
        expiresAt: reservationExpiresAt,
      };

      return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
        guestActionCredential,
      });
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function confirmGuestBookingHandler(
  envelope: CommandEnvelope<'confirm_guest_booking'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'confirm_guest_booking'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertConfirmGuestBookingAuthorization(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId!);
  let plannedConfirmation: PlannedGuestPaymentConfirmation | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'confirm_guest_booking'> = {
    read: async (session) => {
      plannedConfirmation = undefined;
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const booking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!booking) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      const paymentRead = await session.tx.get({ path: paymentPath(booking.paymentId) });
      session.plan.planRead({ path: paymentPath(booking.paymentId), category: 'payment_wallet' });
      const payment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!payment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }
      assertBookingPaymentIdentity(envelope.context.correlationId, booking, payment);
      const decision = await planGuestPaymentConfirmation({
        session,
        payment,
        correlationId: envelope.context.correlationId,
        commandId: metadata.commandId,
        now: timestampFromDate(environment.clock.now()),
      });
      if (decision.outcome !== 'planned') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: {
            field: decision.reason === 'payment_not_fully_funded' ? 'paymentId' : 'lifecycle',
            reason: 'conflict',
          },
        });
      }
      plannedConfirmation = decision.plan;
      if (
        plannedConfirmation.subjectKind !== 'booking' ||
        plannedConfirmation.subjectId !== envelope.intent.bookingId ||
        plannedConfirmation.paymentId !== booking.paymentId
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }
    },
    planAuditOutbox: async () =>
      buildStandaloneGuestPaymentConfirmationAuditPlan({
        envelope,
        plan: plannedConfirmation!,
      }),
    execute: async (session, context) => {
      if (!plannedConfirmation) {
        throw new CanonicalCommandError('internal', {
          correlationId: envelope.context.correlationId,
        });
      }
      plannedConfirmation.commit(session, context.decidedAt);
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

function expireGuestReservationHandler(
  envelope: CommandEnvelope<'expire_guest_reservation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'expire_guest_reservation'>> {
  if (envelope.intent.courseEnrollmentId !== undefined) {
    return expireGuestCourseEnrollmentReservation(envelope, environment, executor);
  }
  return expireGuestBookingReservationHandler(envelope, environment, executor);
}

async function expireGuestBookingReservationHandler(
  envelope: CommandEnvelope<'expire_guest_reservation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'expire_guest_reservation'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertExpireGuestReservationAuthorization(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId!);

  let booking!: Booking;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseBookingClaims>> = [];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'expire_guest_reservation'> = {
    read: async (session) => {
      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsed = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsed) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      booking = parsed;
      if (booking.attribution.bookingOrigin !== 'guest') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'unsupported' },
        });
      }
      if (booking.lifecycle.status !== 'pending') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'conflict' },
        });
      }

      const paymentDocumentPath = paymentPath(booking.paymentId);
      const paymentRead = await session.tx.get({ path: paymentDocumentPath });
      session.plan.planRead({ path: paymentDocumentPath, category: 'payment_wallet' });
      const payment = parsePayment(paymentRead.exists ? paymentRead.data : undefined);
      if (!payment) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }
      assertBookingPaymentIdentity(envelope.context.correlationId, booking, payment);
      if (isPaymentFullyFundedForService(payment)) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'paymentId', reason: 'conflict' },
        });
      }

      const now = timestampFromDate(environment.clock.now());
      if (
        !isGuestReservationExpired({
          now,
          reservationExpiresAt: booking.lifecycle.reservationExpiresAt,
        })
      ) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
        });
      }

      plannedRevision = nextAggregateRevision(booking.revision);
      plannedReleaseClaims = await planReleaseBookingClaims(
        session,
        booking,
        metadata,
        environment.clock.decidedAt()
      );
      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildExpireGuestReservationAuditPlan({
        bookingId: envelope.intent.bookingId!,
        bookingRevision: plannedRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedBooking = BookingSchema.parse({
        ...booking,
        lifecycle: {
          status: 'cancelled',
          cancelledAt: decidedAt,
          reasonCode: 'reservation_expired',
        },
        revision: plannedRevision,
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
      commitPlannedReleaseBookingClaims(session, plannedReleaseClaims, metadata, context.decidedAt);
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  const result = await executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: bookingDocumentPath }, requireExpectedRevision: true },
    handler,
  });
  if (result.status === 'success') {
    await reconcileGuestConfirmationLifecycleMismatchAfterCommand({
      correlationId: envelope.context.correlationId,
      paymentId: paymentIdFromBookingId(envelope.intent.bookingId!),
      environment,
      executor,
    });
  }
  return result;
}

function linkGuestBookingToAccountHandler(
  envelope: CommandEnvelope<'link_guest_booking_to_account'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'link_guest_booking_to_account'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertLinkGuestBookingAuthorization(envelope);
  const actor = requireAccountActor(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId!);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  const managementId = participantManagementIdFromGuestLink({
    participantId: envelope.intent.participantId,
    accountId: actor.accountId,
  });
  const managementDocumentPath = participantManagementPath(managementId);
  const guardDocumentPath = participantManagementActiveOwnerPath(envelope.intent.participantId);

  let booking!: Booking;
  let participantRecord!: Participant;
  let existingManagement: ReturnType<typeof parseParticipantManagement>;
  let existingGuard: ReturnType<typeof parseActiveOwnerGuard>;
  let plannedBookingRevision = AggregateRevisionSchema.parse(1);
  let plannedParticipantRevision = AggregateRevisionSchema.parse(1);
  let plannedManagementRevision = AggregateRevisionSchema.parse(1);
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'link_guest_booking_to_account'> = {
    read: async (session) => {
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({
        path: accountPath(actor.accountId),
        category: 'authorization_check',
      });
      assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking || parsedBooking.attribution.bookingOrigin !== 'guest') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'booking', reason: 'unsupported' },
        });
      }
      booking = parsedBooking;
      if (!booking.party.participantIds.includes(envelope.intent.participantId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'participantId', reason: 'conflict' },
        });
      }

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      participantRecord = assertParticipantActive(
        envelope,
        parseParticipant(participantRead.exists ? participantRead.data : undefined)
      );
      if (participantRecord.management.kind === 'managed') {
        if (participantRecord.management.participantManagementId !== managementId) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }
      if (participantRecord.management.kind !== 'unmanaged_guest') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }
      if (participantRecord.initialManagementEligibleAccountId !== undefined) {
        assertInitialManagementAssignmentEligible(envelope, participantRecord, actor.accountId);
      }

      const managementRead = await session.tx.get({ path: managementDocumentPath });
      session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
      existingManagement = parseParticipantManagement(
        managementRead.exists ? managementRead.data : undefined
      );
      if (existingManagement?.status === 'ended') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      const guardRead = await session.tx.get({ path: guardDocumentPath });
      session.plan.planRead({ path: guardDocumentPath, category: 'authorization_check' });
      existingGuard = parseActiveOwnerGuard(guardRead.exists ? guardRead.data : undefined);
      if (existingGuard && existingGuard.accountId !== actor.accountId) {
        throw new CanonicalCommandError('blocked_relationship', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'participant', reason: 'conflict' },
        });
      }

      plannedManagementRevision = existingManagement
        ? nextAggregateRevision(existingManagement.revision)
        : AggregateRevisionSchema.parse(1);
      plannedParticipantRevision = nextAggregateRevision(participantRecord.revision);
      plannedBookingRevision = nextAggregateRevision(booking.revision);
      plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
        participantId: envelope.intent.participantId,
        accountId: actor.accountId,
        participantManagementId: managementId,
        managementRevision: plannedManagementRevision,
      });

      session.plan.planMutation({
        path: managementDocumentPath,
        kind: existingManagement ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
      });
      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
      session.plan.planMutation({
        path: bookingDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
      });
    },
    planAuditOutbox: async () =>
      buildLinkGuestBookingAuditPlan({
        bookingId: envelope.intent.bookingId,
        participantId: envelope.intent.participantId,
        bookingRevision: plannedBookingRevision,
        participantRevision: plannedParticipantRevision,
        managementRevision: plannedManagementRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const audit = revisionAuditLink(envelope, metadata);
      const management: ParticipantManagement = existingManagement
        ? {
            ...existingManagement,
            accountId: actor.accountId,
            participantId: envelope.intent.participantId,
            role: 'owner',
            authority: 'self',
            status: 'active',
            revision: plannedManagementRevision,
            updatedAt: decidedAt,
            audit: {
              ...existingManagement.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        : {
            participantManagementId: managementId,
            accountId: actor.accountId,
            participantId: envelope.intent.participantId,
            role: 'owner',
            authority: 'self',
            status: 'active',
            revision: plannedManagementRevision,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit,
          };

      const updatedParticipant: Participant = {
        ...participantRecord,
        management: {
          kind: 'managed',
          participantManagementId: managementId,
        },
        initialManagementEligibleAccountId:
          CANONICAL_FIELD_DELETE as unknown as Participant['initialManagementEligibleAccountId'],
        revision: plannedParticipantRevision,
        updatedAt: decidedAt,
        audit: {
          ...participantRecord.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      };

      const updatedBooking = BookingSchema.parse({
        ...booking,
        revision: plannedBookingRevision,
        updatedAt: decidedAt,
        audit: {
          ...booking.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });

      if (existingManagement) {
        session.tx.update({ path: managementDocumentPath }, management as Record<string, unknown>);
      } else {
        session.tx.create({ path: managementDocumentPath }, management as Record<string, unknown>);
      }
      session.tx.update(
        { path: participantDocumentPath },
        updatedParticipant as Record<string, unknown>
      );
      session.tx.update(
        { path: bookingDocumentPath },
        toFirestoreWritePayload(updatedBooking as Record<string, unknown>)
      );

      commitAcquireParticipantManagementActiveOwnerGuard(
        session,
        {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
          participantId: envelope.intent.participantId,
          accountId: actor.accountId,
          participantManagementId: managementId,
          managementRevision: plannedManagementRevision,
        },
        plannedOwnerGuard.guard,
        plannedOwnerGuard.hadExisting
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

export function createGuestBookingCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestActionTokenSecret?: string
): Pick<
  CommandHandlerMap,
  | 'create_guest_booking_request'
  | 'confirm_guest_booking'
  | 'expire_guest_reservation'
  | 'link_guest_booking_to_account'
> {
  const environmentBase = (
    environment: CommandExecutionEnvironment
  ): GuestBookingCommandEnvironment => ({
    ...environment,
    guestActionTokenSecret,
  });

  return {
    create_guest_booking_request: (envelope, environment) =>
      createGuestBookingRequestHandler(envelope, environmentBase(environment), executor),
    confirm_guest_booking: (envelope, environment) =>
      confirmGuestBookingHandler(envelope, environment, executor),
    expire_guest_reservation: (envelope, environment) =>
      expireGuestReservationHandler(envelope, environment, executor),
    link_guest_booking_to_account: (envelope, environment) =>
      linkGuestBookingToAccountHandler(envelope, environment, executor),
  };
}
