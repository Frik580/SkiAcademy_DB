import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseEnrollmentSchema,
  PaymentSchema,
  commandSuccessResult,
  evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  sortedCourseDays,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Course,
  type CourseEnrollment,
  type Participant,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { toFirestoreWritePayload as financeToFirestoreWritePayload } from '../finance/financeStore';
import { FINANCE_PLANNING_ESTIMATES, parsePayment, paymentPath } from '../finance/financeStore';
import {
  assertAccountActive,
  assertAdministrator,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import {
  commitAcquireActiveCourseEnrollmentGuard,
  commitReleaseActiveCourseEnrollmentGuard,
  readAndPlanAcquireActiveCourseEnrollmentGuard,
  readAndPlanReleaseActiveCourseEnrollmentGuard,
} from '../resourceClaims/uniquenessGuards';
import { type InTransactionGuardOverlay } from '../resourceClaims/resourceClaimEngine';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
} from './courseStore';
import {
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
  courseEnrollmentPath,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
} from './courseEnrollmentStore';
import {
  commitPlannedParticipantCourseDayClaimMigration,
  planMigrateEnrollmentParticipantCourseDayClaims,
} from './courseEnrollmentClaimOperations';
import {
  assertDurableGuestCourseEnrollmentAttribution,
  assertLinkGuestCourseEnrollmentAsAdministratorAuthorization,
  assertLinkableGuestCourseEnrollmentLifecycle,
  assertParticipantChangingLinkAllowed,
} from './guestCourseEnrollmentLinkAuthorization';
import { buildLinkGuestCourseEnrollmentAsAdministratorAuditPlan } from './guestCourseEnrollmentLinkAudit';

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

function throwUnavailable(envelope: CommandEnvelope, reason: string): never {
  if (reason === 'not_guest') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }
  if (reason === 'already_linked') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'conflict' },
    });
  }
  if (reason === 'expired_reservation') {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
    });
  }
  throw new CanonicalCommandError('invalid_transition', {
    correlationId: envelope.context.correlationId,
    details: { resourceKind: 'course_enrollment', reason: 'conflict' },
  });
}

