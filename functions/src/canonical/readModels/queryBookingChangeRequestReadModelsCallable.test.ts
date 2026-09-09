import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createQueryBookingChangeRequestReadModelsHandler } from './queryBookingChangeRequestReadModelsCallable';

const accountId = AccountIdSchema.parse('account_bcr_admin_callable_01');
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
    correlationId: CorrelationIdSchema.parse('correlation_bcr_admin_callable_01'),
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
      if (name === 'booking_change_requests') return query;
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Firestore;
}

describe('queryBookingChangeRequestReadModels callable authorization', () => {
  it('allows an authenticated server-resolved administrator to read admin_open', async () => {
    const handler = createQueryBookingChangeRequestReadModelsHandler(createFirestore('admin'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open' },
      } as CallableRequest<Record<string, unknown>>)
    ).resolves.toEqual({
      scope: 'admin_open',
      items: [],
    });
  });

  it('fails closed for an authenticated non-admin', async () => {
    const handler = createQueryBookingChangeRequestReadModelsHandler(createFirestore('user'));
    await expect(
      handler({
        auth: { uid: accountId },
        data: { scope: 'admin_open' },
      } as CallableRequest<Record<string, unknown>>)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('requires authentication and rejects client-supplied authority', async () => {
    const handler = createQueryBookingChangeRequestReadModelsHandler(createFirestore('admin'));
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
});
