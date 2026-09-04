import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  CanonicalCommandError,
  INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT,
  InstructorCatalogEntrySchema,
  PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT,
  administratorCapabilityExercisedByAccount,
  canonicalReference,
  commandSuccessResult,
  evaluateAdminManagementAssignment,
  evaluateChangeAccountRole,
  evaluateDisableAccount,
  evaluateReactivateInstructorCatalog,
  instructorUnlinkBlockedByFutureCommitments,
  nextAggregateRevision,
  parseInstructorCatalogRevision,
  participantArchiveBlockedByCommitments,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  AccountIdSchema,
  type Account,
  type AccountId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandKind,
  type CommandResult,
  type InstructorCatalogEntry,
  type InstructorId,
  type Participant,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { parseBooking, instructorCatalogPath } from '../bookings/bookingStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parseCourseDay } from '../courses/courseStore';
import {
  commitAcquireParticipantManagementActiveOwnerGuard,
  readAndPlanAcquireParticipantManagementActiveOwnerGuard,
} from '../resourceClaims/uniquenessGuards';
import { CANONICAL_FIELD_DELETE } from '../transactions/transactionExecution';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  assertAccountActive,
  assertAdministrator,
  assertParticipantActive,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';
import {
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
  accountPath,
  parseAccount,
  parseActiveOwnerGuard,
  parseParticipant,
  parseParticipantManagement,
  participantManagementActiveOwnerPath,
  participantManagementPath,
  participantPath,
} from '../participantAccess/participantAccessStore';
import { sanitizeInstructorPresentationAvatarUrl } from '../readModels/instructorPresentationAvatar';

type IdentityAdminKind = Extract<
  CommandKind,
  | 'disable_account'
  | 'enable_account'
  | 'archive_participant'
  | 'reactivate_participant'
  | 'assign_participant_management_as_administrator'
  | 'create_managed_dependent_participant'
  | 'change_account_role'
  | 'update_account_contact_as_administrator'
  | 'create_instructor_catalog_entry'
  | 'update_instructor_catalog_profile'
  | 'deactivate_instructor_catalog'
  | 'reactivate_instructor_catalog'
  | 'link_account_instructor_catalog'
  | 'unlink_account_instructor_catalog'
  | 'repair_participant_management_owner_guard'
>;

function metadataFromEnvelope(envelope: CommandEnvelope) {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

function revisionAuditLink(
  envelope: CommandEnvelope,
  metadata: ReturnType<typeof metadataFromEnvelope>
) {
  return {
    createdByCommandId: metadata.commandId,
    lastChangedByCommandId: metadata.commandId,
    correlationId: metadata.correlationId,
  };
}

function readSystemRole(data: Record<string, unknown> | undefined): 'owner' | undefined {
  return data?.systemRole === 'owner' ? 'owner' : undefined;
}

function readAccountRole(data: Record<string, unknown> | undefined): 'user' | 'admin' {
  return data?.role === 'admin' ? 'admin' : 'user';
}

function forbidden(envelope: CommandEnvelope, details?: Record<string, unknown>): never {
  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
    ...(details ? { details } : {}),
  });
}

function conflict(envelope: CommandEnvelope, details?: Record<string, unknown>): never {
  throw new CanonicalCommandError('invalid_transition', {
    correlationId: envelope.context.correlationId,
    ...(details ? { details } : {}),
  });
}

function requireAdmin(envelope: CommandEnvelope) {
  if (!administratorCapabilityExercisedByAccount(envelope.context)) {
    forbidden(envelope);
  }
  return assertAdministrator(envelope);
}

function requireReason(envelope: CommandEnvelope, explanation: string | undefined): string {
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
  return explanation;
}

function buildIdentityAdminAuditPlan(input: {
  readonly envelope: CommandEnvelope<IdentityAdminKind>;
  readonly summary: string;
  readonly reasonCode: 'manual_override' | 'participant_management';
  readonly explanation: string;
  readonly primary: { readonly kind: 'account' | 'participant' | 'instructor'; readonly id: string };
  readonly affectedSubjects: AuditOutboxStagingPlan['activityLog']['affectedSubjects'];
  readonly resultingRevisions: AuditOutboxStagingPlan['activityLog']['resultingRevisions'];
  readonly effectKind: 'participant_access_changed' | 'outbox_obligation_created';
}): AuditOutboxStagingPlan {
  const subjectRef = input.affectedSubjects[0];
  if (!subjectRef) {
    throw new CanonicalCommandError('internal', {
      correlationId: input.envelope.context.correlationId,
    });
  }
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: input.reasonCode,
        explanation: input.explanation,
      },
      primarySubject: {
        kind: input.primary.kind,
        id: input.primary.id,
        subjectKey: `${input.primary.kind}:${input.primary.id}`,
      },
      affectedSubjects: input.affectedSubjects,
      effects: [
        {
          kind: input.effectKind,
          subjectRef,
          summary: input.summary,
        },
      ],
      monetaryEventIds: [],
      adminIssueIds: [],
      resultingRevisions: input.resultingRevisions,
    },
    outboxObligations: [],
  };
}

function parseCatalogEntry(
  instructorId: string,
  data: Record<string, unknown> | undefined
): InstructorCatalogEntry | undefined {
  if (!data) return undefined;

  // Load-time tolerance for legacy optional presentation fields.
  // Strict write bounds still apply to command intents; an oversized historical
  // avatarUrl (or other optional noise) must not turn profile update into
  // invalid_transition/conflict — that blocked replacing the bad avatar.
  const specialty =
    data.specialty === 'ski' || data.specialty === 'snowboard' || data.specialty === 'both'
      ? data.specialty
      : undefined;
  const languages = Array.isArray(data.languages)
    ? data.languages
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length >= 1 && item.length <= 32)
        .slice(0, 16)
    : undefined;
  const experienceYears =
    typeof data.experienceYears === 'number' &&
    Number.isFinite(data.experienceYears) &&
    Number.isInteger(data.experienceYears) &&
    data.experienceYears >= 0 &&
    data.experienceYears <= 80
      ? data.experienceYears
      : undefined;
  const bio =
    typeof data.bio === 'string' && data.bio.trim().length > 0 && data.bio.trim().length <= 4_000
      ? data.bio.trim()
      : undefined;
  const avatarUrl = sanitizeInstructorPresentationAvatarUrl(
    typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined
  );
  const phoneNumber =
    typeof data.phoneNumber === 'string' &&
    data.phoneNumber.trim().length > 0 &&
    data.phoneNumber.trim().length <= 32
      ? data.phoneNumber.trim()
      : undefined;
  const linkedAccountParsed = AccountIdSchema.safeParse(data.linkedAccountId);
  const rating =
    typeof data.rating === 'number' &&
    Number.isFinite(data.rating) &&
    data.rating >= 0 &&
    data.rating <= 5
      ? data.rating
      : undefined;
  const reviewsCount =
    typeof data.reviewsCount === 'number' &&
    Number.isFinite(data.reviewsCount) &&
    Number.isInteger(data.reviewsCount) &&
    data.reviewsCount >= 0
      ? data.reviewsCount
      : undefined;

  const parsed = InstructorCatalogEntrySchema.safeParse({
    instructorId,
    name: data.name,
    ...(specialty ? { specialty } : {}),
    ...(languages && languages.length > 0 ? { languages } : {}),
    ...(experienceYears !== undefined ? { experienceYears } : {}),
    ...(bio ? { bio } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    pricePerHourKZT: data.pricePerHourKZT,
    pricePerHour: data.pricePerHour,
    ...(phoneNumber ? { phoneNumber } : {}),
    ...(linkedAccountParsed.success ? { linkedAccountId: linkedAccountParsed.data } : {}),
    isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : true,
    ...(rating !== undefined ? { rating } : {}),
    ...(reviewsCount !== undefined ? { reviewsCount } : {}),
    revision: parseInstructorCatalogRevision(data),
  });
  return parsed.success ? parsed.data : undefined;
}

