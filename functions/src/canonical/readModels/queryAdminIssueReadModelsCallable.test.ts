import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryAdminIssueReadModelsHandler } from './queryAdminIssueReadModelsCallable';

const accountId = AccountIdSchema.parse('account_admin_issue_callable_01');
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
    correlationId: CorrelationIdSchema.parse('correlation_admin_issue_callable_01'),
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
      if (name === 'admin_issues') return query;
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

describe('queryAdminIssueReadModels callable authorization', () => {
  it('allows an authenticated server-resolved administrator', async () => {
    const handler = createQueryAdminIssueReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open' },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'admin_open',
      items: [],
      hasMore: false,
    });
  });

  it('fails closed for an authenticated non-admin', async () => {
    const handler = createQueryAdminIssueReadModelsHandler(createFirestore('user'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('requires authentication and rejects client-supplied role authority', async () => {
    const handler = createQueryAdminIssueReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        data: { scope: 'admin_open' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open', role: 'admin' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('maps malformed cursors to invalid-argument', async () => {
    const handler = createQueryAdminIssueReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open', cursor: 'not-a-cursor' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
