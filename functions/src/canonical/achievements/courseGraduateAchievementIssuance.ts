import {
  CanonicalCommandError,
  PARTICIPANT_ACHIEVEMENTS_MAX,
  courseGraduateAchievementIssuanceState,
  type CanonicalTimestamp,
  type CommandId,
  type CorrelationId,
  type CourseEnrollment,
  type ParticipantAchievements,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  PARTICIPANT_ACHIEVEMENTS_PLANNING_ESTIMATES,
  parseParticipantAchievements,
  participantAchievementsPath,
  toFirestoreWritePayload,
} from './participantAchievementsStore';

export interface PlannedCourseGraduateAchievementIssuance {
  readonly documentPath: string;
  readonly current: ParticipantAchievements | undefined;
  readonly planned: ParticipantAchievements;
  readonly shouldWrite: boolean;
}

export async function planCourseGraduateAchievementIssuance(
  session: CanonicalAtomicTransactionSession,
  input: {
    readonly previousEnrollment: CourseEnrollment;
    readonly plannedEnrollment: CourseEnrollment | undefined;
    readonly commandId: CommandId;
    readonly correlationId: CorrelationId;
    readonly now: CanonicalTimestamp;
  }
): Promise<PlannedCourseGraduateAchievementIssuance | undefined> {
  if (
    input.previousEnrollment.lifecycle.status === 'completed' ||
    input.plannedEnrollment?.lifecycle.status !== 'completed'
  ) {
    return undefined;
  }

  const documentPath = participantAchievementsPath(input.plannedEnrollment.participantId);
  const achievementsRead = await session.tx.get({ path: documentPath });
  session.plan.planRead({ path: documentPath, category: 'aggregate' });
  const current = parseParticipantAchievements(
    achievementsRead.exists ? achievementsRead.data : undefined
  );
  if (achievementsRead.exists && !current) {
    throw new CanonicalCommandError('internal', {
      correlationId: input.correlationId,
    });
  }

  const state = courseGraduateAchievementIssuanceState({
    enrollment: input.plannedEnrollment,
    current,
    commandId: input.commandId,
    correlationId: input.correlationId,
    now: input.now,
  });
  if (!state) return undefined;
  if (Object.keys(state.planned.earned).length > PARTICIPANT_ACHIEVEMENTS_MAX) {
    throw new CanonicalCommandError('validation', {
      correlationId: input.correlationId,
      details: { field: 'earned', reason: 'conflict' },
    });
  }
  if (state.shouldWrite) {
    session.plan.planMutation({
      path: documentPath,
      kind: current ? 'update' : 'create',
      category: 'aggregate',
      estimatedPayloadBytes: PARTICIPANT_ACHIEVEMENTS_PLANNING_ESTIMATES.achievementsBytes,
    });
  }
  return {
    documentPath,
    current,
    planned: state.planned,
    shouldWrite: state.shouldWrite,
  };
}

export function commitPlannedCourseGraduateAchievementIssuance(
  session: CanonicalAtomicTransactionSession,
  planned: PlannedCourseGraduateAchievementIssuance | undefined
): void {
  if (!planned?.shouldWrite) return;
  const payload = toFirestoreWritePayload(planned.planned as Record<string, unknown>);
  if (planned.current) {
    session.tx.update({ path: planned.documentPath }, payload);
  } else {
    session.tx.create({ path: planned.documentPath }, payload);
  }
}
