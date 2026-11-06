import { doc, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails } from '@firebase/rules-unit-testing';
import { createHomeworkHistory, getHomeworkPage } from '../../src/features/chat/homeworkHistory';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

describe('homework Firestore query and authorization contracts', () => {
  beforeAll(setupIntegrationTestEnvironment);
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
