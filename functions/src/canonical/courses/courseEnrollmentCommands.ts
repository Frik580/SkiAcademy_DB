import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseEnrollmentSchema,
  KztMinorUnitsSchema,
  PaymentSchema,
  accountActorRef,
  applyExternalPaymentFunding,
  assertExpectedRevision,
  assertUniqueEnrollmentParticipantIds,
  buildCourseSeatClaimIdentity,
  buildParticipantCourseDayEnrollmentClaimIdentity,
  commandSuccessResult,
  courseEnrollmentSeatOccurrenceId,
  debitWalletBalance,
  participantBlockIdFromDirection,
  courseScheduleIsComplete,
  courseSeatClaimInterval,
  guestActorRef,
  isCourseEnrollmentAllowedBeforeStart,
  isPaymentFullyFundedForService,
  monetaryEventIdFromCommandEffect,
  nextAggregateRevision,
  paymentEffectFromProjectionChange,
  paymentIdFromCourseEnrollmentId,
  resolveCommandIdempotencyIdentity,
  resolveEnrollmentIdsForCommand,
  resolveGuestCourseReservationExpiresAt,
  sortedCourseDays,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Course,
  type CourseDay,
  type CourseEnrollment,
  type KztMinorUnits,
  type MonetaryEvent,
  type Payment,
  type PaymentAccountingFields,
  type PaymentAccountingProjection,
  type Wallet,
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
  buildParticipantAccessTopology,
  evaluateNewServiceBlocked,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  commitAcquireActiveCourseEnrollmentGuard,
  readAndPlanAcquireActiveCourseEnrollmentGuard,
} from '../resourceClaims/uniquenessGuards';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  registerResourceClaimPlanInGuardOverlay,
  type InTransactionGuardOverlay,
  type ResourceClaimOperationPlan,
} from '../resourceClaims/resourceClaimEngine';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
  toFirestoreWritePayload as courseToFirestoreWritePayload,
  COURSE_PLANNING_ESTIMATES,
} from './courseStore';
import {
  assertAdminEnrollmentUnderpaymentReason,
  assertManagedParticipantRecord,
  resolveCourseEnrollmentCreationAuthorization,
  resolveManagedEnrollmentAuthorization,
  type CourseEnrollmentCreationAuthorization,
} from './courseEnrollmentAuthorization';
import { buildCreateCourseEnrollmentsAuditPlan } from './courseEnrollmentAudit';
import {
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
  courseEnrollmentPath,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
} from './courseEnrollmentStore';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

