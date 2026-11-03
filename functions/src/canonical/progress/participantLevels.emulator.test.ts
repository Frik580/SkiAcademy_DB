import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  BookingSchema,
  paymentIdFromBookingId,
  type BookingId,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  accountCommandActor,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  timestampFromDate,
  type CommandEnvelope,
  type LevelOperation,
} from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions';
import { queryParticipantProgressReadModels } from '../readModels/participantProgressReadModels';

const suite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const accountId = AccountIdSchema.parse('account_level_emulator');
const coachId = InstructorIdSchema.parse('coach_level_emulator');
const coachAccount = AccountIdSchema.parse('account_level_coach');
const participantId = ParticipantIdSchema.parse('participant_level_emulator');
const correlationId = CorrelationIdSchema.parse('correlation_level_emulator');
const at = timestampFromDate(new Date('2026-10-14T10:00:00Z'));
const meta = {
  revision: 1,
  createdAt: at,
  updatedAt: at,
  audit: {
    createdByCommandId: 'command_seed_level',
    lastChangedByCommandId: 'command_seed_level',
    correlationId,
  },
};
let app: App;
let firestore: Firestore;
function command(
  operation: LevelOperation,
  revision: number,
  key: string,
  admin = false
): CommandEnvelope<'manage_participant_level'> {
  return {
    kind: 'manage_participant_level',
    intent: { participantId, operation },
    context: {
      actor: accountCommandActor(admin ? accountId : coachAccount),
      exercisedCapability: admin ? 'administrator' : 'instructor',
      source: admin ? 'admin_callable' : 'client_callable',
      correlationId,
      idempotencyKey: key,
      expectedRevision: revision,
    },
  };
}
suite('participant levels real Firestore transactions', () => {
  beforeAll(async () => {
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'participant-levels-emulator');
    firestore = getFirestore(app);
    const relationshipId = instructorRelationshipIdFromPair({
      instructorId: coachId,
      participantId,
    });
    const bookingId = 'booking_level_emulator' as BookingId;
    const booking = BookingSchema.parse({
      ...meta,
      bookingId,
      attribution: { bookingOrigin: 'admin', bookedBy: { kind: 'account', accountId } },
      party: { kind: 'individual', participantIds: [participantId] },
      occurrence: {
        occurrenceId: 'occurrence_level_emulator',
        instructorId: coachId,
        interval: { startsAt: at, endsAt: timestampFromDate(new Date('2026-10-14T11:00:00Z')) },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 1,
        serviceParty: { participantIds: [participantId], frozenAt: at },
      },
      lifecycle: { status: 'confirmed' },
      paymentId: paymentIdFromBookingId(bookingId),
    });
    await Promise.all([
      firestore.doc(`bookings/${bookingId}`).set(booking),
      ...Array.from({ length: 26 }, (_, index) =>
        firestore.doc(`bookings/aaa_level_archived_${String(index).padStart(2, '0')}`).set({
          ...booking,
          bookingId: `aaa_level_archived_${index}`,
          archival: { isDeleted: true, deletedAt: at },
        })
      ),
      firestore
        .doc(`users/${accountId}`)
        .set({ ...meta, accountId, role: 'admin', lifecycle: { status: 'active' } }),
      firestore.doc(`users/${coachAccount}`).set({
        ...meta,
        accountId: coachAccount,
        instructorId: coachId,
        lifecycle: { status: 'active' },
      }),
      firestore
        .doc(`instructors/${coachId}`)
        .set({ id: coachId, name: 'Coach', linkedAccountId: coachAccount }),
      firestore.doc(`participants/${participantId}`).set({
        ...meta,
        participantId,
        displayName: 'Participant',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: 'management_level_emulator' },
        lifecycle: { status: 'active' },
      }),
      firestore.doc('participant_management/management_level_emulator').set({
        ...meta,
        participantManagementId: 'management_level_emulator',
        participantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
      }),
      firestore.doc(`instructor_relationships/${relationshipId}`).set({
        ...meta,
        instructorRelationshipId: relationshipId,
        participantId,
        instructorId: coachId,
        basis: {
          kind: 'guardian_permission',
          participantManagementId: 'management_level_emulator',
          grantedByAccountId: accountId,
        },
        validFrom: at,
        expiresAt: instructorRelationshipExpiresAt(at),
        status: 'active',
      }),
      firestore
        .doc('settings/skill_config')
        .set({ passPercentage: 80, items: [{ id: 'skill_one', levelTarget: 1, maxPoints: 100 }] }),
    ]);
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });
  it('allows prelesson reads while denying scores, comments and level changes despite a manual grant', async () => {
    const now = new Date('2026-10-14T09:59:59Z');
    const read = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'instructor', participantIds: [participantId] },
      { accountId: coachAccount, instructorId: coachId, now: () => now }
    );
    expect(read.items[0]?.participantId).toBe(participantId);
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(now) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const scores: CommandEnvelope<'update_participant_progress'> = {
      ...command(
        { action: 'request', level: 3, reason: { category: 'expert_assessment', text: 'Future' } },
        0,
        'future-score'
      ),
      kind: 'update_participant_progress',
      intent: {
        participantId,
        level: 1,
        skillScores: { skill_one: 80 },
        skillComments: { skill_one: 'Future comment' },
      },
    };
    expect((await commands.execute(scores)).status).toBe('error');
    expect(
      (
        await commands.execute(
          command(
            {
              action: 'request',
              level: 3,
              reason: { category: 'expert_assessment', text: 'Future' },
            },
            0,
            'future-request'
          )
        )
      ).status
    ).toBe('error');
    expect((await firestore.doc(`participant_progress/${participantId}`).get()).exists).toBe(false);
    // Remove the old read basis temporarily to verify Booking-only revocation.
    const relationship = firestore.doc(
      `instructor_relationships/${instructorRelationshipIdFromPair({ instructorId: coachId, participantId })}`
    );
    const saved = (await relationship.get()).data()!;
    await relationship.delete();
    try {
      expect(
        (
          await queryParticipantProgressReadModels(
            firestore,
            { scope: 'instructor', participantIds: [participantId] },
            { accountId: coachAccount, instructorId: coachId, now: () => now }
          )
        ).items
      ).toHaveLength(1);
      await firestore.doc('bookings/booking_level_emulator').update({
        lifecycle: { status: 'cancelled', cancelledAt: at, reasonCode: 'account_owner_cancelled' },
      });
      await expect(
        queryParticipantProgressReadModels(
          firestore,
          { scope: 'instructor', participantIds: [participantId] },
          { accountId: coachAccount, instructorId: coachId, now: () => now }
        )
      ).rejects.toThrow();
    } finally {
      await relationship.set(saved);
      await firestore
        .doc('bookings/booking_level_emulator')
        .update({ lifecycle: { status: 'confirmed' } });
    }
  });
  it('serializes conflicting requests and two admin approvals, preserves audit and exposes the bounded inbox', async () => {
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-10-14T10:01:00Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const reason = { category: 'expert_assessment' as const, text: 'Qualified on snow' };
    const results = await Promise.all([
      commands.execute(command({ action: 'request', level: 3, reason }, 0, 'race-request-a')),
      commands.execute(command({ action: 'request', level: 2, reason }, 0, 'race-request-b')),
    ]);
    expect(results.filter((result) => result.status === 'success')).toHaveLength(1);
    const inbox = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'admin' },
      { accountId, administratorActor: { kind: 'administrator', accountId } }
    );
    expect(inbox.items).toHaveLength(1);
    const item = inbox.items[0]!;
    expect(item.participantName).toBe('Participant');
    expect(item.instructorName).toBe('Coach');
    const requestId = item.levelState!.request!.requestId;
    const approvals = await Promise.all([
      commands.execute(
        command({ action: 'approve', requestId }, item.revision, 'race-approve-a', true)
      ),
      commands.execute(
        command({ action: 'approve', requestId }, item.revision, 'race-approve-b', true)
      ),
    ]);
    expect(approvals.filter((result) => result.status === 'success')).toHaveLength(1);
    const progress = (await firestore.doc(`participant_progress/${participantId}`).get()).data()!;
    expect(progress.revision).toBe(2);
    expect(progress.levelState.request.status).toBe('approved');
    expect(progress.skillScores).toEqual({});
    expect(
      (
        await firestore
          .collection('participant_progress_events')
          .where('participantId', '==', participantId)
          .get()
      ).size
    ).toBe(2);
    expect(
      (
        await queryParticipantProgressReadModels(
          firestore,
          { scope: 'admin' },
          { accountId, administratorActor: { kind: 'administrator', accountId } }
        )
      ).items
    ).toHaveLength(0);
  });
  it('pages the admin inbox in bounded, non-overlapping pages and denies a missing admin actor', async () => {
    const progress = (await firestore.doc(`participant_progress/${participantId}`).get()).data()!;
    const person = (await firestore.doc(`participants/${participantId}`).get()).data()!;
    const batch = firestore.batch();
    for (let index = 0; index < 21; index += 1) {
      const id = `participant_level_page_${String(index).padStart(2, '0')}`;
      batch.set(firestore.doc(`participants/${id}`), { ...person, participantId: id });
      batch.set(firestore.doc(`participant_progress/${id}`), {
        ...progress,
        participantId: id,
        levelState: {
          ...progress.levelState,
          request: { ...progress.levelState.request, status: 'pending' },
        },
      });
    }
    await batch.commit();
    await expect(
      queryParticipantProgressReadModels(firestore, { scope: 'admin' }, { accountId })
    ).rejects.toThrow();
    const options = {
      accountId,
      administratorActor: { kind: 'administrator' as const, accountId },
    };
    const first = await queryParticipantProgressReadModels(firestore, { scope: 'admin' }, options);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await queryParticipantProgressReadModels(
      firestore,
      { scope: 'admin', cursor: first.nextCursor },
      options
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map((item) => item.participantId)).size).toBe(
      21
    );
  });
});