async function assertInstructorReverseLinkAvailable(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  instructorId: InstructorId,
  targetAccountId: AccountId,
  catalogLinkedAccountId: AccountId | undefined
): Promise<void> {
  if (catalogLinkedAccountId && catalogLinkedAccountId !== targetAccountId) {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'instructor', reason: 'conflict' },
    });
  }
  const linkedAccounts = await session.tx.query({
    collection: 'users',
    where: { field: 'instructorId', op: '==', value: instructorId },
    limit: 2,
  });
  session.plan.planRead({
    path: 'users/query_by_instructorId',
    category: 'authorization_check',
  });
  for (const doc of linkedAccounts) {
    const accountId = doc.path.split('/')[1];
    if (accountId && accountId !== targetAccountId) {
      throw new CanonicalCommandError('blocked_relationship', {
        correlationId: envelope.context.correlationId,
        details: { resourceKind: 'instructor', reason: 'conflict' },
      });
    }
  }
}

async function assertNoOutstandingInstructorCommitments(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  instructorId: InstructorId,
  now: Date
): Promise<void> {
  const bookingDocs = await session.tx.query({
    collection: 'bookings',
    where: { field: 'occurrence.instructorId', op: '==', value: instructorId },
    limit: INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT + 1,
  });
  session.plan.planRead({
    path: 'bookings/query_by_instructor',
    category: 'authorization_check',
  });
  const courseDayDocs = await session.tx.query({
    collection: 'days',
    collectionGroup: true,
    where: { field: 'actualInstructorIds', op: 'array-contains', value: instructorId },
    limit: INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT + 1,
  });
  session.plan.planRead({
    path: 'days/query_by_instructor',
    category: 'authorization_check',
  });
  const bookings = bookingDocs
    .map((doc) => parseBooking(doc.data))
    .filter((booking): booking is NonNullable<typeof booking> => booking !== undefined);
  const courseDays = courseDayDocs
    .map((doc) => parseCourseDay(doc.data))
    .filter((day): day is NonNullable<typeof day> => day !== undefined);
  if (
    instructorUnlinkBlockedByFutureCommitments({
      bookings,
      courseDays,
      now: timestampFromDate(now),
      bookingScanCapped: bookingDocs.length > INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT,
      courseDayScanCapped: courseDayDocs.length > INSTRUCTOR_UNLINK_COMMITMENT_SCAN_LIMIT,
      unparsedCommitmentCount:
        bookingDocs.length - bookings.length + (courseDayDocs.length - courseDays.length),
    })
  ) {
    conflict(envelope, { resourceKind: 'instructor', reason: 'conflict' });
  }
}

export function createIdentityAdministrationCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Partial<CommandHandlerMap> {
  return {
    disable_account: (envelope, environment) =>
      accountLifecycleHandler(envelope, environment, executor, 'disabled'),
    enable_account: (envelope, environment) =>
      accountLifecycleHandler(envelope, environment, executor, 'active'),
    archive_participant: (envelope, environment) =>
      participantLifecycleHandler(envelope, environment, executor, 'archived'),
    reactivate_participant: (envelope, environment) =>
      participantLifecycleHandler(envelope, environment, executor, 'active'),
    assign_participant_management_as_administrator: (envelope, environment) =>
      assignAsAdministratorHandler(envelope, environment, executor),
    create_managed_dependent_participant: (envelope, environment) =>
      createManagedDependentHandler(envelope, environment, executor),
    change_account_role: (envelope, environment) =>
      changeAccountRoleHandler(envelope, environment, executor),
    update_account_contact_as_administrator: (envelope, environment) =>
      updateAccountContactHandler(envelope, environment, executor),
    create_instructor_catalog_entry: (envelope, environment) =>
      createInstructorCatalogHandler(envelope, environment, executor),
    update_instructor_catalog_profile: (envelope, environment) =>
      updateInstructorCatalogHandler(envelope, environment, executor),
    deactivate_instructor_catalog: (envelope, environment) =>
      instructorAvailabilityHandler(envelope, environment, executor, false),
    reactivate_instructor_catalog: (envelope, environment) =>
      instructorAvailabilityHandler(envelope, environment, executor, true),
    link_account_instructor_catalog: (envelope, environment) =>
      linkInstructorCatalogHandler(envelope, environment, executor),
    unlink_account_instructor_catalog: (envelope, environment) =>
      unlinkInstructorCatalogHandler(envelope, environment, executor),
    repair_participant_management_owner_guard: (envelope, environment) =>
      repairOwnerGuardHandler(envelope, environment, executor),
  };
}

