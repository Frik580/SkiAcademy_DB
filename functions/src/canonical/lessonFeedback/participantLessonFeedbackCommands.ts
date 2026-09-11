import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  ParticipantLessonFeedbackSchema,
  canonicalReference,
  commandSuccessResult,
  nextAggregateRevision,
  participantLessonFeedbackIdFromLessonParticipant,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorId,
  type ParticipantLessonFeedback,
  type ParticipantLessonFeedbackItem,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  assertAccountActive,
  assertAuthorizedParticipantManager,
  assertCapabilityMatchesManagementAuthority,
  assertInstructorCapability,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  accountPath,
  parseAccount,
  parseParticipant,
  parseParticipantManagement,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { instructorCatalogPath } from '../bookings/bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import {
  readAuthorizedInstructorLessonFeedbackBooking,
  resolveCatalogLinkedAccountId,
  resolveInstructorIdFromActorAccount,
} from './participantLessonFeedbackAuthorization';
import {
  PARTICIPANT_LESSON_FEEDBACK_PLANNING_ESTIMATES,
  calendarDateInTimeZone,
  parseParticipantLessonFeedback,
  participantLessonFeedbackPath,
  toFirestoreWritePayload,
} from './participantLessonFeedbackStore';

function pruneCompletedItemIds(
  completedItemIds: readonly string[],
  items: readonly ParticipantLessonFeedbackItem[]
): string[] {
  const itemIds = new Set(items.map((item) => item.itemId));
  return completedItemIds.filter((itemId) => itemIds.has(itemId));
}

function applyItemCompletion(
  completedItemIds: readonly string[],
  itemId: string,
  completed: boolean
): string[] {
  const next = new Set(completedItemIds);
  if (completed) next.add(itemId);
  else next.delete(itemId);
  return [...next];
}

function buildAuditPlan(input: {
  readonly envelope: CommandEnvelope<
    'save_participant_lesson_feedback' | 'set_participant_lesson_feedback_item_completion'
  >;
  readonly feedback: ParticipantLessonFeedback;
  readonly reasonCode:
    | 'instructor_evaluation'
    | 'participant_management'
    | 'self_service_completion';
  readonly summary: string;
}): AuditOutboxStagingPlan {
  const feedbackRef = canonicalReference(
    'participant_lesson_feedback',
    input.feedback.feedbackId
  );
  const participantRef = canonicalReference('participant', input.feedback.participantId);
  const bookingRef = canonicalReference('booking', input.feedback.lessonBookingId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: input.reasonCode,
      },
      primarySubject: {
        kind: 'participant_lesson_feedback',
        id: input.feedback.feedbackId,
        subjectKey: `participant_lesson_feedback:${input.feedback.feedbackId}`,
      },
      affectedSubjects: [feedbackRef, participantRef, bookingRef],
      effects: [
        {
          kind: 'participant_lesson_feedback_changed',
          subjectRef: feedbackRef,
          summary: input.summary,
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [{ subject: feedbackRef, revision: input.feedback.revision }],
    },
    outboxObligations: [],
  };
}

async function resolveAuthenticatedInstructorId(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope<'save_participant_lesson_feedback'>
): Promise<InstructorId> {
  const actor = requireAccountActor(envelope);
  const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
  session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
  const actorAccount = parseAccount(actorRead.exists ? actorRead.data : undefined);
  if (!actorAccount || actorAccount.lifecycle.status !== 'active') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  const resolvedInstructorId = resolveInstructorIdFromActorAccount(
    actorRead.exists ? actorRead.data : undefined
  );
  if (!resolvedInstructorId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field: 'instructorId', reason: 'required' },
    });
  }
  assertInstructorCapability(envelope, resolvedInstructorId);

  const catalogPath = instructorCatalogPath(resolvedInstructorId);
  const catalogRead = await session.tx.get({ path: catalogPath });
  session.plan.planRead({ path: catalogPath, category: 'authorization_check' });
  if (!catalogRead.exists) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'instructor', reason: 'conflict' },
    });
  }
  const linkedAccountId = resolveCatalogLinkedAccountId(catalogRead.data);
  if (linkedAccountId && linkedAccountId !== actor.accountId) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { field: 'instructorId', reason: 'conflict' },
    });
  }
  return resolvedInstructorId;
}