function linkGuestCourseEnrollmentToAccountAsAdministratorHandler(
  envelope: CommandEnvelope<'link_guest_course_enrollment_to_account_as_administrator'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'link_guest_course_enrollment_to_account_as_administrator'>> {
  const metadata = metadataFromEnvelope(envelope);
  assertLinkGuestCourseEnrollmentAsAdministratorAuthorization(envelope);
  const actor = requireAccountActor(envelope);
  assertAdministrator(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.enrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let payment!: Payment;
  let guestParticipant!: Participant;
  let targetParticipant!: Participant;
  let plannedEnrollmentRevision = AggregateRevisionSchema.parse(1);
  let plannedPaymentRevision = AggregateRevisionSchema.parse(1);
  let paymentAssociationChanged = false;
  let claimMigration:
    | Awaited<ReturnType<typeof planMigrateEnrollmentParticipantCourseDayClaims>>
    | undefined;
  let plannedTargetGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireActiveCourseEnrollmentGuard>
  >;
  let plannedGuestGuardRelease:
    | Awaited<ReturnType<typeof readAndPlanReleaseActiveCourseEnrollmentGuard>>
    | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'link_guest_course_enrollment_to_account_as_administrator'> =
    {
      read: async (session) => {
        const now = timestampFromDate(environment.clock.now());
        const actorAccountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(
          envelope,
          parseAccount(actorAccountRead.exists ? actorAccountRead.data : undefined)
        );

        const targetAccountRead = await session.tx.get({
          path: accountPath(envelope.intent.targetAccountId),
        });
        session.plan.planRead({
          path: accountPath(envelope.intent.targetAccountId),
          category: 'authorization_check',
        });
        assertAccountActive(
          envelope,
          parseAccount(targetAccountRead.exists ? targetAccountRead.data : undefined)
        );

        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        const parsedEnrollment = parseCourseEnrollment(
          enrollmentRead.exists ? enrollmentRead.data : undefined
        );
        if (!parsedEnrollment) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'conflict' },
          });
        }
        enrollment = parsedEnrollment;
        assertDurableGuestCourseEnrollmentAttribution(envelope, enrollment);
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

        const availability = evaluateAdminGuestCourseEnrollmentIdentityLinkAvailability({
          bookingOrigin: enrollment.attribution.bookingOrigin,
          guestAccountLink: enrollment.guestAccountLink,
          lifecycleStatus: enrollment.lifecycle.status,
          reservationExpiresAt:
            enrollment.lifecycle.status === 'pending'
              ? enrollment.lifecycle.reservationExpiresAt
              : undefined,
          now,
          recordedDayCount: enrollment.attendanceSummary?.recordedDayCount ?? 0,
          courseStartAt: course.startAt,
          administratorAccountActive: true,
        });
        if (!availability.canLink) {
          throwUnavailable(envelope, availability.reason ?? 'ineligible_lifecycle');
        }

        if (envelope.intent.targetParticipantId === enrollment.participantId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'targetParticipantId', reason: 'conflict' },
          });
        }
        assertParticipantChangingLinkAllowed(envelope, enrollment, course, now);

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
        if (guestParticipant.management.kind !== 'unmanaged_guest') {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        const targetParticipantRead = await session.tx.get({
          path: participantPath(envelope.intent.targetParticipantId),
        });
        session.plan.planRead({
          path: participantPath(envelope.intent.targetParticipantId),
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

        const targetManagementRead = await session.tx.get({
          path: participantManagementPath(targetParticipant.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(targetParticipant.management.participantManagementId),
          category: 'aggregate',
        });
        const parsedManagement = parseParticipantManagement(
          targetManagementRead.exists ? targetManagementRead.data : undefined
        );
        if (
          !parsedManagement ||
          parsedManagement.status !== 'active' ||
          parsedManagement.accountId !== envelope.intent.targetAccountId ||
          parsedManagement.participantId !== envelope.intent.targetParticipantId
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

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
        if (
          payment.payerAccountId !== undefined &&
          payment.payerAccountId !== envelope.intent.targetAccountId
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'course_enrollment', reason: 'conflict' },
          });
        }
        paymentAssociationChanged = payment.payerAccountId !== envelope.intent.targetAccountId;

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

        const guardOverlay: InTransactionGuardOverlay = new Map();
        claimMigration = await planMigrateEnrollmentParticipantCourseDayClaims(session, {
          metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
          enrollmentId: enrollment.enrollmentId,
          courseDays,
          guestParticipantId: enrollment.participantId,
          targetParticipantId: envelope.intent.targetParticipantId,
          inTransactionGuardOverlay: guardOverlay,
        });
        plannedTargetGuard = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          participantId: envelope.intent.targetParticipantId,
          courseId: enrollment.courseId,
          courseEnrollmentId: enrollment.enrollmentId,
        });
        plannedGuestGuardRelease = await readAndPlanReleaseActiveCourseEnrollmentGuard(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          participantId: enrollment.participantId,
          courseId: enrollment.courseId,
          courseEnrollmentId: enrollment.enrollmentId,
        });

        plannedEnrollmentRevision = nextAggregateRevision(enrollment.revision);
        plannedPaymentRevision = paymentAssociationChanged
          ? nextAggregateRevision(payment.revision)
          : payment.revision;

        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });
        if (paymentAssociationChanged) {
          session.plan.planMutation({
            path: paymentDocumentPath,
            kind: 'update',
            category: 'payment_wallet',
            estimatedPayloadBytes: FINANCE_PLANNING_ESTIMATES.paymentBytes,
          });
        }
      },
      planAuditOutbox: async () =>
        buildLinkGuestCourseEnrollmentAsAdministratorAuditPlan({
          linkedAccountId: envelope.intent.targetAccountId,
          enrollmentId: enrollment.enrollmentId,
          enrollmentRevision: plannedEnrollmentRevision,
          previousParticipantId: enrollment.participantId,
          participantId: envelope.intent.targetParticipantId,
          participantRevision: targetParticipant.revision,
          paymentId: payment.paymentId,
          paymentRevision: plannedPaymentRevision,
          paymentAssociationChanged,
          reasonExplanation: envelope.intent.reasonExplanation,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        if (claimMigration) {
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
              participantId: envelope.intent.targetParticipantId,
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
          participantId: envelope.intent.targetParticipantId,
          guestAccountLink: {
            linkedAccountId: envelope.intent.targetAccountId,
            linkedParticipantId: envelope.intent.targetParticipantId,
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

        if (paymentAssociationChanged) {
          const updatedPayment = PaymentSchema.parse({
            ...payment,
            payerAccountId: envelope.intent.targetAccountId,
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

export function createAdminGuestCourseEnrollmentLinkCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'link_guest_course_enrollment_to_account_as_administrator'> {
  return {
    link_guest_course_enrollment_to_account_as_administrator: (envelope, environment) =>
      linkGuestCourseEnrollmentToAccountAsAdministratorHandler(
        envelope,
        environment,
        executor
      ),
  };
}