function accountLifecycleHandler<Kind extends 'disable_account' | 'enable_account'>(
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  nextStatus: 'active' | 'disabled'
): Promise<CommandResult<Kind>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const targetPath = accountPath(envelope.intent.accountId);
  let targetAccount!: Account;
  let targetProfile: Record<string, unknown> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

      const targetRead = await session.tx.get({ path: targetPath });
      session.plan.planRead({ path: targetPath, category: 'aggregate' });
      const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
      if (!parsed) {
        conflict(envelope, { resourceKind: 'account', reason: 'conflict' });
      }
      targetAccount = parsed;
      targetProfile = targetRead.data;
      if (nextStatus === 'disabled') {
        const linkedInstructorId =
          typeof targetProfile?.instructorId === 'string' ? targetProfile.instructorId : undefined;
        let linkedInstructorAvailable = false;
        if (linkedInstructorId) {
          const catalogPath = instructorCatalogPath(linkedInstructorId as InstructorId);
          const catalogRead = await session.tx.get({ path: catalogPath });
          session.plan.planRead({ path: catalogPath, category: 'authorization_check' });
          const catalog = parseCatalogEntry(
            linkedInstructorId,
            catalogRead.exists ? catalogRead.data : undefined
          );
          linkedInstructorAvailable = catalog?.isAvailable === true;
        }
        const disableDecision = evaluateDisableAccount({
          targetSystemRole: readSystemRole(targetProfile),
          linkedInstructorAvailable,
        });
        if (disableDecision !== 'allowed') {
          forbidden(envelope, {
            field: 'accountId',
            reason: 'conflict',
          });
        }
        if (targetAccount.lifecycle.status !== 'active') {
          conflict(envelope);
        }
      } else if (targetAccount.lifecycle.status !== 'disabled') {
        conflict(envelope);
      }
      session.plan.planMutation({
        path: targetPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
      });
    },
    planAuditOutbox: async () =>
      buildIdentityAdminAuditPlan({
        envelope,
        summary: nextStatus === 'disabled' ? 'Account disabled' : 'Account enabled',
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
        primary: { kind: 'account', id: envelope.intent.accountId },
        affectedSubjects: [canonicalReference('account', envelope.intent.accountId)],
        resultingRevisions: [
          {
            subject: canonicalReference('account', envelope.intent.accountId),
            revision: nextAggregateRevision(targetAccount.revision),
          },
        ],
        effectKind: 'participant_access_changed',
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const lifecycle =
        nextStatus === 'disabled'
          ? { status: 'disabled' as const, disabledAt: decidedAt }
          : { status: 'active' as const };
      session.tx.update(
        { path: targetPath },
        {
          lifecycle,
          revision: nextAggregateRevision(targetAccount.revision),
          updatedAt: decidedAt,
          audit: {
            ...targetAccount.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        }
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: targetPath }, requireExpectedRevision: true },
    handler,
  });
}

