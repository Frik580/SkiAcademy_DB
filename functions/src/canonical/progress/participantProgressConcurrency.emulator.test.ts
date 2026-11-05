import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  CorrelationIdSchema,
  BookingSchema,
  ParticipantProgressSchema,
  accountCommandActor,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions';

const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
suite('participant progress optimistic concurrency in real Firestore', () => {
  const app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'progress-concurrency');
  const db = getFirestore(app);
  const participantId = ParticipantIdSchema.parse('participant_progress_concurrency');
  const owner = AccountIdSchema.parse('account_progress_owner');
  const actors = ['a', 'b'].map((id) => ({
    account: AccountIdSchema.parse(`account_progress_coach_${id}`),
    instructor: InstructorIdSchema.parse(`instructor_progress_coach_${id}`),
  }));
  const at = timestampFromDate(new Date('2026-10-14T10:00:00Z'));
  const metadata = {
    revision: 1,
    createdAt: at,
    updatedAt: at,
    audit: {
      createdByCommandId: 'seed_progress_concurrency',
      lastChangedByCommandId: 'seed_progress_concurrency',
      correlationId: 'seed_progress_concurrency',
    },
  };
  const commands = createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date('2026-10-14T10:15:00Z')) },
    createFirestoreCanonicalTransactionExecutor(db)
  );
  const ref = db.doc(`participant_progress/${participantId}`);
  let skillId = 'l1_2';
  const command = (
    actor: number,
    revision: number,
    key: string,
    score: number,
    comments: Record<string, string>
  ): CommandEnvelope<'update_participant_progress'> => ({
    kind: 'update_participant_progress',
    intent: {
      participantId,
      level: 1,
      skillScores: { [skillId]: score },
      skillComments: comments,
      correctionReason: 'Observed assessment correction',
    },
    context: {
      actor: accountCommandActor(actors[actor]!.account),
      exercisedCapability: 'instructor',
      source: 'client_callable',
      correlationId: CorrelationIdSchema.parse(`correlation_${key}`),
      idempotencyKey: key,
      expectedRevision: revision,
    },
  });
  beforeAll(async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST).toMatch(/^(127\.0\.0\.1|localhost):8080$/);
    const configured = (await db.doc('settings/skill_config').get()).data();
    if (configured?.items?.length) {
      const usable = (configured.items as { id: string; maxPoints: number }[]).find(
        (item) => item.maxPoints >= 5
      );
      expect(usable).toBeDefined();
      skillId = usable!.id;
    }
    await db
      .doc(`users/${owner}`)
      .create({ ...metadata, accountId: owner, lifecycle: { status: 'active' } });
    await db.doc(`participants/${participantId}`).create({
      ...metadata,
      participantId,
      displayName: 'Concurrency Participant',
      age: { kind: 'age_years', years: 12 },
      discipline: 'ski',
      skillLevel: 'beginner',
      lifecycle: { status: 'active' },
      management: { kind: 'managed', participantManagementId: 'management_progress_concurrency' },
    });
    await db.doc('participant_management/management_progress_concurrency').create({
      ...metadata,
      participantManagementId: 'management_progress_concurrency',
      participantId,
      accountId: owner,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
    });
    for (const [index, actor] of actors.entries()) {
      await db.doc(`users/${actor.account}`).create({
        ...metadata,
        accountId: actor.account,
        instructorId: actor.instructor,
        isInstructor: true,
        role: 'user',
        lifecycle: { status: 'active' },
      });
      await db
        .doc(`instructors/${actor.instructor}`)
        .create({ id: actor.instructor, name: `Coach ${index}`, linkedAccountId: actor.account });
      const startsAt = timestampFromDate(
        new Date(index ? '2026-10-14T08:00:00Z' : '2026-10-14T10:00:00Z')
      );
      const endsAt = timestampFromDate(
        new Date(index ? '2026-10-14T09:00:00Z' : '2026-10-14T11:00:00Z')
      );
      const bookingId = `booking_progress_concurrency_${index ? 'b' : 'a'}`;
      await db.doc(`bookings/${bookingId}`).create(
        BookingSchema.parse({
          ...metadata,
          bookingId,
          paymentId: paymentIdFromBookingId(bookingId as never),
          payerAccountId: owner,
          attribution: {
            bookingOrigin: 'account',
            bookedBy: { kind: 'account', accountId: owner },
          },
          party: { kind: 'individual', participantIds: [participantId] },
          occurrence: {
            occurrenceId: `occurrence_progress_concurrency_${index ? 'b' : 'a'}`,
            instructorId: actor.instructor,
            interval: { startsAt, endsAt },
            timeZone: 'Asia/Almaty',
            scheduleRevision: 1,
            serviceParty: { participantIds: [participantId], frozenAt: startsAt },
          },
          lifecycle: { status: 'confirmed' },
        })
      );
    }
    await ref.create(
      ParticipantProgressSchema.parse({
        ...metadata,
        participantId,
        level: 1,
        skillScores: { [skillId]: 3 },
        skillComments: { [skillId]: 'Работать над балансом' },
      })
    );
  });
  afterAll(async () => {
    await db.terminate();
    await deleteApp(app);
  });
  it('rejects the stale second instructor, never resurrects deleted text, and serializes a true race', async () => {
    const a = command(0, 1, 'progress_concurrency_a', 4, { [skillId]: 'Баланс улучшился' });
    const b = command(1, 1, 'progress_concurrency_b', 5, {
      [skillId]: 'Добавить упражнения на кантование',
    });
    expect((await commands.execute(a)).status).toBe('success');
    const firstAuthor = {
      instructorId: actors[0]!.instructor,
      accountId: actors[0]!.account,
      updatedAt: (await ref.get()).data()!.updatedAt,
      revision: 2,
    };
    expect((await ref.get()).data()!.skillCommentAttribution).toEqual({ [skillId]: firstAuthor });
    const stale = await commands.execute(b);
    expect(stale).toMatchObject({
      status: 'error',
      error: { code: 'stale_version', currentRevision: 2 },
    });
    expect((await commands.execute(b)).status).toBe('error');
    expect((await ref.get()).data()).toMatchObject({
      revision: 2,
      skillScores: { [skillId]: 4 },
      skillComments: { [skillId]: 'Баланс улучшился' },
    });
    const race = [
      command(0, 2, 'progress_concurrency_zero', 0, {}),
      command(1, 2, 'progress_concurrency_other', 5, { [skillId]: 'Race winner text' }),
    ];
    const results = await Promise.all(race.map((value) => commands.execute(value)));
    expect(results.filter((value) => value.status === 'success')).toHaveLength(1);
    expect(results.filter((value) => value.status === 'error')).toMatchObject([
      { status: 'error', error: { code: 'stale_version' } },
    ]);
    const winner = race[results.findIndex((value) => value.status === 'success')]!;
    const persisted = (await ref.get()).data()!;
    expect(persisted).toMatchObject({
      revision: 3,
      skillScores: winner.intent.skillScores,
      skillComments: winner.intent.skillComments,
    });
    expect((await commands.execute(winner)).status).toBe('success');
    expect((await ref.get()).data()).toEqual(persisted);
    expect(
      (await commands.execute(command(0, 3, 'progress_concurrency_delete', 0, {}))).status
    ).toBe('success');
    expect(
      await commands.execute(
        command(1, 3, 'progress_concurrency_restore_stale', 5, { [skillId]: 'Stale deleted text' })
      )
    ).toMatchObject({ status: 'error', error: { code: 'stale_version' } });
    expect((await ref.get()).data()).toMatchObject({
      revision: 4,
      skillScores: { [skillId]: 0 },
      skillComments: {},
      skillCommentAttribution: {},
    });
    // A second instructor edits the text, then a score-only edit preserves its author.
    expect(
      (await commands.execute(command(0, 4, 'author_create', 3, { [skillId]: 'First' }))).status
    ).toBe('success');
    expect(
      (await commands.execute(command(1, 5, 'author_replace', 3, { [skillId]: 'Second' }))).status
    ).toBe('success');
    const secondAuthor = (await ref.get()).data()!.skillCommentAttribution[skillId];
    expect(secondAuthor).toMatchObject({
      instructorId: actors[1]!.instructor,
      accountId: actors[1]!.account,
      revision: 6,
    });
    expect(
      (await commands.execute(command(0, 6, 'author_score_only', 4, { [skillId]: 'Second' })))
        .status
    ).toBe('success');
    expect((await ref.get()).data()!.skillCommentAttribution[skillId]).toEqual(secondAuthor);
    expect(
      (await db.doc(`participant_progress_events/${participantId}_7`).get()).data()
    ).toMatchObject({
      instructorId: actors[0]!.instructor,
      oldScores: { [skillId]: 3 },
      newScores: { [skillId]: 4 },
      oldComments: { [skillId]: 'Second' },
      newComments: { [skillId]: 'Second' },
    });
    expect(
      (await db.doc(`participant_progress_events/${participantId}_6`).get()).data()
    ).toMatchObject({
      instructorId: actors[1]!.instructor,
      oldComments: { [skillId]: 'First' },
      newComments: { [skillId]: 'Second' },
    });
  }, 30_000);
});
