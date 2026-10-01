import type { CustomTodayTask, ParticipantTodayChecklistState, UserProfile } from '../../types';
import { resolveSelfParticipantIdFromAccount } from '../participant-progress/applyParticipantProgressToProfile';

export const emptyParticipantTodayChecklist = (): ParticipantTodayChecklistState => ({
  todaySkillItemIds: [],
  customTodayTasks: [],
  completedTodayTaskIds: [],
  dismissedTodayTaskIds: [],
});

const copyCustomTasks = (tasks: CustomTodayTask[] | undefined): CustomTodayTask[] =>
  (tasks ?? [])
    .filter((task) => typeof task?.id === 'string' && typeof task?.text === 'string')
    .map((task) => ({ id: task.id, text: task.text }));

export const normalizeParticipantTodayChecklist = (
  state: ParticipantTodayChecklistState | undefined
): ParticipantTodayChecklistState => {
  const normalized: ParticipantTodayChecklistState = {
    todaySkillItemIds: [...(state?.todaySkillItemIds ?? [])],
    customTodayTasks: copyCustomTasks(state?.customTodayTasks),
    completedTodayTaskIds: [...(state?.completedTodayTaskIds ?? [])],
    dismissedTodayTaskIds: [...(state?.dismissedTodayTaskIds ?? [])],
  };
  if (state?.completedTodayDate) {
    normalized.completedTodayDate = state.completedTodayDate;
  }
  return normalized;
};

export const isSelfParticipantForAccount = (accountId: string, participantId: string): boolean => {
  const selfId = resolveSelfParticipantIdFromAccount(accountId);
  return selfId !== undefined && selfId === participantId;
};

const legacyAccountTodayChecklist = (profile: UserProfile): ParticipantTodayChecklistState =>
  normalizeParticipantTodayChecklist({
    todaySkillItemIds: profile.todaySkillItemIds,
    customTodayTasks: profile.customTodayTasks,
    completedTodayTaskIds: profile.completedTodayTaskIds,
    completedTodayDate: profile.completedTodayDate,
    dismissedTodayTaskIds: profile.dismissedTodayTaskIds,
  });

/**
 * Checklist for exactly one Participant.
 * Self may read legacy account fields only while that participant has no map entry.
 * Any other participant with no entry is empty. Never inherits another participant.
 */
export const resolveParticipantTodayChecklist = (
  profile: UserProfile,
  participantId: string | undefined
): ParticipantTodayChecklistState => {
  if (!participantId) return emptyParticipantTodayChecklist();
  const checklists = profile.participantTodayChecklists;
  if (checklists && Object.prototype.hasOwnProperty.call(checklists, participantId)) {
    return normalizeParticipantTodayChecklist(checklists[participantId]);
  }
  if (isSelfParticipantForAccount(profile.uid, participantId)) {
    return legacyAccountTodayChecklist(profile);
  }
  return emptyParticipantTodayChecklist();
};

/**
 * Presentational overlay. Flat Today fields become the selected participant's
 * checklist. Account wallet, identity, and preferences are left unchanged.
 */
export const applyParticipantTodayChecklistToProfile = (
  profile: UserProfile,
  participantId: string | undefined
): UserProfile => {
  const checklist = resolveParticipantTodayChecklist(profile, participantId);
  return {
    ...profile,
    todaySkillItemIds: checklist.todaySkillItemIds,
    customTodayTasks: checklist.customTodayTasks,
    completedTodayTaskIds: checklist.completedTodayTaskIds,
    completedTodayDate: checklist.completedTodayDate,
    dismissedTodayTaskIds: checklist.dismissedTodayTaskIds,
  };
};

export const buildParticipantTodayChecklistUpdate = (
  profile: UserProfile,
  participantId: string,
  next: ParticipantTodayChecklistState
): Partial<UserProfile> => ({
  participantTodayChecklists: {
    ...(profile.participantTodayChecklists ?? {}),
    [participantId]: normalizeParticipantTodayChecklist(next),
  },
});