function participantLifecycleHandler<Kind extends 'archive_participant' | 'reactivate_participant'>(
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  nextStatus: 'active' | 'archived'
): Promise<CommandResult<Kind>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  let participantRecord!: Participant;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

      const participantRead = await session.tx.get({ path: participantDocumentPath });
      session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
      const parsed = parseParticipant(
        participantRead.exists ? participantRead.data : undefined
      );
      if (!parsed) {
        conflict(envelope, { resourceKind: 'participant', reason: 'conflict' });
      }
      participantRecord = parsed;
      if (nextStatus === 'archived') {
        if (participantRecord.lifecycle.status !== 'active') {
          conflict(envelope);
        }
        const bookingDocs = await session.tx.query({
          collection: 'bookings',
          where: {
            field: 'party.participantIds',
            op: 'array-contains',
            value: envelope.intent.participantId,
          },
          limit: PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT + 1,
        });
        session.plan.planRead({
          path: 'bookings/query_by_participant',
          category: 'authorization_check',
        });
        const enrollmentDocs = await session.tx.query({
          collection: 'course_enrollments',
          where: { field: 'participantId', op: '==', value: envelope.intent.participantId },
          limit: PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT + 1,
        });
        session.plan.planRead({
          path: 'course_enrollments/query_by_participant',
          category: 'authorization_check',
        });
        const bookings = bookingDocs
          .map((doc) => parseBooking(doc.data))
          .filter((booking): booking is NonNullable<typeof booking> => booking !== undefined);
        const enrollments = enrollmentDocs
          .map((doc) => parseCourseEnrollment(doc.data))
          .filter(
            (enrollment): enrollment is NonNullable<typeof enrollment> => enrollment !== undefined
          );
        if (
          participantArchiveBlockedByCommitments({
            bookings,
            enrollments,
            bookingScanCapped: bookingDocs.length > PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT,
            enrollmentScanCapped: enrollmentDocs.length > PARTICIPANT_ARCHIVE_COMMITMENT_SCAN_LIMIT,
            unparsedCommitmentCount:
              bookingDocs.length - bookings.length + (enrollmentDocs.length - enrollments.length),
          })
        ) {
          conflict(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }
      } else if (participantRecord.lifecycle.status !== 'archived') {
        conflict(envelope);
      }
      session.plan.planMutation({
        path: participantDocumentPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
      });
    },
    planAuditOutbox: async () =>
      buildIdentityAdminAuditPlan({
        envelope,
        summary: nextStatus === 'archived' ? 'Participant archived' : 'Participant reactivated',
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
        primary: { kind: 'participant', id: envelope.intent.participantId },
        affectedSubjects: [canonicalReference('participant', envelope.intent.participantId)],
        resultingRevisions: [
          {
            subject: canonicalReference('participant', envelope.intent.participantId),
            revision: nextAggregateRevision(participantRecord.revision),
          },
        ],
        effectKind: 'participant_access_changed',
      }),
    execute: async (session, context) => {
      const decidedAt = timestampFromDate(context.decidedAt);
      const lifecycle =
        nextStatus === 'archived'
          ? { status: 'archived' as const, archivedAt: decidedAt }
          : { status: 'active' as const };
      session.tx.update(
        { path: participantDocumentPath },
        {
          ...participantRecord,
          lifecycle,
          revision: nextAggregateRevision(participantRecord.revision),
          updatedAt: decidedAt,
          audit: {
            ...participantRecord.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        } as Record<string, unknown>
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: participantDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function assignAsAdministratorHandler(
  envelope: CommandEnvelope<'assign_participant_management_as_administrator'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'assign_participant_management_as_administrator'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  const managementDocumentPath = participantManagementPath(envelope.intent.participantManagementId);
  let targetAccount!: Account;
  let participantRecord!: Participant;
  let existingManagement: ReturnType<typeof parseParticipantManagement>;
  let plannedManagementRevision = AggregateRevisionSchema.parse(1);
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'assign_participant_management_as_administrator'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

        const targetRead = await session.tx.get({ path: accountPath(envelope.intent.accountId) });
        session.plan.planRead({
          path: accountPath(envelope.intent.accountId),
          category: 'authorization_check',
        });
        const parsedTarget = parseAccount(targetRead.exists ? targetRead.data : undefined);
        if (!parsedTarget) {
          conflict(envelope, { resourceKind: 'account', reason: 'conflict' });
        }
        targetAccount = parsedTarget;

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        participantRecord = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );

        const decision = evaluateAdminManagementAssignment({
          participantManagementKind: participantRecord.management.kind,
          initialManagementEligibleAccountId: participantRecord.initialManagementEligibleAccountId,
          targetAccountId: envelope.intent.accountId,
          targetAccountActive: targetAccount.lifecycle.status === 'active',
        });
        if (decision === 'already_managed') {
          throw new CanonicalCommandError('blocked_relationship', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        if (decision !== 'allowed') {
          forbidden(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }

        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
        existingManagement = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (existingManagement?.status === 'active') {
          throw new CanonicalCommandError('blocked_relationship', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        if (
          existingManagement?.status === 'ended' &&
          (existingManagement.accountId !== envelope.intent.accountId ||
            existingManagement.participantId !== envelope.intent.participantId)
        ) {
          forbidden(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }
        plannedManagementRevision = existingManagement
          ? nextAggregateRevision(existingManagement.revision)
          : AggregateRevisionSchema.parse(1);

        plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          participantId: envelope.intent.participantId,
          accountId: envelope.intent.accountId,
          participantManagementId: envelope.intent.participantManagementId,
          managementRevision: plannedManagementRevision,
        });

        session.plan.planMutation({
          path: managementDocumentPath,
          kind: existingManagement ? 'update' : 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
        });
        session.plan.planMutation({
          path: participantDocumentPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
        });
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Administrator assigned Participant management',
          reasonCode: 'participant_management',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'participant', id: envelope.intent.participantId },
          affectedSubjects: [
            canonicalReference('participant', envelope.intent.participantId),
            canonicalReference('participant_management', envelope.intent.participantManagementId),
            canonicalReference('account', envelope.intent.accountId),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('participant', envelope.intent.participantId),
              revision: nextAggregateRevision(participantRecord.revision),
            },
            {
              subject: canonicalReference(
                'participant_management',
                envelope.intent.participantManagementId
              ),
              revision: plannedManagementRevision,
            },
          ],
          effectKind: 'participant_access_changed',
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const audit = revisionAuditLink(envelope, metadata);
        const management: ParticipantManagement = {
          participantManagementId: envelope.intent.participantManagementId,
          accountId: envelope.intent.accountId,
          participantId: envelope.intent.participantId,
          role: 'owner',
          authority: 'parent_guardian',
          status: 'active',
          revision: plannedManagementRevision,
          createdAt: existingManagement?.createdAt ?? decidedAt,
          updatedAt: decidedAt,
          audit: existingManagement
            ? {
                ...existingManagement.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              }
            : audit,
        };
        const updatedParticipant: Participant = {
          ...participantRecord,
          management: {
            kind: 'managed',
            participantManagementId: envelope.intent.participantManagementId,
          },
          initialManagementEligibleAccountId: CANONICAL_FIELD_DELETE as unknown as Account['accountId'],
          revision: nextAggregateRevision(participantRecord.revision),
          updatedAt: decidedAt,
          audit: {
            ...participantRecord.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        };
        const managementWrite = {
          ...(management as Record<string, unknown>),
          ...(existingManagement?.status === 'ended'
            ? { endedAt: CANONICAL_FIELD_DELETE }
            : {}),
        };
        if (existingManagement) {
          session.tx.update({ path: managementDocumentPath }, managementWrite);
        } else {
          session.tx.create({ path: managementDocumentPath }, management as Record<string, unknown>);
        }
        session.tx.update(
          { path: participantDocumentPath },
          updatedParticipant as Record<string, unknown>
        );
        commitAcquireParticipantManagementActiveOwnerGuard(
          session,
          {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: context.decidedAt,
            participantId: envelope.intent.participantId,
            accountId: envelope.intent.accountId,
            participantManagementId: envelope.intent.participantManagementId,
            managementRevision: plannedManagementRevision,
          },
          plannedOwnerGuard.guard,
          plannedOwnerGuard.hadExisting
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: participantDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}

function createManagedDependentHandler(
  envelope: CommandEnvelope<'create_managed_dependent_participant'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_managed_dependent_participant'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  const managementDocumentPath = participantManagementPath(envelope.intent.participantManagementId);
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_managed_dependent_participant'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

        const targetRead = await session.tx.get({ path: accountPath(envelope.intent.accountId) });
        session.plan.planRead({
          path: accountPath(envelope.intent.accountId),
          category: 'authorization_check',
        });
        const parsedTarget = parseAccount(targetRead.exists ? targetRead.data : undefined);
        assertAccountActive(envelope, parsedTarget);

        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        if (participantRead.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }
        const managementRead = await session.tx.get({ path: managementDocumentPath });
        session.plan.planRead({ path: managementDocumentPath, category: 'aggregate' });
        if (managementRead.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'participant', reason: 'conflict' },
          });
        }

        plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          participantId: envelope.intent.participantId,
          accountId: envelope.intent.accountId,
          participantManagementId: envelope.intent.participantManagementId,
          managementRevision: AggregateRevisionSchema.parse(1),
        });
        session.plan.planMutation({
          path: participantDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
        });
        session.plan.planMutation({
          path: managementDocumentPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.managementBytes,
        });
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Administrator created managed dependent Participant',
          reasonCode: 'participant_management',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'participant', id: envelope.intent.participantId },
          affectedSubjects: [
            canonicalReference('participant', envelope.intent.participantId),
            canonicalReference('participant_management', envelope.intent.participantManagementId),
            canonicalReference('account', envelope.intent.accountId),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('participant', envelope.intent.participantId),
              revision: AggregateRevisionSchema.parse(1),
            },
            {
              subject: canonicalReference(
                'participant_management',
                envelope.intent.participantManagementId
              ),
              revision: AggregateRevisionSchema.parse(1),
            },
          ],
          effectKind: 'participant_access_changed',
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const audit = revisionAuditLink(envelope, metadata);
        const participant: Participant = {
          participantId: envelope.intent.participantId,
          displayName: envelope.intent.displayName,
          age: envelope.intent.age,
          skillLevel: envelope.intent.skillLevel,
          discipline: envelope.intent.discipline,
          ...(envelope.intent.instructorComment === undefined
            ? {}
            : { instructorComment: envelope.intent.instructorComment }),
          management: {
            kind: 'managed',
            participantManagementId: envelope.intent.participantManagementId,
          },
          lifecycle: { status: 'active' },
          revision: AggregateRevisionSchema.parse(1),
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        };
        const management: ParticipantManagement = {
          participantManagementId: envelope.intent.participantManagementId,
          accountId: envelope.intent.accountId,
          participantId: envelope.intent.participantId,
          role: 'owner',
          authority: 'parent_guardian',
          status: 'active',
          revision: AggregateRevisionSchema.parse(1),
          createdAt: decidedAt,
          updatedAt: decidedAt,
          audit,
        };
        session.tx.create({ path: participantDocumentPath }, participant as Record<string, unknown>);
        session.tx.create({ path: managementDocumentPath }, management as Record<string, unknown>);
        commitAcquireParticipantManagementActiveOwnerGuard(
          session,
          {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: context.decidedAt,
            participantId: envelope.intent.participantId,
            accountId: envelope.intent.accountId,
            participantManagementId: envelope.intent.participantManagementId,
            managementRevision: AggregateRevisionSchema.parse(1),
          },
          plannedOwnerGuard.guard,
          plannedOwnerGuard.hadExisting
        );
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

