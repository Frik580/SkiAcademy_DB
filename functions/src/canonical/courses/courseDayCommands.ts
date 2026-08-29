import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseDaySchema,
  commandSuccessResult,
  assertCourseDayCountWithinLimit,
  assertInstructorOnCourseRoster,
  assertStrictlyIncreasingCourseDayStarts,
  courseDayIntervalHasStarted,
  deriveCourseScheduleProjectionAfterDayAdded,
  deriveCourseStartAtAfterFirstDay,
  isSyntheticCourseInstructorId,
  nextAggregateRevision,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  resolveNextCourseDayOrder,
  timestampFromDate,
  type Course,
  type CourseDay,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorId,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import { accountPath, parseAccount } from '../finance/financeStore';
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import {
  assertCourseDayAdminAuthorization,
  assertCourseDayReassignReason,
  assertCourseDayScheduleContext,
} from './courseDayAuthorization';
import {
  buildCreateCourseDayAuditPlan,
  buildReassignCourseDayInstructorAuditPlan,
} from './courseDayAudit';
import {
  commitPlannedCourseDayInstructorClaimSwap,
  planAcquireCourseDayInstructorClaim,
  planSwapCourseDayInstructorClaim,
} from './courseDayClaimOperations';
import {
  COURSE_PLANNING_ESTIMATES,
  courseDayPath,
  courseDaysCollectionPath,
  coursePath,
  instructorCatalogPath,
  parseCourse,
  parseCourseDay,
  parseCourseDays,
  parseInstructorCatalog,
  toFirestoreWritePayload,
} from './courseStore';

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

