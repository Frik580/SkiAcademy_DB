import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  InstructorIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  accountCommandActor,
  timestampFromDate,
  canonicalTimestampToEpochMs,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  DomainOutboxObligationSchema,
  activityLogIdFromCommandId,
  domainOutboxIdFromCommand,
} from '@ski-academy/shared-domain';
import { canonicalCourseDeliveryFixtures as fixture } from '@ski-academy/shared-domain/testing';
import type { Firestore } from 'firebase-admin/firestore';
import {
  liveAccounts,
  livePerson,
  liveCoach,
  liveFixtureData,
} from '../../testSupport/dataResetLiveFixture';
import { seedLessonPricingSettingsFixture } from '../../testSupport/lessonPricingSettingsFixture';
import { createProductionCanonicalCommands } from '../canonical/commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../canonical/transactions/firestoreTransactionExecutor';
import { createAuthoritativeCommandClock } from '../canonical/commands/commandClock';
import { reconcileLessonBookingAttendanceOutcomeWork } from '../canonical/bookings/bookingAttendanceOutcomeWorkSync';
import { sweepLessonBookingAttendanceOutcomes } from '../canonical/bookings/bookingAttendanceOutcomeSweep';
import { syncCourseEnrollmentOutcomeWorkForEnrollmentWrite } from '../canonical/courses/courseEnrollmentOutcomeWorkSync';
import {
  syncInstructorLessonRevenue,
  syncInstructorLessonRevenuePayment,
} from '../canonical/readModels/instructorLessonRevenueProjection';
import { syncGuestConfirmationWrite } from '../canonical/guestConfirmation/guestConfirmationWork';
import { deliverCreatedDomainOutbox } from '../canonical/auditOutbox/firestoreOutboxDeliveryStore';
import { approveResetOperation } from '../../testSupport/resetAuthorization';

const require = createRequire(import.meta.url);
const { makePorts, parseArguments } = require('../../scripts/data-reset/cli.cjs');
const {
  buildManifest,
  executeReset,
  bootstrapEmptyAttendance,
  MARKER,
} = require('../../scripts/data-reset/engine.cjs');
const { fixtureOwnership, CONTRACT } = require('../../scripts/data-reset/stagingFixtures.cjs');
const {
  createRecoveryExport,
  restoreEmulatorDocuments,
} = require('../../scripts/data-reset/recovery.cjs');
const { assertLocalMutation } = require('../../scripts/data-reset/policy.cjs');
const { hash } = require('../../scripts/data-reset/inventory.cjs');
const enabled = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST &&
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
);
const target = { projectId: 'demo-ski-school-e2e', databaseId: '(default)', entrypoint: 'staging' };
const owner = AccountIdSchema.parse(liveAccounts[0]),
  person = ParticipantIdSchema.parse(livePerson),
  coach = InstructorIdSchema.parse(liveCoach),
  correlationId = CorrelationIdSchema.parse('live_reset_rehearsal');
