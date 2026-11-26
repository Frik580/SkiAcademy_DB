import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { CanonicalCommandError, CorrelationIdSchema } from '@ski-academy/shared-domain';
import { error as logError, warn } from 'firebase-functions/logger';
import { requireCurrentAdministratorSession } from '../../security/administratorSession';
import { createExecuteCanonicalCommandHandler } from './executeCanonicalCommandCallable';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({ error: vi.fn(), warn: vi.fn() }));
vi.mock('./canonicalCommandRuntime', () => ({
  createCanonicalCommandRuntime: () => ({ createCommands: () => ({ execute }) }),
  readGuestActionTokenSecret: () => undefined,
}));
vi.mock('../testSessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../testSessions')>()),
  createFirestoreCanonicalExecutionScopeStore: vi.fn(),
  resolveCanonicalExecutionScope: async () => ({ dataScope: 'live' }),
}));

describe('canonical callable unexpected exception diagnostics', () => {
  beforeEach(() => vi.clearAllMocks());

  const correlationId = CorrelationIdSchema.parse('correlation_safe_exception_01');
  function invoke() {
    const firestore = {
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({}) }) }) }),
    } as unknown as Firestore;
    const handler = createExecuteCanonicalCommandHandler(firestore);
    return handler({
      auth: { uid: 'account_safe_exception' },
      data: { kind: 'block_participant', correlationId, idempotencyKey: 'block-safe', intent: {} },
    } as unknown as Parameters<typeof handler>[0]);
  }

  it('logs only correlation, command type and safe diagnostics; keeps the client error generic', async () => {
    const error = Object.assign(new TypeError('private participant name and secret'), { code: 9 });
    error.stack =
      'TypeError: private participant name and secret\n at read (/workspace/lib/canonical/participantAccess/participantAccessCommands.js:1148:47)';
    execute.mockRejectedValue(error);
    await expect(invoke()).rejects.toMatchObject({
      code: 'internal',
      message: 'The operation could not be completed.',
      details: { correlationId, code: 'internal', retryable: true },
    });
    expect(logError).toHaveBeenCalledExactlyOnceWith('Unexpected canonical command exception', {
      correlationId,
      commandKind: 'block_participant',
      errorType: 'TypeError',
      grpcCode: 9,
      sourceLocations: ['lib/canonical/participantAccess/participantAccessCommands.js:1148:47'],
    });
  });

  it.each([
    ['forbidden', 'permission-denied'],
    ['unauthorized', 'unauthenticated'],
  ] as const)(
    'writes a structured security event for %s',
    async (code, transportCode) => {
      execute.mockRejectedValue(new CanonicalCommandError(code, { correlationId }));
      await expect(invoke()).rejects.toMatchObject({ code: transportCode });
      expect(logError).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledExactlyOnceWith('Canonical security command event', {
        actor: { kind: 'account', reference: expect.stringMatching(/^[a-f0-9]{64}$/) },
        commandKind: 'block_participant',
        resultCode: code,
        scope: 'LIVE',
        correlationId,
      });
    }
  );

  it('bounds authorization diagnostics per minute', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
    try {
      execute.mockRejectedValue(new CanonicalCommandError('forbidden', { correlationId }));
      for (let index = 0; index < 35; index += 1) {
        await expect(invoke()).rejects.toMatchObject({ code: 'permission-denied' });
      }
      expect(warn).toHaveBeenCalledTimes(30);
      now.mockReturnValue(120_000);
      await expect(invoke()).rejects.toMatchObject({ code: 'permission-denied' });
      expect(warn).toHaveBeenCalledTimes(31);
    } finally {
      now.mockRestore();
    }
  });
});

