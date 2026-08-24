import {
  ActiveCourseEnrollmentGuardSchema,
  CanonicalCommandError,
  ParticipantManagementActiveOwnerGuardSchema,
  assertDistinctActiveCourseEnrollmentGuard,
  buildActiveCourseEnrollmentGuard,
  canonicalPaths,
  nextAggregateRevision,
  readAggregateRevision,
  RESOURCE_CLAIM_PLANNING_ESTIMATES,
  timestampFromDate,
  type ActiveCourseEnrollmentGuard,
  type CommandId,
  type CorrelationId,
  type CourseEnrollmentId,
  type CourseId,
  type ParticipantId,
  type ParticipantManagementActiveOwnerGuard,
  type AccountId,
  type ParticipantManagementId,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';

export interface UniquenessGuardCommandMetadata {
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly decidedAt: Date;
}

export interface AcquireActiveCourseEnrollmentGuardInput extends UniquenessGuardCommandMetadata {
  readonly participantId: ParticipantId;
  readonly courseId: CourseId;
  readonly courseEnrollmentId: CourseEnrollmentId;
}

export interface MoveActiveCourseEnrollmentGuardInput extends UniquenessGuardCommandMetadata {
  readonly participantId: ParticipantId;
  readonly oldCourseId: CourseId;
  readonly newCourseId: CourseId;
  readonly courseEnrollmentId: CourseEnrollmentId;
}

export interface ReleaseActiveCourseEnrollmentGuardInput extends UniquenessGuardCommandMetadata {
  readonly participantId: ParticipantId;
  readonly courseId: CourseId;
  readonly courseEnrollmentId: CourseEnrollmentId;
}

export interface AcquireParticipantManagementActiveOwnerGuardInput extends UniquenessGuardCommandMetadata {
  readonly participantId: ParticipantId;
  readonly accountId: AccountId;
  readonly participantManagementId: ParticipantManagementId;
  readonly managementRevision: number;
}

export interface ReleaseParticipantManagementActiveOwnerGuardInput extends UniquenessGuardCommandMetadata {
  readonly participantId: ParticipantId;
}

interface PlannedEnrollmentGuardWrite {
  readonly path: string;
  readonly mutationKind: 'create' | 'update' | 'delete';
  readonly guard: ActiveCourseEnrollmentGuard | undefined;
}

interface PlannedActiveOwnerGuardWrite {
  readonly path: string;
  readonly mutationKind: 'create' | 'update' | 'delete';
  readonly guard: ParticipantManagementActiveOwnerGuard | undefined;
}

function parseActiveCourseEnrollmentGuard(
  data: Record<string, unknown> | undefined
): ActiveCourseEnrollmentGuard | undefined {
  if (!data) {
    return undefined;
  }
  const parsed = ActiveCourseEnrollmentGuardSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

function parseActiveOwnerGuard(
  data: Record<string, unknown> | undefined
): ParticipantManagementActiveOwnerGuard | undefined {
  if (!data) {
    return undefined;
  }
  const parsed = ParticipantManagementActiveOwnerGuardSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

function applyEnrollmentGuardWrite(
  session: CanonicalAtomicTransactionSession,
  write: PlannedEnrollmentGuardWrite
): void {
  if (write.mutationKind === 'delete') {
    session.tx.delete({ path: write.path });
    return;
  }
  session.tx[write.mutationKind]({ path: write.path }, write.guard as Record<string, unknown>);
}

function applyActiveOwnerGuardWrite(
  session: CanonicalAtomicTransactionSession,
  write: PlannedActiveOwnerGuardWrite
): void {
  if (write.mutationKind === 'delete') {
    session.tx.delete({ path: write.path });
    return;
  }
  session.tx[write.mutationKind]({ path: write.path }, write.guard as Record<string, unknown>);
}

export async function readAndPlanAcquireActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireActiveCourseEnrollmentGuardInput
): Promise<{ readonly guard: ActiveCourseEnrollmentGuard; readonly hadExisting: boolean }> {
  const path = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.courseId)
    .slice(1);
  session.plan.planRead({ path, category: 'enrollment_guard' });
  const snapshot = await session.tx.get({ path });
  const existing = snapshot.exists ? parseActiveCourseEnrollmentGuard(snapshot.data) : undefined;

  assertDistinctActiveCourseEnrollmentGuard(
    input.correlationId,
    existing,
    input.courseEnrollmentId
  );

  if (existing && existing.courseEnrollmentId === input.courseEnrollmentId) {
    return { guard: existing, hadExisting: true };
  }

  const decidedAt = timestampFromDate(input.decidedAt);
  const guard = buildActiveCourseEnrollmentGuard({
    participantId: input.participantId,
    courseId: input.courseId,
    courseEnrollmentId: input.courseEnrollmentId,
    revision: existing ? nextAggregateRevision(existing.revision) : 1,
    createdAt: existing?.createdAt ?? decidedAt,
    updatedAt: decidedAt,
    lastChangedByCommandId: input.commandId,
    correlationId: input.correlationId,
  });

  const mutationKind = existing ? 'update' : 'create';
  session.plan.planMutation({
    path,
    kind: mutationKind,
    category: 'enrollment_guard',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeEnrollmentGuardBytes,
  });

  return { guard, hadExisting: existing !== undefined };
}

export function commitAcquireActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireActiveCourseEnrollmentGuardInput,
  guard: ActiveCourseEnrollmentGuard,
  existingBeforeWrite: boolean
): void {
  const path = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.courseId)
    .slice(1);
  const mutationKind = existingBeforeWrite ? 'update' : 'create';
  applyEnrollmentGuardWrite(session, {
    path,
    mutationKind,
    guard,
  });
}

