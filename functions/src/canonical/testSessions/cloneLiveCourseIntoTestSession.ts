import {
  AggregateRevisionSchema,
  CanonicalCommandError,
  CommandIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  TestSessionPolicyError,
  assertTestSessionAcceptsProvisioningMutations,
  canonicalScopeFields,
  parsePersistedCanonicalScope,
  testCanonicalExecutionScope,
  testCourseDayIdFromLiveSource,
  testCourseIdFromLiveSource,
  timestampFromDate,
  type CanonicalTimestamp,
  type CommandId,
  type CorrelationId,
  type Course,
  type CourseCatalogContent,
  type CourseDay,
  type CourseDayId,
  type CourseId,
  type InstructorId,
  type TestSession,
} from '@ski-academy/shared-domain';
import type { CanonicalTransactionExecutor } from '../transactions';
import { scopeCanonicalTransactionSession } from '../transactions/scopedCanonicalTransaction';
import {
  COURSE_PLANNING_ESTIMATES,
  courseDayPath,
  courseDaysCollectionPath,
  coursePath,
  parseCourse,
  parseCourseDay,
  parseInstructorCatalog,
  toFirestoreWritePayload,
} from '../courses/courseStore';
import { instructorCatalogPath } from '../bookings/bookingStore';
import {
  COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES,
  courseCatalogContentPath,
  parseCourseCatalogContent,
} from '../courses/courseCatalogContentStore';
import { crossScopeCommandError } from './assertTestMutableResourceScope';
import { parseTestSession, testSessionPath } from './testSessionStore';

export interface CloneLiveCourseIntoTestSessionInput {
  readonly executor: CanonicalTransactionExecutor;
  readonly correlationId: CorrelationId;
  readonly testSession: Pick<TestSession, 'testSessionId' | 'status'>;
  readonly sourceCourseId: CourseId;
  readonly testInstructorId: InstructorId;
  readonly decidedAt: Date;
}

export interface CloneLiveCourseIntoTestSessionResult {
  readonly outcome: 'created' | 'already_cloned';
  readonly courseId: CourseId;
  readonly sourceCourseId: CourseId;
  readonly courseDayIds: readonly CourseDayId[];
}

function cloneCommandId(testSessionId: TestSession['testSessionId'], sourceCourseId: CourseId): CommandId {
  return CommandIdSchema.parse(testCourseIdFromLiveSource({ testSessionId, sourceCourseId }));
}

function mapProvisioningError(correlationId: CorrelationId, error: unknown): never {
  if (error instanceof CanonicalCommandError) throw error;
  if (error instanceof TestSessionPolicyError) {
    throw new CanonicalCommandError('cross_scope_forbidden', {
      correlationId,
      details: { reason: 'unsupported' },
    });
  }
  throw error;
}