function createCourseDayHandler(
  envelope: CommandEnvelope<'create_course_day'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_course_day'>> {
  assertCourseDayAdminAuthorization(envelope);
  assertCourseDayScheduleContext(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const courseDocumentPath = coursePath(envelope.intent.courseId);
  const courseDayDocumentPath = courseDayPath(
    envelope.intent.courseId,
    envelope.intent.courseDayId
  );

  let course!: Course;
  let existingDays: CourseDay[] = [];
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;
  let dayOrder = 1;
  let plannedCourseRevision = AggregateRevisionSchema.parse(1);
  let plannedCourseDayRevision = AggregateRevisionSchema.parse(1);
  let instructorClaimPlan!: Awaited<ReturnType<typeof planAcquireCourseDayInstructorClaim>>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_course_day'> = {
    read: async (session) => {
      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      course = parsedCourse;

      const courseDayRead = await session.tx.get({ path: courseDayDocumentPath });
      session.plan.planRead({ path: courseDayDocumentPath, category: 'aggregate' });
      if (courseDayRead.exists) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseDayId', reason: 'conflict' },
        });
      }

      const actor = requireAccountActor(envelope);
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const existingDayDocuments = await session.tx.query({
        collection: courseDaysCollectionPath(envelope.intent.courseId),
        where: { field: 'courseId', op: '==', value: envelope.intent.courseId },
      });
      session.plan.planRead({
        path: `${courseDaysCollectionPath(envelope.intent.courseId)}/query`,
        category: 'aggregate',
      });
      existingDays = parseCourseDays(
        existingDayDocuments.map((document) => ({ data: document.data ?? {} }))
      );

      try {
        assertCourseDayCountWithinLimit(existingDays.length);
      } catch {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseDayId', reason: 'unsupported' },
        });
      }

      if (isSyntheticCourseInstructorId(envelope.intent.instructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'unsupported' },
        });
      }
      if (!assertInstructorOnCourseRoster(course, envelope.intent.instructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }

      const instructorDocumentPath = instructorCatalogPath(envelope.intent.instructorId);
      const instructorRead = await session.tx.get({ path: instructorDocumentPath });
      session.plan.planRead({ path: instructorDocumentPath, category: 'authorization_check' });
      const instructorRecord = parseInstructorCatalog(
        envelope.intent.instructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!instructorRecord || instructorRecord.isAvailable === false) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }

      schedule = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      );

      try {
        assertStrictlyIncreasingCourseDayStarts(existingDays, schedule.interval);
      } catch {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'calendarInput', reason: 'conflict' },
        });
      }

      dayOrder = resolveNextCourseDayOrder(existingDays);
      plannedCourseRevision = nextAggregateRevision(course.revision);
      plannedCourseDayRevision = AggregateRevisionSchema.parse(1);

      instructorClaimPlan = await planAcquireCourseDayInstructorClaim(session, {
        courseDayId: envelope.intent.courseDayId,
        instructorId: envelope.intent.instructorId,
        occurrenceRevision: plannedCourseDayRevision,
        interval: schedule.interval,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });

      session.plan.planMutation({
        path: courseDayDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes,
      });
      session.plan.planMutation({
        path: courseDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCreateCourseDayAuditPlan({
        envelope,
        courseId: envelope.intent.courseId,
        courseDayId: envelope.intent.courseDayId,
        courseRevision: plannedCourseRevision,
        courseDayRevision: plannedCourseDayRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const scheduleProjection = deriveCourseScheduleProjectionAfterDayAdded(
        course,
        schedule.interval
      );
      const courseDay = CourseDaySchema.parse({
        courseId: envelope.intent.courseId,
        courseDayId: envelope.intent.courseDayId,
        dayOrder,
        interval: schedule.interval,
        timeZone: envelope.context.timezone!,
        actualInstructorIds: [envelope.intent.instructorId],
        revision: plannedCourseDayRevision,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: revisionAuditLink(envelope, metadata),
      });

      commitResourceClaimPlan(session, instructorClaimPlan, {
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: context.decidedAt,
      });

      session.tx.create(
        { path: courseDayDocumentPath },
        toFirestoreWritePayload(courseDay as unknown as Record<string, unknown>)
      );

      session.tx.update(
        { path: courseDocumentPath },
        toFirestoreWritePayload({
          startAt: deriveCourseStartAtAfterFirstDay(course, schedule.interval, existingDays.length),
          scheduleProjection,
          revision: plannedCourseRevision,
          updatedAt: decidedAt,
          audit: {
            ...course.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        })
      );

      return commandSuccessResult('create_course_day', envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: courseDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function reassignCourseDayInstructorHandler(
  envelope: CommandEnvelope<'reassign_course_day_instructor'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'reassign_course_day_instructor'>> {
  assertCourseDayAdminAuthorization(envelope);
  assertCourseDayReassignReason(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const courseDayDocumentPath = courseDayPath(envelope.intent.courseId, envelope.intent.courseDayId);

  let courseDay!: CourseDay;
  let course!: Course;
  let targetInstructorId!: InstructorId;
  let plannedCourseDayRevision = AggregateRevisionSchema.parse(1);
  let claimSwapPlan!: Awaited<ReturnType<typeof planSwapCourseDayInstructorClaim>>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'reassign_course_day_instructor'> = {
    read: async (session) => {
      const courseDayRead = await session.tx.get({ path: courseDayDocumentPath });
      session.plan.planRead({ path: courseDayDocumentPath, category: 'aggregate' });
      const parsedCourseDay = parseCourseDay(courseDayRead.exists ? courseDayRead.data : undefined);
      if (!parsedCourseDay) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseDayId', reason: 'conflict' },
        });
      }
      courseDay = parsedCourseDay;
      if (courseDay.courseId !== envelope.intent.courseId) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }

      const decidedAt = timestampFromDate(environment.clock.decidedAt());
      if (courseDayIntervalHasStarted(courseDay.interval, decidedAt)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseDayId', reason: 'unsupported' },
        });
      }

      const courseDocumentPath = coursePath(envelope.intent.courseId);
      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsedCourse) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      course = parsedCourse;

      targetInstructorId = envelope.intent.instructorId;
      if (isSyntheticCourseInstructorId(targetInstructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'unsupported' },
        });
      }
      if (!assertInstructorOnCourseRoster(course, targetInstructorId)) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }
      const currentInstructorId = courseDay.actualInstructorIds[0]!;
      if (targetInstructorId === currentInstructorId) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'unsupported' },
        });
      }

      const instructorDocumentPath = instructorCatalogPath(targetInstructorId);
      const instructorRead = await session.tx.get({ path: instructorDocumentPath });
      session.plan.planRead({ path: instructorDocumentPath, category: 'authorization_check' });
      const instructorRecord = parseInstructorCatalog(
        targetInstructorId,
        instructorRead.exists ? instructorRead.data : undefined
      );
      if (!instructorRecord || instructorRecord.isAvailable === false) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'instructorId', reason: 'conflict' },
        });
      }

      const actor = requireAccountActor(envelope);
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      plannedCourseDayRevision = nextAggregateRevision(courseDay.revision);
      claimSwapPlan = await planSwapCourseDayInstructorClaim(session, {
        courseDay,
        newInstructorId: targetInstructorId,
        newOccurrenceRevision: plannedCourseDayRevision,
        interval: courseDay.interval,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });

      session.plan.planMutation({
        path: courseDayDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes,
      });
    },
    planAuditOutbox: async () =>
      buildReassignCourseDayInstructorAuditPlan({
        envelope,
        courseId: envelope.intent.courseId,
        courseDayId: envelope.intent.courseDayId,
        courseDayRevision: plannedCourseDayRevision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      commitPlannedCourseDayInstructorClaimSwap(
        session,
        claimSwapPlan,
        {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        },
        context.decidedAt
      );

      const updatedCourseDay = CourseDaySchema.parse({
        ...courseDay,
        actualInstructorIds: [targetInstructorId],
        revision: plannedCourseDayRevision,
        updatedAt: decidedAt,
        audit: {
          ...courseDay.audit,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });

      session.tx.update(
        { path: courseDayDocumentPath },
        toFirestoreWritePayload(updatedCourseDay as unknown as Record<string, unknown>)
      );

      return commandSuccessResult(
        'reassign_course_day_instructor',
        envelope.context.correlationId
      );
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: courseDayDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

export function createCourseDayCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'create_course_day' | 'reassign_course_day_instructor'> {
  return {
    create_course_day: (envelope, environment) =>
      createCourseDayHandler(envelope, environment, executor),
    reassign_course_day_instructor: (envelope, environment) =>
      reassignCourseDayInstructorHandler(envelope, environment, executor),
  };
}
