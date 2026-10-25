import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  CorrelationIdSchema,
  accountCommandActor,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { deriveRecordParticipantAchievementsIdempotencyKey } from '../../../../packages/shared-domain/src/canonical/participantAchievementCommandIdempotency';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let app: App;
let db: Firestore;
const now = timestampFromDate(new Date('2026-01-10T12:00:00.000Z'));
const accountId = AccountIdSchema.parse('account_achievement_emulator');
const correlationId = CorrelationIdSchema.parse('correlation_achievement_emulator');
const audit = {
  createdByCommandId: 'command_achievement_seed',
  lastChangedByCommandId: 'command_achievement_seed',
  correlationId,
};
const base = { revision: 1, createdAt: now, updatedAt: now, audit };

describe.skipIf(!enabled)('Participant achievement idempotency on Firestore', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'achievement-idempotency');
    db = getFirestore(app);
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it.each(['account_owner', 'parent_guardian'] as const)(
    'preserves once-earned and strict replay under concurrency for %s',
    async (capability) => {
      const participantId = ParticipantIdSchema.parse(
        `participant_achievement_emulator_${capability}`
      );
      const managementId = `management_achievement_emulator_${capability}`;
      const batch = db.batch();
      batch.set(db.doc(`users/${accountId}`), {
        ...base,
        accountId,
        lifecycle: { status: 'active' },
      });
      batch.set(db.doc(`participants/${participantId}`), {
        ...base,
        participantId,
        displayName: 'Test',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        lifecycle: { status: 'active' },
        management: { kind: 'managed', participantManagementId: managementId },
      });
      batch.set(db.doc(`participant_management/${managementId}`), {
        ...base,
        participantManagementId: managementId,
        participantId,
        accountId,
        role: 'owner',
        authority: capability === 'account_owner' ? 'self' : 'parent_guardian',
        status: 'active',
      });
      await batch.commit();
      const earned = [
        { achievementId: 'first_lesson', earnedAt: now, source: 'participant_attendance' as const },
      ];
      const original: CommandEnvelope<'record_participant_achievements'> = {
        kind: 'record_participant_achievements',
        context: {
          actor: accountCommandActor(accountId),
          exercisedCapability: capability,
          idempotencyKey: deriveRecordParticipantAchievementsIdempotencyKey(
            participantId,
            0,
            earned,
            capability
          ),
          correlationId,
          source: 'client_callable',
          expectedRevision: 0,
        },
        intent: { participantId, earned },
      };
      const commands = createProductionCanonicalCommands(
        { clock: createAuthoritativeCommandClock(new Date('2026-01-10T12:00:00Z')) },
        createFirestoreCanonicalTransactionExecutor(db)
      );
      const results = await Promise.all([commands.execute(original), commands.execute(original)]);
      expect(results.map((result) => result.status)).toEqual(['success', 'success']);
      // Lost response: reconstruct the same command, replay without increasing revision.
      expect((await commands.execute(structuredClone(original))).status).toBe('success');
      for (const change of [
        { earnedAt: timestampFromDate(new Date('2026-01-09T12:00:00Z')) },
        { source: 'participant_progress' as const },
      ]) {
        const changed = {
          ...original,
          intent: { participantId, earned: [{ ...earned[0], ...change }] },
        };
        expect(await commands.execute(changed)).toMatchObject({
          status: 'error',
          error: { code: 'idempotency_conflict', retryable: false },
        });
        const freshKey = deriveRecordParticipantAchievementsIdempotencyKey(
          participantId,
          0,
          changed.intent.earned,
          capability
        );
        expect(
          await commands.execute({
            ...changed,
            context: { ...changed.context, idempotencyKey: freshKey },
          })
        ).toMatchObject({ status: 'error', error: { code: 'stale_version' } });
        const keyAtRevision = deriveRecordParticipantAchievementsIdempotencyKey(
          participantId,
          1,
          changed.intent.earned,
          capability
        );
        expect(
          await commands.execute({
            ...changed,
            context: { ...changed.context, expectedRevision: 1, idempotencyKey: keyAtRevision },
          })
        ).toMatchObject({
          status: 'success',
          payload: { revision: 1, newlyEarnedAchievementIds: [] },
        });
      }
      expect(
        (await db.doc(`participant_achievements/${participantId}`).get()).data()
      ).toMatchObject({
        revision: 1,
        earned: { first_lesson: { source: 'participant_attendance', earnedAt: now } },
      });
    }
  );
});