interface PlannedParticipantEnrollment {
  readonly participantId: CourseEnrollment['participantId'];
  readonly enrollmentId: CourseEnrollment['enrollmentId'];
  readonly paymentId: ReturnType<typeof paymentIdFromCourseEnrollmentId>;
  readonly authorization: CourseEnrollmentCreationAuthorization;
  readonly paymentProjection: PaymentAccountingProjection;
  readonly guardPlan: Awaited<ReturnType<typeof readAndPlanAcquireActiveCourseEnrollmentGuard>>;
  readonly seatClaimPlan: ResourceClaimOperationPlan;
  readonly dayClaimPlans: readonly ResourceClaimOperationPlan[];
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

function monetaryActorFromEnvelope(envelope: CommandEnvelope<'create_course_enrollments'>) {
  const actor = envelope.context.actor;
  if (actor.kind === 'account') {
    return { kind: 'account' as const, accountId: actor.accountId };
  }
  if (actor.kind === 'guest') {
    return { kind: 'guest' as const, guestSubjectId: actor.guestSubjectId };
  }
  if (actor.kind === 'system') {
    return { kind: 'system' as const, systemActorId: actor.systemActorId };
  }
  return { kind: 'provider' as const, providerId: actor.providerId };
}

function unpaidPaymentProjection(price: KztMinorUnits): PaymentAccountingProjection {
  return {
    ...initialUnpaidPaymentFields(price),
    paymentStatus: 'unpaid',
  };
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

async function loadParticipantBlocksForCourseDays(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: {
    readonly participantId: CourseEnrollment['participantId'];
    readonly courseDays: readonly CourseDay[];
  }
) {
  const participantBlocks = [];
  const instructorIds = new Set<string>();
  for (const courseDay of input.courseDays) {
    for (const instructorId of courseDay.actualInstructorIds) {
      instructorIds.add(instructorId as string);
    }
  }
  for (const instructorId of instructorIds) {
    for (const createdByKind of ['participant_manager', 'instructor'] as const) {
      const blockPath = participantBlockPath(
        participantBlockIdFromDirection({
          participantId: input.participantId,
          instructorId: instructorId as CourseDay['actualInstructorIds'][number],
          createdByKind,
        })
      );
      const blockRead = await session.tx.get({ path: blockPath });
      session.plan.planRead({ path: blockPath, category: 'authorization_check' });
      const block = parseParticipantBlock(blockRead.exists ? blockRead.data : undefined);
      if (block) {
        participantBlocks.push(block);
      }
    }
  }
  return participantBlocks;
}

function assertNoBlocksForCourseDays(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  input: {
    readonly participant: import('@ski-academy/shared-domain').Participant;
    readonly courseDays: readonly CourseDay[];
    readonly participantBlocks: readonly import('@ski-academy/shared-domain').ParticipantBlock[];
  }
): void {
  const topology = buildParticipantAccessTopology({
    participant: input.participant,
    additionalBlocks: input.participantBlocks,
  });
  const instructorIds = new Set<string>();
  for (const courseDay of input.courseDays) {
    for (const instructorId of courseDay.actualInstructorIds) {
      instructorIds.add(instructorId as string);
    }
  }
  for (const instructorId of instructorIds) {
    if (
      evaluateNewServiceBlocked(
        topology,
        input.participant.participantId,
        instructorId as CourseDay['actualInstructorIds'][number]
      )
    ) {
      throw new CanonicalCommandError('blocked_relationship', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'participant', reason: 'conflict' },
      });
    }
  }
}

