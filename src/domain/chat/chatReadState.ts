const STORAGE_PREFIX = 'alpine_glide_chat_read_';

export function getChatLastReadAt(userId: string, chatId: string): string {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${userId}_${chatId}`) || '';
  } catch {
    return '';
  }
}

export function markChatReadAt(userId: string, chatId: string, at?: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}_${chatId}`, at ?? new Date().toISOString());
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function seedChatReadAt(userId: string, chatId: string, at: string): void {
  if (getChatLastReadAt(userId, chatId)) return;
  markChatReadAt(userId, chatId, at);
}
