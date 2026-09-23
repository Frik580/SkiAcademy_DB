import { describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { grantStagingOwner } from './stagingOwnerBootstrap';
import { STAGING_FIREBASE_PROJECT_ID } from './stagingProjectGuard';

const OWNER_UID = 'staging-google-owner-uid';
const OWNER_EMAIL = 'staging.owner@gmail.com';
const now = new Date('2026-09-23T12:00:00.000Z');

function normalClientAccount() {
  const timestamp = timestampFromDate(new Date('2026-08-01T12:00:00.000Z'));
  return {
    accountId: AccountIdSchema.parse(OWNER_UID),
    dataScope: 'live',
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    audit: {
      createdByCommandId: CommandIdSchema.parse('command_google_account_create'),
      lastChangedByCommandId: CommandIdSchema.parse('command_google_account_create'),
      correlationId: CorrelationIdSchema.parse('correlation_google_account_create'),
    },
    uid: OWNER_UID,
    email: OWNER_EMAIL,
    displayName: 'Staging Owner',
    avatarUrl: 'https://example.test/avatar.png',
    role: 'user',
    isClientActive: true,
  };
}

function createHarness(options: { readonly missingAuthUser?: boolean } = {}) {
  let account: Record<string, unknown> | undefined = normalClientAccount();
  const writes: Record<string, unknown>[] = [];
  const auth = {
    getUserByEmail: vi.fn(async () => {
      if (options.missingAuthUser) {
        throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' });
      }
      return {
        uid: OWNER_UID,
        email: OWNER_EMAIL,
        providerData: [{ providerId: 'google.com' }],
      };
    }),
  };
  const firestore = {
    doc: vi.fn((path: string) => ({ path })),
    runTransaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        get: vi.fn(async () => ({
          exists: account !== undefined,
          data: () => account,
        })),
        update: vi.fn((_ref: unknown, update: Record<string, unknown>) => {
          writes.push(update);
          account = { ...account, ...update };
        }),
      })
    ),
  };

  return {
    auth,
    firestore,
    writes,
    getAccount: () => account,
    grant: (projectId = STAGING_FIREBASE_PROJECT_ID, env: NodeJS.ProcessEnv = {}) =>
      grantStagingOwner({
        email: OWNER_EMAIL,
        explicitProjectId: projectId,
        auth: auth as never,
        firestore: firestore as never,
        env,
        now,
      }),
  };
}

describe('staging owner bootstrap', () => {
  it('allows the staging project and promotes the existing Google client Account', async () => {
    const harness = createHarness();

    await expect(harness.grant()).resolves.toEqual({ uid: OWNER_UID, changed: true });

    expect(harness.auth.getUserByEmail).toHaveBeenCalledWith(OWNER_EMAIL);
    expect(harness.firestore.doc).toHaveBeenCalledTimes(1);
    expect(harness.firestore.doc).toHaveBeenCalledWith(`users/${OWNER_UID}`);
    expect(harness.writes).toHaveLength(1);
    expect(harness.getAccount()).toMatchObject({
      accountId: OWNER_UID,
      role: 'admin',
      systemRole: 'owner',
      revision: 2,
      isClientActive: true,
      avatarUrl: 'https://example.test/avatar.png',
    });
    expect(harness.getAccount()).not.toHaveProperty('instructorId');
    expect(harness.getAccount()).not.toHaveProperty('isInstructor');
  });

  it('rejects production before Auth or Firestore access', async () => {
    const harness = createHarness();

    await expect(harness.grant('ski-school-8f3ca')).rejects.toThrow(
      'STAGING ONLY: refusing to mutate project ski-school-8f3ca'
    );

    expect(harness.auth.getUserByEmail).not.toHaveBeenCalled();
    expect(harness.firestore.doc).not.toHaveBeenCalled();
    expect(harness.firestore.runTransaction).not.toHaveBeenCalled();
  });

  it('rejects missing, conflicting, and emulator project routing before Auth access', async () => {
    const missing = createHarness();
    await expect(
      grantStagingOwner({
        email: OWNER_EMAIL,
        auth: missing.auth as never,
        firestore: missing.firestore as never,
        env: {},
      })
    ).rejects.toThrow('STAGING ONLY: refusing to mutate project <missing>');

    const conflicting = createHarness();
    await expect(
      conflicting.grant(STAGING_FIREBASE_PROJECT_ID, {
        GOOGLE_CLOUD_PROJECT: 'ski-school-8f3ca',
      })
    ).rejects.toThrow('STAGING ONLY: refusing conflicting project ids');

    const emulator = createHarness();
    await expect(
      emulator.grant(STAGING_FIREBASE_PROJECT_ID, {
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      })
    ).rejects.toThrow(
      'STAGING ONLY: refusing mutation while Firebase emulator hosts are configured'
    );

    for (const harness of [missing, conflicting, emulator]) {
      expect(harness.auth.getUserByEmail).not.toHaveBeenCalled();
      expect(harness.firestore.runTransaction).not.toHaveBeenCalled();
    }
  });

  it('rejects a missing Google Auth user without partial writes', async () => {
    const harness = createHarness({ missingAuthUser: true });

    await expect(harness.grant()).rejects.toThrow(
      `STAGING ONLY: no existing Firebase Auth user found for ${OWNER_EMAIL}`
    );

    expect(harness.auth.getUserByEmail).toHaveBeenCalledTimes(1);
    expect(harness.firestore.doc).not.toHaveBeenCalled();
    expect(harness.firestore.runTransaction).not.toHaveBeenCalled();
    expect(harness.writes).toHaveLength(0);
  });

  it('is idempotent when rerun for an already-promoted owner', async () => {
    const harness = createHarness();

    await expect(harness.grant()).resolves.toEqual({ uid: OWNER_UID, changed: true });
    const afterFirstRun = harness.getAccount();
    await expect(harness.grant()).resolves.toEqual({ uid: OWNER_UID, changed: false });

    expect(harness.writes).toHaveLength(1);
    expect(harness.getAccount()).toEqual(afterFirstRun);
    expect(harness.firestore.doc).toHaveBeenCalledTimes(2);
  });
});
