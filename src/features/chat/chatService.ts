import { collection, db, doc } from '../../infrastructure/firebase';
import type { ChatMessage } from '../../types';
import { subscribeChatMessageStream } from './chatMessagesStreamClient';
import { callFunction } from '../../lib/functions/functionsClient';

export function subscribeToChatMessages(
  threadId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: () => void
): () => void {
  return subscribeChatMessageStream(threadId, onMessages, () => {
    onMessages([]);
    onError?.();
  });
}

export async function createChatMessage(
  threadId: string,
  expectedAccountId: string,
  message: Pick<
    ChatMessage,
    'text' | 'attachmentType' | 'attachmentUrl' | 'attachmentName' | 'attachmentSize'
  >,
  context: 'participant' | 'instructor' | 'administration',
  homework?: { participantIds?: string[] }
): Promise<void> {
  const messageRef = doc(collection(db, 'bookings', threadId, 'verified_chat_messages'));
  await callFunction(
    'mutateChatMessage',
    {
      operation: 'create',
      threadId,
      expectedAccountId,
      messageId: messageRef.id,
      message,
      context,
      ...(homework ? { homework } : {}),
    },
    { idempotencyKey: `chat:create:${messageRef.id}`, maxAttempts: 2 }
  );
}

export async function setChatMessageHomework(
  threadId: string,
  messageId: string,
  expectedAccountId: string,
  isHomework: boolean,
  homeworkForParticipantIds?: string[]
): Promise<void> {
  await callFunction(
    'mutateChatMessage',
    {
      operation: 'homework',
      threadId,
      messageId,
      expectedAccountId,
      isHomework,
      ...(homeworkForParticipantIds ? { participantIds: homeworkForParticipantIds } : {}),
    },
    { idempotencyKey: `chat:homework:${messageId}:${Date.now()}`, maxAttempts: 2 }
  );
}
