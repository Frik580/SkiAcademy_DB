import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  InstructorRatingSummarySchema,
  InstructorReviewSchema,
  attendanceIdFromBookingIdentity,
  canonicalReference,
  commandSuccessResult,
  instructorReviewIdFromBookingAccount,
  nextAggregateRevision,
  normalizeInstructorReviewComment,
  resolveClientCallableCapabilityFromPartyAuthorities,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type Attendance,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type InstructorRatingSummary,
  type InstructorReview,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  accountPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipantManagement,
  participantManagementActiveOwnerPath,
  participantManagementPath,
} from '../participantAccess/participantAccessStore';
import { assertAccountActive, requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import { attendancePath, parseAttendance } from '../bookings/attendanceStore';
import {
  bookingPath,
  instructorCatalogPath,
  parseBooking,
  parseInstructorCatalog,
} from '../bookings/bookingStore';
import {
  instructorRatingSummaryPath,
  instructorReviewPath,
  parseInstructorRatingSummary,
  parseInstructorReview,
  toFirestoreWritePayload,
} from './instructorReviewStore';

function invalidTransition(envelope: CommandEnvelope<'create_instructor_review'>): never {
  throw new CanonicalCommandError('invalid_transition', {
    correlationId: envelope.context.correlationId,
    details: { resourceKind: 'booking', reason: 'conflict' },
  });
}

function buildAuditPlan(input: {
  readonly envelope: CommandEnvelope<'create_instructor_review'>;
  readonly review: InstructorReview;
  readonly summary: InstructorRatingSummary;
  readonly created: boolean;
}): AuditOutboxStagingPlan {
  const reviewRef = canonicalReference('review', input.review.reviewId);
  const instructorRef = canonicalReference('instructor', input.review.instructorId);
  const bookingRef = canonicalReference('booking', input.review.bookingId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'customer_review',
      },
      primarySubject: {
        kind: 'review',
        id: input.review.reviewId,
        subjectKey: `review:${input.review.reviewId}`,
      },
      affectedSubjects: [reviewRef, bookingRef, instructorRef],
      effects: input.created
        ? [
            {
              kind: 'instructor_review_created',
              subjectRef: reviewRef,
              summary: 'Instructor review created for completed attended lesson',
            },
          ]
        : [],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: [
        { subject: reviewRef, revision: input.review.revision },
        { subject: instructorRef, revision: input.summary.revision },
      ],
    },
    outboxObligations: [],
  };
}