const at = timestampFromDate(new Date('2026-01-01T00:00:00Z'));
const oldOutboxCommand = 'live_old_delivery';
const oldOutboxId = domainOutboxIdFromCommand(oldOutboxCommand, 0);
describe.skipIf(!enabled)('LIVE fixtures hermetic staging rehearsal', () => {
  let ports: Awaited<ReturnType<typeof makePorts>>;
  beforeAll(async () => {
    ports = await makePorts(target);
  });
  beforeEach(async () => {
    assertLocalMutation(target, ports.identity);
    for (const collection of await ports.db.listCollections())
      await ports.db.recursiveDelete(collection);
    for (const file of (
      await ports.storage.bucket.getFiles({ autoPaginate: false, maxResults: 100 })
    )[0])
      await file.delete();
    for (const user of (await ports.auth.listUsers(1000)).users)
      await ports.auth.deleteUser(user.uid);
    const data = liveFixtureData();
    data[`domain_outbox/${oldOutboxId}`] = DomainOutboxObligationSchema.parse({
      schemaVersion: 'outbox:v1',
      dataScope: 'live',
      outboxId: oldOutboxId,
      commandId: oldOutboxCommand,
      activityLogId: activityLogIdFromCommandId(oldOutboxCommand),
      deliveryEffectOrdinal: 0,
      recipient: { kind: 'account', id: owner },
      channel: 'in_app',
      templateId: 'booking_confirmed',
      templateVersion: 'v1',
      renderInputs: { bookingId: 'live_old' },
      deliverySemantics: 'transactional',
      createdAt: at,
      delivery: { status: 'delivered', deliveredAt: at, attemptCount: 1 },
    });
    for (const id of liveAccounts) {
      await ports.auth.createUser({
        uid: id,
        email: `${id}@example.test`,
        password: 'retained-live-test-password',
      });
      await ports.auth.setCustomUserClaims(id, {
        role: id === 'live_admin' ? 'admin' : 'user',
        fixture: true,
      });
      data[`users/${id}/wallet/state`] = {
        ...data[`users/${id}/wallet/state`],
        balance: 250,
        eventRevision: 1,
      };
      data[`monetary_events/starter_${id}`] = {
        dataScope: 'live',
        eventId: `starter_${id}`,
        eventKind: 'wallet_credit',
        currency: 'KZT',
        walletAccountId: id,
        walletBalanceDelta: 250,
        sourceKind: 'system',
        actor: { kind: 'account', accountId: id },
        commandId: `starter_${id}`,
        correlationId: 'starter_fixture',
        walletEventRevision: 1,
        occurredAt: at,
        recordedAt: at,
      };
    }
    for (const [path, value] of Object.entries(data)) await ports.db.doc(path).set(value);
    await seedLessonPricingSettingsFixture(ports.db, { decidedAt: at, correlationId });
    await syncInstructorLessonRevenue(ports.db, 'live_old');
  });
  afterAll(async () => {
    await ports?.close();
  });
  async function preview() {
    const snapshot = await ports.scan();
    const selection = {
      contract: CONTRACT,
      accountIds: liveAccounts,
      participantIds: [livePerson],
      testSessionIds: [],
      storageObjects: [],
      documents: snapshot.rows
        .filter((r: { path: string }) => /^(bookings|course_enrollments)\/[^/]+$/.test(r.path))
        .map((r: { path: string; hash: string }) => ({ path: r.path, sha256: r.hash })),
    };
    const proof = fixtureOwnership(snapshot, selection, target);
    selection.documents = snapshot.rows
      .filter((r: { path: string }) => proof.eligible.has(r.path))
      .map((r: { path: string; hash: string }) => ({ path: r.path, sha256: r.hash }));
    return {
      snapshot,
      manifest: buildManifest(snapshot, { target, mode: 'full-test-reset', selection }),
    };
  }
  const context = (key: string) => ({
    actor: accountCommandActor(owner),
    exercisedCapability: 'administrator' as const,
    idempotencyKey: key,
    correlationId,
    source: 'admin_callable' as const,
  });
  function commands(date: string) {
    return createProductionCanonicalCommands(
      {
        scope: LIVE_CANONICAL_EXECUTION_SCOPE,
        clock: createAuthoritativeCommandClock(new Date(date)),
      },
      createFirestoreCanonicalTransactionExecutor(ports.db)
    );
  }
  it.each([false, true])(
    'preserves all five sign-ins and profiles across failure/resume, bootstraps empty, suppresses duplicate credit and runs new LIVE Booking/Attendance (authorization=%s)',
    async (authorized) => {
      const { snapshot, manifest } = await preview();
      expect(manifest.blockers).toEqual([]);
      const runReset = async (options = {}) => {
        if (!authorized) return executeReset(ports, manifest, manifest.sha256, options);
        const session = await approveResetOperation(ports, manifest);
        try {
          return await executeReset(session.ports, manifest, manifest.sha256, options);
        } finally {
          await session.close();
        }
      };
      const ownDeleteEvent = async (count: number) => {
        const action = manifest.actions[count - 1];
        if (action.kind !== 'delete') return;
        const previous = snapshot.rows.find((r: { path: string }) => r.path === action.path)?.data;
        if (action.path === 'bookings/live_old') {
          await syncInstructorLessonRevenue(ports.db, 'live_old');
          await reconcileLessonBookingAttendanceOutcomeWork(ports.db, 'live_old', new Date());
          await syncGuestConfirmationWrite(
            ports.db,
            'bookings',
            'live_old',
            { ...previous, attribution: { bookingOrigin: 'guest' } },
            undefined
          );
        }
        if (action.path === 'payments/payment_live_old')
          await syncInstructorLessonRevenuePayment(ports.db, previous, undefined);
      };
      await expect(
        runReset({
          afterStep: async (count: number) => {
            await ownDeleteEvent(count);
            if (count === 2 || authorized) throw Error('interruption');
          },
        })
      ).rejects.toThrow('interruption');
      const resumed = await runReset({
        afterStep: ownDeleteEvent,
      }).catch(async (error: unknown) => {
        const current = await ports.scan();
        const expected = new Map(
          manifest.inventory.map((r: { path: string; sha256: string }) => [r.path, r.sha256])
        );
        for (const action of manifest.actions) {
          if (action.afterHash === null) expected.delete(action.path);
          else expected.set(action.path, action.afterHash);
        }
        const actual = new Map(
          current.rows
            .filter((r: { path: string }) => !r.path.startsWith('system_data_resets/'))
            .map((r: { path: string; hash: string }) => [r.path, r.hash])
        );
        throw Error(
          `${String(error)}; changed=${[...new Set([...expected.keys(), ...actual.keys()])].filter((path) => expected.get(path) !== actual.get(path)).join(',')}`
        );
      });
      expect(resumed.status).toBe('verified');
      if (authorized) await expect(runReset()).rejects.toThrow('already complete');
      else expect((await executeReset(ports, manifest, manifest.sha256)).status).toBe('verified');
      for (const id of liveAccounts) {
        expect((await ports.db.doc(`users/${id}`).get()).data()).toEqual(
          snapshot.rows.find((r: { path: string }) => r.path === `users/${id}`).data
        );
        expect((await ports.db.doc(`users/${id}/wallet/state`).get()).data()).toMatchObject({
          balance: 0,
          eventRevision: 0,
          currency: 'KZT',
        });
        expect(
          (await ports.db.doc(`users/${id}/wallet/starter_credit_grant`).get()).get('granted')
        ).toBe(true);
        const login = await fetch(
          `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: `${id}@example.test`,
              password: 'retained-live-test-password',
              returnSecureToken: true,
            }),
          }
        );
        expect(login.ok).toBe(true);
        expect((await login.json()).localId).toBe(id);
      }
      expect(hash((await ports.scan()).auth)).toBe(hash(manifest.auth));
      const bootstrapSession = authorized
        ? await approveResetOperation(ports, manifest, 'bootstrap')
        : undefined;
      let bootstrapResult;
      try {
        bootstrapResult = await bootstrapEmptyAttendance(
          bootstrapSession?.ports ?? ports,
          manifest,
          manifest.sha256
        );
      } finally {
        await bootstrapSession?.close();
      }
      expect(bootstrapResult).toMatchObject({
        candidateSource: 'projection',
      });
      expect((await ports.db.doc(MARKER).get()).data()).toMatchObject({
        status: 'ready',
        verifiedBookings: 0,
        verifiedWorks: 0,
      });
      const oldBooking = snapshot.rows.find(
        (r: { path: string }) => r.path === 'bookings/live_old'
      ).data;
      const oldPayment = snapshot.rows.find(
        (r: { path: string }) => r.path === 'payments/payment_live_old'
      ).data;
      for (let i = 0; i < 2; i++) {
        await reconcileLessonBookingAttendanceOutcomeWork(ports.db, 'live_old', new Date());
        await syncInstructorLessonRevenue(ports.db, 'live_old');
        await syncInstructorLessonRevenuePayment(ports.db, oldPayment, oldPayment);
        await syncGuestConfirmationWrite(ports.db, 'bookings', 'live_old', oldBooking, oldBooking);
        await deliverCreatedDomainOutbox(ports.db, oldOutboxId);
      }
      for (const c of [
        'bookings',
        'booking_attendance_outcome_work',
        'attendance',
        'guest_confirmation_reconciliation_work',
        'instructor_lesson_revenue_contributions',
        'notifications',
        'domain_outbox',
      ])
        expect((await ports.db.collection(c).count().get()).data().count).toBe(0);
      for (const [index, id] of liveAccounts.entries()) {
        const result = await commands('2026-01-01T00:00:00Z').execute({
          kind: 'grant_starter_credit',
          context: {
            ...context(`reinit-${index}`),
            actor: accountCommandActor(AccountIdSchema.parse(id)),
            exercisedCapability: 'account_owner',
            source: 'client_callable',
          },
          intent: {},
        });
        expect(result.status).toBe('success');
        expect((await ports.db.doc(`users/${id}/wallet/state`).get()).get('balance')).toBe(0);
      }
      expect((await ports.db.collection('monetary_events').count().get()).data().count).toBe(0);
      const funded = await commands('2026-01-01T00:00:00Z').execute({
        kind: 'record_manual_wallet_funding',
        context: context('fresh-fund'),
        intent: { accountId: owner, amount: 25000, reasonExplanation: 'New test epoch' },
      });
      expect(funded).toMatchObject({ status: 'success' });
      const bookingId = BookingIdSchema.parse('live_fresh');
      const created = await commands('2026-01-01T00:00:00Z').execute({
        kind: 'create_confirmed_booking',
        context: {
          ...context('fresh-booking'),
          exercisedCapability: 'account_owner',
          source: 'client_callable',
          calendarInput: { localDate: '2026-01-15', localTime: '09:00', durationMinutes: 60 },
          timezone: 'Asia/Almaty',
        },
        intent: { bookingId, instructorId: coach, participantIds: [person] },
      });
      expect(created.status, JSON.stringify(created)).toBe('success');
      const booking = (await ports.db.doc(`bookings/${bookingId}`).get()).data();
      await reconcileLessonBookingAttendanceOutcomeWork(
        ports.db,
        bookingId,
        new Date('2026-01-01T00:00:00Z')
      );
      expect(
        (await ports.db.doc(`booking_attendance_outcome_work/${bookingId}`).get()).exists
      ).toBe(true);
      const during = new Date(
        canonicalTimestampToEpochMs(booking.occurrence.interval.startsAt) + 30 * 60000
      );
      expect(
        (
          await commands(during.toISOString()).execute({
            kind: 'record_booking_attendance',
            context: { ...context('fresh-attendance'), expectedRevision: 1 },
            intent: {
              bookingId,
              participantId: person,
              attendanceStatus: 'present',
              reasonExplanation: 'Fresh factual Attendance',
            },
          })
        ).status
      ).toBe('success');
      const after = new Date(canonicalTimestampToEpochMs(booking.occurrence.interval.endsAt) + 1);
      await reconcileLessonBookingAttendanceOutcomeWork(ports.db, bookingId, after);
      const swept = await sweepLessonBookingAttendanceOutcomes(ports.db, { now: after });
      expect(swept.candidateSource, JSON.stringify(swept)).toBe('projection');
      expect(swept.resolved, JSON.stringify(swept)).toBeGreaterThan(0);
      expect((await ports.db.doc(`bookings/${bookingId}`).get()).get('lifecycle.status')).toBe(
        'completed'
      );
    }
  );
  async function courseSeed() {
    const course = {
      ...fixture.course,
      dataScope: 'live',
      startAt: timestampFromDate(new Date('2099-02-01T00:00:00Z')),
      capacity: { totalSeats: 20, availableSeats: 2 },
    };
    await ports.db.doc(`courses/${course.courseId}`).set(course);
    for (const day of fixture.courseDays)
      await ports.db
        .doc(`courses/${course.courseId}/days/${day.courseDayId}`)
        .set({ ...day, dataScope: 'live' });
    const enrollments = [];
    for (let i = 0; i < 18; i++) {
      const enrollment = {
        ...fixture.confirmedEnrollment,
        dataScope: 'live',
        enrollmentId: `live_enrollment_${i}`,
        participantId: person,
        payerAccountId: owner,
        attribution: { bookingOrigin: 'account', bookedBy: { kind: 'account', accountId: owner } },
      };
      enrollments.push(enrollment);
      await ports.db.doc(`course_enrollments/${enrollment.enrollmentId}`).set(enrollment);
    }
    return { course, enrollments };
  }
  it('resets 18 pre-start Enrollment and capacity; deletion and reordered old Enrollment events cannot recreate work', async () => {
    const { course, enrollments } = await courseSeed();
    const { manifest } = await preview();
    expect(manifest.blockers).toEqual([]);
    await executeReset(ports, manifest, manifest.sha256);
    expect((await ports.db.collection('course_enrollments').count().get()).data().count).toBe(0);
    expect((await ports.db.doc(`courses/${course.courseId}`).get()).get('capacity')).toEqual({
      totalSeats: 20,
      availableSeats: 20,
    });
    for (const old of enrollments)
      expect(
        await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(ports.db, {
          rawEnrollmentId: old.enrollmentId,
          afterData: old,
        })
      ).toBe('not_applicable');
    expect(
      (await ports.db.collection('course_enrollment_outcome_work').count().get()).data().count
    ).toBe(0);
    const enrollment = enrollments[0];
    // Prove the pending-work branch is valid before injecting the deletion race.
    await ports.db.doc(`courses/${course.courseId}`).set({ ...fixture.course, dataScope: 'live' });
    await ports.db.doc(`course_enrollments/${enrollment.enrollmentId}`).set(enrollment);
    expect(
      await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(ports.db, {
        rawEnrollmentId: enrollment.enrollmentId,
        afterData: enrollment,
      })
    ).toBe('pending_created');
    await ports.db.doc(`course_enrollment_outcome_work/${enrollment.enrollmentId}`).delete();
    const racing = {
      collection: ports.db.collection.bind(ports.db),
      runTransaction: async (callback: Parameters<Firestore['runTransaction']>[0]) => {
        await ports.db.doc(`course_enrollments/${enrollment.enrollmentId}`).delete();
        return ports.db.runTransaction(callback);
      },
    } as Firestore;
    expect(
      await syncCourseEnrollmentOutcomeWorkForEnrollmentWrite(racing, {
        rawEnrollmentId: enrollment.enrollmentId,
        afterData: enrollment,
      })
    ).toBe('unchanged');
    expect(
      (await ports.db.collection('course_enrollment_outcome_work').count().get()).data().count
    ).toBe(0);
  });
  it('blocks frozen courses and production, and restores exact critical documents on emulator without Auth writes', async () => {
    const { course } = await courseSeed();
    await ports.db.doc(`courses/${course.courseId}`).update({ startAt: at });
    expect((await preview()).manifest.blockers.join()).toContain('frozen capacity');
    expect(() =>
      parseArguments(
        [
          '--project',
          'ski-school-8f3ca',
          '--database',
          '(default)',
          '--apply',
          '--manifest',
          'none',
          '--confirm',
          'none',
        ],
        'production'
      )
    ).toThrow('BLOCKED');
    const before = await ports.scan(),
      archive = createRecoveryExport(before, target);
    const paths = [
      `users/${owner}`,
      `participants/${person}`,
      `users/${owner}/wallet/state`,
      `users/${owner}/wallet/starter_credit_grant`,
      `monetary_events/starter_${owner}`,
    ];
    for (const path of paths) await ports.db.doc(path).delete();
    const authHash = hash((await ports.scan()).auth);
    expect(await restoreEmulatorDocuments(ports, archive, paths)).toEqual({
      restoredOrIdentical: 5,
      authWrites: 0,
    });
    for (const path of paths)
      expect(hash((await ports.db.doc(path).get()).data())).toBe(
        before.rows.find((r: { path: string }) => r.path === path).hash
      );
    expect(hash((await ports.scan()).auth)).toBe(authHash);
    await restoreEmulatorDocuments(ports, archive, paths);
    await ports.db.doc(`users/${owner}`).update({ role: 'changed' });
    await expect(restoreEmulatorDocuments(ports, archive, paths)).rejects.toThrow(
      'overwrite changed'
    );
    await expect(
      restoreEmulatorDocuments(
        {
          ...ports,
          target: {
            projectId: 'ski-school-8f3ca',
            databaseId: '(default)',
            entrypoint: 'production',
          },
        },
        archive,
        paths
      )
    ).rejects.toThrow('cloud mutations');
  });
});
