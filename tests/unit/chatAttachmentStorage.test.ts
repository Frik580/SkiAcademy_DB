import { describe, expect, it } from 'vitest';
import { resolveBookingChatAttachmentStoragePath } from '../../src/features/chat/chatAttachmentStorage';

describe('booking chat attachment storage contract', () => {
  it('uses the LIVE chat prefix for ordinary bookings', () => {
    expect(
      resolveBookingChatAttachmentStoragePath(
        { id: 'booking_chat_01', chatId: 'booking_chat_01' },
        'photo.jpg'
      )
    ).toBe('chat/booking_chat_01/photo.jpg');
  });

  it('uses the isolated TEST prefix for the authorized media gateway', () => {
    expect(
      resolveBookingChatAttachmentStoragePath(
        {
          id: 'booking_chat_01',
          dataScope: 'test',
          testSessionId: 'test_session_storage_a',
        },
        'photo.jpg'
      )
    ).toBe('test-sessions/test_session_storage_a/booking-chat/booking_chat_01/photo.jpg');
  });
});