function changeAccountRoleHandler(
  envelope: CommandEnvelope<'change_account_role'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'change_account_role'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const targetPath = accountPath(envelope.intent.accountId);
  let targetAccount!: Account;
  let actorProfile: Record<string, unknown> | undefined;
  let targetProfile: Record<string, unknown> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'change_account_role'> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const actorPath = accountPath(actor.accountId);
      const actorRead = await session.tx.get({ path: actorPath });
      session.plan.planRead({ path: actorPath, category: 'authorization_check' });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
      actorProfile = actorRead.data;

      const targetRead = await session.tx.get({ path: targetPath });
      session.plan.planRead({ path: targetPath, category: 'aggregate' });
      const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
      if (!parsed) {
        conflict(envelope, { resourceKind: 'account', reason: 'conflict' });
      }
      targetAccount = parsed;
      targetProfile = targetRead.data;

      const decision = evaluateChangeAccountRole({
        actorSystemRole: readSystemRole(actorProfile),
        actorAccountId: actor.accountId,
        targetAccountId: envelope.intent.accountId,
        targetSystemRole: readSystemRole(targetProfile),
        nextRole: envelope.intent.role,
      });
      if (decision !== 'allowed') {
        forbidden(envelope, { field: 'role', reason: 'conflict' });
      }
      if (readAccountRole(targetProfile) === envelope.intent.role) {
        return;
      }
      session.plan.planMutation({
        path: targetPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
      });
    },
    planAuditOutbox: async () =>
      buildIdentityAdminAuditPlan({
        envelope,
        summary: `Account role set to ${envelope.intent.role}`,
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
        primary: { kind: 'account', id: envelope.intent.accountId },
        affectedSubjects: [canonicalReference('account', envelope.intent.accountId)],
        resultingRevisions: [
          {
            subject: canonicalReference('account', envelope.intent.accountId),
            revision: nextAggregateRevision(targetAccount.revision),
          },
        ],
        effectKind: 'outbox_obligation_created',
      }),
    execute: async (session, context) => {
      if (readAccountRole(targetProfile) === envelope.intent.role) {
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      }
      const decidedAt = timestampFromDate(context.decidedAt);
      session.tx.update(
        { path: targetPath },
        {
          role: envelope.intent.role,
          revision: nextAggregateRevision(targetAccount.revision),
          updatedAt: decidedAt,
          audit: {
            ...targetAccount.audit,
            lastChangedByCommandId: metadata.commandId,
            correlationId: metadata.correlationId,
          },
        }
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: targetPath }, requireExpectedRevision: true },
    handler,
  });
}

function readContactDisplayName(data: Record<string, unknown> | undefined): string {
  const value = data?.displayName;
  return typeof value === 'string' ? value.trim() : '';
}

function readContactPhoneNumber(data: Record<string, unknown> | undefined): string {
  const value = data?.phoneNumber;
  return typeof value === 'string' ? value.trim() : '';
}

function updateAccountContactHandler(
  envelope: CommandEnvelope<'update_account_contact_as_administrator'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_account_contact_as_administrator'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const targetPath = accountPath(envelope.intent.accountId);
  let targetAccount!: Account;
  let targetProfile: Record<string, unknown> | undefined;
  const nextDisplayName = envelope.intent.displayName.trim();
  const nextPhoneNumber = envelope.intent.phoneNumber?.trim() ?? '';

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_account_contact_as_administrator'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorPath = accountPath(actor.accountId);
        const actorRead = await session.tx.get({ path: actorPath });
        session.plan.planRead({ path: actorPath, category: 'authorization_check' });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

        const targetRead = await session.tx.get({ path: targetPath });
        session.plan.planRead({ path: targetPath, category: 'aggregate' });
        const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
        if (!parsed) {
          conflict(envelope, { resourceKind: 'account', reason: 'conflict' });
        }
        targetAccount = parsed;
        targetProfile = targetRead.data;
        if (
          readContactDisplayName(targetProfile) === nextDisplayName &&
          readContactPhoneNumber(targetProfile) === nextPhoneNumber
        ) {
          return;
        }
        session.plan.planMutation({
          path: targetPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
        });
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Account contact projection updated',
          reasonCode: 'manual_override',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'account', id: envelope.intent.accountId },
          affectedSubjects: [canonicalReference('account', envelope.intent.accountId)],
          resultingRevisions: [
            {
              subject: canonicalReference('account', envelope.intent.accountId),
              revision: nextAggregateRevision(targetAccount.revision),
            },
          ],
          effectKind: 'outbox_obligation_created',
        }),
      execute: async (session, context) => {
        if (
          readContactDisplayName(targetProfile) === nextDisplayName &&
          readContactPhoneNumber(targetProfile) === nextPhoneNumber
        ) {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }
        const decidedAt = timestampFromDate(context.decidedAt);
        session.tx.update(
          { path: targetPath },
          {
            displayName: nextDisplayName,
            phoneNumber: nextPhoneNumber,
            revision: nextAggregateRevision(targetAccount.revision),
            updatedAt: decidedAt,
            audit: {
              ...targetAccount.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: targetPath }, requireExpectedRevision: true },
    handler,
  });
}

