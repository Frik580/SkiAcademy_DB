import {
  AggregateRevisionSchema,
  AttendanceSchema,
  BookingIdSchema,
  BookingSchema,
  CanonicalCommandError,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendancePaymentConflictIdentity,
  commandSuccessResult,
  deriveIndividualBookingAttendanceOutcome,
  evaluateBookingOutcomeCalculator,
  missingBookingAttendanceIssueIdentity,
  nextAggregateRevision,
  paymentRequiredAtStartIdentity,
  resolveAdminIssue,
  resolveCommandIdempotencyIdentity,
  shouldCreateAttendancePaymentConflict,
  timestampFromDate,
  assertExpectedRevision,
  unresolvedPendingCancellationIdentity,
  type AdminIssue,
  type Attendance,
  type AttendanceRecorder,
  type Booking,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  ADMIN_ISSUE_PLANNING_ESTIMATES,
  openOrReuseAdminIssue,
  parseExistingAdminIssueOrCollision,
  plannedAdminIssuePath,
  toFirestoreWritePayload as toAdminIssueWritePayload,
} from '../adminIssues';
import {
  assertRecordBookingAttendanceAuthorization,
  assertResolveAttendanceOutcomeAuthorization,
  type BookingAttendanceActorMode,
} from './bookingAttendanceAuthorization';
import {
  buildRecordBookingAttendanceAuditPlan,
  buildResolveAttendanceOutcomeAuditPlan,
} from './bookingAttendanceAudit';
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
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { resolveCourseEnrollmentAttendanceOutcomeHandler } from '../courses/courseEnrollmentAttendanceCommands';

