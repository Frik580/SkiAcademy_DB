import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  AccountSchema,
  WalletSchema,
  ParticipantSchema,
  accountCommandActor,
  timestampFromDate,
  AccountIdSchema,
  BookingIdSchema,
  ParticipantIdSchema,
  InstructorIdSchema,
  CorrelationIdSchema,
  TestSessionIdSchema,
  TestSessionSchema,
  testCanonicalExecutionScope,
  canonicalTimestampToEpochMs,
} from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { createFirestoreCanonicalTransactionExecutor } from '../canonical/transactions/firestoreTransactionExecutor';
import { reconcileLessonBookingAttendanceOutcomeWork } from '../canonical/bookings/bookingAttendanceOutcomeWorkSync';
import { sweepLessonBookingAttendanceOutcomes } from '../canonical/bookings/bookingAttendanceOutcomeSweep';
import { seedLessonPricingSettingsFixture } from '../../testSupport/lessonPricingSettingsFixture';
import { canonicalCourseDeliveryFixtures } from '@ski-academy/shared-domain/testing';
import { queryLessonBookingReadModels } from '../canonical/readModels/lessonBookingReadModels';
import { syncInstructorLessonRevenue } from '../canonical/readModels/instructorLessonRevenueProjection';
import { revenueBooking, revenuePayment } from '../../../tests/helpers/instructorRevenueFixtures';

const require = createRequire(import.meta.url);
const { makePorts, parseArguments } = require('../../scripts/data-reset/cli.cjs');
const {
  buildManifest,
  executeReset,
  bootstrapEmptyAttendance,
  MARKER,
} = require('../../scripts/data-reset/engine.cjs');
const { hash } = require('../../scripts/data-reset/inventory.cjs');
const { category, exactPath, assertLocalMutation } = require('../../scripts/data-reset/policy.cjs');
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST
);
const target = { projectId: 'demo-ski-school-e2e', databaseId: '(default)', entrypoint: 'staging' };
const sessionId = TestSessionIdSchema.parse('test_session_reset');
const scope = testCanonicalExecutionScope(sessionId);
const accountId = AccountIdSchema.parse('account_reset_one');
const otherId = AccountIdSchema.parse('account_reset_two');
const participantId = ParticipantIdSchema.parse('participant_reset_one');
const instructorId = InstructorIdSchema.parse('instructor_reset');
const at = timestampFromDate(new Date('2026-01-01T00:00:00Z'));
const correlationId = CorrelationIdSchema.parse('correlation_reset_test');
const audit = {
  createdByCommandId: 'command_reset_seed',
  lastChangedByCommandId: 'command_reset_seed',
  correlationId,
};
const root = resolve(__dirname, '../../..');

