import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, getApps, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AggregateRevisionSchema,
  AccountIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';
import { sweepGuestConfirmationLifecycleMismatches } from '../guestConfirmation/guestConfirmationReconciliationSweep';
import { sweepExpiredGuestLessonReservations } from './guestLessonReservationExpirySweep';

const PROJECT_ID = 'ski-academy-guest-expiry-sweep-test';
const correlationId = CorrelationIdSchema.parse('correlation_guest_expiry_sweep_01');
const instructorId = InstructorIdSchema.parse('instructor_guest_expiry_sweep_01');
const participantId = ParticipantIdSchema.parse('participant_guest_expiry_sweep_01');
const adminAccountId = AccountIdSchema.parse('account_guest_expiry_sweep_admin');
const bookingId = BookingIdSchema.parse('booking_guest_expiry_sweep_01');
const paymentId = paymentIdFromBookingId(bookingId);
const tokenSecret = 'guest-expiry-sweep-secret-01';
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

let app: App;
let firestore: Firestore;

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);

const COLLECTIONS_TO_CLEAR = [
  'instructors',
  'participants',
  'bookings',
  'payments',
  'monetary_events',
  'provider_event_receipts',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'admin_issues',
  'domain_outbox',
  'command_idempotency',
  'users',
  'course_enrollments',
] as const;

function guestCreateEnvelope(input: {
  bookingId: string;
  idempotencyKey: string;
  localTime?: string;
  participantId?: string;
}): CommandEnvelope<'create_guest_booking_request'> {
  const id = BookingIdSchema.parse(input.bookingId);
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectIdFromBookingId(id)),
      exercisedCapability: 'guest',
      idempotencyKey: input.idempotencyKey,
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: input.localTime ?? '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: 'Guest Expiry Sweep Participant',
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 24,
      }),
    },
    intent: {
      bookingId: id,
      instructorId,
      participantIds: [ParticipantIdSchema.parse(input.participantId ?? participantId)],
    },
  };
}

function paymentEnvelope(input: {
  paymentId: string;
  amount: number;
  key: string;
}): CommandEnvelope<'record_provider_payment_event'> {
  return {
    kind: 'record_provider_payment_event',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: input.key,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
    },
    intent: {
      paymentId: PaymentIdSchema.parse(input.paymentId),
      amount: input.amount,
      sourceKind: 'manual_external',
      manualReference: input.key,
    },
  };
}

async function clearCollections(collections: readonly string[]): Promise<void> {
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }
}

async function seedFixture(): Promise<void> {
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Guest Expiry Sweep Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
  await firestore.collection('participants').doc(participantId).set({
    participantId,
    displayName: 'Guest Expiry Sweep Participant',
    age: { kind: 'age_years', years: 24 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
      correlationId,
    },
  });
  await firestore.collection('users').doc(adminAccountId).set({
    accountId: adminAccountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

function createCommands(at: string) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret: tokenSecret }
  );
}

async function claimStatuses(): Promise<string[]> {
  const snapshot = await firestore.collection('resource_claims').get();
  return snapshot.docs.map((doc) => String(doc.data().lifecycle?.status ?? ''));
}

async function reopenConfirmedGuestBookingAsPending(
  id: string,
  reservationExpiresAt: ReturnType<typeof timestampFromDate>
): Promise<void> {
  const snapshot = await firestore.collection('bookings').doc(id).get();
  const revision = snapshot.data()?.revision;
  await firestore.collection('bookings').doc(id).update({
    lifecycle: { status: 'pending', reservationExpiresAt },
    revision: typeof revision === 'number' ? revision : 1,
  });
}

