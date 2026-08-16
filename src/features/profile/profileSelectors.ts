import { useProfileStore } from './profileStore';
import { UserProfile, ActivityLog } from '../../types';

export const selectUserProfile = (
  state: ReturnType<typeof useProfileStore.getState>
): UserProfile | null => state.userProfile;

export const selectUsersList = (
  state: ReturnType<typeof useProfileStore.getState>
): UserProfile[] => state.usersList;

export const selectDismissedReviewIds = (
  state: ReturnType<typeof useProfileStore.getState>
): string[] => state.dismissedReviewIds;

export const selectActivityLogs = (
  state: ReturnType<typeof useProfileStore.getState>
): ActivityLog[] => state.activityLogs;

export const selectIsAdmin = (state: ReturnType<typeof useProfileStore.getState>): boolean =>
  state.userProfile?.role === 'admin';

export const selectIsInstructor = (state: ReturnType<typeof useProfileStore.getState>): boolean =>
  Boolean(state.userProfile?.isInstructor || state.userProfile?.instructorId);
