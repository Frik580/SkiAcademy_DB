import { create } from 'zustand';
import { UserProfile, ActivityLog } from '../../types';
import { logger } from '../../lib/logger';
import { canManageAdminRoles } from '../../lib/accessControl';
import {
  buildAddCustomTodayTaskUpdate,
  buildPinSkillsTodayUpdate,
  buildRemoveTodayTaskUpdate,
  buildToggleSkillTodayUpdate,
  buildToggleTodayCompleteUpdate,
  getNewlyPinnedSkillTitles,
  type TodayTaskRef,
} from '../../lib/todayChecklist';
import type { SkillItem } from '../../lib/skillData';
import { notify, t } from '../../store/storeContext';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import {
  updateUserProfileService,
  updateUserRoleService,
  addUserService,
  updateUserDataWithLedgerService,
  deleteUserService,
  dismissReviewService,
} from './profileService';

export interface ProfileState {
  userProfile: UserProfile | null;
  usersList: UserProfile[];
  dismissedReviewIds: string[];
  activityLogs: ActivityLog[];
  usersPageSize: number;
  usersHasMore: boolean;
  activityLogsPageSize: number;
  activityLogsHasMore: boolean;

  setUserProfile: (profile: UserProfile | null) => void;
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
  handleDeleteUser: (targetUid: string) => Promise<void>;
  handleCompleteOnboarding: () => Promise<void>;
  handleDismissReview: (bookingId: string) => Promise<void>;
  handleToggleSkillToday: (skillItemId: string, pinned: boolean) => Promise<void>;
  handlePinSkillsToday: (skillItemIds: string[], skillItems: SkillItem[]) => Promise<void>;
  handleToggleTodayTaskComplete: (taskId: string, done: boolean) => Promise<void>;
  handleAddCustomTodayTask: (text: string) => Promise<void>;
  handleRemoveTodayTask: (task: TodayTaskRef) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  userProfile: null,
  usersList: [],
  dismissedReviewIds: [],
  activityLogs: [],
  usersPageSize: QUERY_LIMITS.users,
  usersHasMore: false,
  activityLogsPageSize: QUERY_LIMITS.activityLogs,
  activityLogsHasMore: false,

  setUserProfile: (profile) => set({ userProfile: profile }),
  syncUserProfileFromSnapshot: (profile) => set({ userProfile: profile }),
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
    await updateUserDataWithLedgerService(updatedUser);
  },

  handleDeleteUser: async (targetUid) => {
    await deleteUserService(targetUid);
  },

  handleCompleteOnboarding: async () => {
    const { userProfile } = get();
    if (!userProfile) return;
    await updateUserProfileService(userProfile.uid, { hasCompletedOnboarding: true });
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
    if (!userProfile) return;
    const updated = buildToggleSkillTodayUpdate(userProfile, skillItemId, pinned);
    await get().handleUpdateProfile(updated);
  },

  handlePinSkillsToday: async (skillItemIds, skillItems) => {
    const { userProfile } = get();
    if (!userProfile || skillItemIds.length === 0) return;
    const addedTitles = getNewlyPinnedSkillTitles(userProfile, skillItemIds, skillItems);
    const updated = buildPinSkillsTodayUpdate(userProfile, skillItemIds);
    await get().handleUpdateProfile(updated);
    if (addedTitles.length === 0) return;
    notify(
      'success',
      t('scRadarTasksAddedTitle'),
      addedTitles.map((title) => `• ${title}`).join('\n')
    );
  },

  handleToggleTodayTaskComplete: async (taskId, done) => {
    const { userProfile } = get();
    if (!userProfile) return;
    const updated = buildToggleTodayCompleteUpdate(userProfile, taskId, done);
    await get().handleUpdateProfile(updated);
  },

  handleAddCustomTodayTask: async (text) => {
    const { userProfile } = get();
    if (!userProfile) return;
    const updated = buildAddCustomTodayTaskUpdate(userProfile, text);
    if (!updated) return;
    await get().handleUpdateProfile(updated);
  },

  handleRemoveTodayTask: async (task) => {
    const { userProfile } = get();
    if (!userProfile) return;
    const updated = buildRemoveTodayTaskUpdate(userProfile, task);
    await get().handleUpdateProfile(updated);
  },
}));