describe.skipIf(!runsOnFirestoreEmulator)(
  'guest lesson reservation expiry sweep (firestore emulator)',
  () => {
    beforeAll(() => {
      process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
      app = getApps().length > 0 ? getApps()[0]! : initializeApp({ projectId: PROJECT_ID });
      firestore = getFirestore(app);
    }, 30_000);

    afterAll(async () => {
      if (app) {
        await deleteApp(app);
      }
    });

    beforeEach(async () => {
      await clearCollections([...COLLECTIONS_TO_CLEAR]);
      await seedFixture();
    }, 30_000);

    it('expires an eligible unpaid guest Booking once, releases the claim, and is idempotent', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-create' })
          )
        ).status
      ).toBe('success');

      const beforeDeadline = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T10:59:59.000Z'),
      });
      expect(beforeDeadline.scannedCandidates).toBe(0);
      expect((await firestore.collection('bookings').doc(bookingId).get()).data()).toMatchObject({
        lifecycle: { status: 'pending' },
      });

      const outboxAfterCreate = (await firestore.collection('domain_outbox').get()).size;
      const first = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:00:00.000Z'),
      });
      expect(first.outcomes).toEqual([{ bookingId, outcome: 'expired' }]);
      const booking = (await firestore.collection('bookings').doc(bookingId).get()).data();
      expect(booking?.lifecycle).toMatchObject({
        status: 'cancelled',
        reasonCode: 'reservation_expired',
      });
      expect(booking?.revision).toBe(2);
      expect((await claimStatuses()).every((status) => status === 'released')).toBe(true);
      expect((await claimStatuses()).length).toBe(2);
      const logs = await firestore.collection('activity_logs').get();
      expect(logs.docs.some((doc) => doc.data().command?.kind === 'expire_guest_reservation')).toBe(
        true
      );
      expect((await firestore.collection('domain_outbox').get()).size).toBe(outboxAfterCreate);
      expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
        paidAmount: 0,
        outstandingAmount: 12_000,
        revision: 1,
      });

      const replay = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:05:00.000Z'),
      });
      expect(replay.scannedCandidates).toBe(0);
      expect((await firestore.collection('bookings').doc(bookingId).get()).data()?.revision).toBe(2);
      expect(logs.size).toBe((await firestore.collection('activity_logs').get()).size);
    }, 30_000);

    it('protects funded and non-pending Bookings and does not touch CourseEnrollment or legacy rows', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-funded-create' })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:10:00.000Z').execute(
            paymentEnvelope({ paymentId, amount: 12_000, key: 'expiry-sweep-funded-pay' })
          )
        ).status
      ).toBe('success');
      expect((await firestore.collection('bookings').doc(bookingId).get()).data()).toMatchObject({
        lifecycle: { status: 'confirmed' },
      });

      const enrollmentId = 'enrollment_guest_expiry_isolation_01';
      const enrollmentExpiresAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));
      await firestore.collection('course_enrollments').doc(enrollmentId).set({
        enrollmentId,
        attribution: { bookingOrigin: 'guest' },
        lifecycle: { status: 'pending', reservationExpiresAt: enrollmentExpiresAt },
      });
      await firestore.collection('bookings').doc('legacy_expiry_isolation_01').set({
        status: 'pending',
        date: '2026-01-15',
        userId: 'legacy-user',
      });
      await firestore.collection('bookings').doc('booking_admin_origin_isolation_01').set({
        bookingId: 'booking_admin_origin_isolation_01',
        attribution: { bookingOrigin: 'admin' },
        lifecycle: { status: 'confirmed' },
      });

      const result = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:30:00.000Z'),
      });
      expect(result.scannedCandidates).toBe(0);
      expect((await firestore.collection('bookings').doc(bookingId).get()).data()).toMatchObject({
        lifecycle: { status: 'confirmed' },
      });
      expect((await firestore.collection('course_enrollments').doc(enrollmentId).get()).data()).toMatchObject(
        {
          lifecycle: { status: 'pending' },
        }
      );
      expect(
        (await firestore.collection('bookings').doc('legacy_expiry_isolation_01').get()).data()
      ).toMatchObject({ status: 'pending' });
      expect(await claimStatuses()).toContain('active');
    }, 30_000);

    it('expires a partial payment without money disposition and fail-closes missing Payment', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-partial-create' })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:10:00.000Z').execute(
            paymentEnvelope({ paymentId, amount: 5_000, key: 'expiry-sweep-partial-pay' })
          )
        ).status
      ).toBe('success');

      const partial = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
      });
      expect(partial.outcomes).toEqual([{ bookingId, outcome: 'expired' }]);
      expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
        paidAmount: 5_000,
        outstandingAmount: 7_000,
        paymentStatus: 'partially_paid',
        revision: 2,
      });

      const missingId = BookingIdSchema.parse('booking_guest_expiry_missing_pay');
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: missingId,
              idempotencyKey: 'expiry-sweep-missing-create',
              localTime: '11:00',
              participantId: 'participant_guest_expiry_missing_01',
            })
          )
        ).status
      ).toBe('success');
      await firestore.collection('payments').doc(paymentIdFromBookingId(missingId)).delete();
      const missing = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
      });
      expect(missing.outcomes).toContainEqual({
        bookingId: missingId,
        outcome: 'invalid_integrity',
      });
      expect((await firestore.collection('bookings').doc(missingId).get()).data()).toMatchObject({
        lifecycle: { status: 'pending' },
      });

      const mismatchId = BookingIdSchema.parse('booking_guest_expiry_mismatch_pay');
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: mismatchId,
              idempotencyKey: 'expiry-sweep-mismatch-create',
              localTime: '13:00',
              participantId: 'participant_guest_expiry_mismatch_01',
            })
          )
        ).status
      ).toBe('success');
      await firestore
        .collection('payments')
        .doc(paymentIdFromBookingId(mismatchId))
        .update({ subjectId: bookingId });
      const mismatch = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
      });
      expect(mismatch.outcomes).toContainEqual({
        bookingId: mismatchId,
        outcome: 'invalid_integrity',
      });
      expect((await firestore.collection('bookings').doc(mismatchId).get()).data()).toMatchObject({
        lifecycle: { status: 'pending' },
      });
    }, 30_000);

    it('serializes payment vs expiry without resurrecting a terminal Booking', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-race-create' })
          )
        ).status
      ).toBe('success');

      const [paymentResult, expiryResult] = await Promise.all([
        createCommands('2026-01-01T10:59:00.000Z').execute(
          paymentEnvelope({ paymentId, amount: 12_000, key: 'expiry-sweep-race-pay' })
        ),
        sweepExpiredGuestLessonReservations(firestore, {
          now: new Date('2026-01-01T11:01:00.000Z'),
        }),
      ]);
      const raced = (await firestore.collection('bookings').doc(bookingId).get()).data();
      if (raced?.lifecycle?.status === 'confirmed') {
        expect(paymentResult.status).toBe('success');
        expect(expiryResult.outcomes.every((row) => row.outcome !== 'expired')).toBe(true);
        expect(await claimStatuses()).toContain('active');
      } else {
        expect(raced?.lifecycle).toMatchObject({
          status: 'cancelled',
          reasonCode: 'reservation_expired',
        });
        if (paymentResult.status === 'success') {
          expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
            paidAmount: 12_000,
            outstandingAmount: 0,
          });
        } else {
          expect(paymentResult.status === 'error' ? paymentResult.error.code : '').toBe(
            'invalid_transition'
          );
          expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
            paidAmount: 0,
            outstandingAmount: 12_000,
          });
        }
      }
    }, 30_000);

    it('confirms funded pending after reservation deadline and does not leave a permanent limbo', async () => {
      const fundedBeforeDeadlineId = BookingIdSchema.parse(
        'booking_guest_expiry_funded_before_deadline'
      );
      const fundedBeforeDeadlinePaymentId = paymentIdFromBookingId(fundedBeforeDeadlineId);
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: fundedBeforeDeadlineId,
              idempotencyKey: 'expiry-sweep-funded-before-create',
              localTime: '12:00',
              participantId: 'participant_guest_expiry_funded_before',
            })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:10:00.000Z').execute(
            paymentEnvelope({
              paymentId: fundedBeforeDeadlinePaymentId,
              amount: 12_000,
              key: 'expiry-sweep-funded-before-pay',
            })
          )
        ).status
      ).toBe('success');
      const originalDeadline = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));
      await reopenConfirmedGuestBookingAsPending(fundedBeforeDeadlineId, originalDeadline);

      const reconAfterDeadline = await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T11:30:00.000Z')
      );
      expect(reconAfterDeadline.scannedPayments).toBeGreaterThan(0);
      expect(
        (await firestore.collection('bookings').doc(fundedBeforeDeadlineId).get()).data()?.lifecycle
          .status
      ).toBe('confirmed');
      expect(await claimStatuses()).toContain('active');

      const fundedAtDeadlineId = BookingIdSchema.parse('booking_guest_expiry_funded_at_deadline');
      const fundedAtDeadlinePaymentId = paymentIdFromBookingId(fundedAtDeadlineId);
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: fundedAtDeadlineId,
              idempotencyKey: 'expiry-sweep-funded-at-create',
              localTime: '13:00',
              participantId: 'participant_guest_expiry_funded_at',
            })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:10:00.000Z').execute(
            paymentEnvelope({
              paymentId: fundedAtDeadlinePaymentId,
              amount: 12_000,
              key: 'expiry-sweep-funded-at-pay',
            })
          )
        ).status
      ).toBe('success');
      const inclusiveDeadline = timestampFromDate(new Date('2026-01-01T11:00:00.000Z'));
      await reopenConfirmedGuestBookingAsPending(fundedAtDeadlineId, inclusiveDeadline);

      const expiryAtDeadline = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:00:00.000Z'),
      });
      expect(
        expiryAtDeadline.outcomes.find((row) => row.bookingId === fundedAtDeadlineId)?.outcome
      ).toBe('fully_funded');
      expect(
        (await firestore.collection('bookings').doc(fundedAtDeadlineId).get()).data()?.lifecycle
          .status
      ).toBe('pending');

      await sweepGuestConfirmationLifecycleMismatches(
        firestore,
        new Date('2026-01-01T11:00:00.000Z')
      );
      expect(
        (await firestore.collection('bookings').doc(fundedAtDeadlineId).get()).data()?.lifecycle
          .status
      ).toBe('confirmed');
      expect(await claimStatuses()).toContain('active');

      const afterConfirmExpiry = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:10:00.000Z'),
      });
      expect(
        afterConfirmExpiry.outcomes.find((row) => row.bookingId === fundedAtDeadlineId)?.outcome
      ).not.toBe('expired');
      expect(
        (await firestore.collection('bookings').doc(fundedAtDeadlineId).get()).data()?.lifecycle
          .status
      ).toBe('confirmed');
      expect(
        (await firestore.collection('bookings').doc(fundedBeforeDeadlineId).get()).data()?.lifecycle
          .status
      ).toBe('confirmed');
    }, 30_000);

    it('rejects late funding after expiry wins and keeps the reservation cancelled', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-late-pay-create' })
          )
        ).status
      ).toBe('success');
      const expiry = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
      });
      expect(expiry.outcomes).toEqual([{ bookingId, outcome: 'expired' }]);
      const lateFunding = await createCommands('2026-01-01T11:02:00.000Z').execute(
        paymentEnvelope({ paymentId, amount: 12_000, key: 'expiry-sweep-late-pay' })
      );
      expect(lateFunding.status).toBe('error');
      expect(
        (await firestore.collection('bookings').doc(bookingId).get()).data()?.lifecycle
      ).toMatchObject({
        status: 'cancelled',
        reasonCode: 'reservation_expired',
      });
      expect((await firestore.collection('payments').doc(paymentId).get()).data()).toMatchObject({
        paidAmount: 0,
        outstandingAmount: 12_000,
      });
      expect((await claimStatuses()).every((status) => status === 'released')).toBe(true);
    }, 30_000);

    it('releases the instructor slot exactly once and allows reuse after expiry', async () => {
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({ bookingId, idempotencyKey: 'expiry-sweep-slot-create' })
          )
        ).status
      ).toBe('success');
      const [first, second] = await Promise.all([
        sweepExpiredGuestLessonReservations(firestore, {
          now: new Date('2026-01-01T11:01:00.000Z'),
        }),
        sweepExpiredGuestLessonReservations(firestore, {
          now: new Date('2026-01-01T11:01:00.000Z'),
        }),
      ]);
      expect(
        [...first.outcomes, ...second.outcomes].filter((row) => row.outcome === 'expired').length
      ).toBeGreaterThanOrEqual(1);
      expect((await firestore.collection('bookings').doc(bookingId).get()).data()?.revision).toBe(2);
      expect(
        (await firestore.collection('activity_logs').get()).docs.filter(
          (doc) => doc.data().command?.kind === 'expire_guest_reservation'
        )
      ).toHaveLength(1);

      const reuseId = BookingIdSchema.parse('booking_guest_expiry_reuse');
      expect(
        (
          await createCommands('2026-01-01T11:02:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: reuseId,
              idempotencyKey: 'expiry-sweep-slot-reuse',
              participantId: 'participant_guest_expiry_reuse',
            })
          )
        ).status
      ).toBe('success');
      expect((await firestore.collection('bookings').doc(reuseId).get()).data()).toMatchObject({
        lifecycle: { status: 'pending' },
      });
    }, 30_000);

    it('pages candidates, isolates malformed rows, and respects the batch limit', async () => {
      const firstId = BookingIdSchema.parse('booking_guest_expiry_batch_a');
      const secondId = BookingIdSchema.parse('booking_guest_expiry_batch_b');
      const thirdId = BookingIdSchema.parse('booking_guest_expiry_batch_c');
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: firstId,
              idempotencyKey: 'expiry-sweep-batch-a',
              localTime: '09:00',
              participantId: 'participant_guest_expiry_batch_a',
            })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: secondId,
              idempotencyKey: 'expiry-sweep-batch-b',
              localTime: '10:00',
              participantId: 'participant_guest_expiry_batch_b',
            })
          )
        ).status
      ).toBe('success');
      expect(
        (
          await createCommands('2026-01-01T10:00:00.000Z').execute(
            guestCreateEnvelope({
              bookingId: thirdId,
              idempotencyKey: 'expiry-sweep-batch-c',
              localTime: '11:00',
              participantId: 'participant_guest_expiry_batch_c',
            })
          )
        ).status
      ).toBe('success');

      const malformedId = BookingIdSchema.parse('booking_guest_expiry_malformed');
      await firestore.collection('bookings').doc(malformedId).set({
        bookingId: malformedId,
        attribution: { bookingOrigin: 'guest' },
        lifecycle: {
          status: 'pending',
          reservationExpiresAt: { seconds: 1, nanoseconds: 0 },
        },
      });

      const limited = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
        pageSize: 1,
        maxCandidates: 2,
      });
      expect(limited.scannedCandidates).toBe(2);
      expect(limited.truncated).toBe(true);
      expect(limited.cursor).toBeDefined();
      expect(limited.outcomes[0]?.outcome).toBe('invalid_integrity');
      expect(limited.outcomes[1]?.outcome).toBe('expired');

      const remainder = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:01:00.000Z'),
        pageSize: 2,
        maxCandidates: 10,
        startAfter: limited.cursor,
      });
      expect(remainder.outcomes.every((row) => row.outcome === 'expired')).toBe(true);
      expect(remainder.outcomes).toHaveLength(2);
      expect((await firestore.collection('bookings').doc(malformedId).get()).data()).toMatchObject({
        lifecycle: { status: 'pending' },
      });

      const repeat = await sweepExpiredGuestLessonReservations(firestore, {
        now: new Date('2026-01-01T11:02:00.000Z'),
      });
      expect(repeat.outcomes.filter((row) => row.outcome === 'expired')).toHaveLength(0);
      expect(
        (await firestore.collection('activity_logs').get()).docs.filter(
          (doc) => doc.data().command?.kind === 'expire_guest_reservation'
        )
      ).toHaveLength(3);
    }, 30_000);
  }
);
