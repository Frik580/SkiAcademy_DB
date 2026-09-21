import {
  AggregateRevisionSchema,
  AttendanceSchema,
  BookingSchema,
  CanonicalCommandError,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendancePaymentConflictIdentity,
  commandSuccessResult,
  evaluateBookingOutcomeCalculator,
  evaluateInstructorAttendanceWindow,
  nextAggregateRevision,
  paymentRequiredAtStartIdentity,
  resolveBookingAttendanceTargets,
  shouldCreateAttendancePaymentConflict,
  resolveAdminIssue,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  assertExpectedRevision,
  type Attendance,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  attendanceAdminIssueResultPayload,
  commitAdminIssueDocument,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  planAdminIssueLifecycleMutation,
  plannedAdminIssuePath,
} from '../adminIssues';
import {
  assertAdministrator,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  ATTENDANCE_PLANNING_ESTIMATES,
  attendancePath,
  parseAttendance,
  toFirestoreWritePayload as toAttendanceWritePayload,
} from './attendanceStore';
import {
  BOOKING_PLANNING_ESTIMATES,
  bookingPath,
  parseBooking,
  toFirestoreWritePayload,
} from './bookingStore';
import { buildFinalizeBookingAttendanceAuditPlan } from './bookingAttendanceAudit';
import {
  planResolveBookingMissingAttendanceIssues,
  type PlannedBookingAttendanceIssue,
} from './bookingAttendanceFollowUp';
interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(
  envelope: CommandEnvelope,
  environment: CommandExecutionEnvironment
): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

async function readAttendanceForParticipant(
  session: CanonicalAtomicTransactionSession,
  booking: Booking,
  participantId: ParticipantId
): Promise<Attendance | undefined> {
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId: booking.occurrence.occurrenceId,
    participantId,
  });
  const documentPath = attendancePath(attendanceId);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseAttendance(read.exists ? read.data : undefined);
}

async function readOpenAdminIssue(
  session: CanonicalAtomicTransactionSession,
  correlationId: CommandMetadata['correlationId'],
  identity: Parameters<typeof plannedAdminIssuePath>[0]
) {
  const documentPath = plannedAdminIssuePath(identity);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseExistingAdminIssueOrCollision(correlationId, read.exists ? read.data : undefined);
}

function assertFinalizeParticipantSet(
  envelope: CommandEnvelope<'finalize_booking_attendance'>,
  booking: Booking
): void {
  const targetIds = booking.occurrence.serviceParty.participantIds;
  if (!booking.occurrence.serviceParty.frozenAt) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'serviceParty.frozenAt', reason: 'required' },
    });
  }
  const targetSet = new Set(targetIds);
  const intentSet = new Set(envelope.intent.attendance.map((entry) => entry.participantId));
  if (intentSet.size !== envelope.intent.attendance.length) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'attendance', reason: 'conflict' },
    });
  }
  if (intentSet.size !== targetSet.size) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'attendance', reason: 'conflict' },
    });
  }
  for (const participantId of intentSet) {
    if (!targetSet.has(participantId)) {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'attendance', reason: 'unsupported' },
      });
    }
    const target = resolveBookingAttendanceTargets(booking, participantId);
    if (target.outcome === 'participant_not_in_target') {
      throw new CanonicalCommandError('validation', {
        correlationId: envelope.context.correlationId,
        details: { field: 'participantId', reason: 'unsupported' },
      });
    }
  }
}

