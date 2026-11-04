import {
  selfParticipantIdFromAccountId,
  type AccountId,
  type ProgressionConfig,
} from '@ski-academy/shared-domain';

/** Remove active pins only; completion evidence and the other participants stay intact. */
export function removeMasteredTodaySkills(
  profile: Record<string, unknown>,
  accountId: AccountId,
  participantId: string,
  scores: Readonly<Record<string, number>>,
  config: ProgressionConfig
): Record<string, unknown> | undefined {
  const checklists = (profile.participantTodayChecklists ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const hasEntry = Object.hasOwn(checklists, participantId);
  // Match the existing self-only compatibility read. Never write the flat fields.
  if (!hasEntry && participantId !== selfParticipantIdFromAccountId(accountId)) return;
  const checklist = hasEntry ? checklists[participantId] : profile;
  const ids = checklist?.todaySkillItemIds;
  if (!Array.isArray(ids)) return;
  const masteredIds = new Set(
    config.items
      .filter((item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints)
      .map((item) => item.id)
  );
  const remaining = ids.filter((id) => !masteredIds.has(id));
  if (remaining.length === ids.length) return;
  const next = hasEntry
    ? { ...checklist }
    : Object.fromEntries(
        ['customTodayTasks', 'completedTodayTaskIds', 'completedTodayDate', 'dismissedTodayTaskIds']
          .filter((key) => profile[key] !== undefined)
          .map((key) => [key, profile[key]])
      );
  return {
    participantTodayChecklists: {
      ...checklists,
      [participantId]: { ...next, todaySkillItemIds: remaining },
    },
  };
}
