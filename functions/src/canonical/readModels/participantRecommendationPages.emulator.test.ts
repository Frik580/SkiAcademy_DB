import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
  participantLessonFeedbackIdFromLessonParticipant,
  testCanonicalReadScope,
} from '@ski-academy/shared-domain';
import { queryParticipantLessonFeedbackReadModels } from './participantLessonFeedbackReadModels';
import { createQueryParticipantLessonFeedbackReadModelsHandler } from './queryParticipantLessonFeedbackReadModelsCallable';

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('recommendation pages on Firestore', () => {
  it('continues within lessons and past 50, with scoped cursors and fresh authorization', async () => {
    const suffix = randomUUID();
    const app = initializeApp({ projectId: 'demo-ski-school-e2e' }, suffix);
    const db = getFirestore(app);
    const accountId = AccountIdSchema.parse(`rec_account_${suffix}`);
    const outsider = AccountIdSchema.parse(`rec_outsider_${suffix}`);
    const participants = ['a', 'b'].map((id) => ParticipantIdSchema.parse(`rec_${id}_${suffix}`));
    const [participantId, child] = participants;
    const readScope = testCanonicalReadScope(
      TestSessionIdSchema.parse(`test_rec_session_${suffix}`)
    );
    const stamp = { seconds: 1_780_000_000, nanoseconds: 0 };
    const metadata = {
      revision: 1,
      createdAt: stamp,
      updatedAt: stamp,
      audit: { createdByCommandId: 'seed', lastChangedByCommandId: 'seed', correlationId: 'seed' },
    };
    const batch = db.batch();
    const paths: string[] = [];
    const seed = (path: string, data: Record<string, unknown>) => {
      paths.push(path);
      batch.set(db.doc(path), { ...metadata, ...data });
    };
    const managementPath = (id: string) => `participant_management/management_${id}`;
    for (const id of [accountId, outsider])
      seed(`users/${id}`, { accountId: id, lifecycle: { status: 'active' } });
    for (const id of participants) {
      seed(`participants/${id}`, {
        participantId: id,
        displayName: 'Student',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        lifecycle: { status: 'active' },
        management: { kind: 'managed', participantManagementId: `management_${id}` },
      });
      seed(managementPath(id), {
        participantManagementId: `management_${id}`,
        accountId,
        participantId: id,
        status: 'active',
        role: 'owner',
        authority: id === participantId ? 'self' : 'parent_guardian',
      });
    }
    function feedback(index: number, items: { itemId: string; text: string }[], test = false) {
      const lessonBookingId = BookingIdSchema.parse(`rec_lesson_${index}_${suffix}`);
      const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
        participantId,
        lessonBookingId,
      });
      seed(`participant_lesson_feedback/${feedbackId}`, {
        feedbackId,
        participantId,
        lessonBookingId,
        instructorId: index % 2 === 0 ? 'coach_a' : 'coach_b',
        items,
        completedItemIds: index === 0 ? ['item_0'] : [],
        lessonStartsAt: { seconds: stamp.seconds - index, nanoseconds: 0 },
        lessonDate: '2026-06-01',
        ...(test ? { dataScope: 'test', testSessionId: readScope.testSessionId } : {}),
      });
      return feedbackId;
    }
    // Empty and foreign-scope rows must not consume slots, even across query batches.
    for (let i = -39; i < 0; i++)
      feedback(i, i % 2 ? [{ itemId: 'test', text: 'TEST only' }] : [], i % 2 !== 0);
    feedback(
      0,
      Array.from({ length: 7 }, (_, i) => ({ itemId: `item_${6 - i}`, text: `Newest ${6 - i}` }))
    );
    for (let i = 1; i <= 51; i++) feedback(i, [{ itemId: 'single', text: `Lesson ${i}` }]);

    const cursorSecret = 'recommendation-emulator-secret';
    const query = async (cursor?: string) => {
      const items = [];
      for (let i = 0; i < 4; i++) {
        const result = await queryParticipantLessonFeedbackReadModels(
          db,
          { scope: 'managed_recommendations', participantId, cursor },
          { accountId, cursorSecret }
        );
        if (result.scope !== 'managed_recommendations') throw new Error('Wrong scope');
        items.push(...result.items);
        if (!result.scanCursor) return { items, nextCursor: result.nextCursor };
        expect(result.nextCursor).toBeNull();
        cursor = result.scanCursor;
      }
      throw new Error('Unexpected number of scan continuations');
    };
    try {
      await batch.commit();
      const first = await query();
      expect(first.items.map(({ text }) => text)).toEqual([
        'Newest 0',
        'Newest 1',
        'Newest 2',
        'Newest 3',
        'Newest 4',
      ]);
      expect(first.items[0]).toMatchObject({
        completed: true,
        instructorId: 'coach_a',
        lessonAvailable: false,
      });
      const cursor = first.nextCursor!;
      expect(cursor).toBeTruthy();
      await expect(query('X' + cursor)).rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(
        queryParticipantLessonFeedbackReadModels(
          db,
          { scope: 'managed_recommendations', participantId: child, cursor },
          { accountId, cursorSecret }
        )
      ).rejects.toMatchObject({ code: 'invalid-argument' });
      await expect(
        queryParticipantLessonFeedbackReadModels(
          db,
          { scope: 'managed_recommendations', participantId, cursor },
          { accountId, cursorSecret, readScope }
        )
      ).rejects.toMatchObject({ code: 'invalid-argument' });

      const handler = createQueryParticipantLessonFeedbackReadModelsHandler(db, () => cursorSecret);
      const request = { data: { scope: 'managed_recommendations', participantId, cursor } };
      await expect(handler(request as Parameters<typeof handler>[0])).rejects.toMatchObject({
        code: 'unauthenticated',
      });
      await expect(
        handler({ ...request, auth: { uid: outsider } } as Parameters<typeof handler>[0])
      ).rejects.toMatchObject({ code: 'permission-denied' });

      const second = await query(cursor);
      expect(second.items.map(({ text }) => text)).toEqual([
        'Newest 5',
        'Newest 6',
        'Lesson 1',
        'Lesson 2',
        'Lesson 3',
      ]);
      expect(second.items[2].instructorId).toBe('coach_b');
      const texts = [...first.items, ...second.items].map(({ text }) => text);
      let next = second.nextCursor;
      for (let i = 0; next && i < 15; i++) {
        const result = await query(next);
        expect(result.items.length).toBeLessThanOrEqual(5);
        texts.push(...result.items.map(({ text }) => text));
        next = result.nextCursor;
      }
      expect(next).toBeNull();
      expect(texts).toEqual([
        ...Array.from({ length: 7 }, (_, i) => `Newest ${i}`),
        ...Array.from({ length: 51 }, (_, i) => `Lesson ${i + 1}`),
      ]);

      await db.doc(managementPath(participantId)).delete();
      await expect(
        handler({ ...request, auth: { uid: accountId } } as Parameters<typeof handler>[0])
      ).rejects.toMatchObject({ code: 'permission-denied' });
    } finally {
      const cleanup = db.batch();
      for (const path of paths) cleanup.delete(db.doc(path));
      await cleanup.commit();
      await deleteApp(app);
    }
  }, 30_000);
});
