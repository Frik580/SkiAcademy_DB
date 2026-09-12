import {
  attendanceIsOverdue,
  bookingInstructorAttendanceWindowEnd,
  legacyParticipantMissingBookingAttendanceIssueIdentity,
  missingAttendanceParticipantIds,
  missingBookingAttendanceIssueIdentity,
  resolveAdminIssueForCoupledAttendanceRecord,
  type AdminIssue,
  type Attendance,
  type Booking,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
} from '../adminIssues';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE,
  completeBookingAttendanceOutcomeWork,
  pendingBookingAttendanceOutcomeWork,
  type BookingAttendanceOutcomeWork,
  type PendingBookingAttendanceOutcomeWork,
} from './bookingAttendanceOutcomeWork';

export type PlannedBookingAttendanceIssue = {
  readonly issue: AdminIssue;
  readonly mutationKind: 'create' | 'update';
  readonly documentPath: string;
};

interface CommandMetadata {
  readonly commandId: string;
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

async function readAdminIssue(
  session: CanonicalAtomicTransactionSession,
  correlationId: CommandMetadata['correlationId'],
  identity: Parameters<typeof plannedAdminIssuePath>[0]
): Promise<AdminIssue | undefined> {
  const documentPath = plannedAdminIssuePath(identity);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseExistingAdminIssueOrCollision(correlationId, read.exists ? read.data : undefined);
}

export function bookingMissingAttendanceIssueIdentity(booking: Booking) {
  return missingBookingAttendanceIssueIdentity({
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
  });
}

export async function planOpenBookingMissingAttendanceIssue(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly booking: Booking;
    readonly now: CanonicalTimestamp;
    readonly metadata: CommandMetadata;
  }
): Promise<PlannedBookingAttendanceIssue> {
  const identity = bookingMissingAttendanceIssueIdentity(input.booking);
  const documentPath = plannedAdminIssuePath(identity);
  const existing = await readAdminIssue(session, input.metadata.correlationId, identity);
  const opened =
    existing?.lifecycle.status === 'resolved' || existing?.lifecycle.status === 'dismissed'
      ? { issue: existing, mutationKind: 'update' as const }
      : openOrReuseAdminIssue({
          existing,
          identity,
          now: input.now,
          correlationId: input.metadata.correlationId,
          commandId: input.metadata.commandId,
        });
  if (opened.issue.lifecycle.status === 'open') {
    session.plan.planMutation({
      path: documentPath,
      kind: opened.mutationKind,
      category: 'aggregate',
      estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
    });
  }
  return {
    issue: opened.issue,
    mutationKind: opened.mutationKind,
    documentPath,
  };
}

export async function planResolveBookingMissingAttendanceIssues(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly booking: Booking;
    readonly envelope: CommandEnvelope<'record_booking_attendance' | 'resolve_attendance_outcome'>;
    readonly metadata: CommandMetadata;
    readonly now: CanonicalTimestamp;
    readonly reason: string;
  }
): Promise<PlannedBookingAttendanceIssue[]> {
  const identities = [
    bookingMissingAttendanceIssueIdentity(input.booking),
    ...input.booking.occurrence.serviceParty.participantIds.map((participantId) =>
      legacyParticipantMissingBookingAttendanceIssueIdentity({
        bookingId: input.booking.bookingId,
        occurrenceId: input.booking.occurrence.occurrenceId,
        participantId,
      })
    ),
  ];
  const planned: PlannedBookingAttendanceIssue[] = [];
  for (const identity of identities) {
    const existing = await readAdminIssue(session, input.metadata.correlationId, identity);
    if (!existing || existing.lifecycle.status !== 'open' || existing.kind !== 'missing_attendance') {
      continue;
    }
    const documentPath = plannedAdminIssuePath(identity);
    const resolved = resolveAdminIssueForCoupledAttendanceRecord(existing, {
      expectedRevision: existing.revision,
      now: input.now,
      correlationId: input.metadata.correlationId,
      commandId: input.metadata.commandId,
      reason: input.reason,
      actor: {
        actor: input.envelope.context.actor,
        exercisedCapability: input.envelope.context.exercisedCapability,
      },
      coupledDomainCommand: true,
    });
    session.plan.planMutation({
      path: documentPath,
      kind: 'update',
      category: 'aggregate',
      estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
    });
    planned.push({
      issue: resolved,
      mutationKind: 'update',
      documentPath,
    });
  }
  return planned;
}

