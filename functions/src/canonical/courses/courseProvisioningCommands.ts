import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CourseCatalogContentSchema,
  CourseDaySchema,
  CourseSchema,
  buildCourseAggregateFromManifest,
  buildCourseAggregateFromShapeRepair,
  commandSuccessResult,
  computeCourseProvisioningManifestFingerprint,
  deriveSchedulePlanFromManifest,
  parseCanonicalCourseOperationalStateFromDocument,
  readPersistedCourseAuditCreatedByCommandId,
  readPersistedCourseCreatedAt,
  readPersistedCourseProvisioningFingerprint,
  readPersistedCourseRevision,
  resolveCommandIdempotencyIdentity,
  resolveProvisionedAvailableSeats,
  resolveManifestDayInterval,
  courseDocumentRequiresShapeReplacement,
  validatePersistedCourseOperationalStateAgainstManifest,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Course,
  type CourseDay,
  type CourseProvisioningManifest,
  type CourseProvisioningManifestDay,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
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
import { buildApplyCanonicalCourseProvisioningManifestAuditPlan } from './courseProvisioningAudit';
import {
  commitResourceClaimPlan,
  registerResourceClaimPlanInGuardOverlay,
  type InTransactionGuardOverlay,
} from '../resourceClaims/resourceClaimEngine';
import { planAcquireCourseDayInstructorClaim } from './courseDayClaimOperations';
import {
  COURSE_PLANNING_ESTIMATES,
  courseDayPath,
  coursePath,
  instructorCatalogPath,
  parseCourse,
  parseCourseDay,
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

function existingCourseDayMatchesManifestDay(
  courseDay: CourseDay,
  manifest: CourseProvisioningManifest,
  day: CourseProvisioningManifestDay
): boolean {
  const interval = resolveManifestDayInterval(day, manifest.timeZone).interval;
  return (
    courseDay.courseId === manifest.courseId &&
    courseDay.courseDayId === day.courseDayId &&
    courseDay.dayOrder === day.dayOrder &&
    courseDay.timeZone === manifest.timeZone &&
    courseDay.actualInstructorIds.length === 1 &&
    courseDay.actualInstructorIds[0] === day.instructorId &&
    courseDay.interval.startsAt.seconds === interval.startsAt.seconds &&
    courseDay.interval.startsAt.nanoseconds === interval.startsAt.nanoseconds &&
    courseDay.interval.endsAt.seconds === interval.endsAt.seconds &&
    courseDay.interval.endsAt.nanoseconds === interval.endsAt.nanoseconds
  );
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
  let existingCourse: Course | undefined;
  let shouldWriteCatalogContent = false;
  let courseDocumentExists = false;
  let requiresShapeReplacement = false;
  let catalogContentAlreadyExists = false;
  let persistedCreatedAt: ReturnType<typeof readPersistedCourseCreatedAt>;
  let persistedAuditCreatedByCommandId: string | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'provision_canonical_course'> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({
        path: accountPath(actor.accountId),
        category: 'authorization_check',
      });
      const account = parseAccount(accountRead.exists ? accountRead.data : undefined);
      if (!account) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const courseRead = await session.tx.get({ path: courseDocumentPath });
      session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
      const rawCourseData = courseRead.exists
        ? (courseRead.data as Record<string, unknown>)
        : undefined;
      const existingCourseRead = parseCourse(rawCourseData);
      existingCourse = existingCourseRead;
      const courseDocumentExistsRead = courseRead.exists;
      courseDocumentExists = courseDocumentExistsRead;
      requiresShapeReplacement =
        courseDocumentExistsRead && courseDocumentRequiresShapeReplacement(rawCourseData);
      persistedCreatedAt = existingCourse?.createdAt ?? readPersistedCourseCreatedAt(rawCourseData);
      persistedAuditCreatedByCommandId =
        existingCourse?.audit.createdByCommandId ??
        readPersistedCourseAuditCreatedByCommandId(rawCourseData);
      const persistedRevision = AggregateRevisionSchema.parse(
        Math.max(1, existingCourse?.revision ?? readPersistedCourseRevision(rawCourseData) ?? 1)
      );
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
      const plannedFingerprint = computeCourseProvisioningManifestFingerprint(manifest);
      const persistedOperational = courseDocumentExistsRead
        ? parseCanonicalCourseOperationalStateFromDocument(rawCourseData)
        : undefined;
      if (!existingCourse && courseDocumentExistsRead) {
        const rawFingerprint = readPersistedCourseProvisioningFingerprint(rawCourseData);
        if (rawFingerprint && rawFingerprint !== plannedFingerprint) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'manifest', reason: 'conflict' },
          });
        }
      }

      if (requiresShapeReplacement && persistedOperational) {
        const operationalCompatibilityIssues =
          validatePersistedCourseOperationalStateAgainstManifest(persistedOperational, manifest);
        if (operationalCompatibilityIssues.length > 0) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: {
              field: operationalCompatibilityIssues[0].field,
              reason: 'conflict',
            },
          });
        }
        plannedCourse = buildCourseAggregateFromShapeRepair({
          persistedOperational,
          manifest,
          revision: persistedRevision,
          audit: revisionAuditLink(envelope, metadata),
        });
      } else {
        plannedCourse = buildCourseAggregateFromManifest({
          manifest,
          revision: persistedRevision,
          decidedAt,
          audit: revisionAuditLink(envelope, metadata),
        });
      }

      if (existingCourse) {
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

      if (courseDocumentExistsRead && !requiresShapeReplacement) {
        session.plan.planMutation({
          path: courseDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
        });
      } else if (courseDocumentExistsRead) {
        session.plan.planMutation({
          path: courseDocumentPath,
          kind: 'delete',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
        });
        session.plan.planMutation({
          path: courseDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
        });
      } else {
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
        createdAt: existingCourse?.createdAt ?? persistedCreatedAt ?? decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId:
            existingCourse?.audit.createdByCommandId ??
            persistedAuditCreatedByCommandId ??
            metadata.commandId,
          lastChangedByCommandId: metadata.commandId,
          correlationId: metadata.correlationId,
        },
      });
      const payload = toFirestoreWritePayload(courseRecord as unknown as Record<string, unknown>);

      if (!courseDocumentExists) {
        session.tx.create({ path: courseDocumentPath }, payload);
      } else if (requiresShapeReplacement) {
        session.tx.delete({ path: courseDocumentPath });
        session.tx.create({ path: courseDocumentPath }, payload);
      } else {
        session.tx.update({ path: courseDocumentPath }, payload);
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

export async function applyCanonicalCourseProvisioningManifest(
  envelope: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
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

  const metadata = metadataFromEnvelope(envelope);
  const courseDocumentPath = coursePath(manifest.courseId);
  const catalogContentDocumentPath = courseCatalogContentPath(manifest.courseId);
  const sortedDays = [...manifest.days].sort((left, right) => left.dayOrder - right.dayOrder);
  let plannedCourse!: Course;
  let existingCourse: Course | undefined;
  let courseDocumentExists = false;
  let requiresShapeReplacement = false;
  let catalogContentAlreadyExists = false;
  let shouldWriteCatalogContent = false;
  let persistedCreatedAt: ReturnType<typeof readPersistedCourseCreatedAt>;
  let persistedAuditCreatedByCommandId: string | undefined;
  let plannedDays: CourseDay[] = [];
  let instructorClaimPlans: Awaited<ReturnType<typeof planAcquireCourseDayInstructorClaim>>[] = [];

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'apply_canonical_course_provisioning_manifest'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        if (!parseAccount(accountRead.exists ? accountRead.data : undefined)) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }

        const courseRead = await session.tx.get({ path: courseDocumentPath });
        session.plan.planRead({ path: courseDocumentPath, category: 'aggregate' });
        const rawCourseData = courseRead.exists
          ? (courseRead.data as Record<string, unknown>)
          : undefined;
        existingCourse = parseCourse(rawCourseData);
        courseDocumentExists = courseRead.exists;
        requiresShapeReplacement =
          courseDocumentExists && courseDocumentRequiresShapeReplacement(rawCourseData);
        persistedCreatedAt =
          existingCourse?.createdAt ?? readPersistedCourseCreatedAt(rawCourseData);
        persistedAuditCreatedByCommandId =
          existingCourse?.audit.createdByCommandId ??
          readPersistedCourseAuditCreatedByCommandId(rawCourseData);
        const persistedRevision = AggregateRevisionSchema.parse(
          Math.max(1, existingCourse?.revision ?? readPersistedCourseRevision(rawCourseData) ?? 1)
        );

        if (existingCourse && existingCourse.courseId !== manifest.courseId) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'courseId', reason: 'conflict' },
          });
        }

        const plannedFingerprint = computeCourseProvisioningManifestFingerprint(manifest);
        const persistedOperational = courseDocumentExists
          ? parseCanonicalCourseOperationalStateFromDocument(rawCourseData)
          : undefined;
        if (!existingCourse && courseDocumentExists) {
          const rawFingerprint = readPersistedCourseProvisioningFingerprint(rawCourseData);
          if (rawFingerprint && rawFingerprint !== plannedFingerprint) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'manifest', reason: 'conflict' },
            });
          }
        }

        if (requiresShapeReplacement && persistedOperational) {
          const issues = validatePersistedCourseOperationalStateAgainstManifest(
            persistedOperational,
            manifest
          );
          if (issues.length > 0) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: issues[0]!.field, reason: 'conflict' },
            });
          }
          plannedCourse = buildCourseAggregateFromShapeRepair({
            persistedOperational,
            manifest,
            revision: persistedRevision,
            audit: revisionAuditLink(envelope, metadata),
          });
        } else {
          plannedCourse = buildCourseAggregateFromManifest({
            manifest,
            revision: persistedRevision,
            decidedAt: timestampFromDate(environment.clock.decidedAt()),
            audit: revisionAuditLink(envelope, metadata),
          });
        }

        if (existingCourse) {
          if (existingCourse.lifecycle !== 'active') {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'courseId', reason: 'unsupported' },
            });
          }
          if (existingCourse.provisioningManifestFingerprint !== plannedFingerprint) {
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

        for (const instructorId of manifest.instructorRosterIds) {
          const instructorDocumentPath = instructorCatalogPath(instructorId);
          const instructorRead = await session.tx.get({ path: instructorDocumentPath });
          session.plan.planRead({ path: instructorDocumentPath, category: 'authorization_check' });
          if (!instructorRead.exists || (instructorRead.data ?? {}).isAvailable === false) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'instructorRosterIds', reason: 'conflict' },
            });
          }
        }

        shouldWriteCatalogContent = Boolean(manifest.presentation);
        if (shouldWriteCatalogContent) {
          const contentRead = await session.tx.get({ path: catalogContentDocumentPath });
          session.plan.planRead({ path: catalogContentDocumentPath, category: 'aggregate' });
          catalogContentAlreadyExists = contentRead.exists;
        }

        const guardOverlay: InTransactionGuardOverlay = new Map();
        plannedDays = [];
        instructorClaimPlans = [];
        for (const day of sortedDays) {
          const courseDayDocumentPath = courseDayPath(manifest.courseId, day.courseDayId);
          const courseDayRead = await session.tx.get({ path: courseDayDocumentPath });
          session.plan.planRead({ path: courseDayDocumentPath, category: 'aggregate' });
          if (courseDayRead.exists) {
            const existingCourseDay = parseCourseDay(courseDayRead.data);
            if (
              !existingCourseDay ||
              !existingCourseDayMatchesManifestDay(existingCourseDay, manifest, day)
            ) {
              throw new CanonicalCommandError('validation', {
                correlationId: envelope.context.correlationId,
                details: { field: 'courseDayId', reason: 'conflict' },
              });
            }
            continue;
          }

          const interval = resolveManifestDayInterval(day, manifest.timeZone).interval;
          const claimPlan = await planAcquireCourseDayInstructorClaim(session, {
            courseDayId: day.courseDayId,
            instructorId: day.instructorId,
            occurrenceRevision: 1,
            interval,
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: environment.clock.decidedAt(),
            inTransactionGuardOverlay: guardOverlay,
          });
          registerResourceClaimPlanInGuardOverlay(guardOverlay, claimPlan);
          instructorClaimPlans.push(claimPlan);
          plannedDays.push(
            CourseDaySchema.parse({
              courseId: manifest.courseId,
              courseDayId: day.courseDayId,
              dayOrder: day.dayOrder,
              interval,
              timeZone: manifest.timeZone,
              actualInstructorIds: [day.instructorId],
              revision: 1,
              createdAt: timestampFromDate(environment.clock.decidedAt()),
              updatedAt: timestampFromDate(environment.clock.decidedAt()),
              audit: revisionAuditLink(envelope, metadata),
            })
          );
          session.plan.planMutation({
            path: courseDayDocumentPath,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes,
          });
        }

        const shouldWriteCourse = !courseDocumentExists || requiresShapeReplacement;
        if (shouldWriteCourse) {
          session.plan.planMutation({
            path: courseDocumentPath,
            kind: courseDocumentExists
              ? requiresShapeReplacement
                ? 'create'
                : 'update'
              : 'create',
            category: 'aggregate',
            estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
          });
          if (requiresShapeReplacement) {
            session.plan.planMutation({
              path: courseDocumentPath,
              kind: 'delete',
              category: 'aggregate',
              estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
            });
          }
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
        buildApplyCanonicalCourseProvisioningManifestAuditPlan({
          envelope,
          courseId: manifest.courseId,
          courseRevision: plannedCourse.revision,
          courseDayIds: sortedDays.map((day) => day.courseDayId),
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const shouldWriteCourse = !courseDocumentExists || requiresShapeReplacement;
        if (shouldWriteCourse) {
          const courseRecord = CourseSchema.parse({
            ...plannedCourse,
            createdAt: existingCourse?.createdAt ?? persistedCreatedAt ?? decidedAt,
            updatedAt: decidedAt,
            audit: {
              createdByCommandId:
                existingCourse?.audit.createdByCommandId ??
                persistedAuditCreatedByCommandId ??
                metadata.commandId,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          });
          const coursePayload = toFirestoreWritePayload(
            courseRecord as unknown as Record<string, unknown>
          );
          if (!courseDocumentExists) {
            session.tx.create({ path: courseDocumentPath }, coursePayload);
          } else if (requiresShapeReplacement) {
            session.tx.delete({ path: courseDocumentPath });
            session.tx.create({ path: courseDocumentPath }, coursePayload);
          } else {
            session.tx.update({ path: courseDocumentPath }, coursePayload);
          }
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

        for (const claimPlan of instructorClaimPlans) {
          commitResourceClaimPlan(session, claimPlan, {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: context.decidedAt,
          });
        }
        for (const courseDay of plannedDays) {
          session.tx.create(
            { path: courseDayPath(manifest.courseId, courseDay.courseDayId) },
            toFirestoreWritePayload({
              ...courseDay,
              createdAt: decidedAt,
              updatedAt: decidedAt,
            } as unknown as Record<string, unknown>)
          );
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

function applyCanonicalCourseProvisioningManifestHandler(
  envelope: CommandEnvelope<'apply_canonical_course_provisioning_manifest'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'apply_canonical_course_provisioning_manifest'>> {
  return applyCanonicalCourseProvisioningManifest(envelope, environment, executor);
}

export function createCourseProvisioningCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  'provision_canonical_course' | 'apply_canonical_course_provisioning_manifest'
> {
  return {
    provision_canonical_course: (envelope, environment) =>
      provisionCanonicalCourseHandler(envelope, environment, executor),
    apply_canonical_course_provisioning_manifest: (envelope, environment) =>
      applyCanonicalCourseProvisioningManifestHandler(envelope, environment, executor),
  };
}
