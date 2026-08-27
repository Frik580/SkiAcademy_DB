import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseEnrollmentSchema,
  PaymentSchema,
  assertExpectedRevision,
  commandSuccessResult,
  emptyAuditOutboxStagingPlan,
  nextAggregateRevision,
  participantManagementIdFromGuestLink,
  resolveCommandIdempotencyIdentity,
  sortedCourseDays,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Course,
  type CourseEnrollment,
  type Participant,
  type ParticipantManagement,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';
import { FINANCE_PLANNING_ESTIMATES, parsePayment, paymentPath } from '../finance/financeStore';
import {
  assertAccountActive,
  assertAuthorizedParticipantManager,
  assertInitialManagementAssignmentEligible,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipant,
  parseParticipantManagement,
  participantManagementActiveOwnerPath,
  participantManagementPath,
  participantPath,
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
} from '../participantAccess/participantAccessStore';
import {
  commitAcquireActiveCourseEnrollmentGuard,
  commitAcquireParticipantManagementActiveOwnerGuard,
  commitReleaseActiveCourseEnrollmentGuard,
  readAndPlanAcquireActiveCourseEnrollmentGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanReleaseActiveCourseEnrollmentGuard,
} from '../resourceClaims/uniquenessGuards';
import {
  type InTransactionGuardOverlay,
} from '../resourceClaims/resourceClaimEngine';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
} from './courseStore';
import {
  courseEnrollmentPath,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
} from './courseEnrollmentStore';
import {
  commitPlannedParticipantCourseDayClaimMigration,
  planMigrateEnrollmentParticipantCourseDayClaims,
} from './courseEnrollmentClaimOperations';
import {
  assertDurableGuestCourseEnrollmentAttribution,
  assertGuestAccountLinkIdempotency,
  assertLinkGuestCourseEnrollmentAuthorization,
  assertLinkableGuestCourseEnrollmentLifecycle,
  assertParticipantChangingLinkAllowed,
  managementAuthorityMatchesCapability,
  verifyGuestCourseEnrollmentLinkCredential,
} from './guestCourseEnrollmentLinkAuthorization';
import { buildLinkGuestCourseEnrollmentAuditPlan } from './guestCourseEnrollmentLinkAudit';
import type { GuestCourseEnrollmentCommandEnvironment } from './guestCourseEnrollmentLifecycle';

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

function resolveManagementAuthority(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>
): 'self' | 'parent_guardian' {
  return envelope.context.exercisedCapability === 'parent_guardian'
    ? 'parent_guardian'
    : 'self';
}

