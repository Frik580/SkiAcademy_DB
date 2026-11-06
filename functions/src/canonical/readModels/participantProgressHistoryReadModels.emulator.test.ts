import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  ParticipantIdSchema,
  InstructorIdSchema,
  ParticipantSchema,
  ParticipantManagementSchema,
  InstructorRelationshipSchema,
  ParticipantBlockSchema,
  instructorRelationshipIdFromPair,
  instructorRelationshipExpiresAt,
  participantBlockIdFromDirection,
  TestActorSchema,
  TestActorAssignmentSchema,
  TestSessionSchema,
} from '@ski-academy/shared-domain';
import {
  revenueAccount,
  revenueBooking,
  revenueAt,
  revenueAudit,
} from '../../../../tests/helpers/instructorRevenueFixtures';
import { createQueryParticipantProgressHistoryReadModelsHandler } from './queryParticipantProgressHistoryReadModelsCallable';
import { queryParticipantProgressReadModels } from './participantProgressReadModels';

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const participantId = ParticipantIdSchema.parse('revenue_participant');
const instructorId = InstructorIdSchema.parse('revenue_instructor');
const metadata = { revision: 1, createdAt: revenueAt, updatedAt: revenueAt, audit: revenueAudit };
const input = { scope: 'instructor', participantId };
let app: App;
let db: Firestore;
const call = (data: Record<string, unknown> = input, uid: string | undefined = 'revenue_coach') =>
  createQueryParticipantProgressHistoryReadModelsHandler(
    db,
    'history-emulator-secret'
  )({
    data,
    ...(uid ? { auth: { uid } } : {}),
  } as never);
async function observations(count = 25, patch = {}) {
  const batch = db.batch();
  for (let revision = 1; revision <= count; revision++)
    batch.set(db.doc(`participant_progress_events/${participantId}_${revision}`), {
      participantId,
      revision,
      at: revenueAt,
      kind: 'update_participant_progress',
      oldScores: { carving: 10 },
      newScores: { carving: 20 },
      oldComments: { carving: 'Before' },
      newComments: { carving: 'After' },
      instructorId: revision % 2 ? 'coach_one' : 'coach_two',
      actor: { kind: 'account', accountId: 'secret' },
      commandId: 'secret',
      email: 'secret',
      chat: 'secret',
      ...patch,
    });
  await batch.commit();
}
async function relationship() {
  const id = instructorRelationshipIdFromPair({ participantId, instructorId });
  await db.doc(`instructor_relationships/${id}`).set(
    InstructorRelationshipSchema.parse({
      instructorRelationshipId: id,
      participantId,
      instructorId,
      status: 'active',
      basis: {
        kind: 'guardian_permission',
        participantManagementId: 'history_management',
        grantedByAccountId: 'history_owner',
      },
      validFrom: revenueAt,
      expiresAt: instructorRelationshipExpiresAt(revenueAt),
      ...metadata,
    })
  );
  return id;
}
async function block(createdByKind: 'instructor' | 'participant_manager' = 'instructor') {
  const participantBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind,
  });
  await db.doc(`participant_blocks/${participantBlockId}`).set(
    ParticipantBlockSchema.parse({
      participantBlockId,
      participantId,
      instructorId,
      status: 'active',
      reason: 'Test block',
      createdBy:
        createdByKind === 'instructor'
          ? { kind: 'instructor', instructorId }
          : {
              kind: 'participant_manager',
              accountId: 'history_owner',
              participantManagementId: 'history_management',
            },
      ...metadata,
    })
  );
}

