import {
  collection,
  db,
  deleteField,
  doc,
  handleFirestoreError,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from '../../infrastructure/firebase';
import { QUERY_LIMITS } from '../../shared';
import { ChatMessage, OperationType } from '../../types';
import { subscribeChatMessageStream } from './chatMessagesStreamClient';
import { callFunction } from '../../lib/functions/functionsClient';

function messagesPath(threadId: string): string {
  return `bookings/${threadId}/messages`;
}

export function subscribeToChatMessages(
  threadId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: () => void
): () => void {
  const path = messagesPath(threadId);
  let stopFallback: (() => void) | undefined;
  let hasMessages = false;
  const publish = (messages: ChatMessage[]) => {
    hasMessages = messages.length > 0;
    onMessages(messages);
  };
  const clear = () => {
    if (hasMessages) publish([]);
  };
  const stop = onSnapshot(
    query(
      collection(db, 'bookings', threadId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(QUERY_LIMITS.chatMessages)
    ),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache) return;
      publish(snapshot.docs.map((message) => message.data() as ChatMessage));
    },
    (error) => {
      clear();
      if ((error as { code?: string }).code === 'permission-denied') {
        stopFallback = subscribeChatMessageStream(threadId, publish, () => {
          clear();
          onError?.();
          handleFirestoreError(error, OperationType.GET, path);
        });
        return;
      }
      onError?.();
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
  return () => {
    stop();
    stopFallback?.();
  };
}

export async function createChatMessage(
  threadId: string,
  message: Omit<ChatMessage, 'id'>
): Promise<ChatMessage> {
  const messageRef = doc(collection(db, 'bookings', threadId, 'messages'));
  const savedMessage = { ...message, id: messageRef.id };

  try {
    await setDoc(messageRef, savedMessage);
    return savedMessage;
  } catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') {
      await callFunction(
        'mutateChatMessage',
        { operation: 'create', threadId, messageId: messageRef.id, message: savedMessage },
        { idempotencyKey: `chat:create:${messageRef.id}`, maxAttempts: 2 }
      );
      return savedMessage;
    }
    handleFirestoreError(error, OperationType.WRITE, messagesPath(threadId));
    throw error;
  }
}

export async function setChatMessageHomework(
  threadId: string,
  messageId: string,
  isHomework: boolean,
  homeworkForParticipantIds?: string[]
): Promise<void> {
  const path = `${messagesPath(threadId)}/${messageId}`;
  try {
    await updateDoc(doc(db, 'bookings', threadId, 'messages', messageId), {
      isHomework,
      homeworkForParticipantIds:
        isHomework && homeworkForParticipantIds ? homeworkForParticipantIds : deleteField(),
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') {
      await callFunction(
        'mutateChatMessage',
        {
          operation: 'homework',
          threadId,
          messageId,
          isHomework,
          ...(homeworkForParticipantIds ? { participantIds: homeworkForParticipantIds } : {}),
        },
        { idempotencyKey: `chat:homework:${messageId}:${Date.now()}`, maxAttempts: 2 }
      );
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}
