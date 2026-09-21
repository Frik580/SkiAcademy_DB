import { describe, expect, it } from 'vitest';
import { TestStoragePathError } from '@ski-academy/shared-domain';
import { resolveBookingChatAttachmentStoragePath } from '../../src/features/chat/chatAttachmentStorage';

describe('booking chat attachment storage contract', () => {
  it('uses the LIVE chat prefix for ordinary bookings', () => {
    expect(
      resolveBookingChatAttachmentStoragePath({ id: 'booking_chat_01', chatId: 'booking_chat_01' }, 'photo.jpg')
    ).toBe('chat/booking_chat_01/photo.jpg');
  });

  it('does not upload TEST attachments through the client path until Rules rollout', () => {
    expect(() =>
      resolveBookingChatAttachmentStoragePath(
        {
          id: 'booking_chat_01',
          dataScope: 'test',
          testSessionId: 'test_session_storage_a',
        },
        'photo.jpg'
      )
    ).toThrow(new TestStoragePathError('TEST_STORAGE_CLIENT_UNREACHABLE'));
  });
});
