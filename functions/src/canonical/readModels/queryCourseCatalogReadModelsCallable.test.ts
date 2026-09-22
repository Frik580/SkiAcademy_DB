import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  ParticipantIdSchema,
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  TestSessionSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import { readRepoFile } from '../../../../tests/helpers/readRepoFile';
import { createQueryCourseCatalogReadModelsHandler } from './queryCourseCatalogReadModelsCallable';

const liveAccountId = AccountIdSchema.parse('account_course_catalog_live_01');
const actorAccountId = AccountIdSchema.parse('account_course_catalog_actor_01');
const adminAccountId = AccountIdSchema.parse('account_course_catalog_admin_01');
const sessionA = TestSessionIdSchema.parse('test_course_catalog_callable_a01');
const sessionB = TestSessionIdSchema.parse('test_course_catalog_callable_b01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const correlationId = CorrelationIdSchema.parse('correlation_course_catalog_callable_01');
const audit = {
  createdByCommandId: 'command_seed',
  lastChangedByCommandId: 'command_seed',
  correlationId,
};

function account(accountId: ReturnType<typeof AccountIdSchema.parse>, dataScope?: 'test') {
  return {
    ...AccountSchema.parse({
      accountId,
      ...(dataScope ? { dataScope } : {}),
      lifecycle: { status: 'active' as const },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    }),
    role: accountId === adminAccountId ? 'admin' : 'user',
  };
}

function session(testSessionId: typeof sessionA, status: 'active' | 'locked' = 'active') {
  return TestSessionSchema.parse({
    testSessionId,
    schemaVersion: 1,
    status,
    label: 'course catalogue',
    createdByAccountId: adminAccountId,
    config: { startingBalanceKzt: 100_000, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit,
  });
}

function seedCourse(
  seed: Record<string, Record<string, unknown>>,
  id: string,
  scope: Record<string, unknown>
) {
  const course = canonicalCourseDeliveryFixtures.course;
  const days = canonicalCourseDeliveryFixtures.courseDays;
  seed[`courses/${id}`] = { ...course, courseId: id, title: id, ...scope };
  days.forEach((day, index) => {
    const dayId = `${id}_d${index + 1}`;
    seed[`courses/${id}/days/${dayId}`] = {
      ...day,
      courseId: id,
      courseDayId: dayId,
      ...scope,
    };
  });
  seed[`course_catalog_content/${id}`] = {
    courseId: id,
    revision: 1,
    duration: '5 days',
    description: id,
    dates: 'January',
    bgImageUrl: 'https://example.com/course.jpg',
    ...scope,
  };
}

function firestore(): Firestore {
  const seed: Record<string, Record<string, unknown>> = {
    [`users/${liveAccountId}`]: account(liveAccountId),
    [`users/${actorAccountId}`]: account(actorAccountId, 'test'),
    [`users/${adminAccountId}`]: account(adminAccountId),
    [`test_actors/${actorAccountId}`]: TestActorSchema.parse({
      accountId: actorAccountId,
      participantIds: [ParticipantIdSchema.parse('participant_course_catalog_actor_01')],
      kind: 'test_parent',
      allowed: true,
      dataScope: 'test',
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit,
    }) as unknown as Record<string, unknown>,
    [`test_actor_assignments/${actorAccountId}`]: TestActorAssignmentSchema.parse({
      accountId: actorAccountId,
      activeTestSessionId: sessionA,
      revision: 1,
      updatedAt: createdAt,
      audit,
    }) as unknown as Record<string, unknown>,
    [`test_sessions/${sessionA}`]: session(sessionA) as unknown as Record<string, unknown>,
    [`test_sessions/${sessionB}`]: session(sessionB, 'locked') as unknown as Record<string, unknown>,
  };
  seedCourse(seed, 'course_catalog_callable_live', { dataScope: 'live' });
  seedCourse(seed, 'course_catalog_callable_legacy', {});
  seedCourse(seed, 'course_catalog_callable_test_a', {
    dataScope: 'test',
    testSessionId: sessionA,
  });
  seedCourse(seed, 'course_catalog_callable_test_b', {
    dataScope: 'test',
    testSessionId: sessionB,
  });

  return {
    collection(path: string) {
      const prefix = `${path}/`;
      const docs = () =>
        Object.entries(seed)
          .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .map(([key, data]) => ({
            id: key.slice(prefix.length),
            data: () => data,
          }));
      return {
        doc(id: string) {
          const data = seed[`${path}/${id}`];
          return {
            get: async () => ({
              exists: data !== undefined,
              data: () => data,
            }),
          };
        },
        limit() {
          return { get: async () => ({ docs: docs() }) };
        },
        get: async () => ({ docs: docs() }),
      };
    },
  } as unknown as Firestore;
}

function request(uid: string | undefined, data: Record<string, unknown>) {
  return {
    ...(uid ? { auth: { uid } } : {}),
    data,
  } as CallableRequest<Record<string, unknown>>;
}

describe('queryCourseCatalogReadModels product scope', () => {
  const handler = createQueryCourseCatalogReadModelsHandler(firestore());

  it('keeps the existing callable export', () => {
    expect(readRepoFile('functions/src/index.ts')).toContain(
      'export const queryCourseCatalogReadModels'
    );
  });

  it('keeps a guest public catalogue on LIVE courses', async () => {
    const result = await handler(request(undefined, { scope: 'public' }));
    expect(result.items.map((item) => item.courseId).sort()).toEqual(
      ['course_catalog_callable_legacy', 'course_catalog_callable_live'].sort()
    );
    expect(result.items.every((item) => item.presentation === undefined)).toBe(true);
  });

  it('returns LIVE courses for an ordinary authenticated account', async () => {
    const result = await handler(request(liveAccountId, { scope: 'product' }));
    expect(result.items.map((item) => item.courseId).sort()).toEqual(
      ['course_catalog_callable_legacy', 'course_catalog_callable_live'].sort()
    );
  });

  it('returns only the assigned TestSession course without a client session id', async () => {
    const result = await handler(request(actorAccountId, { scope: 'product' }));
    expect(result.items.map((item) => item.courseId)).toEqual(['course_catalog_callable_test_a']);
    expect(result.items[0]?.presentation?.description).toBe('course_catalog_callable_test_a');
  });

  it('rejects an unassigned TestActor before listing LIVE courses', async () => {
    const base = firestore();
    const missingAssignment = {
      collection(path: string) {
        return {
          doc(id: string) {
            if (path === 'test_actor_assignments') {
              return { get: async () => ({ exists: false, data: () => undefined }) };
            }
            return base.collection(path).doc(id);
          },
          limit(count: number) {
            return base.collection(path).limit(count);
          },
          get() {
            return base.collection(path).get();
          },
        };
      },
    } as unknown as Firestore;
    await expect(
      createQueryCourseCatalogReadModelsHandler(missingAssignment)(
        request(actorAccountId, { scope: 'product' })
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_ACTOR_NO_SESSION' },
    });
  });

  it('rejects an inactive assigned TestSession', async () => {
    const base = firestore();
    const inactive = {
      collection(path: string) {
        return {
          doc(id: string) {
            if (path === 'test_actor_assignments' && id === actorAccountId) {
              return {
                get: async () => ({
                  exists: true,
                  data: () =>
                    TestActorAssignmentSchema.parse({
                      accountId: actorAccountId,
                      activeTestSessionId: sessionB,
                      revision: 1,
                      updatedAt: createdAt,
                      audit,
                    }),
                }),
              };
            }
            return base.collection(path).doc(id);
          },
          limit(count: number) {
            return base.collection(path).limit(count);
          },
          get() {
            return base.collection(path).get();
          },
        };
      },
    } as unknown as Firestore;
    await expect(
      createQueryCourseCatalogReadModelsHandler(inactive)(
        request(actorAccountId, { scope: 'product' })
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_SESSION_NOT_ACTIVE' },
    });
  });

  it('keeps an explicit LIVE administrator on LIVE courses', async () => {
    const result = await handler(request(adminAccountId, { scope: 'product' }));
    expect(result.items.map((item) => item.courseId).sort()).toEqual(
      ['course_catalog_callable_legacy', 'course_catalog_callable_live'].sort()
    );
  });

  it('returns the requested TestSession for an administrator', async () => {
    const result = await handler(
      request(adminAccountId, { scope: 'product', requestedTestSessionId: sessionA })
    );
    expect(result.items.map((item) => item.courseId)).toEqual(['course_catalog_callable_test_a']);
  });
});
