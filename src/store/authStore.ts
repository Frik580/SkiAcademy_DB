import { create } from 'zustand';
import { User, signOut } from 'firebase/auth';
import {
  arrayUnion,
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from '../lib/firebase';
import { UserProfile, ActivityLog } from '../types';
import { logger } from '../lib/logger';
import { canManageAdminRoles } from '../lib/accessControl';
import { updateUserWithAdminBalanceLedger } from '../lib/walletCredit';
import {
  buildAddCustomTodayTaskUpdate,
  buildPinSkillsTodayUpdate,
  buildRemoveTodayTaskUpdate,
  buildToggleSkillTodayUpdate,
  buildToggleTodayCompleteUpdate,
  getNewlyPinnedSkillTitles,
  type TodayTaskRef,
} from '../lib/todayChecklist';
import { notify, t } from './storeContext';
import { useUiStore } from './uiStore';

interface AuthState {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  authLoading: boolean;
  usersList: UserProfile[];
  dismissedReviewIds: string[];
  activityLogs: ActivityLog[];

  setFirebaseUser: (user: User | null) => void;
  syncUserProfileFromSnapshot: (profile: UserProfile | null) => void;
  setAuthLoading: (loading: boolean) => void;
  setUsersList: (users: UserProfile[]) => void;
  setDismissedReviewIds: (ids: string[]) => void;
  setActivityLogs: (logs: ActivityLog[]) => void;

  handleSignOut: () => Promise<void>;
  handleUpdateProfile: (updatedData: Partial<UserProfile>) => Promise<void>;
  handleUpdateUserRole: (targetUid: string, newRole: 'admin' | 'user') => Promise<void>;
  handleAddUser: (newUser: UserProfile) => Promise<void>;
  handleUpdateUser: (updatedUser: UserProfile) => Promise<void>;
  handleDeleteUser: (targetUid: string) => Promise<void>;
  handleDismissReview: (bookingId: string) => Promise<void>;
  handleToggleSkillToday: (skillItemId: string, pinned: boolean) => Promise<void>;
  handlePinSkillsToday: (skillItemIds: string[]) => Promise<void>;
  handleToggleTodayTaskComplete: (taskId: string, done: boolean) => Promise<void>;
  handleAddCustomTodayTask: (text: string) => Promise<void>;
  handleRemoveTodayTask: (task: TodayTaskRef) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  userProfile: null,
  authLoading: true,
  usersList: [],
  dismissedReviewIds: [],
  activityLogs: [],

  setFirebaseUser: (user) => set({ firebaseUser: user }),
  syncUserProfileFromSnapshot: (profile) => set({ userProfile: profile }),
  setAuthLoading: (loading) => set({ authLoading: loading }),
  setUsersList: (users) => set({ usersList: users }),
  setDismissedReviewIds: (ids) => set({ dismissedReviewIds: ids }),
  setActivityLogs: (logs) => set({ activityLogs: logs }),

  handleSignOut: async () => {
    try {
      await signOut(auth);
      set({
        userProfile: null,
        firebaseUser: null,
      });
    } catch (err) {
      logger.error(err);
      throw err;
    }
  },

  handleUpdateProfile: async (updatedData) => {
    const { firebaseUser, userProfile } = get();
    if (!firebaseUser || !userProfile) return;
    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), updatedData);

      if (
        userProfile.instructorId &&
        Object.prototype.hasOwnProperty.call(updatedData, 'phoneNumber')
      ) {
        const phoneNumber = (updatedData.phoneNumber || '').trim();
        await updateDoc(doc(db, 'instructors', userProfile.instructorId), { phoneNumber });
      }
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
    await updateDoc(doc(db, 'users', targetUid), { role: newRole });
    notify('success', t('roleUpdated'), `${t('roleUpdatedDescPrefix')} ${newRole}.`);
  },

  handleAddUser: async (newUser) => {
    await setDoc(doc(db, 'users', newUser.uid), newUser);
  },

  handleUpdateUser: async (updatedUser) => {
    await updateUserWithAdminBalanceLedger(db, updatedUser);
  },

  handleDeleteUser: async (targetUid) => {
    await deleteDoc(doc(db, 'users', targetUid));
  },

  handleDismissReview: async (bookingId) => {
    const { firebaseUser, dismissedReviewIds } = get();
    const userId = firebaseUser?.uid;
    if (!userId) return;

    const updated = Array.from(new Set([...dismissedReviewIds, bookingId]));
    set({ dismissedReviewIds: updated });
    localStorage.setItem(`alpine_glide_dismissed_reviews_${userId}`, JSON.stringify(updated));

    try {
      await updateDoc(doc(db, 'users', userId), {
        dismissedReviewIds: arrayUnion(bookingId),
      });
    } catch (err) {
      logger.error('Failed to update dismissedReviewIds in Firestore:', err);
    }

    try {
      const notifQuery = query(collection(db, 'notifications'), where('userId', '==', userId));
      const snapshot = await getDocs(notifQuery);
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (
          data.bookingId === bookingId ||
          (data.messageEn && data.messageEn.includes(bookingId)) ||
          (data.messageRu && data.messageRu.includes(bookingId))
        ) {
          deleteDoc(doc(db, 'notifications', d.id)).catch((err) =>
            logger.error('Failed to delete review notification from DB:', err)
          );
        }
      });
    } catch (err) {
      logger.error('Error removing review notification from notifications collection:', err);
    }
  },

  handleToggleSkillToday: async (skillItemId, pinned) => {
    const { userProfile } = get();
    if (!userProfile) return;
    const updated = buildToggleSkillTodayUpdate(userProfile, skillItemId, pinned);
    await get().handleUpdateProfile(updated);
  },

  handlePinSkillsToday: async (skillItemIds) => {
    const { userProfile } = get();
    if (!userProfile || skillItemIds.length === 0) return;
    const skillConfig = useUiStore.getState().skillConfig;
    const addedTitles = getNewlyPinnedSkillTitles(userProfile, skillItemIds, skillConfig.items);
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
