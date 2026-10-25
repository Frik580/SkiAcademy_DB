import { create } from 'zustand';
import { UserProfile, ActivityLog } from '../../types';
import { logger } from '../../shared';
import { canManageAdminRoles } from '../../lib/accessControl';
import {
  buildAddCustomTodayTaskUpdate,
  buildPinSkillsTodayUpdate,
  buildRemoveTodayTaskUpdate,
  buildToggleSkillTodayUpdate,
  buildToggleTodayCompleteUpdate,
  getNewlyPinnedSkillTitles,
  type TodayTaskRef,
} from '../student-cabinet/todayChecklist';
import type { SkillItem } from '../../domain/achievements';
import { notify, t } from '../../store/storeContext';
import { QUERY_LIMITS } from '../../shared';
import { useCabinetProgressParticipantSelectionStore } from '../student-cabinet/cabinetProgressParticipantSelectionStore';
import {
  updateUserProfileService,
  updateUserRoleService,
  addUserService,
  updateUserDataWithoutMoneyService,
  dismissReviewService,
  updateParticipantTodayChecklistService,
} from './profileService';

export interface ProfileState {
  userProfile: UserProfile | null;
  /** True while a signed-in session awaits the first profile snapshot. */
  profileLoading: boolean;
  usersList: UserProfile[];
  dismissedReviewIds: string[];
  activityLogs: ActivityLog[];
  usersPageSize: number;
  usersHasMore: boolean;
  activityLogsPageSize: number;
  activityLogsHasMore: boolean;

  setUserProfile: (profile: UserProfile | null) => void;
  setProfileLoading: (loading: boolean) => void;
  syncUserProfileFromSnapshot: (profile: UserProfile | null) => void;
  setUsersList: (users: UserProfile[]) => void;
  setDismissedReviewIds: (ids: string[]) => void;
  setActivityLogs: (logs: ActivityLog[]) => void;
  setUsersHasMore: (hasMore: boolean) => void;
  setActivityLogsHasMore: (hasMore: boolean) => void;
  loadMoreUsers: () => void;
  loadMoreActivityLogs: () => void;
  resetUsersPagination: () => void;
  resetActivityLogsPagination: () => void;
  resetProfileState: () => void;

  handleUpdateProfile: (updatedData: Partial<UserProfile>) => Promise<void>;
  handleUpdateUserRole: (targetUid: string, newRole: 'admin' | 'user') => Promise<void>;
  handleAddUser: (newUser: UserProfile) => Promise<void>;
  handleUpdateUser: (updatedUser: UserProfile) => Promise<void>;
  handleDismissReview: (bookingId: string) => Promise<void>;
  handleToggleSkillToday: (skillItemId: string, pinned: boolean) => Promise<void>;
  handlePinSkillsToday: (skillItemIds: string[], skillItems: SkillItem[]) => Promise<void>;
  handleToggleTodayTaskComplete: (taskId: string, done: boolean) => Promise<void>;
  handleAddCustomTodayTask: (text: string) => Promise<void>;
  handleRemoveTodayTask: (task: TodayTaskRef) => Promise<void>;
}

const selectedTodayParticipantId = (): string | undefined =>
  useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId;

