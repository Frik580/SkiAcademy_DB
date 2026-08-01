import { CustomTodayTask, UserProfile } from '../types';

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

export const buildToggleSkillTodayUpdate = (
  profile: UserProfile,
  skillItemId: string,
  pinned: boolean
): Partial<UserProfile> => ({
  todaySkillItemIds: toggleStringList(profile.todaySkillItemIds, skillItemId, pinned),
});

export const buildPinSkillsTodayUpdate = (
  profile: UserProfile,
  skillItemIds: string[]
): Partial<UserProfile> => {
  const set = new Set(profile.todaySkillItemIds ?? []);
  skillItemIds.forEach((id) => set.add(id));
  return { todaySkillItemIds: Array.from(set) };
};

export const getNewlyPinnedSkillTitles = (
  profile: UserProfile,
  skillItemIds: string[],
  items: { id: string; title: string }[]
): string[] =>
  skillItemIds
    .filter((id) => !(profile.todaySkillItemIds ?? []).includes(id))
    .map((id) => items.find((item) => item.id === id)?.title)
    .filter((title): title is string => Boolean(title));

export const buildToggleTodayCompleteUpdate = (
  profile: UserProfile,
  taskId: string,
  done: boolean
): Partial<UserProfile> => {
  const today = toTodayDateStr();
  const currentIds =
    profile.completedTodayDate === today ? (profile.completedTodayTaskIds ?? []) : [];
  return {
    completedTodayDate: today,
    completedTodayTaskIds: toggleStringList(currentIds, taskId, done),
  };
};

export const buildAddCustomTodayTaskUpdate = (
  profile: UserProfile,
  text: string
): Partial<UserProfile> | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const task: CustomTodayTask = { id: createCustomTodayTaskId(), text: trimmed };
  return {
    customTodayTasks: [...(profile.customTodayTasks ?? []), task],
  };
};

export type TodayTaskRef = {
  id: string;
  kind: 'recommendation' | 'skill' | 'custom';
  skillItemId?: string;
  customTaskId?: string;
};

export const buildRemoveTodayTaskUpdate = (
  profile: UserProfile,
  task: TodayTaskRef
): Partial<UserProfile> => {
  const completedTodayTaskIds = (profile.completedTodayTaskIds ?? []).filter(
    (id) => id !== task.id
  );

  if (task.kind === 'custom' && task.customTaskId) {
    return {
      customTodayTasks: (profile.customTodayTasks ?? []).filter((t) => t.id !== task.customTaskId),
      completedTodayTaskIds,
    };
  }

  if (task.kind === 'skill' && task.skillItemId) {
    return {
      todaySkillItemIds: (profile.todaySkillItemIds ?? []).filter((id) => id !== task.skillItemId),
      completedTodayTaskIds,
    };
  }

  if (task.kind === 'recommendation') {
    return {
      dismissedTodayTaskIds: toggleStringList(profile.dismissedTodayTaskIds, task.id, true),
    };
  }

  return {};
};
