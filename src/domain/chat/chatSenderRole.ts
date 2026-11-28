import type { ChatMessage } from '../../types';

export type ChatSenderRole = 'client' | 'instructor' | 'admin';

export function resolveChatSenderRole(message: Pick<ChatMessage, 'senderRole'>): ChatSenderRole {
  if (message.senderRole === 'admin' || message.senderRole === 'instructor') {
    return message.senderRole;
  }
  return 'client';
}