function createInstructorCatalogHandler(
  envelope: CommandEnvelope<'create_instructor_catalog_entry'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_instructor_catalog_entry'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const catalogPath = instructorCatalogPath(envelope.intent.instructorId);
  const linkAccountId = envelope.intent.accountId;
  let targetAccount: Account | undefined;
  let targetProfile: Record<string, unknown> | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_instructor_catalog_entry'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
        const existing = await session.tx.get({ path: catalogPath });
        session.plan.planRead({ path: catalogPath, category: 'aggregate' });
        if (existing.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'instructor', reason: 'conflict' },
          });
        }
        session.plan.planMutation({
          path: catalogPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: 768,
        });
        if (linkAccountId) {
          const targetPath = accountPath(linkAccountId);
          const targetRead = await session.tx.get({ path: targetPath });
          session.plan.planRead({ path: targetPath, category: 'aggregate' });
          const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
          assertAccountActive(envelope, parsed);
          targetAccount = parsed!;
          targetProfile = targetRead.data;
          const existingInstructorId =
            typeof targetProfile?.instructorId === 'string'
              ? targetProfile.instructorId
              : undefined;
          if (existingInstructorId && existingInstructorId !== envelope.intent.instructorId) {
            throw new CanonicalCommandError('blocked_relationship', {
              correlationId: envelope.context.correlationId,
              details: { resourceKind: 'instructor', reason: 'conflict' },
            });
          }
          await assertInstructorReverseLinkAvailable(
            session,
            envelope,
            envelope.intent.instructorId,
            linkAccountId,
            undefined
          );
          session.plan.planMutation({
            path: targetPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
          });
        }
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: linkAccountId
            ? 'Instructor catalog entry created and linked to Account'
            : 'Instructor catalog entry created',
          reasonCode: 'manual_override',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'instructor', id: envelope.intent.instructorId },
          affectedSubjects: [
            canonicalReference('instructor', envelope.intent.instructorId),
            ...(linkAccountId ? [canonicalReference('account', linkAccountId)] : []),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('instructor', envelope.intent.instructorId),
              revision: AggregateRevisionSchema.parse(1),
            },
            ...(targetAccount && linkAccountId
              ? [
                  {
                    subject: canonicalReference('account', linkAccountId),
                    revision: nextAggregateRevision(targetAccount.revision),
                  },
                ]
              : []),
          ],
          effectKind: 'outbox_obligation_created',
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        session.tx.create(
          { path: catalogPath },
          {
            id: envelope.intent.instructorId,
            instructorId: envelope.intent.instructorId,
            name: envelope.intent.name,
            ...(envelope.intent.specialty === undefined ? {} : { specialty: envelope.intent.specialty }),
            ...(envelope.intent.languages === undefined ? {} : { languages: envelope.intent.languages }),
            ...(envelope.intent.experienceYears === undefined
              ? {}
              : { experienceYears: envelope.intent.experienceYears }),
            ...(envelope.intent.bio === undefined ? {} : { bio: envelope.intent.bio }),
            ...(envelope.intent.avatarUrl === undefined ? {} : { avatarUrl: envelope.intent.avatarUrl }),
            pricePerHourKZT: envelope.intent.pricePerHourKZT,
            ...(envelope.intent.phoneNumber === undefined
              ? {}
              : { phoneNumber: envelope.intent.phoneNumber }),
            ...(linkAccountId ? { linkedAccountId: linkAccountId } : {}),
            isAvailable: true,
            rating: 0,
            reviewsCount: 0,
            revision: 1,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            audit: revisionAuditLink(envelope, metadata),
          }
        );
        if (linkAccountId && targetAccount) {
          session.tx.update(
            { path: accountPath(linkAccountId) },
            {
              instructorId: envelope.intent.instructorId,
              isInstructor: true,
              revision: nextAggregateRevision(targetAccount.revision),
              updatedAt: decidedAt,
              audit: {
                ...targetAccount.audit,
                lastChangedByCommandId: metadata.commandId,
                correlationId: metadata.correlationId,
              },
            }
          );
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    ...(linkAccountId
      ? { revisionTarget: { ref: { path: accountPath(linkAccountId) }, requireExpectedRevision: true } }
      : {}),
    handler,
  });
}

function updateInstructorCatalogHandler(
  envelope: CommandEnvelope<'update_instructor_catalog_profile'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'update_instructor_catalog_profile'>> {
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const catalogPath = instructorCatalogPath(envelope.intent.instructorId);
  let current!: InstructorCatalogEntry;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'update_instructor_catalog_profile'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
        const existing = await session.tx.get({ path: catalogPath });
        session.plan.planRead({ path: catalogPath, category: 'aggregate' });
        const parsed = parseCatalogEntry(
          envelope.intent.instructorId,
          existing.exists ? existing.data : undefined
        );
        if (!parsed) {
          conflict(envelope, { resourceKind: 'instructor', reason: 'conflict' });
        }
        current = parsed;
        session.plan.planMutation({
          path: catalogPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: 768,
        });
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Instructor catalog profile updated',
          reasonCode: 'manual_override',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'instructor', id: envelope.intent.instructorId },
          affectedSubjects: [canonicalReference('instructor', envelope.intent.instructorId)],
          resultingRevisions: [
            {
              subject: canonicalReference('instructor', envelope.intent.instructorId),
              revision: nextAggregateRevision(current.revision),
            },
          ],
          effectKind: 'outbox_obligation_created',
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        session.tx.update(
          { path: catalogPath },
          {
            ...(envelope.intent.name === undefined ? {} : { name: envelope.intent.name }),
            ...(envelope.intent.specialty === undefined ? {} : { specialty: envelope.intent.specialty }),
            ...(envelope.intent.languages === undefined ? {} : { languages: envelope.intent.languages }),
            ...(envelope.intent.experienceYears === undefined
              ? {}
              : { experienceYears: envelope.intent.experienceYears }),
            ...(envelope.intent.bio === undefined ? {} : { bio: envelope.intent.bio }),
            ...(envelope.intent.avatarUrl === undefined ? {} : { avatarUrl: envelope.intent.avatarUrl }),
            ...(envelope.intent.pricePerHourKZT === undefined
              ? {}
              : { pricePerHourKZT: envelope.intent.pricePerHourKZT }),
            ...(envelope.intent.phoneNumber === undefined
              ? {}
              : { phoneNumber: envelope.intent.phoneNumber }),
            revision: nextAggregateRevision(current.revision),
            updatedAt: decidedAt,
          }
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: catalogPath }, requireExpectedRevision: true },
    handler,
  });
}

function instructorAvailabilityHandler<
  Kind extends 'deactivate_instructor_catalog' | 'reactivate_instructor_catalog',
