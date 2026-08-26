import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseEnrollmentSchema,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  commandSuccessResult,
  guestCourseCancellationReasonCode,
  isGuestReservationExpired,
  nextAggregateRevision,
  reservationExpiredCourseCancellationReasonCode,
  resolveCommandIdempotencyIdentity,
  shouldReleasePreStartSeatOnTerminalization,
  sortedCourseDays,
  timestampFromDate,
  type Course,
  type CourseEnrollment,
  type CourseEnrollmentCancellationReasonCode,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type GuestSubjectId,
} from '@ski-academy/shared-domain';
import { verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative } from '../bookings/guestCredentialVerification';
import {
  buildExpireGuestCourseEnrollmentReservationAuditPlan,
  buildGuestCourseEnrollmentCancellationAuditPlan,
} from './courseEnrollmentLifecycleAudit';
import {
  commitPlannedCourseEnrollmentClaimRelease,
  planReleaseCourseEnrollmentClaims,
} from './courseEnrollmentClaimOperations';
import {
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDays,
  toFirestoreWritePayload as courseToFirestoreWritePayload,
  COURSE_PLANNING_ESTIMATES,
} from './courseStore';
import {
  courseEnrollmentPath,
  parseCourseEnrollment,
  toFirestoreWritePayload as enrollmentToFirestoreWritePayload,
  COURSE_ENROLLMENT_PLANNING_ESTIMATES,
} from './courseEnrollmentStore';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';

