import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { loadRuntimeConfig, signInStudent, watchBrowserFailures } from './fixtures';

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

test('Needs Attention preserves mixed scope, navigation, dismissal and responsive themes', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  expect(process.env.GCLOUD_PROJECT).toBe('demo-ski-school-e2e');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
  const { getApps, initializeApp } = requireFunctions('firebase-admin/app');
  if (!getApps().length) initializeApp({ projectId: 'demo-ski-school-e2e' });
  const db = requireFunctions(
    'firebase-admin/firestore'
  ).getFirestore() as import('firebase-admin/firestore').Firestore;
  const r = loadRuntimeConfig();
  // Every mutable lesson/feedback/attendance identity includes repeat/retry isolation.
  const suffix = `${info.project.name}_p${info.parallelIndex}_r${info.repeatEachIndex}_try${info.retry}`;
  const ids = [r.studentParticipantId, r.studentChildParticipantId];
  const lessons = ['a', 'b'].map((label) => `booking_attention_${label}_${suffix}`);
  const stamp = timestampFromDate(new Date('2026-10-03T06:00:00Z'));
  const end = timestampFromDate(new Date('2026-10-03T07:00:00Z'));
  const audit = {
    createdByCommandId: 'seed_attention',
    lastChangedByCommandId: 'seed_attention',
    correlationId: `correlation_attention_${suffix}`,
  };
  const owned: import('firebase-admin/firestore').DocumentReference[] = [];
  const instructorRef = db.doc(`instructors/${r.instructorId}`);
  const instructorOriginal = await instructorRef.get();
  const accountRef = db.doc(`users/${r.studentUid}`);
  const accountOriginal = await accountRef.get();
  const coachName = 'Александр Константинович Мухамеджанов';
  try {
    await instructorRef.update({ name: coachName });
    for (const [i, participantId] of ids.entries()) {
      const lessonBookingId = lessons[i];
      const occurrenceId = `occurrence_attention_${i}_${suffix}`;
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
          instructorId: r.instructorId,
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
          recordedBy: { kind: 'instructor', instructorId: r.instructorId },
          lastChangedBy: { kind: 'instructor', instructorId: r.instructorId },
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
          instructorId: r.instructorId,
          items: [{ itemId: 'attention_item', text: `Attention practice for ${i ? 'B' : 'A'}` }],
          completedItemIds: [],
          revision: 1,
          createdAt: stamp,
          updatedAt: end,
          audit,
        }),
        lessonDate: '2026-10-03',
        lessonStartsAt: stamp,
      });
    }
    const healthy = watchBrowserFailures(page);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signInStudent(page, r);
    // Home owns account_hot only. Load historical completed lessons through the existing History surface.
    const historyLoaded = page.waitForResponse(
      (response) =>
        response.url().endsWith('/queryLessonBookingReadModels') &&
        response.request().postDataJSON()?.data?.scope === 'account_history'
    );
    await page.goto('/cabinet/history');
    await historyLoaded;
    await page.getByRole('button', { name: 'Home', exact: true }).last().click();
    const tile = page.locator('[data-dashboard-tile="needsAttention"]');
    const row = (id: string) => tile.locator(`[data-attention-lesson="${id}"]`);
    const selector = page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible');
    for (const [i, id] of [
      [0, ids[0]],
      [1, ids[1]],
      [0, ids[0]],
    ] as const) {
      await selector.locator(`[data-participant-id="${id}"]`).click();
      // Current Shell filters Home bookings to the selected participant before this tile.
      // Characterize that existing boundary; account filtering inside the tile is unit-tested separately.
      await expect(
        row(lessons[i]).getByRole('button', { name: 'Write Review', exact: true })
      ).toBeVisible();
      await expect(row(lessons[1 - i])).toHaveCount(0);
      await expect(
        row(lessons[i]).getByRole('button', { name: 'Open recommendations' })
      ).toBeVisible();
      await expect(
        row(lessons[1 - i]).getByRole('button', { name: 'Open recommendations' })
      ).toHaveCount(0);
      await expect(tile.getByRole('listitem')).toHaveCount(1);
      await row(lessons[i]).getByRole('button', { name: 'Open recommendations' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText(`Attention practice for ${i ? 'B' : 'A'}`);
      await expect(dialog).not.toContainText(`Attention practice for ${i ? 'A' : 'B'}`);
      await dialog.getByRole('button', { name: 'Close' }).click();
    }
    await row(lessons[0]).getByRole('button', { name: 'Write Review' }).focus();
    await page.keyboard.press('Enter');
    const review = page
      .locator('.ui-modal')
      .filter({ has: page.locator('#review-comment-textarea') });
    await expect(review).toContainText(coachName);
    // Existing modal's close control is the first button; its markup is outside this slice.
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
      await expect(tile).toContainText(coachName);
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*\bdark\b).*$/);
      expect(await tile.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      for (const button of await tile.getByRole('button').all()) {
        expect(
          await button.evaluate(
            (el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height >= 44
          )
        ).toBe(true);
      }
      await page.keyboard.press('Tab');
      await row(lessons[0]).getByRole('button', { name: 'Оставить отзыв' }).focus();
      expect(
        await row(lessons[0])
          .getByRole('button', { name: 'Оставить отзыв' })
          .evaluate((el) => getComputedStyle(el).outlineStyle)
      ).toBe('solid');
      await tile.screenshot({ path: info.outputPath(`${name}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [i, id] of [
      [0, ids[0]],
      [1, ids[1]],
    ] as const) {
      await selector.locator(`[data-participant-id="${id}"]`).click();
      await row(lessons[i]).getByRole('button', { name: 'Скрыть', exact: true }).click();
    }
    await selector.locator(`[data-participant-id="${ids[0]}"]`).click();
    await expect(tile.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0);
    await expect(
      row(lessons[0]).getByRole('button', { name: 'Открыть рекомендации' })
    ).toBeVisible();
    await expect(row(lessons[1])).toHaveCount(0);
    await page.reload();
    await expect(tile.getByRole('button', { name: 'Оставить отзыв' })).toHaveCount(0);
    // Factual completion fixture removes A's pending state; existing projection determines visibility.
    const aFeedback = db.doc(
      `participant_lesson_feedback/${participantLessonFeedbackIdFromLessonParticipant({ participantId: ids[0] as never, lessonBookingId: lessons[0] as never })}`
    );
    await aFeedback.update({ completedItemIds: ['attention_item'], revision: 2 });
    await page.reload();
    await expect(tile).toHaveCount(0);
    await selector.locator(`[data-participant-id="${ids[1]}"]`).click();
    await expect(
      row(lessons[1]).getByRole('button', { name: 'Открыть рекомендации' })
    ).toBeVisible();
    healthy();
  } finally {
    for (const ref of owned) await ref.delete();
    await instructorRef.set(instructorOriginal.data()!);
    await accountRef.set(accountOriginal.data()!);
  }
});
