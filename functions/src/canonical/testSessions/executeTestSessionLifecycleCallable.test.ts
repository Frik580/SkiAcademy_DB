import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { timestampFromDate } from '@ski-academy/shared-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logSecurityCommandEvent } from '../commands/securityCommandLogging';
import { createExecuteTestSessionLifecycleHandler } from './executeTestSessionLifecycleCallable';
import { executeTestSessionLifecycle } from './testSessionLifecycleEngine';

vi.mock('../commands/securityCommandLogging', () => ({ logSecurityCommandEvent: vi.fn() }));
vi.mock('./testSessionLifecycleEngine', () => ({ executeTestSessionLifecycle: vi.fn() }));

const accountId = 'account_lifecycle_admin';
const request = {
  auth: { uid: accountId },
  data: {
    command: 'create_test_session',
    idempotencyKey: 'create_test_session_request',
    label: 'Test session',
    startingBalanceKzt: 0,
    actorAccountIds: ['test_actor_a'],
    testInstructorAccountId: 'test_instructor_a',
    sourceCourseIds: ['live_course_a'],
  },
} as CallableRequest<Record<string, unknown>>;

function adminAccount() {
  const now = timestampFromDate(new Date('2026-01-01'));
  return {
    accountId,
    role: 'admin',
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId: 'correlation_seed',
    },
  };
}

function createFirestore(registeredTestActor?: { readonly allowed: boolean }): Firestore {
  const collections = {
    users: adminAccount(),
    test_actors: registeredTestActor && { accountId, ...registeredTestActor },
  };
  return {
    doc: (path: string) => ({ path }),
    collection: (name: keyof typeof collections) => ({
      doc: () => ({
        get: async () => ({
          exists: Boolean(collections[name]),
          data: () => collections[name],
        }),
      }),
    }),
  } as unknown as Firestore;
}

describe('Test Session lifecycle callable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets a live administrator start maintenance and logs the outcome', async () => {
    const result = { command: 'create_test_session', outcome: 'created' } as const;
    vi.mocked(executeTestSessionLifecycle).mockResolvedValueOnce(result);
    await expect(createExecuteTestSessionLifecycleHandler(createFirestore())(request)).resolves.toEqual(result);
    expect(executeTestSessionLifecycle).toHaveBeenCalledOnce();
    expect(logSecurityCommandEvent).toHaveBeenCalledWith({
      actor: { kind: 'account', id: accountId },
      commandKind: 'create_test_session',
      resultCode: 'created',
      scope: 'TEST',
    });
  });

  it.each([true, false])('denies maintenance to registered TestActors with allowed=%s', async (allowed) => {
    const handler = createExecuteTestSessionLifecycleHandler(createFirestore({ allowed }));
    await expect(handler(request)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(executeTestSessionLifecycle).not.toHaveBeenCalled();
    expect(logSecurityCommandEvent).toHaveBeenCalledWith({
      actor: { kind: 'account', id: accountId },
      commandKind: 'create_test_session',
      resultCode: 'TEST_ACTOR_REQUEST_FORBIDDEN',
      scope: 'TEST',
    });
  });

  it('requires a still-active administrator at the transactional admission boundary', async () => {
    const transaction = {
      getAll: vi.fn().mockResolvedValue([
        { data: () => ({ ...adminAccount(), role: 'user' }) },
        { exists: false },
      ]),
    } as unknown as Transaction;
    vi.mocked(executeTestSessionLifecycle).mockImplementationOnce(async (ports) => {
      await ports.authorizeAdmission?.(transaction);
      return { command: 'create_test_session', outcome: 'created' };
    });
    await expect(createExecuteTestSessionLifecycleHandler(createFirestore())(request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(transaction.getAll).toHaveBeenCalledOnce();
  });
});
