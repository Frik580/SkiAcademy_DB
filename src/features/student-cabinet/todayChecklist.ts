import { CustomTodayTask, UserProfile, type ParticipantTodayChecklistState } from '../../types';
import {
  buildParticipantTodayChecklistUpdate,
  normalizeParticipantTodayChecklist,
  resolveParticipantTodayChecklist,
} from './participantTodayChecklist';

export const skillTodayTaskId = (skillItemId: string) => `skill:${skillItemId}`;
export const customTodayTaskId = (customId: string) => `custom:${customId}`;

export const createCustomTodayTaskId = () =>
  `ct_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const toTodayDateStr = () => new Date().toISOString().split('T')[0];

export const resolveCompletedTodayTaskIds = (profile: UserProfile): string[] => {
  const today = toTodayDateStr();
  if (profile.completedTodayDate !== today) return [];
  return profile.completedTodayTaskIds ?? [];
};

export const toggleStringList = (list: string[] | undefined, value: string, include: boolean) => {
  const set = new Set(list ?? []);
  if (include) set.add(value);
  else set.delete(value);
  return Array.from(set);
};

const commitChecklist = (
  profile: UserProfile,
  participantId: string,
  next: ParticipantTodayChecklistState
): Partial<UserProfile> =>
  buildParticipantTodayChecklistUpdate(
    profile,
    participantId,
    normalizeParticipantTodayChecklist(next)
  );

export const buildToggleSkillTodayUpdate = (
  profile: UserProfile,
  participantId: string,
  skillItemId: string,
  pinned: boolean
): Partial<UserProfile> => {
  const current = resolveParticipantTodayChecklist(profile, participantId);
  return commitChecklist(profile, participantId, {
    ...current,
    todaySkillItemIds: toggleStringList(current.todaySkillItemIds, skillItemId, pinned),
  });
};

export const buildPinSkillsTodayUpdate = (
  profile: UserProfile,
  participantId: string,
  skillItemIds: string[]
): Partial<UserProfile> => {
  const current = resolveParticipantTodayChecklist(profile, participantId);
  const set = new Set(current.todaySkillItemIds ?? []);
  skillItemIds.forEach((id) => set.add(id));
  return commitChecklist(profile, participantId, {
    ...current,
    todaySkillItemIds: Array.from(set),
  });
};

export const getNewlyPinnedSkillTitles = (
  profile: UserProfile,
  participantId: string,
  skillItemIds: string[],
  items: { id: string; title: string }[]
): string[] => {
  const pinned = new Set(
    resolveParticipantTodayChecklist(profile, participantId).todaySkillItemIds ?? []
  );
  return skillItemIds
    .filter((id) => !pinned.has(id))
    .map((id) => items.find((item) => item.id === id)?.title)
    .filter((title): title is string => Boolean(title));
};

export const buildToggleTodayCompleteUpdate = (
  profile: UserProfile,
  participantId: string,
  taskId: string,
  done: boolean
): Partial<UserProfile> => {
  const current = resolveParticipantTodayChecklist(profile, participantId);
  const today = toTodayDateStr();
  const currentIds =
    current.completedTodayDate === today ? (current.completedTodayTaskIds ?? []) : [];
  return commitChecklist(profile, participantId, {
    ...current,
    completedTodayDate: today,
    completedTodayTaskIds: toggleStringList(currentIds, taskId, done),
  });
};

export const buildAddCustomTodayTaskUpdate = (
  profile: UserProfile,
  participantId: string,
  text: string
): Partial<UserProfile> | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const current = resolveParticipantTodayChecklist(profile, participantId);
  const task: CustomTodayTask = { id: createCustomTodayTaskId(), text: trimmed };
  return commitChecklist(profile, participantId, {
    ...current,
    customTodayTasks: [...(current.customTodayTasks ?? []), task],
  });
};

export type TodayTaskRef = {
  id: string;
  kind: 'recommendation' | 'skill' | 'custom';
  skillItemId?: string;
  customTaskId?: string;
};

export const buildRemoveTodayTaskUpdate = (
  profile: UserProfile,
  participantId: string,
  task: TodayTaskRef
): Partial<UserProfile> => {
  const current = resolveParticipantTodayChecklist(profile, participantId);
  const completedTodayTaskIds = (current.completedTodayTaskIds ?? []).filter(
    (id) => id !== task.id
  );

  if (task.kind === 'custom' && task.customTaskId) {
    return commitChecklist(profile, participantId, {
      ...current,
      customTodayTasks: (current.customTodayTasks ?? []).filter((t) => t.id !== task.customTaskId),
      completedTodayTaskIds,
    });
  }

  if (task.kind === 'skill' && task.skillItemId) {
    return commitChecklist(profile, participantId, {
      ...current,
      todaySkillItemIds: (current.todaySkillItemIds ?? []).filter((id) => id !== task.skillItemId),
      completedTodayTaskIds,
    });
  }

  if (task.kind === 'recommendation') {
    return commitChecklist(profile, participantId, {
      ...current,
      dismissedTodayTaskIds: toggleStringList(current.dismissedTodayTaskIds, task.id, true),
    });
  }

  return {};
};