describe('canonical callable authorization inputs', () => {
  beforeEach(() => vi.clearAllMocks());

  function call(
    data: Record<string, unknown>,
    profile?: Record<string, unknown>,
    checkAdministratorSession?: typeof requireCurrentAdministratorSession,
    authTime = 1000,
    signInSecondFactor?: string
  ) {
    const get = vi.fn(async () => ({ data: () => profile }));
    const firestore = {
      collection: () => ({ doc: () => ({ get }) }),
    } as unknown as Firestore;
    const handler = createExecuteCanonicalCommandHandler(firestore, checkAdministratorSession);
    return {
      get,
      result: handler({
        auth: {
          uid: 'account_callable_authorization',
          token: {
            uid: 'account_callable_authorization',
            auth_time: authTime,
            iat: Math.floor(Date.now() / 1000),
            firebase: { sign_in_second_factor: signInSecondFactor },
          },
        },
        data: {
          idempotencyKey: 'callable-authorization',
          correlationId: CorrelationIdSchema.parse('correlation_callable_authorization'),
          intent: {},
          ...data,
        },
      } as unknown as Parameters<typeof handler>[0]),
    };
  }

  it('checks the trusted authentication time before dispatching a LIVE administrator command', async () => {
    const timestamp = { seconds: 900, nanoseconds: 0 };
    const profile = {
      accountId: 'account_callable_authorization',
      role: 'admin',
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      audit: {
        createdByCommandId: 'created',
        lastChangedByCommandId: 'updated',
        correlationId: 'correlation',
      },
    };
    const command = { kind: 'confirm_guest_booking' };
    const getUser = vi.fn().mockResolvedValue({
      tokensValidAfterTime: new Date(1001 * 1000).toUTCString(),
    });
    const verify: typeof requireCurrentAdministratorSession = (token) =>
      requireCurrentAdministratorSession(token, { getUser });

    await expect(call(command, profile, verify).result).rejects.toMatchObject({
      code: 'unauthenticated',
      details: { code: 'ADMIN_SESSION_INVALID' },
    });
    expect(execute).not.toHaveBeenCalled();
    getUser.mockResolvedValue({ tokensValidAfterTime: new Date(999 * 1000).toUTCString() });
    await expect(call(command, { ...profile, adminTotpRequired: true }, verify).result).rejects.toMatchObject({
      code: 'permission-denied',
      details: { code: 'ADMIN_TOTP_REQUIRED' },
    });
    await expect(call(command, { ...profile, adminSessionsRevokedThrough: 1000 }, verify, 1000, 'totp').result)
      .rejects.toMatchObject({ code: 'unauthenticated', details: { code: 'ADMIN_SESSION_INVALID' } });
    execute.mockResolvedValueOnce({ status: 'success' });
    await expect(call(command, { ...profile, adminTotpRequired: true }, verify, 1000, 'totp').result)
      .resolves.toMatchObject({ status: 'success' });
  });

  it.each(['record_manual_wallet_funding', 'record_financial_correction'])(
    'requires fresh authentication for %s before dispatch',
    async (kind) => {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = { seconds: now - 700, nanoseconds: 0 };
    const profile = {
      accountId: 'account_callable_authorization',
      role: 'admin',
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      audit: {
        createdByCommandId: 'created',
        lastChangedByCommandId: 'updated',
        correlationId: 'correlation',
      },
    };
    const command = { kind };
    const check = vi.fn().mockResolvedValue(undefined);
    await expect(call(command, profile, check, now - 601).result).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { code: 'ADMIN_RECENT_AUTH_REQUIRED' },
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();

    execute.mockResolvedValueOnce({ status: 'success' });
    await expect(call(command, profile, check, now).result).resolves.toMatchObject({ status: 'success' });
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        context: expect.objectContaining({ idempotencyKey: 'callable-authorization' }),
      }),
      'authenticated_callable'
    );
    }
  );

  it('rejects unknown command kinds before an Account read', async () => {
    const { get, result } = call({ kind: 'toString' });
    await expect(result).rejects.toMatchObject({
      code: 'invalid-argument',
      details: { code: 'validation' },
    });
    expect(get).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a replay if the Firebase credential belongs to another account', async () => {
    const { get, result } = call({
      kind: 'record_manual_wallet_funding',
      expectedAdministratorUid: 'previous-account',
    });
    await expect(result).rejects.toMatchObject({ code: 'permission-denied' });
    expect(get).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not dispatch for a disabled profile even if it lacks other canonical Account fields', async () => {
    await expect(
      call(
        { kind: 'provision_self_participant' },
        {
          lifecycle: { status: 'disabled' },
        }
      ).result
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps Account bootstrap outside the administrator MFA policy', async () => {
    execute.mockResolvedValueOnce({ status: 'success' });
    await expect(
      call({
        kind: 'provision_self_participant',
        exercisedCapability: 'system',
        source: 'scheduler',
        actor: { kind: 'system' },
      }).result
    ).resolves.toMatchObject({ status: 'success' });
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        context: expect.objectContaining({
          source: 'client_callable',
          actor: { kind: 'account', accountId: 'account_callable_authorization' },
          exercisedCapability: 'account_owner',
        }),
      }),
      'authenticated_callable'
    );
  });

  it('rejects explicit administrator capability and an unverified admin profile', async () => {
    await expect(
      call(
        {
          kind: 'create_confirmed_booking',
          exercisedCapability: 'administrator',
          administratorContext: true,
        },
        { role: 'user' }
      ).result
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      call({ kind: 'confirm_guest_booking' }, { role: 'admin' }).result
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(execute).not.toHaveBeenCalled();
  });
});