>(
  envelope: CommandEnvelope<Kind>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  isAvailable: boolean
): Promise<CommandResult<Kind>> {
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const catalogPath = instructorCatalogPath(envelope.intent.instructorId);
  let current!: InstructorCatalogEntry;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<Kind> = {
    read: async (session) => {
      const actor = requireAccountActor(envelope);
      const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
      session.plan.planRead({ path: accountPath(actor.accountId), category: 'authorization_check' });
      assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
      const existing = await session.tx.get({ path: catalogPath });
      session.plan.planRead({ path: catalogPath, category: 'aggregate' });
      const parsed = parseCatalogEntry(
        envelope.intent.instructorId,
        existing.exists ? existing.data : undefined
      );
      if (!parsed) {
        conflict(envelope, { resourceKind: 'instructor', reason: 'conflict' });
      }
      current = parsed;
      if (isAvailable) {
        let linkedAccountLifecycle: 'active' | 'disabled' | 'uninitialized' | undefined;
        let linkedAccountId = current.linkedAccountId;
        if (!linkedAccountId) {
          const linkedAccounts = await session.tx.query({
            collection: 'users',
            where: {
              field: 'instructorId',
              op: '==',
              value: envelope.intent.instructorId,
            },
            limit: 1,
          });
          session.plan.planRead({
            path: 'users/query_by_instructorId',
            category: 'authorization_check',
          });
          const linkedPath = linkedAccounts[0]?.path;
          linkedAccountId = linkedPath
            ? (linkedPath.split('/')[1] as AccountId | undefined)
            : undefined;
        }
        if (linkedAccountId) {
          const linkedRead = await session.tx.get({ path: accountPath(linkedAccountId) });
          session.plan.planRead({
            path: accountPath(linkedAccountId),
            category: 'authorization_check',
          });
          const linkedAccount = parseAccount(linkedRead.exists ? linkedRead.data : undefined);
          linkedAccountLifecycle = linkedAccount?.lifecycle.status;
        }
        if (
          evaluateReactivateInstructorCatalog({ linkedAccountLifecycle }) !== 'allowed'
        ) {
          forbidden(envelope, {
            resourceKind: 'instructor',
            reason: 'conflict',
          });
        }
      }
      if (current.isAvailable === isAvailable) {
        return;
      }
      session.plan.planMutation({
        path: catalogPath,
        kind: 'update',
        category: 'aggregate',
        estimatedPayloadBytes: 768,
      });
    },
    planAuditOutbox: async () =>
      buildIdentityAdminAuditPlan({
        envelope,
        summary: isAvailable ? 'Instructor catalog reactivated' : 'Instructor catalog deactivated',
        reasonCode: 'manual_override',
        explanation: envelope.intent.reasonExplanation,
        primary: { kind: 'instructor', id: envelope.intent.instructorId },
        affectedSubjects: [canonicalReference('instructor', envelope.intent.instructorId)],
        resultingRevisions: [
          {
            subject: canonicalReference('instructor', envelope.intent.instructorId),
            revision: nextAggregateRevision(current.revision),
          },
        ],
        effectKind: 'outbox_obligation_created',
      }),
    execute: async (session, context) => {
      if (current.isAvailable === isAvailable) {
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      }
      const decidedAt = timestampFromDate(context.decidedAt);
      session.tx.update(
        { path: catalogPath },
        {
          isAvailable,
          revision: nextAggregateRevision(current.revision),
          updatedAt: decidedAt,
        }
      );
      return commandSuccessResult(envelope.kind, envelope.context.correlationId);
    },
  };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: catalogPath }, requireExpectedRevision: true },
    handler,
  });
}

function linkInstructorCatalogHandler(
  envelope: CommandEnvelope<'link_account_instructor_catalog'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'link_account_instructor_catalog'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const targetPath = accountPath(envelope.intent.accountId);
  const catalogPath = instructorCatalogPath(envelope.intent.instructorId);
  let targetAccount!: Account;
  let targetProfile: Record<string, unknown> | undefined;
  let catalog!: InstructorCatalogEntry;
  let alreadyLinked = false;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'link_account_instructor_catalog'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));

        const catalogRead = await session.tx.get({ path: catalogPath });
        session.plan.planRead({ path: catalogPath, category: 'aggregate' });
        const parsedCatalog = parseCatalogEntry(
          envelope.intent.instructorId,
          catalogRead.exists ? catalogRead.data : undefined
        );
        if (!parsedCatalog) {
          conflict(envelope, { resourceKind: 'instructor', reason: 'conflict' });
        }
        catalog = parsedCatalog;

        const targetRead = await session.tx.get({ path: targetPath });
        session.plan.planRead({ path: targetPath, category: 'aggregate' });
        const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
        assertAccountActive(envelope, parsed);
        targetAccount = parsed!;
        targetProfile = targetRead.data;
        const existingInstructorId =
          typeof targetProfile?.instructorId === 'string' ? targetProfile.instructorId : undefined;
        if (existingInstructorId && existingInstructorId !== envelope.intent.instructorId) {
          throw new CanonicalCommandError('blocked_relationship', {
            correlationId: envelope.context.correlationId,
            details: { resourceKind: 'instructor', reason: 'conflict' },
          });
        }
        alreadyLinked =
          existingInstructorId === envelope.intent.instructorId &&
          catalog.linkedAccountId === envelope.intent.accountId;
        if (!alreadyLinked) {
          await assertInstructorReverseLinkAvailable(
            session,
            envelope,
            envelope.intent.instructorId,
            envelope.intent.accountId,
            catalog.linkedAccountId
          );
          session.plan.planMutation({
            path: targetPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
          });
          session.plan.planMutation({
            path: catalogPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 768,
          });
        }
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Account linked to Instructor catalog',
          reasonCode: 'manual_override',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'account', id: envelope.intent.accountId },
          affectedSubjects: [
            canonicalReference('account', envelope.intent.accountId),
            canonicalReference('instructor', envelope.intent.instructorId),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('account', envelope.intent.accountId),
              revision: nextAggregateRevision(targetAccount.revision),
            },
            {
              subject: canonicalReference('instructor', envelope.intent.instructorId),
              revision: nextAggregateRevision(catalog.revision),
            },
          ],
          effectKind: 'outbox_obligation_created',
        }),
      execute: async (session, context) => {
        if (alreadyLinked) {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }
        const decidedAt = timestampFromDate(context.decidedAt);
        session.tx.update(
          { path: targetPath },
          {
            instructorId: envelope.intent.instructorId,
            isInstructor: true,
            revision: nextAggregateRevision(targetAccount.revision),
            updatedAt: decidedAt,
            audit: {
              ...targetAccount.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        );
        session.tx.update(
          { path: catalogPath },
          {
            linkedAccountId: envelope.intent.accountId,
            revision: nextAggregateRevision(catalog.revision),
            updatedAt: decidedAt,
          }
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: targetPath }, requireExpectedRevision: true },
    handler,
  });
}