interface CommandMetadata {
  readonly commandId: ReturnType<typeof resolveCommandIdempotencyIdentity>['commandKey'];
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

function metadataFromEnvelope(envelope: CommandEnvelope): CommandMetadata {
  const identity = resolveCommandIdempotencyIdentity(envelope);
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
): Promise<AdminIssue | undefined> {
  const documentPath = plannedAdminIssuePath(identity);
  const read = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  return parseExistingAdminIssueOrCollision(correlationId, read.exists ? read.data : undefined);
}

type PlannedResolvedBookingIssue = {
  readonly issue: AdminIssue;
  readonly documentPath: string;
  readonly kind: 'missing_attendance' | 'attendance_payment_conflict';
};

async function planResolveBookingAttendanceIssue(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly identity: Parameters<typeof plannedAdminIssuePath>[0];
    readonly envelope: CommandEnvelope<'record_booking_attendance'>;
    readonly metadata: CommandMetadata;
    readonly now: ReturnType<typeof timestampFromDate>;
    readonly reason: string;
  }
): Promise<PlannedResolvedBookingIssue | undefined> {
  const existing = await readOpenAdminIssue(session, input.metadata.correlationId, input.identity);
  if (!existing || existing.lifecycle.status !== 'open') return undefined;
  if (existing.kind !== 'missing_attendance' && existing.kind !== 'attendance_payment_conflict') {
    return undefined;
  }
  const documentPath = plannedAdminIssuePath(input.identity);
  const resolved = resolveAdminIssue(existing, {
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
  return { issue: resolved, documentPath, kind: existing.kind };
}

function buildAttendanceRecorder(
  mode: BookingAttendanceActorMode,
  envelope: CommandEnvelope<'record_booking_attendance'>,
  booking: Booking
): AttendanceRecorder {
  if (mode === 'instructor') {
    return { kind: 'instructor', instructorId: booking.occurrence.instructorId };
  }
  const actor = envelope.context.actor;
  if (actor.kind !== 'account') {
    throw new CanonicalCommandError('forbidden', { correlationId: envelope.context.correlationId });
  }
  return { kind: 'administrator', accountId: actor.accountId };
}

function recordBookingAttendanceHandler(
  envelope: CommandEnvelope<'record_booking_attendance'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'record_booking_attendance'>> {
  const metadata = metadataFromEnvelope(envelope);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let booking!: Booking;
  let existingAttendance: Attendance | undefined;
  let plannedAttendance!: Attendance;
  let attendanceDocumentPath = '';
  let attendanceMutation: 'create' | 'update' = 'create';
  let actorMode!: BookingAttendanceActorMode;
  let plannedBooking: Booking | undefined;
  let plannedBookingRevision: number | undefined;
  let plannedPaymentConflictIssue: AdminIssue | undefined;
  let paymentConflictDocumentPath = '';
  let paymentConflictMutation: 'create' | 'update' | undefined;
  let resolvedIssues: PlannedResolvedBookingIssue[] = [];
  let auditSummary: string | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'record_booking_attendance'> = {
    read: async (session) => {
      plannedBooking = undefined;
      plannedBookingRevision = undefined;
      plannedPaymentConflictIssue = undefined;
      paymentConflictDocumentPath = '';
      paymentConflictMutation = undefined;
      resolvedIssues = [];
      auditSummary = undefined;

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
      existingAttendance = await readAttendanceForParticipant(
        session,
        booking,
        envelope.intent.participantId
      );
      actorMode = assertRecordBookingAttendanceAuthorization(envelope, {
        booking,
        existingAttendance,
        now,
      });

      const attendanceId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: booking.occurrence.occurrenceId,
        participantId: envelope.intent.participantId,
      });
      attendanceDocumentPath = attendancePath(attendanceId);

      if (existingAttendance) {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision: envelope.intent.expectedAttendanceRevision,
          currentRevision: existingAttendance.revision,
          requireExpectedRevision: true,
        });
        attendanceMutation = 'update';
        if (existingAttendance.attendanceStatus === envelope.intent.attendanceStatus) {
          plannedAttendance = existingAttendance;
          if (actorMode === 'instructor') {
            return;
          }
        }
      } else if (envelope.intent.expectedAttendanceRevision !== undefined) {
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
        attendanceMutation = 'create';
      }

      if (
        !existingAttendance ||
        existingAttendance.attendanceStatus !== envelope.intent.attendanceStatus
      ) {
        const recorder = buildAttendanceRecorder(actorMode, envelope, booking);
        const nextAttendanceRevision = existingAttendance
          ? nextAggregateRevision(existingAttendance.revision)
          : AggregateRevisionSchema.parse(1);
        plannedAttendance = AttendanceSchema.parse({
          attendanceId,
          subject: {
            subjectKind: 'booking',
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
            participantId: envelope.intent.participantId,
          },
          attendanceStatus: envelope.intent.attendanceStatus,
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
          kind: attendanceMutation,
          category: 'aggregate',
          estimatedPayloadBytes: ATTENDANCE_PLANNING_ESTIMATES.attendanceBytes,
        });
      }

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
          attendanceStatus: envelope.intent.attendanceStatus,
          openPaymentRequiredAtStart,
        })
      ) {
        const identity = attendancePaymentConflictIdentity({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
          participantId: envelope.intent.participantId,
        });
        paymentConflictDocumentPath = plannedAdminIssuePath(identity);
        const existing = await readOpenAdminIssue(session, metadata.correlationId, identity);
        const opened = openOrReuseAdminIssue({
          existing,
          identity,
          now,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
        });
        plannedPaymentConflictIssue = opened.issue;
        paymentConflictMutation = opened.mutationKind;
        session.plan.planMutation({
          path: paymentConflictDocumentPath,
          kind: opened.mutationKind,
          category: 'aggregate',
          estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
        });
      }

      const attendancesByParticipantId = new Map<ParticipantId, Attendance>();
      for (const participantId of booking.occurrence.serviceParty.participantIds) {
        const current =
          participantId === envelope.intent.participantId
            ? plannedAttendance
            : await readAttendanceForParticipant(session, booking, participantId);
        if (current) {
          attendancesByParticipantId.set(participantId, current);
        }
      }

      if (actorMode === 'administrator' || actorMode === 'admin_terminal_correction') {
        const reason = envelope.intent.reasonExplanation!.trim();
        const resolvedMissing = await planResolveBookingAttendanceIssue(session, {
          identity: missingBookingAttendanceIssueIdentity({
            bookingId: booking.bookingId,
            occurrenceId: booking.occurrence.occurrenceId,
            participantId: envelope.intent.participantId,
          }),
          envelope,
          metadata,
          now,
          reason,
        });
        if (resolvedMissing) resolvedIssues.push(resolvedMissing);

        if (envelope.intent.attendanceStatus !== 'present') {
          const resolvedConflict = await planResolveBookingAttendanceIssue(session, {
            identity: attendancePaymentConflictIdentity({
              bookingId: booking.bookingId,
              occurrenceId: booking.occurrence.occurrenceId,
              participantId: envelope.intent.participantId,
            }),
            envelope,
            metadata,
            now,
            reason,
          });
          if (resolvedConflict) resolvedIssues.push(resolvedConflict);
        }
      }

      if (actorMode === 'admin_terminal_correction') {
        const correctedLifecycle = deriveIndividualBookingAttendanceOutcome(plannedAttendance);
        if (correctedLifecycle === 'missing_attendance') {
          throw new CanonicalCommandError('invalid_transition', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'unsupported' },
          });
        }
        plannedBookingRevision = nextAggregateRevision(booking.revision);
        plannedBooking = BookingSchema.parse({
          ...booking,
          lifecycle:
            correctedLifecycle === 'completed'
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
        auditSummary = `Booking marked ${correctedLifecycle}`;
        session.plan.planMutation({
          path: bookingDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: BOOKING_PLANNING_ESTIMATES.bookingBytes,
        });
        return;
      }

      const outcomeDecision = evaluateBookingOutcomeCalculator({
        now,
        booking,
        attendancesByParticipantId,
        openAdminIssues: [
          ...(paymentIssue?.lifecycle.status === 'open' ? [paymentIssue] : []),
          ...(plannedPaymentConflictIssue ? [plannedPaymentConflictIssue] : []),
        ],
        automationOnly: false,
        ...(plannedPaymentConflictIssue ? { justRecordedPresentWithPaymentConflict: true } : {}),
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
      buildRecordBookingAttendanceAuditPlan({
        envelope,
        bookingId: booking.bookingId,
        attendanceId: plannedAttendance.attendanceId,
        attendanceRevision: plannedAttendance.revision,
        bookingRevision: plannedBookingRevision,
        actorMode,
        issues: [
          ...(plannedPaymentConflictIssue && paymentConflictMutation
            ? [
                {
                  issueId: plannedPaymentConflictIssue.issueId,
                  revision: plannedPaymentConflictIssue.revision,
                  effect:
                    paymentConflictMutation === 'create'
                      ? ('opened' as const)
                      : ('reused' as const),
                  kind: 'attendance_payment_conflict' as const,
                },
              ]
            : []),
          ...resolvedIssues.map((entry) => ({
            issueId: entry.issue.issueId,
            revision: entry.issue.revision,
            effect: 'resolved' as const,
            kind: entry.kind,
          })),
        ],
        ...(auditSummary ? { lifecycleSummary: auditSummary } : {}),
      }),
    execute: async (session) => {
      if (
        !existingAttendance ||
        existingAttendance.attendanceStatus !== envelope.intent.attendanceStatus
      ) {
        if (attendanceMutation === 'update') {
          session.tx.update(
            { path: attendanceDocumentPath },
            toAttendanceWritePayload(plannedAttendance as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: attendanceDocumentPath },
            toAttendanceWritePayload(plannedAttendance as Record<string, unknown>)
          );
        }
      }
      if (plannedPaymentConflictIssue && paymentConflictDocumentPath) {
        if (paymentConflictMutation === 'update') {
          session.tx.update(
            { path: paymentConflictDocumentPath },
            toAdminIssueWritePayload(plannedPaymentConflictIssue as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: paymentConflictDocumentPath },
            toAdminIssueWritePayload(plannedPaymentConflictIssue as Record<string, unknown>)
          );
        }
      }
      for (const entry of resolvedIssues) {
        session.tx.update(
          { path: entry.documentPath },
          toAdminIssueWritePayload(entry.issue as Record<string, unknown>)
        );
      }
      if (plannedBooking) {
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(plannedBooking as Record<string, unknown>)
        );
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function resolveAttendanceOutcomeHandler(
  envelope: CommandEnvelope<'resolve_attendance_outcome'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'resolve_attendance_outcome'>> {
  if (envelope.intent.subjectKind === 'course_enrollment') {
    return resolveCourseEnrollmentAttendanceOutcomeHandler(envelope, environment, executor);
  }
  if (envelope.intent.subjectKind !== 'booking') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'subjectKind', reason: 'unsupported' },
    });
  }

  const metadata = metadataFromEnvelope(envelope);
  const bookingId = BookingIdSchema.parse(envelope.intent.subjectId);
  const bookingDocumentPath = bookingPath(bookingId);
  const actorMode = assertResolveAttendanceOutcomeAuthorization(envelope);

  let booking!: Booking;
  let plannedBooking: Booking | undefined;
  let plannedBookingRevision: number | undefined;
  let plannedIssues: Array<{
    issue: AdminIssue;
    mutationKind: 'create' | 'update';
    documentPath: string;
  }> = [];
  let auditSummary: string | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'resolve_attendance_outcome'> = {
    read: async (session) => {
      plannedBooking = undefined;
      plannedBookingRevision = undefined;
      plannedIssues = [];
      auditSummary = undefined;

      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const parsedBooking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!parsedBooking) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'subjectId', reason: 'conflict' },
        });
      }
      booking = parsedBooking;

      if (actorMode === 'administrator') {
        assertExpectedRevision({
          correlationId: envelope.context.correlationId,
          expectedRevision: envelope.context.expectedRevision,
          currentRevision: booking.revision,
          requireExpectedRevision: true,
        });
      }

      const now = timestampFromDate(environment.clock.decidedAt());
      const attendancesByParticipantId = new Map<ParticipantId, Attendance>();
      for (const participantId of booking.occurrence.serviceParty.participantIds) {
        const attendance = await readAttendanceForParticipant(session, booking, participantId);
        if (attendance) {
          attendancesByParticipantId.set(participantId, attendance);
        }
      }

      const paymentIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        paymentRequiredAtStartIdentity({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
        })
      );
      const pendingCancellationIssue = await readOpenAdminIssue(
        session,
        metadata.correlationId,
        unresolvedPendingCancellationIdentity({
          bookingId: booking.bookingId,
          occurrenceId: booking.occurrence.occurrenceId,
        })
      );

      const openIssues = [
        ...(paymentIssue?.lifecycle.status === 'open' ? [paymentIssue] : []),
        ...(pendingCancellationIssue?.lifecycle.status === 'open'
          ? [pendingCancellationIssue]
          : []),
      ];

      const outcomeDecision = evaluateBookingOutcomeCalculator({
        now,
        booking,
        attendancesByParticipantId,
        openAdminIssues: openIssues,
        automationOnly: actorMode === 'system',
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

      if (outcomeDecision.outcome === 'unresolved') {
        for (const participantId of outcomeDecision.missingParticipantIds) {
          const identity = missingBookingAttendanceIssueIdentity({
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
          plannedIssues.push({
            issue: opened.issue,
            mutationKind: opened.mutationKind,
            documentPath,
          });
          session.plan.planMutation({
            path: documentPath,
            kind: opened.mutationKind,
            category: 'aggregate',
            estimatedPayloadBytes: ADMIN_ISSUE_PLANNING_ESTIMATES.issueBytes,
          });
        }
      }
    },
    planAuditOutbox: async () =>
      buildResolveAttendanceOutcomeAuditPlan({
        envelope,
        bookingId: booking.bookingId,
        bookingRevision: plannedBookingRevision,
        issues: plannedIssues.map((entry) => ({
          issueId: entry.issue.issueId,
          revision: entry.issue.revision,
          effect: entry.mutationKind === 'create' ? ('opened' as const) : ('reused' as const),
          kind: 'missing_attendance' as const,
        })),
        ...(auditSummary ? { lifecycleSummary: auditSummary } : {}),
      }),
    execute: async (session) => {
      if (plannedBooking) {
        session.tx.update(
          { path: bookingDocumentPath },
          toFirestoreWritePayload(plannedBooking as Record<string, unknown>)
        );
      }
      for (const plannedIssue of plannedIssues) {
        if (plannedIssue.mutationKind === 'update') {
          session.tx.update(
            { path: plannedIssue.documentPath },
            toAdminIssueWritePayload(plannedIssue.issue as Record<string, unknown>)
          );
        } else {
          session.tx.create(
            { path: plannedIssue.documentPath },
            toAdminIssueWritePayload(plannedIssue.issue as Record<string, unknown>)
          );
        }
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createBookingAttendanceCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'record_booking_attendance' | 'resolve_attendance_outcome'> {
  return {
    record_booking_attendance: (envelope, environment) =>
      recordBookingAttendanceHandler(envelope, environment, executor),
    resolve_attendance_outcome: (envelope, environment) =>
      resolveAttendanceOutcomeHandler(envelope, environment, executor),
  };
}
