import { describe, expect, it } from 'vitest';
import {
  instructorAttendanceAttentionAction,
  instructorLessonAttendanceFollowUp,
  instructorLessonAttendanceIsOverdue,
} from '../../src/features/instructor-workspace/instructorAttendanceOverdue';

describe('instructor lesson attendance follow-up', () => {
  const endsAtEpochMs = Date.parse('2026-09-10T12:00:00.000Z');
  const startsAtEpochMs = Date.parse('2026-09-10T10:00:00.000Z');
  const afterDeadlineMs = Date.parse('2026-09-11T12:00:00.000Z');
  const beforeDeadlineMs = Date.parse('2026-09-11T11:59:59.000Z');
  const beforeStartMs = Date.parse('2026-09-10T09:59:59.000Z');
  const missing = [{ participantId: 'participant_a' }];

  it('is not overdue before endsAt+24h', () => {
    expect(
      instructorLessonAttendanceIsOverdue({
        status: 'confirmed',
        endsAtEpochMs,
        attendance: missing,
        nowMs: beforeDeadlineMs,
      })
    ).toBe(false);
  });

  it('keeps instructor recording available in-window and does not mark overdue', () => {
    expect(
      instructorLessonAttendanceFollowUp({
        status: 'confirmed',
        startsAtEpochMs,
        endsAtEpochMs,
        attendance: missing,
        nowMs: beforeDeadlineMs,
      })
    ).toBe('missing_in_window');
    expect(instructorAttendanceAttentionAction('missing_in_window')).toBe('record');
  });

  it('after +24h requires administrator and does not restore instructor write', () => {
    const followUp = instructorLessonAttendanceFollowUp({
      status: 'confirmed',
      startsAtEpochMs,
      endsAtEpochMs,
      attendance: [
        { participantId: 'participant_a', attendanceStatus: 'present' },
        { participantId: 'participant_b' },
      ],
      nowMs: afterDeadlineMs,
    });
    expect(followUp).toBe('overdue_admin_required');
    expect(instructorLessonAttendanceIsOverdue({
      status: 'confirmed',
      endsAtEpochMs,
      attendance: [{ participantId: 'participant_b' }],
      nowMs: afterDeadlineMs,
    })).toBe(true);
    expect(instructorAttendanceAttentionAction(followUp)).toBe('admin_required');
    expect(instructorAttendanceAttentionAction('none')).toBe('none');
  });

  it('does not advertise a write action before the lesson starts', () => {
    expect(
      instructorLessonAttendanceFollowUp({
        status: 'confirmed',
        startsAtEpochMs,
        endsAtEpochMs,
        attendance: missing,
        nowMs: beforeStartMs,
      })
    ).toBe('none');
  });

  it('clears after present or absent is recorded for every participant', () => {
    expect(
      instructorLessonAttendanceFollowUp({
        status: 'completed',
        startsAtEpochMs,
        endsAtEpochMs,
        attendance: [
          { participantId: 'participant_a', attendanceStatus: 'present' },
          { participantId: 'participant_b', attendanceStatus: 'absent' },
        ],
        nowMs: afterDeadlineMs,
      })
    ).toBe('none');
  });
});
