import { describe, expect, it } from 'vitest';
import { buildHomeworkForParticipantIds, isHomeworkVisibleToStudent } from '../../src/domain/chat';
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

const GROUP_PARTICIPANT_IDS = ['participant-1', 'participant-2', 'participant-3'];

describe('isHomeworkVisibleToStudent', () => {
  it('returns false when message is not homework', () => {
    expect(
      isHomeworkVisibleToStudent({ ...homeworkMsg(), isHomework: false }, 'participant-1')
    ).toBe(false);
  });

  it('shows homework to all participants when no targets set', () => {
    expect(isHomeworkVisibleToStudent(homeworkMsg(), 'participant-1')).toBe(true);
    expect(
      isHomeworkVisibleToStudent(homeworkMsg({ homeworkForParticipantIds: [] }), 'participant-2')
    ).toBe(true);
  });

  it('hides targeted homework until a matching Participant is selected', () => {
    const msg = homeworkMsg({ homeworkForParticipantIds: ['participant-2', 'participant-3'] });
    expect(isHomeworkVisibleToStudent(msg, undefined)).toBe(false);
    expect(isHomeworkVisibleToStudent(msg, 'participant-1')).toBe(false);
    expect(isHomeworkVisibleToStudent(msg, 'participant-2')).toBe(true);
    expect(isHomeworkVisibleToStudent(msg, 'participant-3')).toBe(true);
  });
});

describe('buildHomeworkForParticipantIds', () => {
  it('returns undefined for single participant courses', () => {
    expect(buildHomeworkForParticipantIds(['participant-1'], 1)).toBeUndefined();
  });

  it('returns undefined when all participants are targeted', () => {
    expect(buildHomeworkForParticipantIds(null, 3, GROUP_PARTICIPANT_IDS)).toBeUndefined();
    expect(buildHomeworkForParticipantIds([], 3, GROUP_PARTICIPANT_IDS)).toBeUndefined();
    expect(
      buildHomeworkForParticipantIds(GROUP_PARTICIPANT_IDS, 3, GROUP_PARTICIPANT_IDS)
    ).toBeUndefined();
  });

  it('returns participant ids for one student in a group course', () => {
    expect(buildHomeworkForParticipantIds(['participant-2'], 3, GROUP_PARTICIPANT_IDS)).toEqual([
      'participant-2',
    ]);
  });

  it('returns participant ids for multiple students in a group course', () => {
    expect(
      buildHomeworkForParticipantIds(['participant-1', 'participant-3'], 3, GROUP_PARTICIPANT_IDS)
    ).toEqual(['participant-1', 'participant-3']);
  });
});