export const useProfileStore = create<ProfileState>((set, get) => ({
  userProfile: null,
  profileLoading: false,
  usersList: [],
  dismissedReviewIds: [],
  activityLogs: [],
  usersPageSize: QUERY_LIMITS.users,
  usersHasMore: false,
  activityLogsPageSize: QUERY_LIMITS.activityLogs,
  activityLogsHasMore: false,

  setUserProfile: (profile) => set({ userProfile: profile }),
  setProfileLoading: (loading) => set({ profileLoading: loading }),
  syncUserProfileFromSnapshot: (profile) => set({ userProfile: profile, profileLoading: false }),
  setUsersList: (users) => set({ usersList: users }),
  setDismissedReviewIds: (ids) => set({ dismissedReviewIds: ids }),
  setActivityLogs: (logs) => set({ activityLogs: logs }),
  setUsersHasMore: (usersHasMore) => set({ usersHasMore }),
  setActivityLogsHasMore: (activityLogsHasMore) => set({ activityLogsHasMore }),
  loadMoreUsers: () => set((s) => ({ usersPageSize: s.usersPageSize + QUERY_LIMITS.users })),
  loadMoreActivityLogs: () =>
    set((s) => ({ activityLogsPageSize: s.activityLogsPageSize + QUERY_LIMITS.activityLogs })),
  resetUsersPagination: () => set({ usersPageSize: QUERY_LIMITS.users, usersHasMore: false }),
  resetActivityLogsPagination: () =>
    set({ activityLogsPageSize: QUERY_LIMITS.activityLogs, activityLogsHasMore: false }),
  resetProfileState: () =>
    set({
      userProfile: null,
      profileLoading: false,
      usersList: [],
      dismissedReviewIds: [],
      activityLogs: [],
    }),

  handleUpdateProfile: async (updatedData) => {
    const { userProfile } = get();
    if (!userProfile) return;
    try {
      await updateUserProfileService(userProfile.uid, updatedData, userProfile.instructorId);
    } catch (err) {
      logger.error('Profile update failed:', err);
      throw err;
    }
  },

  handleUpdateUserRole: async (targetUid, newRole) => {
    const { userProfile } = get();
    if (!canManageAdminRoles(userProfile)) {
      notify('error', t('accessDenied'), t('accessDeniedDesc'));
      return;
    }
    await updateUserRoleService(targetUid, newRole);
    notify('success', t('roleUpdated'), `${t('roleUpdatedDescPrefix')} ${newRole}.`);
  },

  handleAddUser: async (newUser) => {
    await addUserService(newUser);
  },

  handleUpdateUser: async (updatedUser) => {
    await updateUserDataWithoutMoneyService(updatedUser);
  },

  handleDismissReview: async (bookingId) => {
    const { userProfile, dismissedReviewIds } = get();
    const userId = userProfile?.uid;
    if (!userId) return;

    const updated = Array.from(new Set([...dismissedReviewIds, bookingId]));
    set({ dismissedReviewIds: updated });
    localStorage.setItem(`alpine_glide_dismissed_reviews_${userId}`, JSON.stringify(updated));

    await dismissReviewService(userId, bookingId);
  },

  handleToggleSkillToday: async (skillItemId, pinned) => {
    const { userProfile } = get();
    const participantId = selectedTodayParticipantId();
    if (!userProfile || !participantId) return;
    const updated = buildToggleSkillTodayUpdate(userProfile, participantId, skillItemId, pinned);
    await commitParticipantTodayChecklist(set, get, userProfile, participantId, updated);
  },

  handlePinSkillsToday: async (skillItemIds, skillItems) => {
    const { userProfile } = get();
    const participantId = selectedTodayParticipantId();
    if (!userProfile || !participantId || skillItemIds.length === 0) return;
    const addedTitles = getNewlyPinnedSkillTitles(
      userProfile,
      participantId,
      skillItemIds,
      skillItems
    );
    const updated = buildPinSkillsTodayUpdate(userProfile, participantId, skillItemIds);
    await commitParticipantTodayChecklist(set, get, userProfile, participantId, updated);
    if (addedTitles.length === 0) return;
    notify(
      'success',
      t('scRadarTasksAddedTitle'),
      addedTitles.map((title) => `• ${title}`).join('\n')
    );
  },

  handleToggleTodayTaskComplete: async (taskId, done) => {
    const { userProfile } = get();
    const participantId = selectedTodayParticipantId();
    if (!userProfile || !participantId) return;
    const updated = buildToggleTodayCompleteUpdate(userProfile, participantId, taskId, done);
    await commitParticipantTodayChecklist(set, get, userProfile, participantId, updated);
  },

  handleAddCustomTodayTask: async (text) => {
    const { userProfile } = get();
    const participantId = selectedTodayParticipantId();
    if (!userProfile || !participantId) return;
    const updated = buildAddCustomTodayTaskUpdate(userProfile, participantId, text);
    if (!updated) return;
    await commitParticipantTodayChecklist(set, get, userProfile, participantId, updated);
  },

  handleRemoveTodayTask: async (task) => {
    const { userProfile } = get();
    const participantId = selectedTodayParticipantId();
    if (!userProfile || !participantId) return;
    const updated = buildRemoveTodayTaskUpdate(userProfile, participantId, task);
    await commitParticipantTodayChecklist(set, get, userProfile, participantId, updated);
  },
}));

async function commitParticipantTodayChecklist(
  set: (partial: Partial<ProfileState> | ((state: ProfileState) => Partial<ProfileState>)) => void,
  get: () => ProfileState,
  previousProfile: NonNullable<ProfileState['userProfile']>,
  participantId: string,
  updated: Partial<UserProfile>
): Promise<void> {
  const checklist = updated.participantTodayChecklists?.[participantId];
  if (!checklist) return;
  set({
    userProfile: {
      ...previousProfile,
      participantTodayChecklists: {
        ...(previousProfile.participantTodayChecklists ?? {}),
        [participantId]: checklist,
      },
    },
  });
  try {
    await updateParticipantTodayChecklistService(previousProfile.uid, participantId, checklist);
  } catch (err) {
    const current = get().userProfile;
    if (current?.participantTodayChecklists?.[participantId] === checklist) {
      set({ userProfile: previousProfile });
    }
    logger.error('Participant today checklist update failed:', err);
    throw err;
  }
}
