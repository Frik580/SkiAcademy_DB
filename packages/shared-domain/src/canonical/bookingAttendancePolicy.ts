import {
  ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
  type AdminIssue,
  type AdminIssueDedupeIdentityInput,
  type Attendance,
  type AttendanceStatus,
} from './courseEnrollmentAttendanceAdminIssue';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { BookingId, InstructorId, OccurrenceId, ParticipantId } from './identifiers';
import { addMillisecondsToCanonicalTimestamp } from './guestBooking';
import {
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';

export const BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type InstructorAttendanceWindowDecision =
  | 'before_start'
  | 'in_window'
  | 'after_instructor_window';

export type BookingOutcomeEligibilityDecision = 'not_yet_eligible' | 'eligible';

export type BookingAttendanceTargetDecision =
  | { readonly outcome: 'ready'; readonly participantIds: readonly ParticipantId[] }
  | { readonly outcome: 'service_party_not_frozen' }
  | { readonly outcome: 'participant_not_in_target'; readonly participantId: ParticipantId };

export type IndividualBookingAttendanceOutcome =
  | 'completed'
  | 'no_show'
  | 'missing_attendance';

export type GroupBookingAttendanceOutcome =
  | 'completed'
  | 'no_show'
  | 'missing_attendance';

export type BookingOutcomeCalculatorDecision =
  | { readonly outcome: 'not_yet_eligible' }
  | { readonly outcome: 'blocked_pending_cancellation' }
  | { readonly outcome: 'blocked_terminal_lifecycle' }
  | { readonly outcome: 'blocked_outcome_issue'; readonly issueKind: AdminIssue['kind'] }
  | { readonly outcome: 'recorded_with_issue'; readonly issueKind: 'attendance_payment_conflict' }
  | { readonly outcome: 'resolve'; readonly lifecycle: 'completed' | 'no_show' }
  | {
      readonly outcome: 'unresolved';
      readonly issueKind: 'missing_attendance';
      readonly missingParticipantIds: readonly ParticipantId[];
    };

export function bookingInstructorAttendanceWindowEnd(endsAt: CanonicalTimestamp): CanonicalTimestamp {
  return addMillisecondsToCanonicalTimestamp(endsAt, BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS);
}

export function evaluateInstructorAttendanceWindow(input: {
  readonly now: CanonicalTimestamp;
  readonly startsAt: CanonicalTimestamp;
  readonly endsAt: CanonicalTimestamp;
}): InstructorAttendanceWindowDecision {
  if (compareCanonicalTimestamps(input.now, input.startsAt) < 0) {
    return 'before_start';
  }
  const windowEnd = bookingInstructorAttendanceWindowEnd(input.endsAt);
  if (compareCanonicalTimestamps(input.now, windowEnd) <= 0) {
    return 'in_window';
  }
  return 'after_instructor_window';
}

export function evaluateBookingOutcomeEligibility(input: {
  readonly now: CanonicalTimestamp;
  readonly endsAt: CanonicalTimestamp;
}): BookingOutcomeEligibilityDecision {
  return compareCanonicalTimestamps(input.now, input.endsAt) >= 0 ? 'eligible' : 'not_yet_eligible';
}

export function evaluateBookingAutomationEligibility(input: {
  readonly now: CanonicalTimestamp;
  readonly endsAt: CanonicalTimestamp;
}): BookingOutcomeEligibilityDecision {
  const automationEligibleAt = bookingInstructorAttendanceWindowEnd(input.endsAt);
  return compareCanonicalTimestamps(input.now, automationEligibleAt) >= 0
    ? 'eligible'
    : 'not_yet_eligible';
}

export function resolveBookingAttendanceTargets(
  booking: Booking,
  participantId: ParticipantId
): BookingAttendanceTargetDecision {
  const { serviceParty } = booking.occurrence;
  if (!serviceParty.frozenAt) {
    return { outcome: 'service_party_not_frozen' };
  }
  if (!serviceParty.participantIds.includes(participantId)) {
    return { outcome: 'participant_not_in_target', participantId };
  }
  return { outcome: 'ready', participantIds: serviceParty.participantIds };
}

export function deriveIndividualBookingAttendanceOutcome(
  attendance: Attendance | undefined
): IndividualBookingAttendanceOutcome {
  if (!attendance) {
    return 'missing_attendance';
  }
  return attendance.attendanceStatus === 'present' ? 'completed' : 'no_show';
}

export function deriveGroupBookingAttendanceOutcome(input: {
  readonly targetParticipantIds: readonly ParticipantId[];
  readonly attendancesByParticipantId: ReadonlyMap<ParticipantId, Attendance>;
}): {
  readonly outcome: GroupBookingAttendanceOutcome;
  readonly missingParticipantIds: readonly ParticipantId[];
} {
  let presentCount = 0;
  let absentCount = 0;
  const missingParticipantIds: ParticipantId[] = [];

  for (const participantId of input.targetParticipantIds) {
    const attendance = input.attendancesByParticipantId.get(participantId);
    if (!attendance) {
      missingParticipantIds.push(participantId);
      continue;
    }
    if (attendance.attendanceStatus === 'present') {
      presentCount += 1;
    } else {
      absentCount += 1;
    }
  }

  if (presentCount >= 1) {
    return { outcome: 'completed', missingParticipantIds };
  }
  if (absentCount === input.targetParticipantIds.length) {
    return { outcome: 'no_show', missingParticipantIds };
  }
  return { outcome: 'missing_attendance', missingParticipantIds };
}

export function missingBookingAttendanceIssueIdentity(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
  readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'missing_attendance',
    subjectKind: 'booking',
    subjectId: input.bookingId,
    occurrenceId: input.occurrenceId,
    participantId: input.participantId,
  };
}

