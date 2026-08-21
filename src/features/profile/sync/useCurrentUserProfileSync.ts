import { useEffect } from 'react';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { toUserProfile } from '../../../infrastructure/firebase';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../profileStore';

/** Keeps the current user's profile and local review-dismissal state in the profile domain. */
export const useCurrentUserProfileSync = () => {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  useEffect(() => {
    if (!firebaseUser) {
      useProfileStore.getState().resetProfileState();
      return;
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    return onSnapshot(
      userRef,
      (userSnap) => {
        if (!userSnap.exists()) {
          useProfileStore.getState().resetProfileState();
          return;
        }

        const profile = toUserProfile(userSnap.data(), userSnap.id);
        if (!profile) {
          useProfileStore.getState().resetProfileState();
          return;
        }
        useProfileStore.getState().syncUserProfileFromSnapshot(profile);
        if (Array.isArray(profile.dismissedReviewIds)) {
          useProfileStore.getState().setDismissedReviewIds(profile.dismissedReviewIds);
          localStorage.setItem(
            `alpine_glide_dismissed_reviews_${firebaseUser.uid}`,
            JSON.stringify(profile.dismissedReviewIds)
          );
          return;
        }

        const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${firebaseUser.uid}`);
        useProfileStore.getState().setDismissedReviewIds(saved ? JSON.parse(saved) : []);
      },
      (error) => {
        logger.error('Current user profile sync error:', error);
        useProfileStore.getState().setProfileLoading(false);
      }
    );
  }, [firebaseUser]);
};
