import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { canonicalBookingCollaborationFixtures } from '@ski-academy/shared-domain/testing';
import {
  AttendanceSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  type Booking,
} from '@ski-academy/shared-domain';
import {
  backfillLessonBookingAttendanceOutcomeWork,
  markLessonBookingAttendanceOutcomeWorkMigrationReady,
  BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH,
} from './bookingAttendanceOutcomeWorkSync';
import { pendingBookingAttendanceOutcomeWork } from './bookingAttendanceOutcomeWork';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
describe.skipIf(!enabled)('Attendance migration cutover guard', () => {
  const app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'attendance-migration-guard');
  const db = getFirestore(app);
  const now = new Date('2026-02-15T00:00:00Z');
  const fixture = canonicalBookingCollaborationFixtures.individualBooking;
  const workPath = `booking_attendance_outcome_work/${fixture.bookingId}`;
  beforeAll(() => {
    if (!enabled) throw Error('Emulator required');
  });
  beforeEach(async () => {
    for (const collection of [
      'bookings',
      'booking_attendance_outcome_work',
      'attendance',
      'system_migrations',
      'command_idempotency',
    ])
      await db.recursiveDelete(db.collection(collection));
  });
  afterAll(async () => {
    await db.terminate();
    await deleteApp(app);
  });
  const seed = async (booking: Booking = fixture) =>
    db.doc(`bookings/${booking.bookingId}`).set(booking);
  const backfill = () => backfillLessonBookingAttendanceOutcomeWork(db, { now, maxBookings: 100 });
  const notReady = async () =>
    expect((await db.doc(BOOKING_ATTENDANCE_OUTCOME_WORK_MIGRATION_PATH).get()).exists).toBe(false);

  it('repeats backfill and cutover without changing domain documents', async () => {
    await seed();
    const first = await backfill();
    await markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, first);
    const before = (await db.doc(workPath).get()).data();
    const repeat = await backfill();
    expect(repeat.outcomes.unchanged).toBe(1);
    await markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, repeat);
    expect((await db.doc(workPath).get()).data()).toEqual(before);
    expect((await db.doc(`bookings/${fixture.bookingId}`).get()).data()).toEqual(fixture);
  });

  it('includes malformed bookings without bookingId and preserves their historical work', async () => {
    await db.doc('bookings/booking_invalid').set({ revision: 1 });
    await db.doc('booking_attendance_outcome_work/booking_invalid').set({ historical: true });
    const result = await backfill();
    expect(result.scannedBookings).toBe(1);
    expect(result.outcomes.blocked).toBe(1);
    expect((await db.doc('booking_attendance_outcome_work/booking_invalid').get()).data()).toEqual({
      historical: true,
    });
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, result)
    ).rejects.toThrow('blocked');
    await notReady();
  });

  it('rejects partial evidence, absent evidence, and changed coverage', async () => {
    await seed();
    const result = await backfill();
    await expect(markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now)).rejects.toThrow(
      'blocked'
    );
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, { ...result, truncated: true })
    ).rejects.toThrow('blocked');
    await seed({ ...fixture, bookingId: 'booking_added' } as Booking);
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, result)
    ).rejects.toThrow('coverage');
    await notReady();
  });

  it.each(['missing', 'orphan', 'blocked', 'schedule', 'scope', 'deadline'])(
    'rejects unproven %s work',
    async (kind) => {
      await seed();
      const result = await backfill();
      if (kind === 'missing') await db.doc(workPath).delete();
      if (kind === 'orphan')
        await db.doc('booking_attendance_outcome_work/booking_orphan').set({ historical: true });
      if (kind === 'blocked')
        await db
          .doc(workPath)
          .set({ status: 'blocked', blockedReason: 'invalid_work' }, { merge: true });
      if (kind === 'schedule') await db.doc(workPath).update({ sourceScheduleRevision: 2 });
      if (kind === 'scope')
        await db.doc(workPath).update({ dataScope: 'test', testSessionId: 'test_session_guard' });
      if (kind === 'deadline')
        await db.doc(workPath).update({ completedReason: 'deadline_processed' });
      await expect(
        markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, result)
      ).rejects.toThrow();
      await notReady();
    }
  );

  it('rejects overdue pending work even when backfill reports unchanged', async () => {
    await seed();
    await db.doc(workPath).set(
      pendingBookingAttendanceOutcomeWork(fixture, {
        deadlineId: 'instructor_window',
        workRevision: 3,
        updatedAt: fixture.updatedAt,
      })
    );
    // Inside the legacy window, this remains actionable; the guard must not certify it.
    const at = new Date((fixture.occurrence.interval.endsAt.seconds + 90000) * 1000);
    const result = await backfillLessonBookingAttendanceOutcomeWork(db, { now: at });
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, at, result)
    ).rejects.toThrow('pending');
    await notReady();
  });

  it('retires same-revision terminal work only after all frozen Attendance exists', async () => {
    const terminal = {
      ...fixture,
      lifecycle: { status: 'completed', completedAt: fixture.updatedAt },
    } as Booking;
    await seed(terminal);
    await db.doc(workPath).set(
      pendingBookingAttendanceOutcomeWork(terminal, {
        deadlineId: 'instructor_window',
        workRevision: 3,
        updatedAt: fixture.updatedAt,
      })
    );
    const missing = await backfill();
    expect(missing.outcomes.unchanged).toBe(1);
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, missing)
    ).rejects.toThrow('pending');
    for (const participantId of terminal.occurrence.serviceParty.participantIds) {
      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: terminal.occurrence.occurrenceId,
        participantId,
      });
      await db.doc(`attendance/${attendanceId}`).set(
        AttendanceSchema.parse({
          attendanceId,
          subject: {
            subjectKind: 'booking',
            bookingId: terminal.bookingId,
            occurrenceId: terminal.occurrence.occurrenceId,
            participantId,
          },
          attendanceStatus: 'present',
          recordedBy: { kind: 'instructor', instructorId: terminal.occurrence.instructorId },
          recordedAt: terminal.updatedAt,
          lastChangedBy: { kind: 'instructor', instructorId: terminal.occurrence.instructorId },
          updatedAt: terminal.updatedAt,
          revision: 1,
          correlationId: terminal.audit.correlationId,
        })
      );
    }
    const facts = (await db.collection('attendance').get()).docs.map((d) => d.data());
    const repaired = await backfill();
    expect(repaired.outcomes.updated).toBe(1);
    expect((await db.doc(workPath).get()).data()).toMatchObject({
      status: 'complete',
      completedReason: 'lifecycle_ineligible',
      workRevision: 4,
    });
    const fact = facts[0]!;
    const factRef = db.doc(`attendance/${fact.attendanceId as string}`);
    await factRef.update({ 'subject.participantId': 'participant_wrong_identity' });
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, repaired)
    ).rejects.toThrow(/missing Attendance|identity/);
    await notReady();
    await factRef.set(fact);
    await markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, repaired);
    expect((await backfill()).outcomes.unchanged).toBe(1);
    expect((await db.doc(`bookings/${fixture.bookingId}`).get()).data()).toEqual(terminal);
    expect((await db.collection('attendance').get()).docs.map((d) => d.data())).toEqual(facts);
  });

  it('fails closed when the verification bound is exceeded', async () => {
    const batch = db.batch();
    for (let i = 0; i < 500; i++) batch.set(db.doc(`bookings/booking_bound_${i}`), { revision: 1 });
    await batch.commit();
    const second = db.batch();
    for (let i = 500; i < 1000; i++)
      second.set(db.doc(`bookings/booking_bound_${i}`), { revision: 1 });
    await second.commit();
    await db.doc('bookings/booking_bound_1000').set({ revision: 1 });
    await expect(
      markLessonBookingAttendanceOutcomeWorkMigrationReady(db, now, {
        scannedBookings: 1001,
        outcomes: { created: 0, updated: 0, unchanged: 1001, deleted: 0, blocked: 0 },
        truncated: false,
      })
    ).rejects.toThrow('truncated');
    await notReady();
  });

  it.each(['skipped_outcome', 'delayed_deadline'])(
    'rejects future instructor work with %s',
    async (kind) => {
      await seed();
      const work = pendingBookingAttendanceOutcomeWork(fixture, {
        deadlineId: 'instructor_window',
        workRevision: 3,
        updatedAt: fixture.updatedAt,
      });
      if (kind === 'delayed_deadline') work.dueAt.seconds += 3600;
      await db.doc(workPath).set(work);
      const at = new Date((fixture.occurrence.interval.endsAt.seconds + 3600) * 1000);
      const result = await backfillLessonBookingAttendanceOutcomeWork(db, { now: at });
      await expect(
        markLessonBookingAttendanceOutcomeWorkMigrationReady(db, at, result)
      ).rejects.toThrow(kind === 'skipped_outcome' ? 'unproven outcome' : 'pending');
      await notReady();
    }
  );

  it('runs the actual CLI twice and requires explicit cutover', async () => {
    await seed();
    const cli = resolve(__dirname, '../../../scripts/backfillBookingAttendanceOutcomeWork.cjs');
    const run = (...flags: string[]) =>
      execFileSync(
        process.execPath,
        [
          cli,
          '--project',
          'demo-ski-school-e2e',
          '--page-size',
          '1',
          '--now',
          now.toISOString(),
          ...flags,
        ],
        { encoding: 'utf8', env: process.env }
      );
    expect(run()).toContain('"scannedBookings":1');
    expect(run('--apply')).toContain('"migrationReady":false');
    await notReady();
    const work = (await db.doc(workPath).get()).data();
    expect(run('--apply', '--cutover')).toContain('"migrationReady":true');
    expect(run('--apply', '--cutover')).toContain('"migrationReady":true');
    expect((await db.doc(workPath).get()).data()).toEqual(work);
  }, 30000);

  it.each(['implicit_cutover', 'blocked_booking', 'unresolved_work'])(
    'actual CLI refuses %s without writing ready',
    async (scenario) => {
      const cli = resolve(__dirname, '../../../scripts/backfillBookingAttendanceOutcomeWork.cjs');
      let at = now;
      if (scenario === 'blocked_booking') {
        await db.doc('bookings/booking_invalid').set({ revision: 1 });
        await db.doc('booking_attendance_outcome_work/booking_invalid').set({ historical: true });
      }
      if (scenario === 'unresolved_work') {
        await seed();
        await db.doc(workPath).set(
          pendingBookingAttendanceOutcomeWork(fixture, {
            deadlineId: 'instructor_window',
            workRevision: 3,
            updatedAt: fixture.updatedAt,
          })
        );
        at = new Date((fixture.occurrence.interval.endsAt.seconds + 90000) * 1000);
      }
      const result = spawnSync(
        process.execPath,
        [
          cli,
          '--project',
          'demo-ski-school-e2e',
          '--now',
          at.toISOString(),
          '--cutover',
          ...(scenario === 'implicit_cutover' ? [] : ['--apply']),
        ],
        { encoding: 'utf8', env: process.env }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        scenario === 'implicit_cutover'
          ? '--cutover requires --apply'
          : scenario === 'blocked_booking'
            ? 'blocked backfill rows'
            : 'unresolved pending'
      );
      await notReady();
      if (scenario === 'blocked_booking') {
        expect(
          (await db.doc('booking_attendance_outcome_work/booking_invalid').get()).data()
        ).toEqual({ historical: true });
      }
    },
    30000
  );
});
