import {
  AdministrativeAvailabilityBlockSchema,
  AggregateRevisionSchema,
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  commandSuccessResult,
  nextAggregateRevision,
  resolveBookingScheduleFromCalendarInput,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type AdministrativeAvailabilityBlock,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import { requireAccountActor } from '../participantAccess/participantAccessAuthorization';
import { accountPath, parseAccount } from '../finance/financeStore';
import { instructorCatalogPath, parseInstructorCatalog } from '../bookings/bookingStore';
import { commitResourceClaimPlan } from '../resourceClaims/resourceClaimEngine';
import {
  administrativeAvailabilityBlockClaimIdentity,
  planAcquireAdministrativeAvailabilityBlockClaim,
  replacementIgnoreForAdministrativeAvailabilityBlock,
} from './administrativeAvailabilityBlockClaims';
import {
  buildCreateAdministrativeAvailabilityBlockAuditPlan,
  buildReleaseAdministrativeAvailabilityBlockAuditPlan,
  buildRescheduleAdministrativeAvailabilityBlockAuditPlan,
} from './administrativeAvailabilityBlockAudit';
import {
  ADMINISTRATIVE_BLOCK_PLANNING_ESTIMATES,
  administrativeAvailabilityBlockPath,
  parseAdministrativeAvailabilityBlock,
  toFirestoreWritePayload,
} from './administrativeAvailabilityBlockStore';
import { readAndPlanReleaseResourceClaim } from '../resourceClaims/resourceClaimEngine';

type AvailabilityBlockKind = Extract<
  CommandKind,
  | 'create_administrative_availability_block'
  | 'reschedule_administrative_availability_block'
  | 'release_administrative_availability_block'
>;

function metadataFromEnvelope(envelope: CommandEnvelope) {
  const identity = resolveCommandIdempotencyIdentity(envelope);
  return {
    commandId: identity.commandKey,
    correlationId: envelope.context.correlationId,
  };
}

function assertAdminAvailabilityAuthorization(
  envelope: CommandEnvelope<AvailabilityBlockKind>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (!administratorCapabilityExercisedByAccount(envelope.context)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  requireAccountActor(envelope);
}

function assertScheduleContext(
  envelope: CommandEnvelope<
    'create_administrative_availability_block' | 'reschedule_administrative_availability_block'
  >
): void {
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
}

function createAdministrativeAvailabilityBlockHandler(
  envelope: CommandEnvelope<'create_administrative_availability_block'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'create_administrative_availability_block'>> {
  assertAdminAvailabilityAuthorization(envelope);
  assertScheduleContext(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const blockPath = administrativeAvailabilityBlockPath(envelope.intent.blockId);
  const instructorPath = instructorCatalogPath(envelope.intent.instructorId);
  const plannedRevision = AggregateRevisionSchema.parse(1);
  let claimPlan!: Awaited<ReturnType<typeof planAcquireAdministrativeAvailabilityBlockClaim>>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'create_administrative_availability_block'> =
    {
      read: async (session) => {
        const actor = requireAccountActor(envelope);
        const accountRead = await session.tx.get({ path: accountPath(actor.accountId) });
        session.plan.planRead({
          path: accountPath(actor.accountId),
          category: 'authorization_check',
        });
        if (!parseAccount(accountRead.exists ? accountRead.data : undefined)) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }

        const blockRead = await session.tx.get({ path: blockPath });
        session.plan.planRead({ path: blockPath, category: 'aggregate' });
        if (blockRead.exists) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'blockId', reason: 'conflict' },
          });
        }

        const instructorRead = await session.tx.get({ path: instructorPath });
        session.plan.planRead({ path: instructorPath, category: 'aggregate' });
        const instructor = parseInstructorCatalog(
          envelope.intent.instructorId,
          instructorRead.exists ? instructorRead.data : undefined
        );
        if (!instructor) {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'instructorId', reason: 'required' },
          });
        }

        schedule = resolveBookingScheduleFromCalendarInput(
          envelope.context.calendarInput!,
          envelope.context.timezone!
        );
        claimPlan = await planAcquireAdministrativeAvailabilityBlockClaim(session, {
          blockId: envelope.intent.blockId,
          instructorId: envelope.intent.instructorId,
          scheduleRevision: plannedRevision,
          interval: schedule.interval,
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
        });
        session.plan.planMutation({
          path: blockPath,
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: ADMINISTRATIVE_BLOCK_PLANNING_ESTIMATES.blockBytes,
        });
      },
      planAuditOutbox: async () =>
        buildCreateAdministrativeAvailabilityBlockAuditPlan({
          envelope,
          blockId: envelope.intent.blockId,
          instructorId: envelope.intent.instructorId,
          revision: plannedRevision,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const block = AdministrativeAvailabilityBlockSchema.parse({
          blockId: envelope.intent.blockId,
          instructorId: envelope.intent.instructorId,
          kind: envelope.intent.kind,
          interval: schedule.interval,
          timeZone: envelope.context.timezone!,
          ...(envelope.intent.notes ? { notes: envelope.intent.notes } : {}),
          lifecycle: 'active',
          scheduleRevision: plannedRevision,
          revision: plannedRevision,
          createdAt: decidedAt,
          updatedAt: decidedAt,
        });
        commitResourceClaimPlan(session, claimPlan, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        });
        session.tx.create({ path: blockPath }, toFirestoreWritePayload(block));
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

function rescheduleAdministrativeAvailabilityBlockHandler(
  envelope: CommandEnvelope<'reschedule_administrative_availability_block'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'reschedule_administrative_availability_block'>> {
  assertAdminAvailabilityAuthorization(envelope);
  assertScheduleContext(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const blockPath = administrativeAvailabilityBlockPath(envelope.intent.blockId);
  let existing!: AdministrativeAvailabilityBlock;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let plannedScheduleRevision = AggregateRevisionSchema.parse(1);
  let releasePlan!: Awaited<ReturnType<typeof readAndPlanReleaseResourceClaim>>;
  let acquirePlan!: Awaited<ReturnType<typeof planAcquireAdministrativeAvailabilityBlockClaim>>;
  let schedule!: ReturnType<typeof resolveBookingScheduleFromCalendarInput>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'reschedule_administrative_availability_block'> =
    {
      read: async (session) => {
        const blockRead = await session.tx.get({ path: blockPath });
        session.plan.planRead({ path: blockPath, category: 'aggregate' });
        const parsed = parseAdministrativeAvailabilityBlock(
          blockRead.exists ? blockRead.data : undefined
        );
        if (!parsed || parsed.lifecycle !== 'active') {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'blockId', reason: 'conflict' },
          });
        }
        existing = parsed;
        plannedRevision = nextAggregateRevision(existing.revision);
        plannedScheduleRevision = nextAggregateRevision(existing.scheduleRevision);
        schedule = resolveBookingScheduleFromCalendarInput(
          envelope.context.calendarInput!,
          envelope.context.timezone!
        );
        const oldIdentity = administrativeAvailabilityBlockClaimIdentity({
          blockId: existing.blockId,
          instructorId: existing.instructorId,
          scheduleRevision: existing.scheduleRevision,
        });
        releasePlan = await readAndPlanReleaseResourceClaim(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          claimId: oldIdentity.claimId,
        });
        acquirePlan = await planAcquireAdministrativeAvailabilityBlockClaim(session, {
          blockId: existing.blockId,
          instructorId: existing.instructorId,
          scheduleRevision: plannedScheduleRevision,
          interval: schedule.interval,
          replacementIgnore: replacementIgnoreForAdministrativeAvailabilityBlock(existing),
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
        });
        session.plan.planMutation({
          path: blockPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: ADMINISTRATIVE_BLOCK_PLANNING_ESTIMATES.blockBytes,
        });
      },
      planAuditOutbox: async () =>
        buildRescheduleAdministrativeAvailabilityBlockAuditPlan({
          envelope,
          blockId: existing.blockId,
          instructorId: existing.instructorId,
          revision: plannedRevision,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        commitResourceClaimPlan(session, releasePlan, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        });
        commitResourceClaimPlan(session, acquirePlan, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        });
        session.tx.update(
          { path: blockPath },
          toFirestoreWritePayload({
            ...existing,
            interval: schedule.interval,
            timeZone: envelope.context.timezone!,
            scheduleRevision: plannedScheduleRevision,
            revision: plannedRevision,
            updatedAt: decidedAt,
          })
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: blockPath }, requireExpectedRevision: true },
    handler,
  });
}

