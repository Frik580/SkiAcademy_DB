import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { translations } from '../src/lib/i18n/translations';
import { AUTH_EMULATOR_HOST, functionsCallableUrl } from './emulator-config';
import { loadRuntimeConfig, signInAccount } from './fixtures';
import { ensureFirestore } from './firestore-admin';

const requireRoot = createRequire(import.meta.url);
const {
  AccountSchema,
  AttendanceSchema,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingIdSchema,
  BookingSchema,
  ParticipantIdSchema,
  QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema,
  attendanceIdFromBookingIdentity,
  participantLessonFeedbackIdFromLessonParticipant,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

const callable = 'queryInstructorParticipantRecommendationHistoryReadModels';

test('instructor reads another instructor’s recommendations and loses access on continuation', async ({
  page,
  request,
}, info) => {
  test.setTimeout(180_000);
  const fixture = loadRuntimeConfig();
  const db = ensureFirestore();
  const prefix = `rec_history_${info.repeatEachIndex}_${info.retry}`;
  const participantId = ParticipantIdSchema.parse(fixture.studentParticipantId);
  const siblingId = ParticipantIdSchema.parse(fixture.studentChildParticipantId);
  const instructorId = `${prefix}_author`;
  const authorName = 'Recommendation History Coach';
  const authoredLessonId = `${prefix}_past`;
  const bookedA = `${prefix}_future_a`;
  const bookedB = `${prefix}_future_b`;
  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 3 * 86_400_000);
  const at = timestampFromDate(new Date());
  const audit = {
    createdByCommandId: prefix,
    lastChangedByCommandId: prefix,
    correlationId: prefix,
  };
  const metadata = { revision: 1, createdAt: at, updatedAt: at, audit };
  const ownedPaths: string[] = [];
  const batch = db.batch();
  const seed = (path: string, data: FirebaseFirestore.DocumentData) => {
    ownedPaths.push(path);
    batch.create(db.doc(path), data);
  };

  const signup = await request.post(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { data: { returnSecureToken: true } }
  );
  expect(signup.ok()).toBe(true);
  const { localId: accountId, idToken } = await signup.json();
  seed(`users/${accountId}`, {
    ...AccountSchema.parse({ accountId, lifecycle: { status: 'active' }, ...metadata }),
    uid: accountId,
    displayName: authorName,
    instructorId,
    isInstructor: true,
    role: 'instructor',
  });
  seed(`instructors/${instructorId}`, {
    id: instructorId,
    linkedAccountId: accountId,
    name: authorName,
    specialty: 'ski',
    pricePerHourKZT: 12000,
    isAvailable: true,
    bio: '',
    avatarUrl: '',
    languages: ['English'],
    experienceYears: 3,
  });

  function booking(id: string, person: string, coach: string, start: Date, completed = false) {
    const endsAt = timestampFromDate(new Date(start.getTime() + 3_600_000));
    const occurrenceId = `occ_${id}`;
    seed(
      `bookings/${id}`,
      BookingSchema.parse({
        bookingId: id,
        paymentId: `payment_${id}`,
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId: fixture.studentUid },
        },
        party: { kind: 'individual', participantIds: [person] },
        occurrence: {
          occurrenceId,
          instructorId: coach,
          interval: { startsAt: timestampFromDate(start), endsAt },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [person], frozenAt: at },
        },
        lifecycle: completed
          ? { status: 'completed', completedAt: endsAt }
          : { status: 'confirmed' },
        ...metadata,
        createdAt: completed ? timestampFromDate(start) : at,
      })
    );
    return occurrenceId;
  }

  const occurrenceId = booking(authoredLessonId, participantId, instructorId, past, true);
  booking(bookedA, participantId, fixture.workspaceInstructorId, future);
  booking(
    bookedB,
    siblingId,
    fixture.workspaceInstructorId,
    new Date(future.getTime() + 7_200_000)
  );

  const subject = {
    subjectKind: 'booking' as const,
    bookingId: authoredLessonId,
    occurrenceId,
    participantId,
  };
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId,
  });
  seed(
    `attendance/${attendanceId}`,
    AttendanceSchema.parse({
      attendanceId,
      subject,
      attendanceStatus: 'present',
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: at,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: at,
      revision: 1,
      correlationId: prefix,
    })
  );

  const feedbackId = (person: string, lessonBookingId: string) =>
    participantLessonFeedbackIdFromLessonParticipant({
      participantId: ParticipantIdSchema.parse(person),
      lessonBookingId: BookingIdSchema.parse(lessonBookingId),
    });
  for (const [person, count] of [
    [participantId, 20],
    [siblingId, 1],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const lessonBookingId = `${prefix}_older_${index}`;
      const id = feedbackId(person, lessonBookingId);
      seed(`participant_lesson_feedback/${id}`, {
        feedbackId: id,
        participantId: person,
        lessonBookingId,
        instructorId,
        lessonStartsAt: timestampFromDate(new Date(past.getTime() - (index + 1) * 86_400_000)),
        items: [
          {
            itemId: 'balance',
            text: person === siblingId ? 'Sibling recommendation' : `Practice balance ${index}`,
          },
        ],
        completedItemIds: ['balance'],
        updatedBy: { kind: 'instructor', instructorId, accountId },
        ...metadata,
      });
    }
  }
  const authorText = 'Practice weight transfer';
  const longText = 'ПереносВеса'.repeat(160);
  try {
    await batch.commit();
    ownedPaths.push(`participant_lesson_feedback/${feedbackId(participantId, authoredLessonId)}`);
    const saved = await request.post(functionsCallableUrl('executeCanonicalCommand'), {
      headers: { Authorization: `Bearer ${idToken}` },
      data: {
        data: {
          kind: 'save_participant_lesson_feedback',
          exercisedCapability: 'instructor',
          expectedRevision: 0,
          idempotencyKey: prefix,
          correlationId: prefix,
          intent: {
            participantId,
            lessonBookingId: authoredLessonId,
            items: [
              { itemId: 'weight', text: authorText },
              { itemId: 'long', text: longText },
            ],
          },
        },
      },
      timeout: 60_000,
    });
    expect(saved.ok(), await saved.text()).toBe(true);

    await page.addInitScript(() => {
      localStorage.setItem('alpine_glide_lang', 'en');
      localStorage.setItem('theme', 'dark');
    });
    const requests: string[] = [];
    page.on('request', (outgoing) => {
      if (outgoing.method() === 'POST' && outgoing.url().endsWith(`/${callable}`)) {
        requests.push(outgoing.url());
      }
    });
    await signInAccount(page, {
      email: fixture.instructorEmail,
      password: fixture.instructorPassword,
      expectedPath: '/instructor',
    });

    const open = (name: string, language: 'en' | 'ru' = 'en') =>
      page.getByRole('button', {
        name: `${name}: ${translations[language].lessonContextTitle}`,
        exact: true,
      });
    const dialog = page.getByTestId('instructor-lesson-context');
    const section = dialog.getByRole('region', { name: translations.en.recommendationHistory });
    const toggle = section.getByRole('button', { name: translations.en.recommendationHistory });
    const more = section.getByRole('button', { name: translations.en.historyShowMore });
    await page.setViewportSize({ width: 375, height: 812 });
    await open(fixture.studentDisplayName).focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(requests).toHaveLength(0);
    await toggle.focus();
    const response = page.waitForResponse(
      (incoming) =>
        incoming.request().method() === 'POST' && incoming.url().endsWith(`/${callable}`)
    );
    await page.keyboard.press('Space');
    const payload = await (await response).text();
    const first = QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema.parse(
      JSON.parse(payload).result
    );
    info.annotations.push({
      type: 'response size',
      description: `${Buffer.byteLength(payload)} JSON bytes for ${first.items.length} lessons`,
    });
    console.log(
      `Recommendation history emulator response: ${Buffer.byteLength(payload)} bytes for ${first.items.length} lessons`
    );
    await expect(section.getByRole('article')).toHaveCount(20);
    const newest = section.getByRole('article').first();
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Almaty',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(past);
    await expect(newest.getByText(date, { exact: true })).toBeVisible();
    await expect(newest).toContainText(
      translations.en.recommendationHistoryInstructorNameUnavailable
    );
    await expect(newest).toContainText(authorText);
    await expect(newest.getByText(longText, { exact: true })).toBeVisible();
    await expect(
      newest.getByText(translations.en.recommendationNotMarkedComplete, { exact: true })
    ).toHaveCount(2);
    await expect(
      section.getByText(translations.en.recommendationMarkedComplete, { exact: true })
    ).toHaveCount(19);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(dialog.getByRole('button', { name: translations.en.closeBtn })).toBeVisible();
      await expect(more).toBeEnabled();
    }

    await more.click();
    await expect(section.getByRole('article')).toHaveCount(21);
    await expect(more).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open(fixture.studentDisplayName)).toBeFocused();
    await open(fixture.studentChildDisplayName).click();
    await toggle.click();
    await expect(section.getByText('Sibling recommendation')).toBeVisible();
    await expect(section.getByText(authorText)).toHaveCount(0);
    await page.keyboard.press('Escape');

    await open(fixture.studentDisplayName).click();
    await toggle.click();
    await expect(section.getByRole('article')).toHaveCount(20);
    await db.doc(`bookings/${bookedA}`).delete();
    await more.click();
    await expect(section.getByRole('alert')).toHaveText(translations.en.lessonContextDenied);
    await expect(section.getByRole('article')).toHaveCount(0);
    await expect(more).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByTitle(translations.en.switchToLight).click();
    await page.getByRole('button', { name: 'RU', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await open(fixture.studentChildDisplayName, 'ru').click();
    const russianSection = dialog.getByRole('region', {
      name: translations.ru.recommendationHistory,
    });
    await russianSection
      .getByRole('button', { name: translations.ru.recommendationHistory })
      .click();
    await expect(
      russianSection.getByText(translations.ru.recommendationMarkedComplete)
    ).toBeVisible();
  } finally {
    const cleanup = db.batch();
    for (const path of ownedPaths) cleanup.delete(db.doc(path));
    await cleanup.commit();
    await request.post(
      `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key`,
      { data: { idToken } }
    );
  }
});