export async function planCollapseLegacyParticipantMissingAttendanceIssues(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly booking: Booking;
    readonly envelope: CommandEnvelope<'record_booking_attendance' | 'resolve_attendance_outcome'>;
    readonly metadata: CommandMetadata;
    readonly now: CanonicalTimestamp;
  }
): Promise<PlannedBookingAttendanceIssue[]> {
  const planned: PlannedBookingAttendanceIssue[] = [];
  for (const participantId of input.booking.occurrence.serviceParty.participantIds) {
    const identity = legacyParticipantMissingBookingAttendanceIssueIdentity({
      bookingId: input.booking.bookingId,
      occurrenceId: input.booking.occurrence.occurrenceId,
      participantId,
    });
    const existing = await readAdminIssue(session, input.metadata.correlationId, identity);
    if (!existing || existing.lifecycle.status !== 'open' || existing.kind !== 'missing_attendance') {
      continue;
    }
    const documentPath = plannedAdminIssuePath(identity);
    const resolved = resolveAdminIssueForCoupledAttendanceRecord(existing, {
      expectedRevision: existing.revision,
      now: input.now,
      correlationId: input.metadata.correlationId,
      commandId: input.metadata.commandId,
      reason: 'Superseded by booking missing attendance follow-up',
      actor: {
        actor: input.envelope.context.actor,
        exercisedCapability: input.envelope.context.exercisedCapability,
      },
      coupledDomainCommand: true,
    });
    session.plan.planMutation({
      path: documentPath,
      kind: 'update',
      category: 'aggregate',
      estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
    });
    planned.push({
      issue: resolved,
      mutationKind: 'update',
      documentPath,
    });
  }
  return planned;
}

export function planAttendanceOutcomeWorkAfterResolve(input: {
  readonly booking: Booking;
  readonly plannedBooking: Booking | undefined;
  readonly pendingWork: PendingBookingAttendanceOutcomeWork;
  readonly missingParticipantIds: readonly ParticipantId[];
  readonly now: CanonicalTimestamp;
}): BookingAttendanceOutcomeWork {
  const resulting = input.plannedBooking ?? input.booking;
  const status = resulting.lifecycle.status;
  const cancelledOrPending =
    status === 'cancelled' || status === 'pending_cancellation' || status === 'pending';
  if (cancelledOrPending) {
    return completeBookingAttendanceOutcomeWork(resulting, {
      completedReason: 'lifecycle_ineligible',
      workRevision: input.pendingWork.workRevision + 1,
      updatedAt: input.now,
    });
  }
  const keepInstructorWindow =
    input.missingParticipantIds.length > 0 ||
    (status === 'confirmed' && !input.plannedBooking);
  if (
    input.pendingWork.deadlineId === BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.outcome &&
    keepInstructorWindow
  ) {
    return pendingBookingAttendanceOutcomeWork(resulting, {
      deadlineId: BOOKING_ATTENDANCE_OUTCOME_SWEEP_DEADLINE.instructorWindow,
      workRevision: input.pendingWork.workRevision + 1,
      updatedAt: input.now,
    });
  }
  return completeBookingAttendanceOutcomeWork(resulting, {
    completedReason: input.plannedBooking ? 'lifecycle_ineligible' : 'deadline_processed',
    workRevision: input.pendingWork.workRevision + 1,
    updatedAt: input.now,
  });
}

export function bookingAttendanceFollowUpDecision(input: {
  readonly booking: Booking;
  readonly plannedBooking: Booking | undefined;
  readonly attendancesByParticipantId: ReadonlyMap<ParticipantId, Attendance>;
  readonly now: CanonicalTimestamp;
}): {
  readonly missingParticipantIds: readonly ParticipantId[];
  readonly overdue: boolean;
  readonly allRecorded: boolean;
} {
  const resulting = input.plannedBooking ?? input.booking;
  const missingParticipantIds = missingAttendanceParticipantIds(
    input.booking,
    input.attendancesByParticipantId
  );
  return {
    missingParticipantIds,
    overdue: attendanceIsOverdue({
      booking: resulting,
      attendanceRows: input.attendancesByParticipantId,
      now: input.now,
    }),
    allRecorded: missingParticipantIds.length === 0,
  };
}

export function bookingAttendanceDeadlineAt(endsAt: CanonicalTimestamp): CanonicalTimestamp {
  return bookingInstructorAttendanceWindowEnd(endsAt);
}
