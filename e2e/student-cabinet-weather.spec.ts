import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { loadRuntimeConfig, signInStudent, signInStudentB, watchBrowserFailures } from './fixtures';
import { FIRESTORE_EMULATOR_HOST } from './emulator-config';
import { waitForFunctionsEmulatorReady } from './global-setup';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const { BookingSchema, PaymentSchema, paymentIdFromBookingId, timestampFromDate } = requireRoot(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

test('Student Cabinet weather shares data and unit preference across participants and themes', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe(FIRESTORE_EMULATOR_HOST);

  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  const db = requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
  const runtime = loadRuntimeConfig();
  const suffix = `${info.project.name}_w${info.workerIndex}_r${info.repeatEachIndex}_try${info.retry}`;
  const bookingId = `booking_weather_${suffix}`;
  const paymentId = paymentIdFromBookingId(bookingId as never);
  const occurrenceId = `occurrence_weather_${suffix}`;
  const startsAt = timestampFromDate(new Date('2026-10-11T05:00:00.000Z'));
  const endsAt = timestampFromDate(new Date('2026-10-11T06:00:00.000Z'));
  const audit = {
    createdByCommandId: 'seed_weather',
    lastChangedByCommandId: 'seed_weather',
    correlationId: `correlation_weather_${suffix}`,
  };
  const bookingRef = db.doc(`bookings/${bookingId}`);
  const paymentRef = db.doc(`payments/${paymentId}`);
  const weatherRequests: string[] = [];
  const mockNow = new Date('2026-10-11T02:00:00.000Z');
  const mockCurrentTime = Math.floor(mockNow.getTime() / 1000);
  const mockHour = Math.floor(mockCurrentTime / 3600) * 3600;

  try {
    await bookingRef.create(
      BookingSchema.parse({
        bookingId,
        paymentId,
        payerAccountId: runtime.studentUid,
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: runtime.studentUid },
        },
        party: { kind: 'individual', participantIds: [runtime.studentParticipantId] },
        occurrence: {
          occurrenceId,
          instructorId: runtime.instructorId,
          interval: { startsAt, endsAt },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [runtime.studentParticipantId], frozenAt: endsAt },
        },
        lifecycle: { status: 'confirmed' },
        revision: 1,
        createdAt: startsAt,
        updatedAt: startsAt,
        audit,
      })
    );
    await paymentRef.create(
      PaymentSchema.parse({
        paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
        currency: 'KZT',
        originalPrice: 10000,
        price: 10000,
        paidAmount: 10000,
        refundedAmount: 0,
        retainedAmount: 10000,
        settledAmount: 10000,
        writtenOffAmount: 0,
        outstandingAmount: 0,
        paymentStatus: 'paid',
        payerAccountId: runtime.studentUid,
        incrementalRequirements: [],
        revision: 1,
        eventRevision: 1,
        createdAt: startsAt,
        updatedAt: startsAt,
      })
    );

    const healthy = watchBrowserFailures(page);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.route('https://api.open-meteo.com/v1/forecast**', async (route) => {
      weatherRequests.push(route.request().url());
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          current: {
            time: mockCurrentTime,
            temperature_2m: -4,
            apparent_temperature: -6,
            weather_code: 0,
            wind_speed_10m: 12,
            wind_gusts_10m: 17,
          },
          hourly: {
            time: [mockHour],
            snow_depth: [0.82],
            visibility: [12000],
          },
        }),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('alpine_glide_lang', 'en');
      localStorage.setItem('carve_temperature_unit', 'celsius');
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await waitForFunctionsEmulatorReady();
    await signInStudent(page, runtime);
    await page.clock.install({ time: mockNow });
    await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });

    const tile = page.locator('[data-dashboard-tile="weather"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText('Clear');
    await expect(tile).toContainText('82 cm');
    await expect(tile).toContainText('12 km/h');
    await expect(tile).toContainText('Excellent');
    await expect(tile.getByTestId('weather-temperature')).toHaveText('-4°C');
    const resortName = await tile.locator('[data-weather-resort-name]').textContent();
    expect(resortName?.trim()).toBeTruthy();
    await expect.poll(() => weatherRequests.length).toBe(1);

    const participantSwitcher = page
      .getByRole('banner')
      .getByTestId('navbar-participant-switcher')
      .filter({ visible: true });
    const selectParticipant = (participantId: string) =>
      participantSwitcher.locator(`[data-participant-id="${participantId}"]`);
    await selectParticipant(runtime.studentChildParticipantId).click();
    await expect(selectParticipant(runtime.studentChildParticipantId)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(tile).toBeVisible();
    await expect(tile.locator('[data-weather-resort-name]')).toHaveText(resortName!.trim());
    await expect(tile).toContainText('82 cm');
    await selectParticipant(runtime.studentParticipantId).click();
    await expect(selectParticipant(runtime.studentParticipantId)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(tile.getByTestId('weather-temperature')).toHaveText('-4°C');
    expect(weatherRequests).toHaveLength(1);

    const cabinetUnitButton = tile.getByRole('button', {
      name: /Switch temperature to Fahrenheit/,
    });
    await cabinetUnitButton.focus();
    await expect(cabinetUnitButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tile.getByRole('button', { name: /Switch temperature to Celsius/ })).toHaveText(
      '25°F'
    );
    expect(weatherRequests).toHaveLength(1);

    for (const [name, width, height, dark] of [
      ['desktop-light', 1440, 1000, false],
      ['mobile-light', 390, 844, false],
      ['desktop-dark', 1440, 1000, true],
      ['mobile-dark', 390, 844, true],
      ['narrow-light', 320, 844, false],
      ['narrow-dark', 320, 844, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (isDark) => document.documentElement.classList.toggle('dark', isDark),
        dark
      );
      await tile.scrollIntoViewIfNeeded();
      expect(await tile.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      const button = tile.getByRole('button', { name: /Switch temperature to Celsius/ });
      const buttonBox = await button.boundingBox();
      expect(buttonBox?.width).toBeGreaterThanOrEqual(44);
      expect(buttonBox?.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(height - 56);
      const screenshotPath = info.outputPath(`${name}.png`);
      await tile.screenshot({ path: screenshotPath });
      await info.attach(name, { path: screenshotPath, contentType: 'image/png' });
    }

    expect(await page.evaluate(() => localStorage.getItem('carve_temperature_unit'))).toBe(
      'fahrenheit'
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(tile).toBeVisible();
    await expect(tile.getByTestId('weather-temperature')).toHaveText('25°F');
    await expect.poll(() => weatherRequests.length).toBe(2);

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible();
    await signInStudentB(page, runtime);
    await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-dashboard-tile="weather"]')).toHaveCount(0);
    healthy();
  } finally {
    await Promise.all([bookingRef.delete(), paymentRef.delete()]);
  }
});
