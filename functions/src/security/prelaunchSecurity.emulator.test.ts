import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { createClaimGuestProfileHandler } from './claimGuestProfile';
import { admitRequest, requestPrincipalKey } from './requestAdmission';
import { createReportClientErrorsHandler } from './reportClientErrors';
import { isRetryableClosedFirestoreTransactionError } from '../canonical/transactions/firestoreTransactionExecutor';

const app = initializeApp({ projectId: 'demo-prelaunch-security' }, 'prelaunch-security');
let db: Firestore;
const getUser = vi.fn();
const identity = (uid = 'verified-user', email = 'guest@example.com', emailVerified = true) =>
  ({
    uid,
    email,
    emailVerified,
    disabled: false,
    tokensValidAfterTime: new Date(0).toUTCString(),
  }) as UserRecord;
const request = (uid = 'verified-user', email = 'guest@example.com', verified = true) =>
  ({
    auth: { uid, token: { email, email_verified: verified, auth_time: Date.now() / 1000 } },
    data: {},
    rawRequest: { headers: { 'x-forwarded-for': '203.0.113.10' } },
  }) as unknown as CallableRequest<Record<string, unknown>>;

describe('prelaunch server security', () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
    db = getFirestore(app);
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('users'));
    await db.recursiveDelete(db.collection('security_request_limits'));
    await db.recursiveDelete(db.collection('error_logs'));
    getUser.mockResolvedValue(identity());
    await db.doc('users/client_guest').set({
      email: 'guest@example.com',
      role: 'user',
      displayName: 'Guest',
      balanceUSD: 999,
      walletBalances: { USD: 999 },
      level: 4,
    });
  });
  afterAll(() => deleteApp(app));
  const claim = () => createClaimGuestProfileHandler(db, { getUser } as unknown as Auth);

  it('denies missing auth, unverified current identity, and stale verified tokens after email change', async () => {
    await expect(claim()({ ...request(), auth: undefined })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      claim()(request('verified-user', 'guest@example.com', false))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    getUser.mockResolvedValue(identity('verified-user', 'guest@example.com', false));
    await expect(claim()(request())).rejects.toMatchObject({ code: 'permission-denied' });
    getUser.mockResolvedValue(identity('verified-user', 'changed@example.com', true));
    await expect(claim()(request())).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db.doc('users/client_guest').get()).data()).not.toHaveProperty(
      'claimedByAccountId'
    );
  });

  it('claims exactly once under concurrent retries without copying money or privilege', async () => {
    const attempts = await Promise.allSettled([claim()(request()), claim()(request())]);
    expect(attempts.some((attempt) => attempt.status === 'fulfilled')).toBe(true);
    for (const attempt of attempts) {
      if (attempt.status === 'rejected') {
        // Existing emulator limitation: INVALID_ARGUMENT on an aborted transaction
        // is not automatically retried by the Admin SDK. Verify a fresh replay.
        expect(isRetryableClosedFirestoreTransactionError(attempt.reason)).toBe(true);
        await expect(claim()(request())).resolves.toEqual({ claimed: true });
      }
    }
    const account = (await db.doc('users/verified-user').get()).data()!;
    expect(account).toMatchObject({ uid: 'verified-user', role: 'user', displayName: 'Guest' });
    for (const field of ['balanceUSD', 'walletBalances', 'level', 'systemRole', 'instructorId'])
      expect(account).not.toHaveProperty(field);
    expect((await db.doc('users/client_guest').get()).data()?.claimedByAccountId).toBe(
      'verified-user'
    );
    await db.doc('users/verified-user').update({ displayName: 'Edited account' });
    await claim()(request());
    expect((await db.doc('users/verified-user').get()).data()?.displayName).toBe('Edited account');
    getUser.mockResolvedValue(identity('other-user'));
    await expect(claim()(request('other-user'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects ambiguous, privileged, disabled and test profiles', async () => {
    await db.doc('users/client_duplicate').set({ email: 'guest@example.com', role: 'user' });
    await expect(claim()(request())).rejects.toMatchObject({ code: 'failed-precondition' });
    await db.doc('users/client_duplicate').delete();
    await db.doc('users/another-account').set({ email: 'guest@example.com', role: 'user' });
    await expect(claim()(request())).rejects.toMatchObject({ code: 'failed-precondition' });
    await db.doc('users/another-account').delete();
    for (const patch of [
      { role: 'admin' },
      { role: 'user', systemRole: 'owner' },
      { systemRole: null, lifecycle: { status: 'disabled' } },
      { lifecycle: { status: 'active' }, dataScope: 'test' },
    ]) {
      await db.doc('users/client_guest').update(patch);
      await expect(claim()(request())).rejects.toMatchObject({ code: 'failed-precondition' });
    }
  });

  it('returns no match for a fresh identity and leaves existing accounts intact', async () => {
    getUser.mockResolvedValue(identity('fresh-user', 'fresh@example.com'));
    expect(await claim()(request('fresh-user', 'fresh@example.com'))).toEqual({ claimed: false });
    expect((await db.doc('users/fresh-user').get()).exists).toBe(false);
  });

  it('accepts only an initial name and never reapplies it to an existing account', async () => {
    await claim()({ ...request(), data: { displayName: 'Signup name', role: 'admin' } });
    expect((await db.doc('users/verified-user').get()).data()).toMatchObject({
      displayName: 'Signup name',
      role: 'user',
    });
    await claim()({ ...request(), data: { displayName: 'Overwrite attempt' } });
    expect((await db.doc('users/verified-user').get()).data()?.displayName).toBe('Signup name');
    getUser.mockResolvedValue({
      ...identity(),
      tokensValidAfterTime: new Date(Date.now() + 60_000).toUTCString(),
    });
    await expect(claim()(request())).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('limits concurrent attempts atomically, permits recovery and separates signed-in users sharing an IP', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => admitRequest(db, 'quota', 3, 1000))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(5);
    await expect(admitRequest(db, 'quota', 3, 61_000)).resolves.toBeUndefined();
    expect(requestPrincipalKey(request('a'), 'secret')).not.toBe(
      requestPrincipalKey(request('b'), 'secret')
    );
    expect(() =>
      requestPrincipalKey(
        {
          ...request(),
          auth: undefined,
          rawRequest: { headers: { 'x-forwarded-for': 'spoofed, 203.0.113.10' } },
        } as unknown as CallableRequest<unknown>,
        'secret'
      )
    ).toThrow();
  });

  it('supports anonymous Windows emulator named-pipe transport without relaxing deployed admission', () => {
    const anonymous = {
      ...request(),
      auth: undefined,
      rawRequest: { headers: {}, socket: {} },
    } as unknown as CallableRequest<unknown>;
    const previous = process.env.FUNCTIONS_EMULATOR;
    try {
      process.env.FUNCTIONS_EMULATOR = 'true';
      expect(requestPrincipalKey(anonymous, 'secret')).toBe(
        requestPrincipalKey(
          {
            ...anonymous,
            rawRequest: { headers: { 'x-forwarded-for': '127.0.0.1' } },
          } as unknown as CallableRequest<unknown>,
          'secret'
        )
      );
      process.env.FUNCTIONS_EMULATOR = 'false';
      expect(() => requestPrincipalKey(anonymous, 'secret')).toThrow();
    } finally {
      if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
      else process.env.FUNCTIONS_EMULATOR = previous;
    }
  });

  it('bounds and deduplicates telemetry without retaining raw personal data', async () => {
    const report = createReportClientErrorsHandler(db, 'secret');
    const req = {
      ...request(),
      data: {
        entries: [
          {
            id: 'same-error',
            message: 'email victim@example.com token=SECRET',
            stack: 'SECRET',
            userId: 'victim',
            userEmail: 'victim@example.com',
            url: 'https://example.com/?token=SECRET',
          },
        ],
      },
    };
    await report(req);
    await report(req);
    const logs = await db.collection('error_logs').get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].data().userId).toBe('verified-user');
    expect(JSON.stringify(logs.docs[0].data())).not.toContain('SECRET');
    expect(JSON.stringify(logs.docs[0].data())).not.toContain('victim@example.com');
    await expect(
      report({ ...request(), data: { entries: Array(11).fill({}) } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
