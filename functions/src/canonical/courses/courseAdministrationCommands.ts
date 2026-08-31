import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseCatalogContentSchema,
  CourseDaySchema,
  CourseSchema,
  assertExpectedRevision,
  canonicalReference,
  commandSuccessResult,
  compareCanonicalTimestamps,
  isCourseCapacityFrozen,
  isSyntheticCourseInstructorId,
  nextAggregateRevision,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditEffectKind,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandKind,
  type CommandResult,
  type Course,
  type CourseDay,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import { accountPath, parseAccount } from '../finance/financeStore';
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import {
  assertCourseDayAdminAuthorization,
  assertCourseDayScheduleContext,
} from './courseDayAuthorization';
import {
  commitPlannedCourseDayInstructorClaimSwap,
  planReleaseCourseDayInstructorClaim,
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
import {
  COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES,
  courseCatalogContentPath,
  parseCourseCatalogContent,
} from './courseCatalogContentStore';

type CourseAdminKind = Extract<
  CommandKind,
  | 'change_course_title'
  | 'change_course_price'
  | 'change_course_capacity'
  | 'archive_course'
  | 'reactivate_course'
  | 'add_course_roster_instructor'
  | 'remove_course_roster_instructor'
  | 'reschedule_course_day'
  | 'remove_course_day'
  | 'update_course_catalog_content'
>;

function metadataFromEnvelope(envelope: CommandEnvelope) {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

function buildCourseAdminAuditPlan(input: {
  readonly envelope: CommandEnvelope<CourseAdminKind>;
  readonly course: Course;
  readonly courseRevision?: number;
  readonly courseDay?: CourseDay;
  readonly courseDayRevision?: number;
  readonly effectKind?: AuditEffectKind;
  readonly summary: string;
}): AuditOutboxStagingPlan {
  const courseRef = canonicalReference('course', input.course.courseId);
  const dayRef = input.courseDay
    ? canonicalReference('course_day', input.courseDay.courseDayId)
    : undefined;
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: {
        kind: dayRef ? 'course_day' : 'course',
        id: dayRef ? input.courseDay!.courseDayId : input.course.courseId,
        subjectKey: dayRef
          ? `course_day:${input.courseDay!.courseDayId}`
          : `course:${input.course.courseId}`,
      },
      affectedSubjects: dayRef ? [courseRef, dayRef] : [courseRef],
      effects: [
        {
          kind: input.effectKind ?? 'outbox_obligation_created',
          subjectRef: dayRef ?? courseRef,
          summary: input.summary,
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        ...(input.courseRevision === undefined
          ? []
          : [{ subject: courseRef, revision: AggregateRevisionSchema.parse(input.courseRevision) }]),
        ...(dayRef && input.courseDayRevision !== undefined
          ? [
              {
                subject: dayRef,
                revision: AggregateRevisionSchema.parse(input.courseDayRevision),
              },
            ]
          : []),
      ],
    },
    outboxObligations: [],
  };
}

function assertActiveCourse(course: Course, envelope: CommandEnvelope): void {
  if (course.lifecycle !== 'active') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'courseId', reason: 'unsupported' },
    });
  }
}