function createInstructorReviewHandler(
  envelope: CommandEnvelope<'create_instructor_review'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_instructor_review'>> {
  const actor = requireAccountActor(envelope);
  const identity = resolveCommandIdempotencyIdentity(envelope);
  const reviewId = instructorReviewIdFromBookingAccount({
    bookingId: envelope.intent.bookingId,
    managingAccountId: actor.accountId,
  });
  const reviewDocumentPath = instructorReviewPath(reviewId);
  const bookingDocumentPath = bookingPath(envelope.intent.bookingId);

  let existingReview: InstructorReview | undefined;
  let plannedReview!: InstructorReview;
  let plannedSummary!: InstructorRatingSummary;
  let summaryDocumentPath = '';
  let existingSummary: InstructorRatingSummary | undefined;
  let created = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_instructor_review'> = {
    read: async (session) => {
      created = false;
      existingReview = undefined;
      existingSummary = undefined;

      const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      const account = assertAccountActive(
        envelope,
        parseAccount(accountRead.exists ? accountRead.data : undefined)
      );

      const reviewRead = await session.tx.get({ path: reviewDocumentPath });
      session.plan.planRead({ path: reviewDocumentPath, category: 'aggregate' });
      existingReview = parseInstructorReview(reviewRead.exists ? reviewRead.data : undefined);
      if (reviewRead.exists && !existingReview) {
        throw new CanonicalCommandError('internal', {
          correlationId: envelope.context.correlationId,
        });
      }
      if (existingReview) {
        if (
          existingReview.reviewId !== reviewId ||
          existingReview.bookingId !== envelope.intent.bookingId ||
          existingReview.managingAccountId !== actor.accountId
        ) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }
        summaryDocumentPath = instructorRatingSummaryPath(existingReview.instructorId);
        const summaryRead = await session.tx.get({ path: summaryDocumentPath });
        session.plan.planRead({ path: summaryDocumentPath, category: 'aggregate' });
        existingSummary = parseInstructorRatingSummary(
          summaryRead.exists ? summaryRead.data : undefined
        );
        if (!existingSummary) {
          throw new CanonicalCommandError('internal', {
            correlationId: envelope.context.correlationId,
          });
        }
        plannedReview = existingReview;
        plannedSummary = existingSummary;
        return;
      }

      const bookingRead = await session.tx.get({ path: bookingDocumentPath });
      session.plan.planRead({ path: bookingDocumentPath, category: 'aggregate' });
      const booking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
      if (!booking || booking.archival?.isDeleted) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { field: 'bookingId', reason: 'conflict' },
        });
      }
      if (booking.lifecycle.status !== 'completed') invalidTransition(envelope);

      const instructorId = booking.occurrence.instructorId;
      const instructorRead = await session.tx.get({ path: instructorCatalogPath(instructorId) });
      session.plan.planRead({
        path: instructorCatalogPath(instructorId),
        category: 'authorization_check',
      });
      if (
        !parseInstructorCatalog(
          instructorId,
          instructorRead.exists ? instructorRead.data : undefined
        )
      ) {
        throw new CanonicalCommandError('validation', {
          correlationId: envelope.context.correlationId,
          details: { resourceKind: 'instructor', reason: 'conflict' },
        });
      }

      const managements: ParticipantManagement[] = [];
      for (const participantId of booking.party.participantIds) {
        const guardPath = participantManagementActiveOwnerPath(participantId);
        const guardRead = await session.tx.get({ path: guardPath });
        session.plan.planRead({ path: guardPath, category: 'authorization_check' });
        const guard = parseActiveOwnerGuard(guardRead.exists ? guardRead.data : undefined);
        if (!guard || guard.accountId !== account.accountId) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const managementPath = participantManagementPath(guard.participantManagementId);
        const managementRead = await session.tx.get({ path: managementPath });
        session.plan.planRead({ path: managementPath, category: 'authorization_check' });
        const management = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (
          !management ||
          management.status !== 'active' ||
          management.accountId !== account.accountId ||
          management.participantId !== participantId
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        managements.push(management);
      }

      const expectedCapability = resolveClientCallableCapabilityFromPartyAuthorities(
        managements.map((management) => management.authority)
      );
      if (envelope.context.exercisedCapability !== expectedCapability) {
        throw new CanonicalCommandError('forbidden', {
          correlationId: envelope.context.correlationId,
        });
      }

      const presentAttendances: Attendance[] = [];
      for (const participantId of booking.occurrence.serviceParty.participantIds) {
        const attendanceId = attendanceIdFromBookingIdentity({
          strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
          subjectKind: 'booking',
          occurrenceId: booking.occurrence.occurrenceId,
          participantId,
        });
        const documentPath = attendancePath(attendanceId);
        const attendanceRead = await session.tx.get({ path: documentPath });
        session.plan.planRead({ path: documentPath, category: 'authorization_check' });
        const attendance = parseAttendance(
          attendanceRead.exists ? attendanceRead.data : undefined
        );
        if (
          attendance &&
          attendance.subject.subjectKind === 'booking' &&
          attendance.subject.bookingId === booking.bookingId &&
          attendance.subject.participantId === participantId &&
          attendance.attendanceStatus === 'present'
        ) {
          presentAttendances.push(attendance);
        }
      }
      if (presentAttendances.length === 0) invalidTransition(envelope);

      summaryDocumentPath = instructorRatingSummaryPath(instructorId);
      const summaryRead = await session.tx.get({ path: summaryDocumentPath });
      session.plan.planRead({ path: summaryDocumentPath, category: 'aggregate' });
      existingSummary = parseInstructorRatingSummary(
        summaryRead.exists ? summaryRead.data : undefined
      );
      if (summaryRead.exists && !existingSummary) {
        throw new CanonicalCommandError('internal', {
          correlationId: envelope.context.correlationId,
        });
      }

      const decidedAt = timestampFromDate(environment.clock.decidedAt());
      const rawProfile = accountRead.data ?? {};
      const authorDisplayName =
        typeof rawProfile.displayName === 'string' && rawProfile.displayName.trim()
          ? rawProfile.displayName.trim()
          : 'Anonymous';
      const authorAvatarUrl =
        typeof rawProfile.avatarUrl === 'string' && rawProfile.avatarUrl.trim()
          ? rawProfile.avatarUrl.trim()
          : undefined;
      const comment = normalizeInstructorReviewComment(envelope.intent.comment);

      plannedReview = InstructorReviewSchema.parse({
        reviewId,
        bookingId: booking.bookingId,
        managingAccountId: account.accountId,
        instructorId,
        rating: envelope.intent.rating,
        ...(comment ? { comment } : {}),
        attendanceEvidenceParticipantIds: presentAttendances.map(
          (attendance) => attendance.subject.participantId
        ),
        authorDisplayName,
        ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
        revision: 1,
        createdAt: decidedAt,
        audit: {
          createdByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      });

      const reviewsCount = (existingSummary?.reviewsCount ?? 0) + 1;
      const ratingSum = (existingSummary?.ratingSum ?? 0) + envelope.intent.rating;
      const ratingCounts = [...(existingSummary?.ratingCounts ?? [0, 0, 0, 0, 0])];
      ratingCounts[envelope.intent.rating - 1] =
        (ratingCounts[envelope.intent.rating - 1] ?? 0) + 1;
      plannedSummary = InstructorRatingSummarySchema.parse({
        instructorId,
        rating: ratingSum / reviewsCount,
        ratingSum,
        ratingCounts,
        reviewsCount,
        revision: existingSummary
          ? nextAggregateRevision(existingSummary.revision)
          : AggregateRevisionSchema.parse(1),
        createdAt: existingSummary?.createdAt ?? decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: existingSummary?.audit.createdByCommandId ?? identity.commandKey,
          lastChangedByCommandId: identity.commandKey,
          correlationId: envelope.context.correlationId,
        },
      });
      created = true;
      session.plan.planMutation({
        path: reviewDocumentPath,
        kind: 'create',
        category: 'aggregate',
        estimatedPayloadBytes: 2_048,
      });
      session.plan.planMutation({
        path: summaryDocumentPath,
        kind: existingSummary ? 'update' : 'create',
        category: 'aggregate',
        estimatedPayloadBytes: 768,
      });
    },
    planAuditOutbox: async () =>
      buildAuditPlan({
        envelope,
        review: plannedReview,
        summary: plannedSummary,
        created,
      }),
    execute: async (session) => {
      if (created) {
        session.tx.create(
          { path: reviewDocumentPath },
          toFirestoreWritePayload(plannedReview as unknown as Record<string, unknown>)
        );
        const summaryPayload = toFirestoreWritePayload(
          plannedSummary as unknown as Record<string, unknown>
        );
        if (existingSummary) {
          session.tx.update({ path: summaryDocumentPath }, summaryPayload);
        } else {
          session.tx.create({ path: summaryDocumentPath }, summaryPayload);
        }
      }
      return commandSuccessResult(envelope.kind, envelope.context.correlationId, {
        outcome: created ? 'created' : 'already_exists',
        reviewId,
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

export function createInstructorReviewCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Pick<CommandHandlerMap, 'create_instructor_review'> {
  return {
    create_instructor_review: (envelope, environment) =>
      createInstructorReviewHandler(envelope, environment, executor),
  };
}
