import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryTestSessionReadModelsHandler } from './queryTestSessionReadModelsCallable';
import {
  isTestScopeCollection,
  missingTestScopeCollection,
} from '../testSessions/missingTestScopeCollection';

const accountId = AccountIdSchema.parse('account_test_session_read_callable_01');
const timestamp = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const account = AccountSchema.parse({
  accountId,
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
  audit: {
    createdByCommandId: 'command_seed',
    lastChangedByCommandId: 'command_seed',
    correlationId: CorrelationIdSchema.parse('correlation_test_session_read_callable_01'),
  },
});

function createFirestore(role: 'admin' | 'user'): Firestore {
  const query = {
    where: () => query,
    orderBy: () => query,
    startAfter: () => query,
    limit: () => query,
    get: async () => ({ docs: [] }),
  };
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => ({
              data: () => ({ ...account, role }),
            }),
          }),
        };
      }
      if (name === 'test_sessions' || name === 'test_actors' || name === 'courses') {
        return query;
      }
      if (isTestScopeCollection(name)) return missingTestScopeCollection();
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

describe('queryTestSessionReadModels callable authorization', () => {
  it('allows an authenticated administrator to list sessions', async () => {
    const handler = createQueryTestSessionReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'test_session_list' },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'test_session_list',
      items: [],
    });
  });

  it('fails closed for an authenticated non-admin', async () => {
    const handler = createQueryTestSessionReadModelsHandler(createFirestore('user'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'test_session_list' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('requires authentication and rejects client-supplied dataScope authority', async () => {
    const handler = createQueryTestSessionReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        data: { scope: 'test_session_list' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'test_session_list', dataScope: 'test' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