function createCourseEnrollmentsHandler(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_course_enrollments'>> {
  const metadata = metadataFromEnvelope(envelope);
  try {
    assertUniqueEnrollmentParticipantIds(envelope.intent.participantIds);
  } catch {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'conflict' },
    });
  }

  const mode = resolveCourseEnrollmentCreationAuthorization(envelope);
  const enrollmentIds = resolveEnrollmentIdsForCommand({
    commandId: metadata.commandId,
    participantIds: envelope.intent.participantIds,
  });
  const courseDocumentPath = coursePath(envelope.intent.courseId);

  let courseRecord!: Course;
  let courseDays!: readonly CourseDay[];
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedEnrollments: PlannedParticipantEnrollment[] = [];
  let payerAccountId: import('@ski-academy/shared-domain').AccountId | undefined;
  let walletRecord: Wallet | undefined;
  let walletExists = false;
  let walletDocumentPath = '';
  let plannedWalletRevision = AggregateRevisionSchema.parse(1);
  let plannedWalletEventRevision = AggregateRevisionSchema.parse(0);
  let walletFunding = KztMinorUnitsSchema.parse(0);
  let servicePrice!: KztMinorUnits;
  let totalServicePrice!: KztMinorUnits;
  let includeWalletEffect = false;
  let stageMonetaryEvents = false;
  let stagedEventIds: ReturnType<typeof monetaryEventIdFromCommandEffect>[] = [];
  let underfunded = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_course_enrollments'> = {
    read: async (session) => {
      const now = timestampFromDate(environment.clock.now());
      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      courseRecord = parsedCourse;
      if (envelope.context.expectedRevision !== undefined) {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision: envelope.context.expectedRevision,
          currentRevision: courseRecord.revision,
        });
      }

      const dayDocuments = await session.tx.query({
        collection: courseDaysCollectionPath(envelope.intent.courseId),
        where: { field: 'courseId', op: '==', value: envelope.intent.courseId },
      });
      session.plan.planRead({
        path: `${courseDaysCollectionPath(envelope.intent.courseId)}/query`,
        category: 'aggregate',
      });
      courseDays = sortedCourseDays(
        parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} })))
      );
      if (!courseScheduleIsComplete(courseRecord, courseDays)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'unsupported' },
        });
      }

      const seatCount = envelope.intent.participantIds.length;
      if (seatCount * courseDays.length > 64 * 4) {
        throw new CanonicalCommandError('operation_too_large', {
          correlationId: envelope.context.correlationId,
        });
      }

      if (
        !isCourseEnrollmentAllowedBeforeStart({
          now,
          courseStartsAt: courseRecord.startAt,
        })
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'out_of_range' },
        });
      }

      if (courseRecord.capacity.availableSeats < seatCount) {
        throw new CanonicalCommandError('unavailable', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course', reason: 'conflict' },
        });
      }

      servicePrice = courseRecord.price;
      totalServicePrice = KztMinorUnitsSchema.parse(servicePrice * seatCount);
      const claimMetadata = {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      };
      const decidedAtTimestamp = timestampFromDate(environment.clock.decidedAt());
      const seatInterval = courseSeatClaimInterval({
        decidedAt: decidedAtTimestamp,
        course: courseRecord,
      });

      const nextPlanned: PlannedParticipantEnrollment[] = [];
      const resourceClaimGuardOverlay: InTransactionGuardOverlay = new Map();

      for (const [index, participantId] of envelope.intent.participantIds.entries()) {
        const enrollmentId = enrollmentIds[index]!;
        const paymentId = paymentIdFromCourseEnrollmentId(enrollmentId);
        const enrollmentDocumentPath = courseEnrollmentPath(enrollmentId);
        const paymentPathValue = `payments/${paymentId}`;

        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        if (enrollmentRead.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'participantIds', reason: 'conflict' },
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

        const participantRead = await session.tx.get({ path: participantPath(participantId) });
        session.plan.planRead({ path: participantPath(participantId), category: 'aggregate' });
        const participantRecord = assertManagedParticipantRecord(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );

        let authorization: CourseEnrollmentCreationAuthorization = { mode };
        if (mode === 'guest') {
          if (participantRecord.management.kind !== 'unmanaged_guest') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }
          authorization = { mode: 'guest' };
          const guestBlocks = await loadParticipantBlocksForCourseDays(session, {
            participantId,
            courseDays,
          });
          assertNoBlocksForCourseDays(envelope, {
            participant: participantRecord,
            courseDays,
            participantBlocks: guestBlocks,
          });
        } else {
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

          const actor = requireAccountActor(envelope);
          const actorAccountRead = await session.tx.get({ path: accountPath(actor.accountId) });
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

          authorization = resolveManagedEnrollmentAuthorization(envelope, mode, {
            account: actorAccount,
            participant: participantRecord,
            management: managementRecord,
          });

          const payerRead = await session.tx.get({
            path: accountPath(authorization.payerAccountId!),
          });
          session.plan.planRead({
            path: accountPath(authorization.payerAccountId!),
            category: 'authorization_check',
          });
          const payerAccount = parseAccount(payerRead.exists ? payerRead.data : undefined);
          if (!payerAccount || payerAccount.lifecycle.status !== 'active') {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }

          const participantBlocks = await loadParticipantBlocksForCourseDays(session, {
            participantId,
            courseDays,
          });
          assertNoBlocksForCourseDays(envelope, {
            participant: participantRecord,
            courseDays,
            participantBlocks,
          });
        }

        const guardPlan = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
          ...claimMetadata,
          participantId,
          courseId: envelope.intent.courseId,
          courseEnrollmentId: enrollmentId,
        });

        const seatIdentity = buildCourseSeatClaimIdentity({
          courseId: envelope.intent.courseId,
          enrollmentId,
          occurrenceId: courseEnrollmentSeatOccurrenceId(enrollmentId),
        });
        const seatClaimPlan = await readAndPlanAcquireResourceClaim(session, {
          ...claimMetadata,
          identity: seatIdentity.identity,
          interval: seatInterval,
          inTransactionGuardOverlay: resourceClaimGuardOverlay,
        });
        registerResourceClaimPlanInGuardOverlay(resourceClaimGuardOverlay, seatClaimPlan);

        const dayClaimPlans: ResourceClaimOperationPlan[] = [];
        for (const courseDay of courseDays) {
          const dayIdentity = buildParticipantCourseDayEnrollmentClaimIdentity({
            participantId,
            enrollmentId,
            courseDay,
          });
          const dayClaimPlan = await readAndPlanAcquireResourceClaim(session, {
            ...claimMetadata,
            identity: dayIdentity.identity,
            interval: courseDay.interval,
            inTransactionGuardOverlay: resourceClaimGuardOverlay,
          });
          registerResourceClaimPlanInGuardOverlay(resourceClaimGuardOverlay, dayClaimPlan);
          dayClaimPlans.push(dayClaimPlan);
        }

        nextPlanned.push({
          participantId,
          enrollmentId,
          paymentId,
          authorization,
          paymentProjection: unpaidPaymentProjection(servicePrice),
          guardPlan,
          seatClaimPlan,
          dayClaimPlans,
        });

        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });
        session.plan.planMutation({
          path: paymentPathValue,
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
        });
      }

      const payerAccountIds = new Set(
        nextPlanned
          .map((planned) => planned.authorization.payerAccountId)
          .filter((value): value is NonNullable<typeof value> => value !== undefined)
      );
      if (mode !== 'guest' && payerAccountIds.size !== 1) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'participantIds', reason: 'unsupported' },
        });
      }
      payerAccountId = [...payerAccountIds][0];

      const guestPaymentProjection = unpaidPaymentProjection(servicePrice);

      if (mode === 'guest') {
        plannedEnrollments = nextPlanned.map((planned) => ({
          ...planned,
          paymentProjection: guestPaymentProjection,
        }));
        includeWalletEffect = false;
        stageMonetaryEvents = false;
        stagedEventIds = [];
      } else if (mode === 'account_self_service') {
        walletDocumentPath = walletPath(payerAccountId!);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists;
        const walletBalance = walletRecord?.balance ?? 0;
        if (walletBalance < totalServicePrice) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        walletFunding = totalServicePrice;
        const fundedProjection = applyExternalPaymentFunding(
          initialUnpaidPaymentFields(servicePrice),
          servicePrice
        );
        if (!isPaymentFullyFundedForService(fundedProjection)) {
          throw new CanonicalCommandError('insufficient_funds', {
            correlationId: envelope.context.correlationId,
          });
        }
        plannedEnrollments = nextPlanned.map((planned) => ({
          ...planned,
          paymentProjection: fundedProjection,
        }));
        includeWalletEffect = true;
        stageMonetaryEvents = true;
        stagedEventIds = enrollmentIds.map((_, index) =>
          monetaryEventIdFromCommandEffect(metadata.commandId, index)
        );
        plannedWalletEventRevision = walletExists
          ? nextAggregateRevision(walletRecord!.eventRevision)
          : AggregateRevisionSchema.parse(1);
        plannedWalletRevision = walletExists
          ? nextAggregateRevision(walletRecord!.revision)
          : AggregateRevisionSchema.parse(1);
      } else {
        walletDocumentPath = walletPath(payerAccountId!);
        const walletRead = await session.tx.get({ path: walletDocumentPath });
        session.plan.planRead({ path: walletDocumentPath, category: 'payment_wallet' });
        walletRecord = parseWallet(walletRead.exists ? walletRead.data : undefined);
        walletExists = walletRead.exists;
        let remainingWallet = walletRecord?.balance ?? 0;
        const paymentProjections: PaymentAccountingProjection[] = [];
        for (let index = 0; index < seatCount; index += 1) {
          const seatFunding = KztMinorUnitsSchema.parse(
            Math.min(remainingWallet, servicePrice)
          );
          paymentProjections.push(
            applyExternalPaymentFunding(initialUnpaidPaymentFields(servicePrice), seatFunding)
          );
          remainingWallet -= seatFunding;
        }
        walletFunding = KztMinorUnitsSchema.parse((walletRecord?.balance ?? 0) - remainingWallet);
        underfunded = paymentProjections.some(
          (projection) => projection.outstandingAmount > 0
        );
        assertAdminEnrollmentUnderpaymentReason(
          envelope,
          Math.max(...paymentProjections.map((projection) => projection.outstandingAmount))
        );
        plannedEnrollments = nextPlanned.map((planned, index) => ({
          ...planned,
          paymentProjection: paymentProjections[index]!,
        }));
        includeWalletEffect = walletFunding > 0;
        stageMonetaryEvents = walletFunding > 0;
        stagedEventIds = plannedEnrollments
          .map((planned, index) =>
            planned.paymentProjection.paidAmount > 0
              ? monetaryEventIdFromCommandEffect(metadata.commandId, index)
              : undefined
          )
          .filter((eventId): eventId is NonNullable<typeof eventId> => eventId !== undefined);
        plannedWalletEventRevision = walletExists
          ? nextAggregateRevision(walletRecord!.eventRevision)
          : AggregateRevisionSchema.parse(1);
        plannedWalletRevision = walletExists
          ? nextAggregateRevision(walletRecord!.revision)
          : AggregateRevisionSchema.parse(1);
      }

      plannedCourseRevision = nextAggregateRevision(courseRecord.revision);
      session.plan.planMutation({
        path: courseDocumentPath,
        kind: 'update',
        category: 'capacity_projection',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
      });
      if (includeWalletEffect) {
        session.plan.planMutation({
          path: walletDocumentPath,
          kind: walletExists ? 'update' : 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.walletBytes,
        });
      }
      for (const eventId of stagedEventIds) {
        session.plan.planMutation({
          path: monetaryEventPath(eventId),
          kind: 'create',
          category: 'payment_wallet',
          estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.monetaryEventBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildCreateCourseEnrollmentsAuditPlan({
        envelope,
        courseId: envelope.intent.courseId,
        courseRevision: plannedCourseRevision,
        enrollmentIds,
        paymentIds: enrollmentIds.map((enrollmentId) =>
          paymentIdFromCourseEnrollmentId(enrollmentId)
        ),
        monetaryEventIds: stagedEventIds,
        mode,
        underfunded,
        includeWalletEffect,
        notificationAccountId: payerAccountId,
        walletRevision: includeWalletEffect ? plannedWalletRevision : undefined,
      }),
    execute: async (session, context) => {
      try {
        const decidedAt = timestampFromDate(context.decidedAt);
        const audit = revisionAuditLink(envelope, metadata);
        const updatedCourse: Course = {
          ...courseRecord,
          capacity: {
            ...courseRecord.capacity,
            availableSeats: courseRecord.capacity.availableSeats - envelope.intent.participantIds.length,
          },
          revision: plannedCourseRevision,
          updatedAt: decidedAt,
          audit: {
            ...courseRecord.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        };
        session.tx.update(
          { path: courseDocumentPath },
          courseToFirestoreWritePayload(updatedCourse as Record<string, unknown>)
        );

        const claimMetadata = {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        };

        for (const planned of plannedEnrollments) {
          const lifecycle =
            mode === 'guest'
              ? {
                  status: 'pending' as const,
                  reservationExpiresAt: resolveGuestCourseReservationExpiresAt({
                    createdAt: decidedAt,
                    courseStartsAt: courseRecord.startAt,
                  }),
                }
              : { status: 'confirmed' as const };

          const attribution =
            mode === 'guest'
              ? {
                  bookingOrigin: 'guest' as const,
                  bookedBy: guestActorRef(
                    envelope.context.actor.kind === 'guest'
                      ? envelope.context.actor.guestSubjectId
                      : (() => {
                          throw new CanonicalCommandError('forbidden', {
                            correlationId: envelope.context.correlationId,
                          });
                        })()
                  ),
                }
              : {
                  bookingOrigin:
                    mode === 'administrator' ? ('admin' as const) : ('account' as const),
                  bookedBy: accountActorRef(planned.authorization.bookedByAccountId!),
                };

          const enrollment: CourseEnrollment = CourseEnrollmentSchema.parse({
            enrollmentId: planned.enrollmentId,
            participantId: planned.participantId,
            courseId: envelope.intent.courseId,
            originalCourseId: envelope.intent.courseId,
            attribution,
            lifecycle,
            paymentId: planned.paymentId,
            ...(mode === 'guest' ? {} : { payerAccountId: planned.authorization.payerAccountId }),
            revision: AggregateRevisionSchema.parse(1),
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit,
          });

          const paymentFields = planned.paymentProjection;

          const payment: Payment = PaymentSchema.parse({
            paymentId: planned.paymentId,
            subjectType: 'course_enrollment',
            subjectId: planned.enrollmentId,
            currency: 'KZT',
            originalPrice: paymentFields.originalPrice,
            price: paymentFields.price,
            paidAmount: paymentFields.paidAmount,
            refundedAmount: paymentFields.refundedAmount,
            retainedAmount: paymentFields.retainedAmount,
            settledAmount: paymentFields.settledAmount,
            writtenOffAmount: paymentFields.writtenOffAmount,
            outstandingAmount: paymentFields.outstandingAmount,
            paymentStatus: paymentFields.paymentStatus,
            ...(mode === 'guest' ? {} : { payerAccountId: planned.authorization.payerAccountId }),
            incrementalRequirements: [],
            revision: AggregateRevisionSchema.parse(1),
            eventRevision:
              paymentFields.paidAmount > 0
                ? AggregateRevisionSchema.parse(1)
                : AggregateRevisionSchema.parse(0),
            createdAt: decidedAt,
            updatedAt: decidedAt,
          });

          session.tx.create(
            { path: courseEnrollmentPath(planned.enrollmentId) },
            enrollmentToFirestoreWritePayload(enrollment as Record<string, unknown>)
          );
          session.tx.create(
            { path: `payments/${planned.paymentId}` },
            financeToFirestoreWritePayload(payment as Record<string, unknown>)
          );

          commitAcquireActiveCourseEnrollmentGuard(
            session,
            {
              ...claimMetadata,
              participantId: planned.participantId,
              courseId: envelope.intent.courseId,
              courseEnrollmentId: planned.enrollmentId,
            },
            planned.guardPlan.guard,
            planned.guardPlan.hadExisting
          );
          commitResourceClaimPlan(session, planned.seatClaimPlan, claimMetadata);
          for (const dayClaimPlan of planned.dayClaimPlans) {
            commitResourceClaimPlan(session, dayClaimPlan, claimMetadata);
          }
        }

        if (includeWalletEffect && payerAccountId) {
          const wallet = walletRecord ?? initialWallet(payerAccountId, decidedAt);
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

        if (stageMonetaryEvents && payerAccountId) {
          let walletEventRevision = plannedWalletEventRevision;
          for (const [index, planned] of plannedEnrollments.entries()) {
            if (planned.paymentProjection.paidAmount <= 0) {
              continue;
            }
            const eventId =
              stagedEventIds[index] ?? monetaryEventIdFromCommandEffect(metadata.commandId, index);
            const beforePayment = initialUnpaidPaymentFields(servicePrice);
            const monetaryEvent: MonetaryEvent = {
              eventId,
              eventKind: 'course_charge',
              currency: 'KZT',
              paymentId: planned.paymentId,
              subjectType: 'course_enrollment',
              subjectId: planned.enrollmentId,
              walletAccountId: payerAccountId,
              walletBalanceDelta: -planned.paymentProjection.paidAmount,
              paymentEffect: paymentEffectFromProjectionChange(beforePayment, planned.paymentProjection),
              sourceKind: 'wallet',
              payerAccountIdAtEvent: payerAccountId,
              actor: monetaryActorFromEnvelope(envelope),
              commandId: metadata.commandId,
              correlationId: metadata.correlationId,
              paymentEventRevision: AggregateRevisionSchema.parse(1),
              walletEventRevision,
              occurredAt: decidedAt,
              recordedAt: decidedAt,
            };
            session.tx.create(
              { path: monetaryEventPath(eventId) },
              financeToFirestoreWritePayload(monetaryEvent as Record<string, unknown>)
            );
            walletEventRevision = nextAggregateRevision(walletEventRevision);
          }
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
    revisionTarget: {
      ref: { path: courseDocumentPath },
      requireExpectedRevision: envelope.context.expectedRevision !== undefined,
    },
    handler,
  });
}

export function createCourseEnrollmentCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'create_course_enrollments'> {
  return {
    create_course_enrollments: (envelope, environment) =>
      createCourseEnrollmentsHandler(envelope, environment, executor),
  };
}
