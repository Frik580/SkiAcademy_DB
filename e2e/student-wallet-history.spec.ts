import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { loadRuntimeConfig, signInStudent } from './fixtures';
import { seedStudentAccount, waitForFunctionsEmulatorReady } from './global-setup';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const { MonetaryEventSchema, timestampFromDate, selfParticipantIdFromAccountId } = requireRoot(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

test('wallet history survives reload and participant changes in RU/EN, mobile/desktop and light/dark', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  const db = requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
  const sharedRuntime = loadRuntimeConfig();
  const { getAuth } = requireFunctions('firebase-admin/auth') as typeof import('firebase-admin/auth');
  // Other specs leave real monetary events on the shared student. Keep this
  // history below the UI page size without deleting or reordering those events.
  const suffix = randomUUID();
  const studentEmail = `wallet-${suffix}@e2e.test`;
  const student = await getAuth().createUser({
    email: studentEmail,
    password: sharedRuntime.studentPassword,
  });
  const runtime = {
    ...sharedRuntime,
    studentEmail,
    studentUid: student.uid,
    studentParticipantId: selfParticipantIdFromAccountId(student.uid),
    studentChildParticipantId: `participant_wallet_child_${suffix}`,
  };
  const childManagementId = `management_wallet_child_${suffix}`;
  const refs: import('firebase-admin/firestore').DocumentReference[] = [];
  const historyResponses: unknown[] = [];
  page.on('response', async (response) => {
    if (response.url().endsWith('/queryAccountWalletHistory')) {
      historyResponses.push({
        status: response.status(),
        body: await response.json().catch(() => null),
      });
    }
  });
  const at = timestampFromDate(new Date('2026-10-01T10:00:00Z'));
  const definitions = [
    ['credit', 'wallet_credit', 12345],
    ['debit', 'booking_charge', -2345],
    ['refund', 'refund_to_wallet', 345],
    ['adjustment', 'wallet_adjustment', -45],
    ['course', 'course_charge', -1000],
  ] as const;
  try {
    await seedStudentAccount({
      studentUid: runtime.studentUid,
      email: runtime.studentEmail,
      displayName: runtime.studentDisplayName,
      childParticipantId: runtime.studentChildParticipantId,
      childParticipantManagementId: childManagementId,
      childDisplayName: runtime.studentChildDisplayName,
    });
    refs.push(
      db.doc(`users/${runtime.studentUid}`),
      db.doc(`users/${runtime.studentUid}/wallet/state`),
      db.doc(`participants/${runtime.studentParticipantId}`),
      db.doc(`participants/${runtime.studentChildParticipantId}`),
      db.doc(`participant_management/${childManagementId}`)
    );
    for (const [name, eventKind, walletBalanceDelta] of definitions) {
      const ref = db.doc(`monetary_events/event_wallet_e2e_${name}_${suffix}`);
      refs.push(ref);
      await ref.set(
        MonetaryEventSchema.parse({
          eventId: ref.id,
          eventKind,
          walletBalanceDelta,
          walletAccountId: runtime.studentUid,
          currency: 'KZT',
          sourceKind: 'wallet',
          actor: { kind: 'account', accountId: runtime.studentUid },
          commandId: `command_wallet_e2e_${name}`,
          correlationId: 'correlation_wallet_e2e',
          occurredAt: at,
          recordedAt: at,
        })
      );
    }
    const legacy = db.doc(`wallet_ledger/wallet_e2e_old_${suffix}`);
    const duplicate = db.doc(`wallet_ledger/wallet_e2e_duplicate_${suffix}`);
    refs.push(legacy, duplicate);
    await legacy.set({
      userId: runtime.studentUid,
      amount: 500,
      balanceAfter: 500,
      type: 'top_up',
      subjectName: 'Historical credit',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    await duplicate.set({
      userId: runtime.studentUid,
      amount: 345,
      type: 'refund',
      monetaryEventId: `event_wallet_e2e_refund_${suffix}`,
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    const foreign = db.doc(`monetary_events/event_wallet_e2e_foreign_${suffix}`);
    refs.push(foreign);
    await foreign.set(
      MonetaryEventSchema.parse({
        eventId: foreign.id,
        eventKind: 'wallet_credit',
        walletBalanceDelta: 987654321,
        walletAccountId: runtime.studentBUid,
        currency: 'KZT',
        sourceKind: 'wallet',
        actor: { kind: 'account', accountId: runtime.studentBUid },
        commandId: 'command_wallet_foreign',
        correlationId: 'correlation_wallet_foreign',
        occurredAt: at,
        recordedAt: at,
      })
    );
    await waitForFunctionsEmulatorReady();
    const creditRef = db.doc(`monetary_events/event_wallet_e2e_credit_${suffix}`);
    const creditBefore = (await creditRef.get()).data();
    expect(creditBefore).toMatchObject({
      walletAccountId: runtime.studentUid,
      walletBalanceDelta: 12345,
      currency: 'KZT',
    });
    expect(creditBefore?.dataScope).toBeUndefined();
    expect((await db.doc(`test_actors/${runtime.studentUid}`).get()).exists).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/queryAccountWalletHistory')) reads++;
    });
    await signInStudent(page, runtime);
    const firstHistoryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/queryAccountWalletHistory')
    );
    await page.goto('/cabinet/profile_wallet');
    const response = await firstHistoryResponse;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.result.operations).toEqual(
      expect.arrayContaining(
        definitions.map(([name, , amount]) =>
          expect.objectContaining({
            id: `event:event_wallet_e2e_${name}_${suffix}`,
            amount,
            currency: 'KZT',
          })
        )
      )
    );
    expect(body.result.operations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: `event:${foreign.id}` })])
    );
    expect((await creditRef.get()).data()).toEqual(creditBefore);
    const history = page.getByTestId('wallet-operation-history');
    await expect(history.getByText('+12,345 ₸', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(history.getByText('−2,345 ₸', { exact: true })).toBeVisible();
    await expect(history.getByText('+345 ₸', { exact: true })).toHaveCount(1);
    await expect(history).toContainText('Historical credit');
    await expect(history).not.toContainText('987,654,321');
    const originalIds = await history
      .getByRole('listitem')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-operation-id')));
    const previousReads = reads;
    const switcher = page
      .getByRole('banner')
      .getByTestId('navbar-participant-switcher')
      .filter({ visible: true });
    await switcher.locator(`[data-participant-id="${runtime.studentChildParticipantId}"]`).click();
    await expect(
      switcher.locator(`[data-participant-id="${runtime.studentChildParticipantId}"]`)
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await history
        .getByRole('listitem')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-operation-id')))
    ).toEqual(originalIds);
    expect(reads).toBe(previousReads);

    for (const language of ['en', 'ru'] as const) {
      await page.evaluate((lang) => localStorage.setItem('alpine_glide_lang', lang), language);
      await page.reload();
      await expect(history).toContainText(
        language === 'ru' ? 'Пополнение кошелька' : 'Wallet top-up'
      );
      expect(
        await history
          .getByRole('listitem')
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-operation-id')))
      ).toEqual(originalIds);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const dark of [false, true]) {
          await page.evaluate(
            (value) => document.documentElement.classList.toggle('dark', value),
            dark
          );
          await expect(history).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
          ).toBe(true);
          await info.attach(`wallet-${language}-${width}-${dark ? 'dark' : 'light'}`, {
            body: await history.screenshot(),
            contentType: 'image/png',
          });
        }
      }
    }

    await page.route('**/queryAccountWalletHistory', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { status: 'INTERNAL', message: 'Test read failure' } }),
      })
    );
    await page.reload();
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить операции');
    await expect(page.getByText('Операций по кошельку пока нет.')).toHaveCount(0);
    await page.unroute('**/queryAccountWalletHistory');
    await page.getByRole('button', { name: 'Повторить', exact: true }).click();
    await expect(history).toContainText('Historical credit');
    await page.route('**/queryAccountWalletHistory', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ result: { operations: [] } }),
      })
    );
    await page.reload();
    await expect(page.getByText('Операций по кошельку пока нет.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } catch (error) {
    await info.attach('wallet-read-responses', {
      body: JSON.stringify(historyResponses, null, 2),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await Promise.all(refs.map((ref) => ref.delete()));
    await getAuth().deleteUser(student.uid);
  }
});
