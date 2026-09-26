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
  instructorId?: typeof instructorId;
}) {
  return bookingProvidesInstructorProgressEvidence({
    booking: input.booking,

    instructorId: input.instructorId ?? instructorId,
    participantId: (input.participantId ?? participantId) as typeof participantId,

    at: input.at ?? duringLesson,
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

    expect(evidence({ booking: noShow })).toBe(false);
  });

  it('starts booking authority at the exact canonical startsAt', () => {
    expect(evidence({ booking: individual, at: beforeStart })).toBe(false);
    expect(evidence({ booking: individual, at: startsAt })).toBe(true);
    expect(evidence({ booking: individual, at: duringLesson })).toBe(true);
  });

  it('requires the assigned instructor and valid lifecycle', () => {
    expect(
      evidence({ booking: individual, instructorId: 'instructor_other' as typeof instructorId })
    ).toBe(false);
    const cancelled = {
      ...individual,
      lifecycle: {
        status: 'cancelled' as const,
        cancelledAt: individual.createdAt,
        reasonCode: 'account_owner_cancelled' as const,
      },
    };
    expect(evidence({ booking: cancelled })).toBe(false);
  });

  it('allows a completed lesson long after startsAt without an expiry window', () => {
    const completedFamily = {
      ...family,

      lifecycle: { status: 'completed' as const, completedAt: family.createdAt },
    };

    expect(
      evidence({
        booking: completedFamily,
        participantId: siblingId,
        at: timestampFromDate(new Date('2030-01-01T00:00:00.000Z')),
      })
    ).toBe(true);
  });

  it('keeps evidence participant-specific in multi-participant bookings', () => {
    expect(evidence({ booking: family, participantId: siblingId })).toBe(true);
    expect(evidence({ booking: family, participantId: 'participant_not_in_party' })).toBe(false);
  });

  it('requires the Participant to belong to this Booking party, not only the instructor', () => {
    expect(
      bookingScopedEvidenceFromQualifyingProgressBooking({
        booking: family,

        instructorId,

        participantId: 'participant_not_in_party',

        at: duringLesson,
      })
    ).toBeUndefined();
  });
});