function assertFinalizeBookingAttendanceAuthorization(
  envelope: CommandEnvelope<'finalize_booking_attendance'>,
  booking: Booking,
  now: ReturnType<typeof timestampFromDate>
): void {
  if (envelope.context.exercisedCapability !== 'administrator') {
    throw new CanonicalCommandError('forbidden', { correlationId: envelope.context.correlationId });
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);
  if (!envelope.intent.reasonExplanation.trim()) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
  if (
    booking.lifecycle.status !== 'confirmed' &&
    booking.lifecycle.status !== 'pending_cancellation'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
  if (
    evaluateInstructorAttendanceWindow({
      now,
      startsAt: booking.occurrence.interval.startsAt,
      endsAt: booking.occurrence.interval.endsAt,
    }) === 'before_start'
  ) {
    throw new CanonicalCommandError('invalid_transition', {
      correlationId: envelope.context.correlationId,
      details: { field: 'startsAt', reason: 'out_of_range' },
    });
  }
  assertExpectedRevision({
    correlationId: envelope.context.correlationId,
    expectedRevision: envelope.context.expectedRevision,
    currentRevision: booking.revision,
    requireExpectedRevision: true,
  });
}

type PlannedAttendanceWrite = {
  readonly participantId: ParticipantId;
  readonly documentPath: string;
  readonly mutation: 'create' | 'update' | 'noop';
  readonly attendance: Attendance;
};

export function finalizeBookingAttendanceHandler(
  envelope: CommandEnvelope<'finalize_booking_attendance'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'finalize_booking_attendance'>> {
  const metadata = metadataFromEnvelope(envelope, environment);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let plannedWrites: PlannedAttendanceWrite[] = [];
  let plannedBooking: Booking | undefined;
  let plannedBookingRevision: number | undefined;
  let plannedPaymentConflicts: Array<{
    issue: import('@ski-academy/shared-domain').AdminIssue;
    mutation: 'create' | 'update';
    documentPath: string;
  }> = [];
  let resolvedIssues: PlannedBookingAttendanceIssue[] = [];
  let auditSummary: string | undefined;
  let justRecordedPresentWithPaymentConflict = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'finalize_booking_attendance'> = {
    read: async (session) => {
      plannedWrites = [];
      plannedBooking = undefined;
      plannedBookingRevision = undefined;
      plannedPaymentConflicts = [];
      resolvedIssues = [];
      auditSummary = undefined;
      justRecordedPresentWithPaymentConflict = false;

      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      booking = parsedBooking;
      const now = timestampFromDate(environment.clock.decidedAt());
      assertFinalizeBookingAttendanceAuthorization(envelope, booking, now);
      assertFinalizeParticipantSet(envelope, booking);

      const actor = envelope.context.actor;
      if (actor.kind !== 'account') {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }
      const recorder = { kind: 'administrator' as const, accountId: actor.accountId };

      const currentAttendancesByParticipantId = new Map<ParticipantId, Attendance>();
      for (const participantId of booking.occurrence.serviceParty.participantIds) {
        const current = await readAttendanceForParticipant(session, booking, participantId);
        if (current) {
          currentAttendancesByParticipantId.set(participantId, current);
        }
      }

      const intentByParticipantId = new Map(
        envelope.intent.attendance.map((entry) => [entry.participantId, entry])
      );
      const attendancesByParticipantId = new Map(currentAttendancesByParticipantId);
      const reason = envelope.intent.reasonExplanation.trim();

      for (const participantId of booking.occurrence.serviceParty.participantIds) {
        const intentEntry = intentByParticipantId.get(participantId)!;
        const existingAttendance = currentAttendancesByParticipantId.get(participantId);
        const attendanceId = attendanceIdFromBookingIdentity({
          strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
          subjectKind: 'booking',
          occurrenceId: booking.occurrence.occurrenceId,
          participantId,
        });
        const attendanceDocumentPath = attendancePath(attendanceId);

        if (existingAttendance) {
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: intentEntry.expectedAttendanceRevision,
            currentRevision: existingAttendance.revision,
            requireExpectedRevision: true,
          });
        } else if (intentEntry.expectedAttendanceRevision !== undefined) {
          throw new CanonicalCommandError('stale_version', {
            correlationId: envelope.context.correlationId,
            currentRevision: AggregateRevisionSchema.parse(0),
          });
        } else {
          const collisionRead = await session.tx.get({ path: attendanceDocumentPath });
          if (collisionRead.exists) {
            throw new CanonicalCommandError('stale_version', {
              correlationId: envelope.context.correlationId,
              currentRevision: AggregateRevisionSchema.parse(1),
            });
          }
        }

        let mutation: 'create' | 'update' | 'noop' = 'noop';
        let plannedAttendance = existingAttendance;
        if (
          !existingAttendance ||
          existingAttendance.attendanceStatus !== intentEntry.attendanceStatus
        ) {
          mutation = existingAttendance ? 'update' : 'create';
          const nextAttendanceRevision = existingAttendance
            ? nextAggregateRevision(existingAttendance.revision)
            : AggregateRevisionSchema.parse(1);
          plannedAttendance = AttendanceSchema.parse({
            attendanceId,
            subject: {
              subjectKind: 'booking',
              bookingId: booking.bookingId,
              occurrenceId: booking.occurrence.occurrenceId,
              participantId,
            },
            attendanceStatus: intentEntry.attendanceStatus,
            recordedBy: existingAttendance?.recordedBy ?? recorder,
            recordedAt: existingAttendance?.recordedAt ?? now,
            lastChangedBy: recorder,
            updatedAt: now,
            revision: nextAttendanceRevision,
            correlationId: metadata.correlationId,
            causationId: metadata.commandId,
          });
          session.plan.planMutation({
            path: attendanceDocumentPath,
            kind: mutation,
            category: 'aggregate',
            estimatedPayloadBytes: ATTENDANCE_PLANNING_ESTIMATES.attendanceBytes,
          });
        }

        if (!plannedAttendance) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'attendance', reason: 'conflict' },
          });
        }

        attendancesByParticipantId.set(participantId, plannedAttendance);
        plannedWrites.push({
          participantId,
          documentPath: attendanceDocumentPath,
          mutation,
          attendance: plannedAttendance,
        });

        const paymentIssue = await readOpenAdminIssue(
          session,
          metadata.correlationId,
          paymentRequiredAtStartIdentity({
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
          })
        );
        const openPaymentRequiredAtStart = paymentIssue?.lifecycle.status === 'open';

        if (
          shouldCreateAttendancePaymentConflict({
            attendanceStatus: intentEntry.attendanceStatus,
            openPaymentRequiredAtStart,
          })
        ) {
          const identity = attendancePaymentConflictIdentity({
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
            participantId,
          });
          const documentPath = plannedAdminIssuePath(identity);
          const existing = await readOpenAdminIssue(session, metadata.correlationId, identity);
          const opened = openOrReuseAdminIssue({
            existing,
            identity,
            now,
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
          });
          plannedPaymentConflicts.push({
            issue: opened.issue,
            mutation: opened.mutationKind,
            documentPath,
          });
          justRecordedPresentWithPaymentConflict = true;
          await planAdminIssueLifecycleMutation(session, {
            previous: existing,
            issue: opened.issue,
            mutationKind: opened.mutationKind,
            documentPath,
          });
        }

        if (intentEntry.attendanceStatus !== 'present') {
          const conflictIdentity = attendancePaymentConflictIdentity({
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
            participantId,
          });
          const existingConflict = await readOpenAdminIssue(
            session,
            metadata.correlationId,
            conflictIdentity
          );
          if (existingConflict?.lifecycle.status === 'open') {
            const documentPath = plannedAdminIssuePath(conflictIdentity);
            const resolved = resolveAdminIssue(existingConflict, {
              expectedRevision: existingConflict.revision,
              now,
              correlationId: metadata.correlationId,
              commandId: metadata.commandId,
              reason,
              actor: {
                actor: envelope.context.actor,
                exercisedCapability: envelope.context.exercisedCapability,
              },
              coupledDomainCommand: true,
            });
            await planAdminIssueLifecycleMutation(session, {
              previous: existingConflict,
              issue: resolved,
              mutationKind: 'update',
              documentPath,
            });
            resolvedIssues.push({
              issue: resolved,
              mutationKind: 'update',
              documentPath,
            });
          }
        }
      }

      const resolvedMissing = await planResolveBookingMissingAttendanceIssues(session, {
        booking,
        envelope,
        metadata,
        now,
        reason,
      });
      resolvedIssues.push(...resolvedMissing);

      const paymentIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        paymentRequiredAtStartIdentity({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
        })
      );

      const openAdminIssues = [
        ...(paymentIssue?.lifecycle.status === 'open' ? [paymentIssue] : []),
        ...plannedPaymentConflicts.map((entry) => entry.issue),
      ];

      const outcomeDecision = evaluateBookingOutcomeCalculator({
        now,
        booking,
        attendancesByParticipantId,
        openAdminIssues,
        automationOnly: false,
        ...(justRecordedPresentWithPaymentConflict
          ? { justRecordedPresentWithPaymentConflict: true }
          : {}),
      });

      if (outcomeDecision.outcome === 'resolve') {
        plannedBookingRevision = nextAggregateRevision(booking.revision);
        plannedBooking = BookingSchema.parse({
          ...booking,
          lifecycle:
            outcomeDecision.lifecycle === 'completed'
              ? { status: 'completed', completedAt: now }
              : { status: 'no_show', noShowAt: now },
          revision: plannedBookingRevision,
          updatedAt: now,
          audit: {
            ...booking.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        });
        auditSummary = `Booking marked ${plannedBooking.lifecycle.status}`;
        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });
      }
    },
    planAuditOutbox: async () =>
      buildFinalizeBookingAttendanceAuditPlan({
        envelope,
        bookingId: booking.bookingId,
        attendances: plannedWrites.map((entry) => ({
          attendanceId: entry.attendance.attendanceId,
          revision: entry.attendance.revision,
          attendanceStatus: entry.attendance.attendanceStatus,
        })),
        bookingRevision: plannedBookingRevision,
        issues: [
          ...plannedPaymentConflicts.map((entry) => ({
            issueId: entry.issue.issueId,
            revision: entry.issue.revision,
            effect: entry.mutation === 'create' ? ('opened' as const) : ('reused' as const),
            kind: 'attendance_payment_conflict' as const,
          })),
          ...resolvedIssues.map((entry) => ({
            issueId: entry.issue.issueId,
            revision: entry.issue.revision,
            effect: 'resolved' as const,
            kind:
              entry.issue.kind === 'attendance_payment_conflict'
                ? ('attendance_payment_conflict' as const)
                : ('missing_attendance' as const),
          })),
        ],
        ...(auditSummary ? { lifecycleSummary: auditSummary } : {}),
      }),
    execute: async (session) => {
      let inboxCommit: ReturnType<typeof commitAdminIssueDocument> = undefined;
      for (const write of plannedWrites) {
        if (write.mutation === 'noop') continue;
        if (write.mutation === 'update') {
          session.tx.update(
            { path: write.documentPath },
            toAttendanceWritePayload(write.attendance as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: write.documentPath },
            toAttendanceWritePayload(write.attendance as Record<string, unknown>)
          );
        }
      }
      for (const entry of plannedPaymentConflicts) {
        inboxCommit =
          commitAdminIssueDocument(session, {
            mutationKind: entry.mutation,
            documentPath: entry.documentPath,
            issue: entry.issue,
          }) ?? inboxCommit;
      }
      for (const entry of resolvedIssues) {
        inboxCommit =
          commitAdminIssueDocument(session, {
            mutationKind: entry.mutationKind,
            documentPath: entry.documentPath,
            issue: entry.issue,
          }) ?? inboxCommit;
      }
      if (plannedBooking) {
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(plannedBooking as Record<string, unknown>)
        );
      }
      return commandSuccessResult(
        envelope.kind,
        envelope.context.correlationId,
        attendanceAdminIssueResultPayload(inboxCommit)
      );
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}