export interface GuestCourseEnrollmentCommandEnvironment extends CommandExecutionEnvironment {
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

function requireGuestActor(
  envelope: CommandEnvelope
): { readonly guestSubjectId: GuestSubjectId } {
  const actor = envelope.context.actor;
  if (actor.kind !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  return actor;
}

function assertGuestActorMatchesEnrollment(
  envelope: CommandEnvelope,
  enrollment: CourseEnrollment,
  guestSubjectId: GuestSubjectId
): void {
  if (enrollment.attribution.bookedBy.kind !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (enrollment.attribution.bookedBy.guestSubjectId !== guestSubjectId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

function resolvePendingGuestCourseEnrollmentCancellationAuthorization(
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>,
  enrollment: CourseEnrollment,
  guestActionSecret: string | undefined,
  now: ReturnType<typeof timestampFromDate>
): CourseEnrollmentCancellationReasonCode {
  if (
    enrollment.attribution.bookingOrigin !== 'guest' ||
    enrollment.lifecycle.status !== 'pending'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
    });
  }

  if (envelope.context.source !== 'guest_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const guestActor = requireGuestActor(envelope);
  assertGuestActorMatchesEnrollment(envelope, enrollment, guestActor.guestSubjectId);

  const nonce = envelope.context.transportMetadata?.[GUEST_ACTION_NONCE_TRANSPORT_KEY];
  const signature = envelope.context.transportMetadata?.[GUEST_ACTION_SIGNATURE_TRANSPORT_KEY];
  if (!nonce || !signature || !guestActionSecret) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }

  const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
    secret: guestActionSecret,
    nonce,
    signature,
    now,
    expectedEnrollmentId: enrollment.enrollmentId,
    expectedGuestSubjectId: guestActor.guestSubjectId,
    expectedPurpose: 'cancel_pending_reservation',
    expiresAt: enrollment.lifecycle.reservationExpiresAt,
  });
  if (!verification.valid) {
    throw new CanonicalCommandError('unauthorized', {
      correlationId: envelope.context.correlationId,
    });
  }

  return guestCourseCancellationReasonCode();
}

export function requestPendingGuestCourseEnrollmentCancellationHandler(
  envelope: CommandEnvelope<'request_course_enrollment_cancellation'>,
  environment: GuestCourseEnrollmentCommandEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'request_course_enrollment_cancellation'>> {
  const metadata = metadataFromEnvelope(envelope);
  const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let reasonCode!: CourseEnrollmentCancellationReasonCode;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseCourseEnrollmentClaims>> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'request_course_enrollment_cancellation'> =
    {
      read: async (session) => {
        const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
        session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
        const parsed = parseCourseEnrollment(enrollmentRead.exists ? enrollmentRead.data : undefined);
        if (!parsed) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseEnrollmentId', reason: 'conflict' },
          });
        }
        enrollment = parsed;
        const now = timestampFromDate(environment.clock.now());
        reasonCode = resolvePendingGuestCourseEnrollmentCancellationAuthorization(
          envelope,
          enrollment,
          environment.guestActionTokenSecret,
          now
        );

        if (
          reasonCode === 'guest_cancelled' &&
          isGuestReservationExpired({
            now,
            reservationExpiresAt:
              enrollment.lifecycle.status === 'pending'
                ? enrollment.lifecycle.reservationExpiresAt
                : now,
          })
        ) {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
          });
        }

        const coursePathValue = coursePath(enrollment.courseId);
        const courseRead = await session.tx.get({ path: coursePathValue });
        session.plan.planRead({ path: coursePathValue, category: 'aggregate' });
        const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
        if (!parsedCourse) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }
        course = parsedCourse;

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

        const releaseSeat = shouldReleasePreStartSeatOnTerminalization({
          now,
          courseStartAt: course.startAt,
        });
        plannedRevision = nextAggregateRevision(enrollment.revision);
        plannedReleaseClaims = await planReleaseCourseEnrollmentClaims(session, {
          metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
          enrollment,
          course,
          courseDays,
          now,
          releaseSeat,
          releaseFutureDayClaimsOnly: !releaseSeat,
        });
        if (releaseSeat) {
          plannedCourseRevision = nextAggregateRevision(course.revision);
        }
        session.plan.planMutation({
          path: enrollmentDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
        });
        if (releaseSeat) {
          session.plan.planMutation({
            path: coursePathValue,
            kind: 'update',
            category: 'capacity_projection',
            estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
          });
        }
      },
      planAuditOutbox: async () =>
        buildGuestCourseEnrollmentCancellationAuditPlan({
          envelope,
          courseEnrollmentId: envelope.intent.courseEnrollmentId,
          enrollmentRevision: plannedRevision,
          reasonCode,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const updatedEnrollment = CourseEnrollmentSchema.parse({
          ...enrollment,
          lifecycle: {
            status: 'cancelled',
            cancelledAt: decidedAt,
            reasonCode,
          },
          revision: plannedRevision,
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
        if (plannedReleaseClaims) {
          commitPlannedCourseEnrollmentClaimRelease(session, {
            metadata: { ...metadata, decidedAt: context.decidedAt },
            enrollment,
            planned: plannedReleaseClaims,
          });
          if (plannedReleaseClaims.incrementAvailableSeats) {
            const updatedCourse: Course = {
              ...course,
              capacity: {
                ...course.capacity,
                availableSeats: course.capacity.availableSeats + 1,
              },
              revision: plannedCourseRevision,
              updatedAt: decidedAt,
              audit: {
                ...course.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              },
            };
            session.tx.update(
              { path: coursePath(enrollment.courseId) },
              courseToFirestoreWritePayload(updatedCourse as Record<string, unknown>)
            );
          }
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

export function expireGuestCourseEnrollmentReservation(
  envelope: CommandEnvelope<'expire_guest_reservation'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'expire_guest_reservation'>> {
  const metadata = metadataFromEnvelope(envelope);
  const courseEnrollmentId = envelope.intent.courseEnrollmentId!;
  const enrollmentDocumentPath = courseEnrollmentPath(courseEnrollmentId);

  let enrollment!: CourseEnrollment;
  let course!: Course;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedReleaseClaims: Awaited<ReturnType<typeof planReleaseCourseEnrollmentClaims>> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'expire_guest_reservation'> = {
    read: async (session) => {
      const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
      session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
      const parsed = parseCourseEnrollment(enrollmentRead.exists ? enrollmentRead.data : undefined);
      if (!parsed) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseEnrollmentId', reason: 'conflict' },
        });
      }
      enrollment = parsed;
      if (enrollment.attribution.bookingOrigin !== 'guest') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course_enrollment', reason: 'unsupported' },
        });
      }
      if (enrollment.lifecycle.status !== 'pending') {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'course_enrollment', reason: 'conflict' },
        });
      }

      const now = timestampFromDate(environment.clock.now());
      if (
        !isGuestReservationExpired({
          now,
          reservationExpiresAt: enrollment.lifecycle.reservationExpiresAt,
        })
      ) {
        throw new CanonicalCommandError('invalid_transition', {
          correlationId: envelope.context.correlationId,
          details: { field: 'reservationExpiresAt', reason: 'out_of_range' },
        });
      }

      const coursePathValue = coursePath(enrollment.courseId);
      const courseRead = await session.tx.get({ path: coursePathValue });
      session.plan.planRead({ path: coursePathValue, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      course = parsedCourse;

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

      const releaseSeat = shouldReleasePreStartSeatOnTerminalization({
        now,
        courseStartAt: course.startAt,
      });
      plannedRevision = nextAggregateRevision(enrollment.revision);
      plannedReleaseClaims = await planReleaseCourseEnrollmentClaims(session, {
        metadata: { ...metadata, decidedAt: environment.clock.decidedAt() },
        enrollment,
        course,
        courseDays,
        now,
        releaseSeat,
        releaseFutureDayClaimsOnly: !releaseSeat,
      });
      if (releaseSeat) {
        plannedCourseRevision = nextAggregateRevision(course.revision);
      }
      session.plan.planMutation({
        path: enrollmentDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_ENROLLMENT_PLANNING_ESTIMATES.enrollmentBytes,
      });
      if (releaseSeat) {
        session.plan.planMutation({
          path: coursePathValue,
          kind: 'update',
          category: 'capacity_projection',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildExpireGuestCourseEnrollmentReservationAuditPlan({
        courseEnrollmentId,
        enrollmentRevision: plannedRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const updatedEnrollment = CourseEnrollmentSchema.parse({
        ...enrollment,
        lifecycle: {
          status: 'cancelled',
          cancelledAt: decidedAt,
          reasonCode: reservationExpiredCourseCancellationReasonCode(),
        },
        revision: plannedRevision,
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
      if (plannedReleaseClaims) {
        commitPlannedCourseEnrollmentClaimRelease(session, {
          metadata: { ...metadata, decidedAt: context.decidedAt },
          enrollment,
          planned: plannedReleaseClaims,
        });
        if (plannedReleaseClaims.incrementAvailableSeats) {
          const updatedCourse: Course = {
            ...course,
            capacity: {
              ...course.capacity,
              availableSeats: course.capacity.availableSeats + 1,
            },
            revision: plannedCourseRevision,
            updatedAt: decidedAt,
            audit: {
              ...course.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          };
          session.tx.update(
            { path: coursePath(enrollment.courseId) },
            courseToFirestoreWritePayload(updatedCourse as Record<string, unknown>)
          );
        }
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
