import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  AccountSchema,
  CorrelationIdSchema,
  WalletSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryAdminFinanceReadModelsHandler } from './queryAdminFinanceReadModelsCallable';

const accountId = 'account_admin_finance_callable_01';
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const correlationId = CorrelationIdSchema.parse('correlation_admin_finance_callable_01');

function createFirestore(role: 'admin' | 'user'): Firestore {
  const account = AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_admin_finance_callable_seed',
      lastChangedByCommandId: 'command_admin_finance_callable_seed',
      correlationId,
    },
  });
  const wallet = WalletSchema.parse({
    accountId,
    currency: 'KZT',
    balance: 0,
    revision: 1,
    eventRevision: 0,
    createdAt,
    updatedAt: createdAt,
  });
  const emptyQuery = {
    where: () => emptyQuery,
    orderBy: () => emptyQuery,
    startAfter: () => emptyQuery,
    limit: () => emptyQuery,
    get: async () => ({ docs: [] }),
  };
  return {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({ ...account, role, displayName: 'Admin' }),
            }),
            collection: () => ({
              doc: () => ({ get: async () => ({ exists: true, data: () => wallet }) }),
            }),
          }),
        };
      }
      if (name === 'monetary_events') return emptyQuery;
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

describe('queryAdminFinanceReadModels callable authorization', () => {
  it('allows an authenticated administrator to read canonical Wallet state', async () => {
    const handler = createQueryAdminFinanceReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_wallet', accountId },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toMatchObject({ scope: 'admin_wallet', item: { balance: 0, revision: 1 } });
  });

  it('fails closed for an authenticated non-admin', async () => {
    const handler = createQueryAdminFinanceReadModelsHandler(createFirestore('user'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_wallet', accountId },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects unauthenticated, forged-authority, and malformed cursor requests', async () => {
    const handler = createQueryAdminFinanceReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({ data: { scope: 'admin_wallet', accountId } } as CallableRequest<
        Record<string, unknown>
      >)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_wallet', accountId, role: 'admin' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_wallet', accountId, cursor: 'broken' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
