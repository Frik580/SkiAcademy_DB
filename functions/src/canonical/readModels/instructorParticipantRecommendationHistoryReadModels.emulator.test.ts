import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AttendanceSchema,
  BookingIdSchema,
  attendanceIdFromBookingIdentity,
  InstructorIdSchema,
  InstructorRelationshipSchema,
  ParticipantBlockSchema,
  ParticipantIdSchema,
  ParticipantManagementSchema,
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionSchema,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  participantBlockIdFromDirection,
  ParticipantSchema,
  QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema,
  participantLessonFeedbackIdFromLessonParticipant,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  revenueAccount,
  revenueAt,
  revenueAudit,
  revenueBooking,
} from '../../../../tests/helpers/instructorRevenueFixtures';
import { createQueryInstructorParticipantRecommendationHistoryReadModelsHandler } from './queryInstructorParticipantRecommendationHistoryReadModelsCallable';

const projectId = 'demo-ski-school-e2e';
const participantId = ParticipantIdSchema.parse('recommendation_history_participant');
const siblingId = ParticipantIdSchema.parse('recommendation_history_sibling');
const instructorId = 'recommendation_history_instructor_b';
const instructorA = 'recommendation_history_instructor_a';
const uid = 'recommendation_history_account_b';
const metadata = { revision: 1, createdAt: revenueAt, updatedAt: revenueAt, audit: revenueAudit };
const input = { scope: 'instructor', participantId };
const startsAt = { seconds: revenueAt.seconds - 3600, nanoseconds: 100 };
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeEmulator('instructor recommendation history with canonical Firestore', () => {
  const app = initializeApp({ projectId }, 'recommendation-history');
  const db = getFirestore(app);
  const handler = createQueryInstructorParticipantRecommendationHistoryReadModelsHandler(
    db,
    'recommendation-history-test-secret'
  );
  const call = (patch: Record<string, unknown> = {}) =>
    handler({ auth: { uid }, data: { ...input, ...patch } } as never);

  function booking(participant = participantId, patch: Record<string, unknown> = {}) {
    const id = `recommendation_basis_${participant}`;
    const future = timestampFromDate(new Date(Date.now() + 3600_000));
    return db.doc(`bookings/${id}`).set(
      revenueBooking(id, {
        party: { kind: 'individual', participantIds: [participant] },
        occurrence: {
          ...revenueBooking().occurrence,
          instructorId,
          interval: { startsAt: future, endsAt: { ...future, seconds: future.seconds + 3600 } },
          serviceParty: { participantIds: [participant], frozenAt: revenueAt },
        },
        lifecycle: { status: 'confirmed' },
        ...patch,
      })
    );
  }

  function person(id = participantId) {
    return db.doc(`participants/${id}`).set(
      ParticipantSchema.parse({
        participantId: id,
        displayName: 'Student',
        discipline: 'ski',
        skillLevel: 'beginner',
        age: { kind: 'age_years', years: 10 },
        management: { kind: 'unmanaged_guest' },
        lifecycle: { status: 'active' },
        ...metadata,
      })
    );
  }

  function feedback(index: number, patch: Record<string, unknown> = {}, personId = participantId) {
    const lessonBookingId = BookingIdSchema.parse(`recommendation_lesson_${index}`);
    const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
      participantId: personId,
      lessonBookingId,
    });
    return db
      .doc(`participant_lesson_feedback/${feedbackId}`)
      .set({
        feedbackId,
        participantId: personId,
        lessonBookingId,
        instructorId: index % 2 ? instructorA : instructorId,
        items: [
          { itemId: 'weight', text: 'Transfer weight' },
          { itemId: 'edges', text: 'Engage edges early' },
        ],
        completedItemIds: ['weight'],
        lessonStartsAt: startsAt,
        lessonDate: '2026-01-15',
        privateMessage: 'PRIVATE',
        attachment: 'PRIVATE',
        email: 'PRIVATE',
        updatedBy: { kind: 'instructor', instructorId, accountId: 'PRIVATE' },
        ...metadata,
        ...patch,
      })
      .then(() => feedbackId);
  }

  async function seedHistory(count: number) {
    return Promise.all(Array.from({ length: count }, (_, index) => feedback(index)));
  }

  beforeEach(async () => {
    const rows = await db
      .collection('participant_lesson_feedback')
      .where('participantId', 'in', [participantId, siblingId])
      .get();
    const batch = db.batch();
    for (const row of rows.docs) batch.delete(row.ref);
    batch.delete(db.doc(`bookings/recommendation_basis_${siblingId}`));
    batch.delete(db.doc('bookings/recommendation_previous_lesson'));
    await batch.commit();
    await Promise.all([
      person(),
      person(siblingId),
      booking(),
      db.doc(`users/${uid}`).set(revenueAccount(uid, instructorId)),
    ]);
  });

  afterAll(() => deleteApp(app));

  it('returns empty history and rejects spoofing and unauthenticated input', async () => {
    expect(await call()).toEqual({ ...input, items: [] });
    await expect(handler({ data: input } as never)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(call({ instructorId: instructorA })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(call({ participantId: siblingId })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('pages by lesson timestamp and document ID, keeps latest text and filters unsafe rows', async () => {
    const ids = await seedHistory(45);
    const latest = await feedback(50, {
      lessonStartsAt: { ...startsAt, nanoseconds: 101 },
      lessonDate: '2026-02-30',
      revision: 2,
      items: [{ itemId: 'weight', text: 'Revised recommendation' }],
    });
    await Promise.all([
      feedback(51, { items: [], completedItemIds: [] }),
      feedback(52, { lessonStartsAt: null }),
      feedback(53, { instructorId: '' }),
      feedback(54, { lessonStartsAt: { ...startsAt, nanoseconds: 'bad' } }),
      feedback(55, { dataScope: 'test', testSessionId: 'test_other_session' }),
      feedback(56, { lessonStartsAt: timestampFromDate(new Date(Date.now() + 3600_000)) }),
      feedback(57, {}, siblingId),
    ]);
    const first = await call();
    expect(first.items).toHaveLength(20);
    expect(first.items[0]).toMatchObject({
      feedbackId: latest,
      revision: 2,
      items: [{ text: 'Revised recommendation', completed: true }],
    });
    expect(first.items[0]).not.toHaveProperty('lessonDate');
    expect(new Set(first.items.map((row) => row.instructorId))).toEqual(
      new Set([instructorA, instructorId])
    );
    expect(JSON.stringify(first.items)).not.toContain('PRIVATE');
    expect(first.items[1]?.items.map((item) => item.completed)).toEqual([true, false]);
    await expect(call({ cursor: 'invalid' })).rejects.toMatchObject({ code: 'invalid-argument' });
    await booking(siblingId);
    await expect(
      call({ participantId: siblingId, cursor: first.nextCursor })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect((await call({ participantId: siblingId })).items).toHaveLength(1);
    await feedback(58, { lessonStartsAt: { ...startsAt, nanoseconds: 102 } });
    const second = await call({ cursor: first.nextCursor });
    const third = await call({ cursor: second.nextCursor });
    expect(third.nextCursor).toBeUndefined();
    expect([...first.items, ...second.items, ...third.items].map((row) => row.feedbackId)).toEqual([
      latest,
      ...ids.sort().reverse(),
    ]);
  });

  it('ends a clean page with exactly 20 lessons', async () => {
    await seedHistory(20);
    const page = await call();
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBeUndefined();
  });

  it('continues after a bounded page of empty documents', async () => {
    await seedHistory(20);
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        feedback(100 + index, {
          lessonStartsAt: { ...startsAt, nanoseconds: 200 },
          items: [],
          completedItemIds: [],
        })
      )
    );
    const first = await call();
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBeDefined();
    expect((await call({ cursor: first.nextCursor })).items).toHaveLength(20);
  });

  it('rechecks the current Booking basis and active account on continuation', async () => {
    await seedHistory(21);
    const { nextCursor } = await call();
    expect(nextCursor).toBeDefined();
    const basis = db.doc(`bookings/recommendation_basis_${participantId}`);
    await basis.update({
      lifecycle: {
        status: 'cancelled',
        cancelledAt: revenueAt,
        reasonCode: 'account_owner_cancelled',
      },
    });
    await expect(call({ cursor: nextCursor })).rejects.toMatchObject({ code: 'permission-denied' });
    await booking(participantId, { dataScope: 'test', testSessionId: 'test_other_session' });
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    await booking();
    const user = db.doc(`users/${uid}`);
    await user.update({ lifecycle: { status: 'disabled', disabledAt: revenueAt } });
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    await user.set(revenueAccount(uid, instructorId));
    const participant = db.doc(`participants/${participantId}`);
    await participant.update({ lifecycle: { status: 'archived', archivedAt: revenueAt } });
    await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
    await person();
  });

  it.each(['confirmed', 'completed'] as const)('allows a %s past Booking basis', async (status) => {
    const ref = db.doc(`bookings/recommendation_basis_${participantId}`);
    await ref.update({
      'occurrence.interval': { startsAt, endsAt: revenueAt },
      lifecycle: status === 'completed' ? { status, completedAt: revenueAt } : { status },
    });
    await feedback(1);
    expect((await call()).items).toHaveLength(1);
  });

  it('keeps family Booking history Participant-scoped and requires frozen party membership', async () => {
    const id = `recommendation_basis_${participantId}`;
    const ref = db.doc(`bookings/${id}`);
    const current = (await ref.get()).data()!;
    await Promise.all(
      [participantId, siblingId].map(async (id) => {
        const participantManagementId = `management_${id}`;
        await Promise.all([
          db
            .doc(`participants/${id}`)
            .update({ management: { kind: 'managed', participantManagementId } }),
          db.doc(`participant_management/${participantManagementId}`).set(
            ParticipantManagementSchema.parse({
              participantManagementId,
              participantId: id,
              accountId: 'recommendation_history_guardian',
              role: 'owner',
              authority: 'parent_guardian',
              status: 'active',
              ...metadata,
            })
          ),
        ]);
      })
    );
    await Promise.all([feedback(1), feedback(1, {}, siblingId)]);
    await booking(participantId, {
      party: { kind: 'family_group', participantIds: [participantId, siblingId] },
      occurrence: {
        ...current.occurrence,
        serviceParty: { participantIds: [participantId, siblingId], frozenAt: revenueAt },
      },
    });
    expect((await call()).items.map((item) => item.participantId)).toEqual([participantId]);
    expect(
      (await call({ participantId: siblingId })).items.map((item) => item.participantId)
    ).toEqual([siblingId]);
    await ref.update({ 'occurrence.serviceParty.participantIds': [participantId] });
    await expect(call({ participantId: siblingId })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('honors a block on relationship-only access and preserves an independent Booking basis', async () => {
    const participantManagementId = 'recommendation_history_management';
    const accountId = 'recommendation_history_guardian';
    const pair = { participantId, instructorId: InstructorIdSchema.parse(instructorId) };
    const relationshipId = instructorRelationshipIdFromPair(pair);
    const blockId = participantBlockIdFromDirection({ ...pair, createdByKind: 'instructor' });
    const relationship = db.doc(`instructor_relationships/${relationshipId}`);
    const block = db.doc(`participant_blocks/${blockId}`);
    const validFrom = timestampFromDate(new Date(Date.now() - 60_000));
    await Promise.all([
      db
        .doc(`participants/${participantId}`)
        .update({ management: { kind: 'managed', participantManagementId } }),
      db.doc(`participant_management/${participantManagementId}`).set(
        ParticipantManagementSchema.parse({
          participantManagementId,
          participantId,
          accountId,
          role: 'owner',
          authority: 'parent_guardian',
          status: 'active',
          ...metadata,
        })
      ),
      relationship.set(
        InstructorRelationshipSchema.parse({
          instructorRelationshipId: relationshipId,
          ...pair,
          status: 'active',
          basis: {
            kind: 'guardian_permission',
            participantManagementId,
            grantedByAccountId: accountId,
          },
          validFrom,
          expiresAt: instructorRelationshipExpiresAt(validFrom),
          ...metadata,
          createdAt: validFrom,
          updatedAt: validFrom,
        })
      ),
      seedHistory(21),
    ]);
    try {
      const first = await call();
      await block.set(
        ParticipantBlockSchema.parse({
          participantBlockId: blockId,
          ...pair,
          status: 'active',
          reason: 'Test block',
          createdBy: { kind: 'instructor', instructorId },
          ...metadata,
        })
      );
      expect((await call({ cursor: first.nextCursor })).items).toHaveLength(1);
      await db.doc(`bookings/recommendation_basis_${participantId}`).delete();
      await expect(call({ cursor: first.nextCursor })).rejects.toMatchObject({
        code: 'permission-denied',
      });
      await block.delete();
      expect((await call({ cursor: first.nextCursor })).items).toHaveLength(1);
      await relationship.delete();
      await expect(call({ cursor: first.nextCursor })).rejects.toMatchObject({
        code: 'permission-denied',
      });
    } finally {
      await Promise.all([relationship.delete(), block.delete()]);
    }
  });

  it('isolates LIVE and TEST resources and rejects a LIVE cursor in TEST', async () => {
    const testSessionId = 'test_recommendation_history';
    const actor = db.doc(`test_actors/${uid}`);
    const assignment = db.doc(`test_actor_assignments/${uid}`);
    await seedHistory(21);
    const live = await call();
    expect(live.nextCursor).toBeDefined();
    const testId = await feedback(50, { dataScope: 'test', testSessionId });
    await feedback(51, { dataScope: 'test', testSessionId: 'test_other_session' });
    await Promise.all([
      actor.set(
        TestActorSchema.parse({
          accountId: uid,
          participantIds: [participantId],
          instructorId,
          kind: 'test_instructor',
          allowed: true,
          dataScope: 'test',
          ...metadata,
        })
      ),
      assignment.set(
        TestActorAssignmentSchema.parse({
          accountId: uid,
          activeTestSessionId: testSessionId,
          revision: 1,
          updatedAt: revenueAt,
          audit: revenueAudit,
        })
      ),
      db.doc(`test_sessions/${testSessionId}`).set(
        TestSessionSchema.parse({
          testSessionId,
          schemaVersion: 1,
          status: 'active',
          label: 'Recommendations',
          createdByAccountId: uid,
          config: { startingBalanceKzt: 0, clonedCourseIds: [] },
          inventoryRevision: 1,
          ...metadata,
        })
      ),
      db.doc(`users/${uid}`).update({ dataScope: 'test' }),
      db.doc(`participants/${participantId}`).update({ dataScope: 'test', testSessionId }),
    ]);
    try {
      await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
      await booking(participantId, { dataScope: 'test', testSessionId });
      expect((await call()).items.map((item) => item.feedbackId)).toEqual([testId]);
      await expect(call({ cursor: live.nextCursor })).rejects.toMatchObject({
        code: 'permission-denied',
      });
    } finally {
      await Promise.all([actor.delete(), assignment.delete()]);
    }
  });

  if (process.env.RECOMMENDATION_HISTORY_CALLABLE_E2E)
    it('authenticates through Auth Emulator and calls the exported v2 function over HTTP', async () => {
      const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      const signInInstructor = async (id: string): Promise<string> => {
        const signup = await fetch(
          `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ returnSecureToken: true }),
          }
        );
        expect(signup.ok).toBe(true);
        const { localId, idToken } = await signup.json();
        await Promise.all([
          db.doc(`users/${localId}`).set(revenueAccount(localId, id)),
          db.doc(`instructors/${id}`).set({ linkedAccountId: localId }),
        ]);
        return idToken;
      };

      const invoke = async (
        data: Record<string, unknown>,
        token?: string,
        endpoint = 'queryInstructorParticipantRecommendationHistoryReadModels'
      ) => {
        const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/${endpoint}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ data }),
        });
        return response.json();
      };

      const [authorToken, idToken] = await Promise.all([
        signInInstructor(instructorA),
        signInInstructor(instructorId),
      ]);
      await seedHistory(41);
      const lessonBookingId = BookingIdSchema.parse('recommendation_previous_lesson');
      const previous = revenueBooking(lessonBookingId, {
        party: { kind: 'individual', participantIds: [participantId] },
        occurrence: {
          ...revenueBooking().occurrence,
          occurrenceId: 'recommendation_previous_occurrence',
          instructorId: instructorA,
          interval: { startsAt: { ...startsAt, nanoseconds: 500 }, endsAt: revenueAt },
          serviceParty: { participantIds: [participantId], frozenAt: revenueAt },
        },
      });
      const { occurrenceId } = previous.occurrence;
      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId,
        participantId,
      });
      await Promise.all([
        db.doc(`bookings/${lessonBookingId}`).set(previous),
        db.doc(`attendance/${attendanceId}`).set(
          AttendanceSchema.parse({
            attendanceId,
            subject: {
              subjectKind: 'booking',
              bookingId: lessonBookingId,
              occurrenceId,
              participantId,
            },
            attendanceStatus: 'present',
            recordedBy: { kind: 'instructor', instructorId: instructorA },
            recordedAt: revenueAt,
            lastChangedBy: { kind: 'instructor', instructorId: instructorA },
            updatedAt: revenueAt,
            revision: 1,
            correlationId: 'recommendation_history_e2e',
          })
        ),
      ]);
      const save = {
        kind: 'save_participant_lesson_feedback',
        intent: {
          participantId,
          lessonBookingId,
          items: [{ itemId: 'weight', text: 'Practice weight transfer' }],
        },
        exercisedCapability: 'instructor',
        expectedRevision: 0,
        idempotencyKey: 'recommendation_history_e2e_save',
        correlationId: 'recommendation_history_e2e',
      };
      const saved = await invoke(save, authorToken, 'executeCanonicalCommand');
      expect(saved.error).toBeUndefined();
      expect(saved).toHaveProperty('result');
      expect(
        (
          await invoke(
            { ...save, expectedRevision: 1, idempotencyKey: 'recommendation_history_e2e_denied' },
            idToken,
            'executeCanonicalCommand'
          )
        ).error?.status
      ).toBe('PERMISSION_DENIED');
      const recent = participantLessonFeedbackIdFromLessonParticipant({
        participantId,
        lessonBookingId,
      });
      expect((await invoke(input)).error?.status).toBe('UNAUTHENTICATED');
      const first = QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema.parse(
        (await invoke(input, idToken)).result
      );
      expect(first.items[0]).toMatchObject({
        feedbackId: recent,
        instructorId: instructorA,
        lessonStartsAt: previous.occurrence.interval.startsAt,
        lessonDate: '2026-01-15',
      });
      expect(first.nextCursor).toBeDefined();
      const second = QueryInstructorParticipantRecommendationHistoryReadModelsResultSchema.parse(
        (await invoke({ ...input, cursor: first.nextCursor }, idToken)).result
      );
      expect(
        second.items
          .map((row) => row.feedbackId)
          .some((id) => first.items.some((row) => row.feedbackId === id))
      ).toBe(false);
      await db.doc(`bookings/recommendation_basis_${siblingId}`).delete();
      expect((await invoke({ ...input, participantId: siblingId }, idToken)).error?.status).toBe(
        'PERMISSION_DENIED'
      );
      await db.doc(`bookings/recommendation_basis_${participantId}`).delete();
      expect((await invoke({ ...input, cursor: second.nextCursor }, idToken)).error?.status).toBe(
        'PERMISSION_DENIED'
      );
    }, 60_000);
});
