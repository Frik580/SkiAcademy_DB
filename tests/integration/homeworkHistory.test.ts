import { doc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails } from '@firebase/rules-unit-testing';
import { createHomeworkHistory, getHomeworkPage } from '../../src/features/chat/homeworkHistory';
import { getStudentHomeworkSources } from '../../src/features/student-cabinet/components/student/studentHomeworkSources';
import type { CabinetSessionItem } from '../../src/features/course-enrollments';
import { confirmLegacyHomeworkSources, getLegacyHomeworkCandidates } from '../../src/features/student-cabinet/components/student/useStudentHomeworkSources';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

describe('homework Firestore query and authorization contracts', () => {
  beforeAll(setupIntegrationTestEnvironment, 60_000);
  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedData(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'users', 'account'), userProfile('account', 'test@example.com'));
      batch.set(doc(firestore, 'users', 'stranger'), userProfile('stranger', 'other@example.com'));
      batch.set(doc(firestore, 'participant_management_active_owner', 'child-a'), {
        accountId: 'account',
      });
      batch.set(doc(firestore, 'participant_management_active_owner', 'child-b'), {
        accountId: 'other-account',
      });
      for (const thread of ['first', 'second', 'foreign']) {
        batch.set(doc(firestore, 'bookings', thread), {
          party: { participantIds: thread === 'foreign' ? ['child-b'] : ['child-a', 'child-b'] },
          occurrence: { instructorId: 'coach' },
        });
      }
      for (let i = 0; i < 345; i++) {
        const id = String(i).padStart(4, '0');
        batch.set(doc(firestore, 'bookings', 'first', 'messages', id), {
          id: 'untrusted-stored-id',
          bookingId: 'first',
          senderId: 'coach-user',
          senderName: 'Coach',
          senderAvatar: '',
          timestamp: i < 45 ? '2026-01-01T00:00:00.000Z' : '2026-02-01T00:00:00.000Z',
          text: id,
          isHomework: i < 45,
        });
      }
      batch.set(doc(firestore, 'bookings', 'second', 'messages', 'older'), {
        timestamp: '2025-01-01T00:00:00.000Z',
        isHomework: true,
        bookingId: 'second',
        text: 'Older lesson',
      });
      await batch.commit();
    });
  });
  afterAll(teardownIntegrationTestEnvironment);

  it('reads only participant-scoped course sources, never an enrollment-only orphan chat', async () => {
    await seedData(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      for (const id of ['course-a', 'course-b']) {
        batch.set(doc(firestore, 'courses', id), { instructorRosterIds: ['coach'] });
        batch.set(doc(firestore, 'course_chat_access', 'account', 'courses', id), { activeCount: 1 });
        batch.set(doc(firestore, 'bookings', id, 'messages', 'homework'), {
          isHomework: true, timestamp: '2026-11-01T00:00:00Z', text: id,
        });
      }
      batch.set(doc(firestore, 'bookings', 'enrollment-a', 'messages', 'orphan'), {
        isHomework: true, timestamp: '2026-11-02T00:00:00Z', text: 'Must not be read',
      });
      await batch.commit();
    });
    const sessions = [
      { kind: 'course_day', participantId: 'a', courseId: 'course-a', enrollmentId: 'enrollment-a', lifecycleStatus: 'active' },
      { kind: 'course_day', participantId: 'b', courseId: 'course-b', enrollmentId: 'enrollment-b', lifecycleStatus: 'active' },
      { kind: 'course_day', participantId: 'a', courseId: 'cancelled-course', enrollmentId: 'cancelled-enrollment', lifecycleStatus: 'cancelled' },
    ] as CabinetSessionItem[];
    const firestore = integrationTestEnv().authenticatedContext('account').firestore();
    for (const participant of ['a', 'b', 'a']) {
      const ids = getStudentHomeworkSources(sessions, participant).map((source) => source.threadId);
      expect(ids).toEqual([`course-${participant}`]);
      const page = await createHomeworkHistory(ids, (id, cursor, size) =>
        getHomeworkPage(id, cursor, firestore, size)
      ).next();
      expect(page.messages.map((item) => item.text)).toEqual([`course-${participant}`]);
    }
    await assertFails(getHomeworkPage('enrollment-a', null, firestore));
    const candidates = getLegacyHomeworkCandidates(sessions, 'a');
    expect((await confirmLegacyHomeworkSources(candidates, 'account', firestore)).sources).toEqual([]);
    await seedData(async (context) => {
      const batch = writeBatch(context.firestore());
      batch.set(doc(context.firestore(), 'bookings', 'enrollment-a'), {
        userId: 'account', courseId: 'course-a', instructorId: 'course_course-a', status: 'completed',
      });
      await batch.commit();
    });
    const confirmed = await confirmLegacyHomeworkSources(candidates, 'account', firestore);
    expect(confirmed.sources.map((source) => source.threadId)).toEqual(['enrollment-a']);
    expect((await getHomeworkPage(confirmed.sources[0].threadId, null, firestore)).messages[0].text).toBe('Must not be read');
    await seedData(async (context) => {
      const batch = writeBatch(context.firestore());
      batch.update(doc(context.firestore(), 'bookings', 'enrollment-a'), { userId: 'stranger' });
      await batch.commit();
    });
    await expect(confirmLegacyHomeworkSources(candidates, 'account', firestore)).resolves.toMatchObject({
      sources: [], denied: ['enrollment-a'],
    });
  });

  it.each([1, 5, 20, 21, 50])(
    'globally merges %i real Firestore sources with cursors, ties and empty streams',
    async (count) => {
      const ids = Array.from({ length: count }, (_, i) => `stream-${String(i).padStart(3, '0')}`);
      const expected: { id: string; threadId: string; timestamp: string }[] = [];
      await seedData(async (context) => {
        const firestore = context.firestore();
        const batch = writeBatch(firestore);
        for (const [index, id] of [...ids, 'empty'].entries()) {
          batch.set(doc(firestore, 'bookings', id), {
            party: { participantIds: ['child-a'] },
            occurrence: { instructorId: 'coach' },
          });
          if (id === 'empty') continue;
          for (let n = 0; n < 5; n++) {
            const timestamp =
              n === 4 && index === count - 1
                ? '2027-01-01T00:00:00.000Z'
                : `2026-01-${String(1 + ((index + n) % 7)).padStart(2, '0')}T00:00:00.000Z`;
            const item = { id: String(n), timestamp, threadId: id };
            expected.push(item);
            batch.set(doc(firestore, 'bookings', id, 'messages', item.id), {
              timestamp,
              text: item.id,
              isHomework: true,
            });
          }
          batch.set(doc(firestore, 'bookings', id, 'messages', 'ordinary'), {
            timestamp: '2028-01-01T00:00:00.000Z',
            isHomework: false,
          });
        }
        await batch.commit();
      });
      const firestore = integrationTestEnv().authenticatedContext('account').firestore();
      let running = 0;
      let peak = 0;
      const pager = createHomeworkHistory(
        [...ids, ids[0], 'empty', 'foreign'],
        async (id, cursor, size) => {
          running++;
          peak = Math.max(peak, running);
          try {
            return await getHomeworkPage(id, cursor, firestore, size);
          } finally {
            running--;
          }
        }
      );
      const actual = [];
      let page;
      do {
        page = await pager.next();
        expect(page.messages.length).toBeLessThanOrEqual(20);
        actual.push(
          ...page.messages.map(({ id, timestamp, threadId }) => ({ id, timestamp, threadId }))
        );
      } while (page.hasMore);
      expect(actual).toEqual(
        expected.sort(
          (a, b) =>
            b.timestamp.localeCompare(a.timestamp) ||
            b.threadId.localeCompare(a.threadId) ||
            b.id.localeCompare(a.id)
        )
      );
      expect(actual[0].threadId).toBe(ids.at(-1));
      expect(new Set(actual.map((m) => `${m.threadId}/${m.id}`)).size).toBe(count * 5);
      expect(peak).toBeLessThanOrEqual(4);
    },
    30_000
  );

  it('uses instructor Rules for family lessons and Course IDs and observes revocation', async () => {
    await seedData(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'users', 'coach-account'), {
        ...userProfile('coach-account', 'coach@example.com'),
        role: 'user',
        instructorId: 'coach',
      });
      batch.set(doc(firestore, 'bookings', 'foreign-instructor'), {
        party: { participantIds: ['child-a'] },
        occurrence: { instructorId: 'someone-else' },
      });
      batch.set(doc(firestore, 'courses', 'course-id'), { instructorRosterIds: ['coach'] });
      batch.set(doc(firestore, 'bookings', 'course-id', 'messages', 'group-homework'), {
        timestamp: '2026-11-07T10:00:00.000Z',
        isHomework: true,
        text: 'Group homework',
        homeworkForParticipantIds: ['child-b'],
      });
      await batch.commit();
    });
    const firestore = integrationTestEnv().authenticatedContext('coach-account').firestore();
    const family = await getHomeworkPage('first', null, firestore);
    expect(family.messages).toHaveLength(20);
    // Course ID is a thread ID even without a Booking document of that ID.
    expect((await getHomeworkPage('course-id', null, firestore)).messages[0].id).toBe(
      'group-homework'
    );
    // Rules authorize the common chat, not individual homework audiences.
    expect(
      (await getHomeworkPage('course-id', null, firestore)).messages[0].homeworkForParticipantIds
    ).toEqual(['child-b']);
    await assertFails(getHomeworkPage('foreign-instructor', null, firestore));
    await seedData(async (context) => {
      const batch = writeBatch(context.firestore());
      batch.update(doc(context.firestore(), 'bookings', 'first'), {
        'occurrence.instructorId': 'someone-else',
      });
      await batch.commit();
    });
    await assertFails(getHomeworkPage('first', family.cursor, firestore));
  });

  it('returns all 45 old assignments despite 300 later messages; value cursors survive deletion', async () => {
    const firestore = integrationTestEnv().authenticatedContext('account').firestore();
    const first = await getHomeworkPage('first', null, firestore);
    expect(first.messages).toHaveLength(20);
    expect(first.messages.map((m) => m.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(44 - i).padStart(4, '0'))
    );
    await seedData(async (context) => {
      const batch = writeBatch(context.firestore());
      batch.delete(doc(context.firestore(), 'bookings', 'first', 'messages', first.cursor!.id));
      await batch.commit();
    });
    const second = await getHomeworkPage('first', first.cursor, firestore);
    const third = await getHomeworkPage('first', second.cursor, firestore);
    expect(
      [...first.messages, ...second.messages, ...third.messages].map((m) => m.id)
    ).toHaveLength(45);
    expect(
      new Set([...first.messages, ...second.messages, ...third.messages].map((m) => m.id)).size
    ).toBe(45);
    expect(third.hasMore).toBe(false);
  });

  it('merges separate lessons and skips denied/deleted threads under existing Rules', async () => {
    const firestore = integrationTestEnv().authenticatedContext('account').firestore();
    const history = createHomeworkHistory(
      ['first', 'second', 'foreign', 'deleted'],
      (thread, cursor) => getHomeworkPage(thread, cursor, firestore)
    );
    const all = [];
    let page;
    do {
      page = await history.next();
      all.push(...page.messages);
    } while (page.hasMore);
    expect(all).toHaveLength(46);
    expect(all.at(-1)?.threadId).toBe('second');
    expect(all.some((m) => ['foreign', 'deleted'].includes(m.threadId))).toBe(false);
    await assertFails(
      getHomeworkPage(
        'first',
        null,
        integrationTestEnv().authenticatedContext('stranger').firestore()
      )
    );
    await assertFails(
      getHomeworkPage('first', null, integrationTestEnv().unauthenticatedContext().firestore())
    );
  });
});
