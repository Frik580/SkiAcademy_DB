import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createExecuteCanonicalCommandHandler } from './executeCanonicalCommandCallable';

describe('mixed-version progress transport', () => {
  it.each(['update_participant_progress', 'manage_participant_level'])(
    'rejects old %s before any database access, including repeat attempts',
    async (kind) => {
      const collection = vi.fn(() => {
        throw new Error('database access');
      });
      const runTransaction = vi.fn();
      const handler = createExecuteCanonicalCommandHandler({
        collection,
        runTransaction,
      } as unknown as Firestore);
      const request = {
        auth: { uid: 'old-client' },
        data: { kind, idempotencyKey: 'same-release-request', intent: { level: 3 } },
      } as unknown as Parameters<typeof handler>[0];
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(handler(request)).rejects.toMatchObject({
          code: 'failed-precondition',
          message: expect.stringContaining('Обновите страницу'),
          details: { clientUpdateRequired: true, retryable: false },
        });
      }
      expect(collection).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );
  it('does not treat the new protocol marker as authorization', async () => {
    const handler = createExecuteCanonicalCommandHandler({} as Firestore);
    await expect(
      handler({
        data: { participantProgressContract: 2, kind: 'update_participant_progress' },
      } as unknown as Parameters<typeof handler>[0])
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('new progress clients and old unrelated commands still reach server account authorization', async () => {
    const collection = vi.fn(() => {
      throw new Error('account authorization boundary');
    });
    const handler = createExecuteCanonicalCommandHandler({ collection } as unknown as Firestore);
    for (const data of [
      { kind: 'update_participant_progress', participantProgressContract: 2 },
      { kind: 'manage_participant_level', participantProgressContract: 2 },
      { kind: 'create_confirmed_booking' },
    ])
      await expect(
        handler({ auth: { uid: 'client' }, data } as unknown as Parameters<typeof handler>[0])
      ).rejects.toThrow('account authorization boundary');
    expect(collection).toHaveBeenCalledTimes(3);
  });
});