export async function acquireActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireActiveCourseEnrollmentGuardInput
): Promise<ActiveCourseEnrollmentGuard> {
  const planned = await readAndPlanAcquireActiveCourseEnrollmentGuard(session, input);
  if (session.tx.phase === 'writes') {
    commitAcquireActiveCourseEnrollmentGuard(
      session,
      input,
      planned.guard,
      planned.hadExisting
    );
  }
  return planned.guard;
}

export async function moveActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: MoveActiveCourseEnrollmentGuardInput
): Promise<ActiveCourseEnrollmentGuard> {
  const oldPath = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.oldCourseId)
    .slice(1);
  const newPath = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.newCourseId)
    .slice(1);

  session.plan.planRead({ path: oldPath, category: 'enrollment_guard' });
  session.plan.planRead({ path: newPath, category: 'enrollment_guard' });

  const [oldSnapshot, newSnapshot] = await Promise.all([
    session.tx.get({ path: oldPath }),
    session.tx.get({ path: newPath }),
  ]);

  const existingOld = oldSnapshot.exists
    ? parseActiveCourseEnrollmentGuard(oldSnapshot.data)
    : undefined;
  const existingNew = newSnapshot.exists
    ? parseActiveCourseEnrollmentGuard(newSnapshot.data)
    : undefined;

  if (existingOld && existingOld.courseEnrollmentId !== input.courseEnrollmentId) {
    throw new CanonicalCommandError('duplicate_active_enrollment', {
      correlationId: input.correlationId,
    });
  }

  assertDistinctActiveCourseEnrollmentGuard(
    input.correlationId,
    existingNew,
    input.courseEnrollmentId
  );

  const decidedAt = timestampFromDate(input.decidedAt);
  const guard = buildActiveCourseEnrollmentGuard({
    participantId: input.participantId,
    courseId: input.newCourseId,
    courseEnrollmentId: input.courseEnrollmentId,
    revision: existingNew ? nextAggregateRevision(existingNew.revision) : 1,
    createdAt: existingNew?.createdAt ?? decidedAt,
    updatedAt: decidedAt,
    lastChangedByCommandId: input.commandId,
    correlationId: input.correlationId,
  });

  if (existingOld) {
    session.plan.planMutation({
      path: oldPath,
      kind: 'delete',
      category: 'enrollment_guard',
      estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeEnrollmentGuardBytes,
    });
  }

  const newMutationKind = existingNew ? 'update' : 'create';
  session.plan.planMutation({
    path: newPath,
    kind: newMutationKind,
    category: 'enrollment_guard',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeEnrollmentGuardBytes,
  });

  if (session.tx.phase === 'writes') {
    if (existingOld) {
      session.tx.delete({ path: oldPath });
    }
    if (newMutationKind === 'create') {
      session.tx.create({ path: newPath }, guard as Record<string, unknown>);
    } else {
      session.tx.update({ path: newPath }, guard as Record<string, unknown>);
    }
  }

  return guard;
}

export async function readAndPlanReleaseActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseActiveCourseEnrollmentGuardInput
): Promise<boolean> {
  const path = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.courseId)
    .slice(1);
  session.plan.planRead({ path, category: 'enrollment_guard' });
  const snapshot = await session.tx.get({ path });
  const existing = snapshot.exists ? parseActiveCourseEnrollmentGuard(snapshot.data) : undefined;

  if (!existing || existing.courseEnrollmentId !== input.courseEnrollmentId) {
    return false;
  }

  session.plan.planMutation({
    path,
    kind: 'delete',
    category: 'enrollment_guard',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeEnrollmentGuardBytes,
  });
  return true;
}

