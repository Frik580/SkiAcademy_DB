import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';
import { FIRESTORE_EMULATOR_HOST } from './emulator-config';
import { waitForFunctionsEmulatorReady } from './global-setup';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const requireRoot = createRequire(`${process.cwd()}/package.json`);
const {
  BookingSchema,
  PaymentSchema,
  paymentIdFromBookingId,
  AttendanceSchema,
  ParticipantLessonFeedbackSchema,
  participantLessonFeedbackIdFromLessonParticipant,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

test('Latest recommendation preserves participant scope, lesson navigation and Stitch themes', async ({
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
  const r = loadRuntimeConfig();
  // Every mutable lesson/feedback/attendance identity includes repeat/retry isolation.
  const suffix = `${info.project.name}_p${info.parallelIndex}_r${info.repeatEachIndex}_try${info.retry}`;
  const ids = [r.studentParticipantId, r.studentChildParticipantId];
  const lessons = ['a', 'b'].map((label) => `booking_latest_${label}_${suffix}`);
  const coachNames = [
    'Александр Константинович Мухамеджанов — тренер участника A',
    'Coach for participant B',
  ] as const;
  const secondInstructorId = `instructor_latest_b_${suffix}`;
  const stamp = timestampFromDate(new Date('2026-10-03T06:00:00Z'));
  const end = timestampFromDate(new Date('2026-10-03T07:00:00Z'));
  const audit = {
    createdByCommandId: 'seed_latest',
    lastChangedByCommandId: 'seed_latest',
    correlationId: `correlation_latest_${suffix}`,
  };
  const owned: import('firebase-admin/firestore').DocumentReference[] = [];
  const instructorIds = [`instructor_latest_a_${suffix}`, secondInstructorId];
  try {
    for (const [i, instructorId] of instructorIds.entries()) {
      const ref = db.doc(`instructors/${instructorId}`);
      owned.push(ref);
      await ref.create({
        id: instructorId,
        name: coachNames[i],
        specialty: 'ski',
        pricePerHour: 50,
        pricePerHourKZT: 12_000,
        bio: 'Playwright end-to-end instructor fixture.',
        avatarUrl: '',
        isAvailable: true,
        rating: 5,
        reviewsCount: 0,
        languages: ['English'],
        experienceYears: 5,
      });
    }
    for (const [i, participantId] of ids.entries()) {
      const lessonBookingId = lessons[i];
      const occurrenceId = `occurrence_latest_${i}_${suffix}`;
      const instructorId = instructorIds[i];
      const booking = BookingSchema.parse({
        bookingId: lessonBookingId,
        paymentId: paymentIdFromBookingId(lessonBookingId as never),
        payerAccountId: r.studentUid,
        attribution: {
          bookingOrigin: 'account',
          bookedBy: { kind: 'account', accountId: r.studentUid },
        },
        party: { kind: 'individual', participantIds: [participantId] },
        occurrence: {
          occurrenceId,
          instructorId,
          interval: { startsAt: stamp, endsAt: end },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [participantId], frozenAt: end },
        },
        lifecycle: { status: 'completed', completedAt: end },
        revision: 1,
        createdAt: stamp,
        updatedAt: end,
        audit,
      });
      const bookingRef = db.doc(`bookings/${lessonBookingId}`);
      owned.push(bookingRef);
      await bookingRef.create(booking);
      const paymentRef = db.doc(`payments/${booking.paymentId}`);
      owned.push(paymentRef);
      await paymentRef.create(
        PaymentSchema.parse({
          paymentId: booking.paymentId,
          subjectType: 'booking',
          subjectId: lessonBookingId,
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
          payerAccountId: r.studentUid,
          incrementalRequirements: [],
          revision: 1,
          eventRevision: 1,
          createdAt: stamp,
          updatedAt: end,
        })
      );
      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: occurrenceId as never,
        participantId: participantId as never,
      });
      const attendanceRef = db.doc(`attendance/${attendanceId}`);
      owned.push(attendanceRef);
      await attendanceRef.create(
        AttendanceSchema.parse({
          attendanceId,
          subject: {
            subjectKind: 'booking',
            bookingId: lessonBookingId,
            occurrenceId,
            participantId,
          },
          attendanceStatus: 'present',
          recordedBy: { kind: 'instructor', instructorId },
          lastChangedBy: { kind: 'instructor', instructorId },
          recordedAt: end,
          updatedAt: end,
          revision: 1,
          correlationId: audit.correlationId,
        })
      );
      const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
        participantId: participantId as never,
        lessonBookingId: lessonBookingId as never,
      });
      const feedbackRef = db.doc(`participant_lesson_feedback/${feedbackId}`);
      owned.push(feedbackRef);
      await feedbackRef.create({
        ...ParticipantLessonFeedbackSchema.parse({
          feedbackId,
          participantId,
          lessonBookingId,
          instructorId,
          items: [
            { itemId: 'done_first', text: `Completed preparation for ${i ? 'B' : 'A'}` },
            {
              itemId: 'highlight',
              text: i
                ? 'Completed balance practice for B'
                : 'Держи корпус спокойным и переноси вес раньше, до входа в дугу. На крутом спаде не жди упора в кант, отпускай голеностоп мягче. Повторяй движение плавно, сохраняя устойчивое положение корпуса.',
            },
          ],
          completedItemIds: i ? ['done_first', 'highlight'] : ['done_first'],
          revision: 1,
          createdAt: stamp,
          updatedAt: end,
          audit,
        }),
        ...(i === 0 ? { lessonDate: '2026-10-03' } : {}),
        lessonStartsAt: stamp,
      });
    }
    const healthy = watchBrowserFailures(page);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForFunctionsEmulatorReady();
    await test.step('Authenticate the fixture account', () => signInStudent(page, r));
    const tile = page.locator('[data-dashboard-tile="instructorRecommendations"]');
    const attention = page.locator('[data-dashboard-tile="needsAttention"]');
    const selector = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    const quoteA = 'Держи корпус спокойным и переноси вес раньше, до входа в дугу.';
    // Cold Home has canonical feedback without historical Booking context: ID navigation remains available.
    await test.step('Select B on cold Home', async () => {
      const selectB = selector.locator(`[data-participant-id="${ids[1]}"]`);
      await expect(selectB).toBeVisible({ timeout: 60_000 });
      await selectB.click({ timeout: 15_000 });
    });
    await expect(tile).toContainText('Completed balance practice for B');
    await expect(tile.locator('.sc-latest-recommendation-name')).toHaveCount(0);
    await expect(tile.locator('.sc-latest-recommendation-date')).toHaveCount(0);
    await expect(tile.getByLabel('New recommendations from instructor')).toHaveCount(0);
    await tile.getByRole('button', { name: 'Details', exact: true }).click();
    const coldDialog = page.getByRole('dialog');
    await expect(coldDialog).toContainText('Completed balance practice for B');
    await expect(coldDialog).not.toContainText(quoteA);
    await coldDialog.getByRole('button', { name: 'Close' }).click();

    // Existing History owns completed lessons and supplies optional instructor metadata.
    const historyLoaded = page.waitForResponse(
      (response) =>
        response.url().endsWith('/queryLessonBookingReadModels') &&
        response.request().postDataJSON()?.data?.scope === 'account_history'
    );
    await page.goto('/cabinet/history', { waitUntil: 'domcontentloaded' });
    await historyLoaded;
    await page.getByRole('button', { name: 'Home', exact: true }).last().click();
    const weather = page.locator('[data-dashboard-tile="weather"] section');
    // Weather is conditional on a session today; these isolated lessons are historical.
    await expect(weather).toHaveCount(0);
    const journey = page.locator('#your-journey');
    for (const [i, id] of [
      [0, ids[0]],
      [1, ids[1]],
      [0, ids[0]],
    ] as const) {
      await selector.locator(`[data-participant-id="${id}"]`).click();
      await expect(tile).toContainText(i ? 'Completed balance practice for B' : quoteA);
      await expect(tile).not.toContainText(i ? quoteA : 'Completed balance practice for B');
      await expect(tile.locator('[data-participant-scope]')).toHaveAttribute(
        'data-participant-scope',
        id
      );
      await expect(tile).toContainText(coachNames[i]);
      await expect(tile.getByLabel('New recommendations from instructor')).toHaveCount(i ? 0 : 1);
      await expect(journey).toBeVisible();
      await expect(attention).toBeVisible();
      // Issue #82: both account review prompts survive A/B switching.
      for (const lesson of lessons)
        await expect(
          attention
            .locator(`[data-attention-lesson="${lesson}"]`)
            .getByRole('button', { name: 'Write Review', exact: true })
        ).toBeVisible();
      await tile.getByRole('button', { name: 'Details', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(i ? 'Completed balance practice for B' : quoteA);
      await expect(dialog).not.toContainText(i ? quoteA : 'Completed balance practice for B');
      await expect(dialog).toContainText(coachNames[i]);
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(weather).toHaveCount(0);
    }
    await attention
      .locator(`[data-attention-lesson="${lessons[0]}"]`)
      .getByRole('button', { name: 'Open recommendations' })
      .click();
    await expect(page.getByRole('dialog')).toContainText(quoteA);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await attention
      .locator(`[data-attention-lesson="${lessons[1]}"]`)
      .getByRole('button', { name: 'Write Review', exact: true })
      .click();
    const review = page
      .locator('.ui-modal')
      .filter({ has: page.locator('#review-comment-textarea') });
    await expect(review).toContainText(coachNames[1]);
    await review.getByRole('button').first().click();
    await page
      .getByRole('group', { name: /Switch language|Сменить язык/ })
      .getByRole('button', { name: 'RU', exact: true })
      .click();
    for (const [name, width, dark] of [
      ['desktop-light', 1440, false],
      ['mobile-light', 390, false],
      ['desktop-dark', 1440, true],
      ['mobile-dark', 390, true],
      ['narrow-light', 320, false],
      ['narrow-dark', 320, true],
      ['reference-desktop-light', 1334, false],
      ['reference-desktop-dark', 1334, true],
    ] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => {
        localStorage.setItem('theme', value ? 'dark' : 'light');
        document.documentElement.classList.toggle('dark', value);
        window.dispatchEvent(new Event('theme-change'));
      }, dark);
      await tile.scrollIntoViewIfNeeded();
      await expect(tile).toContainText(quoteA);
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*\bdark\b).*$/);
      expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      const action = tile.getByRole('button', { name: 'Подробнее', exact: true });
      expect(
        await action.evaluate(
          (el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height >= 44
        )
      ).toBe(true);
      await page.keyboard.press('Tab');
      await action.focus();
      expect(await action.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      if (width <= 390) {
        const bottomNav = await page.locator('[data-student-tab-bar="true"]').boundingBox();
        const actionBounds = await action.boundingBox();
        if (bottomNav && actionBounds && actionBounds.y + actionBounds.height > bottomNav.y) {
          await page.evaluate(
            (distance) => window.scrollBy({ top: distance, behavior: 'instant' }),
            actionBounds.y + actionBounds.height - bottomNav.y + 16
          );
        }
        expect(
          await action.evaluate((el) => el.getBoundingClientRect().bottom)
        ).toBeLessThanOrEqual(bottomNav?.y ?? Number.POSITIVE_INFINITY);
      }
      await tile.screenshot({ path: info.outputPath(`${name}.png`) });
    }
    await tile.getByRole('button', { name: 'Подробнее', exact: true }).press('Enter');
    await expect(page.getByRole('dialog')).toContainText(quoteA);
    await page.getByRole('dialog').getByRole('button', { name: 'Закрыть' }).click();
    // Empty state is deterministic after removing only this test's feedback fixture.
    await db
      .doc(
        `participant_lesson_feedback/${participantLessonFeedbackIdFromLessonParticipant({ participantId: ids[0] as never, lessonBookingId: lessons[0] as never })}`
      )
      .delete();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(tile).toContainText('Пока нет рекомендаций от тренера');
    await expect(tile.getByRole('button')).toHaveCount(0);
    await expect(tile).not.toContainText(quoteA);
    healthy();
  } finally {
    await Promise.all(owned.map((ref) => ref.delete()));
  }
});
