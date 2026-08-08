import { describe, expect, it } from 'vitest';
import { buildHomeworkForUserIds, isHomeworkVisibleToStudent } from '../../src/lib/chatHomework';
import { ChatMessage } from '../../src/types';

const homeworkMsg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  bookingId: 'b1',
  senderId: 'instructor-uid',
  senderName: 'Coach',
  senderAvatar: '',
  text: 'Do drills',
  timestamp: '2026-08-08T10:00:00.000Z',
  isHomework: true,
  ...overrides,
});

const GROUP_UIDS = ['student-1', 'student-2', 'student-3'];

describe('isHomeworkVisibleToStudent', () => {
  it('returns false when message is not homework', () => {
    expect(isHomeworkVisibleToStudent({ ...homeworkMsg(), isHomework: false }, 'student-1')).toBe(
      false
    );
  });

  it('shows homework to all students when no targets set', () => {
    expect(isHomeworkVisibleToStudent(homeworkMsg(), 'student-1')).toBe(true);
    expect(isHomeworkVisibleToStudent(homeworkMsg({ homeworkForUserIds: [] }), 'student-2')).toBe(
      true
    );
  });

  it('shows homework only to targeted students', () => {
    const msg = homeworkMsg({ homeworkForUserIds: ['student-2', 'student-3'] });
    expect(isHomeworkVisibleToStudent(msg, 'student-1')).toBe(false);
    expect(isHomeworkVisibleToStudent(msg, 'student-2')).toBe(true);
    expect(isHomeworkVisibleToStudent(msg, 'student-3')).toBe(true);
  });
});

describe('buildHomeworkForUserIds', () => {
  it('returns undefined for single participant courses', () => {
    expect(buildHomeworkForUserIds(['student-1'], 1)).toBeUndefined();
  });

  it('returns undefined when all students are targeted', () => {
    expect(buildHomeworkForUserIds(null, 3, GROUP_UIDS)).toBeUndefined();
    expect(buildHomeworkForUserIds([], 3, GROUP_UIDS)).toBeUndefined();
    expect(buildHomeworkForUserIds(GROUP_UIDS, 3, GROUP_UIDS)).toBeUndefined();
  });

  it('returns uid list for one student in group course', () => {
    expect(buildHomeworkForUserIds(['student-2'], 3, GROUP_UIDS)).toEqual(['student-2']);
  });

  it('returns uid list for multiple students in group course', () => {
    expect(buildHomeworkForUserIds(['student-1', 'student-3'], 3, GROUP_UIDS)).toEqual([
      'student-1',
      'student-3',
    ]);
  });
});
