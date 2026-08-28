import type { Account, InstructorRelationship, Participant, ParticipantBlock, ParticipantManagement } from './accountParticipantAccess';
import {
  evaluateParticipantManagementAccess,
  isParticipantInstructorPairBlockedForNewService,
  participantBlockActorKey,
  type ParticipantAccessTopology,
} from './accountParticipantAccess';
import type { Booking, BookingChangeRequest, BookingProposal } from './bookingOccurrenceProposalChange';
import {
  evaluateClientCancellationTiming,
  isConfirmedIndividualBooking,
  isPendingCancellationIndividualBooking,
  isTerminalBookingLifecycle,
} from './bookingCancellationPolicy';
import { isBookingProposalExpired, resolveBookingProposalExpiresAt } from './bookingProposalPolicy';
import { isBookingProposalAcceptanceAllowedBeforeStart } from './bookingProposalPolicy';
import {
  evaluateClientSelfServiceRescheduleTiming,
  isClientSelfServiceRescheduleAllowanceAvailable,
  isRescheduleEligibleBooking,
} from './bookingReschedulePolicy';
import type { AccountId, InstructorId, ParticipantId, ParticipantManagementId } from './identifiers';
import type { CanonicalTimestamp } from './primitives';
import type {
  BookingChangeRequestReadModelAuthorizedActions,
  BookingProposalReadModelAuthorizedActions,
  CourseAttendanceReadModelAuthorizedActions,
  CourseEnrollmentReadModelAuthorizedActions,
  InstructorCourseEnrollmentRosterAuthorizedActions,
  LessonBookingReadModelAuthorizedActions,
  ParticipantInstructorAccessReadModelAuthorizedActions,
} from './readModels/readModelAuthorizedActions';
import {
  evaluateClientCourseCancellationTiming,
  isConfirmedOrPendingCourseEnrollment,
  isCourseCapacityFrozen,
  isPendingCancellationCourseEnrollment,
  isTerminalCourseEnrollmentLifecycle,
} from './courseEnrollmentCancellationPolicy';
import { isCourseEnrollmentAllowedBeforeStart } from './courseEnrollmentCreation';
import type { Attendance, Course, CourseDay, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import {
  assertCourseDayInstructorAttendanceWindow,
  courseDayAttendanceMatchesCurrentOccurrence,
  instructorAssignedToCourseDay,
  instructorMayCorrectAttendance,
} from './courseEnrollmentAttendancePolicy';
import { participantBlockIdFromDirection } from './deterministicIdentity';

export type ReadModelAccountManagerActor = Readonly<{
  readonly kind: 'account_manager';
  readonly accountId: AccountId;
  readonly participantManagementId: ParticipantManagementId;
  readonly authority: 'self' | 'parent_guardian';
}>;

export type ReadModelInstructorActor = Readonly<{
  readonly kind: 'instructor';
  readonly accountId: AccountId;
  readonly instructorId: InstructorId;
}>;

export type ReadModelActor = ReadModelAccountManagerActor | ReadModelInstructorActor;

function accountManagerAccessAllowed(
  topology: ParticipantAccessTopology,
  actor: ReadModelAccountManagerActor,
  participantId: ParticipantId
): boolean {
  const decision = evaluateParticipantManagementAccess(topology, {
    accountId: actor.accountId,
    participantId,
  });
  return decision.allowed && decision.authority === actor.authority;
}

function accountIsActive(account: Account | undefined): boolean {
  return account !== undefined && account.lifecycle.status === 'active';
}

function participantBlockCreatorMatchesAccountManager(
  block: ParticipantBlock,
  actor: ReadModelAccountManagerActor
): boolean {
  if (block.createdBy.kind !== 'participant_manager') {
    return false;
  }
  return (
    block.createdBy.accountId === actor.accountId &&
    block.createdBy.participantManagementId === actor.participantManagementId &&
    participantBlockActorKey(block.createdBy) ===
      participantBlockActorKey({
        kind: 'participant_manager',
        accountId: actor.accountId,
        participantManagementId: actor.participantManagementId,
      })
  );
}

function participantBlockCreatorMatchesInstructor(
  block: ParticipantBlock,
  actor: ReadModelInstructorActor
): boolean {
  if (block.createdBy.kind !== 'instructor') {
    return false;
  }
  return block.createdBy.instructorId === actor.instructorId;
}

export function evaluateLessonBookingAuthorizedActions(input: Readonly<{
  actor: ReadModelAccountManagerActor;
  account: Account | undefined;
  participant: Participant | undefined;
  management: ParticipantManagement | undefined;
  booking: Booking;
  topology: ParticipantAccessTopology;
  now: CanonicalTimestamp;
}>): LessonBookingReadModelAuthorizedActions {
  const denied = {
    canRequestCancellation: false,
    canWithdrawCancellation: false,
    canReschedule: false,
  };

  if (
    !accountIsActive(input.account) ||
    !input.participant ||
    input.participant.lifecycle.status !== 'active' ||
    !input.management ||
    input.management.status !== 'active'
  ) {
    return denied;
  }

  if (!accountManagerAccessAllowed(input.topology, input.actor, input.participant.participantId)) {
    return denied;
  }

  const timing = evaluateClientCancellationTiming({
    requestAt: input.now,
    startAt: input.booking.occurrence.interval.startsAt,
  });

  const canRequestCancellation =
    isConfirmedIndividualBooking(input.booking) &&
    !isTerminalBookingLifecycle(input.booking) &&
    timing !== 'after_start_rejected';

  const canWithdrawCancellation = isPendingCancellationIndividualBooking(input.booking);

  const rescheduleTiming = evaluateClientSelfServiceRescheduleTiming({
    requestAt: input.now,
    startAt: input.booking.occurrence.interval.startsAt,
  });

  const canReschedule =
    isRescheduleEligibleBooking(input.booking) &&
    isClientSelfServiceRescheduleAllowanceAvailable(input.booking) &&
    rescheduleTiming === 'allowed' &&
    !isParticipantInstructorPairBlockedForNewService(input.topology, {
      participantId: input.participant.participantId,
      instructorId: input.booking.occurrence.instructorId,
    });

  return {
    canRequestCancellation,
    canWithdrawCancellation,
    canReschedule,
  };
}

export function evaluateBookingProposalAuthorizedActions(input: Readonly<{
  actor: ReadModelActor;
  proposal: BookingProposal;
  account?: Account;
  participant?: Participant;
  management?: ParticipantManagement;
  topology?: ParticipantAccessTopology;
  now: CanonicalTimestamp;
}>): BookingProposalReadModelAuthorizedActions {
  const denied = { canAccept: false, canDecline: false, canWithdraw: false };

  if (input.proposal.lifecycle.status !== 'open') {
    return denied;
  }

  if (input.actor.kind === 'instructor') {
    return {
      canAccept: false,
      canDecline: false,
      canWithdraw: input.proposal.instructorId === input.actor.instructorId,
    };
  }

  if (
    !accountIsActive(input.account) ||
    !input.participant ||
    input.participant.lifecycle.status !== 'active' ||
    !input.management ||
    !input.topology ||
    input.proposal.participantId !== input.participant.participantId
  ) {
    return denied;
  }

  if (!accountManagerAccessAllowed(input.topology, input.actor, input.proposal.participantId)) {
    return denied;
  }

  const expiresAt = resolveBookingProposalExpiresAt({
    createdAt: input.proposal.createdAt,
    serviceStartsAt: input.proposal.proposedService.interval.startsAt,
  });
  const expired = isBookingProposalExpired({ now: input.now, expiresAt });
  const acceptanceWindowOpen = isBookingProposalAcceptanceAllowedBeforeStart({
    now: input.now,
    serviceStartsAt: input.proposal.proposedService.interval.startsAt,
  });
  const blocked = isParticipantInstructorPairBlockedForNewService(input.topology, {
    participantId: input.proposal.participantId,
    instructorId: input.proposal.instructorId,
  });

  const canAccept = !expired && acceptanceWindowOpen && !blocked;
  const canDecline = true;

  return {
    canAccept,
    canDecline,
    canWithdraw: false,
  };
}

export function evaluateBookingChangeRequestAuthorizedActions(input: Readonly<{
  actor: ReadModelActor;
  changeRequest: BookingChangeRequest;
  booking: Booking;
}>): BookingChangeRequestReadModelAuthorizedActions {
  if (input.changeRequest.lifecycle.status !== 'open') {
    return { canWithdraw: false };
  }

  if (input.actor.kind !== 'instructor') {
    return { canWithdraw: false };
  }

  return {
    canWithdraw:
      input.booking.occurrence.instructorId === input.actor.instructorId &&
      input.changeRequest.bookingId === input.booking.bookingId,
  };
}

export function evaluateParticipantInstructorAccessAuthorizedActions(input: Readonly<{
  actor: ReadModelActor;
  account?: Account;
  participant: Participant;
  management?: ParticipantManagement;
  relationship?: InstructorRelationship;
  managerBlock?: ParticipantBlock;
  instructorBlock?: ParticipantBlock;
  instructorId: InstructorId;
  now: CanonicalTimestamp;
}>): ParticipantInstructorAccessReadModelAuthorizedActions {
  const denied = {
    canCreateRelationship: false,
    canRevokeRelationship: false,
    canBlock: false,
    canUnblock: false,
  };

  if (input.participant.lifecycle.status !== 'active') {
    return denied;
  }

  if (input.actor.kind === 'instructor') {
    if (input.actor.instructorId !== input.instructorId) {
      return denied;
    }

    const activeInstructorBlock =
      input.instructorBlock?.status === 'active' &&
      input.instructorBlock.instructorId === input.instructorId;

    return {
      canCreateRelationship: false,
      canRevokeRelationship: false,
      canBlock: !activeInstructorBlock,
      canUnblock:
        activeInstructorBlock &&
        participantBlockCreatorMatchesInstructor(input.instructorBlock!, input.actor),
    };
  }

  if (
    !accountIsActive(input.account) ||
    !input.management ||
    input.management.status !== 'active' ||
    input.participant.management.kind !== 'managed'
  ) {
    return denied;
  }

  const topology: ParticipantAccessTopology = {
    accounts: input.account ? [input.account] : [],
    participants: [input.participant],
    participantManagement: [input.management],
    activeOwnerGuards: [],
    instructorRelationships: input.relationship ? [input.relationship] : [],
    participantBlocks: [
      ...(input.managerBlock ? [input.managerBlock] : []),
      ...(input.instructorBlock ? [input.instructorBlock] : []),
    ],
  };

  if (
    !accountManagerAccessAllowed(topology, input.actor, input.participant.participantId)
  ) {
    return denied;
  }

  const activeRelationship = input.relationship?.status === 'active';
  const guardianRelationship =
    activeRelationship && input.relationship!.basis.kind === 'guardian_permission';
  const grantedByActor =
    guardianRelationship &&
    input.relationship!.basis.kind === 'guardian_permission' &&
    (input.relationship!.basis.grantedByAccountId === input.actor.accountId ||
      input.relationship!.basis.participantManagementId === input.actor.participantManagementId);

  const activeManagerBlock =
    input.managerBlock?.status === 'active' &&
    input.managerBlock.participantId === input.participant.participantId &&
    input.managerBlock.instructorId === input.instructorId;

  const expectedManagerBlockId = participantBlockIdFromDirection({
    participantId: input.participant.participantId,
    instructorId: input.instructorId,
    createdByKind: 'participant_manager',
  });

  return {
    canCreateRelationship: !activeRelationship,
    canRevokeRelationship: Boolean(grantedByActor),
    canBlock: !activeManagerBlock,
    canUnblock:
      activeManagerBlock &&
      input.managerBlock!.participantBlockId === expectedManagerBlockId &&
      participantBlockCreatorMatchesAccountManager(input.managerBlock!, input.actor),
  };
}

export function sanitizeParticipantBlockReasonForReadModel(input: Readonly<{
  actor: ReadModelActor;
  block: ParticipantBlock | undefined;
}>): string | undefined {
  if (!input.block || input.block.status !== 'active') {
    return undefined;
  }

  if (input.actor.kind === 'instructor') {
    if (!participantBlockCreatorMatchesInstructor(input.block, input.actor)) {
      return undefined;
    }
    return input.block.reason;
  }

  if (!participantBlockCreatorMatchesAccountManager(input.block, input.actor)) {
    return undefined;
  }
  return input.block.reason;
}

export function evaluateCourseEnrollmentAuthorizedActions(input: Readonly<{
  actor: ReadModelAccountManagerActor;
  account: Account | undefined;
  participant: Participant | undefined;
  management: ParticipantManagement | undefined;
  enrollment: CourseEnrollment;
  course: Course;
  topology: ParticipantAccessTopology;
  now: CanonicalTimestamp;
}>): CourseEnrollmentReadModelAuthorizedActions {
  const denied = { canWithdraw: false, canRequestCancellation: false };

  if (
    !accountIsActive(input.account) ||
    !input.participant ||
    input.participant.lifecycle.status !== 'active' ||
    !input.management ||
    input.management.status !== 'active'
  ) {
    return denied;
  }

  if (!accountManagerAccessAllowed(input.topology, input.actor, input.participant.participantId)) {
    return denied;
  }

  if (isTerminalCourseEnrollmentLifecycle(input.enrollment)) {
    return denied;
  }

  const canWithdraw = isPendingCancellationCourseEnrollment(input.enrollment);

  const timing = evaluateClientCourseCancellationTiming({
    requestAt: input.now,
    startAt: input.course.startAt,
  });

  const canRequestCancellation =
    isConfirmedOrPendingCourseEnrollment(input.enrollment) &&
    !isTerminalCourseEnrollmentLifecycle(input.enrollment) &&
    timing.kind !== 'pending_request' &&
    input.enrollment.lifecycle.status !== 'pending_cancellation';

  return {
    canWithdraw,
    canRequestCancellation,
  };
}

export function evaluateInstructorCourseEnrollmentRosterAuthorizedActions(input: Readonly<{
  instructorId: InstructorId;
  course: Course;
  courseDays: readonly CourseDay[];
}>): InstructorCourseEnrollmentRosterAuthorizedActions {
  const assignedToAnyDay = input.courseDays.some((courseDay) =>
    instructorAssignedToCourseDay(courseDay, input.instructorId)
  );
  const onRoster = input.course.instructorRosterIds.includes(input.instructorId);
  return {
    canRecordAttendance: assignedToAnyDay || onRoster,
  };
}

export function evaluateCourseAttendanceAuthorizedActions(input: Readonly<{
  actor: ReadModelInstructorActor;
  enrollment: CourseEnrollment;
  courseDay: CourseDay;
  existingAttendance: Attendance | undefined;
  now: CanonicalTimestamp;
}>): CourseAttendanceReadModelAuthorizedActions {
  const denied = { canRecordAttendance: false };

  if (!instructorAssignedToCourseDay(input.courseDay, input.actor.instructorId)) {
    return denied;
  }

  if (isTerminalCourseEnrollmentLifecycle(input.enrollment)) {
    if (
      input.existingAttendance &&
      !instructorMayCorrectAttendance({
        existing: input.existingAttendance,
        instructorId: input.actor.instructorId,
      })
    ) {
      return denied;
    }
    if (!input.existingAttendance) {
      return denied;
    }
  } else if (
    input.enrollment.lifecycle.status !== 'confirmed' &&
    input.enrollment.lifecycle.status !== 'pending_cancellation'
  ) {
    return denied;
  }

  const window = assertCourseDayInstructorAttendanceWindow({
    now: input.now,
    courseDay: input.courseDay,
  });
  if (window === 'before_start' || window === 'after_instructor_window') {
    return denied;
  }

  if (
    input.existingAttendance &&
    !courseDayAttendanceMatchesCurrentOccurrence(input.existingAttendance, input.courseDay) &&
    !instructorMayCorrectAttendance({
      existing: input.existingAttendance,
      instructorId: input.actor.instructorId,
    })
  ) {
    return denied;
  }

  return { canRecordAttendance: true };
}

export function evaluateCourseCatalogEnrollmentEligibility(input: Readonly<{
  now: CanonicalTimestamp;
  course: Course;
}>): boolean {
  if (input.course.capacity.availableSeats <= 0) {
    return false;
  }
  if (
    isCourseCapacityFrozen({
      now: input.now,
      courseStartAt: input.course.startAt,
    })
  ) {
    return false;
  }
  return isCourseEnrollmentAllowedBeforeStart({
    now: input.now,
    courseStartsAt: input.course.startAt,
  });
}
