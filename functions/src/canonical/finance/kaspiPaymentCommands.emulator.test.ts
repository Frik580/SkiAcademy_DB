import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  IdempotencyKeySchema,
  systemCommandActor,
  SystemActorIdSchema,
  participantManagementIdFromGuestLink,
  ParticipantIdSchema,
  AccountIdSchema,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createQueryKaspiPaymentsHandler } from '../readModels/queryKaspiPaymentsCallable';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions';
import {
  kaspiFixtures,
  kaspiToggle,
  kaspiAdmin,
  kaspiTopup,
  kaspiGuest,
  kaspiReview,
  kaspiRequestA,
  kaspiRequestB,
  kaspiAccount,
  kaspiAdminB,
  kaspiSecret,
} from '../../../testSupport/kaspiPaymentFixtures';

let app: App;
let firestore: Firestore;
const collections = [
  'users',
  'bookings',
  'payments',
  'courses',
  'course_enrollments',
  'resource_claims',
  'payment_configuration',
  'payment_requests',
  'bank_receipt_guards',
  'command_idempotency',
  'monetary_events',
  'activity_logs',
  'admin_runtime',
  'participants',
  'participant_management',
  'resource_claim_guards',
  'domain_outbox',
];
async function run<K extends CommandEnvelope['kind']>(
  envelope: CommandEnvelope<K>,
  at = '2026-01-01T10:00:00Z'
) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date(at)) },
    createFirestoreCanonicalTransactionExecutor(firestore),
    { guestActionTokenSecret: kaspiSecret }
  ).execute(envelope);
}
describe('Kaspi atomic financial commands on Firestore emulator', () => {
  beforeAll(() => {
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? ''))
      throw new Error('Local Firestore emulator required; cloud access forbidden');
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'kaspi-financial-test');
    firestore = getFirestore(app);
  });
  beforeEach(async () => {
    for (const collection of collections)
      await firestore.recursiveDelete(firestore.collection(collection));
    const batch = firestore.batch();
    for (const [path, data] of Object.entries(kaspiFixtures().docs))
      batch.set(firestore.doc(path), data);
    await batch.commit();
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });
  it('serializes concurrent configuration toggles and replays without duplicate audit', async () => {
    const commands = [kaspiToggle(false, 0, 'toggle_a'), kaspiToggle(true, 0, 'toggle_b')];
    const results = await Promise.all(commands.map((command) => run(command)));
    expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
    const winner = commands[results.findIndex((result) => result.status === 'success')]!;
    expect((await run(winner)).status).toBe('success');
    const snapshot = await firestore.doc('payment_configuration/kaspi_manual').get();
    expect(snapshot.data()).toMatchObject({ revision: 1, enabled: winner.intent.enabled });
    expect(
      (await firestore.collection('payment_configuration/kaspi_manual/actions').get()).size
    ).toBe(1);
    expect((await firestore.collection('monetary_events').get()).size).toBe(0);
  });
  it('authorizes Administrator configuration reads without exposing merchant credentials', async () => {
    const query = createQueryKaspiPaymentsHandler(firestore, kaspiSecret);
    const call = (uid?: string) => ({ data: { scope: 'admin_configuration' }, ...(uid ? { auth: { uid } } : {}) }) as CallableRequest<unknown>;
    await expect(query(call())).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(query(call(kaspiAccount))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(query(call(kaspiAdmin))).resolves.toEqual({ enabled: true, ready: true, revision: 0, merchantName: 'EMULATOR ONLY' });
    await run(kaspiToggle(false));
    await expect(query(call(kaspiAdmin))).resolves.toMatchObject({ enabled: false, ready: true, revision: 1 });
    await expect(query({ data: { scope: 'configuration' } } as CallableRequest<unknown>)).resolves.toEqual({ enabled: false });
  });
  it('serializes two administrators confirming one request and credits exactly once', async () => {
    expect((await run(kaspiTopup())).status).toBe('success');
    const commands = [kaspiReview(), kaspiReview(kaspiRequestA, 1, 'confirm', {}, kaspiAdminB)];
    const results = await Promise.all(commands.map((envelope) => run(envelope)));
    expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
    expect((await firestore.doc(`users/${kaspiAccount}/wallet/state`).get()).data()?.balance).toBe(
      10000
    );
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
    expect(
      (await run(commands[results.findIndex((result) => result.status === 'success')]!)).status
    ).toBe('success');
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
  });
  it('serializes reuse of one bank receipt across distinct wallet and guest requests', async () => {
    await run(kaspiTopup());
    await run(kaspiGuest('guest_booking_payment', kaspiRequestB));
    const results = await Promise.all([run(kaspiReview()), run(kaspiReview(kaspiRequestB))]);
    expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
    expect((await firestore.collection('bank_receipt_guards').get()).size).toBe(1);
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
  });
  it.each(['guest_booking_payment', 'guest_course_payment'] as const)(
    'records late %s money without funding, duplicate subject or guest wallet',
    async (type) => {
      expect((await run(kaspiGuest(type))).status).toBe('success');
      const { booking, enrollment } = kaspiFixtures();
      const expire: CommandEnvelope<'expire_guest_reservation'> = {
        kind: 'expire_guest_reservation',
        context: {
          actor: systemCommandActor(SystemActorIdSchema.parse('system_guest_reservation_expiry')),
          source: 'scheduler',
          exercisedCapability: 'system',
          correlationId: kaspiReview().context.correlationId,
          idempotencyKey: IdempotencyKeySchema.parse('expire_before_late_receipt'),
          expectedRevision: 1 as never,
        },
        intent:
          type === 'guest_booking_payment'
            ? { bookingId: booking.bookingId }
            : { courseEnrollmentId: enrollment.enrollmentId },
      };
      const expired = await run(expire, '2026-01-03T10:00:00Z');
      expect(expired.status, JSON.stringify(expired)).toBe('success');
      const claimsBefore = (await firestore.collection('resource_claims').get()).docs.map((doc) =>
        doc.data()
      );
      const courseBefore = (await firestore.doc(`courses/${enrollment.courseId}`).get()).data();
      expect((await run(kaspiReview(), '2026-01-03T10:00:00Z')).status).toBe('success');
      const request = (await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()!;
      expect(request.status).toBe('refund_required');
      expect(request.serviceFunded).toBe(false);
      expect((await firestore.doc(`payments/${request.paymentId}`).get()).data()?.paidAmount).toBe(
        0
      );
      expect((await firestore.collection('bookings').get()).size).toBe(1);
      expect((await firestore.collection('course_enrollments').get()).size).toBe(1);
      expect((await firestore.collectionGroup('wallet').get()).empty).toBe(true);
      const subjectPath =
        type === 'guest_booking_payment'
          ? `bookings/${booking.bookingId}`
          : `course_enrollments/${enrollment.enrollmentId}`;
      expect((await firestore.doc(subjectPath).get()).data()!.lifecycle).toMatchObject({
        status: 'cancelled',
        reasonCode: 'reservation_expired',
      });
      expect(
        (await firestore.collection('resource_claims').get()).docs.map((doc) => doc.data())
      ).toEqual(claimsBefore);
      expect((await firestore.doc(`courses/${enrollment.courseId}`).get()).data()).toEqual(
        courseBefore
      );
      const events = await firestore.collection('monetary_events').get();
      expect(events.size).toBe(1);
      expect(events.docs[0]!.data()).toMatchObject({ externalAmount: 10000 });
      expect(events.docs[0]!.data().paymentEffect).toBeUndefined();
    }
  );
  it('retains bank evidence when reserved instructor claims no longer exist', async () => {
    await run(kaspiGuest('guest_booking_payment'));
    await firestore.recursiveDelete(firestore.collection('resource_claims'));
    expect((await run(kaspiReview())).status).toBe('success');
    expect((await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()?.status).toBe(
      'refund_required'
    );
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
  });
  it.each(['guest_booking_payment', 'guest_course_payment'] as const)(
    'preserves bank receipt after the current %s price changes',
    async (type) => {
      expect((await run(kaspiGuest(type))).status).toBe('success');
      const { booking, enrollment } = kaspiFixtures();
      const subject = type === 'guest_booking_payment' ? booking : enrollment;
      const paymentRef = firestore.doc(`payments/${subject.paymentId}`);
      const adjust = kaspiReview();
      expect(
        (
          await run({
            kind: 'adjust_service_price',
            context: {
              ...adjust.context,
              expectedRevision: (await paymentRef.get()).data()!.revision,
              idempotencyKey: IdempotencyKeySchema.parse('price_change_before_bank_confirmation'),
            },
            intent: {
              paymentId: subject.paymentId,
              newPrice: 8000 as never,
              reasonExplanation: 'Emulator price reduction after QR request',
            },
          })
        ).status
      ).toBe('success');
      expect((await run(kaspiReview())).status).toBe('success');
      expect((await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()).toMatchObject(
        {
          status: 'refund_required',
          serviceFunded: false,
          refundAmount: 10000,
        }
      );
      expect((await paymentRef.get()).data()).toMatchObject({ price: 8000, paidAmount: 0 });
      const events = await firestore
        .collection('monetary_events')
        .where('manualReference', '==', 'BANK-DEMO-001')
        .get();
      expect(events.size).toBe(1);
      expect(events.docs[0]!.data()).toMatchObject({ externalAmount: 10000 });
      expect(events.docs[0]!.data().paymentEffect).toBeUndefined();
    }
  );
  it('cannot confirm a cancelled guest Enrollment or consume replacement capacity', async () => {
    await run(kaspiGuest('guest_course_payment'));
    const { enrollment } = kaspiFixtures();
    await firestore
      .doc(`course_enrollments/${enrollment.enrollmentId}`)
      .update({ lifecycle: { status: 'cancelled', reasonCode: 'reservation_expired' } });
    expect((await run(kaspiReview())).status).toBe('success');
    expect((await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()?.status).toBe(
      'refund_required'
    );
    expect((await firestore.doc(`payments/${enrollment.paymentId}`).get()).data()?.paidAmount).toBe(
      0
    );
  });
  it.each(['wallet_topup', 'guest_booking_payment', 'guest_course_payment'] as const)(
    'records a %s bank refund once under concurrent administrator commands',
    async (type) => {
      expect((await run(type === 'wallet_topup' ? kaspiTopup() : kaspiGuest(type))).status).toBe('success');
      const confirmed = await run(kaspiReview());
      expect(confirmed.status, JSON.stringify(confirmed)).toBe('success');
      expect((await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()!.status).toBe('confirmed');
      const prepared = await run(kaspiReview(kaspiRequestA, 2, 'require_refund'));
      expect(prepared.status, JSON.stringify(prepared)).toBe('success');
      const extra = {
        refundBankReference: 'BANK-REFUND-DEMO-001',
        refundedAt: kaspiReview().intent.receipt!.receivedAt,
      };
      const results = await Promise.all([
        run(kaspiReview(kaspiRequestA, 3, 'record_refund', extra)),
        run(kaspiReview(kaspiRequestA, 3, 'record_refund', extra, kaspiAdminB)),
      ]);
      expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
      expect(
        (await firestore.doc(`users/${kaspiAccount}/wallet/state`).get()).data()?.balance
      ).toBe(type === 'wallet_topup' ? 0 : undefined);
      expect((await firestore.collection('monetary_events').get()).size).toBe(
        type === 'wallet_topup' ? 3 : 2
      );
    }
  );
  it('keeps the original bank refund route after canonical guest linking and cancellation', async () => {
    await run(kaspiGuest('guest_booking_payment'));
    await run(kaspiReview());
    const { booking } = kaspiFixtures();
    const target = ParticipantIdSchema.parse('participant_kaspi_linked');
    const managementId = participantManagementIdFromGuestLink({
      participantId: target,
      accountId: AccountIdSchema.parse(kaspiAccount),
    });
    const at = booking.createdAt;
    const metadata = { revision: 1, createdAt: at, updatedAt: at, audit: booking.audit };
    for (const [id, management] of [
      [booking.party.participantIds[0]!, { kind: 'unmanaged_guest' }],
      [target, { kind: 'managed', participantManagementId: managementId }],
    ] as const) {
      await firestore
        .doc(`participants/${id}`)
        .set({
          participantId: id,
          displayName: 'Emulator linking fixture',
          age: { kind: 'age_years', years: 24 },
          skillLevel: 'beginner',
          discipline: 'ski',
          lifecycle: { status: 'active' },
          management,
          ...metadata,
        });
    }
    await firestore.doc(`participant_management/${managementId}`).set({
      participantManagementId: managementId,
      participantId: target,
      accountId: kaspiAccount,
      role: 'owner',
      authority: 'self',
      status: 'active',
      ...metadata,
    });
    const link = await run({
      kind: 'link_guest_booking_to_account_as_administrator',
      context: {
        ...kaspiReview().context,
        expectedRevision: (await firestore.doc(`bookings/${booking.bookingId}`).get()).data()!
          .revision,
        idempotencyKey: IdempotencyKeySchema.parse('kaspi_real_guest_link'),
      },
      intent: {
        bookingId: booking.bookingId,
        targetAccountId: AccountIdSchema.parse(kaspiAccount),
        targetParticipantId: target,
        reasonExplanation: 'Verified emulator guest ownership',
      },
    });
    expect(link.status, JSON.stringify(link)).toBe('success');
    const paymentRef = firestore.doc(`payments/${booking.paymentId}`);
    expect((await paymentRef.get()).data()).toMatchObject({
      manualPaymentRequestId: kaspiRequestA,
      paidAmount: 10000,
      payerAccountId: kaspiAccount,
    });
    expect((await firestore.collection('monetary_events').get()).size).toBe(1);
    const cancellation = await run({
      kind: 'resolve_booking_cancellation',
      context: {
        ...kaspiReview().context,
        expectedRevision: (await firestore.doc(`bookings/${booking.bookingId}`).get()).data()!
          .revision,
        idempotencyKey: IdempotencyKeySchema.parse('cancel_after_real_guest_link'),
      },
      intent: {
        bookingId: booking.bookingId,
        decision: 'direct_cancel',
        refundAmount: 10000 as never,
        expectedPaymentRevision: (await paymentRef.get()).data()!.revision,
        reasonExplanation: 'Approved emulator full cancellation',
      },
    });
    expect(cancellation.status, JSON.stringify(cancellation)).toBe('success');
    expect((await paymentRef.get()).data()!.refundedAmount).toBe(0);
    expect((await firestore.collectionGroup('wallet').get()).empty).toBe(true);
    const request = (await firestore.doc(`payment_requests/${kaspiRequestA}`).get()).data()!;
    expect(request).toMatchObject({ status: 'refund_required', refundAmount: 10000 });
    expect(
      (
        await run(
          kaspiReview(kaspiRequestA, request.revision, 'record_refund', {
            refundBankReference: 'EMULATOR-REFUND-AFTER-LINK',
            refundedAt: at,
          })
        )
      ).status
    ).toBe('success');
    expect((await paymentRef.get()).data()!.refundedAmount).toBe(10000);
    expect((await firestore.collectionGroup('wallet').get()).empty).toBe(true);
    expect((await firestore.collection('monetary_events').get()).size).toBe(2);
  });
  it('rejects forged guest credentials and customer financial commands without writes', async () => {
    const guest = kaspiGuest('guest_booking_payment');
    expect(
      (
        await run({
          ...guest,
          context: {
            ...guest.context,
            transportMetadata: {
              ...guest.context.transportMetadata,
              guest_action_sig: '0'.repeat(64),
            },
          },
        })
      ).status
    ).toBe('error');
    await run(kaspiTopup());
    const review = kaspiReview();
    expect(
      (
        await run({
          ...review,
          context: {
            ...kaspiTopup().context,
            idempotencyKey: IdempotencyKeySchema.parse('customer_confirm'),
          },
        })
      ).status
    ).toBe('error');
    expect((await firestore.collection('monetary_events').get()).empty).toBe(true);
  });
  it('enforces read authorization and redacts bank evidence from the customer projection', async () => {
    await run(kaspiTopup());
    await run(kaspiReview());
    const query = createQueryKaspiPaymentsHandler(firestore, kaspiSecret);
    const request = (data: unknown, uid?: string) =>
      ({ data, ...(uid ? { auth: { uid } } : {}) }) as CallableRequest;
    await expect(query(request({ scope: 'mine' }))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(query(request({ scope: 'admin' }, kaspiAccount))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      query(request({ scope: 'history', requestId: kaspiRequestA }, kaspiAccount))
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      query(
        request({
          scope: 'guest',
          type: 'guest_booking_payment',
          subjectId: kaspiFixtures().booking.bookingId,
          nonce: 'fake',
          signature: 'fake',
          expiresAt: { seconds: 4102444800, nanoseconds: 0 },
        })
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const result = await query(request({ scope: 'mine' }, kaspiAccount));
    expect(result).toMatchObject({ items: [{ requestId: kaspiRequestA, status: 'confirmed' }] });
    expect(JSON.stringify(result)).not.toContain('BANK-DEMO-001');
    expect(JSON.stringify(result)).not.toContain('matchingBasis');
    const other = await query(request({ scope: 'mine' }, kaspiAdminB));
    expect(other).toMatchObject({ items: [] });
  });
});
