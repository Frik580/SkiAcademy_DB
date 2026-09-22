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
import { readRepoFile } from '../../../../tests/helpers/readRepoFile';
import { createQueryBookingInstructorCatalogueReadModelsHandler } from './queryBookingInstructorCatalogueReadModelsCallable';

const liveAccountId = AccountIdSchema.parse('account_catalogue_live_01');
const actorAccountId = AccountIdSchema.parse('account_catalogue_actor_01');
const adminAccountId = AccountIdSchema.parse('account_catalogue_admin_01');
const sessionA = TestSessionIdSchema.parse('test_catalogue_callable_a01');
const sessionB = TestSessionIdSchema.parse('test_catalogue_callable_b01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const correlationId = CorrelationIdSchema.parse('correlation_catalogue_callable_01');
const audit = {
  createdByCommandId: 'command_seed',
  lastChangedByCommandId: 'command_seed',
  correlationId,
};

function account(accountId: ReturnType<typeof AccountIdSchema.parse>, dataScope?: 'test') {
  return AccountSchema.parse({
    accountId,
    ...(dataScope ? { dataScope } : {}),
    lifecycle: { status: 'active' as const },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit,
  });
}

function session(testSessionId: typeof sessionA, status: 'active' | 'locked' = 'active') {
  return TestSessionSchema.parse({
    testSessionId,
    schemaVersion: 1,
    status,
    label: 'catalogue',
    createdByAccountId: adminAccountId,
    config: { startingBalanceKzt: 100_000, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit,
  });
}

function instructor(name: string, fields: Record<string, unknown> = {}) {
  return {
    name,
    specialty: 'ski',
    pricePerHourKZT: 30_000,
    isAvailable: true,
    ...fields,
  };
}

function firestore(): Firestore {
  const seed: Record<string, Record<string, unknown>> = {
    [`users/${liveAccountId}`]: { ...account(liveAccountId), role: 'user' },
    [`users/${actorAccountId}`]: { ...account(actorAccountId, 'test'), role: 'user' },
    [`users/${adminAccountId}`]: { ...account(adminAccountId), role: 'admin' },
    [`test_actors/${actorAccountId}`]: TestActorSchema.parse({
      accountId: actorAccountId,
      participantIds: [ParticipantIdSchema.parse('participant_catalogue_actor_01')],
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
    'instructors/instructor_callable_live': instructor('Arsenii', { dataScope: 'live' }),
    'instructors/instructor_callable_legacy': instructor('Elena'),
    'instructors/instructor_callable_test_a': instructor('Test Coach', {
      dataScope: 'test',
      testSessionId: sessionA,
    }),
    'instructors/instructor_callable_test_b': instructor('Other Session Coach', {
      dataScope: 'test',
      testSessionId: sessionB,
    }),
  };

  return {
    collection(name: string) {
      return {
        doc(id: string) {
          const data = seed[`${name}/${id}`];
          return {
            get: async () => ({
              exists: data !== undefined,
              data: () => data,
            }),
          };
        },
        limit() {
          return {
            get: async () => ({
              docs: Object.entries(seed)
                .filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === 2)
                .map(([path, data]) => ({
                  id: path.split('/')[1]!,
                  data: () => data,
                })),
            }),
          };
        },
      };
    },
  } as unknown as Firestore;
}

function request(uid: string | undefined, data: Record<string, unknown> = {}) {
  return {
    ...(uid ? { auth: { uid } } : {}),
    data,
  } as CallableRequest<Record<string, unknown>>;
}

describe('queryBookingInstructorCatalogueReadModels callable', () => {
  const handler = createQueryBookingInstructorCatalogueReadModelsHandler(firestore());

  it('exports the callable from the functions entrypoint', () => {
    expect(readRepoFile('functions/src/index.ts')).toContain(
      'export const queryBookingInstructorCatalogueReadModels'
    );
  });

  it('rejects a guest', async () => {
    await expect(handler(request(undefined))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('returns LIVE instructors for an ordinary account and hides TEST', async () => {
    const result = await handler(request(liveAccountId));
    expect(result.items.map((item) => item.name)).toEqual(['Arsenii', 'Elena']);
  });

  it('returns the assigned TestSession instructor without a client session id', async () => {
    const result = await handler(request(actorAccountId, {}));
    expect(result.items.map((item) => item.name)).toEqual(['Test Coach']);
  });

  it('rejects an unassigned TestActor', async () => {
    const unassigned = firestore();
    const missingAssignment = {
      collection(name: string) {
        return {
          doc(id: string) {
            if (name === 'test_actor_assignments') {
              return { get: async () => ({ exists: false, data: () => undefined }) };
            }
            return unassigned.collection(name).doc(id);
          },
          limit(count: number) {
            return unassigned.collection(name).limit(count);
          },
        };
      },
    } as unknown as Firestore;
    await expect(
      createQueryBookingInstructorCatalogueReadModelsHandler(missingAssignment)(
        request(actorAccountId)
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_ACTOR_NO_SESSION' },
    });
  });

  it('rejects an inactive assigned TestSession', async () => {
    const inactive = firestore();
    const wrapped = {
      collection(name: string) {
        return {
          doc(id: string) {
            if (name === 'test_actor_assignments' && id === actorAccountId) {
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
            return inactive.collection(name).doc(id);
          },
          limit: (...args: unknown[]) => inactive.collection(name).limit(...(args as [number])),
        };
      },
    } as unknown as Firestore;
    await expect(
      createQueryBookingInstructorCatalogueReadModelsHandler(wrapped)(request(actorAccountId))
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'TEST_SESSION_NOT_ACTIVE' },
    });
  });

  it('keeps an explicit LIVE administrator on LIVE instructors', async () => {
    const result = await handler(request(adminAccountId));
    expect(result.items.map((item) => item.name)).toEqual(['Arsenii', 'Elena']);
  });

  it('returns the requested TestSession for an administrator', async () => {
    const result = await handler(
      request(adminAccountId, { requestedTestSessionId: sessionA })
    );
    expect(result.items.map((item) => item.name)).toEqual(['Test Coach']);
  });

  it('does not let a TestActor choose a session', async () => {
    await expect(
      handler(request(actorAccountId, { requestedTestSessionId: sessionA }))
    ).rejects.toMatchObject({
      code: 'permission-denied',
      details: { code: 'TEST_ACTOR_REQUEST_FORBIDDEN' },
    });
  });
});
