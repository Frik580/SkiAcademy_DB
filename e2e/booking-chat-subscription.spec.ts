import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST, functionsCallableUrl } from './emulator-config';
import { ensureFirestore } from './firestore-admin';
import { loadRuntimeConfig, signInStudent } from './fixtures';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const {
  BookingIdSchema,
  BookingSchema,
  PaymentSchema,
  ParticipantSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} = requireFunctions('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('chat UI uses the server stream after Rules deny the direct listener and clears revoked rows', async ({
  page,
}) => {
  test.setTimeout(210_000);
  expect(process.env.GCLOUD_PROJECT).toBe(E2E_PROJECT_ID);
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);
  const db = ensureFirestore();
  const runtime = loadRuntimeConfig();
  const bookingId = 'booking_browser_stream_fallback';
  const participantIds = [
    ...Array.from({ length: 7 }, (_, index) => `participant_browser_stream_${index}`),
    runtime.studentParticipantId,
  ];
  const booking = db.doc(`bookings/${bookingId}`);
  const payment = db.doc(`payments/${paymentIdFromBookingId(BookingIdSchema.parse(bookingId))}`);
  const otherParticipants = participantIds.slice(0, 7).map((id) => db.doc(`participants/${id}`));
  const first = booking.collection('messages').doc('first');
  const second = booking.collection('messages').doc('second');
  const guards = participantIds.map((id) => db.doc(`participant_management_active_owner/${id}`));
  const owner = guards[7];
  const streamRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/chatMessagesStream')) {
      streamRequests.push(url.searchParams.get('threadId') ?? '');
    }
  });
  const before = await db.getAll(booking, payment, first, second, ...guards, ...otherParticipants);
  const now = new Date();
  const at = timestampFromDate(now);
  const metadata = {
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: 'seed_browser_stream',
      lastChangedByCommandId: 'seed_browser_stream',
      correlationId: 'browser_stream',
    },
  };
  const starts = now.getTime() + 24 * 60 * 60_000;
  const initialMessage = 'Private server-stream message';
  const nextMessage = 'Updated server-stream message';
  const message = (id: string, text: string) => ({
    id,
    bookingId,
    text,
    senderId: runtime.studentBUid,
    senderName: 'Fixture participant',
    senderRole: 'client',
    timestamp: new Date().toISOString(),
  });

  try {
    const setup = db.batch();
    setup.set(
      booking,
      BookingSchema.parse({
        bookingId,
        payerAccountId: runtime.studentUid,
        dataScope: 'live',
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId: runtime.studentUid },
        },
        party: { kind: 'family_group', participantIds },
        occurrence: {
          occurrenceId: `occ_${bookingId}`,
          instructorId: runtime.workspaceInstructorId,
          interval: {
            startsAt: timestampFromDate(new Date(starts)),
            endsAt: timestampFromDate(new Date(starts + 60 * 60_000)),
          },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds, frozenAt: at },
        },
        lifecycle: { status: 'confirmed' },
        paymentId: payment.id,
        ...metadata,
      })
    );
    setup.set(
      payment,
      PaymentSchema.parse({
        revision: metadata.revision,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        paymentId: payment.id,
        subjectType: 'booking',
        subjectId: bookingId,
        payerAccountId: runtime.studentUid,
        dataScope: 'live',
        currency: 'KZT',
        price: 1000,
        originalPrice: 1000,
        paidAmount: 1000,
        retainedAmount: 1000,
        settledAmount: 1000,
        refundedAmount: 0,
        writtenOffAmount: 0,
        outstandingAmount: 0,
        paymentStatus: 'paid',
        incrementalRequirements: [],
        eventRevision: 1,
      })
    );
    otherParticipants.forEach((participant) =>
      setup.set(
        participant,
        ParticipantSchema.parse({
          ...metadata,
          participantId: participant.id,
          displayName: 'Fixture participant',
          age: { kind: 'unknown' },
          skillLevel: 'beginner',
          discipline: 'ski',
          management: { kind: 'unmanaged_guest' },
          lifecycle: { status: 'active' },
        })
      )
    );
    guards
      .slice(0, 7)
      .forEach((guard) =>
        setup.set(guard, { participantId: guard.id, accountId: runtime.studentBUid })
      );
    setup.set(first, message(first.id, initialMessage));
    await setup.commit();

    const warm = await fetch(functionsCallableUrl('chatMessagesStream'), {
      signal: AbortSignal.timeout(45_000),
    });
    expect(warm.status).toBe(403);
    await signInStudent(page, runtime);
    await page.goto('/cabinet/calendar', { waitUntil: 'domcontentloaded' });
    const chatButton = page
      .locator(`[id="booking-card-${bookingId}"]`)
      .getByRole('button', { name: /Chat/ });
    await expect(chatButton).toBeVisible({ timeout: 60_000 });
    const open = () => chatButton.click();
    await open();
    const dialog = page.locator('.ui-modal').filter({
      has: page.getByRole('heading', { name: 'Lesson Discussion' }),
    });
    await expect.poll(() => streamRequests, { timeout: 90_000 }).toContain(bookingId);
    await expect(dialog.getByText(initialMessage, { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await second.set(message(second.id, nextMessage));
    await expect(dialog.getByText(nextMessage, { exact: true })).toBeVisible();
    await owner.update({ accountId: runtime.studentBUid });
    await expect(dialog.getByText(initialMessage, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(nextMessage, { exact: true })).toHaveCount(0);

    const previousOwner = before.find((snapshot) => snapshot.ref.path === owner.path);
    expect(previousOwner?.exists).toBe(true);
    await owner.set(previousOwner!.data()!);
    await dialog.getByTitle('Close', { exact: true }).click();
    await open();
    await expect(dialog.getByText(initialMessage, { exact: true })).toBeVisible();
  } finally {
    const restore = db.batch();
    for (const snapshot of before) {
      if (snapshot.exists) restore.set(snapshot.ref, snapshot.data()!);
      else restore.delete(snapshot.ref);
    }
    await restore.commit();
  }
});
