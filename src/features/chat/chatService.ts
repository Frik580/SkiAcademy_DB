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

function messagesPath(threadId: string): string {
  return `bookings/${threadId}/messages`;
}

export function subscribeToChatMessages(
  threadId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: () => void
): () => void {
  const path = messagesPath(threadId);
  return onSnapshot(
    query(
      collection(db, 'bookings', threadId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(QUERY_LIMITS.chatMessages)
    ),
    (snapshot) => onMessages(snapshot.docs.map((message) => message.data() as ChatMessage)),
    (error) => {
      onError?.();
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
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
    handleFirestoreError(error, OperationType.WRITE, messagesPath(threadId));
    throw error;
  }
}

export async function setChatMessageHomework(
  threadId: string,
  messageId: string,
  isHomework: boolean,
  homeworkForUserIds?: string[]
): Promise<void> {
  const path = `${messagesPath(threadId)}/${messageId}`;
  try {
    await updateDoc(doc(db, 'bookings', threadId, 'messages', messageId), {
      isHomework,
      homeworkForUserIds: isHomework && homeworkForUserIds ? homeworkForUserIds : deleteField(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}
