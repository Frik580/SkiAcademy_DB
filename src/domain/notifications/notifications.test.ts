import { describe, expect, it, vi } from 'vitest';

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn() }));

vi.mock('../../infrastructure/firebase', () => ({
  db: {},
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  setDoc,
}));

import { createNotificationForUser } from './notifications';

describe('LIVE client notification write', () => {
  it('stamps live without a Test Session', async () => {
    await createNotificationForUser('account_notification_01', {
      titleEn: 'Title',
      titleRu: 'Заголовок',
      messageEn: 'Message',
      messageRu: 'Сообщение',
    });

    expect(setDoc).toHaveBeenCalledOnce();
    expect(setDoc.mock.calls[0]?.[1]).toMatchObject({ dataScope: 'live' });
    expect(setDoc.mock.calls[0]?.[1]).not.toHaveProperty('testSessionId');
  });
});
