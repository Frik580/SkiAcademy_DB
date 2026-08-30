import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  CourseDayIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
} from './identifiers';
import { paymentIdFromBookingId, participantBlockIdFromDirection } from './deterministicIdentity';
import { timestampFromDate } from './primitives';
import { BookingChangeRequestIdSchema } from './identifiers';
import {
  evaluateBookingChangeRequestAuthorizedActions,
  evaluateBookingProposalAuthorizedActions,
  evaluateInstructorCourseRosterReadAccess,
  evaluateLessonBookingAuthorizedActions,
  evaluateParticipantInstructorAccessAuthorizedActions,
  isInstructorActiveRosterEnrollment,
  resolveInstructorCourseAssignmentProjection,
  sanitizeParticipantBlockReasonForReadModel,
} from './readModelAuthorization';
import { canonicalParticipantAccessFixtures } from '../testing/accountParticipantAccess';
import { rejectSpoofedParticipantInstructorAccessReadInput } from './readModels/participantInstructorAccessReadModel';

const accountId = AccountIdSchema.parse('account_access_fixture');
const participantId = ParticipantIdSchema.parse('participant_access_fixture');
const instructorId = InstructorIdSchema.parse('instructor_access_fixture');
const managementId = ParticipantManagementIdSchema.parse('management_access_fixture');
const bookingId = BookingIdSchema.parse('booking_auth_policy_01');
const proposalId = BookingProposalIdSchema.parse('booking_proposal_auth_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const serviceStart = timestampFromDate(new Date('2026-06-15T09:00:00.000Z'));
const serviceEnd = timestampFromDate(new Date('2026-06-15T10:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_auth_policy',
    lastChangedByCommandId: 'command_auth_policy',
    correlationId: 'correlation_auth_policy',
  },
};

const accountManagerActor = {
  kind: 'account_manager' as const,
  accountId,
  participantManagementId: managementId,
  authority: 'parent_guardian' as const,
};

const instructorActor = {
  kind: 'instructor' as const,
  accountId: AccountIdSchema.parse('account_instructor_auth'),
  instructorId,
};

function confirmedBooking() {
  return {
    bookingId,
    attribution: {
      bookingOrigin: 'account' as const,
      bookedBy: { kind: 'account' as const, accountId },
    },
    party: { kind: 'individual' as const, participantIds: [participantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_auth_policy_01'),
      instructorId,
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' as const },
    paymentId: paymentIdFromBookingId(bookingId),
    payerAccountId: accountId,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: metadata.audit,
  };
}

function openProposal() {
  return {
    proposalId,
    participantId,
    instructorId,
    proposedService: {
      interval: { startsAt: serviceStart, endsAt: serviceEnd },
      timeZone: 'Asia/Almaty',
    },
    lifecycle: { status: 'open' as const },
    createdAt: decidedAt,
    ...metadata,
  };
}

describe('readModelAuthorization', () => {
  it('computes lesson booking cancellation and reschedule actions for authorized account managers', () => {
    const actions = evaluateLessonBookingAuthorizedActions({
      actor: accountManagerActor,
      account: canonicalParticipantAccessFixtures.account,
      participant: canonicalParticipantAccessFixtures.participant,
      management: canonicalParticipantAccessFixtures.management,
      booking: confirmedBooking(),
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      now: decidedAt,
    });

    expect(actions.canRequestCancellation).toBe(true);
    expect(actions.canWithdrawCancellation).toBe(false);
    expect(actions.canReschedule).toBe(true);
  });

  it('denies lesson booking actions when participant-instructor pair is blocked', () => {
    const actions = evaluateLessonBookingAuthorizedActions({
      actor: accountManagerActor,
      account: canonicalParticipantAccessFixtures.account,
      participant: canonicalParticipantAccessFixtures.participant,
      management: canonicalParticipantAccessFixtures.management,
      booking: confirmedBooking(),
      topology: canonicalParticipantAccessFixtures.blockedTopology,
      now: decidedAt,
    });

    expect(actions.canReschedule).toBe(false);
  });

  it('allows cancellation withdrawal only for pending cancellation bookings', () => {
    const pendingCancellation = {
      ...confirmedBooking(),
      lifecycle: { status: 'pending_cancellation' as const, requestedAt: decidedAt },
    };
    const actions = evaluateLessonBookingAuthorizedActions({
      actor: accountManagerActor,
      account: canonicalParticipantAccessFixtures.account,
      participant: canonicalParticipantAccessFixtures.participant,
      management: canonicalParticipantAccessFixtures.management,
      booking: pendingCancellation,
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      now: decidedAt,
    });

    expect(actions.canWithdrawCancellation).toBe(true);
    expect(actions.canRequestCancellation).toBe(false);
  });

  it('represents proposal accept/decline for account and withdraw for instructor', () => {
    const accountActions = evaluateBookingProposalAuthorizedActions({
      actor: accountManagerActor,
      proposal: openProposal(),
      account: canonicalParticipantAccessFixtures.account,
      participant: canonicalParticipantAccessFixtures.participant,
      management: canonicalParticipantAccessFixtures.management,
      topology: canonicalParticipantAccessFixtures.unblockedTopology,
      now: decidedAt,
    });
    expect(accountActions.canAccept).toBe(true);
    expect(accountActions.canDecline).toBe(true);
    expect(accountActions.canWithdraw).toBe(false);

    const instructorActions = evaluateBookingProposalAuthorizedActions({
      actor: instructorActor,
      proposal: openProposal(),
      now: decidedAt,
    });
    expect(instructorActions.canAccept).toBe(false);
    expect(instructorActions.canDecline).toBe(false);
    expect(instructorActions.canWithdraw).toBe(true);
  });

  it('allows change request withdraw only for the booking instructor', () => {
    const changeRequest = {
      requestId: BookingChangeRequestIdSchema.parse('booking_change_request_auth_01'),
      bookingId,
      requestType: 'instructor_unavailable' as const,
      reason: 'Need substitute',
      lifecycle: { status: 'open' as const },
      ...metadata,
    };

    const instructorActions = evaluateBookingChangeRequestAuthorizedActions({
      actor: instructorActor,
      changeRequest,
      booking: confirmedBooking(),
    });
    expect(instructorActions.canWithdraw).toBe(true);

    const otherInstructorActions = evaluateBookingChangeRequestAuthorizedActions({
      actor: {
        ...instructorActor,
        instructorId: InstructorIdSchema.parse('instructor_other_auth'),
      },
      changeRequest,
      booking: confirmedBooking(),
    });
    expect(otherInstructorActions.canWithdraw).toBe(false);
  });

  it('keeps relationship and block authorization independent with creator-only unblock', () => {
    const managerBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'participant_manager',
    });
    const managerBlock = {
      ...canonicalParticipantAccessFixtures.participantBlock,
      participantBlockId: managerBlockId,
      createdBy: {
        kind: 'participant_manager' as const,
        accountId,
        participantManagementId: managementId,
      },
    };

    const accountActions = evaluateParticipantInstructorAccessAuthorizedActions({
      actor: accountManagerActor,
      account: canonicalParticipantAccessFixtures.account,
      participant: canonicalParticipantAccessFixtures.participant,
      management: canonicalParticipantAccessFixtures.management,
      relationship: canonicalParticipantAccessFixtures.instructorRelationship,
      managerBlock,
      instructorId,
      now: decidedAt,
    });
    expect(accountActions.canRevokeRelationship).toBe(true);
    expect(accountActions.canBlock).toBe(false);
    expect(accountActions.canUnblock).toBe(true);

    const instructorBlockId = participantBlockIdFromDirection({
      participantId,
      instructorId,
      createdByKind: 'instructor',
    });
    const instructorBlock = {
      participantBlockId: instructorBlockId,
      participantId,
      instructorId,
      createdBy: { kind: 'instructor' as const, instructorId },
      reason: 'Instructor block reason',
      status: 'active' as const,
      ...metadata,
    };

    const instructorActions = evaluateParticipantInstructorAccessAuthorizedActions({
      actor: instructorActor,
      participant: canonicalParticipantAccessFixtures.participant,
      instructorBlock,
      instructorId,
      now: decidedAt,
    });
    expect(instructorActions.canCreateRelationship).toBe(false);
    expect(instructorActions.canBlock).toBe(false);
    expect(instructorActions.canUnblock).toBe(true);

    const otherInstructorActions = evaluateParticipantInstructorAccessAuthorizedActions({
      actor: {
        ...instructorActor,
        instructorId: InstructorIdSchema.parse('instructor_other_auth'),
      },
      participant: canonicalParticipantAccessFixtures.participant,
      instructorBlock,
      instructorId,
      now: decidedAt,
    });
    expect(otherInstructorActions.canUnblock).toBe(false);
  });

  it('sanitizes block reasons to the block creator', () => {
    const managerBlock = canonicalParticipantAccessFixtures.participantBlock;
    expect(
      sanitizeParticipantBlockReasonForReadModel({
        actor: accountManagerActor,
        block: managerBlock,
      })
    ).toBe(managerBlock.reason);
    expect(
      sanitizeParticipantBlockReasonForReadModel({
        actor: instructorActor,
        block: managerBlock,
      })
    ).toBeUndefined();
  });

  it('fails closed on spoofed participant instructor access read input keys', () => {
    expect(() =>
      rejectSpoofedParticipantInstructorAccessReadInput({ scope: 'account_manager', accountId })
    ).toThrow(/accountId/);
  });

  it('allows instructor roster read when instructor is on course roster', () => {
    const access = evaluateInstructorCourseRosterReadAccess({
      instructorId,
      course: {
        instructorRosterIds: [instructorId],
      } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['course'],
      courseDays: [
        {
          actualInstructorIds: [InstructorIdSchema.parse('instructor_other_auth')],
        } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['courseDays'][number],
      ],
    });
    expect(access.allowed).toBe(true);
  });

  it('allows instructor roster read when instructor is assigned to a course day only', () => {
    const access = evaluateInstructorCourseRosterReadAccess({
      instructorId,
      course: {
        instructorRosterIds: [InstructorIdSchema.parse('instructor_other_auth')],
      } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['course'],
      courseDays: [
        {
          actualInstructorIds: [instructorId],
        } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['courseDays'][number],
      ],
    });
    expect(access.allowed).toBe(true);
  });

  it('resolves assigned course day ids for roster and course-day-only instructors', () => {
    const courseDayId = CourseDayIdSchema.parse('course_day_assignment_auth_01');
    const otherCourseDayId = CourseDayIdSchema.parse('course_day_assignment_auth_02');
    const courseDays = [
      {
        courseDayId,
        actualInstructorIds: [instructorId],
      },
      {
        courseDayId: otherCourseDayId,
        actualInstructorIds: [InstructorIdSchema.parse('instructor_other_auth')],
      },
    ] as Parameters<typeof resolveInstructorCourseAssignmentProjection>[0]['courseDays'];

    expect(
      resolveInstructorCourseAssignmentProjection({
        instructorId,
        course: {
          instructorRosterIds: [instructorId],
        } as Parameters<typeof resolveInstructorCourseAssignmentProjection>[0]['course'],
        courseDays,
      })
    ).toEqual({
      allowed: true,
      assignedCourseDayIds: [courseDayId, otherCourseDayId],
    });

    expect(
      resolveInstructorCourseAssignmentProjection({
        instructorId,
        course: {
          instructorRosterIds: [InstructorIdSchema.parse('instructor_other_auth')],
        } as Parameters<typeof resolveInstructorCourseAssignmentProjection>[0]['course'],
        courseDays,
      })
    ).toEqual({
      allowed: true,
      assignedCourseDayIds: [courseDayId],
    });
  });

  it('denies instructor roster read for unrelated instructors', () => {
    const access = evaluateInstructorCourseRosterReadAccess({
      instructorId,
      course: {
        instructorRosterIds: [InstructorIdSchema.parse('instructor_other_auth')],
      } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['course'],
      courseDays: [
        {
          actualInstructorIds: [InstructorIdSchema.parse('instructor_third_auth')],
        } as Parameters<typeof evaluateInstructorCourseRosterReadAccess>[0]['courseDays'][number],
      ],
    });
    expect(access.allowed).toBe(false);
  });

  it('treats confirmed and pending_cancellation enrollments as active roster participants', () => {
    expect(
      isInstructorActiveRosterEnrollment({
        lifecycle: { status: 'confirmed' },
      })
    ).toBe(true);
    expect(
      isInstructorActiveRosterEnrollment({
        lifecycle: { status: 'pending_cancellation', requestedAt: decidedAt },
      })
    ).toBe(true);
    expect(
      isInstructorActiveRosterEnrollment({
        lifecycle: { status: 'cancelled', cancelledAt: decidedAt, reasonCode: 'administrator_cancelled' },
      })
    ).toBe(false);
    expect(
      isInstructorActiveRosterEnrollment({
        lifecycle: { status: 'pending', reservationExpiresAt: decidedAt },
      })
    ).toBe(false);
  });
});
