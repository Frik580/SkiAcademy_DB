import {
  assertTestStorageClientReachable,
  bookingChatStoragePath,
  parseResourceStorageScope,
} from '@ski-academy/shared-domain';

export function resolveBookingChatAttachmentStoragePath(
  booking: {
    readonly id?: string;
    readonly chatId?: string;
    readonly dataScope?: unknown;
    readonly testSessionId?: unknown;
  },
  fileName: string
): string {
  const threadId = booking.chatId || booking.id;
  if (!threadId) {
    throw new Error('MISSING_CHAT_THREAD');
  }
  const scope = parseResourceStorageScope(booking);
  assertTestStorageClientReachable(scope);
  return bookingChatStoragePath(scope, threadId, fileName);
}
