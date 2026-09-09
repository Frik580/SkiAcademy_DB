import { describe, expect, it } from 'vitest';
import {
  addMillisecondsToCanonicalTimestamp,
  bookingProvidesInstructorProposalEvidence,
  bookingProvidesInstructorProposalEvidenceFromBooking,
  bookingScopedEvidenceFromQualifyingBooking,
  evaluateInstructorParticipantAccess,
  instructorMayCreateBookingProposal,
  instructorMayCreateBookingProposalForParty,
  isBookingProposalAcceptanceAllowedBeforeStart,
  isBookingProposalExpired,
  resolveBookingProposalExpiresAt,
  timestampFromDate,
  BOOKING_PROPOSAL_TTL_MS,
} from '@ski-academy/shared-domain';
import {
  canonicalBookingCollaborationFixtures,
  canonicalParticipantAccessFixtures,
} from '@ski-academy/shared-domain/testing';

const ts = (value: string) => timestampFromDate(new Date(value));
const at = ts('2026-06-01T00:00:00.000Z');

describe('bookingProposalPolicy', () => {
  it('expires at min(createdAt + 24h, startAt)', () => {
    const createdAt = ts('2026-01-01T00:00:00.000Z');
    const startAt = ts('2026-01-02T12:00:00.000Z');
    const expiresAt = resolveBookingProposalExpiresAt({ createdAt, serviceStartsAt: startAt });
    const ttlBoundary = addMillisecondsToCanonicalTimestamp(createdAt, BOOKING_PROPOSAL_TTL_MS);
    expect(expiresAt).toEqual(ttlBoundary);
  });

  it('expires at service start when start is sooner than 24h', () => {
    const createdAt = ts('2026-01-01T00:00:00.000Z');
    const startAt = ts('2026-01-01T06:00:00.000Z');
    expect(resolveBookingProposalExpiresAt({ createdAt, serviceStartsAt: startAt })).toEqual(
      startAt
    );
  });

  it('treats expiry boundary as expired', () => {
    const expiresAt = ts('2026-01-01T12:00:00.000Z');
    expect(isBookingProposalExpired({ now: expiresAt, expiresAt })).toBe(true);
  });

  it('requires acceptance before service start', () => {
    const startAt = ts('2026-01-01T12:00:00.000Z');
    expect(
      isBookingProposalAcceptanceAllowedBeforeStart({
        now: ts('2026-01-01T11:59:59.000Z'),
        serviceStartsAt: startAt,
      })
    ).toBe(true);
    expect(
      isBookingProposalAcceptanceAllowedBeforeStart({
        now: startAt,
        serviceStartsAt: startAt,
      })
    ).toBe(false);
  });
});

