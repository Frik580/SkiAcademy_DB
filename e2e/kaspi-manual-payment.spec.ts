import { test, expect as playwrightExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { ensureFirestore, seedE2ECourse } from './firestore-admin';
import {
  fillBookingSelectors,
  openGuestBookingModal,
  loadRuntimeConfig,
  signInAccount,
  signInStudent,
} from './fixtures';
import { waitForFunctionsEmulatorReady } from './global-setup';
const expect = playwrightExpect.configure({ timeout: 60_000 });
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const { timestampFromDate, KASPI_CONFIGURATION_PATH } = requireRoot(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

test('Kaspi top-up: guest-safe flag, customer statement, clarification, admin bank verification and exactly-once balance', async ({
  page,
  browser,
}) => {
  test.setTimeout(360_000);
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  const db = ensureFirestore();
  const runtime = loadRuntimeConfig();
  const adminContext = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
  const admin = await adminContext.newPage();
  const configRef = db.doc(KASPI_CONFIGURATION_PATH);
  const previous = await configRef.get();
  const suffix = randomUUID();
  const { getAuth } = requireFunctions(
    'firebase-admin/auth'
  ) as typeof import('firebase-admin/auth');
  const adminUser = await getAuth().getUserByEmail(runtime.adminEmail);
  await waitForFunctionsEmulatorReady();
  try {
    await configRef.delete();
    await signInStudent(page, runtime);
    await page.goto('/cabinet/profile_wallet');
    const wallet = page.getByRole('region', { name: 'Kaspi QR payment', exact: true });
    await expect(wallet.getByText('Kaspi QR payments are currently unavailable.')).toBeVisible();
    await expect(wallet.getByRole('img')).toHaveCount(0);
    await configRef.set({
      enabled: true,
      provider: 'kaspi_manual',
      merchantKey: 'demo-e2e-merchant',
      qrImageUrl: 'https://example.invalid/kaspi-emulator.png',
      merchantName: 'EMULATOR TEST ONLY',
      legalApprovalReference: 'emulator-only fixture, never production',
      qrVerifiedBy: adminUser.uid,
      qrVerifiedAt: timestampFromDate(new Date()),
      walletRequestTtlSeconds: 3600,
    });
    await page.route('https://example.invalid/kaspi-emulator.png', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50">TEST ONLY</text></svg>',
      })
    );
    await wallet.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(
      wallet.getByRole('button', { name: 'Request a top-up', exact: true })
    ).toBeVisible();
    const balanceBefore = (await db.doc(`users/${runtime.studentUid}/wallet/state`).get()).data()!
      .balance as number;
    await wallet.getByRole('spinbutton', { name: 'Amount in KZT' }).fill('1234');
    await wallet.getByRole('button', { name: 'Request a top-up', exact: true }).click();
    await expect(wallet.getByRole('img', { name: 'Verified merchant Kaspi QR' })).toBeVisible();
    const requests = await db
      .collection('payment_requests')
      .where('accountId', '==', runtime.studentUid)
      .get();
    expect(requests.size).toBe(1);
    const requestId = requests.docs[0]!.id;
    await wallet.getByRole('button', { name: 'I have paid', exact: true }).dblclick();
    await expect(
      wallet.getByText('Payment reported; awaiting review', { exact: true })
    ).toBeVisible();
    expect((await db.doc(`users/${runtime.studentUid}/wallet/state`).get()).data()!.balance).toBe(
      balanceBefore
    );
    await signInAccount(admin, { email: runtime.adminEmail, password: runtime.adminPassword });
    await admin.goto(`/admin?tab=finance&account=${runtime.studentUid}`);
    const payments = admin.getByRole('region', { name: 'Kaspi payment requests', exact: true });
    await expect(payments).toBeVisible();
    await payments.getByRole('button', { name: new RegExp(requestId) }).click();
    let modal = admin.getByRole('dialog', { name: 'Kaspi payment requests', exact: true });
    await modal.getByLabel('Reason or comment').fill('Need payer evidence');
    await modal.getByRole('button', { name: 'Request clarification', exact: true }).click();
    await admin
      .getByRole('dialog', { name: 'Confirm Action', exact: true })
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await payments.getByRole('combobox').selectOption('requires_clarification');
    await payments.getByRole('button', { name: new RegExp(requestId) }).click();
    modal = admin.getByRole('dialog', { name: 'Kaspi payment requests', exact: true });
    await modal.getByLabel('Reason or comment').fill('Receipt verified in local bank fixture');
    await modal.getByLabel('Amount actually received in KZT').fill('1234');
    await modal
      .getByLabel('Bank receipt date and time')
      .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
    await modal.getByLabel('Unique bank reference').fill(`EMULATOR-${suffix}`);
    await modal
      .getByLabel('Evidence matching this receipt to the payer')
      .fill('Verified payer and unique bank statement row');
    await modal.getByRole('button', { name: 'Confirm bank receipt', exact: true }).click();
    await admin
      .getByRole('dialog', { name: 'Confirm Action', exact: true })
      .getByRole('button', { name: 'Confirm', exact: true })
      .dblclick();
    await expect(admin.getByRole('dialog')).toHaveCount(0);
    await expect
      .poll(
        async () => (await db.doc(`users/${runtime.studentUid}/wallet/state`).get()).data()!.balance
      )
      .toBe(balanceBefore + 1234);
    await wallet.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(wallet.getByText('Bank receipt confirmed', { exact: true })).toBeVisible();
    const events = await db
      .collection('monetary_events')
      .where('manualReference', '==', `EMULATOR-${suffix}`)
      .get();
    expect(events.size).toBe(1);
    await page.reload();
    await expect(
      page
        .getByRole('region', { name: 'Kaspi QR payment' })
        .getByText('Bank receipt confirmed', { exact: true })
    ).toBeVisible();
    expect((await db.doc(`users/${runtime.studentUid}/wallet/state`).get()).data()!.balance).toBe(
      balanceBefore + 1234
    );
  } finally {
    if (previous.exists) await configRef.set(previous.data()!);
    else await configRef.delete();
    await adminContext.close();
  }
});

