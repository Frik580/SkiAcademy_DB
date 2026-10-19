import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { approveResetOperation } from '../../testSupport/resetAuthorization';

const require = createRequire(import.meta.url);
const { makePorts } = require('../../scripts/data-reset/cli.cjs');
const { hash } = require('../../scripts/data-reset/inventory.cjs');
const {
  buildManifest,
  executeReset,
  bootstrapEmptyAttendance,
} = require('../../scripts/data-reset/engine.cjs');
const { preflight, authorize, LOCK, TTL } = require('../../scripts/data-reset/authorization.cjs');
const target = { projectId: 'demo-ski-school-e2e', databaseId: '(default)', entrypoint: 'staging' };
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
);

describe.skipIf(!enabled)('transactional staging authorization rehearsal', () => {
  let ports: Awaited<ReturnType<typeof makePorts>>;
  beforeAll(async () => {
    ports = await makePorts(target);
  });
  beforeEach(async () => {
    for (const collection of await ports.db.listCollections())
      await ports.db.recursiveDelete(collection);
    for (const file of (
      await ports.storage.bucket.getFiles({ autoPaginate: false, maxResults: 100 })
    )[0])
      await file.delete();
    for (const user of (await ports.auth.listUsers(1000)).users)
      await ports.auth.deleteUser(user.uid);
    await ports.auth.createUser({ uid: 'owner', email: 'owner@example.test' });
    await ports.auth.setCustomUserClaims('owner', { role: 'admin' });
    await ports.db.doc('users/owner').set({
      accountId: 'owner',
      dataScope: 'test',
      testSessionId: 'session',
      role: 'admin',
      systemRole: 'owner',
      displayName: 'Preserved profile',
    });
    await ports.db.doc('participants/person').set({
      participantId: 'person',
      dataScope: 'test',
      testSessionId: 'session',
      name: 'Preserved person',
    });
    await ports.db
      .doc('participant_management/owner')
      .set({ accountId: 'owner', participantId: 'person', role: 'owner', status: 'active' });
    await ports.db.doc('test_sessions/session').set({ status: 'closed' });
    const batch = ports.db.batch();
    for (let i = 0; i < 130; i++)
      batch.set(ports.db.doc(`participant_progress/progress_${i}`), {
        dataScope: 'test',
        testSessionId: 'session',
        participantId: 'person',
        xp: i,
      });
    await batch.commit();
  });
  afterAll(async () => {
    await ports?.close();
  });
  async function preview() {
    const snapshot = await ports.scan();
    return buildManifest(snapshot, {
      target,
      mode: 'full-test-reset',
      selection: {
        accountIds: ['owner'],
        participantIds: ['person'],
        testSessionIds: ['session'],
        documents: snapshot.rows
          .filter((r: { path: string; hash: string }) => r.path.startsWith('participant_progress/'))
          .map((r: { path: string; hash: string }) => ({ path: r.path, sha256: r.hash })),
      },
    });
  }
  it('preflight is read-only, binds plan/operation and rejects missing owner confirmation', async () => {
    const manifest = await preview();
    expect(manifest.blockers).toEqual([]);
    const before = hash((await ports.scan()).rows);
    const evidence = await preflight(ports, manifest, manifest.sha256, 'reset');
    expect(evidence.changes.length).toBeGreaterThanOrEqual(130);
    expect(JSON.stringify(evidence)).not.toContain('owner@example.test');
    expect(hash((await ports.scan()).rows)).toBe(before);
    await expect(
      authorize(ports, manifest, manifest.sha256, 'reset', {
        input: { isTTY: false },
        output: { isTTY: true },
      })
    ).rejects.toThrow('terminal');
    await expect(approveResetOperation(ports, manifest, 'reset', 'yes')).rejects.toThrow(
      'exact owner'
    );
    expect((await ports.db.doc(LOCK).get()).exists).toBe(false);
  });
  it('rejects wrong hash/operation, tampering and bootstrap before completed reset', async () => {
    const manifest = await preview();
    await expect(preflight(ports, manifest, 'wrong', 'reset')).rejects.toThrow('hash');
    await expect(
      preflight(ports, { ...manifest, counts: {} }, manifest.sha256, 'reset')
    ).rejects.toThrow('hash');
    await expect(preflight(ports, manifest, manifest.sha256, 'other')).rejects.toThrow('operation');
    await expect(approveResetOperation(ports, manifest, 'bootstrap')).rejects.toThrow('verifier');
  });
  it('serializes parallel apply and requires new authorization for safe partial resume/bootstrap', async () => {
    const manifest = await preview();
    const original = await ports.scan();
    const first = await approveResetOperation(ports, manifest);
    await expect(approveResetOperation(ports, manifest)).rejects.toThrow('parallel');
    await expect(bootstrapEmptyAttendance(first.ports, manifest, manifest.sha256)).rejects.toThrow(
      'authorization'
    );
    try {
      await expect(
        executeReset(first.ports, manifest, manifest.sha256, {
          afterStep: () => {
            throw Error('lost response');
          },
        })
      ).rejects.toThrow('lost response');
      expect(
        (await ports.db.doc(`system_data_resets/${manifest.sha256}`).get()).get('appliedCount')
      ).toBe(100);
    } finally {
      await first.close();
    }
    await expect(executeReset(first.ports, manifest, manifest.sha256)).rejects.toThrow(
      'authorization'
    );
    await expect(approveResetOperation(ports, await preview())).rejects.toThrow(
      'unresolved manifest dependencies'
    );
    await expect(approveResetOperation(ports, manifest, 'bootstrap')).rejects.toThrow('verifier');
    const resumed = await approveResetOperation(ports, manifest);
    try {
      expect((await executeReset(resumed.ports, manifest, manifest.sha256)).status).toBe(
        'verified'
      );
    } finally {
      await resumed.close();
    }
    await expect(approveResetOperation(ports, manifest)).rejects.toThrow('already complete');
    await expect(approveResetOperation(ports, await preview())).rejects.toThrow('unfinished reset');
    const boot = await approveResetOperation(ports, manifest, 'bootstrap');
    try {
      expect(
        (await bootstrapEmptyAttendance(boot.ports, manifest, manifest.sha256)).candidateSource
      ).toBe('projection');
    } finally {
      await boot.close();
    }
    for (const row of original.rows.filter((r: { path: string; hash: string }) =>
      /^(users|participants|participant_management)\//.test(r.path)
    ))
      expect(hash((await ports.db.doc(row.path).get()).data())).toBe(row.hash);
    expect(hash((await ports.scan()).auth)).toBe(hash(original.auth));
    expect(
      (await ports.db.doc(LOCK).get())
        .get('history')
        .map((entry: { operation: string }) => entry.operation)
    ).toEqual(['reset', 'reset', 'bootstrap']);
  });
  it('does not run Attendance mutations when work appears during bootstrap verification', async () => {
    const manifest = await preview();
    const reset = await approveResetOperation(ports, manifest);
    try {
      await executeReset(reset.ports, manifest, manifest.sha256);
    } finally {
      await reset.close();
    }
    const boot = await approveResetOperation(ports, manifest, 'bootstrap');
    const readyModule = require('../../lib/canonical/bookings/bookingAttendanceOutcomeWorkSync.js');
    const sweepModule = require('../../lib/canonical/bookings/bookingAttendanceOutcomeSweep.js');
    const sweep = vi.spyOn(sweepModule, 'sweepLessonBookingAttendanceOutcomes');
    vi.spyOn(readyModule, 'isLessonBookingAttendanceOutcomeWorkMigrationReady').mockImplementation(
      async () => {
        await ports.db.doc('booking_attendance_outcome_work/intruder').set({ status: 'pending' });
        return true;
      }
    );
    try {
      await expect(bootstrapEmptyAttendance(boot.ports, manifest, manifest.sha256)).rejects.toThrow(
        'drift'
      );
      expect(sweep).not.toHaveBeenCalled();
      expect((await ports.db.collection('attendance').get()).empty).toBe(true);
      expect(
        (await ports.db.doc(`system_data_resets/${manifest.sha256}`).get()).get('status')
      ).toBe('verified');
    } finally {
      vi.restoreAllMocks();
      await boot.close();
    }
  });
  it('expires approval and fences a stale process after lease replacement', async () => {
    const manifest = await preview();
    const session = await approveResetOperation(ports, manifest);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + TTL + 1);
    try {
      await expect(executeReset(session.ports, manifest, manifest.sha256)).rejects.toThrow(
        'expired'
      );
    } finally {
      vi.restoreAllMocks();
    }
    await ports.db.doc(LOCK).update({ sessionId: 'replacement' });
    await expect(executeReset(session.ports, manifest, manifest.sha256)).rejects.toThrow(
      'replaced'
    );
    await session.close();
    expect((await ports.db.doc(LOCK).get()).get('sessionId')).toBe('replacement');
  });
  it.each(['same-content-rewrite', 'new-dependency', 'profile-drift'])(
    'stops on %s during partial reset',
    async (kind) => {
      const manifest = await preview();
      const session = await approveResetOperation(ports, manifest);
      try {
        await expect(
          executeReset(session.ports, manifest, manifest.sha256, {
            afterStep: () => {
              throw Error('stop');
            },
          })
        ).rejects.toThrow('stop');
      } finally {
        await session.close();
      }
      if (kind === 'new-dependency')
        await ports.db.doc('bookings/intruder').set({ participantId: 'person' });
      else {
        const ref = ports.db.doc('participants/person');
        const original = (await ref.get()).data();
        if (kind === 'same-content-rewrite') await ref.update({ name: 'temporary change' });
        await ref.set({
          ...original,
          ...(kind === 'profile-drift' ? { name: 'changed' } : {}),
        });
      }
      await expect(approveResetOperation(ports, manifest)).rejects.toThrow('drift');
    }
  );
});