describe.skipIf(!enabled)('business reset hermetic emulator rehearsal', () => {
  let ports: Awaited<ReturnType<typeof makePorts>>;
  beforeAll(async () => {
    ports = await makePorts(target);
  });
  beforeEach(async () => {
    // Test-only fixture teardown, guarded before any destructive setup.
    assertLocalMutation(target, ports.identity);
    for (const file of (
      await ports.storage.bucket.getFiles({ autoPaginate: false, maxResults: 100 })
    )[0])
      await file.delete();
    for (const collection of await ports.db.listCollections())
      await ports.db.recursiveDelete(collection);
    for (const id of [accountId, otherId]) {
      await ports.auth.deleteUser(id).catch((e: { code: string }) => {
        if (e.code !== 'auth/user-not-found') throw e;
      });
    }
    await seed();
  });
  afterAll(async () => {
    await ports?.close();
  });

  async function seed() {
    await ports.auth.createUser({
      uid: accountId,
      email: 'reset-one@example.test',
      password: 'reset-test-password',
      emailVerified: true,
    });
    await ports.auth.setCustomUserClaims(accountId, { role: 'admin', instructorId });
    await ports.db.doc(`users/${accountId}`).set({
      ...AccountSchema.parse({
        accountId,
        ...scope,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      }),
      uid: accountId,
      email: 'reset-one@example.test',
      role: 'admin',
      systemRole: 'owner',
      instructorId,
      displayName: 'Retained identity',
      avatarUrl: 'persistent-avatar',
      balanceUSD: 999,
      walletBalances: { KZT: 1000 },
      level: 5,
      skillScores: { turn: 12 },
      participantTodayChecklists: {
        [participantId]: {
          customTodayTasks: [{ id: 'manual', text: 'Keep task' }],
          completedTodayTaskIds: ['manual'],
          completedTodayDate: '2026-01-01',
        },
      },
    });
    await ports.db.doc(`users/${accountId}/wallet/state`).set(
      WalletSchema.parse({
        accountId,
        ...scope,
        currency: 'KZT',
        balance: 1000,
        revision: 1,
        eventRevision: 1,
        createdAt: at,
        updatedAt: at,
      })
    );
    await ports.db.doc(`participants/${participantId}`).set(
      ParticipantSchema.parse({
        participantId,
        ...scope,
        displayName: 'Retained Participant',
        age: { kind: 'age_years', years: 25 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: 'management_reset' },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      })
    );
    await ports.db.doc('participant_management/management_reset').set({
      participantManagementId: 'management_reset',
      participantId,
      accountId,
      role: 'owner',
      authority: 'self',
      status: 'active',
      revision: 1,
      createdAt: at,
      updatedAt: at,
      audit,
    });
    await ports.db.doc(`instructors/${instructorId}`).set({
      id: instructorId,
      ...scope,
      name: 'Preserved coach',
      pricePerHourKZT: 12000,
      isAvailable: true,
    });
    await ports.db.doc('settings/school').set({ currency: 'KZT', timezone: 'Asia/Almaty' });
    await ports.db.doc('settings/lesson_levels').set({ levels: [] });
    await ports.db.doc('courses/course_config').set({
      title: 'Keep catalog and schedule',
      capacity: { totalSeats: 10, availableSeats: 10 },
    });
    await ports.db.doc('courses/course_config/days/day_one').set({ instructorId, startsAt: at });
    await ports.db.doc(`test_sessions/${sessionId}`).set(
      TestSessionSchema.parse({
        testSessionId: sessionId,
        schemaVersion: 1,
        status: 'closed',
        label: 'Reset emulator rehearsal',
        createdByAccountId: accountId,
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 0,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        audit,
      })
    );
    await seedLessonPricingSettingsFixture(ports.db, { decidedAt: at, correlationId });
    const data: Record<string, object> = {
      'bookings/booking_old': {
        accountId,
        participantIds: [participantId],
        paymentId: 'payment_old',
      },
      'bookings/booking_old/messages/message_old': { text: 'Disposable chat' },
      'attendance/attendance_old': { bookingId: 'booking_old', participantId },
      'payments/payment_old': { payerAccountId: accountId, subjectId: 'booking_old', price: 500 },
      'monetary_events/event_old': {
        walletAccountId: accountId,
        walletBalanceDelta: 1000,
        currency: 'KZT',
      },
      'booking_attendance_outcome_work/booking_old': {
        bookingId: 'booking_old',
        status: 'pending',
      },
      'command_idempotency/command_old': { result: { bookingId: 'booking_old' } },
      'domain_outbox/outbox_old': { bookingId: 'booking_old' },
      'notifications/notification_old': { recipientAccountId: accountId },
      'admin_issues/issue_old': { bookingId: 'booking_old' },
      'participant_progress/participant_reset_one': { participantId, xp: 100 },
      'participant_achievements/participant_reset_one': { participantId, achievements: ['first'] },
    };
    for (const [path, value] of Object.entries(data))
      await ports.db.doc(path).set({ ...scope, ...value });
  }

  async function preview(mode = 'full-test-reset', extraAccounts: string[] = []) {
    const snapshot = await ports.scan();
    const selection = {
      accountIds: [accountId, ...extraAccounts],
      participantIds: [participantId],
      testSessionIds: [sessionId],
      storageObjects: snapshot.storage.objects.filter((o: { name: string }) =>
        o.name.startsWith(`test-sessions/${sessionId}/booking-chat/`)
      ),
      documents: snapshot.rows
        .filter((r: { path: string }) => category(r.path, mode) === 'delete')
        .map((r: { path: string; hash: string }) => ({ path: r.path, sha256: r.hash })),
    };
    return buildManifest(snapshot, { target, mode, selection });
  }

  async function login() {
    const response = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'reset-one@example.test',
          password: 'reset-test-password',
          returnSecureToken: true,
        }),
      }
    );
    expect(response.ok).toBe(true);
    expect((await response.json()).localId).toBe(accountId);
  }

  it('full reset preserves credentials, roles, profiles, config and zeros wallet with no orphan references', async () => {
    await login();
    const identity = (await ports.db.doc(`participants/${participantId}`).get()).data();
    const manifest = await preview();
    expect(manifest.blockers).toEqual([]);
    expect(manifest.counts.delete).toBe(12);
    expect((await executeReset(ports, manifest, manifest.sha256)).status).toBe('verified');
    await login();
    const user = (await ports.db.doc(`users/${accountId}`).get()).data();
    expect(user).toMatchObject({
      uid: accountId,
      email: 'reset-one@example.test',
      role: 'admin',
      systemRole: 'owner',
      instructorId,
      displayName: 'Retained identity',
      avatarUrl: 'persistent-avatar',
    });
    expect(user.balanceUSD).toBeUndefined();
    expect(user.level).toBeUndefined();
    expect(user.participantTodayChecklists[participantId]).toEqual({
      customTodayTasks: [{ id: 'manual', text: 'Keep task' }],
    });
    expect((await ports.db.doc(`participants/${participantId}`).get()).data()).toEqual(identity);
    const wallet = WalletSchema.parse(
      (await ports.db.doc(`users/${accountId}/wallet/state`).get()).data()
    );
    expect(wallet).toMatchObject({ balance: 0, eventRevision: 0, currency: 'KZT', revision: 2 });
    expect((await ports.db.collection('monetary_events').count().get()).data().count).toBe(0);
    expect((await ports.db.doc('courses/course_config/days/day_one').get()).exists).toBe(true);
    expect((await ports.auth.getUser(accountId)).customClaims).toEqual({
      role: 'admin',
      instructorId,
    });
  });

  it('activity-reset preserves XP/progress and manual profile/checklist settings', async () => {
    const manifest = await preview('activity-reset');
    expect(manifest.blockers).toEqual([]);
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.doc(`participant_progress/${participantId}`).get()).get('xp')).toBe(100);
    expect((await ports.db.doc(`users/${accountId}`).get()).get('level')).toBe(5);
    await expect(bootstrapEmptyAttendance(ports, manifest, manifest.sha256)).rejects.toThrow(
      'full-test-reset'
    );
  });

  async function seedCourse(start = '2099-02-01T04:00:00Z') {
    const fixture = canonicalCourseDeliveryFixtures;
    const course = {
      ...fixture.course,
      ...scope,
      startAt: timestampFromDate(new Date(start)),
      capacity: { totalSeats: 8, availableSeats: 7 },
      scheduleProjection: {
        ...fixture.course.scheduleProjection,
        finalCourseDayEndsAt: timestampFromDate(new Date('2099-02-03T04:00:00Z')),
      },
    };
    await ports.db.doc(`courses/${course.courseId}`).set(course);
    await ports.db.doc(`course_enrollments/${fixture.confirmedEnrollment.enrollmentId}`).set({
      ...fixture.confirmedEnrollment,
      ...scope,
      participantId,
      payerAccountId: accountId,
      attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    });
    return course;
  }

  it('rebuilds pre-start capacity, preserves catalog, blocks frozen capacity, and resumes a failed rebuild', async () => {
    const course = await seedCourse();
    const manifest = await preview();
    expect(manifest.blockers).toEqual([]);
    await expect(
      executeReset(ports, manifest, manifest.sha256, {
        beforeStep: (action: { phase: number }) => {
          if (action.phase === 2) throw Error('capacity rebuild failure');
        },
      })
    ).rejects.toThrow('rebuild failure');
    expect(
      (await ports.db.doc(`courses/${course.courseId}`).get()).get('capacity.availableSeats')
    ).toBe(7);
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.doc(`courses/${course.courseId}`).get()).data()).toMatchObject({
      title: course.title,
      price: course.price,
      capacity: { totalSeats: 8, availableSeats: 8 },
    });
    await seedCourse('2020-01-01T00:00:00Z');
    expect((await preview()).blockers.join()).toContain('frozen capacity');
  });

  it('rebuilds shared instructor revenue and invalidates all admin revisions', async () => {
    const id = 'booking_old';
    const original = revenueBooking(id);
    const booking = revenueBooking(id, {
      ...scope,
      payerAccountId: accountId,
      party: { kind: 'individual', participantIds: [participantId] },
      occurrence: {
        ...original.occurrence,
        serviceParty: { participantIds: [participantId], frozenAt: original.updatedAt },
      },
      attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId } },
    });
    await ports.db.doc(`bookings/${id}`).set({
      ...booking,
      occurrence: {
        ...booking.occurrence,
        serviceParty: { participantIds: [participantId], frozenAt: booking.updatedAt },
      },
    });
    await ports.db
      .doc(`payments/payment_${id}`)
      .set(revenuePayment(id, { ...scope, payerAccountId: accountId }));
    await syncInstructorLessonRevenue(ports.db, id);
    const path = `instructor_lesson_revenue/test_${sessionId}/instructors/revenue_instructor`;
    expect((await ports.db.doc(path).get()).get('retainedAmount')).toBe(10000);
    const manifest = await preview();
    expect(manifest.blockers).toEqual([]);
    await expect(
      executeReset(ports, manifest, manifest.sha256, {
        beforeStep: (action: { phase: number }) => {
          if (action.phase === 3) throw Error('revenue rebuild failure');
        },
      })
    ).rejects.toThrow('rebuild failure');
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.doc(path).get()).get('retainedAmount')).toBe(0);
    expect((await ports.db.collection('admin_runtime').get()).size).toBe(7);
    for (const view of ['account_hot', 'instructor_hot', 'admin_hot'] as const) {
      const response = await queryLessonBookingReadModels(
        ports.db,
        { scope: view, pageSize: 10 },
        {
          accountId,
          instructorId,
          administratorActor: { accountId, role: 'administrator' } as never,
          readScope: scope,
        }
      );
      expect(response.items).toEqual([]);
    }
  });

  it('rechecks Course freeze at runtime and on resume, not only at preview', async () => {
    const course = await seedCourse();
    const manifest = await preview();
    const time = vi.spyOn(Date, 'now');
    try {
      await expect(
        executeReset(ports, manifest, manifest.sha256, {
          afterStep: () => {
            time.mockReturnValue(course.startAt.seconds * 1000);
          },
        })
      ).rejects.toThrow('frozen during apply/resume');
      await expect(executeReset(ports, manifest, manifest.sha256)).rejects.toThrow(
        'frozen during apply/resume'
      );
    } finally {
      time.mockRestore();
    }
    await executeReset(ports, manifest, manifest.sha256);
  });

  it('deletes only reviewed booking media; resumes after delete before checkpoint; preserves avatars and course assets', async () => {
    const name = `test-sessions/${sessionId}/booking-chat/booking_old/image.jpg`;
    await ports.storage.bucket.file(name).save('disposable image');
    await ports.storage.bucket.file(`test-actors/${accountId}/avatar`).save('persistent avatar');
    await ports.storage.bucket.file('courses/course_config.webp').save('persistent catalog');
    await ports.db
      .doc('bookings/booking_old/messages/message_old')
      .update({ attachmentUrl: `gs://${ports.storage.bucket.name}/${name}` });
    const manifest = await preview();
    expect(manifest.blockers).toEqual([]);
    await expect(
      executeReset(ports, manifest, manifest.sha256, {
        afterStorageDelete: () => {
          throw Error('lost Storage delete response');
        },
      })
    ).rejects.toThrow('lost Storage');
    expect((await ports.storage.bucket.file(name).exists())[0]).toBe(false);
    await executeReset(ports, manifest, manifest.sha256);
    expect(
      (await ports.storage.bucket.getFiles())[0].map((f: { name: string }) => f.name).sort()
    ).toEqual(['courses/course_config.webp', `test-actors/${accountId}/avatar`].sort());
    await executeReset(ports, manifest, manifest.sha256);
  });

  it('blocks Storage drift, shared media references and Storage unavailability', async () => {
    const name = `test-sessions/${sessionId}/booking-chat/booking_old/image.jpg`;
    await ports.storage.bucket.file(name).save('original');
    let manifest = await preview();
    await ports.storage.bucket.file(name).save('changed');
    await expect(executeReset(ports, manifest, manifest.sha256)).rejects.toThrow('stale');
    await ports.db
      .doc('settings/shared_media')
      .set({ url: `gs://${ports.storage.bucket.name}/${name}` });
    manifest = await preview();
    expect(manifest.blockers.join()).toContain('Retained Storage reference');
    await expect(
      executeReset(
        {
          ...ports,
          scan: async () => {
            throw Error('Storage unavailable');
          },
        },
        await preview('activity-reset'),
        'wrong'
      )
    ).rejects.toThrow('hash');
    await ports.db.doc('settings/shared_media').delete();
    manifest = await preview();
    await expect(
      executeReset(
        {
          ...ports,
          scan: async () => {
            throw Error('Storage unavailable');
          },
        },
        manifest,
        manifest.sha256
      )
    ).rejects.toThrow('Storage unavailable');
    expect((await ports.db.doc('bookings/booking_old').get()).exists).toBe(true);
  });

  it('supports only the known scoped KZT legacy ledger and refuses unknown schema/adapter versions', async () => {
    const path = 'wallet_ledger/ledger_old';
    await ports.db.doc(path).set({
      ...scope,
      id: 'ledger_old',
      userId: accountId,
      amount: 1000,
      balanceAfter: 1000,
      currency: 'KZT',
      type: 'top_up',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const snapshot = await ports.scan();
    const base = await preview();
    const manifest = buildManifest(snapshot, {
      ...base,
      selection: {
        ...base.selection,
        documents: [
          ...base.selection.documents,
          { path, sha256: snapshot.rows.find((r: { path: string }) => r.path === path).hash },
        ],
      },
    });
    expect(manifest.blockers).toEqual([]);
    const changed = { ...manifest, adapters: {} };
    delete changed.sha256;
    changed.sha256 = hash(changed);
    await expect(executeReset(ports, changed, changed.sha256)).rejects.toThrow('hash');
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.doc(path).get()).exists).toBe(false);
    await ports.db.doc(path).set({ userId: accountId, amount: 10, currency: 'USD' });
    expect((await preview()).blockers.join()).toContain('Unclassified dependency');
  });

  it('supports multiple selected test accounts without touching their identity', async () => {
    await ports.auth.createUser({
      uid: otherId,
      email: 'reset-two@example.test',
      password: 'second-test-password',
    });
    await ports.db.doc(`users/${otherId}`).set({ accountId: otherId, ...scope, role: 'user' });
    await ports.db.doc(`users/${otherId}/wallet/state`).set(
      WalletSchema.parse({
        accountId: otherId,
        ...scope,
        currency: 'KZT',
        balance: 500,
        revision: 1,
        eventRevision: 1,
        createdAt: at,
        updatedAt: at,
      })
    );
    await ports.db
      .doc('monetary_events/event_two')
      .set({ ...scope, walletAccountId: otherId, walletBalanceDelta: 500 });
    const manifest = await preview('full-test-reset', [otherId]);
    expect(manifest.blockers).toEqual([]);
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.doc(`users/${otherId}/wallet/state`).get()).get('balance')).toBe(0);
    expect((await ports.auth.getUser(otherId)).email).toBe('reset-two@example.test');
  });

  it('atomically resumes after committed deletion/lost response; repeats are harmless', async () => {
    const manifest = await preview();
    await expect(
      executeReset(ports, manifest, manifest.sha256, {
        afterStep: (count: number) => {
          if (count === 3) throw Error('simulated lost response');
        },
      })
    ).rejects.toThrow('lost response');
    expect(
      (await ports.db.doc(`system_data_resets/${manifest.sha256}`).get()).get('appliedCount')
    ).toBe(3);
    await executeReset(ports, manifest, manifest.sha256);
    const snapshot = await ports.scan();
    await executeReset(ports, manifest, manifest.sha256);
    expect(hash((await ports.scan()).rows)).toBe(hash(snapshot.rows));
    const next = await preview();
    expect(next.blockers).toEqual([]);
    expect(next.actions).toEqual([]);
    await executeReset(ports, next, next.sha256);
  });

  it('blocks an unselected inherited child and LIVE profile mutations; preserves global marker in subset reset', async () => {
    const first = await preview();
    await ports.db
      .doc('bookings/booking_old/messages/unscoped_child')
      .set({ text: 'No explicit booking reference' });
    const omitted = buildManifest(await ports.scan(), first);
    expect(omitted.blockers.join()).toContain('Unselected descendant');
    await ports.db.doc('bookings/booking_old/messages/unscoped_child').delete();
    await ports.db.doc(`users/${accountId}`).update({ dataScope: 'live' });
    const live = await preview();
    expect(live.blockers.join()).toContain('Unproven TEST Account');
    expect(live.actions.some((a: { path: string }) => a.path === `users/${accountId}`)).toBe(false);
    await ports.db.doc(`users/${accountId}`).update({ ...scope });
    await ports.db.doc(MARKER).set({ status: 'ready' });
    await ports.db.doc('bookings/other_booking').set(revenueBooking('other_booking'));
    await ports.db.doc('payments/payment_other_booking').set(revenuePayment('other_booking'));
    const snapshot = await ports.scan();
    const subset = buildManifest(snapshot, { ...first, selection: first.selection });
    expect(subset.actions.some((a: { path: string }) => a.path === MARKER)).toBe(false);
    expect(subset.blockers).toEqual([]);
    await executeReset(ports, subset, subset.sha256);
    expect((await ports.db.doc(MARKER).get()).get('status')).toBe('ready');
    await expect(bootstrapEmptyAttendance(ports, subset, subset.sha256)).rejects.toThrow(
      'not empty'
    );
  });

  it.each(['target', 'identity', 'auth', 'new-record'])(
    'blocks %s drift before any deletion',
    async (kind) => {
      const manifest = await preview();
      if (kind === 'target') await ports.db.doc('bookings/booking_old').update({ changed: true });
      if (kind === 'identity') await ports.db.doc(`users/${accountId}`).update({ role: 'user' });
      if (kind === 'auth')
        await ports.auth.updateUser(accountId, { email: 'changed@example.test' });
      if (kind === 'new-record') await ports.db.doc('payments/payment_race').set(scope);
      await expect(executeReset(ports, manifest, manifest.sha256)).rejects.toThrow('stale');
      expect((await ports.db.doc('bookings/booking_old').get()).exists).toBe(true);
    }
  );

  it('blocks unlisted nested records, LIVE scope, foreign owners, and shared capacity', async () => {
    await ports.db.doc('bookings/booking_old/unknown/deep').set(scope);
    expect((await preview()).blockers.join()).toContain('Unclassified');
    await ports.db.doc('bookings/booking_old/unknown/deep').delete();
    await ports.db.doc('payments/payment_old').update({ dataScope: 'live' });
    expect((await preview()).blockers.join()).toContain('scope not authorized');
    await ports.db
      .doc('payments/payment_old')
      .update({ ...scope, payerAccountId: 'real_customer' });
    expect((await preview()).blockers.join()).toContain('Foreign payerAccountId');
    await ports.db
      .doc('course_enrollments/enrollment_old')
      .set({ ...scope, participantId, courseId: 'course_config' });
    expect((await preview()).blockers.join()).toContain('capacity rebuild');
  });

  it('finds orphan subcollections below missing parents and rejects incomplete manifests', async () => {
    await ports.db.doc('bookings/missing/messages/orphan').set({ text: 'must not be hidden' });
    const snapshot = await ports.scan();
    expect(snapshot.ghosts).toContain('bookings/missing');
    expect(
      snapshot.rows.some((r: { path: string }) => r.path === 'bookings/missing/messages/orphan')
    ).toBe(true);
    expect((await preview()).blockers.join()).toContain('scope not authorized');
    const manifest = await preview();
    await expect(executeReset(ports, manifest, manifest.sha256)).rejects.toThrow('unresolved');
    expect(() => exactPath('bookings/*')).toThrow('wildcard');
  });

  it('rejects tampered manifests, missing confirmation, writer activity, expired manifests and resume drift', async () => {
    const manifest = await preview();
    await expect(
      executeReset(ports, { ...manifest, actions: [] }, manifest.sha256)
    ).rejects.toThrow('hash');
    await expect(executeReset(ports, manifest, 'yes')).rejects.toThrow('hash');
    await expect(
      executeReset(
        {
          ...ports,
          assertIsolated: async () => {
            throw Error('writers active');
          },
        },
        manifest,
        manifest.sha256
      )
    ).rejects.toThrow('writers active');
    const { sha256: ignored, ...body } = manifest;
    void ignored;
    const expired = { ...body, expiresAt: '2020-01-01T00:00:00Z' };
    await expect(
      executeReset(ports, { ...expired, sha256: hash(expired) }, hash(expired))
    ).rejects.toThrow('expired');
    await expect(
      executeReset(ports, manifest, manifest.sha256, {
        afterStep: () => {
          throw Error('stop');
        },
      })
    ).rejects.toThrow('stop');
    await ports.db.doc('bookings/booking_intruder').set(scope);
    await expect(executeReset(ports, manifest, manifest.sha256)).rejects.toThrow('drift');
  });

  it('real CLI defaults to read-only, requires project/database and rejects all production apply', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'carve-reset-'));
    const scopeFile = resolve(dir, 'scope.json');
    const manifestFile = resolve(dir, 'manifest.json');
    const manifest = await preview();
    writeFileSync(scopeFile, JSON.stringify(manifest.selection));
    const before = hash((await ports.scan()).rows);
    execFileSync(
      process.execPath,
      [
        resolve(root, 'functions/scripts/resetStagingBusinessData.cjs'),
        '--project',
        target.projectId,
        '--database',
        '(default)',
        '--mode',
        'full-test-reset',
        '--scope',
        scopeFile,
        '--out',
        manifestFile,
      ],
      { cwd: root, windowsHide: true }
    );
    expect(JSON.parse(readFileSync(manifestFile, 'utf8')).counts.delete).toBe(12);
    expect(hash((await ports.scan()).rows)).toBe(before);
    expect(() => parseArguments(['--project', target.projectId], 'staging')).toThrow('database');
    for (const entrypoint of ['Staging', 'Production']) {
      const result = spawnSync(
        process.execPath,
        [
          resolve(root, `functions/scripts/reset${entrypoint}BusinessData.cjs`),
          '--project',
          entrypoint === 'Staging' ? 'ski-school-staging' : 'ski-school-8f3ca',
          '--database',
          '(default)',
          '--apply',
          '--manifest',
          manifestFile,
          '--confirm',
          manifest.sha256,
        ],
        {
          cwd: root,
          windowsHide: true,
          env: {
            ...process.env,
            FIRESTORE_EMULATOR_HOST: '',
            FIREBASE_AUTH_EMULATOR_HOST: '',
            FIREBASE_STORAGE_EMULATOR_HOST: '',
            STORAGE_EMULATOR_HOST: '',
          },
          encoding: 'utf8',
        }
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('cloud mutations disabled');
    }
  });

  it('bootstraps only an empty full reset and runs new Booking and full Attendance through projection', async () => {
    const manifest = await preview();
    await expect(bootstrapEmptyAttendance(ports, manifest, manifest.sha256)).rejects.toThrow(
      'verifier'
    );
    await executeReset(ports, manifest, manifest.sha256);
    expect(await bootstrapEmptyAttendance(ports, manifest, manifest.sha256)).toMatchObject({
      candidateSource: 'projection',
    });
    expect((await ports.db.doc(MARKER).get()).get('status')).toBe('ready');
    await bootstrapEmptyAttendance(ports, manifest, manifest.sha256);
    // Reopen only the test fixture AFTER the empty bootstrap, as the operator
    // would do before smoke traffic. Production workers require an active session.
    await ports.db.doc(`test_sessions/${sessionId}`).update({ status: 'active' });
    const executor = createFirestoreCanonicalTransactionExecutor(ports.db);
    const commands = (date: string) =>
      createProductionCanonicalCommands(
        { scope, clock: createAuthoritativeCommandClock(new Date(date)) },
        executor
      );
    const context = (key: string) => ({
      actor: accountCommandActor(accountId),
      exercisedCapability: 'administrator' as const,
      idempotencyKey: key,
      correlationId,
      source: 'admin_callable' as const,
    });
    const fund = await commands('2026-01-01T00:00:00Z').execute({
      kind: 'record_manual_wallet_funding',
      context: context('new-funding'),
      intent: { accountId, amount: 25000, reasonExplanation: 'Fresh rehearsal funding' },
    });
    expect(fund.status).toBe('success');
    const bookingId = BookingIdSchema.parse('booking_reset_new');
    const create = await commands('2026-01-01T00:00:00Z').execute({
      kind: 'create_confirmed_booking',
      context: {
        ...context('new-booking'),
        exercisedCapability: 'account_owner',
        source: 'client_callable',
        calendarInput: { localDate: '2026-01-15', localTime: '09:00', durationMinutes: 60 },
        timezone: 'Asia/Almaty',
      },
      intent: { bookingId, instructorId, participantIds: [participantId] },
    });
    expect(create.status).toBe('success');
    const booking = (await ports.db.doc(`bookings/${bookingId}`).get()).data();
    const during = new Date(
      canonicalTimestampToEpochMs(booking.occurrence.interval.startsAt) + 30 * 60000
    );
    const record = await commands(during.toISOString()).execute({
      kind: 'record_booking_attendance',
      context: { ...context('new-attendance'), expectedRevision: 1 },
      intent: {
        bookingId,
        participantId,
        attendanceStatus: 'present',
        reasonExplanation: 'Fresh rehearsal Attendance',
      },
    });
    expect(record.status).toBe('success');
    const after = new Date(canonicalTimestampToEpochMs(booking.occurrence.interval.endsAt) + 1);
    await reconcileLessonBookingAttendanceOutcomeWork(ports.db, bookingId, after);
    const result = await sweepLessonBookingAttendanceOutcomes(ports.db, { now: after });
    expect(result.candidateSource).toBe('projection');
    expect(result.resolved).toBeGreaterThan(0);
    expect((await ports.db.doc(`bookings/${bookingId}`).get()).get('lifecycle.status')).toBe(
      'completed'
    );
    expect((await ports.db.collection('attendance').get()).docs[0].get('attendanceStatus')).toBe(
      'present'
    );
    await expect(bootstrapEmptyAttendance(ports, manifest, manifest.sha256)).rejects.toThrow(
      'drift'
    );
  });
});