for (const kind of ['lesson', 'course'] as const) {
  test(`Kaspi guest ${kind}: real reservation UI, bank verification and exactly-once funding`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(360_000);
    expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
    const db = ensureFirestore();
    const runtime = loadRuntimeConfig();
    const suffix = randomUUID();
    const configRef = db.doc(KASPI_CONFIGURATION_PATH);
    const previous = await configRef.get();
    const adminContext = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
    const admin = await adminContext.newPage();
    const { getAuth } = requireFunctions(
      'firebase-admin/auth'
    ) as typeof import('firebase-admin/auth');
    const adminUser = await getAuth().getUserByEmail(runtime.adminEmail);
    try {
      await configRef.set({
        enabled: true,
        provider: 'kaspi_manual',
        merchantKey: 'demo-e2e-merchant',
        qrImageUrl: 'https://example.invalid/kaspi-emulator.png',
        merchantName: 'EMULATOR TEST ONLY',
        legalApprovalReference: 'emulator only',
        qrVerifiedBy: adminUser.uid,
        qrVerifiedAt: timestampFromDate(new Date()),
        walletRequestTtlSeconds: 3600,
      });
      await page.route('https://example.invalid/kaspi-emulator.png', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text y="50">TEST</text></svg>',
        })
      );
      // Isolate real endpoint admission per guest; do not bypass the callable or its guards.
      await page.route('**/executeGuestCanonicalCommand', (route) =>
        route.continue(
          route.request().method() === 'POST'
            ? {
                headers: {
                  ...route.request().headers(),
                  'x-forwarded-for': `2001:db8:7:${kind === 'lesson' ? 1 : 2}::${testInfo.retry + 1}`,
                },
              }
            : undefined
        )
      );
      await waitForFunctionsEmulatorReady();
      let courseId: string | undefined;
      if (kind === 'lesson') {
        await openGuestBookingModal(page, runtime.guestInstructorName);
        const form = page.getByRole('dialog', { name: 'Book Lesson with' });
        await form
          .getByRole('textbox', { name: 'Name *', exact: true })
          .fill(`Kaspi Guest ${suffix}`);
        await form.getByRole('textbox', { name: 'Phone *', exact: true }).fill('+7 701 123 45 67');
        await form
          .getByRole('combobox', { name: 'Discipline *', exact: true })
          .selectOption('snowboard');
        await fillBookingSelectors(page, 8 + testInfo.retry, { time: '15:00' });
      } else {
        courseId = `course_kaspi_${suffix}`;
        const title = `Kaspi Course ${suffix}`;
        // No catalog discipline: the guest must explicitly choose it in the real form.
        await seedE2ECourse({ courseId, title, instructorId: runtime.instructorId, dayOffset: 35 });
        await page.goto('/');
        const card = page
          .getByRole('article')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        await card.getByRole('button', { name: 'Enroll', exact: true }).click();
        const form = page.getByRole('dialog', { name: 'Course Enrollment' });
        await form.getByPlaceholder('e.g. Alex Carter').fill(`Kaspi Guest ${suffix}`);
        await form.getByPlaceholder('+1 (555) 000-0000').fill('+7 701 123 45 67');
        await form.getByRole('combobox').selectOption('ski');
      }
      const modal = page.getByRole('dialog', {
        name: kind === 'lesson' ? 'Book Lesson with' : 'Course Enrollment',
      });
      const creationPromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/executeGuestCanonicalCommand') &&
          response.request().postDataJSON()?.data?.kind ===
            (kind === 'lesson' ? 'create_guest_booking_request' : 'create_course_enrollments')
      );
      await modal.getByRole('button', { name: 'Send request', exact: true }).click();
      const creation = await creationPromise;
      const created = await creation.json();
      expect(created.result.status, JSON.stringify(created)).toBe('success');
      const payload = creation.request().postDataJSON().data;
      const subjectId =
        kind === 'lesson'
          ? payload.intent.bookingId
          : created.result.payload.guestLinkCredentials[0].enrollmentId;
      const participantId = payload.intent.participantIds[0];
      const collection = kind === 'lesson' ? 'bookings' : 'course_enrollments';
      const subjectRef = db.doc(`${collection}/${subjectId}`);
      const subjectBefore = (await subjectRef.get()).data()!;
      const paymentRef = db.doc(`payments/${subjectBefore.paymentId}`);
      const paymentBefore = (await paymentRef.get()).data()!;
      const claims = await db.collection('resource_claims').where('ownerId', '==', subjectId).get();
      expect(claims.size).toBeGreaterThan(0);
      const claimsBefore = claims.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
      const capacityBefore = courseId
        ? (await db.doc(`courses/${courseId}`).get()).data()!.capacity
        : undefined;
      if (capacityBefore) expect(capacityBefore.availableSeats).toBe(7);
      const walletsBefore = (await db.collectionGroup('wallet').get()).docs.map((doc) => ({
        id: doc.ref.path,
        data: doc.data(),
      }));
      const panel = modal.getByRole('region', { name: 'Kaspi QR payment', exact: true });
      await panel.getByRole('button', { name: 'Open QR payment', exact: true }).dblclick();
      await expect(panel.getByRole('img', { name: 'Verified merchant Kaspi QR' })).toBeVisible();
      const requests = await db
        .collection('payment_requests')
        .where('subjectId', '==', subjectId)
        .get();
      expect(requests.size).toBe(1);
      const request = requests.docs[0]!;
      expect(request.data().amount).toBe(paymentBefore.price);
      await panel.getByRole('button', { name: 'I have paid', exact: true }).dblclick();
      await expect(
        panel.getByText('Payment reported; awaiting review', { exact: true })
      ).toBeVisible();
      expect((await subjectRef.get()).data()!.lifecycle.status).toBe('pending');
      expect((await paymentRef.get()).data()!.paidAmount).toBe(0);
      await signInAccount(admin, { email: runtime.adminEmail, password: runtime.adminPassword });
      await admin.goto('/admin?tab=finance');
      await admin
        .locator('#canonical_finance')
        .getByRole('button', { name: 'Show', exact: true })
        .click();
      const queue = admin.getByRole('region', { name: 'Kaspi payment requests', exact: true });
      await queue.getByRole('button', { name: new RegExp(request.id) }).click();
      const review = admin.getByRole('dialog', { name: 'Kaspi payment requests', exact: true });
      await review.getByLabel('Reason or comment').fill('Verified emulator receipt');
      await review.getByLabel('Amount actually received in KZT').fill(String(paymentBefore.price));
      await review
        .getByLabel('Bank receipt date and time')
        .fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
      await review.getByLabel('Unique bank reference').fill(`EMULATOR-GUEST-${suffix}`);
      await review
        .getByLabel('Evidence matching this receipt to the payer')
        .fill('Unique emulator bank row and payer');
      await review.getByRole('button', { name: 'Confirm bank receipt', exact: true }).click();
      const confirm = admin.getByRole('dialog', { name: 'Confirm Action', exact: true });
      await confirm.getByRole('button', { name: 'Confirm', exact: true }).dblclick();
      await expect(admin.getByRole('dialog')).toHaveCount(0);
      await panel.getByRole('button', { name: 'Refresh payment status', exact: true }).click();
      await expect(panel.getByText('Bank receipt confirmed', { exact: true })).toBeVisible();
      await modal.getByRole('button', { name: 'Check status', exact: true }).click();
      await expect(
        modal.getByRole('heading', {
          name: kind === 'lesson' ? 'Booking confirmed' : 'Course enrollment confirmed',
          exact: true,
        })
      ).toBeVisible();
      const subjectAfter = (await subjectRef.get()).data()!;
      expect(subjectAfter.paymentId).toBe(subjectBefore.paymentId);
      expect(
        kind === 'lesson' ? subjectAfter.party.participantIds : [subjectAfter.participantId]
      ).toEqual([participantId]);
      expect((await paymentRef.get()).data()).toMatchObject({
        paidAmount: paymentBefore.price,
        retainedAmount: paymentBefore.price,
        outstandingAmount: 0,
      });
      expect((await db.collection('payments').where('subjectId', '==', subjectId).get()).size).toBe(
        1
      );
      const subjects =
        kind === 'lesson'
          ? await db
              .collection(collection)
              .where('party.participantIds', 'array-contains', participantId)
              .get()
          : await db
              .collection(collection)
              .where('participantId', '==', participantId)
              .where('courseId', '==', courseId)
              .get();
      expect(subjects.size).toBe(1);
      const claimsAfter = await db
        .collection('resource_claims')
        .where('ownerId', '==', subjectId)
        .get();
      expect(claimsAfter.docs.map((doc) => ({ id: doc.id, data: doc.data() }))).toEqual(
        claimsBefore
      );
      if (courseId)
        expect((await db.doc(`courses/${courseId}`).get()).data()!.capacity).toEqual(
          capacityBefore
        );
      expect(
        (await db.collectionGroup('wallet').get()).docs.map((doc) => ({
          id: doc.ref.path,
          data: doc.data(),
        }))
      ).toEqual(walletsBefore);
      const events = await db
        .collection('monetary_events')
        .where('paymentId', '==', subjectBefore.paymentId)
        .get();
      expect(events.size).toBe(1);
      expect(events.docs[0]!.data()).toMatchObject({
        externalAmount: paymentBefore.price,
        manualReference: `EMULATOR-GUEST-${suffix}`,
      });
    } finally {
      if (previous.exists) await configRef.set(previous.data()!);
      else await configRef.delete();
      await adminContext.close();
    }
  });
}