async function assertAccountExists(
  session: Parameters<NonNullable<AuthoritativeIdempotentCanonicalCommandHandler<CourseAdminKind>['read']>>[0],
  envelope: CommandEnvelope
): Promise<void> {
  const actor = requireAccountActor(envelope);
  const path = accountPath(actor.accountId);
  const read = await session.tx.get({ path });
  session.plan.planRead({ path, category: 'authorization_check' });
  if (!parseAccount(read.exists ? read.data : undefined)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

function operationalCourseUpdate(
  course: Course,
  patch: Partial<Course>,
  envelope: CommandEnvelope,
  decidedAt: ReturnType<typeof timestampFromDate>
): Course {
  const metadata = metadataFromEnvelope(envelope);
  return CourseSchema.parse({
    ...course,
    ...patch,
    provisioningManifestFingerprint: undefined,
    provisioningExpectedCourseDayIds: undefined,
    revision: nextAggregateRevision(course.revision),
    updatedAt: decidedAt,
    audit: {
      ...course.audit,
      lastChangedByCommandId: metadata.commandId,
      correlationId: metadata.correlationId,
    },
  });
}

function writeOperationalCourseUpdate(
  session: Parameters<NonNullable<AuthoritativeIdempotentCanonicalCommandHandler<CourseAdminKind>['execute']>>[0],
  course: Course
): void {
  session.tx.update(
    { path: coursePath(course.courseId) },
    {
      ...toFirestoreWritePayload(course as unknown as Record<string, unknown>),
      provisioningManifestFingerprint: CANONICAL_FIELD_DELETE,
      provisioningExpectedCourseDayIds: CANONICAL_FIELD_DELETE,
    }
  );
}

type SimpleCourseKind = Exclude<
  CourseAdminKind,
  'reschedule_course_day' | 'remove_course_day' | 'update_course_catalog_content'
>;

function simpleCourseCommandHandler<Kind extends SimpleCourseKind>(
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<Kind>> {
  assertCourseDayAdminAuthorization(envelope as CommandEnvelope<CourseAdminKind>);
  const path = coursePath(envelope.intent.courseId);
  let course!: Course;
  let days: CourseDay[] = [];
  let nextRevision = 1;
  let updatePatch: Partial<Course> = {};

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind> = {
    read: async (session) => {
      const read = await session.tx.get({ path });
      session.plan.planRead({ path, category: 'aggregate' });
      const parsed = parseCourse(read.exists ? read.data : undefined);
      if (!parsed) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }
      course = parsed;
      await assertAccountExists(session, envelope);
      nextRevision = nextAggregateRevision(course.revision);

      if (envelope.kind !== 'reactivate_course') assertActiveCourse(course, envelope);
      if (envelope.kind === 'reactivate_course' && course.lifecycle !== 'archived') {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'unsupported' },
        });
      }

      switch (envelope.kind) {
        case 'change_course_title':
          {
            const intent = envelope.intent as CommandEnvelope<'change_course_title'>['intent'];
            if (intent.title === course.title) throwUnsupported(envelope, 'title');
            updatePatch = { title: intent.title };
          }
          break;
        case 'change_course_price':
          {
            const intent = envelope.intent as CommandEnvelope<'change_course_price'>['intent'];
            if (intent.price === course.price) throwUnsupported(envelope, 'price');
            updatePatch = { price: intent.price };
          }
          break;
        case 'change_course_capacity': {
          const intent = envelope.intent as CommandEnvelope<'change_course_capacity'>['intent'];
          if (isCourseCapacityFrozen({ now: timestampFromDate(environment.clock.decidedAt()), courseStartAt: course.startAt })) {
            throwUnsupported(envelope, 'totalSeats');
          }
          const occupied = course.capacity.totalSeats - course.capacity.availableSeats;
          if (intent.totalSeats < occupied) throwConflict(envelope, 'totalSeats');
          if (intent.totalSeats === course.capacity.totalSeats) throwUnsupported(envelope, 'totalSeats');
          updatePatch = {
            capacity: {
              totalSeats: intent.totalSeats,
              availableSeats: intent.totalSeats - occupied,
            },
          };
          break;
        }
        case 'archive_course':
          updatePatch = { lifecycle: 'archived' };
          break;
        case 'reactivate_course':
          updatePatch = { lifecycle: 'active' };
          break;
        case 'add_course_roster_instructor': {
          const intent = envelope.intent as CommandEnvelope<'add_course_roster_instructor'>['intent'];
          const instructorId = intent.instructorId;
          if (isSyntheticCourseInstructorId(instructorId)) throwUnsupported(envelope, 'instructorId');
          if (course.instructorRosterIds.includes(instructorId)) throwUnsupported(envelope, 'instructorId');
          if (course.instructorRosterIds.length >= 16) throwUnsupported(envelope, 'instructorId');
          const instructorPath = instructorCatalogPath(instructorId);
          const instructorRead = await session.tx.get({ path: instructorPath });
          session.plan.planRead({ path: instructorPath, category: 'authorization_check' });
          const instructor = parseInstructorCatalog(
            instructorId,
            instructorRead.exists ? instructorRead.data : undefined
          );
          if (!instructor || instructor.isAvailable === false) throwConflict(envelope, 'instructorId');
          updatePatch = { instructorRosterIds: [...course.instructorRosterIds, instructorId] };
          break;
        }
        case 'remove_course_roster_instructor': {
          const intent = envelope.intent as CommandEnvelope<'remove_course_roster_instructor'>['intent'];
          const instructorId = intent.instructorId;
          if (!course.instructorRosterIds.includes(instructorId)) throwConflict(envelope, 'instructorId');
          if (course.instructorRosterIds.length <= 1) throwUnsupported(envelope, 'instructorId');
          const dayDocuments = await session.tx.query({
            collection: courseDaysCollectionPath(course.courseId),
            where: { field: 'courseId', op: '==', value: course.courseId },
          });
          session.plan.planRead({
            path: `${courseDaysCollectionPath(course.courseId)}/query`,
            category: 'aggregate',
          });
          days = parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} })));
          if (days.some((day) => day.actualInstructorIds.includes(instructorId))) {
            throwConflict(envelope, 'instructorId');
          }
          updatePatch = {
            instructorRosterIds: course.instructorRosterIds.filter((id) => id !== instructorId),
          };
          break;
        }
      }

      session.plan.planMutation({
        path,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCourseAdminAuditPlan({
        envelope: envelope as CommandEnvelope<CourseAdminKind>,
        course,
        courseRevision: nextRevision,
        summary: `Course ${envelope.kind.replaceAll('_', ' ')}`,
      }),
    execute: async (session, context) => {
      const updated = operationalCourseUpdate(
        course,
        updatePatch,
        envelope,
        timestampFromDate(context.decidedAt)
      );
      writeOperationalCourseUpdate(session, updated);
      return commandSuccessResult(envelope.kind, envelope.context.correlationId) as CommandResult<Kind>;
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path }, requireExpectedRevision: true },
    handler,
  });
}