function assertExpectedAggregateRevision(input: {
  readonly envelope: CommandEnvelope<
    'save_participant_lesson_feedback' | 'set_participant_lesson_feedback_item_completion'
  >;
  readonly current: ParticipantLessonFeedback | undefined;
}): void {
  const expectedRevision = input.envelope.context.expectedRevision;
  if (expectedRevision === undefined) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.envelope.context.correlationId,
      details: { field: 'expectedRevision', reason: 'required' },
    });
  }
  if (input.current) {
    if (expectedRevision !== input.current.revision) {
      throw new CanonicalCommandError('stale_version', {
        correlationId: input.envelope.context.correlationId,
        currentRevision: input.current.revision,
      });
    }
    return;
  }
  if (expectedRevision !== 0) {
    throw new CanonicalCommandError('stale_version', {
      correlationId: input.envelope.context.correlationId,
      currentRevision: AggregateRevisionSchema.parse(0),
    });
  }
}

function saveParticipantLessonFeedbackHandler(
  envelope: CommandEnvelope<'save_participant_lesson_feedback'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'save_participant_lesson_feedback'>> {
  const actor = requireAccountActor(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const participantId = envelope.intent.participantId;
  const lessonBookingId = envelope.intent.lessonBookingId;
  const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
    participantId,
    lessonBookingId,
  });
  const feedbackDocumentPath = participantLessonFeedbackPath(feedbackId);
  const participantDocumentPath = participantPath(participantId);

  let current: ParticipantLessonFeedback | undefined;
  let planned!: ParticipantLessonFeedback;
  let writePayload!: Record<string, unknown>;
  let instructorId!: InstructorId;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'save_participant_lesson_feedback'> =
    {
      read: async (session) => {
        instructorId = await resolveAuthenticatedInstructorId(session, envelope);

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({
          path: participantDocumentPath,
          category: 'authorization_check',
        });
        assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );

        const decidedAt = timestampFromDate(environment.clock.now());
        const booking = await readAuthorizedInstructorLessonFeedbackBooking(session, {
          instructorId,
          participantId,
          lessonBookingId,
          at: decidedAt,
        });
        if (!booking) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'booking', reason: 'conflict' },
          });
        }

        const feedbackRead = await session.tx.get({ path: feedbackDocumentPath });
        session.plan.planRead({ path: feedbackDocumentPath, category: 'aggregate' });
        current = parseParticipantLessonFeedback(
          feedbackRead.exists ? feedbackRead.data : undefined
        );
        if (feedbackRead.exists && !current) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }

        assertExpectedAggregateRevision({ envelope, current });

        const items = envelope.intent.items;
        const completedItemIds = pruneCompletedItemIds(current?.completedItemIds ?? [], items);
        const nextRevision = current
          ? nextAggregateRevision(current.revision)
          : AggregateRevisionSchema.parse(1);

        planned = ParticipantLessonFeedbackSchema.parse({
          feedbackId,
          participantId,
          lessonBookingId,
          instructorId,
          items,
          completedItemIds,
          updatedBy: {
            kind: 'instructor',
            instructorId,
            accountId: actor.accountId,
          },
          revision: nextRevision,
          createdAt: current?.createdAt ?? decidedAt,
          updatedAt: decidedAt,
          audit: {
            createdByCommandId: current?.audit.createdByCommandId ?? identity.commandKey,
            lastChangedByCommandId: identity.commandKey,
            correlationId: envelope.context.correlationId,
          },
        });

        writePayload = toFirestoreWritePayload({
          ...planned,
          lessonStartsAt: booking.occurrence.interval.startsAt,
          lessonDate: calendarDateInTimeZone(
            booking.occurrence.interval.startsAt,
            booking.occurrence.timeZone
          ),
        });

        session.plan.planMutation({
          path: feedbackDocumentPath,
          kind: current ? 'update' : 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_LESSON_FEEDBACK_PLANNING_ESTIMATES.feedbackBytes,
        });
      },
      planAuditOutbox: async () =>
        buildAuditPlan({
          envelope,
          feedback: planned,
          reasonCode: 'instructor_evaluation',
          summary: 'Instructor saved participant lesson feedback',
        }),
      execute: async (session) => {
        if (current) {
          session.tx.update({ path: feedbackDocumentPath }, writePayload);
        } else {
          session.tx.create({ path: feedbackDocumentPath }, writePayload);
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
          feedbackId: planned.feedbackId,
          participantId: planned.participantId,
          lessonBookingId: planned.lessonBookingId,
          revision: planned.revision,
        });
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

