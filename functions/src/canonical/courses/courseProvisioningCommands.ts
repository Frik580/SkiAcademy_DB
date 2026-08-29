import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseCatalogContentSchema,
  CourseSchema,
  buildCourseAggregateFromManifest,
  commandSuccessResult,
  computeCourseProvisioningManifestFingerprint,
  deriveSchedulePlanFromManifest,
  resolveCommandIdempotencyIdentity,
  resolveProvisionedAvailableSeats,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Course,
  type CourseProvisioningManifest,
  type CourseProvisioningManifestDay,
} from '@ski-academy/shared-domain';
import type { CanonicalCommands, CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { accountPath, parseAccount } from '../finance/financeStore';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import {
  COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES,
  courseCatalogContentPath,
  toFirestoreWritePayload as catalogContentToFirestoreWritePayload,
} from './courseCatalogContentStore';
import { assertCourseProvisioningAdminAuthorization } from './courseProvisioningAuthorization';
import { buildProvisionCanonicalCourseAuditPlan } from './courseProvisioningAudit';
import {
  COURSE_PLANNING_ESTIMATES,
  coursePath,
  instructorCatalogPath,
  parseCourse,
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

function provisionCanonicalCourseHandler(
  envelope: CommandEnvelope<'provision_canonical_course'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'provision_canonical_course'>> {
  assertCourseProvisioningAdminAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const manifest = envelope.intent.manifest;
  const courseDocumentPath = coursePath(manifest.courseId);
  const catalogContentDocumentPath = courseCatalogContentPath(manifest.courseId);

  let plannedCourse!: Course;
  let shouldWriteCatalogContent = false;
  let courseDocumentExists = false;
  let migratingLegacyCourse = false;
  let catalogContentAlreadyExists = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'provision_canonical_course'> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const existingCourse = parseCourse(courseRead.exists ? courseRead.data : undefined);
      const courseDocumentExistsRead = courseRead.exists;
      courseDocumentExists = courseDocumentExistsRead;
      migratingLegacyCourse = courseDocumentExistsRead && !existingCourse;
      if (existingCourse && existingCourse.courseId !== manifest.courseId) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'courseId', reason: 'conflict' },
        });
      }

      for (const instructorId of manifest.instructorRosterIds) {
        const instructorDocumentPath = instructorCatalogPath(instructorId);
        const instructorRead = await session.tx.get({ path: instructorDocumentPath });
        session.plan.planRead({ path: instructorDocumentPath, category: 'authorization_check' });
        if (!instructorRead.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'instructorRosterIds', reason: 'conflict' },
          });
        }
        if ((instructorRead.data ?? {}).isAvailable === false) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'instructorRosterIds', reason: 'conflict' },
          });
        }
      }

      const decidedAt = timestampFromDate(environment.clock.decidedAt());
      plannedCourse = buildCourseAggregateFromManifest({
        manifest,
        revision: AggregateRevisionSchema.parse(existingCourse?.revision ?? 1),
        decidedAt,
        audit: revisionAuditLink(envelope, metadata),
      });

      if (existingCourse) {
        const plannedFingerprint = computeCourseProvisioningManifestFingerprint(manifest);
        if (
          existingCourse.provisioningManifestFingerprint &&
          existingCourse.provisioningManifestFingerprint !== plannedFingerprint
        ) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'manifest', reason: 'conflict' },
          });
        }

        const sameAggregate =
          existingCourse.title === plannedCourse.title &&
          existingCourse.price === plannedCourse.price &&
          existingCourse.capacity.totalSeats === plannedCourse.capacity.totalSeats &&
          existingCourse.capacity.availableSeats === plannedCourse.capacity.availableSeats &&
          existingCourse.scheduleProjection.courseDayCount ===
            plannedCourse.scheduleProjection.courseDayCount &&
          existingCourse.startAt.seconds === plannedCourse.startAt.seconds;
        if (!sameAggregate) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }
      }

      shouldWriteCatalogContent = Boolean(manifest.presentation);
      if (shouldWriteCatalogContent) {
        const contentRead = await session.tx.get({ path: catalogContentDocumentPath });
        session.plan.planRead({ path: catalogContentDocumentPath, category: 'aggregate' });
        catalogContentAlreadyExists = contentRead.exists;
      }

      session.plan.planMutation({
        path: courseDocumentPath,
        kind: migratingLegacyCourse ? 'delete' : courseDocumentExistsRead ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
      });
      if (migratingLegacyCourse) {
        session.plan.planMutation({
          path: courseDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
        });
      }
      if (shouldWriteCatalogContent && !catalogContentAlreadyExists) {
        session.plan.planMutation({
          path: catalogContentDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES.catalogContentBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildProvisionCanonicalCourseAuditPlan({
        envelope,
        courseId: manifest.courseId,
        courseRevision: plannedCourse.revision,
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const courseRecord = CourseSchema.parse({
        ...plannedCourse,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      });
      const payload = toFirestoreWritePayload(courseRecord as unknown as Record<string, unknown>);

      if (migratingLegacyCourse) {
        session.tx.delete({ path: courseDocumentPath });
        session.tx.create({ path: courseDocumentPath }, payload);
      } else if (courseDocumentExists) {
        session.tx.update({ path: courseDocumentPath }, payload);
      } else {
        session.tx.create({ path: courseDocumentPath }, payload);
      }

      if (shouldWriteCatalogContent && manifest.presentation && !catalogContentAlreadyExists) {
        const catalogContent = CourseCatalogContentSchema.parse({
          courseId: manifest.courseId,
          ...manifest.presentation,
        });
        session.tx.create(
          { path: catalogContentDocumentPath },
          catalogContentToFirestoreWritePayload(
            catalogContent as unknown as Record<string, unknown>
          )
        );
      }

      return commandSuccessResult('provision_canonical_course', envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: courseDocumentPath }, requireExpectedRevision: false },
    handler,
  });
}

function buildCreateCourseDayEnvelope(
  source: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>,
  manifest: CourseProvisioningManifest,
  day: CourseProvisioningManifestDay,
  idempotencyKey: string,
  expectedRevision: number
): CommandEnvelope<'create_course_day'> {
  return {
    kind: 'create_course_day',
    context: {
      actor: source.context.actor,
      exercisedCapability: 'administrator',
      idempotencyKey: idempotencyKey as never,
      correlationId: source.context.correlationId,
      source: 'admin_callable',
      calendarInput: {
        localDate: day.localDate,
        localTime: day.localTime,
        durationMinutes: day.durationMinutes,
      },
      timezone: manifest.timeZone,
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      courseDayId: day.courseDayId,
      courseId: manifest.courseId,
      instructorId: day.instructorId,
    },
  };
}

export async function applyCanonicalCourseProvisioningManifest(
  commands: CanonicalCommands,
  envelope: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>
): Promise<CommandResult<'apply_canonical_course_provisioning_manifest'>> {
  assertCourseProvisioningAdminAuthorization(envelope);
  const manifest = envelope.intent.manifest;
  const schedulePlan = deriveSchedulePlanFromManifest(manifest);
  const availableSeats = resolveProvisionedAvailableSeats({
    totalSeats: manifest.totalSeats,
    capacityPolicy: manifest.capacityPolicy,
  });

  if (envelope.intent.dryRun) {
    return commandSuccessResult(
      'apply_canonical_course_provisioning_manifest',
      envelope.context.correlationId,
      {
        dryRun: true,
        courseId: manifest.courseId,
        plannedCourseDayCount: schedulePlan.courseDayCount,
        availableSeats,
      }
    );
  }

  const provisionResult = await commands.execute({
    kind: 'provision_canonical_course',
    context: envelope.context,
    intent: { manifest },
  });
  if (provisionResult.status !== 'success') {
    return provisionResult as CommandResult<'apply_canonical_course_provisioning_manifest'>;
  }

  const sortedDays = [...manifest.days].sort((left, right) => left.dayOrder - right.dayOrder);
  let expectedCourseRevision = 1;
  for (const day of sortedDays) {
    const dayResult = await commands.execute(
      buildCreateCourseDayEnvelope(
        envelope,
        manifest,
        day,
        `${envelope.context.idempotencyKey}:day:${day.courseDayId as string}`,
        expectedCourseRevision
      )
    );
    if (dayResult.status !== 'success') {
      return dayResult as CommandResult<'apply_canonical_course_provisioning_manifest'>;
    }
    expectedCourseRevision += 1;
  }

  return commandSuccessResult(
    'apply_canonical_course_provisioning_manifest',
    envelope.context.correlationId,
    {
      dryRun: false,
      courseId: manifest.courseId,
      plannedCourseDayCount: schedulePlan.courseDayCount,
      availableSeats,
      scheduleComplete: true,
    }
  );
}

function applyCanonicalCourseProvisioningManifestHandler(
  envelope: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  getCommands: () => CanonicalCommands
): Promise<CommandResult<'apply_canonical_course_provisioning_manifest'>> {
  void environment;
  void executor;
  return applyCanonicalCourseProvisioningManifest(getCommands(), envelope);
}

export function createCourseProvisioningCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  getCommands: () => CanonicalCommands
): Pick<
  CommandHandlerMap,
  'provision_canonical_course' | 'apply_canonical_course_provisioning_manifest'
> {
  return {
    provision_canonical_course: (envelope, environment) =>
      provisionCanonicalCourseHandler(envelope, environment, executor),
    apply_canonical_course_provisioning_manifest: (envelope, environment) =>
      applyCanonicalCourseProvisioningManifestHandler(envelope, environment, executor, getCommands),
  };
}