export function commitReleaseActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseActiveCourseEnrollmentGuardInput
): void {
  const path = canonicalPaths
    .activeCourseEnrollmentGuard(input.participantId, input.courseId)
    .slice(1);
  session.tx.delete({ path });
}

export async function releaseActiveCourseEnrollmentGuard(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseActiveCourseEnrollmentGuardInput
): Promise<void> {
  const shouldDelete = await readAndPlanReleaseActiveCourseEnrollmentGuard(session, input);
  if (shouldDelete && session.tx.phase === 'writes') {
    commitReleaseActiveCourseEnrollmentGuard(session, input);
  }
}

export async function readAndPlanAcquireParticipantManagementActiveOwnerGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireParticipantManagementActiveOwnerGuardInput
): Promise<{
  readonly guard: ParticipantManagementActiveOwnerGuard;
  readonly hadExisting: boolean;
}> {
  const path = canonicalPaths.participantManagementActiveOwner(input.participantId).slice(1);
  session.plan.planRead({ path, category: 'authorization_check' });
  const snapshot = await session.tx.get({ path });
  const existing = snapshot.exists ? parseActiveOwnerGuard(snapshot.data) : undefined;

  if (
    existing &&
    (existing.accountId !== input.accountId ||
      existing.participantManagementId !== input.participantManagementId)
  ) {
    throw new CanonicalCommandError('blocked_relationship', {
      correlationId: input.correlationId,
      details: { reason: 'conflict', resourceKind: 'participant' },
    });
  }

  if (
    existing &&
    existing.accountId === input.accountId &&
    existing.participantManagementId === input.participantManagementId &&
    existing.managementRevision === input.managementRevision
  ) {
    return { guard: existing, hadExisting: true };
  }

  const decidedAt = timestampFromDate(input.decidedAt);
  const guard = ParticipantManagementActiveOwnerGuardSchema.parse({
    participantId: input.participantId,
    accountId: input.accountId,
    participantManagementId: input.participantManagementId,
    managementRevision: input.managementRevision,
    updatedAt: decidedAt,
    lastChangedByCommandId: input.commandId,
    correlationId: input.correlationId,
  });

  const mutationKind = existing ? 'update' : 'create';
  session.plan.planMutation({
    path,
    kind: mutationKind,
    category: 'authorization_check',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeOwnerGuardBytes,
  });

  return { guard, hadExisting: existing !== undefined };
}

export function commitAcquireParticipantManagementActiveOwnerGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireParticipantManagementActiveOwnerGuardInput,
  guard: ParticipantManagementActiveOwnerGuard,
  hadExisting: boolean
): void {
  const path = canonicalPaths.participantManagementActiveOwner(input.participantId).slice(1);
  applyActiveOwnerGuardWrite(session, {
    path,
    mutationKind: hadExisting ? 'update' : 'create',
    guard,
  });
}

export async function acquireParticipantManagementActiveOwnerGuard(
  session: CanonicalAtomicTransactionSession,
  input: AcquireParticipantManagementActiveOwnerGuardInput
): Promise<ParticipantManagementActiveOwnerGuard> {
  const planned = await readAndPlanAcquireParticipantManagementActiveOwnerGuard(session, input);
  if (session.tx.phase === 'writes') {
    commitAcquireParticipantManagementActiveOwnerGuard(
      session,
      input,
      planned.guard,
      planned.hadExisting
    );
  }
  return planned.guard;
}

export async function releaseParticipantManagementActiveOwnerGuard(
  session: CanonicalAtomicTransactionSession,
  input: ReleaseParticipantManagementActiveOwnerGuardInput
): Promise<void> {
  const path = canonicalPaths.participantManagementActiveOwner(input.participantId).slice(1);
  session.plan.planRead({ path, category: 'authorization_check' });
  const snapshot = await session.tx.get({ path });

  if (!snapshot.exists) {
    return;
  }

  session.plan.planMutation({
    path,
    kind: 'delete',
    category: 'authorization_check',
    estimatedPayloadBytes: RESOURCE_CLAIM_PLANNING_ESTIMATES.activeOwnerGuardBytes,
  });

  if (session.tx.phase === 'writes') {
    session.tx.delete({ path });
  }
}

export function readManagementRevision(
  data: Record<string, unknown> | undefined
): number | undefined {
  return readAggregateRevision(data);
}
