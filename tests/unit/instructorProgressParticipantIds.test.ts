import { describe, expect, it } from 'vitest';
import { timestampFromDate } from '@ski-academy/shared-domain';
import type {
  InstructorLessonBookingItem,
  ParticipantAccessCabinetItem,
} from '../../src/features/booking-collaboration/bookingCollaborationContracts';
import { instructorProgressParticipantIds } from '../../src/features/participant-progress/instructorProgressParticipantIds';

const now = Date.parse('2026-09-26T10:00:00.000Z');

function booking(input: {
  participantId: string;
  status?: InstructorLessonBookingItem['status'];
  startsAtEpochMs?: number;
  attendanceStatus?: 'present' | 'absent';
}): InstructorLessonBookingItem {
  return {
    bookingId: `booking_${input.participantId}`,
    revision: 1,
    status: input.status ?? 'confirmed',
    date: '2026-09-26',
    time: '09:00',
    durationHours: 1,
    startsAtEpochMs: input.startsAtEpochMs ?? now - 60_000,
    endsAtEpochMs: now,
    instructorId: 'instructor_a',
    instructorName: 'Instructor A',
    participantIds: [input.participantId],
    participantNames: ['Participant'],
    participants: [{ participantId: input.participantId, displayName: 'Participant' }],
    partyKind: 'individual',
    bookingOrigin: 'account',
    authorizedActions: {} as InstructorLessonBookingItem['authorizedActions'],
    attendance: [
      {
        participantId: input.participantId,
        ...(input.attendanceStatus ? { attendanceStatus: input.attendanceStatus } : {}),
        authorizedActions: { canRecordPresent: false, canRecordAbsent: false },
      },
    ],
  };
}

function relationship(participantId: string): ParticipantAccessCabinetItem {
  return {
    participantId,
    instructorId: 'instructor_a',
    participantDisplayName: 'Participant',
    instructorDisplayName: 'Instructor A',
    relationshipStatus: 'active',
    relationshipValidFrom: timestampFromDate(new Date(now - 60_000)),
    relationshipExpiresAt: timestampFromDate(new Date(now + 60_000)),
    authorizedActions: {} as ParticipantAccessCabinetItem['authorizedActions'],
  };
}

describe('instructor progress participant selection', () => {
  it('skips booking participants without qualifying present Attendance', () => {
    const bookings = [
      booking({ participantId: 'future', startsAtEpochMs: now + 60_000 }),
      booking({ participantId: 'missing' }),
      booking({ participantId: 'absent', attendanceStatus: 'absent' }),
      booking({ participantId: 'no_show', status: 'no_show', attendanceStatus: 'present' }),
    ];
    expect(instructorProgressParticipantIds(bookings, new Map(), 'instructor_a', now)).toEqual([]);
  });

  it('selects a present attendee once across bookings', () => {
    const bookings = [
      booking({ participantId: 'present', attendanceStatus: 'present' }),
      booking({ participantId: 'present', status: 'completed', attendanceStatus: 'present' }),
    ];
    expect(instructorProgressParticipantIds(bookings, new Map(), 'instructor_a', now)).toEqual([
      'present',
    ]);
  });

  it('ignores a booking assigned to a different instructor', () => {
    const otherInstructorBooking = {
      ...booking({ participantId: 'other', attendanceStatus: 'present' }),
      instructorId: 'instructor_b',
    };
    expect(
      instructorProgressParticipantIds([otherInstructorBooking], new Map(), 'instructor_a', now)
    ).toEqual([]);
  });

  it('includes an active unblocked relationship already loaded for this instructor', () => {
    const access = new Map<string, ParticipantAccessCabinetItem>([
      ['active', relationship('active')],
      ['other-instructor', { ...relationship('other'), instructorId: 'instructor_b' }],
      ['blocked', { ...relationship('blocked'), managerBlockStatus: 'active' }],
      ['revoked', { ...relationship('revoked'), relationshipStatus: 'revoked' }],
      [
        'expired',
        {
          ...relationship('expired'),
          relationshipExpiresAt: timestampFromDate(new Date(now)),
        },
      ],
      [
        'future',
        {
          ...relationship('future'),
          relationshipValidFrom: timestampFromDate(new Date(now + 60_000)),
        },
      ],
    ]);
    expect(instructorProgressParticipantIds([], access, 'instructor_a', now)).toEqual(['active']);
  });
});
