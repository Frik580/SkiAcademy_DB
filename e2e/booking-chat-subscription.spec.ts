import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { E2E_PROJECT_ID, FIRESTORE_EMULATOR_HOST, functionsCallableUrl } from './emulator-config';
import { ensureFirestore } from './firestore-admin';
import { loadRuntimeConfig, signInAccount } from './fixtures';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const {
  BookingIdSchema,
  BookingSchema,
  PaymentSchema,
  ParticipantSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} = requireFunctions('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('chat UI streams verified and archived rows and clears them after access is revoked', async ({
  page,
  browser,
  baseURL,
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
  const second = booking.collection('verified_chat_messages').doc('second');
  const roles = [
    {
      id: 'student',
      email: runtime.studentEmail,
      password: runtime.studentPassword,
      expectedPath: '/cabinet',
      context: 'participant',
      role: 'client',
      name: runtime.studentDisplayName,
    },
    {
      id: 'coach',
      email: runtime.instructorEmail,
      password: runtime.instructorPassword,
      expectedPath: '/instructor',
      context: 'instructor',
      role: 'instructor',
      name: runtime.workspaceInstructorName,
    },
    {
      id: 'admin',
      email: runtime.adminEmail,
      password: runtime.adminPassword,
      context: 'administration',
      role: 'admin',
      name: runtime.adminDisplayName,
    },
  ] as const;
  const roleMessages = roles.map(({ id }) => booking.collection('verified_chat_messages').doc(id));
  const guards = participantIds.map((id) => db.doc(`participant_management_active_owner/${id}`));
  const owner = guards[7];
  const streamRequests: string[] = [];
  let interrupted = false;
  await page.route('**/chatMessagesStream?*', async (route) => {
    const url = new URL(route.request().url());
    if (!interrupted && url.searchParams.get('threadId') === bookingId) {
      interrupted = true;
      await route.abort('connectionreset');
      return;
    }
    await route.continue();
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/chatMessagesStream')) {
      streamRequests.push(url.searchParams.get('threadId') ?? '');
    }
  });
  const before = await db.getAll(
    booking,
    payment,
    first,
    second,
    ...roleMessages,
    ...guards,
    ...otherParticipants
  );
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
    let studentLogin: ReturnType<typeof page.waitForResponse> | undefined;
    await signInAccount(page, roles[0], () => {
      studentLogin = page.waitForResponse((response) =>
        response.url().includes('accounts:signInWithPassword')
      );
    });
    const { idToken: studentToken } = (await (await studentLogin!).json()) as { idToken: string };
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
    expect(interrupted).toBe(true);
    expect(streamRequests.filter((thread) => thread === bookingId).length).toBeGreaterThan(1);
    await expect(dialog.getByText('Unverified sender', { exact: true })).toBeVisible();
    await second.set(message(second.id, nextMessage));
    await expect(dialog.getByText(nextMessage, { exact: true })).toBeVisible();
    await expect(dialog.getByText('Fixture participant', { exact: true })).toHaveCount(1);
    await owner.update({ accountId: runtime.studentBUid });
    await expect(dialog.getByText(initialMessage, { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(nextMessage, { exact: true })).toHaveCount(0);

    const previousOwner = before.find((snapshot) => snapshot.ref.path === owner.path);
    expect(previousOwner?.exists).toBe(true);
    await owner.set(previousOwner!.data()!);
    await dialog.getByTitle('Close', { exact: true }).click();
    await open();
    await expect(dialog.getByText(initialMessage, { exact: true })).toBeVisible();

    for (const [index, role] of roles.entries()) {
      const roleContext = index === 0 ? undefined : await browser.newContext({ baseURL });
      try {
        const rolePage = roleContext ? await roleContext.newPage() : page;
        let token = studentToken;
        if (roleContext) {
          await rolePage.addInitScript(() => localStorage.setItem('alpine_glide_lang', 'en'));
          let login: ReturnType<typeof page.waitForResponse> | undefined;
          await signInAccount(rolePage, role, () => {
            login = rolePage.waitForResponse((response) =>
              response.url().includes('accounts:signInWithPassword')
            );
          });
          token = ((await (await login!).json()) as { idToken: string }).idToken;
        }
        const text = `Authenticated browser role: ${role.id}`;
        const call = (data: Record<string, unknown>) =>
          rolePage.evaluate(
            async ({ url, token, data }) => {
              const response = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ data }),
              });
              return response.status;
            },
            { url: functionsCallableUrl('mutateChatMessage'), token, data }
          );
        expect(
          await call({
            operation: 'create',
            threadId: bookingId,
            messageId: role.id,
            context: role.context,
            message: { text },
          })
        ).toBe(200);
        expect((await roleMessages[index].get()).data()).toMatchObject({
          senderRole: role.role,
          senderName: role.name,
          text,
        });
        await expect(dialog.getByText(text, { exact: true })).toBeVisible();
        await expect(dialog.getByText(role.name, { exact: true }).first()).toBeVisible();
        if (role.id === 'admin') {
          const edited = 'Authorized edit of archived text';
          expect(
            await call({
              operation: 'edit',
              threadId: bookingId,
              messageId: first.id,
              text: edited,
            })
          ).toBe(200);
          await expect(dialog.getByText(edited, { exact: true })).toBeVisible();
          await expect(dialog.getByText('Unverified sender', { exact: true })).toBeVisible();
        }
      } finally {
        await roleContext?.close();
      }
    }
  } finally {
    const restore = db.batch();
    for (const snapshot of before) {
      if (snapshot.exists) restore.set(snapshot.ref, snapshot.data()!);
      else restore.delete(snapshot.ref);
    }
    await restore.commit();
  }
});