describe('instructor proposal booking-scoped evidence', () => {
  const individual = canonicalBookingCollaborationFixtures.individualBooking;
  const family = canonicalBookingCollaborationFixtures.familyGroupBooking;
  const pending = canonicalBookingCollaborationFixtures.guestPendingBooking;
  const instructorId = individual.occurrence.instructorId;
  const participantId = individual.party.participantIds[0]!;

  it('treats confirmed, completed, and no_show Bookings as proposal evidence', () => {
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(individual, {
        instructorId,
        participantId,
      })
    ).toBe(true);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(
        { ...individual, lifecycle: { status: 'completed', completedAt: individual.createdAt } },
        { instructorId, participantId }
      )
    ).toBe(true);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(
        { ...individual, lifecycle: { status: 'no_show', noShowAt: individual.createdAt } },
        { instructorId, participantId }
      )
    ).toBe(true);
  });

  it('rejects pending, cancelled, deleted, and other-instructor Bookings', () => {
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(pending, {
        instructorId,
        participantId,
      })
    ).toBe(false);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(
        {
          ...individual,
          lifecycle: {
            status: 'cancelled',
            cancelledAt: individual.createdAt,
            reasonCode: 'account_owner_cancelled',
          },
        },
        { instructorId, participantId }
      )
    ).toBe(false);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(
        {
          ...individual,
          archival: { isDeleted: true, deletedAt: individual.createdAt },
        },
        { instructorId, participantId }
      )
    ).toBe(false);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(individual, {
        instructorId: 'instructor_other_01',
        participantId,
      })
    ).toBe(false);
  });

  it('allows only participantIds that actually belong to the Booking party', () => {
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(family, {
        instructorId,
        participantId,
      })
    ).toBe(true);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(family, {
        instructorId,
        participantId: family.party.participantIds[1]!,
      })
    ).toBe(true);
    expect(
      bookingProvidesInstructorProposalEvidenceFromBooking(family, {
        instructorId,
        participantId: 'participant_not_in_party',
      })
    ).toBe(false);
  });

  it('builds evidence that evaluateInstructorParticipantAccess accepts at now', () => {
    const matchingTopology = {
      ...canonicalParticipantAccessFixtures.unblockedTopology,
      instructorRelationships: [],
    };
    const participant = matchingTopology.participants[0]!;
    const matchingEvidence = bookingScopedEvidenceFromQualifyingBooking({
      booking: {
        ...individual,
        party: { kind: 'individual', participantIds: [participant.participantId] },
        occurrence: {
          ...individual.occurrence,
          instructorId: 'instructor_access_fixture',
          serviceParty: {
            ...individual.occurrence.serviceParty,
            participantIds: [participant.participantId],
          },
        },
      },
      instructorId: 'instructor_access_fixture',
      participantId: participant.participantId,
      at,
    });
    expect(matchingEvidence).toBeDefined();
    expect(
      evaluateInstructorParticipantAccess(matchingTopology, {
        instructorId: 'instructor_access_fixture',
        participantId: participant.participantId,
        at,
        bookingScopedEvidence: matchingEvidence ? [matchingEvidence] : [],
      })
    ).toMatchObject({ allowed: true, scope: 'booking_scoped' });
  });

  it('lets the instructor propose when a relationship or qualifying booking exists', () => {
    expect(
      instructorMayCreateBookingProposal({
        instructorId,
        participantId,
        relationshipStatus: 'active',
        bookings: [],
      })
    ).toBe(true);
    expect(
      instructorMayCreateBookingProposal({
        instructorId,
        participantId,
        bookings: [
          {
            instructorId,
            participantIds: [participantId],
            lifecycleStatus: 'confirmed',
          },
        ],
      })
    ).toBe(true);
    expect(
      instructorMayCreateBookingProposal({
        instructorId,
        participantId,
        relationshipStatus: 'revoked',
        bookings: [
          {
            instructorId,
            participantIds: [participantId],
            lifecycleStatus: 'pending',
          },
        ],
      })
    ).toBe(false);
    expect(
      bookingProvidesInstructorProposalEvidence({
        instructorId,
        participantId,
        booking: {
          instructorId,
          participantIds: [participantId],
          lifecycleStatus: 'confirmed',
        },
      })
    ).toBe(true);
  });

  it('requires instructor authority on every party member', () => {
    expect(
      instructorMayCreateBookingProposalForParty({
        instructorId,
        participantIds: family.party.participantIds,
        relationshipStatusByParticipantId: new Map(
          family.party.participantIds.map((id) => [id, 'active' as const])
        ),
        bookings: [],
      })
    ).toBe(true);
    expect(
      instructorMayCreateBookingProposalForParty({
        instructorId,
        participantIds: family.party.participantIds,
        relationshipStatusByParticipantId: new Map([
          [family.party.participantIds[0]!, 'active'],
        ]),
        bookings: [
          {
            instructorId,
            participantIds: [family.party.participantIds[0]!],
            lifecycleStatus: 'confirmed',
          },
        ],
      })
    ).toBe(false);
  });
});