test('admin finance Kaspi QR toggle enables and disables new requests', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  const db = ensureFirestore();
  const runtime = loadRuntimeConfig();
  const configRef = db.doc(KASPI_CONFIGURATION_PATH);
  const previous = await configRef.get();
  const { getAuth } = requireFunctions(
    'firebase-admin/auth'
  ) as typeof import('firebase-admin/auth');
  const adminUser = await getAuth().getUserByEmail(runtime.adminEmail);
  const customerContext = await browser.newContext({ locale: 'en-US' });
  const customer = await customerContext.newPage();
  try {
    // Technical fixture only. Activation happens through the Administrator UI.
    await configRef.set({
      enabled: false,
      provider: 'kaspi_manual',
      merchantKey: 'demo-toggle-merchant',
      qrImageUrl: 'https://example.invalid/kaspi-toggle.png',
      merchantName: 'EMULATOR TOGGLE ONLY',
      qrVerifiedBy: adminUser.uid,
      qrVerifiedAt: timestampFromDate(new Date()),
      walletRequestTtlSeconds: 3600,
    });
    await signInAccount(page, { email: runtime.adminEmail, password: runtime.adminPassword });
    await page.goto('/admin?tab=finance');
    await page
      .locator('#canonical_finance')
      .getByRole('button', { name: 'Show', exact: true })
      .click();
    const setting = page.getByRole('region', {
      name: 'Kaspi QR — payment acceptance',
      exact: true,
    });
    const toggle = setting.getByRole('switch', { name: 'Allow payments via Kaspi QR' });
    await expect(toggle).not.toBeChecked();
    await signInStudent(customer, runtime);
    await customer.goto('/cabinet/profile_wallet');
    const wallet = customer.getByRole('region', { name: 'Kaspi QR payment', exact: true });
    await expect(wallet.getByText('Kaspi QR payments are currently unavailable.')).toBeVisible();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await page
      .getByRole('dialog', { name: 'Enable Kaspi QR payments?' })
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(toggle).toBeChecked();
    expect((await configRef.get()).data()).toMatchObject({
      enabled: true,
      revision: 1,
      updatedBy: adminUser.uid,
    });
    await wallet.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(
      wallet.getByRole('button', { name: 'Request a top-up', exact: true })
    ).toBeVisible();
    await toggle.click();
    await page
      .getByRole('dialog', { name: 'Disable Kaspi QR payments?' })
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(toggle).not.toBeChecked();
    expect((await configRef.get()).data()).toMatchObject({
      enabled: false,
      revision: 2,
      updatedBy: adminUser.uid,
    });
    await wallet.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(wallet.getByRole('button', { name: 'Request a top-up', exact: true })).toHaveCount(
      0
    );
    const actions = await configRef.collection('actions').get();
    expect(actions.size).toBe(2);
    expect(
      actions.docs.every((doc) => doc.data().updatedBy === adminUser.uid && doc.data().updatedAt)
    ).toBe(true);
  } finally {
    if (previous.exists) await configRef.set(previous.data()!);
    else await configRef.delete();
    await customerContext.close();
  }
});