export function attendancePaymentConflictIdentity(input: {
  readonly bookingId: BookingId;
  readonly occurrenceId: OccurrenceId;
  readonly participantId: ParticipantId;
}): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: 'attendance_payment_conflict',
    subjectKind: 'booking',
    subjectId: input.bookingId,
    occurrenceId: input.occurrenceId,
    participantId: input.participantId,
  };
}

export function hasOpenOutcomeBlockingAdminIssue(issues: readonly AdminIssue[]): AdminIssue | undefined {
  return issues.find(
    (issue) =>
      issue.lifecycle.status === 'open' &&
      issue.blocksOutcome &&
      (issue.kind === 'payment_required_at_start' ||
        issue.kind === 'unresolved_pending_cancellation' ||
        issue.kind === 'attendance_payment_conflict' ||
        issue.kind === 'outcome_correction_required')
  );
}

export function shouldCreateAttendancePaymentConflict(input: {
  readonly attendanceStatus: AttendanceStatus;
  readonly openPaymentRequiredAtStart: boolean;
}): boolean {
  return input.attendanceStatus === 'present' && input.openPaymentRequiredAtStart;
}

export function evaluateBookingOutcomeCalculator(input: {
  readonly now: CanonicalTimestamp;
  readonly booking: Booking;
  readonly attendancesByParticipantId: ReadonlyMap<ParticipantId, Attendance>;
  readonly openAdminIssues: readonly AdminIssue[];
  readonly automationOnly: boolean;
  readonly justRecordedPresentWithPaymentConflict?: boolean;
}): BookingOutcomeCalculatorDecision {
  const { booking } = input;
  const status = booking.lifecycle.status;

  if (status === 'cancelled' || status === 'completed' || status === 'no_show') {
    return { outcome: 'blocked_terminal_lifecycle' };
  }

  if (status === 'pending_cancellation') {
    return { outcome: 'blocked_pending_cancellation' };
  }

  if (status !== 'confirmed') {
    return { outcome: 'blocked_terminal_lifecycle' };
  }

  const eligibility = input.automationOnly
    ? evaluateBookingAutomationEligibility({
        now: input.now,
        endsAt: booking.occurrence.interval.endsAt,
      })
    : evaluateBookingOutcomeEligibility({
        now: input.now,
        endsAt: booking.occurrence.interval.endsAt,
      });

  if (eligibility === 'not_yet_eligible') {
    return { outcome: 'not_yet_eligible' };
  }

  if (input.justRecordedPresentWithPaymentConflict) {
    return { outcome: 'recorded_with_issue', issueKind: 'attendance_payment_conflict' };
  }

  const blockingIssue = hasOpenOutcomeBlockingAdminIssue(input.openAdminIssues);
  if (blockingIssue) {
    return { outcome: 'blocked_outcome_issue', issueKind: blockingIssue.kind };
  }

  if (!booking.occurrence.serviceParty.frozenAt) {
    return {
      outcome: 'unresolved',
      issueKind: 'missing_attendance',
      missingParticipantIds: booking.occurrence.serviceParty.participantIds,
    };
  }

  const targetParticipantIds = booking.occurrence.serviceParty.participantIds;
  const sufficiency =
    booking.party.kind === 'individual'
      ? {
          outcome: deriveIndividualBookingAttendanceOutcome(
            input.attendancesByParticipantId.get(targetParticipantIds[0]!)
          ),
          missingParticipantIds: input.attendancesByParticipantId.has(targetParticipantIds[0]!)
            ? []
            : [targetParticipantIds[0]!],
        }
      : deriveGroupBookingAttendanceOutcome({
          targetParticipantIds,
          attendancesByParticipantId: input.attendancesByParticipantId,
        });

  if (sufficiency.outcome === 'completed') {
    return { outcome: 'resolve', lifecycle: 'completed' };
  }
  if (sufficiency.outcome === 'no_show') {
    return { outcome: 'resolve', lifecycle: 'no_show' };
  }

  return {
    outcome: 'unresolved',
    issueKind: 'missing_attendance',
    missingParticipantIds: sufficiency.missingParticipantIds,
  };
}

export function instructorMayCorrectAttendance(input: {
  readonly existing: Attendance;
  readonly instructorId: InstructorId;
}): boolean {
  return (
    input.existing.recordedBy.kind === 'instructor' &&
    input.existing.recordedBy.instructorId === input.instructorId
  );
}