function releaseAdministrativeAvailabilityBlockHandler(
  envelope: CommandEnvelope<'release_administrative_availability_block'>,
  environment: CommandExecutionEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'release_administrative_availability_block'>> {
  assertAdminAvailabilityAuthorization(envelope);
  const metadata = metadataFromEnvelope(envelope);
  const blockPath = administrativeAvailabilityBlockPath(envelope.intent.blockId);
  let existing!: AdministrativeAvailabilityBlock;
  let plannedRevision = AggregateRevisionSchema.parse(1);
  let releasePlan!: Awaited<ReturnType<typeof readAndPlanReleaseResourceClaim>>;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'release_administrative_availability_block'> =
    {
      read: async (session) => {
        const blockRead = await session.tx.get({ path: blockPath });
        session.plan.planRead({ path: blockPath, category: 'aggregate' });
        const parsed = parseAdministrativeAvailabilityBlock(
          blockRead.exists ? blockRead.data : undefined
        );
        if (!parsed || parsed.lifecycle !== 'active') {
          throw new CanonicalCommandError('validation', {
            correlationId: envelope.context.correlationId,
            details: { field: 'blockId', reason: 'conflict' },
          });
        }
        existing = parsed;
        plannedRevision = nextAggregateRevision(existing.revision);
        const identity = administrativeAvailabilityBlockClaimIdentity({
          blockId: existing.blockId,
          instructorId: existing.instructorId,
          scheduleRevision: existing.scheduleRevision,
        });
        releasePlan = await readAndPlanReleaseResourceClaim(session, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: environment.clock.decidedAt(),
          claimId: identity.claimId,
        });
        session.plan.planMutation({
          path: blockPath,
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: ADMINISTRATIVE_BLOCK_PLANNING_ESTIMATES.blockBytes,
        });
      },
      planAuditOutbox: async () =>
        buildReleaseAdministrativeAvailabilityBlockAuditPlan({
          envelope,
          blockId: existing.blockId,
          instructorId: existing.instructorId,
          revision: plannedRevision,
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        commitResourceClaimPlan(session, releasePlan, {
          correlationId: metadata.correlationId,
          commandId: metadata.commandId,
          decidedAt: context.decidedAt,
        });
        session.tx.update(
          { path: blockPath },
          toFirestoreWritePayload({
            ...existing,
            lifecycle: 'released',
            revision: plannedRevision,
            updatedAt: decidedAt,
          })
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    revisionTarget: { ref: { path: blockPath }, requireExpectedRevision: true },
    handler,
  });
}

export function createAdministrativeAvailabilityBlockCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): CommandHandlerMap {
  return {
    create_administrative_availability_block: (envelope, environment) =>
      createAdministrativeAvailabilityBlockHandler(envelope, environment, executor),
    reschedule_administrative_availability_block: (envelope, environment) =>
      rescheduleAdministrativeAvailabilityBlockHandler(envelope, environment, executor),
    release_administrative_availability_block: (envelope, environment) =>
      releaseAdministrativeAvailabilityBlockHandler(envelope, environment, executor),
  };
}