function linkGuestCourseEnrollmentToAccountHandler(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account'>,
  environment: GuestCourseEnrollmentCommandEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'link_guest_course_enrollment_to_account'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertLinkGuestCourseEnrollmentAuthorization(envelope);
  const actor = requireAccountActor(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.enrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let payment!: Payment;
  let guestParticipant!: Participant;
  let targetParticipantId!: Participant['participantId'];
  let targetParticipant!: Participant;
  let existingManagement: ReturnType<typeof parseParticipantManagement>;
  let existingOwnerGuard: ReturnType<typeof parseActiveOwnerGuard>;
  let linkReplayMode: 'first_link' | 'idempotent_replay' = 'first_link';
  let participantChanges = false;
  let managementCreated = false;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedParticipantRevision = AggregateRevisionSchema.parse(1);
  let plannedTargetParticipantRevision = AggregateRevisionSchema.parse(1);
  let plannedManagementRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;
  let plannedTargetGuard!: Awaited<ReturnType<typeof readAndPlanAcquireActiveCourseEnrollmentGuard>>;
  let plannedGuestGuardRelease = false;
  let claimMigration:
    | Awaited<ReturnType<typeof planMigrateEnrollmentParticipantCourseDayClaims>>
    | undefined;
  let participantTargetKind = envelope.intent.participantTarget.kind;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'link_guest_course_enrollment_to_account'> =
    {
      read: async (session) => {
        const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
        const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
        assertAccountActive(envelope, account);

        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        const parsedEnrollment = parseCourseEnrollment(
          enrollmentRead.exists ? enrollmentRead.data : undefined
        );
        if (!parsedEnrollment) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'enrollmentId', reason: 'conflict' },
          });
        }
        enrollment = parsedEnrollment;
        const now = timestampFromDate(environment.clock.now());
        const guestSubjectId = assertDurableGuestCourseEnrollmentAttribution(envelope, enrollment);
        assertLinkableGuestCourseEnrollmentLifecycle(envelope, enrollment, now);

        const courseRead = await session.tx.get({ path: coursePath(enrollment.courseId) });
        session.plan.planRead({ path: coursePath(enrollment.courseId), category: 'aggregate' });
        const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
        if (!parsedCourse) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }
        course = parsedCourse;

        verifyGuestCourseEnrollmentLinkCredential(envelope, {
          guestSubjectId,
          guestActionSecret: environment.guestActionTokenSecret,
          now,
          expiresAt: course.scheduleProjection.finalCourseDayEndsAt,
        });

        const guestParticipantRead = await session.tx.get({
          path: participantPath(enrollment.participantId),
        });
        session.plan.planRead({
          path: participantPath(enrollment.participantId),
          category: 'aggregate',
        });
        guestParticipant = assertParticipantActive(
          envelope,
          parseParticipant(guestParticipantRead.exists ? guestParticipantRead.data : undefined)
        );

        const paymentDocumentPath = paymentPath(enrollment.paymentId);
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

        const target = envelope.intent.participantTarget;
        participantTargetKind = target.kind;

        if (target.kind === 'promote_guest') {
          targetParticipantId = enrollment.participantId;
          targetParticipant = guestParticipant;
        } else if (target.kind === 'existing_managed') {
          if (target.participantId === enrollment.participantId) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'participantTarget.participantId', reason: 'conflict' },
            });
          }
          targetParticipantId = target.participantId;
          participantChanges = true;
          assertParticipantChangingLinkAllowed(envelope, enrollment, course, now);

          const targetParticipantRead = await session.tx.get({
            path: participantPath(targetParticipantId),
          });
          session.plan.planRead({
            path: participantPath(targetParticipantId),
            category: 'aggregate',
          });
          targetParticipant = assertParticipantActive(
            envelope,
            parseParticipant(
              targetParticipantRead.exists ? targetParticipantRead.data : undefined
            )
          );
          if (targetParticipant.management.kind !== 'managed') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }

          const targetManagementId = targetParticipant.management.participantManagementId;
          const targetManagementRead = await session.tx.get({
            path: participantManagementPath(targetManagementId),
          });
          session.plan.planRead({
            path: participantManagementPath(targetManagementId),
            category: 'aggregate',
          });
          const targetManagement = parseParticipantManagement(
            targetManagementRead.exists ? targetManagementRead.data : undefined
          );
          if (!targetManagement || targetManagement.status !== 'active') {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }
          managementAuthorityMatchesCapability(envelope, targetManagement.authority);
          assertAuthorizedParticipantManager(
            envelope,
            { account: account!, participant: targetParticipant, management: targetManagement },
            targetParticipantId
          );
          if (envelope.context.expectedParticipantManagementRevision !== undefined) {
            assertExpectedRevision({
              correlationId: envelope.context.correlationId,
              currentRevision: targetManagement.revision,
              expectedRevision: envelope.context.expectedParticipantManagementRevision,
            });
          }
          existingManagement = targetManagement;
          plannedManagementRevision = targetManagement.revision;
        } else {
          if (target.participantId === enrollment.participantId) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'participantTarget.participantId', reason: 'conflict' },
            });
          }
          targetParticipantId = target.participantId;
          participantChanges = true;
          managementCreated = true;
          assertParticipantChangingLinkAllowed(envelope, enrollment, course, now);

          const targetParticipantRead = await session.tx.get({
            path: participantPath(targetParticipantId),
          });
          session.plan.planRead({
            path: participantPath(targetParticipantId),
            category: 'aggregate',
          });
          if (targetParticipantRead.exists) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }
          targetParticipant = {
            participantId: targetParticipantId,
            displayName: target.displayName,
            age: target.age,
            skillLevel: target.skillLevel,
            discipline: target.discipline,
            ...(target.instructorComment === undefined
              ? {}
              : { instructorComment: target.instructorComment }),
            management: { kind: 'managed', participantManagementId: '' as ParticipantManagement['participantManagementId'] },
            lifecycle: { status: 'active' },
            revision: AggregateRevisionSchema.parse(1),
            createdAt: now,
            updatedAt: now,
            audit: revisionAuditLink(envelope, metadata),
          };
          existingManagement = undefined;
        }

        linkReplayMode = assertGuestAccountLinkIdempotency(
          envelope,
          enrollment,
          actor.accountId,
          targetParticipantId
        );

        if (
          linkReplayMode === 'first_link' &&
          payment.payerAccountId !== undefined &&
          payment.payerAccountId !== actor.accountId
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'conflict' },
          });
        }

        if (linkReplayMode === 'idempotent_replay') {
          return;
        }

        if (guestParticipant.management.kind !== 'unmanaged_guest') {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        const resolvedManagementId = participantManagementIdFromGuestLink({
          participantId: targetParticipantId,
          accountId: actor.accountId,
        });

        if (target.kind === 'promote_guest' || target.kind === 'create_managed') {
          if (target.kind === 'promote_guest' && guestParticipant.initialManagementEligibleAccountId !== undefined) {
            assertInitialManagementAssignmentEligible(envelope, guestParticipant, actor.accountId);
          }
          const managementDocumentPath = participantManagementPath(resolvedManagementId);
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
          if (target.kind === 'create_managed') {
            targetParticipant = {
              ...targetParticipant,
              management: {
                kind: 'managed',
                participantManagementId: resolvedManagementId,
              },
            };
          }
          plannedManagementRevision = existingManagement
            ? nextAggregateRevision(existingManagement.revision)
            : AggregateRevisionSchema.parse(1);
          managementCreated = !existingManagement;

          const guardDocumentPath = participantManagementActiveOwnerPath(targetParticipantId);
          const guardRead = await session.tx.get({ path: guardDocumentPath });
          session.plan.planRead({ path: guardDocumentPath, category: 'authorization_check' });
          existingOwnerGuard = parseActiveOwnerGuard(guardRead.exists ? guardRead.data : undefined);
          if (existingOwnerGuard && existingOwnerGuard.accountId !== actor.accountId) {
            throw new CanonicalCommandError('blocked_relationship', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'participant', reason: 'conflict' },
            });
          }

          plannedParticipantRevision =
            target.kind === 'promote_guest'
              ? nextAggregateRevision(guestParticipant.revision)
              : AggregateRevisionSchema.parse(1);
          plannedTargetParticipantRevision = plannedParticipantRevision;

          plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: environment.clock.decidedAt(),
            participantId: targetParticipantId,
            accountId: actor.accountId,
            participantManagementId: resolvedManagementId,
            managementRevision: plannedManagementRevision,
          });

          session.plan.planMutation({
            path: participantManagementPath(resolvedManagementId),
            kind: existingManagement ? 'update' : 'create',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
          });
          session.plan.planMutation({
            path: participantPath(targetParticipantId),
            kind: target.kind === 'create_managed' ? 'create' : 'update',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
          });
        } else {
          plannedTargetParticipantRevision = nextAggregateRevision(targetParticipant.revision);
        }

        const dayDocuments = await session.tx.query({
          collection: courseDaysCollectionPath(enrollment.courseId),
          where: { field: 'courseId', op: '==', value: enrollment.courseId },
        });
        session.plan.planRead({
          path: `${courseDaysCollectionPath(enrollment.courseId)}/query`,
          category: 'aggregate',
        });
        const courseDays = sortedCourseDays(
          parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} })))
        );

        if (participantChanges) {
          const guardOverlay: InTransactionGuardOverlay = new Map();
          claimMigration = await planMigrateEnrollmentParticipantCourseDayClaims(session, {
            metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
            enrollmentId: enrollment.enrollmentId,
            courseDays,
            guestParticipantId: enrollment.participantId,
            targetParticipantId,
            inTransactionGuardOverlay: guardOverlay,
          });

          plannedTargetGuard = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: environment.clock.decidedAt(),
            participantId: targetParticipantId,
            courseId: enrollment.courseId,
            courseEnrollmentId: enrollment.enrollmentId,
          });
          const guestGuardRelease = await readAndPlanReleaseActiveCourseEnrollmentGuard(session, {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: environment.clock.decidedAt(),
            participantId: enrollment.participantId,
            courseId: enrollment.courseId,
            courseEnrollmentId: enrollment.enrollmentId,
          });
          plannedGuestGuardRelease = guestGuardRelease;
        }

        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        if (linkReplayMode === 'first_link' && payment.payerAccountId !== actor.accountId) {
          plannedPaymentRevision = nextAggregateRevision(payment.revision);
        } else {
          plannedPaymentRevision = payment.revision;
        }

        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });
        if (linkReplayMode === 'first_link' && payment.payerAccountId !== actor.accountId) {
          session.plan.planMutation({
            path: paymentDocumentPath,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
          });
        }
      },
      planAuditOutbox: async () => {
        if (linkReplayMode === 'idempotent_replay') {
          return emptyAuditOutboxStagingPlan('participant_management');
        }
        return buildLinkGuestCourseEnrollmentAuditPlan({
          linkedAccountId: actor.accountId,
          enrollmentId: enrollment.enrollmentId,
          enrollmentRevision: plannedEnrollmentRevision,
          participantId: targetParticipantId,
          participantRevision:
            participantTargetKind === 'existing_managed'
              ? plannedTargetParticipantRevision
              : plannedParticipantRevision,
          managementRevision: plannedManagementRevision,
          paymentId: enrollment.paymentId,
          paymentRevision: plannedPaymentRevision,
          participantChanged: participantChanges,
          managementCreated,
        });
      },
      execute: async (session, context) => {
        if (linkReplayMode === 'idempotent_replay') {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }

        const decidedAt = timestampFromDate(context.decidedAt);
        const audit = revisionAuditLink(envelope, metadata);
        const resolvedManagementId = participantManagementIdFromGuestLink({
          participantId: targetParticipantId,
          accountId: actor.accountId,
        });
        const target = envelope.intent.participantTarget;
        const managementAuthority = resolveManagementAuthority(envelope);

        if (target.kind === 'promote_guest' || target.kind === 'create_managed') {
          const management: ParticipantManagement = existingManagement
            ? {
                ...existingManagement,
                accountId: actor.accountId,
                participantId: targetParticipantId,
                role: 'owner',
                authority: managementAuthority,
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
                participantManagementId: resolvedManagementId,
                accountId: actor.accountId,
                participantId: targetParticipantId,
                role: 'owner',
                authority: managementAuthority,
                status: 'active',
                revision: plannedManagementRevision,
                createdAt: decidedAt,
                updatedAt: decidedAt,
                audit,
              };

          const updatedParticipant: Participant =
            target.kind === 'create_managed'
              ? {
                  participantId: targetParticipantId,
                  displayName: target.displayName,
                  age: target.age,
                  skillLevel: target.skillLevel,
                  discipline: target.discipline,
                  ...(target.instructorComment === undefined
                    ? {}
                    : { instructorComment: target.instructorComment }),
                  management: {
                    kind: 'managed',
                    participantManagementId: resolvedManagementId,
                  },
                  lifecycle: { status: 'active' },
                  revision: plannedParticipantRevision,
                  createdAt: decidedAt,
                  updatedAt: decidedAt,
                  audit,
                }
              : {
                  ...guestParticipant,
                  management: {
                    kind: 'managed',
                    participantManagementId: resolvedManagementId,
                  },
                  initialManagementEligibleAccountId:
                    CANONICAL_FIELD_DELETE as unknown as Participant['initialManagementEligibleAccountId'],
                  revision: plannedParticipantRevision,
                  updatedAt: decidedAt,
                  audit: {
                    ...guestParticipant.audit,
                    lastChangedByCommandId: metadata.commandId,
                    correlationId: metadata.correlationId,
                  },
                };

          if (existingManagement) {
            session.tx.update(
              { path: participantManagementPath(resolvedManagementId) },
              management as Record<string, unknown>
            );
          } else {
            session.tx.create(
              { path: participantManagementPath(resolvedManagementId) },
              management as Record<string, unknown>
            );
          }
          if (target.kind === 'create_managed') {
            session.tx.create(
              { path: participantPath(targetParticipantId) },
              updatedParticipant as Record<string, unknown>
            );
          } else {
            session.tx.update(
              { path: participantPath(targetParticipantId) },
              updatedParticipant as Record<string, unknown>
            );
          }

          commitAcquireParticipantManagementActiveOwnerGuard(
            session,
            {
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
              decidedAt: context.decidedAt,
              participantId: targetParticipantId,
              accountId: actor.accountId,
              participantManagementId: resolvedManagementId,
              managementRevision: plannedManagementRevision,
            },
            plannedOwnerGuard.guard,
            plannedOwnerGuard.hadExisting
          );
        }

        if (participantChanges && claimMigration) {
          commitPlannedParticipantCourseDayClaimMigration(session, {
            metadata: { ...metadata, decidedAt: context.decidedAt },
            acquirePlans: claimMigration.acquirePlans,
            releasePlans: claimMigration.releasePlans,
          });
          commitAcquireActiveCourseEnrollmentGuard(
            session,
            {
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
              decidedAt: context.decidedAt,
              participantId: targetParticipantId,
              courseId: enrollment.courseId,
              courseEnrollmentId: enrollment.enrollmentId,
            },
            plannedTargetGuard.guard,
            plannedTargetGuard.hadExisting
          );
          if (plannedGuestGuardRelease) {
            commitReleaseActiveCourseEnrollmentGuard(session, {
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
              decidedAt: context.decidedAt,
              participantId: enrollment.participantId,
              courseId: enrollment.courseId,
              courseEnrollmentId: enrollment.enrollmentId,
            });
          }
        }

        const updatedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          participantId: targetParticipantId,
          guestAccountLink: {
            linkedAccountId: actor.accountId,
            linkedParticipantId: targetParticipantId,
            credentialNonce: envelope.intent.guestLinkCredential.nonce,
            linkedAt: decidedAt,
          },
          revision: plannedEnrollmentRevision,
          updatedAt: decidedAt,
          audit: {
            ...enrollment.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        session.tx.update(
          { path: enrollmentDocumentPath },
          enrollmentToFirestoreWritePayload(updatedEnrollment as Record<string, unknown>)
        );

        if (payment.payerAccountId !== actor.accountId) {
          const updatedPayment = PaymentSchema.parse({
            ...payment,
            payerAccountId: actor.accountId,
            revision: plannedPaymentRevision,
            updatedAt: decidedAt,
          });
          session.tx.update(
            { path: paymentPath(enrollment.paymentId) },
            financeToFirestoreWritePayload(updatedPayment as Record<string, unknown>)
          );
        }

        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: enrollmentDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

export function createGuestCourseEnrollmentLinkCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  guestActionTokenSecret?: string
): Pick<CommandHandlerMap, 'link_guest_course_enrollment_to_account'> {
  const environmentBase = (
    environment: CommandExecutionEnvironment
  ): GuestCourseEnrollmentCommandEnvironment => ({
    ...environment,
    guestActionTokenSecret,
  });

  return {
    link_guest_course_enrollment_to_account: (envelope, environment) =>
      linkGuestCourseEnrollmentToAccountHandler(envelope, environmentBase(environment), executor),
  };
}
