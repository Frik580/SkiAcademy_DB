import { describe, expect, it } from 'vitest';
import {
  buildNotification,
  resolveNotificationText,
  translateKey,
} from '../../src/lib/notificationText';

describe('notificationText', () => {
  it('buildNotification creates bilingual title and message', () => {
    const content = buildNotification('lessonCancelled', (lang) =>
      lang === 'ru' ? 'Урок отменён' : 'Lesson cancelled'
    );

    expect(content.titleEn).toBe('Lesson Cancelled');
    expect(content.titleRu).toBe('Урок отменен');
    expect(content.messageEn).toBe('Lesson cancelled');
    expect(content.messageRu).toBe('Урок отменён');
  });

  it('resolveNotificationText prefers locale-specific fields', () => {
    const resolved = resolveNotificationText(
      {
        titleEn: 'Hello',
        titleRu: 'Привет',
        messageEn: 'Update',
        messageRu: 'Обновление',
      },
      'ru'
    );

    expect(resolved).toEqual({ title: 'Привет', message: 'Обновление' });
  });

  it('resolveNotificationText falls back to legacy title/message', () => {
    expect(
      resolveNotificationText({ title: 'Legacy title', message: 'Legacy message' }, 'en')
    ).toEqual({
      title: 'Legacy title',
      message: 'Legacy message',
    });
  });

  it('translateKey returns en fallback for unknown keys', () => {
    expect(translateKey('lessonCancelled', 'en')).toContain('Lesson');
    expect(translateKey('lessonCancelled', 'ru')).toContain('Урок');
  });
});
