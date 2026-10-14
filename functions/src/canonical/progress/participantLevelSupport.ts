import {
  CanonicalCommandError,
  DEFAULT_SKILL_CONFIG,
  canonicalScopeFields,
  calculateParticipantStage,
  type CommandEnvelope,
  type ParticipantProgress,
  type ProgressionConfig,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  type Participant,
  identityDocumentMatchesReadScope,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';
import {
  parseAccount,
  parseParticipantManagement,
  participantManagementPath,
  accountPath,
} from '../participantAccess/participantAccessStore';

export async function readProgressionConfig(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope
): Promise<ProgressionConfig> {
  const path = 'settings/skill_config';
  const read = await session.tx.get({ path });
  session.plan.planRead({ path, category: 'aggregate' });
  if (!read.exists) return DEFAULT_SKILL_CONFIG;
  const data = read.data ?? {};
  const passPercentage = data.passPercentage ?? DEFAULT_SKILL_CONFIG.passPercentage;
  const items = data.items;
  if (
    typeof passPercentage !== 'number' ||
    !Number.isFinite(passPercentage) ||
    passPercentage <= 0 ||
    passPercentage > 100 ||
    !Array.isArray(items) ||
    items.length > 128 ||
    items.some(
      (item) =>
        !item ||
        typeof item.id !== 'string' ||
        !Number.isInteger(item.levelTarget) ||
        item.levelTarget < 1 ||
        item.levelTarget > 3 ||
        !Number.isInteger(item.maxPoints) ||
        item.maxPoints <= 0 ||
        item.maxPoints > 100
    ) ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'skill_config', reason: 'malformed' },
    });
  }
  return { passPercentage, items };
}

export function stageProgressEvent(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  previous: ParticipantProgress | undefined,
  next: ParticipantProgress,
  config: ProgressionConfig,
  reason?: unknown
): () => void {
  const path = `participant_progress_events/${next.participantId}_${next.revision}`;
  session.plan.planMutation({
    path,
    kind: 'create',
    category: 'aggregate',
    estimatedPayloadBytes: 32768,
  });
  const before = calculateParticipantStage(
    previous?.level ?? 1,
    previous?.skillScores ?? {},
    config
  );
  const after = calculateParticipantStage(next.level, next.skillScores, config);
  return () =>
    session.tx.create(
      { path },
      {
        ...canonicalScopeFields(session.scope ?? LIVE_CANONICAL_EXECUTION_SCOPE),
        participantId: next.participantId,
        commandId: next.audit.lastChangedByCommandId,
        actor: envelope.context.actor,
        at: next.updatedAt,
        revision: next.revision,
        kind: envelope.kind,
        oldLevel: previous?.level ?? 1,
        newLevel: next.level,
        oldScores: previous?.skillScores ?? {},
        newScores: next.skillScores,
        oldComments: previous?.skillComments ?? {},
        newComments: next.skillComments,
        thresholdReached: !before.ready && after.ready,
        stage: { ...after, nextLevel: after.nextLevel ?? null },
        config: {
          passPercentage: config.passPercentage,
          items: config.items.map(({ id, levelTarget, maxPoints }) => ({
            id,
            levelTarget,
            maxPoints,
          })),
        },
        ...(previous?.levelState ? { previousLevelState: previous.levelState } : {}),
        ...(next.levelState ? { levelState: next.levelState } : {}),
        ...(reason ? { reason } : {}),
      }
    );
}

/** Preserve the existing self-participant activity feed for actual level changes. */
export async function prepareLevelActivity(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  participant: Participant,
  previous: ParticipantProgress | undefined,
  next: ParticipantProgress
): Promise<() => void> {
  if (next.level === (previous?.level ?? 1) || participant.management.kind !== 'managed')
    return () => undefined;
  const managementPath = participantManagementPath(participant.management.participantManagementId);
  const managementDoc = await session.tx.get({ path: managementPath });
  session.plan.planRead({ path: managementPath, category: 'authorization_check' });
  const management = parseParticipantManagement(managementDoc.data);
  if (
    !management ||
    management.status !== 'active' ||
    management.authority !== 'self' ||
    management.participantId !== next.participantId
  )
    return () => undefined;
  const recipientPath = accountPath(management.accountId);
  const recipientDoc = await session.tx.get({ path: recipientPath });
  session.plan.planRead({ path: recipientPath, category: 'authorization_check' });
  const scope = session.scope ?? LIVE_CANONICAL_EXECUTION_SCOPE;
  if (
    parseAccount(recipientDoc.data)?.lifecycle.status !== 'active' ||
    !identityDocumentMatchesReadScope(scope, recipientDoc.data ?? {}) ||
    (scope.dataScope === 'test' && recipientDoc.data?.dataScope !== 'test')
  )
    return () => undefined;
  const path = `activity_logs/act_level_${next.audit.lastChangedByCommandId}`;
  session.plan.planMutation({
    path,
    kind: 'create',
    category: 'aggregate',
    estimatedPayloadBytes: 4096,
  });
  return () =>
    session.tx.create(
      { path },
      {
        ...canonicalScopeFields(scope),
        userId: management.accountId,
        actorId: envelope.context.actor.kind === 'account' ? envelope.context.actor.accountId : '',
        type: next.level > (previous?.level ?? 1) ? 'level_up' : 'level_changed',
        timestamp: new Date(next.updatedAt.seconds * 1000).toISOString(),
        metadata: {
          participantId: next.participantId,
          oldLevel: previous?.level ?? 1,
          newLevel: next.level,
          pointsDelta: 0,
          method: next.levelState?.method ?? 'admin_assignment',
        },
      }
    );
}