describeEmulator('progress history canonical Firestore integration', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'progress-history');
    db = getFirestore(app);
  });
  afterAll(async () => {
    if (app) await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-ski-school-e2e/databases/(default)/documents`,
      { method: 'DELETE' }
    );
    await db.doc('users/revenue_coach').set(revenueAccount());
    await db.doc(`participants/${participantId}`).set(
      ParticipantSchema.parse({
        participantId,
        displayName: 'Student',
        skillLevel: 'beginner',
        age: { kind: 'age_years', years: 10 },
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: 'history_management' },
        lifecycle: { status: 'active' },
        ...metadata,
      })
    );
    await db.doc('participant_management/history_management').set(
      ParticipantManagementSchema.parse({
        participantManagementId: 'history_management',
        participantId,
        accountId: 'history_owner',
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        ...metadata,
      })
    );
    await db.doc('bookings/revenue_booking').set(revenueBooking());
    await observations();
  });
  it('reads numeric pages and both historical instructors through the shared progress policy', async () => {
    const first = await call();
    const second = await call({ ...input, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((row) => row.revision)).toEqual(
      Array.from({ length: 25 }, (_, i) => 25 - i)
    );
    expect(new Set(first.items.map((row) => row.instructorId)).size).toBe(2);
    expect(JSON.stringify(first)).not.toContain('secret');
    expect(first.items[0]?.commentChanges).toEqual([
      { skillId: 'carving', previousText: 'Before', newText: 'After' },
    ]);
    const current = await queryParticipantProgressReadModels(
      db,
      { scope: 'instructor', participantIds: [participantId] },
      { accountId: 'revenue_coach' as never, instructorId }
    );
    expect(current.items[0]?.revision).toBe(0);
  });
  it.each(['future', 'started', 'completed'] as const)(
    'preserves current progress read eligibility for %s lessons',
    async (state) => {
      const booking = revenueBooking();
      if (state !== 'completed') {
        const startsAt = {
          seconds: Math.floor(Date.now() / 1000) + (state === 'future' ? 3600 : -1800),
          nanoseconds: 0,
        };
        await db.doc('bookings/revenue_booking').set(
          revenueBooking('revenue_booking', {
            occurrence: {
              ...booking.occurrence,
              interval: { startsAt, endsAt: { ...startsAt, seconds: startsAt.seconds + 3600 } },
            },
            lifecycle: { status: 'confirmed' },
          })
        );
      }
      expect((await call()).items).toHaveLength(20);
    }
  );
  it.each(['cancelled', 'wrong_instructor', 'deleted', 'wrong_frozen_party'] as const)(
    'denies invalid Booking evidence: %s',
    async (state) => {
      const booking = revenueBooking();
      const patch =
        state === 'cancelled'
          ? {
              lifecycle: {
                status: 'cancelled',
                cancelledAt: revenueAt,
                reasonCode: 'account_owner_cancelled',
              },
            }
          : state === 'wrong_instructor'
            ? { occurrence: { ...booking.occurrence, instructorId: 'other_coach' } }
            : state === 'wrong_frozen_party'
              ? {
                  occurrence: {
                    ...booking.occurrence,
                    serviceParty: { participantIds: ['another_child'], frozenAt: revenueAt },
                  },
                }
              : { archival: { isDeleted: true, deletedAt: revenueAt } };
      await db.doc('bookings/revenue_booking').update(patch);
      await expect(call()).rejects.toMatchObject({
        code: 'permission-denied',
        message: 'This action is not permitted.',
      });
    }
  );
  it.each(['instructor', 'participant_manager'] as const)(
    'blocks relationship-only access but preserves valid Booking basis: %s',
    async (kind) => {
      await relationship();
      await block(kind);
      expect((await call()).items).toHaveLength(20);
      await db.doc('bookings/revenue_booking').delete();
      await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    }
  );
  it('revokes relationships between pages and allows another independent valid read basis', async () => {
    const id = await relationship();
    const first = await call();
    await db.doc('bookings/revenue_booking').delete();
    expect((await call({ ...input, cursor: first.nextCursor })).items).toHaveLength(5);
    await db.doc(`instructor_relationships/${id}`).delete();
    await expect(call({ ...input, cursor: first.nextCursor })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
  it.each(['account', 'participant', 'capability', 'different_account', 'missing_participant'])(
    'denies inactive or unrelated identity: %s',
    async (state) => {
      if (state === 'account')
        await db
          .doc('users/revenue_coach')
          .update({ lifecycle: { status: 'disabled', disabledAt: revenueAt, reason: 'test' } });
      if (state === 'participant')
        await db
          .doc(`participants/${participantId}`)
          .update({ lifecycle: { status: 'archived', archivedAt: revenueAt } });
      if (state === 'capability') {
        const account = revenueAccount();
        await db.doc('users/revenue_coach').set({ ...account, instructorId: '' });
      }
      if (state === 'different_account')
        await db.doc('users/revenue_other').set(revenueAccount('revenue_other', 'unrelated_coach'));
      await expect(
        call(
          state === 'missing_participant' ? { ...input, participantId: 'not_found' } : input,
          state === 'different_account' ? 'revenue_other' : undefined
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    }
  );
  it('denies unauthenticated calls and rejects scope/identity injection', async () => {
    await expect(
      createQueryParticipantProgressHistoryReadModelsHandler(
        db,
        'history-emulator-secret'
      )({ data: input } as never)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    for (const patch of [
      { instructorId },
      { accountId: 'history_owner' },
      { scope: 'admin' },
      { dataScope: 'test' },
      { cursor: '../private' },
    ])
      await expect(call({ ...input, ...patch })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
  });
  it('isolates siblings of the same owner and rejects cursors borrowed from another Participant', async () => {
    const person = (await db.doc(`participants/${participantId}`).get()).data()!;
    await db.doc('participants/history_sibling').set({
      ...person,
      participantId: 'history_sibling',
      management: { kind: 'managed', participantManagementId: 'sibling_management' },
    });
    await db.doc('participant_management/sibling_management').set({
      ...(await db.doc('participant_management/history_management').get()).data(),
      participantManagementId: 'sibling_management',
      participantId: 'history_sibling',
    });
    const first = await call();
    await expect(
      call({ ...input, participantId: 'history_sibling', cursor: first.nextCursor })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('bookings/sibling_booking').set(
      revenueBooking('sibling_booking', {
        party: { kind: 'individual', participantIds: ['history_sibling'] },
        occurrence: {
          ...revenueBooking().occurrence,
          serviceParty: { participantIds: ['history_sibling'], frozenAt: revenueAt },
        },
      })
    );
    await expect(
      call({ ...input, participantId: 'history_sibling', cursor: first.nextCursor })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('resolves TEST actor scope server-side and isolates sessions and LIVE legacy rows', async () => {
    await db.doc(`participant_progress_events/${participantId}_26`).set({
      ...(await db.doc(`participant_progress_events/${participantId}_1`).get()).data(),
      revision: 26,
      dataScope: 'test',
      testSessionId: 'test_history',
    });
    expect((await call()).items[0]?.revision).toBe(25);
    await db.doc('test_actors/revenue_coach').set(
      TestActorSchema.parse({
        accountId: 'revenue_coach',
        participantIds: [participantId],
        instructorId,
        kind: 'test_instructor',
        allowed: true,
        dataScope: 'test',
        ...metadata,
      })
    );
    await db.doc('test_actor_assignments/revenue_coach').set(
      TestActorAssignmentSchema.parse({
        accountId: 'revenue_coach',
        activeTestSessionId: 'test_history',
        revision: 1,
        updatedAt: revenueAt,
        audit: revenueAudit,
      })
    );
    await db.doc('test_sessions/test_history').set(
      TestSessionSchema.parse({
        testSessionId: 'test_history',
        schemaVersion: 1,
        status: 'active',
        label: 'History',
        createdByAccountId: 'history_admin',
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 1,
        ...metadata,
      })
    );
    await db.doc('users/revenue_coach').update({ dataScope: 'test' });
    await db
      .doc(`participants/${participantId}`)
      .update({ dataScope: 'test', testSessionId: 'test_history' });
    expect((await call()).items.map((row) => row.revision)).toEqual([26]);
    await expect(
      call({ ...input, requestedTestSessionId: 'test_unrelated' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await db.doc('test_sessions/test_history').update({ status: 'locked' });
    await expect(call()).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
