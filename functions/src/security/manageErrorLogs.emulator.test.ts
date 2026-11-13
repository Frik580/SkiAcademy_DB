import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { createClearErrorLogsHandler, createDeleteErrorLogHandler } from './manageErrorLogs';

const app = initializeApp({ projectId: 'demo-error-log-cleanup' }, 'error-log-cleanup');
let db: Firestore;
const request = (data: Record<string, unknown> = {}, uid = 'admin') =>
  ({ auth: { uid, token: {} }, data }) as CallableRequest<Record<string, unknown>>;

describe('administrator error log cleanup', () => {
  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required');
    db = getFirestore(app);
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('error_logs'));
    await db.doc('users/admin').set({ uid: 'admin', role: 'admin', email: 'admin@example.com' });
    await db.doc('users/user').set({ uid: 'user', role: 'user', email: 'user@example.com' });
  });
  afterAll(() => deleteApp(app));

  it('deletes by document ID even for old mismatched IDs without deleteAt; rejects missing IDs', async () => {
    await db.doc('error_logs/hashed-id').set({ id: 'original-id', timestamp: '2020-01-01' });
    const remove = createDeleteErrorLogHandler(db);
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
    const remove = createDeleteErrorLogHandler(db);
    const clear = createClearErrorLogsHandler(db, 'secret');
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

  it('preserves owner access and rejects malformed lifecycle state', async () => {
    await db.doc('users/owner').set({ role: 'user', systemRole: 'owner' });
    await db.doc('error_logs/old').set({ id: 'legacy' });
    await expect(createDeleteErrorLogHandler(db)(request({ id: 'old' }, 'owner'))).resolves.toEqual(
      { deleted: true }
    );
    await db.doc('users/owner').update({ lifecycle: {} });
    await expect(
      createClearErrorLogsHandler(db, 'secret')(request({}, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('users/owner').update({ lifecycle: null });
    await expect(
      createClearErrorLogsHandler(db, 'secret')(request({}, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      createDeleteErrorLogHandler(db)(request({ id: 'missing' }, 'owner'))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('clears more than a UI page, resumes after failure, retains new logs and other collections', async () => {
    const seed = db.batch();
    for (let i = 0; i < 425; i++)
      seed.set(db.doc(`error_logs/log-${String(i).padStart(4, '0')}`), { id: `old-${i}` });
    seed.set(db.doc('error_log_cleanup_sentinel/keep'), { value: 'unchanged' });
    await seed.commit();
    const clear = createClearErrorLogsHandler(db, 'secret');
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
    const clear = createClearErrorLogsHandler(db, 'secret');
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
