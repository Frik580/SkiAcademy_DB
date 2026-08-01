import { translations, type Language, type TranslationKey } from './i18n/translations';

export interface BilingualNotificationContent {
  titleEn: string;
  titleRu: string;
  messageEn: string;
  messageRu: string;
}

export interface StoredNotificationFields {
  title?: string;
  message?: string;
  titleEn?: string;
  titleRu?: string;
  messageEn?: string;
  messageRu?: string;
}

export interface DbNotification extends StoredNotificationFields {
  id: string;
  userId: string;
  timestamp: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  isRead?: boolean;
}

export function translateKey(key: TranslationKey, language: Language): string {
  return translations[language][key] || translations.en[key] || String(key);
}

export function buildNotification(
  titleKey: TranslationKey,
  messageBuilder: (language: Language) => string
): BilingualNotificationContent {
  return {
    titleEn: translateKey(titleKey, 'en'),
    titleRu: translateKey(titleKey, 'ru'),
    messageEn: messageBuilder('en'),
    messageRu: messageBuilder('ru'),
  };
}

export function resolveNotificationText(
  notification: StoredNotificationFields,
  language: Language
): { title: string; message: string } {
  const title =
    language === 'ru'
      ? (notification.titleRu ?? notification.titleEn ?? notification.title ?? '')
      : (notification.titleEn ?? notification.titleRu ?? notification.title ?? '');

  const message =
    language === 'ru'
      ? (notification.messageRu ?? notification.messageEn ?? notification.message ?? '')
      : (notification.messageEn ?? notification.messageRu ?? notification.message ?? '');

  return { title, message };
}
