import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CommandIdSchema,
  TestSessionIdSchema,
  timestampFromDate,
  type TestSessionStatus,
} from '@ski-academy/shared-domain';
import { resolveWorkerExecutionScope } from './workerExecutionScope';

const testSessionId = TestSessionIdSchema.parse('test_session_worker_scope_01');

function session(status: TestSessionStatus): Record<string, unknown> {
  const at = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const commandId = CommandIdSchema.parse('command_worker_scope_01');
  return {
    testSessionId,
    schemaVersion: 1,
    status,
    label: 'Worker scope test',
    createdByAccountId: AccountIdSchema.parse('account_worker_scope_01'),
    config: { startingBalanceKzt: 0, clonedCourseIds: [] },
    inventoryRevision: 0,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: commandId,
      lastChangedByCommandId: commandId,
      correlationId: 'correlation_worker_scope_01',
    },
  };
}

function firestoreWithSession(value?: Record<string, unknown>): Firestore {
  return {
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: value !== undefined,
          data: () => value,
        }),
      }),
    }),
  } as unknown as Firestore;
}

describe('resolveWorkerExecutionScope', () => {
  it('keeps legacy missing scope and explicit LIVE work LIVE without a session read', async () => {
    const inaccessible = new Proxy(
      {},
      {
        get: () => {
          throw new Error('LIVE work must not read TestSession');
        },
      }
    ) as Firestore;
    await expect(resolveWorkerExecutionScope(inaccessible, {})).resolves.toEqual({
      dataScope: 'live',
    });
    await expect(resolveWorkerExecutionScope(inaccessible, { dataScope: 'live' })).resolves.toEqual(
      {
        dataScope: 'live',
      }
    );
  });

  it('returns matching TEST scope only for an active TestSession', async () => {
    await expect(
      resolveWorkerExecutionScope(firestoreWithSession(session('active')), {
        dataScope: 'test',
        testSessionId,
      })
    ).resolves.toEqual({ dataScope: 'test', testSessionId });
  });

  it.each(['provisioning', 'locked', 'resetting', 'deleting', 'closed', 'failed'] as const)(
    'skips TEST work for a %s TestSession',
    async (status) => {
      await expect(
        resolveWorkerExecutionScope(firestoreWithSession(session(status)), {
          dataScope: 'test',
          testSessionId,
        })
      ).resolves.toBeUndefined();
    }
  );

  it('rejects malformed persisted work scope instead of treating it as LIVE', async () => {
    await expect(
      resolveWorkerExecutionScope(firestoreWithSession(), {
        dataScope: 'test',
      })
    ).rejects.toMatchObject({ code: 'MALFORMED_PERSISTED_SCOPE' });
  });
});
