import { describe, expect, it } from 'vitest';
import { normalizeChatTimestamp } from '../../src/features/student-cabinet/useBookingChatUnread';

describe('normalizeChatTimestamp', () => {
  it('returns ISO strings unchanged', () => {
    const iso = '2026-08-08T10:00:00.000Z';
    expect(normalizeChatTimestamp(iso)).toBe(iso);
  });

  it('converts Firestore-like timestamp objects', () => {
    const seconds = 1_700_000_000;
    expect(normalizeChatTimestamp({ seconds })).toBe(new Date(seconds * 1000).toISOString());
  });
});