function throwUnsupported(envelope: CommandEnvelope, field: string): never {
  throw new CanonicalCommandError('validation', {
    correlationId: envelope.context.correlationId,
    details: { field, reason: 'unsupported' },
  });
}

function throwConflict(envelope: CommandEnvelope, field: string): never {
  throw new CanonicalCommandError('validation', {
    correlationId: envelope.context.correlationId,
    details: { field, reason: 'conflict' },
  });
}

async function readCourseDependencies(
  session: Parameters<NonNullable<AuthoritativeIdempotentCanonicalCommandHandler<CourseAdminKind>['read']>>[0],
  courseId: Course['courseId']
): Promise<{ days: CourseDay[]; enrollmentCount: number }> {
  const dayDocuments = await session.tx.query({
    collection: courseDaysCollectionPath(courseId),
    where: { field: 'courseId', op: '==', value: courseId },
  });
  session.plan.planRead({ path: `${courseDaysCollectionPath(courseId)}/query`, category: 'aggregate' });
  const enrollmentDocuments = await session.tx.query({
    collection: 'course_enrollments',
    where: { field: 'courseId', op: '==', value: courseId },
  });
  session.plan.planRead({ path: 'course_enrollments/query', category: 'aggregate' });
  return {
    days: parseCourseDays(dayDocuments.map((document) => ({ data: document.data ?? {} }))),
    // A CourseDay with any enrollment history is already an operational record.
    // Blocking on every enrollment (including terminal states) also protects
    // attendance history without relying on lifecycle-state interpretation.
    enrollmentCount: enrollmentDocuments.length,
  };
}

