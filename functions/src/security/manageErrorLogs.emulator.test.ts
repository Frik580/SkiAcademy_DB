import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { createClearErrorLogsHandler, createDeleteErrorLogHandler } from './manageErrorLogs';

const app = initializeApp({ projectId: 'demo-error-log-cleanup' }, 'error-log-cleanup');
let db: Firestore;
const account = (uid: string, role = 'admin', extra: Record<string, unknown> = {}) => ({
  accountId: uid,
  role,
  dataScope: 'live',
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt: { seconds: 1, nanoseconds: 0 },
  updatedAt: { seconds: 1, nanoseconds: 0 },
  audit: { createdByCommandId: 'seed', lastChangedByCommandId: 'seed', correlationId: 'seed' },
  ...extra,
});
const checkSession = async () => {};
const request = (
  data: Record<string, unknown> = {},
  uid = 'admin',
  authTime = Math.floor(Date.now() / 1000)
) => ({ auth: { uid, token: { auth_time: authTime } }, data }) as CallableRequest<Record<string, unknown>>;

describe('administrator error log cleanup', () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
    db = getFirestore(app);
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('error_logs'));
    await db.recursiveDelete(db.collection('test_actors'));
    await db.doc('users/admin').set(account('admin'));
    await db.doc('users/user').set(account('user', 'user'));
  });
  afterAll(() => deleteApp(app));

  it('requires a fresh sign-in for every cleanup page and for individual deletion', async () => {
    const log = db.doc('error_logs/retained');
    await log.set({ timestamp: '2020-01-01' });
    const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
    const start = await clear(request());
    const oldAuthTime = Math.floor(Date.now() / 1000) - 601;
    const denied = { details: { code: 'ADMIN_RECENT_AUTH_REQUIRED' } };
    await expect(clear(request({ cursor: start.cursor }, 'admin', oldAuthTime))).rejects.toMatchObject(denied);
    await expect(
      createDeleteErrorLogHandler(db, checkSession)(request({ id: log.id }, 'admin', oldAuthTime))
    ).rejects.toMatchObject(denied);
    expect((await log.get()).exists).toBe(true);
  });

  it('deletes by document ID even for old mismatched IDs without deleteAt; rejects missing IDs', async () => {
    await db.doc('error_logs/hashed-id').set({ id: 'original-id', timestamp: '2020-01-01' });
    const remove = createDeleteErrorLogHandler(db, checkSession);
    await expect(remove(request({ id: 'original-id' }))).rejects.toMatchObject({
      code: 'not-found',
    });
    expect((await db.doc('error_logs/hashed-id').get()).exists).toBe(true);
    await expect(remove(request({ id: 'hashed-id' }))).resolves.toEqual({ deleted: true });
    await expect(remove(request({ id: 'hashed-id' }))).rejects.toMatchObject({ code: 'not-found' });
    await expect(remove(request({ id: '../users/admin' }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('denies anonymous, ordinary and disabled administrators; preserves other collections', async () => {
    await db.doc('error_logs/log').set({ id: 'log' });
    const remove = createDeleteErrorLogHandler(db, checkSession);
    const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
    for (const handler of [remove, clear]) {
      await expect(handler({ ...request({ id: 'log' }), auth: undefined })).rejects.toMatchObject({
        code: 'unauthenticated',
      });
      await expect(handler(request({ id: 'log' }, 'user'))).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
    await db.doc('users/admin').update({ lifecycle: { status: 'disabled' } });
    await expect(clear(request())).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await db.doc('error_logs/log').get()).exists).toBe(true);
    expect((await db.doc('users/user').get()).data()?.role).toBe('user');
  });

  it('requires admin role for owners and rejects malformed lifecycle state', async () => {
    await db.doc('users/owner').set(account('owner', 'user', { systemRole: 'owner' }));
    await expect(
      createDeleteErrorLogHandler(db, checkSession)(request({ id: 'old' }, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('users/owner').update({ role: 'admin' });
    await db.doc('error_logs/old').set({ id: 'legacy' });
    await expect(createDeleteErrorLogHandler(db, checkSession)(request({ id: 'old' }, 'owner'))).resolves.toEqual(
      { deleted: true }
    );
    await db.doc('users/owner').update({ lifecycle: {} });
    await expect(
      createClearErrorLogsHandler(db, 'secret', checkSession)(request({}, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('users/owner').update({ lifecycle: null });
    await expect(
      createClearErrorLogsHandler(db, 'secret', checkSession)(request({}, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      createDeleteErrorLogHandler(db, checkSession)(request({ id: 'missing' }, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it.each([
    ['TEST without registry', { dataScope: 'test' }, false],
    ['TEST with registry', { dataScope: 'test' }, true],
    ['session TEST without registry', { dataScope: 'test', testSessionId: 'session' }, false],
    ['LIVE with registry', { dataScope: 'live' }, true],
    ['LIVE with session', { dataScope: 'live', testSessionId: 'session' }, false],
    ['missing scope with session', { dataScope: undefined, testSessionId: 'session' }, false],
    ['null scope', { dataScope: null }, false],
    ['unknown scope', { dataScope: 'unknown' }, false],
    ['UID mismatch', { accountId: 'another-admin' }, false],
    [
      'disabled account',
      { lifecycle: { status: 'disabled', disabledAt: { seconds: 1, nanoseconds: 0 } } },
      false,
    ],
    ['malformed lifecycle', { lifecycle: {} }, false],
    ['missing revision', { revision: undefined }, false],
    ['malformed audit', { audit: {} }, false],
    ['unknown role', { role: 'owner', systemRole: 'owner' }, false],
  ])(
    'denies both handlers for %s, including forged scope and a valid LIVE cursor',
    async (_, extra, registered) => {
      await db.doc('error_logs/known-live-id').set({ dataScope: 'live' });
      const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
      const start = await clear(request());
      const profile: Record<string, unknown> = account('admin', 'admin', extra);
      for (const key of Object.keys(profile)) {
        if (profile[key] === undefined) delete profile[key];
      }
      await db.doc('users/admin').set(profile);
      // Even an invalid registry document must block LIVE administration.
      if (registered) await db.doc('test_actors/admin').set({});
      const forged = {
        id: 'known-live-id',
        dataScope: 'live',
        scope: 'live',
        accountId: 'other-live-admin',
        requestedTestSessionId: 'session',
      };
      await expect(createDeleteErrorLogHandler(db, checkSession)(request(forged))).rejects.toMatchObject({
        code: 'permission-denied',
      });
      await expect(clear(request(forged))).rejects.toMatchObject({ code: 'permission-denied' });
      await expect(clear(request({ ...forged, cursor: start.cursor }))).rejects.toMatchObject({
        code: 'permission-denied',
      });
      expect((await db.doc('error_logs/known-live-id').get()).exists).toBe(true);
    }
  );

  it('preserves legacy LIVE scope compatibility for canonical active admins', async () => {
    const profile: Record<string, unknown> = account('admin');
    delete profile.dataScope;
    await db.doc('users/admin').set(profile);
    await db.doc('error_logs/legacy').set({});
    await expect(createDeleteErrorLogHandler(db, checkSession)(request({ id: 'legacy' }))).resolves.toEqual({
      deleted: true,
    });
    await db.doc('error_logs/legacy').set({});
    const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
    const start = await clear(request());
    await expect(clear(request({ cursor: start.cursor }))).resolves.toMatchObject({
      deleted: 1,
      done: true,
    });
  });

  it('clears more than a UI page, resumes after failure, retains new logs and other collections', async () => {
    const seed = db.batch();
    for (let i = 0; i < 425; i++)
      seed.set(db.doc(`error_logs/log-${String(i).padStart(4, '0')}`), { id: `old-${i}` });
    seed.set(db.doc('error_log_cleanup_sentinel/keep'), { value: 'unchanged' });
    await seed.commit();
    const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
    const start = await clear(request());
    expect(start).toMatchObject({ done: false, deleted: 0 });
    // New IDs before/inside/after the traversed range must survive.
    for (const id of ['aaa-new', 'log-0200-new', 'zzz-new'])
      await db.doc(`error_logs/${id}`).set({ id });
    const first = await clear(request({ cursor: start.cursor }));
    expect(first).toMatchObject({ done: false, deleted: 199 });
    const fail = vi
      .spyOn(db, 'runTransaction')
      .mockRejectedValueOnce(new Error('injected commit failure'));
    await expect(clear(request({ cursor: first.cursor }))).rejects.toThrow(
      'injected commit failure'
    );
    fail.mockRestore();
    let result = first;
    let total = first.deleted;
    while (!result.done) {
      result = await clear(request({ cursor: result.cursor }));
      total += result.deleted;
    }
    expect(total).toBe(425);
    expect((await db.collection('error_logs').get()).docs.map((doc) => doc.id)).toEqual([
      'aaa-new',
      'log-0200-new',
      'zzz-new',
    ]);
    expect((await db.doc('error_log_cleanup_sentinel/keep').get()).data()).toEqual({
      value: 'unchanged',
    });
    await expect(clear(request({ cursor: `${first.cursor}tampered` }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('safely replays a page after a lost response and accepts an empty collection', async () => {
    const clear = createClearErrorLogsHandler(db, 'secret', checkSession);
    expect(await clear(request())).toEqual({ deleted: 0, done: true, cursor: null });
    await db.doc('error_logs/old').set({ id: 'old' });
    const start = await clear(request());
    await clear(request({ cursor: start.cursor }));
    await db.doc('error_logs/old').set({ id: 'new' });
    expect(await clear(request({ cursor: start.cursor }))).toMatchObject({
      deleted: 0,
      done: true,
    });
    expect((await db.doc('error_logs/old').get()).data()?.id).toBe('new');
  });
});