export async function cloneLiveCourseIntoTestSession(
  input: CloneLiveCourseIntoTestSessionInput
): Promise<CloneLiveCourseIntoTestSessionResult> {
  try {
    assertTestSessionAcceptsProvisioningMutations(input.testSession);
  } catch (error) {
    mapProvisioningError(input.correlationId, error);
  }

  const testScope = testCanonicalExecutionScope(input.testSession.testSessionId);
  const cloneCourseId = testCourseIdFromLiveSource({
    testSessionId: input.testSession.testSessionId,
    sourceCourseId: input.sourceCourseId,
  });
  const decidedAt = timestampFromDate(input.decidedAt) as CanonicalTimestamp;
  const commandId = cloneCommandId(input.testSession.testSessionId, input.sourceCourseId);
  const audit = {
    createdByCommandId: commandId,
    lastChangedByCommandId: commandId,
    correlationId: input.correlationId,
  };

  const template = await input.executor.runAtomic({
    correlationId: input.correlationId,
    run: async (base) => {
      const session = scopeCanonicalTransactionSession(base, LIVE_CANONICAL_EXECUTION_SCOPE);
      const sourcePath = coursePath(input.sourceCourseId);
      const sourceRead = await session.tx.get({ path: sourcePath });
      session.plan.planRead({ path: sourcePath, category: 'aggregate' });
      const source = parseCourse(sourceRead.exists ? sourceRead.data : undefined);
      if (!source || source.courseId !== input.sourceCourseId) {
        throw new CanonicalCommandError('validation', {
          correlationId: input.correlationId,
          details: { resourceKind: 'course', reason: 'conflict' },
        });
      }
      const sourceScope = parsePersistedCanonicalScope(source, { allowLegacyLive: true });
      if (sourceScope.dataScope !== 'live') {
        throw crossScopeCommandError(input.correlationId, 'conflict');
      }

      const dayDocs = await session.tx.query({
        collection: courseDaysCollectionPath(input.sourceCourseId),
        where: { field: 'courseId', op: '==', value: input.sourceCourseId },
      });
      session.plan.planRead({
        path: `${courseDaysCollectionPath(input.sourceCourseId)}/query`,
        category: 'aggregate',
      });
      const days = dayDocs
        .map((doc) => parseCourseDay(doc.data))
        .filter((day): day is CourseDay => Boolean(day))
        .sort((left, right) => left.dayOrder - right.dayOrder);
      if (days.length === 0) {
        throw new CanonicalCommandError('validation', {
          correlationId: input.correlationId,
          details: { resourceKind: 'course', reason: 'conflict' },
        });
      }

      const catalogPath = courseCatalogContentPath(input.sourceCourseId);
      const catalogRead = await session.tx.get({ path: catalogPath });
      session.plan.planRead({ path: catalogPath, category: 'aggregate' });
      const catalog = parseCourseCatalogContent(
        catalogRead.exists ? catalogRead.data : undefined,
        input.sourceCourseId
      );

      return { source, days, catalog };
    },
  });

  return input.executor.runAtomic({
    correlationId: input.correlationId,
    run: async (base) => {
      const session = scopeCanonicalTransactionSession(base, testScope);
      const sessionPath = testSessionPath(input.testSession.testSessionId);
      const sessionRead = await session.tx.get({ path: sessionPath });
      session.plan.planRead({ path: sessionPath, category: 'authorization_check' });
      const persistedSession = parseTestSession(sessionRead.exists ? sessionRead.data : undefined);
      if (
        !persistedSession ||
        persistedSession.testSessionId !== input.testSession.testSessionId
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: input.correlationId,
          details: { reason: 'conflict' },
        });
      }
      try {
        assertTestSessionAcceptsProvisioningMutations(persistedSession);
      } catch (error) {
        mapProvisioningError(input.correlationId, error);
      }

      const instructorPath = instructorCatalogPath(input.testInstructorId);
      const instructorRead = await session.tx.get({ path: instructorPath });
      session.plan.planRead({ path: instructorPath, category: 'authorization_check' });
      if (
        !parseInstructorCatalog(
          input.testInstructorId,
          instructorRead.exists ? instructorRead.data : undefined
        )
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: input.correlationId,
          details: { resourceKind: 'instructor', reason: 'conflict' },
        });
      }

      const clonePath = coursePath(cloneCourseId);
      const cloneRead = await session.tx.get({ path: clonePath });
      session.plan.planRead({ path: clonePath, category: 'aggregate' });
      const existingClone = parseCourse(cloneRead.exists ? cloneRead.data : undefined);
      if (existingClone) {
        if (
          existingClone.sourceCourseId !== input.sourceCourseId ||
          existingClone.courseId !== cloneCourseId
        ) {
          throw crossScopeCommandError(input.correlationId, 'conflict');
        }
        return {
          outcome: 'already_cloned' as const,
          courseId: cloneCourseId,
          sourceCourseId: input.sourceCourseId,
          courseDayIds: existingClone.provisioningExpectedCourseDayIds ?? [],
        };
      }

      const mappedDays = template.days.map((day) => {
        const courseDayId = testCourseDayIdFromLiveSource({
          testSessionId: input.testSession.testSessionId,
          sourceCourseDayId: day.courseDayId,
        });
        const clonedDay: CourseDay = {
          courseId: cloneCourseId,
          courseDayId,
          dayOrder: day.dayOrder,
          interval: day.interval,
          timeZone: day.timeZone,
          actualInstructorIds: [input.testInstructorId],
          revision: AggregateRevisionSchema.parse(1),
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        };
        return clonedDay;
      });
      const expectedCourseDayIds = mappedDays.map((day) => day.courseDayId);

      const clonedCourse: Course = {
        courseId: cloneCourseId,
        sourceCourseId: input.sourceCourseId,
        title: template.source.title,
        lifecycle: template.source.lifecycle,
        price: template.source.price,
        capacity: {
          totalSeats: template.source.capacity.totalSeats,
          availableSeats: template.source.capacity.totalSeats,
        },
        instructorRosterIds: [input.testInstructorId],
        startAt: template.source.startAt,
        scheduleProjection: {
          courseDayCount: mappedDays.length,
          finalCourseDayEndsAt: template.source.scheduleProjection.finalCourseDayEndsAt,
          courseScheduleRevision: AggregateRevisionSchema.parse(1),
        },
        provisioningExpectedCourseDayIds: expectedCourseDayIds,
        revision: AggregateRevisionSchema.parse(1),
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      };

      session.plan.planMutation({
        path: clonePath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseBytes,
      });
      for (const day of mappedDays) {
        session.plan.planMutation({
          path: courseDayPath(cloneCourseId, day.courseDayId),
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_PLANNING_ESTIMATES.courseDayBytes,
        });
      }

      let clonedCatalog: CourseCatalogContent | undefined;
      if (template.catalog) {
        clonedCatalog = {
          ...template.catalog,
          courseId: cloneCourseId,
          revision: AggregateRevisionSchema.parse(1),
        };
        session.plan.planMutation({
          path: courseCatalogContentPath(cloneCourseId),
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: COURSE_CATALOG_CONTENT_PLANNING_ESTIMATES.catalogContentBytes,
        });
      }

      await session.transitionToWrites();

      session.tx.create(
        { path: clonePath },
        toFirestoreWritePayload({
          ...clonedCourse,
          ...canonicalScopeFields(testScope),
        } as Record<string, unknown>)
      );
      for (const day of mappedDays) {
        session.tx.create(
          { path: courseDayPath(cloneCourseId, day.courseDayId) },
          toFirestoreWritePayload({
            ...day,
            ...canonicalScopeFields(testScope),
          } as Record<string, unknown>)
        );
      }
      if (clonedCatalog) {
        session.tx.create(
          { path: courseCatalogContentPath(cloneCourseId) },
          toFirestoreWritePayload({
            ...clonedCatalog,
            ...canonicalScopeFields(testScope),
          } as Record<string, unknown>)
        );
      }

      return {
        outcome: 'created' as const,
        courseId: cloneCourseId,
        sourceCourseId: input.sourceCourseId,
        courseDayIds: expectedCourseDayIds,
      };
    },
  });
}
