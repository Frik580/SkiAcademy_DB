import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { info } from 'firebase-functions/logger';
import { createRevokeOwnAdministratorSessionsHandler } from './administratorSession';

vi.mock('firebase-functions/logger', () => ({ info: vi.fn() }));

describe('revokeOwnAdministratorSessions', () => {
  const uid = 'administrator';
  const now = Math.floor(Date.now() / 1000);
  const earlier = new Date((now - 100) * 1000).toUTCString();
  const timestamp = { seconds: now - 200, nanoseconds: 0 };
  const profile = {
    accountId: uid,
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
  const auth = { getUser: vi.fn(), revokeRefreshTokens: vi.fn() };
  const updateAccount = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    auth.getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: earlier });
  });

  function invoke(
    account: Record<string, unknown>,
    authTime: number,
    expectedUid = uid,
    signInSecondFactor?: string
  ) {
    const firestore = {
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => account }) }) }),
      doc: () => ({ get: async () => ({ exists: false }) }),
      runTransaction: (run: (transaction: unknown) => unknown) =>
        run({ get: async () => ({ data: () => account }), update: updateAccount }),
    } as unknown as Firestore;
    const handler = createRevokeOwnAdministratorSessionsHandler(firestore, auth);
    return handler({
      auth: {
        uid,
        token: {
          uid,
          auth_time: authTime,
          iat: now,
          firebase: { sign_in_second_factor: signInSecondFactor },
        },
      },
      data: { expectedUid },
    } as Parameters<typeof handler>[0]);
  }

  it('requires a signed TOTP session claim when the server policy is enabled', async () => {
    const enforced = { ...profile, adminTotpRequired: true };
      auth.getUser.mockResolvedValue({
        tokensValidAfterTime: earlier,
        multiFactor: { enrolledFactors: [{ factorId: 'totp' }] },
      });
      await expect(invoke(enforced, now)).rejects.toMatchObject({
        details: { code: 'ADMIN_TOTP_REQUIRED' },
      });
      await expect(invoke(enforced, now, uid, 'phone')).rejects.toMatchObject({
        details: { code: 'ADMIN_TOTP_REQUIRED' },
      });
      expect(auth.getUser).not.toHaveBeenCalled();
      await expect(invoke(enforced, now, uid, 'totp')).resolves.toEqual({ revoked: true });
  });

  it('blocks a token at the shared Account cutoff before querying Firebase Auth', async () => {
    await expect(invoke({ ...profile, adminSessionsRevokedThrough: now }, now)).rejects.toMatchObject({
      details: { code: 'ADMIN_SESSION_INVALID' },
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('rejects a request confirmed for a different account', async () => {
    await expect(invoke(profile, now, 'another-account')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('revokes only the authenticated UID and records a correlated result', async () => {
    await expect(invoke(profile, now)).resolves.toEqual({ revoked: true });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledExactlyOnceWith(uid);
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(
      expect.any(Object),
      { adminSessionsRevokedThrough: expect.any(Number) }
    );
    expect(info).toHaveBeenCalledTimes(2);
    const first = vi.mocked(info).mock.calls[0][1];
    expect(first).toEqual({
      result: 'requested',
      correlationId: expect.any(String),
      accountReference: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(info).toHaveBeenLastCalledWith('Administrator session revocation', {
      ...first,
      result: 'revoked',
    });
  });

  it('does not treat token refresh as recent authentication', async () => {
    auth.getUser.mockResolvedValue({ disabled: false });
    await expect(invoke(profile, now - 601)).rejects.toMatchObject({
      details: { code: 'ADMIN_RECENT_AUTH_REQUIRED' },
    });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('rejects an already revoked token', async () => {
    await expect(invoke(profile, now - 101)).rejects.toMatchObject({
      details: { code: 'ADMIN_SESSION_INVALID' },
    });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('rejects a disabled Firebase Auth user', async () => {
    auth.getUser.mockResolvedValue({ disabled: true });
    await expect(invoke(profile, now)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('rejects demoted and disabled Accounts before Firebase Auth work', async () => {
    await expect(invoke({ ...profile, role: 'user' }, now)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(invoke({ ...profile, lifecycle: { status: 'disabled' } }, now)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it('records uncertainty when Firebase does not confirm revocation', async () => {
    auth.revokeRefreshTokens.mockRejectedValue(new Error('private error details'));
    await expect(invoke(profile, now)).rejects.toMatchObject({ code: 'unavailable' });
    expect(info).toHaveBeenLastCalledWith(
      'Administrator session revocation',
      expect.objectContaining({ result: 'unconfirmed' })
    );
    expect(JSON.stringify(vi.mocked(info).mock.calls)).not.toContain('private error details');
  });
});
