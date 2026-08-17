import { describe, expect, it } from 'vitest';
import {
  getNotificationTimestampMs,
  isNotificationExpired,
} from '../../src/domain/notifications/notificationCleanup';

describe('notificationCleanup', () => {
  it('parses ISO timestamps', () => {
    const iso = '2026-08-01T12:00:00.000Z';
    expect(getNotificationTimestampMs(iso)).toBe(new Date(iso).getTime());
  });

  it('parses Firestore Timestamp-like objects', () => {
    const date = new Date('2026-08-01T12:00:00.000Z');
    expect(getNotificationTimestampMs({ toDate: () => date })).toBe(date.getTime());
  });

  it('treats invalid timestamps as not expired', () => {
    expect(isNotificationExpired(undefined, 1)).toBe(false);
    expect(isNotificationExpired('not-a-date', 1)).toBe(false);
  });

  it('marks notifications older than retention as expired', () => {
    const now = Date.parse('2026-08-10T12:00:00.000Z');
    const twoDaysAgo = '2026-08-08T12:00:00.000Z';

    expect(isNotificationExpired(twoDaysAgo, 1, now)).toBe(true);
    expect(isNotificationExpired('2026-08-10T11:30:00.000Z', 1, now)).toBe(false);
  });
});
