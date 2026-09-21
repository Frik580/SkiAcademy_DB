import { describe, expect, it } from 'vitest';
import { deleteTestSessionStorageWithStore } from './deleteTestSessionStorage';

function memoryStore(initial: string[] = []) {
  const objects = new Set(initial);
  return {
    objects,
    async list(prefix: string) {
      return [...objects].filter((path) => path.startsWith(prefix));
    },
    async delete(objectPath: string) {
      if (!objects.has(objectPath)) return 'absent' as const;
      objects.delete(objectPath);
      return 'deleted' as const;
    },
  };
}

describe('deleteTestSessionStorage', () => {
  it('deletes only the requested session prefix and is idempotent', async () => {
    const store = memoryStore([
      'test-sessions/test_session_a/booking-chat/booking_01/a.jpg',
      'test-sessions/test_session_a/misc/note.jpg',
      'test-sessions/test_session_b/booking-chat/booking_01/a.jpg',
      'chat/booking_01/live.jpg',
      'courses/course_01.webp',
      'test-actors/account_01/avatar',
    ]);

    const first = await deleteTestSessionStorageWithStore('test_session_a', store);
    expect(first.complete).toBe(true);
    expect(first.deleted).toBe(2);
    expect(first.prefix).toBe('test-sessions/test_session_a/');
    expect(store.objects.has('test-sessions/test_session_b/booking-chat/booking_01/a.jpg')).toBe(true);
    expect(store.objects.has('chat/booking_01/live.jpg')).toBe(true);
    expect(store.objects.has('courses/course_01.webp')).toBe(true);
    expect(store.objects.has('test-actors/account_01/avatar')).toBe(true);

    const retry = await deleteTestSessionStorageWithStore('test_session_a', store);
    expect(retry.complete).toBe(true);
    expect(retry.listed).toBe(0);
    expect(retry.deleted).toBe(0);

    await expect(deleteTestSessionStorageWithStore('not-a-session', store)).rejects.toThrow();
    await expect(deleteTestSessionStorageWithStore('../test_session_a', store)).rejects.toThrow();
  });

  it('records incomplete result when a listed object is outside the prefix', async () => {
    const store = {
      async list() {
        return ['chat/booking_01/live.jpg'];
      },
      async delete() {
        return 'deleted' as const;
      },
    };
    const result = await deleteTestSessionStorageWithStore('test_session_a', store);
    expect(result.complete).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.errors[0]?.code).toBe('OUT_OF_PREFIX');
  });
});
