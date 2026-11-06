import type { Firestore } from 'firebase/firestore';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../src/types';
import {
  clearIntegrationFirestore,
  integrationTestEnv,
  seedData,
  setupIntegrationTestEnvironment,
  teardownIntegrationTestEnvironment,
  userProfile,
} from './helpers';

// Use the real service/query/onSnapshot with a Rules-authenticated client database.
// Only the application singleton and error logger are replaced.
const fixture = vi.hoisted(() => ({ firestore: undefined as Firestore | undefined }));
vi.mock('../../src/infrastructure/firebase', async () => ({
  ...(await import('firebase/firestore')),
  get db() {
    return fixture.firestore;
  },
  handleFirestoreError: vi.fn(),
}));
import { subscribeToChatMessages } from '../../src/features/chat/chatService';

const stops: (() => void)[] = [];
describe('coach/full-chat message service on Firestore emulator', () => {
  beforeAll(setupIntegrationTestEnvironment);
  beforeEach(async () => {
    await clearIntegrationFirestore();
    await seedData(async (context) => {
      const firestore = context.firestore();
      const batch = writeBatch(firestore);
      batch.set(doc(firestore, 'users', 'account'), userProfile('account', 'student@example.com'));
      batch.set(doc(firestore, 'participant_management_active_owner', 'child'), {
        accountId: 'account',
      });
      batch.set(doc(firestore, 'bookings', 'lesson'), {
        party: { participantIds: ['child'] },
        occurrence: { instructorId: 'coach' },
      });
      for (let i = 0; i < 105; i++) {
        const id = String(i).padStart(3, '0');
        batch.set(doc(firestore, 'bookings', 'lesson', 'messages', id), {
          id,
          text: id,
          timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
          ...(i === 104
            ? { attachmentType: 'video', attachmentUrl: 'private/object', text: 'Video comment' }
            : {}),
        });
      }
      await batch.commit();
    });
    fixture.firestore = integrationTestEnv().authenticatedContext('account').firestore();
  });
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
  });
  afterAll(teardownIntegrationTestEnvironment);

  it('returns the existing 100-message window, preserves video fields and receives a new message live', async () => {
    const results: ChatMessage[][] = [];
    const error = vi.fn();
    stops.push(subscribeToChatMessages('lesson', (messages) => results.push(messages), error));
    await vi.waitFor(() => expect(results.at(-1)).toHaveLength(100));
    expect(results.at(-1)?.[0]).toMatchObject({
      id: '104',
      text: 'Video comment',
      attachmentUrl: 'private/object',
    });
    expect(results.at(-1)?.at(-1)?.id).toBe('005');
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', 'lesson', 'messages', 'live'), {
        id: 'live',
        text: 'New realtime reply',
        timestamp: '2026-02-01T00:00:00.000Z',
      });
    });
    await vi.waitFor(() => expect(results.at(-1)?.[0]?.id).toBe('live'));
    expect(results.at(-1)).toHaveLength(100);
    expect(error).not.toHaveBeenCalled();
    const stop = stops.pop()!;
    stop();
    const count = results.length;
    const control: ChatMessage[][] = [];
    stops.push(subscribeToChatMessages('lesson', (messages) => control.push(messages)));
    await vi.waitFor(() => expect(control.at(-1)?.[0]?.id).toBe('live'));
    await seedData(async (context) => {
      await setDoc(doc(context.firestore(), 'bookings', 'lesson', 'messages', 'after-stop'), {
        id: 'after-stop',
        timestamp: '2026-03-01T00:00:00.000Z',
      });
    });
    await vi.waitFor(() => expect(control.at(-1)?.[0]?.id).toBe('after-stop'));
    expect(results).toHaveLength(count);
  });

  it('reports denied reads for a foreign account and an unauthenticated client', async () => {
    for (const context of [
      integrationTestEnv().authenticatedContext('stranger'),
      integrationTestEnv().unauthenticatedContext(),
    ]) {
      fixture.firestore = context.firestore();
      const receive = vi.fn();
      const fail = vi.fn();
      stops.push(subscribeToChatMessages('lesson', receive, fail));
      await vi.waitFor(() => expect(fail).toHaveBeenCalledOnce());
      expect(receive).not.toHaveBeenCalled();
    }
  });
});
