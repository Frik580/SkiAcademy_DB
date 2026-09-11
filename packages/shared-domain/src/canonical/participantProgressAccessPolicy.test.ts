import { describe, expect, it } from 'vitest';
import { canonicalBookingCollaborationFixtures } from '../testing/bookingOccurrenceProposalChange';
import { bookingScopedEvidenceFromQualifyingBooking } from './bookingProposalPolicy';
import {
  bookingProvidesInstructorProgressEvidence,
  bookingScopedEvidenceFromQualifyingProgressBooking,
} from './participantProgressAccessPolicy';
import { timestampFromDate } from './primitives';

const individual = canonicalBookingCollaborationFixtures.individualBooking;
const family = canonicalBookingCollaborationFixtures.familyGroupBooking;
const instructorId = individual.occurrence.instructorId;
const participantId = individual.party.participantIds[0]!;
const siblingId = family.party.participantIds[1]!;
const startsAt = individual.occurrence.interval.startsAt;
const beforeStart = timestampFromDate(new Date('2026-01-15T03:59:59.000Z'));
const duringLesson = timestampFromDate(new Date('2026-01-15T04:30:00.000Z'));

function evidence(input: {
  booking: typeof individual;
  participantId?: string;
  at?: typeof duringLesson;
  attendanceStatus?: 'present' | 'absent';
}) {
  return bookingProvidesInstructorProgressEvidence({
    booking: input.booking,
    instructorId,
    participantId: (input.participantId ?? participantId) as typeof participantId,
    at: input.at ?? duringLesson,
    ...(input.attendanceStatus ? { attendanceStatus: input.attendanceStatus } : {}),
  });
}

describe('instructor progress booking-scoped evidence', () => {
  it('does not treat no_show as progress evidence even when proposal evidence would accept it', () => {
    const noShow = {
      ...individual,
      lifecycle: { status: 'no_show' as const, noShowAt: individual.createdAt },
    };
    expect(
      bookingScopedEvidenceFromQualifyingBooking({
        booking: noShow,
        instructorId,
        participantId,
        at: duringLesson,
      })
    ).toBeDefined();
    expect(evidence({ booking: noShow, attendanceStatus: 'absent' })).toBe(false);
    expect(evidence({ booking: noShow })).toBe(false);
    expect(evidence({ booking: noShow, attendanceStatus: 'present' })).toBe(false);
  });

  it('denies confirmed booking-based evidence before startsAt even with present attendance', () => {
    expect(evidence({ booking: individual, at: beforeStart, attendanceStatus: 'present' })).toBe(
      false
    );
    expect(evidence({ booking: individual, at: startsAt, attendanceStatus: 'present' })).toBe(
      true
    );
  });

  it('requires present attendance for confirmed after startsAt', () => {
    expect(evidence({ booking: individual })).toBe(false);
    expect(evidence({ booking: individual, attendanceStatus: 'absent' })).toBe(false);
    expect(evidence({ booking: individual, attendanceStatus: 'present' })).toBe(true);
  });

  it('requires present attendance on completed bookings', () => {
    const completedFamily = {
      ...family,
      lifecycle: { status: 'completed' as const, completedAt: family.createdAt },
    };
    expect(
      evidence({
        booking: completedFamily,
        participantId,
        attendanceStatus: 'present',
      })
    ).toBe(true);
    expect(
      evidence({
        booking: completedFamily,
        participantId: siblingId,
        attendanceStatus: 'absent',
      })
    ).toBe(false);
    expect(evidence({ booking: completedFamily, participantId: siblingId })).toBe(false);
  });

  it('keeps evidence participant-specific in multi-participant bookings', () => {
    const completedFamily = {
      ...family,
      lifecycle: { status: 'completed' as const, completedAt: family.createdAt },
    };
    expect(
      evidence({
        booking: completedFamily,
        participantId,
        attendanceStatus: 'present',
      })
    ).toBe(true);
    expect(
      evidence({
        booking: completedFamily,
        participantId: siblingId,
        attendanceStatus: 'absent',
      })
    ).toBe(false);
    expect(evidence({ booking: completedFamily, participantId: siblingId })).toBe(false);
    expect(
      evidence({
        booking: completedFamily,
        participantId: siblingId,
        attendanceStatus: 'present',
      })
    ).toBe(true);
  });

  it('requires the Participant to belong to this Booking party, not only the instructor', () => {
    expect(
      bookingScopedEvidenceFromQualifyingProgressBooking({
        booking: family,
        instructorId,
        participantId: 'participant_not_in_party',
        at: duringLesson,
        attendanceStatus: 'present',
      })
    ).toBeUndefined();
  });
});
