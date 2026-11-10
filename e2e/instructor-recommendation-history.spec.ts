import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';
import { DEFAULT_SKILL_CONFIG, getSkillItemTitle } from '../src/domain/achievements';
import { MASTERY_LEVELS } from '@ski-academy/shared-domain/canonical/participantLevelProgression';
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
  ParticipantProgressSchema,
  QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema,
  attendanceIdFromBookingIdentity,
  participantLessonFeedbackIdFromLessonParticipant,
  timestampFromDate,
} = requireRoot('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');

const callable = 'queryInstructorParticipantRecommendationHistoryReadModels';
const progressHistoryCallable = 'queryParticipantProgressHistoryReadModels';

test('instructor lesson context combines live progress, homework and recommendations and reauthorizes both histories', async ({
  page,
  request,
}, info) => {
  test.setTimeout(300_000);
  const fixture = loadRuntimeConfig();
  const db = ensureFirestore();
  const prefix = `rec_history_${info.repeatEachIndex}_${info.retry}`;
  const participantId = ParticipantIdSchema.parse(fixture.studentParticipantId);
  const siblingId = ParticipantIdSchema.parse(fixture.studentChildParticipantId);
  const instructorId = `${prefix}_author`;
  const authorName = 'Recommendation History Coach';
  const authorEmail = `${prefix}-author@e2e.test`;
  const authorPassword = 'history-coach-password';
  const authoredLessonId = `${prefix}_past`;
  const bookedA = `${prefix}_future_a`;
  const bookedB = `${prefix}_started`;
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
    { data: { email: authorEmail, password: authorPassword, returnSecureToken: true } }
  );
  expect(signup.ok()).toBe(true);
  const { localId: accountId, idToken } = await signup.json();
  const unrelatedSignup = await request.post(
    `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    { data: { returnSecureToken: true } }
  );
  expect(unrelatedSignup.ok()).toBe(true);
  const unrelated = await unrelatedSignup.json();
  for (const [uid, coach, name, email] of [
    [accountId, instructorId, authorName, authorEmail],
    [unrelated.localId, `${prefix}_unrelated`, 'Unrelated History Coach', null],
  ]) {
    seed(`users/${uid}`, {
      ...AccountSchema.parse({ accountId: uid, lifecycle: { status: 'active' }, ...metadata }),
      uid,
      ...(email ? { email } : {}),
      displayName: name,
      avatarUrl: '',
      instructorId: coach,
      isInstructor: true,
      role: 'user',
    });
    seed(`instructors/${coach}`, {
      id: coach,
      linkedAccountId: uid,
      name,
      specialty: 'ski',
      pricePerHourKZT: 12000,
      isAvailable: true,
      bio: '',
      avatarUrl: '',
      languages: ['English'],
      experienceYears: 3,
    });
  }

  function booking(
    id: string,
    person: string,
    coach: string,
    start: Date,
    completed = false,
    family = false
  ) {
    const endsAt = timestampFromDate(new Date(start.getTime() + 3_600_000));
    const occurrenceId = `occ_${id}`;
    const participantIds = family ? [person, siblingId] : [person];
    seed(
      `bookings/${id}`,
      BookingSchema.parse({
        bookingId: id,
        paymentId: `payment_${id}`,
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId: fixture.studentUid },
        },
        party: { kind: family ? 'family_group' : 'individual', participantIds },
        occurrence: {
          occurrenceId,
          instructorId: coach,
          interval: { startsAt: timestampFromDate(start), endsAt },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds, frozenAt: at },
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
  booking(bookedA, participantId, fixture.workspaceInstructorId, future, false, true);
  const started = new Date(Date.now() - 15 * 60_000);
  const currentOccurrenceId = booking(
    bookedB,
    participantId,
    fixture.workspaceInstructorId,
    started
  );

  for (const [bookingId, lessonOccurrenceId, coach] of [
    [authoredLessonId, occurrenceId, instructorId],
    [bookedB, currentOccurrenceId, fixture.workspaceInstructorId],
  ]) {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: lessonOccurrenceId,
      participantId,
    });
    seed(
      `attendance/${attendanceId}`,
      AttendanceSchema.parse({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId: lessonOccurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId: coach },
        recordedAt: at,
        lastChangedBy: { kind: 'instructor', instructorId: coach },
        updatedAt: at,
        revision: 1,
        correlationId: prefix,
      })
    );
  }

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
  const [zero, maximum, unrated] = DEFAULT_SKILL_CONFIG.items;
  const currentComment = 'Context observation 21';
  const legacyComment = 'Legacy observation with unknown author';
  const homeworkText = 'First participant homework';
  const siblingHomework = 'Second participant homework';
  const observation = (revision: number) => `Context observation ${revision}`;
  const observedAt = new Date('2026-01-02T20:15:00Z');
  seed(
    `participant_progress/${participantId}`,
    ParticipantProgressSchema.parse({
      ...metadata,
      revision: 21,
      participantId,
      level: 2,
      skillScores: { [zero.id]: 0, [maximum.id]: maximum.maxPoints },
      skillComments: { [zero.id]: currentComment, [maximum.id]: legacyComment },
      skillCommentAttribution: {
        [zero.id]: { instructorId, accountId, updatedAt: at, revision: 21 },
      },
    })
  );
  for (let revision = 1; revision <= 21; revision++) {
    seed(`participant_progress_events/${participantId}_context_${revision}`, {
      participantId,
      revision,
      at: timestampFromDate(observedAt),
      kind: 'update_participant_progress',
      instructorId: revision % 2 ? instructorId : fixture.workspaceInstructorId,
      oldScores: revision === 1 ? {} : { [maximum.id]: maximum.maxPoints },
      newScores: { [maximum.id]: maximum.maxPoints, ...(revision === 21 ? { [zero.id]: 0 } : {}) },
      oldComments: revision === 1 ? {} : { [zero.id]: observation(revision - 1) },
      newComments: { [zero.id]: observation(revision) },
    });
  }
  for (const [id, person, text] of [
    ['first', participantId, homeworkText],
    ['second', siblingId, siblingHomework],
  ]) {
    seed(`bookings/${bookedA}/messages/${id}`, {
      bookingId: bookedA,
      timestamp: observedAt.toISOString(),
      text,
      isHomework: true,
      homeworkForParticipantIds: [person],
    });
  }
  const authorText = 'Practice weight transfer';
  const longText = 'ПереносВеса'.repeat(160);
  let seeded = false;
  try {
    await batch.commit();
    seeded = true;
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

    const instructorAuth = await request.post(
      `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
      {
        data: {
          email: fixture.instructorEmail,
          password: fixture.instructorPassword,
          returnSecureToken: true,
        },
      }
    );
    expect(instructorAuth.ok()).toBe(true);
    const { idToken: workspaceToken } = await instructorAuth.json();
    for (const [kind, expectedRevision, intent] of [
      [
        'update_participant_progress',
        0,
        {
          participantId: siblingId,
          level: 1,
          skillScores: { [zero.id]: 1 },
          skillComments: {},
        },
      ],
      [
        'save_participant_lesson_feedback',
        0,
        {
          participantId,
          lessonBookingId: bookedA,
          items: [{ itemId: 'future', text: 'E2E attempted future recommendation' }],
        },
      ],
      [
        'save_participant_lesson_feedback',
        1,
        {
          participantId,
          lessonBookingId: authoredLessonId,
          items: [{ itemId: 'foreign', text: 'E2E attempted edit of another coach' }],
        },
      ],
    ] as const) {
      const key = `${prefix}_denied_${kind}_${expectedRevision}`;
      const response = await request.post(functionsCallableUrl('executeCanonicalCommand'), {
        headers: { Authorization: `Bearer ${workspaceToken}` },
        data: {
          data: {
            kind,
            intent,
            expectedRevision,
            exercisedCapability: 'instructor',
            ...(kind === 'update_participant_progress' ? { participantProgressContract: 2 } : {}),
            idempotencyKey: key,
            correlationId: key,
          },
        },
      });
      const body = await response.json();
      expect(body.error?.status, `${kind}: ${JSON.stringify(body)}`).toBe('PERMISSION_DENIED');
      expect(body.error?.details?.code).toBe('forbidden');
    }
    expect((await db.doc(`participant_progress/${participantId}`).get()).data()?.revision).toBe(21);
    expect(
      (await db.doc(`participant_lesson_feedback/${feedbackId(participantId, bookedA)}`).get())
        .exists
    ).toBe(false);

    expect((await db.doc(`participant_progress/${siblingId}`).get()).exists).toBe(false);
    const historicalFeedback = (
      await db
        .doc(`participant_lesson_feedback/${feedbackId(participantId, authoredLessonId)}`)
        .get()
    ).data();
    expect(historicalFeedback?.revision).toBe(1);
    expect(historicalFeedback?.items[0]?.text).toBe(authorText);

    for (const name of [progressHistoryCallable, callable]) {
      const data = {
        data: { scope: 'instructor', participantId, idempotencyKey: `read_${prefix}_denied` },
      };
      const unsigned = await request.post(functionsCallableUrl(name), { data });
      expect((await unsigned.json()).error.status).toBe('UNAUTHENTICATED');
      const outsideScope = await request.post(functionsCallableUrl(name), {
        headers: { Authorization: `Bearer ${unrelated.idToken}` },
        data,
      });
      expect((await outsideScope.json()).error.status).toBe('PERMISSION_DENIED');
    }

    const schedule = await request.post(functionsCallableUrl('queryLessonBookingReadModels'), {
      headers: { Authorization: `Bearer ${workspaceToken}` },
      data: { data: { scope: 'instructor_hot', idempotencyKey: `read_${prefix}_schedule` } },
      timeout: 60_000,
    });
    expect(schedule.ok(), await schedule.text()).toBe(true);
    expect(
      (await schedule.json()).result.items.map((item: { bookingId: string }) => item.bookingId)
    ).toEqual(expect.arrayContaining([bookedA, bookedB]));

    await page.addInitScript(() => {
      localStorage.setItem('alpine_glide_lang', 'en');
      localStorage.setItem('theme', 'dark');
    });
    const requests = { recommendations: 0, progress: 0, homework: 0 };
    page.on('request', (outgoing) => {
      if (outgoing.method() !== 'POST') return;
      if (outgoing.url().endsWith(`/${callable}`)) requests.recommendations++;
      if (outgoing.url().endsWith(`/${progressHistoryCallable}`)) requests.progress++;
      if (
        outgoing.url().includes('/google.firestore.v1.Firestore/Listen/channel') &&
        decodeURIComponent(outgoing.postData() ?? '').includes('isHomework')
      )
        requests.homework++;
    });
    const snapshot = (action: string) => ({ action, ...requests });
    const traffic: ReturnType<typeof snapshot>[] = [];
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
    traffic.push(snapshot('schedule'));
    expect(requests).toEqual({ recommendations: 0, progress: 0, homework: 0 });
    const dialog = page.getByTestId('instructor-lesson-context');
    const section = dialog.getByRole('region', { name: translations.en.recommendationHistory });
    const toggle = section.getByRole('button', { name: translations.en.recommendationHistory });
    const more = section.getByRole('button', { name: translations.en.historyShowMore });
    await page.setViewportSize({ width: 375, height: 812 });
    const fromBooking = (id: string, name: string) =>
      page.locator(`#instructor-lesson-${id}`).getByRole('button', {
        name: `${name}: ${translations.en.lessonContextTitle}`,
        exact: true,
      });
    const primary = fromBooking(bookedA, fixture.studentDisplayName);
    const secondary = fromBooking(bookedB, fixture.studentDisplayName);
    await expect(primary).toBeVisible({ timeout: 90_000 });
    await expect(secondary).toBeVisible();
    await primary.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const current = dialog.getByRole('region', { name: translations.en.lessonContextSkills });
    const comments = dialog.getByRole('region', { name: translations.en.lessonContextComments });
    const history = dialog.getByRole('region', { name: translations.en.learningHistory });
    const historyToggle = history.getByRole('button', { name: translations.en.learningHistory });
    const historyMore = history.getByRole('button', { name: translations.en.historyShowMore });
    const homework = dialog.getByRole('region', { name: translations.en.scCoachHomework });
    const homeworkToggle = homework.getByRole('button', { name: translations.en.scCoachHomework });
    await expect(
      dialog.getByRole('heading', {
        name: `${translations.en.lessonContextTitle}: ${fixture.studentDisplayName}`,
      })
    ).toBeVisible();
    await expect(
      dialog.getByText(`${translations.en.instructorCurrentLevel}: ${MASTERY_LEVELS[1].name}`, {
        exact: true,
      })
    ).toBeVisible();
    for (const skill of [zero, maximum, unrated]) {
      const name = MASTERY_LEVELS.find((level) => level.id === skill.levelTarget)!.name;
      const group = current.getByRole('button', { name: new RegExp(`^${name} \\d+$`) });
      if ((await group.getAttribute('aria-expanded')) === 'false') await group.click();
    }
    for (const [skill, score] of [
      [zero, `0 / ${zero.maxPoints} · 0%`],
      [maximum, `${maximum.maxPoints} / ${maximum.maxPoints} · 100%`],
      [unrated, `Not evaluated / ${unrated.maxPoints}`],
    ] as const) {
      const row = current.getByRole('listitem').filter({
        has: page.getByText(getSkillItemTitle(skill, 'en'), { exact: true }),
      });
      await expect(row.getByText(score, { exact: true })).toBeVisible();
    }
    await expect(current.locator('progress')).toHaveCount(0);
    await expect(
      comments
        .getByRole('article')
        .filter({ hasText: currentComment })
        .locator('[data-instructor-id]')
    ).toHaveAttribute('data-instructor-id', instructorId);
    await expect(comments.getByRole('article').filter({ hasText: legacyComment })).toContainText(
      translations.en.historyAuthorUnknown
    );
    await expect(dialog.getByText(translations.en.lessonContextFeedbackUnavailable)).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: translations.en.instructorAssess, exact: true })
    ).toHaveCount(0);
    const close = dialog.getByRole('button', { name: translations.en.closeBtn });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: translations.en.instructorViewProgress })
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(homeworkToggle).toHaveAttribute('aria-expanded', 'false');
    traffic.push(snapshot('open card'));
    expect(requests).toEqual({ recommendations: 0, progress: 0, homework: 0 });

    const matchesCallable = (name: string) => (incoming: import('@playwright/test').Response) =>
      incoming.request().method() === 'POST' && incoming.url().endsWith(`/${name}`);
    const progressResponse = page.waitForResponse(matchesCallable(progressHistoryCallable));
    await historyToggle.focus();
    await page.keyboard.press('Space');
    expect((await progressResponse).ok()).toBe(true);
    const observations = history.getByRole('article');
    await expect(observations).toHaveCount(20);
    await expect(observations.first()).toContainText(observation(21));
    await expect(observations.first().locator('[data-instructor-id]')).toHaveAttribute(
      'data-instructor-id',
      instructorId
    );
    await expect(observations.nth(1).locator('[data-instructor-id]')).toHaveAttribute(
      'data-instructor-id',
      fixture.workspaceInstructorId
    );
    await expect(observations.first().locator('[aria-label="Previous score"]')).toHaveText(
      `Not evaluated / ${zero.maxPoints}`
    );
    await expect(observations.first().locator('[aria-label="New score"]')).toHaveText(
      `0 / ${zero.maxPoints} · 0%`
    );
    await expect(observations.first().locator('time')).toHaveText(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Almaty',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(observedAt)
    );
    traffic.push(snapshot('expand learning history'));
    expect(requests).toEqual({ recommendations: 0, progress: 1, homework: 0 });

    await page.route(`**/${progressHistoryCallable}`, (route) => route.abort('failed'), {
      times: 1,
    });
    await historyMore.click();
    await expect(history.getByRole('alert')).toContainText(translations.en.historyError);
    await expect(observations).toHaveCount(20);
    await history.getByRole('button', { name: translations.en.retry }).click();
    await expect(
      observations.locator('p.whitespace-pre-wrap').filter({ visible: true })
    ).toHaveText(Array.from({ length: 21 }, (_, index) => observation(21 - index)));
    await expect(historyMore).toHaveCount(0);
    traffic.push(snapshot('learning continuation, failed transport and retry'));
    expect(requests).toEqual({ recommendations: 0, progress: 3, homework: 0 });

    await homeworkToggle.click();
    await expect(homework.getByText(translations.en.lessonHomeworkScope)).toBeVisible();
    await expect(homework.getByRole('article')).toHaveCount(1);
    await expect(homework.getByText(homeworkText)).toBeVisible();
    await expect(homework.getByText(siblingHomework)).toHaveCount(0);
    traffic.push(snapshot('expand homework'));
    expect(requests.homework).toBeGreaterThan(0);
    expect(requests.recommendations).toBe(0);
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
    traffic.push(snapshot('expand recommendation history'));
    expect(requests.recommendations).toBe(1);
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

    await page.route(`**/${callable}`, (route) => route.abort('failed'), { times: 1 });
    await more.click();
    await expect(section.getByRole('alert')).toBeVisible();
    await expect(section.getByRole('article')).toHaveCount(20);
    await section.getByRole('button', { name: translations.en.retry }).click();
    await expect(section.getByRole('article')).toHaveCount(21);
    await expect(more).toHaveCount(0);
    traffic.push(snapshot('recommendation continuation, failed transport and retry'));
    expect(requests.recommendations).toBe(3);
    await info.attach('lesson-context-request-counts', {
      body: JSON.stringify(traffic, null, 2),
      contentType: 'application/json',
    });
    console.table(traffic);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(primary).toBeFocused();
    // Let a genuine response from the first participant arrive after the second one loads.
    const progressRoute = `**/${progressHistoryCallable}`;
    let releaseHistory!: () => void;
    const historyGate = new Promise<void>((resolve) => {
      releaseHistory = resolve;
    });
    let firstHistoryRequest = true;
    await page.route(progressRoute, async (route) => {
      if (route.request().method() === 'POST' && firstHistoryRequest) {
        firstHistoryRequest = false;
        await historyGate;
      }
      await route.continue();
    });
    try {
      await primary.click();
      const startedHistory = page.waitForRequest(
        (outgoing) =>
          outgoing.method() === 'POST' && outgoing.url().endsWith(`/${progressHistoryCallable}`)
      );
      await historyToggle.click();
      const staleRequest = await startedHistory;
      await expect(history.getByRole('status')).toHaveText(translations.en.historyLoading);
      await page.keyboard.press('Escape');
      await fromBooking(bookedA, fixture.studentChildDisplayName).click();
      await expect(dialog.getByText(currentComment)).toHaveCount(0);
      await historyToggle.click();
      await expect(history.getByText(translations.en.historyEmpty)).toBeVisible();
      const staleResponse = page.waitForResponse((incoming) => incoming.request() === staleRequest);
      releaseHistory();
      expect((await staleResponse).ok()).toBe(true);
      await expect(observations).toHaveCount(0);
      await expect(historyMore).toHaveCount(0);
    } finally {
      releaseHistory();
      await page.unroute(progressRoute);
    }
    await toggle.click();
    await expect(section.getByText('Sibling recommendation')).toBeVisible();
    await expect(dialog.getByText(translations.en.lessonContextEmptyProgress)).toBeVisible();
    await expect(dialog.getByText(currentComment)).toHaveCount(0);
    await homeworkToggle.click();
    await expect(homework.getByText(siblingHomework)).toBeVisible();
    await expect(homework.getByText(homeworkText)).toHaveCount(0);
    await expect(section.getByText(authorText)).toHaveCount(0);
    await page.keyboard.press('Escape');

    const currentRecommendation = 'Recommendation for the started booking';
    ownedPaths.push(`participant_lesson_feedback/${feedbackId(participantId, bookedB)}`);
    const currentSaved = await request.post(functionsCallableUrl('executeCanonicalCommand'), {
      headers: { Authorization: `Bearer ${workspaceToken}` },
      data: {
        data: {
          kind: 'save_participant_lesson_feedback',
          exercisedCapability: 'instructor',
          expectedRevision: 0,
          idempotencyKey: `${prefix}_current`,
          correlationId: `${prefix}_current`,
          intent: {
            participantId,
            lessonBookingId: bookedB,
            items: [{ itemId: 'current', text: currentRecommendation }],
          },
        },
      },
    });
    expect(currentSaved.ok(), await currentSaved.text()).toBe(true);

    await secondary.click();
    for (const button of [historyToggle, homeworkToggle, toggle]) {
      await expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(comments.getByText(currentComment)).toBeVisible();
    const currentRecommendations = dialog.getByRole('region', {
      name: translations.en.instructorRecommendations,
    });
    await expect(currentRecommendations.getByText(currentRecommendation)).toBeVisible();
    await expect(currentRecommendations.getByText(authorText)).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: translations.en.instructorAssess, exact: true })
    ).toBeEnabled();
    await historyToggle.click();
    await expect(observations).toHaveCount(20);
    await toggle.click();
    await expect(section.getByText(authorText)).toBeVisible();
    await expect(section.getByText(currentRecommendation)).toHaveCount(0);
    await expect(more).toBeEnabled();
    // Remove only the selected participant's booking access. Keep the family lesson for B.
    const revocation = db.batch();
    revocation.update(db.doc(`bookings/${bookedA}`), {
      party: { kind: 'individual', participantIds: [siblingId] },
      'occurrence.serviceParty.participantIds': [siblingId],
    });
    revocation.delete(db.doc(`bookings/${bookedB}`));
    await revocation.commit();

    for (const [name, continuation] of [
      [progressHistoryCallable, historyMore],
      [callable, more],
    ] as const) {
      const denied = page.waitForResponse(matchesCallable(name));
      await continuation.click();
      expect((await (await denied).json()).error.status).toBe('PERMISSION_DENIED');
    }
    await expect(history.getByRole('alert')).toHaveText(translations.en.lessonContextDenied);
    await expect(observations).toHaveCount(0);
    await expect(historyMore).toHaveCount(0);
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
    for (const width of [375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(dialog.getByRole('button', { name: translations.ru.closeBtn })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    const signOut = async () => {
      await page.getByTitle(translations.en.signOut, { exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Sign In', exact: true }).first()
      ).toBeVisible();
      await expect(dialog).toHaveCount(0);
    };
    await signOut();
    await signInAccount(page, {
      email: authorEmail,
      password: authorPassword,
      expectedPath: '/instructor',
    });
    const authored = fromBooking(authoredLessonId, fixture.studentDisplayName);
    await expect(authored).toBeVisible({ timeout: 45_000 });
    await authored.click();
    await historyToggle.click();
    await expect(observations.first()).toContainText(observation(21));
    await expect(historyMore).toBeVisible();
    await page.keyboard.press('Escape');
    await signOut();
    await signInAccount(page, {
      email: fixture.instructorEmail,
      password: fixture.instructorPassword,
      expectedPath: '/instructor',
    });
    const sibling = fromBooking(bookedA, fixture.studentChildDisplayName);
    await expect(sibling).toBeVisible({ timeout: 45_000 });
    await expect(authored).toHaveCount(0);
    await expect(fromBooking(bookedA, fixture.studentDisplayName)).toHaveCount(0);
    await sibling.click();
    await expect(historyToggle).toHaveAttribute('aria-expanded', 'false');
    await historyToggle.click();
    await expect(history.getByText(translations.en.historyEmpty)).toBeVisible();
    await expect(observations).toHaveCount(0);
    await expect(historyMore).toHaveCount(0);
  } finally {
    if (seeded) {
      const cleanup = db.batch();
      for (const path of ownedPaths) cleanup.delete(db.doc(path));
      await cleanup.commit();
    }
    await Promise.all(
      [idToken, unrelated.idToken].map((token) =>
        request.post(
          `${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-api-key`,
          { data: { idToken: token } }
        )
      )
    );
  }
});