function unlinkInstructorCatalogHandler(
  envelope: CommandEnvelope<'unlink_account_instructor_catalog'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'unlink_account_instructor_catalog'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const targetPath = accountPath(envelope.intent.accountId);
  const catalogPath = instructorCatalogPath(envelope.intent.instructorId);
  let targetAccount!: Account;
  let targetProfile: Record<string, unknown> | undefined;
  let catalog: InstructorCatalogEntry | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'unlink_account_instructor_catalog'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
        const targetRead = await session.tx.get({ path: targetPath });
        session.plan.planRead({ path: targetPath, category: 'aggregate' });
        const parsed = parseAccount(targetRead.exists ? targetRead.data : undefined);
        if (!parsed) {
          conflict(envelope, { resourceKind: 'account', reason: 'conflict' });
        }
        targetAccount = parsed;
        targetProfile = targetRead.data;
        if (targetProfile?.instructorId !== envelope.intent.instructorId) {
          conflict(envelope, { field: 'instructorId', reason: 'conflict' });
        }
        const catalogRead = await session.tx.get({ path: catalogPath });
        session.plan.planRead({ path: catalogPath, category: 'aggregate' });
        catalog = parseCatalogEntry(
          envelope.intent.instructorId,
          catalogRead.exists ? catalogRead.data : undefined
        );
        await assertNoOutstandingInstructorCommitments(
          session,
          envelope,
          envelope.intent.instructorId,
          environment.clock.decidedAt()
        );
        session.plan.planMutation({
          path: targetPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.accountBytes,
        });
        if (catalog) {
          session.plan.planMutation({
            path: catalogPath,
            kind: 'update',
            category: 'aggregate',
            estimatedPayloadBytes: 768,
          });
        }
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Account unlinked from Instructor catalog',
          reasonCode: 'manual_override',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'account', id: envelope.intent.accountId },
          affectedSubjects: [
            canonicalReference('account', envelope.intent.accountId),
            canonicalReference('instructor', envelope.intent.instructorId),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('account', envelope.intent.accountId),
              revision: nextAggregateRevision(targetAccount.revision),
            },
            ...(catalog
              ? [
                  {
                    subject: canonicalReference('instructor', envelope.intent.instructorId),
                    revision: nextAggregateRevision(catalog.revision),
                  },
                ]
              : []),
          ],
          effectKind: 'outbox_obligation_created',
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        session.tx.update(
          { path: targetPath },
          {
            instructorId: CANONICAL_FIELD_DELETE as unknown as string,
            isInstructor: false,
            revision: nextAggregateRevision(targetAccount.revision),
            updatedAt: decidedAt,
            audit: {
              ...targetAccount.audit,
              lastChangedByCommandId: metadata.commandId,
              correlationId: metadata.correlationId,
            },
          }
        );
        if (catalog) {
          session.tx.update(
            { path: catalogPath },
            {
              linkedAccountId: CANONICAL_FIELD_DELETE as unknown as string,
              isAvailable: false,
              revision: nextAggregateRevision(catalog.revision),
              updatedAt: decidedAt,
            }
          );
        }
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: targetPath }, requireExpectedRevision: true },
    handler,
  });
}

function repairOwnerGuardHandler(
  envelope: CommandEnvelope<'repair_participant_management_owner_guard'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'repair_participant_management_owner_guard'>> {
  const metadata = metadataFromEnvelope(envelope);
  requireAdmin(envelope);
  requireReason(envelope, envelope.intent.reasonExplanation);
  const participantDocumentPath = participantPath(envelope.intent.participantId);
  let participantRecord!: Participant;
  let managementRecord!: ParticipantManagement;
  let plannedOwnerGuard!: Awaited<
    ReturnType<typeof readAndPlanAcquireParticipantManagementActiveOwnerGuard>
  >;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'repair_participant_management_owner_guard'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const actorRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        assertAccountActive(envelope, parseAccount(actorRead.exists ? actorRead.data : undefined));
        const participantRead = await session.tx.get({ path: participantDocumentPath });
        session.plan.planRead({ path: participantDocumentPath, category: 'aggregate' });
        participantRecord = assertParticipantActive(
          envelope,
          parseParticipant(participantRead.exists ? participantRead.data : undefined)
        );
        if (participantRecord.management.kind !== 'managed') {
          conflict(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }
        const managementRead = await session.tx.get({
          path: participantManagementPath(participantRecord.management.participantManagementId),
        });
        session.plan.planRead({
          path: participantManagementPath(participantRecord.management.participantManagementId),
          category: 'aggregate',
        });
        const parsedManagement = parseParticipantManagement(
          managementRead.exists ? managementRead.data : undefined
        );
        if (
          !parsedManagement ||
          parsedManagement.status !== 'active' ||
          parsedManagement.participantId !== participantRecord.participantId
        ) {
          conflict(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }
        managementRecord = parsedManagement;
        const guardRead = await session.tx.get({
          path: participantManagementActiveOwnerPath(participantRecord.participantId),
        });
        session.plan.planRead({
          path: participantManagementActiveOwnerPath(participantRecord.participantId),
          category: 'authorization_check',
        });
        const existingGuard = parseActiveOwnerGuard(
          guardRead.exists ? guardRead.data : undefined
        );
        if (
          existingGuard &&
          existingGuard.accountId === managementRecord.accountId &&
          existingGuard.participantManagementId === managementRecord.participantManagementId &&
          existingGuard.managementRevision === managementRecord.revision
        ) {
          return;
        }
        if (
          existingGuard &&
          (existingGuard.accountId !== managementRecord.accountId ||
            existingGuard.participantManagementId !== managementRecord.participantManagementId)
        ) {
          conflict(envelope, { resourceKind: 'participant', reason: 'conflict' });
        }
        plannedOwnerGuard = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          participantId: participantRecord.participantId,
          accountId: managementRecord.accountId,
          participantManagementId: managementRecord.participantManagementId,
          managementRevision: managementRecord.revision,
        });
      },
      planAuditOutbox: async () =>
        buildIdentityAdminAuditPlan({
          envelope,
          summary: 'Participant management owner guard repaired',
          reasonCode: 'participant_management',
          explanation: envelope.intent.reasonExplanation,
          primary: { kind: 'participant', id: envelope.intent.participantId },
          affectedSubjects: [
            canonicalReference('participant', envelope.intent.participantId),
            canonicalReference(
              'participant_management',
              managementRecord.participantManagementId
            ),
          ],
          resultingRevisions: [
            {
              subject: canonicalReference('participant', envelope.intent.participantId),
              revision: participantRecord.revision,
            },
          ],
          effectKind: 'participant_access_changed',
        }),
      execute: async (session, context) => {
        if (!plannedOwnerGuard) {
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        }
        commitAcquireParticipantManagementActiveOwnerGuard(
          session,
          {
            correlationId: metadata.correlationId,
            commandId: metadata.commandId,
            decidedAt: context.decidedAt,
            participantId: participantRecord.participantId,
            accountId: managementRecord.accountId,
            participantManagementId: managementRecord.participantManagementId,
            managementRevision: managementRecord.revision,
          },
          plannedOwnerGuard.guard,
          plannedOwnerGuard.hadExisting
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: participantDocumentPath }, requireExpectedRevision: true },
    handler,
  });
}