function setParticipantLessonFeedbackItemCompletionHandler(
  envelope: CommandEnvelope<'set_participant_lesson_feedback_item_completion'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'set_participant_lesson_feedback_item_completion'>> {
  const actor = requireAccountActor(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const participantId = envelope.intent.participantId;
  const lessonBookingId = envelope.intent.lessonBookingId;
  const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
    participantId,
    lessonBookingId,
  });
  const feedbackDocumentPath = participantLessonFeedbackPath(feedbackId);
  const participantDocumentPath = participantPath(participantId);

  let current: ParticipantLessonFeedback | undefined;
  let planned!: ParticipantLessonFeedback;
  let writePayload!: Record<string, unknown>;
  let reasonCode: 'participant_management' | 'self_service_completion' = 'self_service_completion';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'set_participant_lesson_feedback_item_completion'> =
    {
      read: async (session) => {
        const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        const account = assertAccountActive(
          envelope,
          parseAccount(accountRead.exists ? accountRead.data : undefined)
        );

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({
          path: participantDocumentPath,
          category: 'authorization_check',
        });
        const participant = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );
        if (participant.management.kind !== 'managed') {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        const managementDocumentPath = participantManagementPath(
          participant.management.participantManagementId
        );
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({
          path: managementDocumentPath,
          category: 'authorization_check',
        });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (!management) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const access = assertAuthorizedParticipantManager(
          envelope,
          { account, participant, management },
          participantId
        );
        if (!access.allowed) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        assertCapabilityMatchesManagementAuthority(envelope, access.authority);
        reasonCode =
          access.authority === 'parent_guardian'
            ? 'participant_management'
            : 'self_service_completion';

        const feedbackRead = await session.tx.get({ path: feedbackDocumentPath });
        session.plan.planRead({ path: feedbackDocumentPath, category: 'aggregate' });
        current = parseParticipantLessonFeedback(
          feedbackRead.exists ? feedbackRead.data : undefined
        );
        if (!current) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'itemId', reason: 'conflict' },
          });
        }
        if (
          current.feedbackId !== feedbackId ||
          current.participantId !== participantId ||
          current.lessonBookingId !== lessonBookingId
        ) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }
        if (!current.items.some((item) => item.itemId === envelope.intent.itemId)) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'itemId', reason: 'conflict' },
          });
        }

        assertExpectedAggregateRevision({ envelope, current });

        const decidedAt = timestampFromDate(environment.clock.now());
        const completedItemIds = applyItemCompletion(
          current.completedItemIds,
          envelope.intent.itemId,
          envelope.intent.completed
        );

        planned = ParticipantLessonFeedbackSchema.parse({
          ...current,
          completedItemIds,
          revision: nextAggregateRevision(current.revision),
          updatedAt: decidedAt,
          audit: {
            ...current.audit,
            lastChangedByCommandId: identity.commandKey,
            correlationId: envelope.context.correlationId,
          },
        });

        const existingRecord = feedbackRead.data ?? {};
        writePayload = toFirestoreWritePayload({
          ...planned,
          ...(existingRecord.lessonStartsAt !== undefined
            ? { lessonStartsAt: existingRecord.lessonStartsAt }
            : {}),
          ...(existingRecord.lessonDate !== undefined
            ? { lessonDate: existingRecord.lessonDate }
            : {}),
        });

        session.plan.planMutation({
          path: feedbackDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_LESSON_FEEDBACK_PLANNING_ESTIMATES.feedbackBytes,
        });
      },
      planAuditOutbox: async () =>
        buildAuditPlan({
          envelope,
          feedback: planned,
          reasonCode,
          summary: 'Managing account updated lesson feedback item completion',
        }),
      execute: async (session) => {
        session.tx.update({ path: feedbackDocumentPath }, writePayload);
        return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
          feedbackId: planned.feedbackId,
          participantId: planned.participantId,
          lessonBookingId: planned.lessonBookingId,
          itemId: envelope.intent.itemId,
          completed: envelope.intent.completed,
          revision: planned.revision,
        });
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createParticipantLessonFeedbackCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<
  CommandHandlerMap,
  'save_participant_lesson_feedback' | 'set_participant_lesson_feedback_item_completion'
> {
  return {
    save_participant_lesson_feedback: (envelope, environment) =>
      saveParticipantLessonFeedbackHandler(envelope, environment, executor),
    set_participant_lesson_feedback_item_completion: (envelope, environment) =>
      setParticipantLessonFeedbackItemCompletionHandler(envelope, environment, executor),
  };
}