function rescheduleCourseDayHandler(
  envelope: CommandEnvelope<'reschedule_course_day'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'reschedule_course_day'>> {
  assertCourseDayAdminAuthorization(envelope);
  assertCourseDayScheduleContext(envelope);
  const courseDocumentPath = coursePath(envelope.intent.courseId);
  const dayDocumentPath = courseDayPath(envelope.intent.courseId, envelope.intent.courseDayId);
  const metadata = metadataFromEnvelope(envelope);
  let course!: Course;
  let day!: CourseDay;
  let days: CourseDay[] = [];
  let interval!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>['interval'];
  let nextCourseRevision = 1;
  let nextDayRevision = 1;
  let claimSwap!: Awaited<ReturnType<typeof planSwapCourseDayInstructorClaim>>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'reschedule_course_day'> = {
    read: async (session) => {
      const [courseRead, dayRead] = await Promise.all([
        session.tx.get({ path: courseDocumentPath }),
        session.tx.get({ path: dayDocumentPath }),
      ]);
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      session.plan.planRead({ path: dayDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      const parsedDay = parseCourseDay(dayRead.exists ? dayRead.data : undefined);
      if (!parsedCourse || !parsedDay) throwConflict(envelope, 'courseDayId');
      course = parsedCourse;
      day = parsedDay;
      assertActiveCourse(course, envelope);
      await assertAccountExists(session, envelope);
      assertExpectedRevision({
        correlationId: envelope.context.correlationId,
        expectedRevision: envelope.intent.expectedCourseDayRevision,
        currentRevision: day.revision,
        requireExpectedRevision: true,
      });
      if (compareCanonicalTimestamps(timestampFromDate(environment.clock.decidedAt()), day.interval.startsAt) >= 0) {
        throwUnsupported(envelope, 'courseDayId');
      }
      const dependencies = await readCourseDependencies(session, course.courseId);
      days = dependencies.days;
      if (dependencies.enrollmentCount > 0) throwConflict(envelope, 'courseDayId');
      interval = resolveBookingScheduleFromCalendarInput(
        envelope.context.calendarInput!,
        envelope.context.timezone!
      ).interval;
      const ordered = days
        .map((candidate) =>
          candidate.courseDayId === day.courseDayId
            ? { ...candidate, interval }
            : candidate
        )
        .sort((left, right) => left.dayOrder - right.dayOrder);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1]!;
        const current = ordered[index]!;
        if (compareCanonicalTimestamps(previous.interval.endsAt, current.interval.startsAt) > 0) {
          throwConflict(envelope, 'calendarInput');
        }
      }
      nextCourseRevision = nextAggregateRevision(course.revision);
      nextDayRevision = nextAggregateRevision(day.revision);
      claimSwap = await planSwapCourseDayInstructorClaim(session, {
        courseDay: day,
        newInstructorIds: day.actualInstructorIds,
        newOccurrenceRevision: nextDayRevision,
        interval,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });
      session.plan.planMutation({ path: courseDocumentPath, kind: 'update', category: 'aggregate', estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes });
      session.plan.planMutation({ path: dayDocumentPath, kind: 'update', category: 'aggregate', estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes });
    },
    planAuditOutbox: async () =>
      buildCourseAdminAuditPlan({
        envelope,
        course,
        courseRevision: nextCourseRevision,
        courseDay: day,
        courseDayRevision: nextDayRevision,
        effectKind: 'resource_claim_changed',
        summary: 'CourseDay schedule and instructor claim rescheduled',
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      commitPlannedCourseDayInstructorClaimSwap(session, claimSwap, metadata, context.decidedAt);
      const updatedDay = CourseDaySchema.parse({
        ...day,
        interval,
        timeZone: envelope.context.timezone!,
        revision: nextDayRevision,
        updatedAt: decidedAt,
        audit: { ...day.audit, lastChangedByCommandId: metadata.commandId, correlationId: metadata.correlationId },
      });
      const resultingDays = days
        .map((candidate) => candidate.courseDayId === day.courseDayId ? updatedDay : candidate)
        .sort((left, right) => left.dayOrder - right.dayOrder);
      const updatedCourse = operationalCourseUpdate(course, {
        startAt: resultingDays[0]!.interval.startsAt,
        scheduleProjection: {
          courseDayCount: resultingDays.length,
          finalCourseDayEndsAt: resultingDays[resultingDays.length - 1]!.interval.endsAt,
          courseScheduleRevision: nextAggregateRevision(course.scheduleProjection.courseScheduleRevision),
        },
      }, envelope, decidedAt);
      session.tx.update({ path: dayDocumentPath }, toFirestoreWritePayload(updatedDay as unknown as Record<string, unknown>));
      writeOperationalCourseUpdate(session, updatedCourse);
      return commandSuccessResult('reschedule_course_day', envelope.context.correlationId);
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

function removeCourseDayHandler(
  envelope: CommandEnvelope<'remove_course_day'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'remove_course_day'>> {
  assertCourseDayAdminAuthorization(envelope);
  const courseDocumentPath = coursePath(envelope.intent.courseId);
  const dayDocumentPath = courseDayPath(envelope.intent.courseId, envelope.intent.courseDayId);
  const metadata = metadataFromEnvelope(envelope);
  let course!: Course;
  let day!: CourseDay;
  let remainingDays: CourseDay[] = [];
  let nextCourseRevision = 1;
  let releasePlan!: Awaited<ReturnType<typeof planReleaseCourseDayInstructorClaim>>;
  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'remove_course_day'> = {
    read: async (session) => {
      const [courseRead, dayRead] = await Promise.all([
        session.tx.get({ path: courseDocumentPath }),
        session.tx.get({ path: dayDocumentPath }),
      ]);
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      session.plan.planRead({ path: dayDocumentPath, category: 'aggregate' });
      const parsedCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      const parsedDay = parseCourseDay(dayRead.exists ? dayRead.data : undefined);
      if (!parsedCourse || !parsedDay) throwConflict(envelope, 'courseDayId');
      course = parsedCourse;
      day = parsedDay;
      assertActiveCourse(course, envelope);
      await assertAccountExists(session, envelope);
      assertExpectedRevision({
        correlationId: envelope.context.correlationId,
        expectedRevision: envelope.intent.expectedCourseDayRevision,
        currentRevision: day.revision,
        requireExpectedRevision: true,
      });
      if (compareCanonicalTimestamps(timestampFromDate(environment.clock.decidedAt()), day.interval.startsAt) >= 0) {
        throwUnsupported(envelope, 'courseDayId');
      }
      const dependencies = await readCourseDependencies(session, course.courseId);
      if (dependencies.enrollmentCount > 0) throwConflict(envelope, 'courseDayId');
      remainingDays = dependencies.days
        .filter((candidate) => candidate.courseDayId !== day.courseDayId)
        .sort((left, right) => left.dayOrder - right.dayOrder);
      if (remainingDays.length === 0) throwUnsupported(envelope, 'courseDayId');
      nextCourseRevision = nextAggregateRevision(course.revision);
      releasePlan = await planReleaseCourseDayInstructorClaim(session, {
        courseDay: day,
        correlationId: metadata.correlationId,
        commandId: metadata.commandId,
        decidedAt: environment.clock.decidedAt(),
      });
      session.plan.planMutation({ path: dayDocumentPath, kind: 'delete', category: 'aggregate', estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes });
      session.plan.planMutation({ path: courseDocumentPath, kind: 'update', category: 'aggregate', estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes });
    },
    planAuditOutbox: async () =>
      buildCourseAdminAuditPlan({
        envelope,
        course,
        courseRevision: nextCourseRevision,
        courseDay: day,
        effectKind: 'resource_claim_changed',
        summary: 'Future unused CourseDay removed and instructor claim released',
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      for (const plannedRelease of releasePlan) {
        commitResourceClaimPlan(session, plannedRelease, {
          ...metadata,
          decidedAt: context.decidedAt,
        });
      }
      const firstDay = remainingDays[0]!;
      const finalDay = remainingDays[remainingDays.length - 1]!;
      const updatedCourse = operationalCourseUpdate(course, {
        startAt: firstDay.interval.startsAt,
        scheduleProjection: {
          courseDayCount: remainingDays.length,
          finalCourseDayEndsAt: finalDay.interval.endsAt,
          courseScheduleRevision: nextAggregateRevision(course.scheduleProjection.courseScheduleRevision),
        },
      }, envelope, decidedAt);
      session.tx.delete({ path: dayDocumentPath });
      writeOperationalCourseUpdate(session, updatedCourse);
      return commandSuccessResult('remove_course_day', envelope.context.correlationId);
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

function updateCourseCatalogContentHandler(
  envelope: CommandEnvelope<'update_course_catalog_content'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_course_catalog_content'>> {
  assertCourseDayAdminAuthorization(envelope);
  const courseDocumentPath = coursePath(envelope.intent.courseId);
  const contentPath = courseCatalogContentPath(envelope.intent.courseId);
  let course!: Course;
  let currentContent: ReturnType<typeof parseCourseCatalogContent>;
  let nextContentRevision = 1;
  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_course_catalog_content'> = {
    read: async (session) => {
      const [courseRead, contentRead] = await Promise.all([
        session.tx.get({ path: courseDocumentPath }),
        session.tx.get({ path: contentPath }),
      ]);
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      session.plan.planRead({ path: contentPath, category: 'aggregate' });
      const parsed = parseCourse(courseRead.exists ? courseRead.data : undefined);
      if (!parsed) throwConflict(envelope, 'courseId');
      course = parsed;
      await assertAccountExists(session, envelope);
      currentContent = parseCourseCatalogContent(
        contentRead.exists ? contentRead.data : undefined
      );
      const expectedRevision = envelope.context.expectedRevision;
      if (expectedRevision === undefined) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'expectedRevision', reason: 'required' },
        });
      }
      if (currentContent) {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision,
          currentRevision: currentContent.revision,
          requireExpectedRevision: true,
        });
        nextContentRevision = nextAggregateRevision(currentContent.revision);
      } else if (expectedRevision !== 0) {
        throw new CanonicalCommandError('stale_version', {
          correlationId: envelope.context.correlationId,
          currentRevision: AggregateRevisionSchema.parse(0),
        });
      }
      session.plan.planMutation({
        path: contentPath,
        kind: currentContent ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES.catalogContentBytes,
      });
    },
    planAuditOutbox: async () =>
      buildCourseAdminAuditPlan({ envelope, course, summary: 'Course catalog content updated' }),
    execute: async (session) => {
      const content = CourseCatalogContentSchema.parse({
        courseId: envelope.intent.courseId,
        revision: nextContentRevision,
        ...envelope.intent.content,
      });
      const payload = toFirestoreWritePayload(content as unknown as Record<string, unknown>);
      if (currentContent) {
        for (const key of Object.keys(currentContent)) {
          if (key !== 'courseId' && key !== 'revision' && !(key in payload)) {
            payload[key] = CANONICAL_FIELD_DELETE;
          }
        }
        session.tx.update({ path: contentPath }, payload);
      }
      else session.tx.create({ path: contentPath }, payload);
      return commandSuccessResult('update_course_catalog_content', envelope.context.correlationId);
    },
  };
  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createCourseAdministrationCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, CourseAdminKind> {
  return {
    change_course_title: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    change_course_price: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    change_course_capacity: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    archive_course: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    reactivate_course: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    add_course_roster_instructor: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    remove_course_roster_instructor: (envelope, environment) => simpleCourseCommandHandler(envelope, environment, executor),
    reschedule_course_day: (envelope, environment) => rescheduleCourseDayHandler(envelope, environment, executor),
    remove_course_day: (envelope, environment) => removeCourseDayHandler(envelope, environment, executor),
    update_course_catalog_content: (envelope, environment) => updateCourseCatalogContentHandler(envelope, environment, executor),
  };
}
